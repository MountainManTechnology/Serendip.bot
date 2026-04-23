import type { Metadata } from "next";
import Link from "next/link";
import { InArticleAdSlot } from "@/components/ads/InArticleAdSlot";
import { DisplayAdSlot } from "@/components/ads/DisplayAdSlot";
import { DailyDiscoveryCard } from "@/components/articles/DailyDiscoveryCard";
import { getArticles } from "@/lib/articles";

export const metadata: Metadata = {
  title: "Daily Discoveries",
  description:
    "A new fascinating deep-dive every day. Explore long-form articles about science, history, technology, culture, and the most surprising corners of the internet.",
  alternates: { canonical: "/daily" },
  openGraph: {
    title: "Daily Discoveries · Serendip Bot",
    description: "A new fascinating deep-dive every day.",
    url: "/daily",
  },
};

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1"));
  const data = await getArticles(page);

  return (
    <main className="min-h-screen bg-ivory dark:bg-midnight">
      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Header */}
        <header className="text-center mb-16">
          <p
            className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-gold mb-3"
            aria-hidden="true"
          >
            ✦ Daily · Fresh today
          </p>
          <h1 className="font-sans font-extrabold text-4xl md:text-5xl lg:text-6xl text-midnight dark:text-ivory tracking-[-0.03em] leading-[1.08] mb-4">
            Daily <span className="text-gold">Discoveries</span>
          </h1>
          <p className="font-serif italic text-lg text-ink/80 dark:text-smoke max-w-2xl mx-auto leading-relaxed">
            A new fascinating deep-dive every day — science, history,
            technology, culture, and the most surprising corners of the
            internet.
          </p>
        </header>

        {/* Articles Grid */}
        {data.articles.length === 0 ? (
          <div className="text-center py-20 flex flex-col items-center gap-4">
            <span className="text-5xl text-gold" aria-hidden="true">
              ✦
            </span>
            <p className="font-serif italic text-ink/70 dark:text-smoke">
              No discoveries yet. Check back soon — we publish a new deep-dive
              every day.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.articles.flatMap((article, i) => [
              <DailyDiscoveryCard key={article.slug} article={article} />,
              // Inject a full-width in-article ad after every 6th article
              ...(i > 0 && (i + 1) % 6 === 0
                ? [
                    <div
                      key={`ad-${i}`}
                      className="col-span-1 md:col-span-2 lg:col-span-3"
                    >
                      <InArticleAdSlot />
                    </div>,
                  ]
                : []),
            ])}
          </div>
        )}

        {/* Display ad between grid and pagination */}
        <div className="mt-12">
          <DisplayAdSlot />
        </div>

        {/* Pagination */}
        {data.totalPages > 1 && (
          <nav
            className="flex justify-center items-center gap-3 mt-16"
            aria-label="Pagination"
          >
            {page > 1 && (
              <Link
                href={`/daily?page=${page - 1}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-mist hover:border-smoke bg-transparent hover:bg-paper font-sans font-semibold text-sm tracking-[-0.01em] text-midnight dark:text-ivory dark:border-ink dark:hover:bg-deep-ink motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-brand"
              >
                <span aria-hidden="true">←</span> Newer
              </Link>
            )}
            <span className="font-mono text-xs text-smoke px-3">
              {page} / {data.totalPages}
            </span>
            {page < data.totalPages && (
              <Link
                href={`/daily?page=${page + 1}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-mist hover:border-smoke bg-transparent hover:bg-paper font-sans font-semibold text-sm tracking-[-0.01em] text-midnight dark:text-ivory dark:border-ink dark:hover:bg-deep-ink motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-brand"
              >
                Older <span aria-hidden="true">→</span>
              </Link>
            )}
          </nav>
        )}

        {/* Back to Home */}
        <div className="text-center mt-16">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 font-sans text-sm font-medium text-teal-dark hover:text-teal dark:text-teal dark:hover:text-teal-light motion-safe:transition-colors"
          >
            <span aria-hidden="true">←</span> Back to Serendip Bot
          </Link>
        </div>
      </div>
    </main>
  );
}
