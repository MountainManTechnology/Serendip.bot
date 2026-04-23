"use client";

import type { Mood } from "@serendip-bot/types";

const MOODS: {
  value: Mood;
  label: string;
  emoji: string;
  description: string;
  color: string;
  bgActive: string;
  textActive: string;
  borderActive: string;
}[] = [
  {
    value: "wonder",
    label: "Wonder",
    emoji: "🔭",
    description: "Awe-inspiring & mind-expanding",
    color: "#7b5ea7",
    bgActive: "bg-[#f5f0ff]",
    textActive: "text-[#7b5ea7]",
    borderActive: "border-[#7b5ea7]",
  },
  {
    value: "learn",
    label: "Learn",
    emoji: "📚",
    description: "Deep dives & explainers",
    color: "#2ec4b6",
    bgActive: "bg-[#f0fffe]",
    textActive: "text-[#1a9e92]",
    borderActive: "border-[#2ec4b6]",
  },
  {
    value: "create",
    label: "Create",
    emoji: "🎨",
    description: "Tools, art & making things",
    color: "#e8a020",
    bgActive: "bg-[#fff8ec]",
    textActive: "text-[#c07a10]",
    borderActive: "border-[#e8a020]",
  },
  {
    value: "laugh",
    label: "Laugh",
    emoji: "😄",
    description: "Humor & delightful weirdness",
    color: "#e85d5d",
    bgActive: "bg-[#fff0f0]",
    textActive: "text-[#c04040]",
    borderActive: "border-[#e85d5d]",
  },
  {
    value: "chill",
    label: "Chill",
    emoji: "☕",
    description: "Gentle reads & calm corners",
    color: "#4a9eff",
    bgActive: "bg-[#f0f7ff]",
    textActive: "text-[#2a7fd4]",
    borderActive: "border-[#4a9eff]",
  },
  {
    value: "explore",
    label: "Explore",
    emoji: "🗺️",
    description: "Venture off the beaten path",
    color: "#3dbb7a",
    bgActive: "bg-[#f0fff6]",
    textActive: "text-[#1f8f55]",
    borderActive: "border-[#3dbb7a]",
  },
  {
    value: "relax",
    label: "Relax",
    emoji: "🌿",
    description: "Slow down & decompress",
    color: "#6ab4d8",
    bgActive: "bg-[#f0f8ff]",
    textActive: "text-[#3a8ab0]",
    borderActive: "border-[#6ab4d8]",
  },
  {
    value: "inspire",
    label: "Inspire",
    emoji: "✨",
    description: "Spark new ideas & creativity",
    color: "#f4845f",
    bgActive: "bg-[#fff5f0]",
    textActive: "text-[#c85c35]",
    borderActive: "border-[#f4845f]",
  },
  {
    value: "challenge",
    label: "Challenge",
    emoji: "🧠",
    description: "Stretch your thinking",
    color: "#c94f7c",
    bgActive: "bg-[#fff0f6]",
    textActive: "text-[#a03060]",
    borderActive: "border-[#c94f7c]",
  },
];

interface MoodSelectorProps {
  selected?: Mood;
  onChange: (mood: Mood) => void;
  vertical?: boolean;
  /** Use light-background styles for inactive buttons (e.g. sidebar on white page) */
  light?: boolean;
}

export function MoodSelector({
  selected,
  onChange,
  vertical,
  light,
}: MoodSelectorProps) {
  return (
    <div
      className={vertical ? "flex flex-col gap-2" : "flex flex-wrap gap-2.5"}
    >
      {MOODS.map(
        ({
          value,
          label,
          emoji,
          description,
          bgActive,
          textActive,
          borderActive,
        }) => {
          const isActive = selected === value;
          return (
            <button
              key={value}
              onClick={() => onChange(value)}
              title={description}
              aria-pressed={isActive}
              className={[
                vertical
                  ? "flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold w-full"
                  : "flex flex-col items-center gap-1 px-4 py-3 rounded-2xl border-2 text-sm font-semibold",
                "motion-safe:transition-all motion-safe:duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0d1a]",
                isActive
                  ? `${borderActive} ${bgActive} ${textActive} shadow-md`
                  : light
                    ? "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700"
                    : "border-white/10 bg-white/5 text-white/60 hover:border-white/25 hover:bg-white/10 hover:text-white",
              ].join(" ")}
            >
              <span
                className={[
                  vertical ? "text-lg leading-none" : "text-2xl leading-none",
                  "motion-safe:transition-transform motion-safe:duration-200",
                  "group-hover:scale-110",
                  isActive
                    ? "motion-safe:animate-[jiggle_0.4s_ease-in-out]"
                    : "",
                ].join(" ")}
              >
                {emoji}
              </span>
              <span>{label}</span>
            </button>
          );
        },
      )}
    </div>
  );
}
