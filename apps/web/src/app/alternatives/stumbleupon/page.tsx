import type { Metadata } from "next";
import Link from "next/link";
import { HeroAction } from "@/components/discovery/HeroAction";

export const metadata: Metadata = {
  title: "Best StumbleUpon Alternatives in 2026",
  description:
    "StumbleUpon shut down in 2018. Here are the best alternatives for discovering random websites in 2026, including Serendip Bot — the only AI-native stumbling engine.",
  alternates: { canonical: "/alternatives/stumbleupon" },
  openGraph: {
    title: "Best StumbleUpon Alternatives in 2026 — Serendip Bot",
    description:
      "Compare the top StumbleUpon replacements: Serendip Bot, Mix.com, Cloudhiker, The Useless Web, and Marginalia Search.",
  },
};

const competitors = [
  {
    name: "Serendip Bot",
    url: "/",
    year: 2026,
    approach: "AI agent crawls & curates in real time",
    free: true,
    accountRequired: false,
    aiPowered: true,
    moodFiltering: true,
    openSource: true,
    highlight: true,
  },
  {
    name: "Mix.com",
    url: "https://mix.com",
    year: 2018,
    approach: "User-submitted links with algorithmic feed",
    free: true,
    accountRequired: true,
    aiPowered: false,
    moodFiltering: false,
    openSource: false,
    highlight: false,
  },
  {
    name: "Cloudhiker",
    url: "https://cloudhiker.net",
    year: 2019,
    approach: "Curated directory of interesting websites",
    free: true,
    accountRequired: false,
    aiPowered: false,
    moodFiltering: false,
    openSource: false,
    highlight: false,
  },
  {
    name: "The Useless Web",
    url: "https://theuselessweb.com",
    year: 2008,
    approach: "Random redirect to novelty/joke sites",
    free: true,
    accountRequired: false,
    aiPowered: false,
    moodFiltering: false,
    openSource: false,
    highlight: false,
  },
  {
    name: "Marginalia Search",
    url: "https://search.marginalia.nu",
    year: 2022,
    approach: "Search engine biased toward small/indie web",
    free: true,
    accountRequired: false,
    aiPowered: false,
    moodFiltering: false,
    openSource: true,
    highlight: false,
  },
];

