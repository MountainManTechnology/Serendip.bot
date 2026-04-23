import { Hono } from "hono";
import { cors } from "hono/cors";
import { trpcServer } from "@hono/trpc-server";
import { serve } from "@hono/node-server";
import { join } from "path";
import { fileURLToPath } from "url";
import { appRouter } from "./routers/index.js";
import { articlesRouter } from "./routers/articles.js";
import { publicStatsRouter } from "./routers/public-stats.js";
import { createContext } from "./trpc.js";
import { logger } from "./lib/logger.js";
import { telemetryMiddleware } from "./lib/telemetry.js";
import { runMigrations, bootstrapExtensions } from "@serendip-bot/db";

const app = new Hono();

// ─── CORS ──────────────────────────────────────────────────────────────────
const allowedOrigins = (
  process.env["CORS_ORIGINS"] ?? "http://localhost:3000"
).split(",");
app.use(
  "*",
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : undefined),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "x-request-id", "Authorization"],
    exposeHeaders: ["x-request-id"],
    credentials: true,
    maxAge: 600,
  }),
);

// ─── Telemetry (fire-and-forget) ───────────────────────────────────────────
app.use("*", telemetryMiddleware);

// ─── Request correlation ID + structured logging ───────────────────────────
app.use("*", async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
  c.res.headers.set("x-request-id", requestId);

  const start = Date.now();
  await next();
  const ms = Date.now() - start;

  logger.info(
    {
      requestId,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      durationMs: ms,
    },
    "request",
  );
});

// ─── Global error handler ──────────────────────────────────────────────────
app.onError((err, c) => {
  const requestId = c.res.headers.get("x-request-id") ?? "unknown";
  logger.error(
    { requestId, err, path: new URL(c.req.url).pathname },
    "unhandled error",
  );
  return c.json({ error: "Internal server error", requestId }, 500);
});

// ─── Health check ──────────────────────────────────────────────────────────
app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() }),
);

// ─── Articles API ──────────────────────────────────────────────────────────
app.route("/api/articles", articlesRouter);
app.route("/api/public/stats", publicStatsRouter);

// ─── tRPC ──────────────────────────────────────────────────────────────────
app.use(
  "/trpc/*",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trpcServer({ router: appRouter, createContext: createContext as any }),
);

const port = Number(process.env["PORT"] ?? 4000);
logger.info({ port }, "API server starting");

// ─── Run DB migrations before accepting traffic ────────────────────────────
const dbUrl = process.env["DATABASE_URL"];
if (dbUrl) {
  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  const migrationsFolder = join(__dirname, "..", "migrations");

  // Extensions must exist before the first migration runs (uuid_generate_v4, vector columns).
  // Run them as raw SQL so they are available even on a completely empty database.
  try {
    await bootstrapExtensions(dbUrl);
    logger.info("database extensions ready");
  } catch (err) {
    logger.error(
      { err },
      "failed to bootstrap database extensions — aborting startup",
    );
    process.exit(1);
  }

  logger.info({ migrationsFolder }, "running database migrations");
  try {
    await runMigrations(dbUrl, migrationsFolder);
    logger.info("database migrations complete");
  } catch (err) {
    logger.error({ err }, "database migration failed — aborting startup");
    process.exit(1);
  }
} else {
  logger.warn("DATABASE_URL not set — skipping migrations");
}

serve({ fetch: app.fetch, port }, () => {
  logger.info({ port }, "API server listening");
});
