"use client";

import { AdSenseSlot } from "./AdSenseSlot";

interface NativeAdCardProps {
  slot?: string;
}

/**
 * An ad unit styled as a discovery card so it sits naturally inside the grid.
 * Uses AdSense responsive format constrained to card dimensions.
 * Returns null if ads are disabled or no client ID is set.
 */
export function NativeAdCard({ slot = "0000000000" }: NativeAdCardProps) {
  const clientId = process.env["NEXT_PUBLIC_ADSENSE_CLIENT_ID"];
  const disabled = process.env["NEXT_PUBLIC_DISABLE_ADS"] === "true";

  if (disabled || !clientId) return null;

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col min-h-[280px]"
      style={{ boxShadow: "0 2px 8px rgba(15,13,26,0.06)" }}
    >
      {/* Sponsored label — replaces category pills */}
      <div className="px-5 pt-4 pb-1">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 text-xs font-medium">
          <svg
            viewBox="0 0 24 24"
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
          </svg>
          Sponsored
        </span>
      </div>

      {/* Ad content area */}
      <div className="flex-1 px-2 pb-4">
        <AdSenseSlot slot={slot} className="h-full min-h-[200px]" />
      </div>
    </div>
  );
}
