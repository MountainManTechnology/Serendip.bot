import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HeroAction } from "@/components/discovery/HeroAction";

const MOOD_DATA = {
  wonder: {
    emoji: "🔭",
    label: "Wonder",
    title: "Awe-Inspiring Websites to Blow Your Mind",
    metaTitle: "Wonder Mode — Discover Awe-Inspiring Websites",
    metaDescription:
      "Explore awe-inspiring, mind-expanding websites with Serendip Bot's Wonder mode. AI-curated discoveries featuring space, science, art, and the most fascinating corners of the internet.",
    heroText:
      'Wonder mode surfaces the most awe-inspiring corners of the internet — from interactive space visualizations to mind-bending optical illusions, deep-time explorations, and the kind of websites that make you sit back and say "wow."',
    whatYoullFind: [
      {
        title: "Interactive science visualizations",
        desc: "Explore the scale of the universe, watch evolution happen in real time, or dive into particle physics simulations.",
      },
      {
        title: "Space & astronomy",
        desc: "Live satellite trackers, Mars terrain explorers, and stunning astrophotography collections you won't find on Instagram.",
      },
      {
        title: "Mind-bending art & experiments",
        desc: "Generative art, WebGL demos, fractal explorers, and creative coding projects that push the boundaries of what a browser can do.",
      },
      {
        title: "Deep-time & big-picture thinking",
        desc: "Timelines of the universe, philosophical thought experiments, and sites that help you grasp the incomprehensible.",
      },
      {
        title: "Hidden museums & archives",
        desc: "Digitized collections from institutions you've never heard of — rare maps, historical photographs, forgotten scientific instruments.",
      },
      {
        title: "Nature & the natural world",
        desc: "Live ocean cameras, wildlife trackers, geological explorations, and the breathtaking diversity of life on Earth.",
      },
    ],
    pullQuote:
      "The best parts of the internet are the parts that remind you how extraordinary the world is.",
    relatedMoods: ["learn", "chill"] as const,
  },
  learn: {
    emoji: "📚",
    label: "Learn",
    title: "Fascinating Educational Websites & Deep Dives",
    metaTitle: "Learn Mode — Discover Educational Websites & Explainers",
    metaDescription:
      "Find fascinating educational websites, deep-dive explainers, and interactive learning tools with Serendip Bot's Learn mode. AI-curated knowledge from across the web.",
    heroText:
      'Learn mode finds the most fascinating educational content on the web — interactive explainers, university-quality lectures, niche wikis, and the kind of "I had no idea" rabbit holes that make you lose track of time in the best way.',
    whatYoullFind: [
      {
        title: "Interactive explainers & visualizations",
        desc: "Complex topics made intuitive through interactive diagrams, step-by-step animations, and explorable explanations.",
      },
      {
        title: "Niche wikis & knowledge bases",
        desc: "Deep-dive communities that have documented everything from medieval cooking techniques to quantum computing fundamentals.",
      },
      {
        title: "University lectures & courses",
        desc: "Hidden gems from MIT OpenCourseWare, Stanford online, and independent educators who teach better than most professors.",
      },
      {
        title: "Historical deep dives",
        desc: "Primary source archives, oral history projects, and meticulously researched timelines of events you never learned about in school.",
      },
      {
        title: "Science & research blogs",
        desc: "Working scientists sharing their research in plain language — from marine biology field notes to particle physics lab updates.",
      },
      {
        title: "Language & culture resources",
        desc: "Endangered language preservation projects, cultural archives, and tools for learning obscure skills from calligraphy to fermentation.",
      },
    ],
    pullQuote:
      "The internet has more free, high-quality education than any library in history. Most of it is invisible to Google.",
    relatedMoods: ["wonder", "create"] as const,
  },
  create: {
    emoji: "🎨",
    label: "Create",
    title: "Creative Tools, Inspiration & Maker Resources",
    metaTitle: "Create Mode — Discover Creative Tools & Inspiration",
    metaDescription:
      "Discover creative tools, artistic inspiration, and maker resources with Serendip Bot's Create mode. AI-curated finds for designers, developers, writers, and makers.",
    heroText:
      "Create mode surfaces tools, inspiration, and communities for makers of all kinds — from indie design tools and creative coding platforms to writing resources, music production experiments, and the kind of artistic projects that make you want to build something.",
    whatYoullFind: [
      {
        title: "Indie design & creative tools",
        desc: "Color palette generators, typography experiments, layout tools, and design resources from independent creators — not the same tools everyone already uses.",
      },
      {
        title: "Creative coding & generative art",
        desc: "p5.js sketches, shader experiments, algorithmic art platforms, and tutorials that turn code into visual poetry.",
      },
      {
        title: "Writing resources & communities",
        desc: "Indie writing tools, fiction workshops, poetry generators, and craft essays from working writers that'll change how you think about words.",
      },
      {
        title: "Music & sound experiments",
        desc: "Browser-based synthesizers, collaborative music tools, sound design resources, and audio visualizations that blur the line between music and art.",
      },
      {
        title: "Maker & DIY communities",
        desc: "Hardware projects, woodworking blogs, electronics tutorials, and communities of people building physical things in their garages.",
      },
      {
        title: "Open-source creative platforms",
        desc: "Free alternatives to expensive creative software, community-built tools, and platforms that put creators first.",
      },
    ],
    pullQuote:
      "The best creative tools are often built by one person in their spare time. We help you find them.",
    relatedMoods: ["wonder", "laugh"] as const,
  },
  laugh: {
    emoji: "😄",
    label: "Laugh",
    title: "Funny Websites, Internet Humor & Delightful Weirdness",
    metaTitle: "Laugh Mode — Discover Funny Websites & Internet Humor",
    metaDescription:
      "Find the funniest, weirdest, most delightful websites on the internet with Serendip Bot's Laugh mode. AI-curated humor from absurdist web art to clever interactive jokes.",
    heroText:
      "Laugh mode digs up the internet's best-kept humor secrets — from absurdist web experiments and clever interactive jokes to niche comedy blogs and the kind of delightful weirdness that makes the web worth browsing.",
    whatYoullFind: [
      {
        title: "Absurdist web experiments",
        desc: "Websites that exist purely to make you smile — interactive nonsense, surreal animations, and projects that defy explanation.",
      },
      {
        title: "Clever interactive humor",
        desc: "Websites where the humor is in the interaction — hidden Easter eggs, joke APIs, and sites that subvert your expectations in delightful ways.",
      },
      {
        title: "Niche comedy & satire",
        desc: "Independent humor writers, niche meme communities, and satirical projects that are too weird for mainstream social media.",
      },
      {
        title: "Internet culture archives",
        desc: "Collections of vintage web humor, meme archaeology, and lovingly preserved internet culture from the early days of the web.",
      },
      {
        title: "Whimsical games & toys",
        desc: "Browser-based games that prioritize fun over monetization — tiny puzzles, physics toys, and idle games made with love.",
      },
      {
        title: "Weird & wonderful one-pagers",
        desc: "Single-serving sites dedicated to one perfect joke, observation, or experience — the haiku of web humor.",
      },
    ],
    pullQuote:
      "The funniest things on the internet aren't on social media. They're hiding on their own weird little websites.",
    relatedMoods: ["chill", "wonder"] as const,
  },
  chill: {
    emoji: "☕",
    label: "Chill",
    title: "Calm Websites, Gentle Reads & Relaxing Web Experiences",
    metaTitle: "Chill Mode — Discover Calm & Relaxing Websites",
    metaDescription:
      "Discover calming websites, gentle reads, and relaxing web experiences with Serendip Bot's Chill mode. AI-curated peaceful corners of the internet for when you need to decompress.",
    heroText:
      "Chill mode finds the internet's quieter corners — ambient soundscapes, meditative visualizations, thoughtful personal blogs, and the kind of gentle web experiences that help you decompress without doomscrolling.",
    whatYoullFind: [
      {
        title: "Ambient soundscapes & music",
        desc: "Rain generators, lo-fi radio stations, nature sound mixers, and ambient music players designed to help you focus or relax.",
      },
      {
        title: "Meditative visualizations",
        desc: "Slow-moving generative art, ocean simulations, starfield viewers, and visual experiences designed to quiet your mind.",
      },
      {
        title: "Thoughtful personal blogs",
        desc: "Long-form writing from thoughtful people — essays on simplicity, reflections on nature, and the kind of slow content that rewards your attention.",
      },
      {
        title: "Digital gardens & wikis",
        desc: "Personal knowledge bases, interconnected note collections, and digital gardens where ideas grow organically over time.",
      },
      {
        title: "Nature & wildlife cameras",
        desc: "Live feeds from bird feeders, ocean floors, forest canopies, and remote landscapes — a window into the world's quieter moments.",
      },
      {
        title: "Minimalist tools & experiences",
        desc: "Beautifully simple web tools, single-purpose apps, and sites that do one thing well without demanding your attention.",
      },
    ],
    pullQuote:
      "Not everything on the internet needs to be loud. The calmest corners are often the most rewarding.",
    relatedMoods: ["wonder", "learn"] as const,
  },
} as const;

