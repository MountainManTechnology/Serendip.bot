"use client";

import { AdSenseSlot } from "./AdSenseSlot";

/**
 * Google AdSense in-article fluid ad unit.
 * Reads slot ID from NEXT_PUBLIC_ADSENSE_IN_ARTICLE_SLOT.
 * Returns null if ads are disabled, client ID or slot ID is missing, or an
 * ad blocker is detected.
 */
export function InArticleAdSlot() {
  const clientId = process.env["NEXT_PUBLIC_ADSENSE_CLIENT_ID"];
  const slot = process.env["NEXT_PUBLIC_ADSENSE_IN_ARTICLE_SLOT"];
  const disabled = process.env["NEXT_PUBLIC_DISABLE_ADS"] === "true";

  if (disabled || !clientId || !slot) return null;

  return (
    <div className="w-full" style={{ display: "block", textAlign: "center" }}>
      <p className="text-center text-xs text-gray-400 mb-2">Advertisement</p>
      <AdSenseSlot slot={slot} format="fluid" layout="in-article" />
    </div>
  );
}
