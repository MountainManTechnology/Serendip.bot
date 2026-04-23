"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

interface AdSenseSlotProps {
  slot?: string | undefined;
  className?: string | undefined;
  /** Ad format. Defaults to 'auto' (responsive). Use 'fluid' for in-article ads. */
  format?: "auto" | "fluid";
  /** Ad layout. Only used when format='fluid'. E.g. 'in-article'. */
  layout?: string;
}

/**
 * Google AdSense ad unit.
 * - Loads AdSense script lazily via next/script (no impact on initial load)
 * - Detects ad blockers and hides the slot gracefully
 * - Deduplicates script loading across multiple slot instances
 */
export function AdSenseSlot({
  slot = "0000000000",
  className,
  format = "auto",
  layout,
}: AdSenseSlotProps) {
  const clientId = process.env["NEXT_PUBLIC_ADSENSE_CLIENT_ID"];
  const disabled = process.env["NEXT_PUBLIC_DISABLE_ADS"] === "true";
  const insRef = useRef<HTMLModElement>(null);
  const [adBlocked, setAdBlocked] = useState(false);

  useEffect(() => {
    if (!clientId || disabled) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push(
        {},
      );
    } catch {
      // Script blocked by ad blocker — hide slot
      setAdBlocked(true);
    }

    // Check if ad rendered (ad blockers set height to 0 or display:none)
    const timer = setTimeout(() => {
      const el = insRef.current;
      if (el && el.offsetHeight === 0) {
        setAdBlocked(true);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [clientId, disabled]);

  if (disabled || !clientId || adBlocked) return null;

  return (
    <>
      {/* next/script with lazyOnload: loads after page is interactive, deduplicated */}
      <Script
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`}
        strategy="lazyOnload"
        crossOrigin="anonymous"
        onError={() => setAdBlocked(true)}
      />
      <ins
        ref={insRef}
        className={`adsbygoogle block ${className ?? ""}`}
        data-ad-client={clientId}
        data-ad-slot={slot}
        {...(format === "fluid"
          ? {
              "data-ad-format": "fluid",
              ...(layout ? { "data-ad-layout": layout } : {}),
            }
          : { "data-ad-format": "auto", "data-full-width-responsive": "true" })}
      />
    </>
  );
}
