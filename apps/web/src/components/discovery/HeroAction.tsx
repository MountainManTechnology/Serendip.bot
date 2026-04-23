"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoodSelector } from "@/components/discovery/MoodSelector";
import { trpc } from "@/lib/trpc";
import { setSessionId, getSessionId } from "@/lib/session";
import type { Mood } from "@serendip-bot/types";

export function HeroAction() {
  const router = useRouter();
  const [mood, setMood] = useState<Mood>("wonder");
  const [isPending, startTransition] = useTransition();

  const requestMutation = trpc.discovery.request.useMutation({
    onSuccess(data) {
      if (!getSessionId()) {
        setSessionId(data.sessionId);
      }
      startTransition(() => {
        router.push(`/discover/${data.jobId}?mood=${mood}`);
      });
    },
  });

  function handleSurpriseMe() {
    requestMutation.mutate({ mood });
  }

  const isLoading = requestMutation.isPending || isPending;

  return (
    <div className="flex flex-col gap-8 w-full">
      <div className="w-full space-y-4">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
          What are you in the mood for?
        </p>
        <MoodSelector selected={mood} onChange={setMood} />
      </div>

      <button
        onClick={handleSurpriseMe}
        disabled={isLoading}
        className={[
          "self-start px-8 py-4 rounded-full text-base font-bold text-[#0f0d1a]",
          "bg-[#e8a020] hover:bg-[#f5c561]",
          "shadow-[0_4px_20px_rgba(232,160,32,0.35)] hover:shadow-[0_6px_28px_rgba(232,160,32,0.50)]",
          "motion-safe:transition-all motion-safe:active:scale-95",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#e8a020]/50",
          isLoading ? "opacity-70 cursor-not-allowed" : "",
        ].join(" ")}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg
              className="motion-safe:animate-spin h-5 w-5"
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
            Finding gems…
          </span>
        ) : (
          "✦ Surprise Me"
        )}
      </button>

      {requestMutation.isError && (
        <p className="text-sm text-red-400 text-center" role="alert">
          Something went wrong. Please try again.
        </p>
      )}
    </div>
  );
}
