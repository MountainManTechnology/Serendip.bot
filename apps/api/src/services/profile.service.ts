import {
  eq,
  sql,
  type Db,
  curiosityProfiles,
  siteCache,
} from "@serendip-bot/db";
import type { FeedbackSignal } from "@serendip-bot/types";

// Weight deltas applied to topic_weights per feedback signal
const SIGNAL_WEIGHTS: Record<FeedbackSignal, number> = {
  love: 0.15,
  skip: -0.05,
  block: -0.3,
};

const COUNT_COL: Record<FeedbackSignal, keyof typeof siteCache.$inferSelect> = {
  love: "loveCount",
  skip: "skipCount",
  block: "blockCount",
};

/** Map signal name to DB column expression for incrementing/decrementing. */
function countDelta(signal: FeedbackSignal, direction: 1 | -1) {
  const col =
    signal === "love"
      ? siteCache.loveCount
      : signal === "skip"
        ? siteCache.skipCount
        : siteCache.blockCount;
  return { [COUNT_COL[signal]]: sql`GREATEST(0, ${col} + ${direction})` };
}

/**
 * Upserts the curiosity profile for a session and adjusts topic weights
 * based on the categories of the site that was rated.
 *
 * @param previousSignal  The signal that was active before this call (null = none).
 *                        When provided, its weight delta is reversed before applying
 *                        the new signal's delta, supporting toggle / signal-change.
 */
export async function updateFromFeedback(
  db: Db,
  sessionId: string,
  siteCacheId: string,
  signal: FeedbackSignal | null,
  previousSignal: FeedbackSignal | null = null,
): Promise<void> {
  // Fetch the site's categories so we know which topics to boost/penalise
  const site = await db.query.siteCache.findFirst({
    where: eq(siteCache.id, siteCacheId),
    columns: { categories: true },
  });

  const categories: string[] = site?.categories ?? [];

  if (categories.length > 0) {
    const [existing] = await db
      .select({
        id: curiosityProfiles.id,
        topicWeights: curiosityProfiles.topicWeights,
      })
      .from(curiosityProfiles)
      .where(eq(curiosityProfiles.sessionId, sessionId))
      .limit(1);

    const currentWeights: Record<string, number> = existing?.topicWeights ?? {};
    const updatedWeights = { ...currentWeights };

    // Reverse the previous signal's weight
    if (previousSignal) {
      const reverseDelta = -(SIGNAL_WEIGHTS[previousSignal] ?? 0);
      for (const cat of categories) {
        const prev = updatedWeights[cat] ?? 0;
        updatedWeights[cat] = Math.max(-1, Math.min(1, prev + reverseDelta));
      }
    }

    // Apply the new signal's weight (skip if toggling off)
    if (signal) {
      const delta = SIGNAL_WEIGHTS[signal] ?? 0;
      for (const cat of categories) {
        const prev = updatedWeights[cat] ?? 0;
        updatedWeights[cat] = Math.max(-1, Math.min(1, prev + delta));
      }
    }

    if (existing) {
      await db
        .update(curiosityProfiles)
        .set({ topicWeights: updatedWeights, updatedAt: new Date() })
        .where(eq(curiosityProfiles.id, existing.id));
    } else if (signal) {
      await db
        .insert(curiosityProfiles)
        .values({ sessionId, topicWeights: updatedWeights });
    }
  }

  // Update denormalized counts on site_cache
  if (previousSignal) {
    await db
      .update(siteCache)
      .set(countDelta(previousSignal, -1))
      .where(eq(siteCache.id, siteCacheId));
  }
  if (signal) {
    await db
      .update(siteCache)
      .set(countDelta(signal, 1))
      .where(eq(siteCache.id, siteCacheId));
  }
}
