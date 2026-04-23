"use client";

import { useEffect, useState, useRef } from "react";
import type { DiscoverySite, FeedbackSignal, Mood } from "@serendip-bot/types";
import { trpc } from "@/lib/trpc";
import { DiscoveryCard } from "./DiscoveryCard";
import { MoodSelector } from "./MoodSelector";
import { NativeAdCard } from "@/components/ads/NativeAdCard";
import { AdSlot } from "@/components/ads/AdSlot";

const POLL_INTERVAL_MS = 750;
const MAX_POLLS = 80; // 60s max
/**
 * Every Nth card slot in the grid becomes a native ad card.
 * 4 = one ad per row of 3 (occupies 1 cell in the next row, then content resumes).
 * Keeps ad density low without breaking grid rhythm.
 */
const AD_EVERY_N_CARDS = 4;

const LOADING_MESSAGES = [
  "Our AI is scouring the web for you…",
  "Checking quality and relevance…",
  "Almost there — finding the gems…",
  "Curating your discoveries…",
];

interface DiscoveryFeedProps {
  jobId: string;
  initialMood?: Mood;
  /** Controlled mood from parent (sidebar). Falls back to internal state. */
  mood?: Mood;
  /** Called when mood changes from inline selector (mobile). */
  onMoodChange?: (mood: Mood) => void;
  onPreview: (site: DiscoverySite) => void;
}

