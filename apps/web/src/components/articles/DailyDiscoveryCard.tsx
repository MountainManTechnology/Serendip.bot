import Image from "next/image";
import Link from "next/link";
import type { ArticleListItem } from "@serendip-bot/types";
import { articleUrl } from "@/lib/articles";

export function DailyDiscoveryCard({
  article,
  className = "",
  imageSizes = "(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw",
}: {
  article: ArticleListItem;
  className?: string;
  imageSizes?: string;
}) {
  const formattedDate = new Date(
    article.publishedAt + "T00:00:00Z",
  ).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <Link
      href={articleUrl(article)}
      className={[
        "group bg-white dark:bg-deep-ink border border-mist dark:border-ink rounded-[14px] overflow-hidden flex flex-col shadow-card hover:shadow-card-hover motion-safe:hover:-translate-y-0.5 motion-safe:transition-all motion-safe:duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-brand motion-safe:active:scale-[0.98]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="relative w-full aspect-[16/10] bg-paper dark:bg-ink">
        <Image
          src={article.heroImage.url}
          alt={article.heroImage.altText}
          fill
          className="object-cover motion-safe:group-hover:scale-105 motion-safe:transition-transform motion-safe:duration-300"
          sizes={imageSizes}
        />
        <div className="absolute top-3 left-3 w-10 h-10 rounded-full bg-ivory/95 dark:bg-midnight/95 backdrop-blur-sm flex items-center justify-center text-xl shadow-[0_2px_8px_rgba(15,13,26,0.12)]">
          {article.emoji}
        </div>
      </div>

      <div className="p-5 flex flex-col gap-2 flex-1">
        <h3 className="font-sans font-bold text-[1.05rem] leading-snug text-midnight dark:text-ivory group-hover:text-violet-brand dark:group-hover:text-violet-light motion-safe:transition-colors line-clamp-2">
          {article.title}
        </h3>
        {article.subtitle && (
          <p className="font-serif text-[0.875rem] leading-relaxed text-ink/70 dark:text-smoke line-clamp-2">
            {article.subtitle}
          </p>
        )}
        <div className="mt-auto pt-3 flex items-center gap-3 font-mono text-[0.7rem] text-smoke dark:text-smoke/70">
          <span>{formattedDate}</span>
          <span
            className="w-1 h-1 rounded-full bg-smoke/40"
            aria-hidden="true"
          />
          <span>{article.readingTime}</span>
        </div>
      </div>
    </Link>
  );
}
