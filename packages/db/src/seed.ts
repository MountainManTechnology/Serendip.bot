/**
 * Development seed script — populates site_cache with test entries.
 * Run: npm run db:seed (from packages/db)
 */

import crypto from "node:crypto";
import { createDb } from "./index.js";
import { siteCache } from "./schema.js";

const DB_URL = process.env["DATABASE_URL"];
if (!DB_URL) throw new Error("DATABASE_URL is required");

const db = createDb(DB_URL);

const testSites = [
  {
    url: "https://waitbutwhy.com",
    title: "Wait But Why",
    description:
      "Long-form posts on big ideas, written with stick figures and genuine curiosity.",
    contentSummary:
      "Tim Urban writes deeply researched, illustrated essays on topics from procrastination to AI to the Fermi paradox. Known for making complex ideas accessible and entertaining.",
    qualityScore: 0.95,
    categories: ["philosophy", "science", "humor"],
  },
  {
    url: "https://www.nautil.us",
    title: "Nautilus",
    description:
      "Science connected to culture, philosophy, and the human experience.",
    contentSummary:
      "Nautilus publishes award-winning science journalism that connects scientific ideas to art, culture, and society. Features essays, interviews, and visual storytelling.",
    qualityScore: 0.92,
    categories: ["science", "culture", "philosophy"],
  },
  {
    url: "https://kottke.org",
    title: "kottke.org",
    description: "Home of fine hypertext products since 1998.",
    contentSummary:
      "One of the web's oldest blogs, Jason Kottke curates the best of the internet daily — art, science, culture, and everything in between.",
    qualityScore: 0.88,
    categories: ["culture", "design", "tech"],
  },
  {
    url: "https://aeon.co",
    title: "Aeon",
    description: "A magazine of ideas and culture.",
    contentSummary:
      "Aeon publishes essays, ideas, and videos on philosophy, science, psychology, and culture. Known for long-form, nuanced writing from academics and writers worldwide.",
    qualityScore: 0.93,
    categories: ["philosophy", "science", "culture"],
  },
  {
    url: "https://hackaday.com",
    title: "Hackaday",
    description: "Fresh hacks every day.",
    contentSummary:
      "Hackaday covers DIY electronics, hardware hacking, and maker culture. Showcases creative engineering projects from the global maker community.",
    qualityScore: 0.85,
    categories: ["tech", "design", "science"],
  },
  {
    url: "https://publicdomainreview.org",
    title: "The Public Domain Review",
    description: "Exploring the cultural commons.",
    contentSummary:
      "Essays and collections celebrating out-of-copyright works — art, literature, and historical curiosities now free for all. Beautifully curated.",
    qualityScore: 0.91,
    categories: ["history", "literature", "art"],
  },
  {
    url: "https://www.quantamagazine.org",
    title: "Quanta Magazine",
    description: "Illuminating mathematics and the physical and life sciences.",
    contentSummary:
      "Quanta covers breakthroughs in math, physics, biology, and computer science. Editorially independent journalism that makes frontier research accessible.",
    qualityScore: 0.96,
    categories: ["science", "math", "tech"],
  },
  {
    url: "https://gwern.net",
    title: "Gwern.net",
    description: "Gwern Branwen's long-form essays and research.",
    contentSummary:
      "Deep-dive essays on psychology, statistics, AI, technology, and self-experimentation. Exhaustively researched and rigorously cited.",
    qualityScore: 0.89,
    categories: ["science", "philosophy", "tech"],
  },
];

async function seed() {
  console.log("Seeding site_cache with test entries...");

  for (const site of testSites) {
    const urlHash = crypto.createHash("sha256").update(site.url).digest("hex");

    await db
      .insert(siteCache)
      .values({
        url: site.url,
        urlHash,
        title: site.title,
        description: site.description,
        contentSummary: site.contentSummary,
        qualityScore: site.qualityScore,
        categories: site.categories,
        extractedImages: [],
      })
      .onConflictDoNothing();

    console.log(`  ✓ ${site.url}`);
  }

  console.log(`Done. Seeded ${String(testSites.length)} entries.`);
  process.exit(0);
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
