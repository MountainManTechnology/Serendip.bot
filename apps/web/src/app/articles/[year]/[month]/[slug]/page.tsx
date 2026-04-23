import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Article } from "@serendip-bot/types";
import { ArticleRenderer } from "@/components/articles/ArticleRenderer";
import { fetchContentApiJson } from "@/lib/content-api";

async function getArticle(
  year: string,
  month: string,
  slug: string,
): Promise<Article | null> {
  return fetchContentApiJson<Article>(
    `/api/articles/${year}/${month}/${slug}`,
    {
      next: { revalidate: 3600 },
    },
  );
}

interface PageProps {
  params: Promise<{ year: string; month: string; slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { year, month, slug } = await params;
  const article = await getArticle(year, month, slug);
  if (!article) return { title: "Article Not Found" };

  const SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://serendipbot.com";
  const url = `${SITE_URL}/articles/${year}/${month}/${slug}`;

  return {
    title: article.title,
    description:
      article.subtitle ??
      `${article.title} — a daily discovery from Serendip Bot.`,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: article.title,
      description: article.subtitle ?? article.title,
      publishedTime: `${article.publishedAt}T00:00:00Z`,
      images: [{ url: article.heroImage.url, alt: article.heroImage.altText }],
      siteName: "Serendip Bot",
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.subtitle ?? article.title,
      images: [article.heroImage.url],
    },
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const { year, month, slug } = await params;
  const article = await getArticle(year, month, slug);
  if (!article) notFound();

  const SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://serendipbot.com";
  const url = `${SITE_URL}/articles/${year}/${month}/${slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.subtitle,
    datePublished: `${article.publishedAt}T00:00:00Z`,
    image: article.heroImage.url,
    url,
    author: { "@type": "Organization", name: "Serendip Bot", url: SITE_URL },
    publisher: { "@type": "Organization", name: "Serendip Bot", url: SITE_URL },
  };

  return (
    <main className="min-h-screen bg-stone-50 dark:bg-[#1a1a1a] text-stone-900 dark:text-stone-200">
      <div
        className="max-w-[720px] mx-auto px-6 py-8"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <nav className="mb-8 font-sans text-sm">
          <a
            href="/daily"
            className="text-violet-600 dark:text-violet-400 hover:underline"
          >
            ← Daily Discoveries
          </a>
        </nav>
        <ArticleRenderer article={article} />
      </div>
    </main>
  );
}