const faqItems = [
  {
    question: "What happened to StumbleUpon?",
    answer:
      'StumbleUpon was a popular website discovery tool that launched in 2001 and let users "stumble" to random web pages based on their interests. It shut down on June 30, 2018, and migrated users to Mix.com, a social curation platform built by the same team. Mix never captured the same magic — most StumbleUpon users simply moved on.',
  },
  {
    question: "Why did StumbleUpon shut down?",
    answer:
      "StumbleUpon struggled to monetize its user base and compete with social media platforms like Facebook and Reddit for attention. Despite having over 30 million registered users, the company couldn't sustain its advertising model. The team pivoted to Mix.com in hopes of building a more viable business.",
  },
  {
    question: "What is the best StumbleUpon alternative in 2026?",
    answer:
      "Serendip Bot is the best StumbleUpon alternative for 2026. Unlike other alternatives that rely on user submissions or static directories, Serendip Bot uses AI agents to actively crawl the web and discover high-quality sites in real time based on your mood — no account required, completely free.",
  },
  {
    question: "Is there an app like StumbleUpon?",
    answer:
      "Serendip Bot works in any browser on any device — no app download needed. Just pick a mood (Wonder, Learn, Create, Laugh, or Chill) and start discovering websites instantly. It's the closest experience to the original StumbleUpon, rebuilt with modern AI technology.",
  },
  {
    question: "Is Mix.com the same as StumbleUpon?",
    answer:
      "Mix.com was created by the StumbleUpon team as a replacement, but it's a different product. Mix focuses on social curation (saving and sharing links) rather than the random discovery experience that made StumbleUpon special. Many former StumbleUpon users found Mix didn't scratch the same itch.",
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

function Check() {
  return <span className="text-green-600 font-bold">✓</span>;
}
function Cross() {
  return <span className="text-gray-300">✗</span>;
}

export default function StumbleUponAlternativesPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 pt-24 pb-12">
        <nav className="text-sm text-gray-400 mb-8">
          <Link href="/" className="hover:text-violet-600 transition-colors">
            Home
          </Link>
          {" / "}
          <span className="text-gray-600">StumbleUpon Alternatives</span>
        </nav>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-6">
          The Best StumbleUpon Alternatives in 2026
        </h1>
        <p className="text-xl text-gray-500 leading-relaxed max-w-3xl">
          StumbleUpon shut down in 2018, but the desire to discover random,
          fascinating websites never went away. Here&apos;s an honest comparison
          of every major StumbleUpon replacement still active in 2026 — and why
          we built Serendip Bot to fill the gap.
        </p>
      </section>

      {/* The Story */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-6">
          What Happened to StumbleUpon?
        </h2>
        <div className="prose prose-gray max-w-none space-y-4 text-gray-600 leading-relaxed">
          <p>
            StumbleUpon launched in 2001 with a simple, brilliant premise: click
            a button, get a random website matched to your interests. At its
            peak, it had over 30 million users and was one of the top traffic
            sources on the internet — bigger than most social networks for
            driving clicks to independent websites.
          </p>
          <p>
            But StumbleUpon struggled to build a sustainable business. Social
            media platforms captured more and more attention, and the company
            couldn&apos;t compete for ad dollars. On June 30, 2018, StumbleUpon
            officially shut down and migrated its users to{" "}
            <strong>Mix.com</strong>, a social curation platform built by the
            same team.
          </p>
          <p>
            Mix never recaptured the magic. The random, serendipitous discovery
            experience — the thing that made StumbleUpon special — was replaced
            by a curated social feed that felt more like Pinterest than the
            original stumbling experience. Most users simply left.
          </p>
          <p>
            Since then, a handful of alternatives have emerged. None of them use
            modern AI. None of them actively crawl the web to find new content.
            And none of them let you filter by mood. That&apos;s why we built{" "}
            <strong>Serendip Bot</strong>.
          </p>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="max-w-5xl mx-auto px-4 py-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
          StumbleUpon Alternatives Compared
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-900">
                  Service
                </th>
                <th className="text-center py-3 px-4 font-semibold text-gray-900">
                  Since
                </th>
                <th className="text-center py-3 px-4 font-semibold text-gray-900">
                  AI-Powered
                </th>
                <th className="text-center py-3 px-4 font-semibold text-gray-900">
                  Mood Filter
                </th>
                <th className="text-center py-3 px-4 font-semibold text-gray-900">
                  No Account
                </th>
                <th className="text-center py-3 px-4 font-semibold text-gray-900">
                  Open Source
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-900">
                  Approach
                </th>
              </tr>
            </thead>
            <tbody>
              {competitors.map((c) => (
                <tr
                  key={c.name}
                  className={`border-b border-gray-100 ${c.highlight ? "bg-violet-50/60" : ""}`}
                >
                  <td className="py-3 px-4 font-medium text-gray-900">
                    {c.highlight ? (
                      <Link
                        href={c.url}
                        className="text-violet-600 font-bold hover:underline"
                      >
                        {c.name} ★
                      </Link>
                    ) : (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-violet-600 transition-colors"
                      >
                        {c.name}
                      </a>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center text-gray-500">
                    {c.year}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {c.aiPowered ? <Check /> : <Cross />}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {c.moodFiltering ? <Check /> : <Cross />}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {!c.accountRequired ? <Check /> : <Cross />}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {c.openSource ? <Check /> : <Cross />}
                  </td>
                  <td className="py-3 px-4 text-gray-500">{c.approach}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Deep Dives */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-10">
          A Closer Look at Each Alternative
        </h2>

        <div className="space-y-12">
          <div>
            <h3 className="text-2xl font-bold text-violet-700 mb-3">
              1. Serendip Bot — The AI-Native StumbleUpon Replacement
            </h3>
            <p className="text-gray-600 leading-relaxed mb-3">
              Serendip Bot is the only StumbleUpon alternative built from
              scratch with AI at its core. Instead of relying on user
              submissions or static directories, it deploys AI agents that
              actively crawl the web in real time to find high-quality,
              interesting sites you&apos;d never find through Google.
            </p>
            <p className="text-gray-600 leading-relaxed mb-3">
              What makes it different: you choose a mood —{" "}
              <strong>Wonder</strong>, <strong>Learn</strong>,{" "}
              <strong>Create</strong>, <strong>Laugh</strong>, or{" "}
              <strong>Chill</strong> — and the AI tailors discoveries to match.
              Every site is quality-checked and evaluated for novelty, so
              you&apos;re not just getting popular links recycled from Reddit.
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-1 mb-3">
              <li>Free, no account required</li>
              <li>AI-curated in real time (not a static directory)</li>
              <li>Mood-based filtering — the only tool that offers this</li>
              <li>Open source — self-host it if you want</li>
              <li>
                Focused on the small web: indie blogs, creative projects,
                educational gems
              </li>
            </ul>
            <p className="text-gray-600 leading-relaxed">
              <strong>Best for:</strong> Anyone who misses StumbleUpon and wants
              a modern, AI-powered version that actively discovers new content
              rather than recycling old submissions.
            </p>
          </div>

          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">
              2. Mix.com — The Official StumbleUpon Successor
            </h3>
            <p className="text-gray-600 leading-relaxed mb-3">
              Mix.com was created by the StumbleUpon team as a direct
              replacement. It lets users save and share links organized by
              topic, with an algorithmic feed that surfaces popular content.
              Think of it as Pinterest for articles and websites.
            </p>
            <p className="text-gray-600 leading-relaxed mb-3">
              The problem: Mix is fundamentally a social curation tool, not a
              discovery engine. You need to create an account, and the content
              is driven by what other users submit and share — which means you
              mostly see the same popular content that surfaces everywhere else.
              The serendipity of StumbleUpon&apos;s random &quot;Stumble!&quot;
              button is gone.
            </p>
            <p className="text-gray-600 leading-relaxed">
              <strong>Best for:</strong> Users who want a link-saving and
              sharing tool with social features, rather than random discovery.
            </p>
          </div>

          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">
              3. Cloudhiker — A Hand-Curated Web Directory
            </h3>
            <p className="text-gray-600 leading-relaxed mb-3">
              Cloudhiker maintains a curated list of interesting websites
              organized by category. It has a clean interface and genuinely good
              taste — the sites it features tend to be high-quality indie
              projects and creative experiments.
            </p>
            <p className="text-gray-600 leading-relaxed mb-3">
              The limitation: it&apos;s a static directory that depends on
              manual curation. New sites are added infrequently, so you&apos;ll
              exhaust the collection fairly quickly. There&apos;s no
              personalization, no mood filtering, and no AI discovery.
            </p>
            <p className="text-gray-600 leading-relaxed">
              <strong>Best for:</strong> A quick browse when you want a handful
              of interesting sites, with no commitment.
            </p>
          </div>

          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">
              4. The Useless Web — Random Fun, But Not Discovery
            </h3>
            <p className="text-gray-600 leading-relaxed mb-3">
              The Useless Web has been around since 2008 and does one thing:
              sends you to a random novelty website. Click the button, get a
              random site. It&apos;s fun for about five minutes and has produced
              some genuinely viral moments.
            </p>
            <p className="text-gray-600 leading-relaxed mb-3">
              But it&apos;s not really a StumbleUpon alternative. The sites are
              almost exclusively joke/novelty pages, there&apos;s no interest
              matching, no quality filtering, and no way to find substantive
              content. It&apos;s entertainment, not discovery.
            </p>
            <p className="text-gray-600 leading-relaxed">
              <strong>Best for:</strong> Killing five minutes with weird, funny
              one-off websites.
            </p>
          </div>

          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">
              5. Marginalia Search — The Small Web Search Engine
            </h3>
            <p className="text-gray-600 leading-relaxed mb-3">
              Marginalia is an independent search engine that deliberately
              favors small, text-heavy websites over commercial ones. It&apos;s
              the philosophical opposite of Google — instead of ranking by
              popularity and ad spend, it boosts personal blogs, academic pages,
              and indie projects.
            </p>
            <p className="text-gray-600 leading-relaxed mb-3">
              It&apos;s excellent for what it does, but it&apos;s a search
              engine, not a discovery tool. You still need to know what to
              search for. There&apos;s a &quot;random&quot; button, but without
              mood filtering or AI curation, the results are hit-or-miss.
            </p>
            <p className="text-gray-600 leading-relaxed">
              <strong>Best for:</strong> Power users and developers who want to
              explore the small web through keyword search.
            </p>
          </div>
        </div>
      </section>

      {/* Why Serendip Bot */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-6">
          Why We Built Serendip Bot
        </h2>
        <div className="space-y-4 text-gray-600 leading-relaxed">
          <p>
            When StumbleUpon shut down, it left a hole in the internet. The web
            became dominated by a handful of platforms — Google, Reddit,
            YouTube, Twitter — and the vast majority of interesting websites
            became invisible. Small creators, indie projects, personal blogs,
            educational gems — all buried under the weight of algorithmic
            optimization.
          </p>
          <p>
            We built Serendip Bot because we believe the best parts of the
            internet are the parts you don&apos;t know about yet. Our AI
            doesn&apos;t rank by popularity or ad spend. It crawls the web
            looking for quality, novelty, and genuine interest — then matches
            what it finds to your mood.
          </p>
          <p>
            It&apos;s not a directory, not a social network, not a search
            engine. It&apos;s a stumbling engine — the spiritual successor to
            StumbleUpon, rebuilt for 2026 with AI that actually discovers new
            content instead of recycling the same links everyone has already
            seen.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-xl mx-auto px-4 py-16 text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Ready to Start Stumbling Again?
        </h2>
        <p className="text-gray-500 mb-8">
          Pick a mood. Let the AI do the rest. No account needed, completely
          free.
        </p>
        <HeroAction />
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-10">
          Frequently Asked Questions
        </h2>
        <dl className="space-y-6">
          {faqItems.map((item) => (
            <div key={item.question}>
              <dt className="text-lg font-semibold text-gray-900">
                {item.question}
              </dt>
              <dd className="mt-1 text-gray-500 leading-relaxed">
                {item.answer}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Footer nav */}
      <footer className="text-center py-8 text-xs text-gray-400 space-y-2">
        <p>
          <Link
            href="/"
            className="text-violet-500 hover:text-violet-600 transition-colors"
          >
            ← Back to Serendip Bot
          </Link>
        </p>
      </footer>
    </main>
  );
}
