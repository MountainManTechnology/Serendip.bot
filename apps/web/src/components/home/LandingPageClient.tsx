"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import type { ArticleListItem } from "@serendip-bot/types";
import { DailyDiscoveryCard } from "@/components/articles/DailyDiscoveryCard";
import { HeroAction } from "@/components/discovery/HeroAction";
import { SiteNav } from "@/components/layout/SiteNav";
import { SiteFooter } from "@/components/layout/SiteFooter";

// Scroll-reveal hook
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

const faqItems = [
  {
    question: "What is Serendip Bot?",
    answer:
      "Serendip Bot is a free, AI-powered web discovery engine — like a modern StumbleUpon alternative. It finds small, wonderful, hand-picked websites you would never find through a regular search engine, curated based on your mood.",
  },
  {
    question: "How does Serendip Bot work?",
    answer:
      "Choose a mood — Wonder, Learn, Create, Laugh, Chill, Explore, Relax, Inspire, or Challenge — and our AI agent crawls the web in real time to find sites that match. It evaluates quality, relevance, and novelty so every recommendation is a genuine discovery.",
  },
  {
    question: "Is Serendip Bot free?",
    answer:
      "Yes, completely free. No account required. Serendip Bot is ad-supported and open source.",
  },
  {
    question: "How is this different from StumbleUpon?",
    answer:
      "StumbleUpon shut down in 2018 and was replaced by Mix.com. Serendip Bot is built from scratch with modern AI — it actively crawls and evaluates sites rather than relying on user submissions, so you get fresher, higher-quality discoveries.",
  },
  {
    question: "What kind of websites will I find?",
    answer:
      "Everything from interactive data visualizations and indie games to thoughtful personal blogs, niche educational sites, and beautifully designed web experiments — the corners of the internet that algorithms usually bury.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

const MOODS = [
  {
    emoji: "🔭",
    name: "Wonder",
    slug: "wonder",
    color: "#7b5ea7",
    desc: "Awe-inspiring discoveries and mind-expanding rabbit holes",
  },
  {
    emoji: "📚",
    name: "Learn",
    slug: "learn",
    color: "#2ec4b6",
    desc: "Deep dives, explainers, and fascinating educational sites",
  },
  {
    emoji: "🎨",
    name: "Create",
    slug: "create",
    color: "#e8a020",
    desc: "Tools, art communities, and creative inspiration",
  },
  {
    emoji: "😄",
    name: "Laugh",
    slug: "laugh",
    color: "#e85d5d",
    desc: "Humor, delightful weirdness, and internet absurdity",
  },
  {
    emoji: "☕",
    name: "Chill",
    slug: "chill",
    color: "#4a9eff",
    desc: "Gentle reads, calm corners, and relaxing web experiences",
  },
];

const PREVIEW_CARDS = [
  {
    emoji: "🔭",
    title: "The Museum of Endangered Sounds",
    desc: "Preserving the sounds of old technology before they vanish forever.",
  },
  {
    emoji: "📚",
    title: "Explorable Explanations",
    desc: "Interactive essays that teach complex ideas through play.",
  },
  {
    emoji: "🎨",
    title: "Creative Coding Showcase",
    desc: "Generative art experiments pushing the boundaries of code.",
  },
];

function LatestDailyDiscover({ article }: { article: ArticleListItem | null }) {
  if (!article) {
    return (
      <section
        id="daily-discover"
        className="bg-[#fff8ec] py-24 border-b border-[#f3dfb5]"
      >
        <div className="max-w-6xl mx-auto px-4">
          <div className="reveal rounded-[28px] border border-[#ead5a9] bg-white p-8 md:p-10 shadow-[0_18px_60px_rgba(15,13,26,0.08)]">
            <p className="inline-flex items-center gap-2 rounded-full bg-[#fff1ce] px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#9a6200]">
              <span className="text-base" aria-hidden="true">
                ✦
              </span>
              Daily Discoveries
            </p>
            <h2 className="mt-5 text-3xl md:text-4xl font-extrabold tracking-tight text-[#0f0d1a]">
              Fresh deep-dives deserve a homepage spotlight.
            </h2>
            <p className="mt-4 max-w-2xl text-[#5f6476] leading-relaxed">
              We publish a new long-form discovery every day. Even when the
              latest story is still being prepared, the full archive is ready to
              send curious readers deeper.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/daily"
                className="inline-flex items-center gap-2 rounded-full bg-[#e8a020] px-6 py-3 font-bold text-[#0f0d1a] transition-all duration-200 hover:bg-[#f5c561] hover:shadow-[0_4px_20px_rgba(232,160,32,0.35)]"
              >
                Browse Daily Discoveries <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const formattedDate = new Date(
    article.publishedAt + "T00:00:00Z",
  ).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <section
      id="daily-discover"
      className="bg-[#fff8ec] py-24 border-b border-[#f3dfb5]"
    >
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid lg:grid-cols-[0.92fr_1.08fr] gap-8 items-center">
          <div className="reveal space-y-5">
            <p className="inline-flex items-center gap-2 rounded-full bg-[#fff1ce] px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#9a6200]">
              <span className="text-base" aria-hidden="true">
                ✦
              </span>
              Featured Daily Discovery
            </p>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-[#0f0d1a] leading-tight">
              Give visitors a richer rabbit hole right from the homepage.
            </h2>
            <p className="max-w-xl text-[#5f6476] leading-relaxed">
              Daily Discoveries turns the best corners of the internet into a
              polished read. The latest story is now one scroll away, so
              homepage traffic has a clear path into the daily archive.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/daily"
                className="inline-flex items-center gap-2 rounded-full border border-[#dbc69a] bg-white px-6 py-3 font-semibold text-[#7b5ea7] transition-colors duration-200 hover:border-[#7b5ea7] hover:text-[#5a3f85]"
              >
                Browse all daily stories
              </Link>
            </div>
          </div>

          <DailyDiscoveryCard
            article={article}
            className="reveal max-w-[680px] lg:justify-self-end"
            imageSizes="(max-width: 768px) 100vw, (max-width: 1280px) 55vw, 680px"
          />
        </div>
      </div>
    </section>
  );
}

function formatIndexedSiteCount(indexedSiteCount: number | null): string {
  if (indexedSiteCount === null) return "—";
  return indexedSiteCount.toLocaleString("en-US");
}

export function LandingPageClient({
  latestArticle,
  indexedSiteCount,
  moodCount,
}: {
  latestArticle: ArticleListItem | null;
  indexedSiteCount: number | null;
  moodCount: number;
}) {
  useReveal();

  return (
    <main className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <SiteNav />

      <section
        id="hero"
        className="relative overflow-hidden bg-[#0f0d1a] min-h-screen flex items-center"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 60% at 60% 40%, rgba(123,94,167,0.18) 0%, transparent 65%), radial-gradient(ellipse 60% 50% at 20% 70%, rgba(46,196,182,0.10) 0%, transparent 60%)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 pt-28 pb-20 grid md:grid-cols-2 gap-16 items-center w-full">
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/60 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2ec4b6] animate-pulse" />
              AI agent running · new discoveries every minute
            </div>
            <div className="flex items-center gap-3">
              <Image
                src="/assets/logo.png"
                alt="Serendip Bot"
                width={52}
                height={52}
                priority
                className="drop-shadow-lg"
              />
              <span className="font-extrabold text-xl text-white tracking-tight">
                Serendip<span className="text-[#e8a020]">.</span>bot
              </span>
            </div>
            <h1 className="text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.08]">
              Discover the Internet You{" "}
              <span className="text-[#e8a020]">Didn&apos;t Know</span> Existed
            </h1>
            <p className="text-lg text-white/60 leading-relaxed font-serif max-w-md">
              Serendip Bot is an AI-powered{" "}
              <strong className="text-white/80 not-italic">
                StumbleUpon alternative
              </strong>{" "}
              that finds small, wonderful websites curated by your curiosity.
            </p>
            <HeroAction />
            <p className="text-xs text-white/30">
              No account needed · Ad-supported · Open source
            </p>
          </div>

          <div className="hidden md:flex flex-col gap-3 rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur-sm shadow-2xl motion-safe:animate-[float_6s_ease-in-out_infinite]">
            {PREVIEW_CARDS.map((card) => (
              <div
                key={card.title}
                className="flex items-start gap-3 p-3.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors duration-200"
              >
                <span className="text-xl flex-shrink-0">{card.emoji}</span>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-white truncate">
                    {card.title}
                  </p>
                  <p className="text-xs text-white/50 line-clamp-1 font-serif">
                    {card.desc}
                  </p>
                </div>
              </div>
            ))}
            <p className="text-xs text-center text-white/30 pt-1">
              Example discoveries
            </p>
          </div>
        </div>

        <div
          className="absolute bottom-0 left-0 right-0 h-16 bg-[#fff8ec]"
          style={{ clipPath: "ellipse(55% 100% at 50% 100%)" }}
        />
      </section>

      <LatestDailyDiscover article={latestArticle} />

      <section id="how-it-works" className="bg-white py-24">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="reveal text-3xl font-extrabold text-[#0f0d1a] text-center mb-14 tracking-tight">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-10 relative">
            <div className="hidden md:block absolute top-8 left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-[#7b5ea7]/40 to-transparent" />
            {[
              {
                emoji: "🎯",
                title: "1. Pick a Mood",
                desc: "Choose from Wonder, Learn, Create, Laugh, or Chill. Your mood tells our AI what kind of rabbit hole to find.",
              },
              {
                emoji: "🤖",
                title: "2. AI Discovers",
                desc: "Our agent crawls the web in real time, evaluating pages for quality, relevance, and novelty — not just popularity.",
              },
              {
                emoji: "✨",
                title: "3. Explore & React",
                desc: "Browse your curated discoveries. Love a site? Skip one? Your feedback helps surface even better finds next time.",
              },
            ].map((step, i) => (
              <div
                key={step.title}
                className="reveal text-center space-y-3 relative"
                style={{ transitionDelay: `${i * 120}ms` }}
              >
                <div className="w-16 h-16 rounded-full bg-[#f5f0ff] flex items-center justify-center text-3xl mx-auto ring-4 ring-white shadow-md">
                  {step.emoji}
                </div>
                <h3 className="text-lg font-bold text-[#0f0d1a]">
                  {step.title}
                </h3>
                <p className="text-[#6b7280] text-sm leading-relaxed font-serif">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="moods" className="bg-[#faf9ff] py-24">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="reveal text-3xl font-extrabold text-[#0f0d1a] text-center mb-4 tracking-tight">
            Browse by Mood
          </h2>
          <p className="reveal text-center text-[#6b7280] mb-12 max-w-2xl mx-auto font-serif leading-relaxed">
            Every mood unlocks a different slice of the web. From awe-inspiring
            deep dives to lighthearted internet gems — there&apos;s always
            something new to stumble upon.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MOODS.map((mood, i) => (
              <Link
                key={mood.name}
                href={`/moods/${mood.slug}`}
                className="reveal group flex items-start gap-3.5 p-5 rounded-2xl bg-white border border-gray-100 hover:border-transparent hover:shadow-lg transition-all duration-300 motion-safe:hover:scale-[1.02]"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <span
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 transition-transform duration-200 group-hover:scale-110"
                  style={{ backgroundColor: mood.color + "20" }}
                >
                  {mood.emoji}
                </span>
                <div>
                  <h3
                    className="font-bold text-[#0f0d1a] group-hover:text-[#7b5ea7] transition-colors"
                    style={{ "--hover-color": mood.color } as CSSProperties}
                  >
                    {mood.name}
                  </h3>
                  <p className="text-sm text-[#6b7280] leading-relaxed font-serif">
                    {mood.desc}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="why" className="bg-[#0f0d1a] py-24">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="reveal text-3xl font-extrabold text-white mb-14 tracking-tight">
            Why Serendip Bot?
          </h2>
          <div className="grid md:grid-cols-2 gap-10">
            {[
              {
                icon: "🔍",
                title: "Beyond the algorithm bubble",
                color: "#7b5ea7",
                body: "Search engines optimize for popularity and ads. Social feeds optimize for engagement. Serendip Bot optimizes for genuine surprise — surfacing sites that deserve attention but don't have SEO budgets.",
              },
              {
                icon: "🧠",
                title: "AI-native, not a directory",
                color: "#2ec4b6",
                body: "Unlike legacy StumbleUpon clones that rely on user submissions, Serendip Bot uses AI agents to actively crawl, evaluate, and curate the web. Every recommendation is fresh and quality-checked.",
              },
              {
                icon: "🌱",
                title: "Champions the small web",
                color: "#e8a020",
                body: "Personal blogs, indie projects, educational gems, creative experiments — the hand-crafted corners of the internet that make the web worth exploring.",
              },
              {
                icon: "🔓",
                title: "Free & open source",
                color: "#e85d5d",
                body: "No account walls, no tracking profiles, no data harvesting. Serendip Bot is ad-supported and fully open source. Self-host it if you want.",
              },
            ].map((item, i) => (
              <div
                key={item.title}
                className="reveal space-y-2"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-base"
                    style={{ filter: `drop-shadow(0 0 8px ${item.color}60)` }}
                  >
                    {item.icon}
                  </span>
                  <h3
                    className="text-base font-bold"
                    style={{ color: item.color }}
                  >
                    {item.title}
                  </h3>
                </div>
                <p className="text-white/60 leading-relaxed font-serif">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#e8a020] py-10">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid grid-cols-3 gap-6 text-center">
            {[
              {
                value: formatIndexedSiteCount(indexedSiteCount),
                label: "Sites discovered",
              },
              { value: String(moodCount), label: "Discovery moods" },
              { value: "100%", label: "Free & open source" },
            ].map((stat) => (
              <div key={stat.label} className="space-y-1">
                <p className="text-3xl font-extrabold text-[#0f0d1a] tracking-tight">
                  {stat.value}
                </p>
                <p className="text-sm font-medium text-[#0f0d1a]/70">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="bg-white py-24">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="reveal text-3xl font-extrabold text-[#0f0d1a] mb-12 tracking-tight">
            Frequently Asked Questions
          </h2>
          <dl className="space-y-5">
            {faqItems.map((item, i) => (
              <FAQItem key={item.question} item={item} delay={i * 60} />
            ))}
          </dl>
        </div>
      </section>

      <section className="bg-[#faf9ff] py-20 text-center">
        <div className="max-w-2xl mx-auto px-4 space-y-6">
          <h2 className="reveal text-4xl font-extrabold text-[#0f0d1a] tracking-tight">
            Ready to get lost?
          </h2>
          <p className="reveal text-[#6b7280] font-serif leading-relaxed">
            Pick a mood and let the AI take you somewhere wonderful. No sign-up,
            no algorithm, no agenda.
          </p>
          <Link
            href="#hero"
            className="reveal inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#e8a020] text-[#0f0d1a] font-bold text-lg transition-all duration-200 hover:bg-[#f5c561] hover:shadow-[0_4px_20px_rgba(232,160,32,0.45)] active:scale-95"
          >
            ✦ Start Stumbling — It&apos;s Free
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function FAQItem({
  item,
  delay,
}: {
  item: { question: string; answer: string };
  delay: number;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  return (
    <details
      ref={detailsRef}
      className="reveal group border border-gray-100 rounded-2xl overflow-hidden"
      style={{ transitionDelay: `${delay}ms` }}
    >
      <summary className="flex items-center justify-between px-6 py-4 cursor-pointer select-none list-none hover:bg-[#faf9ff] transition-colors">
        <dt className="text-base font-bold text-[#0f0d1a] pr-4">
          {item.question}
        </dt>
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#f5f0ff] flex items-center justify-center text-[#7b5ea7] text-xs font-bold transition-transform duration-200 group-open:rotate-45">
          +
        </span>
      </summary>
      <dd className="px-6 pb-5 pt-1 text-[#6b7280] leading-relaxed font-serif border-t border-gray-50">
        {item.answer}
      </dd>
    </details>
  );
}
