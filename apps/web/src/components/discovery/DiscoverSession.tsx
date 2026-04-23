"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { DiscoverySite, Mood } from "@serendip-bot/types";
import { DiscoveryFeed } from "@/components/discovery/DiscoveryFeed";
import { ContentPreview } from "@/components/discovery/ContentPreview";
import { MoodSelector } from "@/components/discovery/MoodSelector";
import { AdSlot } from "@/components/ads/AdSlot";

const MOOD_LABELS: Record<Mood, { label: string; color: string }> = {
  wonder: { label: "Wonder", color: "#7b5ea7" },
  learn: { label: "Learn", color: "#2ec4b6" },
  create: { label: "Create", color: "#e8a020" },
  laugh: { label: "Laugh", color: "#e85d5d" },
  chill: { label: "Chill", color: "#4a9eff" },
  explore: { label: "Explore", color: "#3dbb7a" },
  relax: { label: "Relax", color: "#6ab4d8" },
  inspire: { label: "Inspire", color: "#f4845f" },
  challenge: { label: "Challenge", color: "#c94f7c" },
};

function DiscoverContent({
  jobId,
  initialMood = "wonder",
}: {
  jobId: string;
  initialMood?: Mood;
}) {
  const router = useRouter();

  const [mood, setMood] = useState<Mood>(initialMood);
  const [previewSite, setPreviewSite] = useState<DiscoverySite | null>(null);

  const moodMeta = MOOD_LABELS[mood];

  return (
    <>
      <div className="min-h-screen bg-[#faf9ff]">
        {/* Nav */}
        <nav className="sticky top-0 z-20 bg-[#0f0d1a]/95 backdrop-blur-md border-b border-white/5 shadow-lg">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            {/* Logo */}
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 group"
            >
              <Image
                src="/assets/favicon.png"
                alt=""
                width={24}
                height={24}
                className="transition-transform duration-300 group-hover:rotate-12"
              />
              <span className="font-extrabold text-base text-white tracking-tight">
                Serendip<span className="text-[#e8a020]">.</span>bot
              </span>
            </button>

            {/* Active mood badge */}
            <span
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full"
              style={{
                backgroundColor: moodMeta.color + "20",
                color: moodMeta.color,
                border: `1px solid ${moodMeta.color}40`,
              }}
            >
              {moodMeta.label} mode
            </span>

            {/* Home link */}
            <button
              onClick={() => router.push("/")}
              className="text-xs text-white/50 hover:text-white/80 motion-safe:transition-colors flex items-center gap-1"
            >
              ← Home
            </button>
          </div>
        </nav>

        {/* Accessibility: sr-only h1 */}
        <h1 className="sr-only">Your {mood} Discoveries</h1>

        {/* Sidebar + Feed layout */}
        <div className="max-w-6xl mx-auto px-4 py-8 lg:grid lg:grid-cols-[220px_1fr] lg:gap-10">
          {/* Left sidebar — mood controls (desktop only) */}
          <aside className="hidden lg:block space-y-5 sticky top-20 self-start">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#9ca3af]">
              Change Mood
            </p>
            <MoodSelector selected={mood} onChange={setMood} vertical light />

            {/* Divider + brand mark */}
            <div className="pt-4 border-t border-gray-200">
              <p className="text-xs text-[#9ca3af] font-serif leading-relaxed">
                AI-curated discoveries, fresh every session.
              </p>
            </div>

            {/* Sidebar 300×250 ad — sticky, no scroll interruption */}
            <div className="pt-2">
              <AdSlot
                slot="0000000002"
                label={true}
                className="w-full rounded-xl bg-gray-50 border border-gray-100"
              />
            </div>
          </aside>

          {/* Right — feed */}
          <main>
            <DiscoveryFeed
              jobId={jobId}
              initialMood={mood}
              mood={mood}
              onMoodChange={setMood}
              onPreview={setPreviewSite}
            />
          </main>
        </div>
      </div>

      {/* Content preview modal */}
      <ContentPreview site={previewSite} onClose={() => setPreviewSite(null)} />
    </>
  );
}

function DiscoverSession({
  jobId,
  initialMood,
}: {
  jobId: string;
  initialMood?: Mood;
}) {
  return (
    <DiscoverContent jobId={jobId} initialMood={initialMood ?? "wonder"} />
  );
}

export default DiscoverSession;
