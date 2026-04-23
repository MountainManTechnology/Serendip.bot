import type { Context, Next } from "hono";
import { timingSafeEqual as cryptoTimingSafeEqual } from "crypto";
import { logger } from "./logger.js";

/**
 * Hono middleware that validates a Bearer token against ARTICLE_PUBLISH_API_KEY.
 * Used to protect the article publish endpoint.
 */
export async function requirePublishKey(c: Context, next: Next) {
  const apiKey = process.env["ARTICLE_PUBLISH_API_KEY"];
  if (!apiKey) {
    logger.error(
      "ARTICLE_PUBLISH_API_KEY is not configured — rejecting publish request",
    );
    return c.json({ error: "Publishing is not configured" }, 503);
  }

  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(7);

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(token, apiKey)) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  await next();
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return cryptoTimingSafeEqual(bufA, bufB);
}
