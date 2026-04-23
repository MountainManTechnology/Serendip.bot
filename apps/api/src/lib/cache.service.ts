import { redis } from "./redis.js";
import { logger } from "./logger.js";

/**
 * Redis caching service for distributed result caching.
 * Handles serialization, TTL management, and cache invalidation.
 * Follows ADR-001 naming conventions.
 */

// TTLs — overridable via environment variables
const TTL = {
  siteEval: Number(process.env["CACHE_TTL_SITE_EVAL"] ?? 7 * 24 * 3600), // 7 days
  siteEmbed: Number(process.env["CACHE_TTL_SITE_EMBED"] ?? 30 * 24 * 3600), // 30 days
  userProfile: Number(process.env["CACHE_TTL_USER_PROFILE"] ?? 3600), // 1 hour
  session: Number(process.env["CACHE_TTL_SESSION"] ?? 24 * 3600), // 24 hours
  anonRate: Number(process.env["CACHE_TTL_ANON_RATE"] ?? 3600), // 1 hour
  discoveryJob: Number(process.env["CACHE_TTL_DISCOVERY_JOB"] ?? 600), // 10 minutes
} as const;

/**
 * Cache key builders — ADR-001 naming convention.
 */
export const cacheKeys = {
  /** LLM evaluation result for a URL: `site:eval:{url_hash}` */
  siteEval: (urlHash: string) => `site:eval:${urlHash}`,
  /** Embedding vector for a URL: `site:embed:{url_hash}` */
  siteEmbed: (urlHash: string) => `site:embed:${urlHash}`,
  /** Curiosity profile snapshot: `user:profile:{sessionId}` */
  userProfile: (sessionId: string) => `user:profile:${sessionId}`,
  /** Auth session data: `session:{sessionId}` */
  session: (sessionId: string) => `session:${sessionId}`,
  /** Rate limiting counter: `anon:rate:{sessionId}` */
  anonRate: (sessionId: string) => `anon:rate:${sessionId}`,
  /** In-flight discovery job status: `discovery:job:{jobId}` */
  discoveryJob: (jobId: string) => `discovery:job:${jobId}`,
};

export { TTL as cacheTTL };

/**
 * Get a cached value by key. Returns null on cache miss or Redis error.
 * Cache miss is logged at debug level; errors at warn.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const cached = await redis.get(key);
    if (!cached) {
      logger.debug({ key }, "cache miss");
      return null;
    }
    logger.debug({ key }, "cache hit");
    return JSON.parse(cached) as T;
  } catch (err) {
    logger.warn({ key, err }, "Cache get error — bypassing cache");
    return null;
  }
}

/**
 * Set a cached value with TTL. Silently bypasses cache if Redis is down.
 */
export async function setCached<T>(
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
    logger.debug({ key, ttlSeconds }, "cache set");
  } catch (err) {
    logger.warn({ key, err }, "Cache set error — bypassing cache");
  }
}

/**
 * Delete a cached key.
 */
export async function delCached(key: string): Promise<void> {
  try {
    await redis.del(key);
    logger.debug({ key }, "cache invalidated");
  } catch (err) {
    logger.warn({ key, err }, "Cache delete error");
  }
}
