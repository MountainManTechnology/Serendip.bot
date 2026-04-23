import type { Metadata } from "next";
import Link from "next/link";
import { HeroAction } from "@/components/discovery/HeroAction";

export const metadata: Metadata = {
  title: "Discover Random Websites",
  description:
    "Start a discovery session and let AI find fascinating, hand-picked websites based on your mood. A modern StumbleUpon alternative powered by AI curation.",
  alternates: { canonical: "/discover" },
};

const EXAMPLE_DISCOVERIES = [
  { title: "Interactive data visualizations", emoji: "📊" },
  { title: "Indie web experiments", emoji: "🧪" },
  { title: "Beautifully designed personal blogs", emoji: "✍️" },
  { title: "Hidden educational gems", emoji: "🎓" },
  { title: "Creative coding showcases", emoji: "💻" },
  { title: "Niche hobby communities", emoji: "🎯" },
];

export default function DiscoverPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-50">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center gap-8 px-4 pt-24 pb-16">
        <div className="text-center space-y-4 max-w-xl">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">
            Discover Random Websites Worth Your Time
          </h1>
          <p className="text-lg text-gray-500 leading-relaxed">
            Pick a mood and let our AI agent crawl the web to find sites
            you&apos;d never find through a search engine. Every session
            surfaces fresh, quality-checked discoveries.
          </p>
        </div>
        <HeroAction />
      </section>

      {/* What You'll Find */}
      <section className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          What You&apos;ll Discover
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {EXAMPLE_DISCOVERIES.map((item) => (
            <div
              key={item.title}
              className="flex items-center gap-3 p-4 rounded-xl bg-white/60 border border-gray-100"
            >
              <span className="text-2xl">{item.emoji}</span>
              <span className="text-gray-700 font-medium">{item.title}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Back link */}
      <section className="text-center pb-16">
        <Link
          href="/"
          className="text-violet-600 hover:text-violet-700 font-medium text-sm"
        >
          ← Back to Serendip Bot
        </Link>
      </section>
    </main>
  );
}
