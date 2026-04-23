import { Hono } from "hono";
import { count, siteCache } from "@serendip-bot/db";
import { db } from "../lib/db.js";

export const publicStatsRouter = new Hono();

publicStatsRouter.get("/", async (c) => {
  const [result] = await db.select({ value: count() }).from(siteCache);

  return c.json({
    indexedSiteCount: result?.value ?? 0,
  });
});
