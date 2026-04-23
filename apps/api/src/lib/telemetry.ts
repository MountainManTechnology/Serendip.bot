/**
 * Telemetry middleware for the Hono API.
 *
 * Fire-and-forget: pushes a JSON event to Redis list `metrics:events` after
 * every request. Never blocks the response path. Never throws.
 *
 * Event shape: { type: 'page', ts, trace_id, session_id, user_id, source,
 *                worker_id, path, method, status, response_ms, referrer_host,
 *                country, device_class, app_version }
 *
 * The Celery drain_telemetry_queue task batch-RPOPs from `metrics:events` and
 * routes on `type` to the appropriate Postgres table.
 */
import type { Context, MiddlewareHandler } from "hono";
import { createHash } from "node:crypto";
import { Redis } from "ioredis";

// ─── Redis client (module-level singleton) ─────────────────────────────────
let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
      lazyConnect: false,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
    });
    _redis.on("error", () => {
      // Telemetry Redis errors are always swallowed
    });
  }
  return _redis;
}

// ─── Paths that are never telemetered ─────────────────────────────────────
const SKIP_PREFIXES = ["/health", "/admin/metrics", "/api/telemetry", "/_next"];

// ─── Device classification (hand-rolled, no external dep) ─────────────────
const BOT_RE =
  /bot|crawler|spider|scraper|facebookexternalhit|linkedinbot|twitterbot/i;
const MOBILE_RE = /mobile|android|iphone|ipad|ipod|blackberry|windows phone/i;
const TABLET_RE = /ipad|android(?!.*mobile)|tablet/i;

function classifyDevice(ua: string): "bot" | "mobile" | "tablet" | "desktop" {
  if (BOT_RE.test(ua)) return "bot";
  if (TABLET_RE.test(ua)) return "tablet";
  if (MOBILE_RE.test(ua)) return "mobile";
  return "desktop";
}

// ─── Daily-rotating session hash ──────────────────────────────────────────
// Salt is stored in Redis at `telemetry:salt:YYYY-MM-DD` with 48h TTL.
// If Redis is unavailable we fall back to a process-lifetime salt.
const _memSalt: Map<string, string> = new Map();

async function getDailySalt(redis: Redis): Promise<string> {
  const dateKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const redisKey = `telemetry:salt:${dateKey}`;
  const cached = _memSalt.get(dateKey);
  if (cached) return cached;
  try {
    let salt = await redis.get(redisKey);
    if (!salt) {
      salt = crypto.randomUUID();
      await redis.set(redisKey, salt, "EX", 172800); // 48h
    }
    _memSalt.clear(); // only keep today
    _memSalt.set(dateKey, salt);
    return salt;
  } catch {
    // Fallback: use a process-lifetime salt — less accurate but never throws
    const fallback = `fallback-${dateKey}`;
    _memSalt.set(dateKey, fallback);
    return fallback;
  }
}

function hashSession(ip: string, ua: string, salt: string): string {
  return createHash("sha256")
    .update(`${ip}:${ua}:${salt}`)
    .digest("hex")
    .slice(0, 16);
}

// ─── Middleware ────────────────────────────────────────────────────────────
const WORKER_ID = process.env["HOSTNAME"] ?? "api";
const APP_VERSION = process.env["VERSION"] ?? "dev";

export const telemetryMiddleware: MiddlewareHandler = async (c, next) => {
  const traceId = crypto.randomUUID();
  // Store trace_id so tRPC routers can propagate it to Celery task kwargs
  c.set("traceId" as never, traceId);

  const start = Date.now();
  await next();
  const responseMs = Date.now() - start;

  const path = new URL(c.req.url).pathname;
  if (SKIP_PREFIXES.some((p) => path.startsWith(p))) return;

  // Fire-and-forget: queue the push without awaiting it
  queueMicrotask(() => {
    void pushEvent(c, traceId, path, responseMs);
  });
};

async function pushEvent(
  c: Context,
  traceId: string,
  path: string,
  responseMs: number,
): Promise<void> {
  try {
    const redis = getRedis();
    const salt = await getDailySalt(redis);

    const ip =
      c.req.header("x-azure-clientip") ??
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      "0.0.0.0";
    const ua = c.req.header("user-agent") ?? "";
    const sessionId = hashSession(ip, ua, salt);

    // user_id: read from Hono context variable set by tRPC auth middleware
    const userId = (c.get("userId" as never) as string | undefined) ?? null;

    const referrer = c.req.header("referer") ?? c.req.header("referrer") ?? "";
    let referrerHost: string | null = null;
    try {
      referrerHost = referrer ? new URL(referrer).hostname : null;
    } catch {
      referrerHost = null;
    }

    const event = {
      type: "page",
      ts: new Date().toISOString(),
      trace_id: traceId,
      session_id: sessionId,
      user_id: userId,
      source: "api",
      worker_id: WORKER_ID,
      path,
      method: c.req.method,
      status: c.res.status,
      response_ms: responseMs,
      referrer_host: referrerHost,
      country: c.req.header("x-azure-clientcountry") ?? null,
      device_class: classifyDevice(ua),
      app_version: APP_VERSION,
    };

    await redis
      .multi()
      .lpush("metrics:events", JSON.stringify(event))
      .ltrim("metrics:events", 0, 99999)
      .exec();
  } catch {
    // Telemetry failures are always swallowed — never affect the response
  }
}
