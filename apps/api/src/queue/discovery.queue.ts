import { Queue, QueueEvents } from "bullmq";
import { redis } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import type { Mood } from "@serendip-bot/types";

export interface DiscoveryJobPayload {
  sessionId: string;
  mood?: Mood | undefined;
  topics?: string[] | undefined;
}

export interface DiscoveryJobResult {
  jobId: string;
  status: "pending" | "processing" | "complete" | "failed";
  sites: unknown[];
  completedAt?: string;
  error?: string;
}

const RESULT_TTL_SECONDS = 600; // 10 minutes

export const discoveryQueue = new Queue<DiscoveryJobPayload>("discovery", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: { count: 200, age: 7 * 24 * 3600 }, // Keep failed jobs 7 days as DLQ
  },
});

// Dead-letter queue — receives jobs that exceeded all retry attempts
export const deadLetterQueue = new Queue<DiscoveryJobPayload>(
  "discovery-dead",
  {
    connection: redis,
    defaultJobOptions: {
      removeOnFail: { count: 1000, age: 30 * 24 * 3600 }, // Keep 30 days for inspection
    },
  },
);

// Wire up the failed event handler to route exhausted jobs to the DLQ
const queueEvents = new QueueEvents("discovery", { connection: redis });
queueEvents.on("failed", async ({ jobId, failedReason }) => {
  const job = await discoveryQueue.getJob(jobId);
  if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
    logger.warn(
      { jobId, failedReason },
      "Moving exhausted job to dead-letter queue",
    );
    await deadLetterQueue.add("dead", job.data, { jobId: `dlq:${jobId}` });
    await redis.setex(
      `discovery:job:${jobId}`,
      RESULT_TTL_SECONDS,
      JSON.stringify({
        jobId,
        status: "failed",
        sites: [],
        error: failedReason,
      }),
    );
  }
});

export async function enqueueDiscovery(
  payload: DiscoveryJobPayload,
): Promise<string> {
  const job = await discoveryQueue.add("discover", payload);
  const jobId = job.id ?? crypto.randomUUID();

  await redis.setex(
    `discovery:job:${jobId}`,
    RESULT_TTL_SECONDS,
    JSON.stringify({ jobId, status: "pending", sites: [] }),
  );

  logger.info(
    { jobId, sessionId: payload.sessionId },
    "Discovery job enqueued",
  );
  return jobId;
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

export function normalizeResult(
  result: DiscoveryJobResult,
): DiscoveryJobResult {
  return {
    ...result,
    sites: (result.sites ?? []).map(normalizeSite),
  };
}

export async function getDiscoveryResult(
  jobId: string,
): Promise<DiscoveryJobResult> {
  const cached = await redis.get(`discovery:job:${jobId}`);
  if (cached) {
    return normalizeResult(JSON.parse(cached) as DiscoveryJobResult);
  }
  return { jobId, status: "pending", sites: [] };
}
