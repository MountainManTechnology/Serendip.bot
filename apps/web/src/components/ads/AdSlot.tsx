"use client";

import { AdSenseSlot } from "./AdSenseSlot";

interface AdSlotProps {
  /** AdSense ad unit slot ID */
  slot?: string;
  className?: string;
  /** Show "Advertisement" label above slot. Defaults to true. */
  label?: boolean;
}

/**
 * Generic ad slot wrapper.
 * Currently delegates to Google AdSense. Swap out AdSenseSlot for a custom
 * provider without touching any call sites.
 *
 * Returns null if:
 * - NEXT_PUBLIC_ADSENSE_CLIENT_ID is not set
 * - NEXT_PUBLIC_DISABLE_ADS=true
 * - An ad blocker is detected
 */
export function AdSlot({ slot, className, label = true }: AdSlotProps) {
  const clientId = process.env["NEXT_PUBLIC_ADSENSE_CLIENT_ID"];
  const disabled = process.env["NEXT_PUBLIC_DISABLE_ADS"] === "true";

  if (disabled || !clientId) return null;

  return (
    <div className="w-full">
      {label && (
        <p className="text-center text-xs text-gray-400 mb-2">Advertisement</p>
      )}
      <AdSenseSlot slot={slot} className={className} />
    </div>
  );
}
