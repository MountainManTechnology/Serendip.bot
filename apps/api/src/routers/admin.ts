import { TRPCError } from "@trpc/server";
import { count, desc, gt, sessions, siteCache, sql } from "@serendip-bot/db";
import { router, publicProcedure } from "../trpc.js";
import { db } from "../lib/db.js";
import { isValidAdminSessionToken } from "../lib/admin-session.js";

/**
 * Middleware that validates the signed admin_session cookie.
 */
const adminProcedure = publicProcedure.use(({ ctx, next }) => {
  const secret = process.env.ADMIN_SECRET_KEY;
  if (!secret) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Admin not configured",
    });
  }
  if (!isValidAdminSessionToken(ctx.adminSession, secret)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid admin key" });
  }
  return next({ ctx });
});

export const adminRouter = router({
  /**
   * Returns aggregate statistics for the admin dashboard.
   */
  getStats: adminProcedure.query(async () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalSessionsResult,
      activeSessionsResult,
      feedbackBySignalResult,
      totalSitesResult,
      topLovedResult,
      topSkippedResult,
      topBlockedResult,
      sitesPerMoodResult,
      discoverySessionsPerMoodResult,
      avgQualityResult,
      contentTypeDistributionResult,
      pendingAttemptsResult,
      ingestionSuccessCountResult,
      ingestionAvgDurationResult,
      ingestionFailureCountResult,
      ingestionRetriesStatsResult,
    ] = await Promise.all([
      // Total sessions ever
      db.select({ value: count() }).from(sessions),

      // Sessions active in the last 24h
      db
        .select({ value: count() })
        .from(sessions)
        .where(gt(sessions.lastActiveAt, oneDayAgo)),

      // Feedback counts grouped by signal
      (async () => {
        try {
          const result = await db.execute(
            sql`SELECT signal, COUNT(*) as value
                FROM feedback
                GROUP BY signal
                ORDER BY value DESC`,
          );
          return result.rows as Array<Record<string, any>>;
        } catch {
          return [];
        }
      })(),

      // Total indexed sites
      db.select({ value: count() }).from(siteCache),

      // Top 10 loved
      db
        .select({
          id: siteCache.id,
          url: siteCache.url,
          title: siteCache.title,
          loveCount: siteCache.loveCount,
          skipCount: siteCache.skipCount,
          blockCount: siteCache.blockCount,
        })
        .from(siteCache)
        .orderBy(desc(siteCache.loveCount))
        .limit(10),

      // Top 10 skipped
      db
        .select({
          id: siteCache.id,
          url: siteCache.url,
          title: siteCache.title,
          loveCount: siteCache.loveCount,
          skipCount: siteCache.skipCount,
          blockCount: siteCache.blockCount,
        })
        .from(siteCache)
        .orderBy(desc(siteCache.skipCount))
        .limit(10),

      // Top 10 blocked
      db
        .select({
          id: siteCache.id,
          url: siteCache.url,
          title: siteCache.title,
          loveCount: siteCache.loveCount,
          skipCount: siteCache.skipCount,
          blockCount: siteCache.blockCount,
        })
        .from(siteCache)
        .orderBy(desc(siteCache.blockCount))
        .limit(10),

      // Sites indexed per mood — prefer mood_affinities if backfilled, otherwise
      // fall back to category → mood mapping from site_cache.categories.
      (async () => {
        try {
          // First try mood_affinities (populated by backfill_mood_affinities Celery task)
          const affinityCheck = await db.execute(
            sql`SELECT COUNT(*) as count FROM site_cache WHERE mood_affinities != '{}'::jsonb`,
          );
          const hasAffinities =
            Number((affinityCheck.rows[0] as Record<string, any>)?.count ?? 0) >
            0;

          if (hasAffinities) {
            const result = await db.execute(
              sql`SELECT mood, COUNT(*) as count
                  FROM (
                    SELECT jsonb_object_keys(mood_affinities) as mood
                    FROM site_cache
                    WHERE mood_affinities != '{}'::jsonb
                  ) t
                  GROUP BY mood
                  ORDER BY count DESC`,
            );
            return result.rows as Array<Record<string, any>>;
          }

          // Fallback: map categories to moods
          const result = await db.execute(
            sql`WITH category_mood AS (
                  SELECT unnest(ARRAY['science','nature','math','psychology','education']) AS cat, 'learn'     AS mood UNION ALL
                  SELECT unnest(ARRAY['art','design','music','film','literature']),               'create'    UNION ALL
                  SELECT unnest(ARRAY['humor','gaming']),                                         'laugh'     UNION ALL
                  SELECT unnest(ARRAY['philosophy','history','culture']),                         'wonder'    UNION ALL
                  SELECT unnest(ARRAY['health','food','travel']),                                 'chill'     UNION ALL
                  SELECT unnest(ARRAY['tech','business']),                                        'explore'   UNION ALL
                  SELECT unnest(ARRAY['psychology','wellness','lifestyle']),                      'relax'     UNION ALL
                  SELECT unnest(ARRAY['design','art','literature','music','film']),              'inspire'   UNION ALL
                  SELECT unnest(ARRAY['science','math','tech','business','psychology']),         'challenge'
                )
                SELECT cm.mood, COUNT(DISTINCT sc.id) as count
                FROM site_cache sc
                CROSS JOIN LATERAL jsonb_array_elements_text(sc.categories) AS cat_val
                JOIN category_mood cm ON cm.cat = cat_val
                GROUP BY cm.mood
                ORDER BY count DESC`,
          );
          return result.rows as Array<Record<string, any>>;
        } catch {
          return [];
        }
      })(),

      // Discovery sessions per mood (may be empty if pipeline writes to a different DB)
      (async () => {
        try {
          const result = await db.execute(
            sql`SELECT COALESCE(mood, 'unspecified') as mood, COUNT(*) as count
                FROM discovery_sessions
                WHERE status = 'complete'
                GROUP BY mood
                ORDER BY count DESC`,
          );
          return result.rows as Array<Record<string, any>>;
        } catch {
          return [];
        }
      })(),

      // Average quality score of indexed sites
      (async () => {
        try {
          const result = await db.execute(
            sql`SELECT ROUND(AVG(quality_score)::numeric, 2) as avg_quality, COUNT(*) as total_with_score
                FROM site_cache
                WHERE quality_score IS NOT NULL`,
          );
          return result.rows as Array<Record<string, any>>;
        } catch {
          return [];
        }
      })(),

      // Content type distribution
      (async () => {
        try {
          const result = await db.execute(
            sql`SELECT content_type, COUNT(*) as count
                FROM site_cache
                GROUP BY content_type
                ORDER BY count DESC`,
          );
          return result.rows as Array<Record<string, any>>;
        } catch {
          return [];
        }
      })(),
      // Pending ingest attempts
      (async () => {
        try {
          const result = await db.execute(
            sql`SELECT COUNT(*) as count FROM ingest_attempts WHERE status = 'pending'`,
          );
          return result.rows as Array<Record<string, any>>;
        } catch {
          return [];
        }
      })(),

      // Ingest batches: successes in the last hour
      (async () => {
        try {
          const result = await db.execute(
            sql`SELECT COUNT(*) as count
                FROM metrics.agent_task_events
                WHERE task_name = 'agent.tasks.ingest_batch' AND status = 'success' AND ts > NOW() - interval '1 hour'`,
          );
          return result.rows as Array<Record<string, any>>;
        } catch {
          return [];
        }
      })(),

      // Average ingest_batch duration (last hour) — return both ms and seconds
      (async () => {
        try {
          const result = await db.execute(
            sql`SELECT ROUND(AVG(duration_ms)::numeric / 1000.0, 2) as avg_sec,
                        ROUND(AVG(duration_ms)::numeric, 1) as avg_ms
                FROM metrics.agent_task_events
                WHERE task_name = 'agent.tasks.ingest_batch' AND status = 'success' AND duration_ms IS NOT NULL AND ts > NOW() - interval '1 hour'`,
          );
          return result.rows as Array<Record<string, any>>;
        } catch {
          return [];
        }
      })(),

      // Ingest batches: failures in the last hour
      (async () => {
        try {
          const result = await db.execute(
            sql`SELECT COUNT(*) as count
                FROM metrics.agent_task_events
                WHERE task_name = 'agent.tasks.ingest_batch' AND status != 'success' AND ts > NOW() - interval '1 hour'`,
          );
          return result.rows as Array<Record<string, any>>;
        } catch {
          return [];
        }
      })(),

      // Retries summary last hour
      (async () => {
        try {
          const result = await db.execute(
            sql`SELECT COALESCE(SUM(retries), 0) as total_retries, ROUND(AVG(retries)::numeric, 2) as avg_retries
                FROM metrics.agent_task_events
                WHERE task_name = 'agent.tasks.ingest_batch' AND ts > NOW() - interval '1 hour'`,
          );
          return result.rows as Array<Record<string, any>>;
        } catch {
          return [];
        }
      })(),
    ]);

    const feedbackTotals = { love: 0, skip: 0, block: 0 };
    for (const row of feedbackBySignalResult) {
      if (row.signal === "love") feedbackTotals.love = Number(row.value);
      else if (row.signal === "skip") feedbackTotals.skip = Number(row.value);
      else if (row.signal === "block") feedbackTotals.block = Number(row.value);
    }
    const totalFeedback =
      feedbackTotals.love + feedbackTotals.skip + feedbackTotals.block;

    // Process mood-based results
    const sitesPerMood: Record<string, number> = {};
    const sessionsPerMood: Record<string, number> = {};

    for (const row of sitesPerMoodResult) {
      sitesPerMood[row.mood as string] = Number(row.count);
    }

    for (const row of discoverySessionsPerMoodResult) {
      sessionsPerMood[row.mood as string] = Number(row.count);
    }

    const avgQualityScore =
      avgQualityResult.length > 0
        ? Number(avgQualityResult[0]?.avg_quality ?? 0)
        : 0;

    const contentTypes: Record<string, number> = {};
    for (const row of contentTypeDistributionResult) {
      contentTypes[row.content_type as string] = Number(row.count);
    }
    // Redis: current ingest eval concurrency (set by agent workers; best-effort)
    let evalConcurrency: number | null = null;
    try {
      const ioredisModule = await import("ioredis");
      const RedisCtor: any =
        (ioredisModule as any).default ?? (ioredisModule as any);
      const r = new RedisCtor(
        process.env["REDIS_URL"] ?? "redis://localhost:6379",
      );
      try {
        const val = await r.get("metrics:ingest:eval_concurrency");
        if (val) evalConcurrency = Number(val);
      } finally {
        await r.quit();
      }
    } catch {
      evalConcurrency = null;
    }

    return {
      sessions: {
        total: Number(totalSessionsResult[0]?.value ?? 0),
        activeLast24h: Number(activeSessionsResult[0]?.value ?? 0),
      },
      sites: {
        total: Number(totalSitesResult[0]?.value ?? 0),
        avgQualityScore,
        perMood: sitesPerMood,
        contentTypes,
      },
      discovery: {
        sessionsPerMood,
      },
      ingestion: {
        pending: Number(pendingAttemptsResult[0]?.count ?? 0),
        lastHour: {
          successCount: Number(ingestionSuccessCountResult[0]?.count ?? 0),
          // seconds (preferred) and ms (kept for compatibility)
          avgDurationSec: Number(ingestionAvgDurationResult[0]?.avg_sec ?? 0),
          avgDurationMs: Number(ingestionAvgDurationResult[0]?.avg_ms ?? 0),
          failureCount: Number(ingestionFailureCountResult[0]?.count ?? 0),
          totalRetries: Number(
            ingestionRetriesStatsResult[0]?.total_retries ?? 0,
          ),
          avgRetries: Number(ingestionRetriesStatsResult[0]?.avg_retries ?? 0),
        },
        evalConcurrency: evalConcurrency,
      },
      feedback: {
        total: totalFeedback,
        love: feedbackTotals.love,
        skip: feedbackTotals.skip,
        block: feedbackTotals.block,
      },
      topLoved: topLovedResult,
      topSkipped: topSkippedResult,
      topBlocked: topBlockedResult,
    };
  }),
});
