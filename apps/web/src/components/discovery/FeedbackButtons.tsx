"use client";

import { useState } from "react";
import type { FeedbackSignal } from "@serendip-bot/types";
import { trpc } from "@/lib/trpc";

interface FeedbackButtonsProps {
  siteCacheId: string;
  initialSignal?: FeedbackSignal | null | undefined;
  onFeedback?: (signal: FeedbackSignal | null) => void;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="w-5 h-5 transition-all duration-200"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function SkipIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function BlockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function FeedbackButtons({
  siteCacheId,
  initialSignal = null,
  onFeedback,
}: FeedbackButtonsProps) {
  const [activeSignal, setActiveSignal] = useState<FeedbackSignal | null>(
    initialSignal,
  );

  const mutation = trpc.feedback.submit.useMutation({
    onSuccess(data) {
      const next = data.signal as FeedbackSignal | null;
      setActiveSignal(next);
      onFeedback?.(next);
    },
  });

  const pending = mutation.isPending;

  return (
    <div
      className="flex items-center gap-3"
      role="group"
      aria-label="Rate this site"
    >
      {/* Love it */}
      <button
        onClick={() => mutation.mutate({ siteCacheId, signal: "love" })}
        disabled={pending}
        aria-label={activeSignal === "love" ? "Remove love" : "Love it"}
        title={activeSignal === "love" ? "Remove love" : "Love it"}
        className={[
          "flex items-center justify-center w-11 h-11 rounded-full border-2 transition-all duration-200",
          "motion-safe:hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400",
          activeSignal === "love"
            ? "bg-rose-500 border-rose-500 text-white shadow-md shadow-rose-200"
            : "bg-white border-gray-200 text-gray-400 hover:border-rose-400 hover:text-rose-500",
          pending ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        ].join(" ")}
      >
        <HeartIcon filled={activeSignal === "love"} />
      </button>

      {/* Skip */}
      <button
        onClick={() => mutation.mutate({ siteCacheId, signal: "skip" })}
        disabled={pending}
        aria-label={activeSignal === "skip" ? "Remove skip" : "Skip"}
        title={activeSignal === "skip" ? "Remove skip" : "Skip"}
        className={[
          "flex items-center justify-center w-11 h-11 rounded-full border-2 transition-all duration-200",
          "motion-safe:hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
          activeSignal === "skip"
            ? "bg-gray-600 border-gray-600 text-white shadow-md shadow-gray-200"
            : "bg-white border-gray-200 text-gray-400 hover:border-gray-500 hover:text-gray-600",
          pending ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        ].join(" ")}
      >
        <SkipIcon />
      </button>

      {/* Never show */}
      <button
        onClick={() => mutation.mutate({ siteCacheId, signal: "block" })}
        disabled={pending}
        aria-label={
          activeSignal === "block" ? "Remove block" : "Never show again"
        }
        title={activeSignal === "block" ? "Remove block" : "Never show again"}
        className={[
          "flex items-center justify-center w-11 h-11 rounded-full border-2 transition-all duration-200",
          "motion-safe:hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400",
          activeSignal === "block"
            ? "bg-red-500 border-red-500 text-white shadow-md shadow-red-200"
            : "bg-white border-gray-200 text-gray-400 hover:border-red-400 hover:text-red-500",
          pending ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        ].join(" ")}
      >
        <BlockIcon />
      </button>
    </div>
  );
}
