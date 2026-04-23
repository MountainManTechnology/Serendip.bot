"use client";

import { AdSenseSlot } from "./AdSenseSlot";

/**
 * Google AdSense responsive display ad unit (DisplayUnity01).
 * Reads slot ID from NEXT_PUBLIC_ADSENSE_DISPLAY_SLOT.
 * Returns null if ads are disabled, client ID or slot ID is missing, or an
 * ad blocker is detected.
 */
export function DisplayAdSlot() {
  const clientId = process.env["NEXT_PUBLIC_ADSENSE_CLIENT_ID"];
  const slot = process.env["NEXT_PUBLIC_ADSENSE_DISPLAY_SLOT"];
  const disabled = process.env["NEXT_PUBLIC_DISABLE_ADS"] === "true";

  if (disabled || !clientId || !slot) return null;

  return (
    <div className="w-full">
      <p className="text-center text-xs text-gray-400 mb-2">Advertisement</p>
      <AdSenseSlot slot={slot} format="auto" />
    </div>
  );
}
