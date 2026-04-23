import type { MetadataRoute } from "next";
import { fetchContentApiJson } from "@/lib/content-api";

const MOODS = ["wonder", "learn", "create", "laugh", "chill"] as const;

async function getArticleSlugs(): Promise<
  Array<{ slug: string; publishedAt: string }>
> {
  const articleSlugs = await fetchContentApiJson<
    Array<{ slug: string; publishedAt: string }>
  >("/api/articles/slugs", { next: { revalidate: 3600 } });
  return articleSlugs ?? [];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://serendipbot.com";
  const now = new Date();

  const articleSlugs = await getArticleSlugs();

  return [
    { url: base, changeFrequency: "weekly", priority: 1.0, lastModified: now },
    {
      url: `${base}/discover`,
      changeFrequency: "weekly",
      priority: 0.8,
      lastModified: now,
    },
    {
      url: `${base}/daily`,
      changeFrequency: "daily",
      priority: 0.9,
      lastModified: now,
    },
    {
      url: `${base}/alternatives/stumbleupon`,
      changeFrequency: "monthly",
      priority: 0.9,
      lastModified: now,
    },
    ...MOODS.map((m) => ({
      url: `${base}/moods/${m}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      lastModified: now,
    })),
    ...articleSlugs.map((a) => {
      const date = new Date(a.publishedAt + "T00:00:00Z");
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      return {
        url: `${base}/articles/${year}/${month}/${a.slug}`,
        changeFrequency: "monthly" as const,
        priority: 0.7,
        lastModified: date,
      };
    }),
  ];
}
