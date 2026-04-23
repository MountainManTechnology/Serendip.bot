import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import {
  getCached,
  setCached,
  cacheKeys,
  cacheTTL,
} from "../lib/cache.service.js";
import { redis } from "../lib/redis.js";
import { db } from "../lib/db.js";
import { sessions } from "@serendip-bot/db";
import { TRPCError } from "@trpc/server";
import { logger } from "../lib/logger.js";

const AGENT_URL = process.env["AGENT_URL"] ?? "http://agent-api:8001";
const INTERNAL_TOKEN = process.env["INTERNAL_API_TOKEN"] ?? "";

if (!INTERNAL_TOKEN) {
  logger.warn("INTERNAL_API_TOKEN is not set — agent API calls will fail");
}

export interface DiscoveryJobResult {
  jobId: string;
  status: "pending" | "processing" | "complete" | "failed";
  sites: unknown[];
  completedAt?: string;
  error?: string;
}

/** Convert a single snake_case site object from the Python agent into camelCase. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeSite(raw: any): Record<string, unknown> {
  return {
    id: raw.id,
    url: raw.url,
    urlHash: raw.url_hash ?? raw.urlHash,
    title: raw.title,
    description: raw.description,
    contentSummary: raw.content_summary ?? raw.contentSummary,
    contentHtml: raw.content_html ?? raw.contentHtml,
    extractedImages: (raw.extracted_images ?? raw.extractedImages ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (img: any) => ({
        url: img.url,
        altText: img.alt_text ?? img.altText ?? "",
      }),
    ),
    qualityScore: raw.quality_score ?? raw.qualityScore,
    categories: raw.categories ?? [],
    whyBlurb: raw.why_blurb ?? raw.whyBlurb,
    position: raw.position,
  };
}

function normalizeResult(result: DiscoveryJobResult): DiscoveryJobResult {
  return {
    ...result,
    sites: (result.sites ?? []).map(normalizeSite),
  };
}

const MoodSchema = z.enum([
  "learn",
  "create",
  "laugh",
  "wonder",
  "chill",
  "explore",
  "relax",
  "inspire",
  "challenge",
]);

export const discoveryRouter = router({
  request: publicProcedure
    .input(
      z.object({
        mood: MoodSchema.optional(),
        topics: z.array(z.string().max(50)).max(5).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const sessionId = ctx.sessionId ?? crypto.randomUUID();
      // Ensure a sessions row exists (upsert — no-op if already present)
      await db.insert(sessions).values({ id: sessionId }).onConflictDoNothing();

      // Enqueue via the Celery agent API
      const res = await fetch(`${AGENT_URL}/internal/discover`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-token": INTERNAL_TOKEN,
        },
        body: JSON.stringify({
          session_id: sessionId,
          mood: input.mood ?? "wonder",
          topics: input.topics ?? [],
        }),
        signal: AbortSignal.timeout(5_000),
      });

      if (!res.ok) {
        logger.error(
          { status: res.status, url: `${AGENT_URL}/internal/discover` },
          "Agent API error",
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `agent api ${res.status}`,
        });
      }

      const { job_id: jobId } = (await res.json()) as { job_id: string };

      // Write initial pending status so poll has something to read immediately
      await redis.setex(
        `discovery:job:${jobId}`,
        600,
        JSON.stringify({ jobId, status: "pending", sites: [] }),
      );

      return { jobId, sessionId };
    }),

  poll: publicProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(async ({ input }): Promise<DiscoveryJobResult> => {
      // Cache-aside: check cache first, fall through to Redis on miss
      const key = cacheKeys.discoveryJob(input.jobId);
      const cached = await getCached<DiscoveryJobResult>(key);
      if (cached) return normalizeResult(cached);

      // Read status from Redis (written by the Celery task)
      const raw = await redis.get(`discovery:job:${input.jobId}`);
      if (!raw) {
        return { jobId: input.jobId, status: "pending", sites: [] };
      }

      const result = normalizeResult(JSON.parse(raw) as DiscoveryJobResult);

      // Only cache terminal states to avoid stale in-progress entries
      if (result.status === "complete" || result.status === "failed") {
        await setCached(key, result, cacheTTL.discoveryJob);
      }

      return result;
    }),
});
