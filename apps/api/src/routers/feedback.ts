import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { db } from "../lib/db.js";
import { eq, and, feedback } from "@serendip-bot/db";
import { updateFromFeedback } from "../services/profile.service.js";
import type { FeedbackSignal } from "@serendip-bot/types";

const FeedbackSignalSchema = z.enum(["love", "skip", "block"]);

export const feedbackRouter = router({
  /**
   * Submit or toggle a feedback signal for a site.
   *
   * - No existing row → insert, increment count  → returns { signal }
   * - Same signal     → delete,  decrement count → returns { signal: null }
   * - Different signal→ update,  swap counts     → returns { signal }
   */
  submit: publicProcedure
    .input(
      z.object({
        siteCacheId: z.string().uuid(),
        signal: FeedbackSignalSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.sessionId) {
        throw new Error("Session required for feedback");
      }

      const { siteCacheId, signal } = input;
      const sessionId = ctx.sessionId;

      // Look up existing feedback row for this (session, site) pair
      const [existing] = await db
        .select({ id: feedback.id, signal: feedback.signal })
        .from(feedback)
        .where(
          and(
            eq(feedback.sessionId, sessionId),
            eq(feedback.siteCacheId, siteCacheId),
          ),
        )
        .limit(1);

      const previousSignal = (existing?.signal ??
        null) as FeedbackSignal | null;

      if (existing && previousSignal === signal) {
        // Toggle off: remove the signal
        await db.delete(feedback).where(eq(feedback.id, existing.id));
        await updateFromFeedback(
          db,
          sessionId,
          siteCacheId,
          null,
          previousSignal,
        );
        return { ok: true, sessionId, siteCacheId, signal: null };
      }

      if (existing) {
        // Switch signal: update existing row
        await db
          .update(feedback)
          .set({ signal, createdAt: new Date() })
          .where(eq(feedback.id, existing.id));
      } else {
        // New signal: insert row
        await db.insert(feedback).values({ sessionId, siteCacheId, signal });
      }

      await updateFromFeedback(
        db,
        sessionId,
        siteCacheId,
        signal,
        previousSignal,
      );
      return { ok: true, sessionId, siteCacheId, signal };
    }),

  /**
   * Returns all feedback signals for the current session.
   * Used by the feed to restore active button states after page load.
   */
  getForSession: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.sessionId) return [];

    const rows = await db
      .select({ siteCacheId: feedback.siteCacheId, signal: feedback.signal })
      .from(feedback)
      .where(eq(feedback.sessionId, ctx.sessionId));

    return rows as Array<{ siteCacheId: string; signal: FeedbackSignal }>;
  }),
});