type MoodSlug = keyof typeof MOOD_DATA;

export function generateStaticParams() {
  return Object.keys(MOOD_DATA).map((mood) => ({ mood }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mood: string }>;
}): Promise<Metadata> {
  const { mood } = await params;
  const data = MOOD_DATA[mood as MoodSlug];
  if (!data) return {};
  return {
    title: data.metaTitle,
    description: data.metaDescription,
    alternates: { canonical: `/moods/${mood}` },
    openGraph: {
      title: `${data.metaTitle} · Serendip Bot`,
      description: data.metaDescription,
    },
  };
}

export default async function MoodPage({
  params,
}: {
  params: Promise<{ mood: string }>;
}) {
  const { mood: moodSlug } = await params;
  const data = MOOD_DATA[moodSlug as MoodSlug];
  if (!data) notFound();

  const relatedMoods = data.relatedMoods.map((m) => ({
    slug: m,
    ...MOOD_DATA[m],
  }));

  return (
    <main className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-50">
      {/* Breadcrumb */}
      <section className="max-w-4xl mx-auto px-4 pt-24 pb-12">
        <nav className="text-sm text-gray-400 mb-8">
          <Link href="/" className="hover:text-violet-600 transition-colors">
            Home
          </Link>
          {" / "}
          <span className="text-gray-600">{data.label} Mode</span>
        </nav>

        {/* Hero */}
        <div className="text-center space-y-4 mb-12">
          <div className="text-7xl">{data.emoji}</div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900">
            {data.title}
          </h1>
          <p className="text-xl text-gray-500 leading-relaxed max-w-3xl mx-auto">
            {data.heroText}
          </p>
        </div>

        {/* CTA */}
        <div className="flex justify-center">
          <HeroAction />
        </div>
      </section>

      {/* What You'll Find */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-10">
          What You&apos;ll Discover in {data.label} Mode
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          {data.whatYoullFind.map((item) => (
            <div
              key={item.title}
              className="p-5 rounded-xl bg-white/60 border border-gray-100"
            >
              <h3 className="font-semibold text-gray-900 mb-2">{item.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pull Quote */}
      <section className="max-w-2xl mx-auto px-4 py-12 text-center">
        <blockquote className="text-2xl font-medium text-gray-700 italic leading-relaxed">
          &ldquo;{data.pullQuote}&rdquo;
        </blockquote>
      </section>

      {/* How It Works */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-10">
          How {data.label} Mode Works
        </h2>
        <div className="grid md:grid-cols-3 gap-8 text-center">
          <div className="space-y-3">
            <div className="text-4xl">🎯</div>
            <h3 className="text-lg font-semibold text-gray-900">
              Select {data.label}
            </h3>
            <p className="text-gray-500">
              Choose the {data.label} mood from the homepage and hit
              &quot;Surprise Me.&quot;
            </p>
          </div>
          <div className="space-y-3">
            <div className="text-4xl">🤖</div>
            <h3 className="text-lg font-semibold text-gray-900">
              AI Crawls & Curates
            </h3>
            <p className="text-gray-500">
              Our AI agent searches the web in real time, filtering for sites
              that match the {data.label.toLowerCase()} vibe — quality-checked
              and novelty-scored.
            </p>
          </div>
          <div className="space-y-3">
            <div className="text-4xl">{data.emoji}</div>
            <h3 className="text-lg font-semibold text-gray-900">
              Explore Your Discoveries
            </h3>
            <p className="text-gray-500">
              Browse a curated feed of {data.label.toLowerCase()}-matched
              websites. Love or skip each one to help refine future discoveries.
            </p>
          </div>
        </div>
      </section>

      {/* Related Moods */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Explore Other Moods
        </h2>
        <div className="flex flex-wrap justify-center gap-4">
          {relatedMoods.map((rm) => (
            <Link
              key={rm.slug}
              href={`/moods/${rm.slug}`}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white border-2 border-gray-200 hover:border-violet-400 transition-all hover:scale-105 font-medium text-gray-700"
            >
              <span className="text-2xl">{rm.emoji}</span>
              <span>{rm.label}</span>
            </Link>
          ))}
          {Object.entries(MOOD_DATA)
            .filter(
              ([k]) =>
                k !== moodSlug &&
                !(data.relatedMoods as readonly string[]).includes(k),
            )
            .map(([k, v]) => (
              <Link
                key={k}
                href={`/moods/${k}`}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white border-2 border-gray-100 hover:border-violet-300 transition-all hover:scale-105 font-medium text-gray-500"
              >
                <span className="text-2xl">{v.emoji}</span>
                <span>{v.label}</span>
              </Link>
            ))}
        </div>
      </section>

      {/* Footer nav */}
      <footer className="text-center py-8 text-xs text-gray-400 space-y-3">
        <p>
          <Link
            href="/alternatives/stumbleupon"
            className="text-violet-500 hover:text-violet-600 transition-colors"
          >
            Best StumbleUpon Alternatives in 2026
          </Link>
        </p>
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