export function DiscoveryFeed({
  jobId,
  initialMood,
  mood: controlledMood,
  onMoodChange,
  onPreview,
}: DiscoveryFeedProps) {
  const [currentJobId, setCurrentJobId] = useState(jobId);
  const [sites, setSites] = useState<DiscoverySite[]>([]);
  const [internalMood, setInternalMood] = useState<Mood>(
    initialMood ?? "wonder",
  );
  const mood = controlledMood ?? internalMood;
  const handleMoodChange = onMoodChange ?? setInternalMood;

  const [pollCount, setPollCount] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Map of siteCacheId → active signal for this session (restored on load)
  const [signalMap, setSignalMap] = useState<Map<string, FeedbackSignal>>(
    new Map(),
  );

  const sessionSignalsQuery = trpc.feedback.getForSession.useQuery(undefined, {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!sessionSignalsQuery.data) return;
    const map = new Map<string, FeedbackSignal>();
    for (const { siteCacheId, signal } of sessionSignalsQuery.data) {
      map.set(siteCacheId, signal);
    }
    setSignalMap(map);
  }, [sessionSignalsQuery.data]);

  const requestMutation = trpc.discovery.request.useMutation({
    onSuccess(data) {
      // Navigate to new job in place — update URL without full navigation
      window.history.replaceState(
        null,
        "",
        `/discover?job=${data.jobId}&mood=${mood}`,
      );
      setCurrentJobId(data.jobId);
      setPollCount(0);
    },
  });

  const pollQuery = trpc.discovery.poll.useQuery(
    { jobId: currentJobId },
    {
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "complete" || status === "failed") return false;
        if (pollCount >= MAX_POLLS) return false;
        return POLL_INTERVAL_MS;
      },
    },
  );

  // React Query v5 removed onSuccess callback — use useEffect instead
  useEffect(() => {
    const data = pollQuery.data;
    if (!data) return;
    setPollCount((c) => c + 1);
    if (data.status === "complete") {
      const incoming = (data.sites as DiscoverySite[]) ?? [];
      setSites((prev) => {
        const existingIds = new Set(prev.map((s) => s.id));
        const fresh = incoming.filter((s) => !existingIds.has(s.id));
        return [...prev, ...fresh];
      });
    }
  }, [pollQuery.data]);

  // Cycle loading messages every 3s while polling
  const status = pollQuery.data?.status;
  const isPolling = status === "pending" || status === "processing";
  useEffect(() => {
    if (!isPolling || sites.length > 0) return;
    const interval = setInterval(() => {
      setLoadingMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isPolling, sites.length]);

  const failed =
    status === "failed" || (pollCount >= MAX_POLLS && status !== "complete");

  function handleFeedback(siteCacheId: string, signal: FeedbackSignal | null) {
    setSignalMap((prev) => {
      const next = new Map(prev);
      if (signal === null) {
        next.delete(siteCacheId);
      } else {
        next.set(siteCacheId, signal);
      }
      return next;
    });
    if (signal === "block" || signal === "skip") {
      setDismissed((prev) => new Set([...prev, siteCacheId]));
    } else if (signal === null) {
      // If a block/skip was removed, un-dismiss the card only if it was dismissed
      // solely by that signal (i.e., no other block/skip remains)
      setDismissed((prev) => {
        const next = new Set(prev);
        next.delete(siteCacheId);
        return next;
      });
    }
  }

  function handleLoadMore() {
    requestMutation.mutate({ mood });
  }

  const visibleSites = sites.filter((s) => !dismissed.has(s.id));
  const emptyComplete = status === "complete" && visibleSites.length === 0;
  const clearedBatch = emptyComplete && sites.length > 0;

  return (
    <div className="flex flex-col gap-8">
      {/* Mood re-selector — mobile only (hidden on lg where sidebar shows) */}
      <div className="lg:hidden space-y-3">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-500">
          Change your mood
        </p>
        <MoodSelector selected={mood} onChange={handleMoodChange} />
      </div>

      {/* Loading state with cycling messages + skeleton cards */}
      {isPolling && sites.length === 0 && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center gap-6 py-16"
        >
          <div className="flex flex-col items-center gap-4 text-gray-500">
            <svg
              className="motion-safe:animate-spin h-10 w-10 text-[#7b5ea7]"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
            <p>{LOADING_MESSAGES[loadingMsgIdx]}</p>
            {pollCount > 10 && (
              <p className="text-xs text-gray-400">Still finding gems…</p>
            )}
          </div>
          {/* Skeleton cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
              >
                <div className="aspect-video bg-gray-200 motion-safe:animate-pulse" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-gray-200 rounded motion-safe:animate-pulse w-3/4" />
                  <div className="h-3 bg-gray-100 rounded motion-safe:animate-pulse w-full" />
                  <div className="h-3 bg-gray-100 rounded motion-safe:animate-pulse w-5/6" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {failed && (
        <div className="text-center py-12 space-y-4">
          <p className="text-gray-500">
            We couldn&apos;t load results. Try again?
          </p>
          <button
            onClick={handleLoadMore}
            className="px-6 py-2.5 rounded-full bg-[#e8a020] text-[#0f0d1a] text-sm font-bold hover:bg-[#f5c561] transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {!failed && emptyComplete && (
        <div className="py-12">
          <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-[28px] border border-[#7b5ea7]/15 bg-white/90 px-6 py-10 text-center shadow-[0_18px_40px_rgba(15,13,26,0.06)]">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#7b5ea7]/10 text-2xl">
              {clearedBatch ? "✨" : "🔎"}
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-[#0f0d1a]">
                {clearedBatch
                  ? "You cleared this batch"
                  : "No discoveries landed this round"}
              </h2>
              <p className="text-sm leading-6 text-gray-500">
                {clearedBatch
                  ? "Everything in this set has been skipped or blocked. Spin up another batch and we’ll keep hunting."
                  : "The request completed, but nothing made it through to the feed. Try again or switch moods while we keep the fallback path warm."}
              </p>
            </div>
            <button
              onClick={handleLoadMore}
              disabled={requestMutation.isPending}
              className={[
                "px-6 py-2.5 rounded-full bg-[#e8a020] text-[#0f0d1a] text-sm font-bold transition-colors",
                "hover:bg-[#f5c561]",
                requestMutation.isPending
                  ? "opacity-60 cursor-not-allowed"
                  : "",
              ].join(" ")}
            >
              {requestMutation.isPending ? "Loading…" : "✦ Try Another Batch"}
            </button>
          </div>
        </div>
      )}

      {/* Results grid — native ad cards interspersed every AD_EVERY_N_CARDS slots */}
      {visibleSites.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleSites.flatMap((site, i) => {
            // Inject a native ad card before every AD_EVERY_N_CARDS-th content card.
            // The ad occupies exactly one grid cell — indistinguishable in shape from
            // a discovery card, just labeled "Sponsored". No layout break.
            const showAdBefore = i > 0 && i % AD_EVERY_N_CARDS === 0;
            const items = [];
            if (showAdBefore) {
              items.push(<NativeAdCard key={`ad-${i}`} slot="0000000000" />);
            }
            items.push(
              <DiscoveryCard
                key={site.id}
                site={site}
                mood={mood}
                initialSignal={signalMap.get(site.id) ?? null}
                onPreview={onPreview}
                onFeedback={handleFeedback}
              />,
            );
            return items;
          })}
        </div>
      )}

      {/* Load-more gate ad — natural pause point, user has just finished a batch */}
      {status === "complete" && visibleSites.length > 0 && (
        <AdSlot
          slot="0000000001"
          label={true}
          className="rounded-2xl bg-gray-50/80 border border-gray-100 p-3"
        />
      )}

      {/* Load More + Daily Discovery */}
      {status === "complete" && visibleSites.length > 0 && (
        <div ref={bottomRef} className="flex flex-col items-center gap-3 pt-2">
          <button
            onClick={handleLoadMore}
            disabled={requestMutation.isPending}
            className={[
              "px-8 py-3 rounded-full font-bold text-[#0f0d1a] motion-safe:transition-all",
              "bg-[#e8a020] hover:bg-[#f5c561] shadow-[0_4px_20px_rgba(232,160,32,0.35)] hover:shadow-[0_6px_28px_rgba(232,160,32,0.5)]",
              "motion-safe:active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#e8a020]/50",
              requestMutation.isPending ? "opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
          >
            {requestMutation.isPending ? "Loading…" : "✦ Discover More"}
          </button>
          <a
            href="/daily"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-violet-600 motion-safe:transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            See today&apos;s daily picks
          </a>
        </div>
      )}
    </div>
  );
}
