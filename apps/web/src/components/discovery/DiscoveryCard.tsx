"use client";

import Image from "next/image";
import type { DiscoverySite, FeedbackSignal, Mood } from "@serendip-bot/types";
import { FeedbackButtons } from "./FeedbackButtons";

// Per-mood accent colors for the whyBlurb callout and category pills
const MOOD_ACCENTS: Record<
  Mood,
  {
    border: string;
    bg: string;
    text: string;
    pillBg: string;
    pillText: string;
    hoverTitle: string;
  }
> = {
  wonder: {
    border: "border-mood-wonder",
    bg: "bg-mood-wonder-bg/60",
    text: "text-violet-dark",
    pillBg: "bg-mood-wonder-bg",
    pillText: "text-mood-wonder",
    hoverTitle: "hover:text-mood-wonder",
  },
  learn: {
    border: "border-mood-learn",
    bg: "bg-mood-learn-bg/60",
    text: "text-teal-dark",
    pillBg: "bg-mood-learn-bg",
    pillText: "text-mood-learn",
    hoverTitle: "hover:text-mood-learn",
  },
  create: {
    border: "border-mood-create",
    bg: "bg-mood-create-bg/60",
    text: "text-gold-dark",
    pillBg: "bg-mood-create-bg",
    pillText: "text-mood-create",
    hoverTitle: "hover:text-mood-create",
  },
  laugh: {
    border: "border-mood-laugh",
    bg: "bg-mood-laugh-bg/60",
    text: "text-mood-laugh",
    pillBg: "bg-mood-laugh-bg",
    pillText: "text-mood-laugh",
    hoverTitle: "hover:text-mood-laugh",
  },
  chill: {
    border: "border-mood-chill",
    bg: "bg-mood-chill-bg/60",
    text: "text-teal-dark",
    pillBg: "bg-mood-chill-bg",
    pillText: "text-mood-chill",
    hoverTitle: "hover:text-mood-chill",
  },
  explore: {
    border: "border-[#3dbb7a]",
    bg: "bg-[#f0fff6]/60",
    text: "text-[#1f8f55]",
    pillBg: "bg-[#f0fff6]",
    pillText: "text-[#1f8f55]",
    hoverTitle: "hover:text-[#1f8f55]",
  },
  relax: {
    border: "border-[#6ab4d8]",
    bg: "bg-[#f0f8ff]/60",
    text: "text-[#3a8ab0]",
    pillBg: "bg-[#f0f8ff]",
    pillText: "text-[#3a8ab0]",
    hoverTitle: "hover:text-[#3a8ab0]",
  },
  inspire: {
    border: "border-[#f4845f]",
    bg: "bg-[#fff5f0]/60",
    text: "text-[#c85c35]",
    pillBg: "bg-[#fff5f0]",
    pillText: "text-[#c85c35]",
    hoverTitle: "hover:text-[#c85c35]",
  },
  challenge: {
    border: "border-[#c94f7c]",
    bg: "bg-[#fff0f6]/60",
    text: "text-[#a03060]",
    pillBg: "bg-[#fff0f6]",
    pillText: "text-[#a03060]",
    hoverTitle: "hover:text-[#a03060]",
  },
};

interface DiscoveryCardProps {
  site: DiscoverySite;
  mood?: Mood;
  initialSignal?: FeedbackSignal | null;
  onPreview: (site: DiscoverySite) => void;
  onFeedback: (siteCacheId: string, signal: FeedbackSignal | null) => void;
}

export function DiscoveryCard({
  site,
  mood = "wonder",
  initialSignal,
  onPreview,
  onFeedback,
}: DiscoveryCardProps) {
  const heroImage = site.extractedImages[0];
  const accents = MOOD_ACCENTS[mood];

  const hostname = (() => {
    try {
      return new URL(site.url).hostname.replace(/^www\./, "");
    } catch {
      return site.url;
    }
  })();

  return (
    <article
      className="group bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col"
      style={{
        boxShadow:
          "0 2px 8px rgba(15,13,26,0.08), 0 1px 3px rgba(15,13,26,0.06)",
        transition: "box-shadow 0.2s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow =
          "0 8px 24px rgba(15,13,26,0.12), 0 2px 8px rgba(15,13,26,0.08)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow =
          "0 2px 8px rgba(15,13,26,0.08), 0 1px 3px rgba(15,13,26,0.06)";
      }}
    >
      {/* Hero image */}
      {heroImage && (
        <button
          onClick={() => onPreview(site)}
          className="block relative w-full aspect-video bg-gray-100 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b5ea7]"
          aria-label={`Read ${site.title}`}
        >
          <Image
            src={heroImage.url}
            alt={heroImage.altText || site.title}
            fill
            className="object-cover motion-safe:group-hover:scale-105 motion-safe:transition-transform motion-safe:duration-300"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            unoptimized
          />
        </button>
      )}

      <div className="flex flex-col gap-3 p-5 flex-1">
        {/* Category pills */}
        {site.categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {site.categories.slice(0, 3).map((cat) => (
              <span
                key={cat}
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${accents.pillBg} ${accents.pillText}`}
              >
                {cat}
              </span>
            ))}
          </div>
        )}

        {/* Title + description */}
        <div className="flex-1">
          <button
            onClick={() => onPreview(site)}
            className="text-left focus-visible:outline-none focus-visible:underline"
          >
            <h2
              className={`text-lg font-bold text-[#0f0d1a] leading-snug motion-safe:transition-colors line-clamp-2 ${accents.hoverTitle}`}
            >
              {site.title}
            </h2>
          </button>
          <p className="mt-1 text-sm text-[#6b7280] line-clamp-3 font-serif">
            {site.description}
          </p>
        </div>

        {/* Why blurb — mood-tinted */}
        {site.whyBlurb && (
          <p
            className={`text-sm italic line-clamp-2 border-l-4 pl-3 py-2 rounded-r-lg font-serif ${accents.border} ${accents.bg} ${accents.text}`}
          >
            {site.whyBlurb}
          </p>
        )}

        {/* Footer: domain + feedback */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-50">
          <a
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-xs text-[#9ca3af] truncate max-w-[120px] motion-safe:transition-colors ${accents.hoverTitle}`}
          >
            {hostname}
          </a>
          <FeedbackButtons
            siteCacheId={site.id}
            initialSignal={initialSignal}
            onFeedback={(signal) => onFeedback(site.id, signal)}
          />
        </div>
      </div>
    </article>
  );
}
