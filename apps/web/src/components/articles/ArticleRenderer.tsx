import Image from "next/image";
import Link from "next/link";
import type { Article } from "@serendip-bot/types";
import { renderArticleRichText } from "@/lib/article-rich-text";

export function ArticleRenderer({ article }: { article: Article }) {
  const date = new Date(article.publishedAt + "T00:00:00Z");
  const formattedDate = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <article className="stumble-article">
      {/* Header */}
      <header>
        <div className="text-center text-5xl mb-2">{article.emoji}</div>
        <h1 className="font-sans font-bold text-4xl md:text-[2.25rem] leading-tight text-center mb-2">
          {article.title}
        </h1>
        {article.subtitle && (
          <p className="text-center text-lg text-stone-500 dark:text-stone-400 italic mb-6 leading-relaxed">
            {article.subtitle}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-6 text-sm text-stone-500 dark:text-stone-400 font-sans mb-8 pb-6">
          <span>{formattedDate}</span>
          <span>{article.readingTime}</span>
          <span>{article.sources.length} sources</span>
        </div>
      </header>

      {/* Hero Image */}
      <figure className="-mx-6 md:-mx-0 mb-8">
        <div className="relative w-full aspect-[16/9] max-h-[420px]">
          <Image
            src={article.heroImage.url}
            alt={article.heroImage.altText}
            fill
            className="object-cover rounded-lg"
            sizes="(max-width: 768px) 100vw, 720px"
            priority
          />
        </div>
        {(article.heroImage.caption || article.heroImage.credit) && (
          <figcaption className="font-sans text-xs text-stone-500 dark:text-stone-400 mt-2 leading-snug px-6 md:px-0">
            {article.heroImage.caption}
            {article.heroImage.credit && (
              <span className="opacity-70 italic">
                {" "}
                {article.heroImage.credit}
              </span>
            )}
          </figcaption>
        )}
      </figure>

      {/* Key Facts */}
      {article.keyFacts.length > 0 && (
        <div className="bg-green-50 dark:bg-green-950/30 border-l-4 border-green-300 dark:border-green-800 p-5 my-8 rounded-r-lg">
          <h3 className="font-sans text-sm uppercase tracking-wider text-green-800 dark:text-green-400 font-semibold mb-3">
            Key Facts
          </h3>
          <ul className="list-disc pl-5 space-y-2">
            {article.keyFacts.map((fact, i) => (
              <li key={i} className="text-stone-900 dark:text-stone-100">
                {renderArticleRichText(fact)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sections */}
      {article.sections.map((section, i) => (
        <section key={i} className="mt-10">
          <h2 className="font-sans text-2xl font-semibold mb-4">
            {section.heading}
          </h2>

          {/* Float-right image */}
          {section.image?.float === "right" && (
            <figure className="md:float-right md:w-[45%] md:ml-6 md:mb-4 mb-6">
              <div className="relative w-full aspect-[4/3]">
                <Image
                  src={section.image.url}
                  alt={section.image.altText}
                  fill
                  className="object-contain rounded-md bg-stone-100 dark:bg-stone-800"
                  sizes="(max-width: 768px) 100vw, 320px"
                />
              </div>
              {(section.image.caption || section.image.credit) && (
                <figcaption className="font-sans text-xs text-stone-500 dark:text-stone-400 mt-2 leading-snug">
                  {section.image.caption}
                  {section.image.credit && (
                    <span className="opacity-70 italic">
                      {" "}
                      {section.image.credit}
                    </span>
                  )}
                </figcaption>
              )}
            </figure>
          )}

          {section.paragraphs.map((p, j) => (
            <p key={j} className="mb-5 leading-relaxed">
              {renderArticleRichText(p)}
            </p>
          ))}

          {/* Block image (non-float) */}
          {section.image && section.image.float !== "right" && (
            <figure className="my-8">
              <div className="relative w-full aspect-[16/10] max-h-[380px]">
                <Image
                  src={section.image.url}
                  alt={section.image.altText}
                  fill
                  className="object-contain rounded-md bg-stone-100 dark:bg-stone-800"
                  sizes="(max-width: 768px) 100vw, 720px"
                />
              </div>
              {(section.image.caption || section.image.credit) && (
                <figcaption className="font-sans text-xs text-stone-500 dark:text-stone-400 mt-2 leading-snug">
                  {section.image.caption}
                  {section.image.credit && (
                    <span className="opacity-70 italic">
                      {" "}
                      {section.image.credit}
                    </span>
                  )}
                </figcaption>
              )}
            </figure>
          )}

          {/* Blockquote */}
          {section.blockquote && (
            <blockquote className="border-l-3 border-green-300 dark:border-green-800 my-6 py-3 px-5 text-stone-500 dark:text-stone-400 italic bg-stone-100 dark:bg-stone-800 rounded-r-md">
              <p>{section.blockquote.text}</p>
              {section.blockquote.cite && (
                <cite className="block not-italic text-sm mt-2 text-stone-500 dark:text-stone-400">
                  — {section.blockquote.cite}
                </cite>
              )}
            </blockquote>
          )}

          {/* Callout */}
          {section.callout && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border-l-3 border-amber-400 dark:border-amber-700 p-4 my-6 rounded-r-md text-[0.95rem]">
              <strong>{section.callout.label}</strong>{" "}
              <span>{renderArticleRichText(section.callout.text)}</span>
            </div>
          )}

          {/* Clear floats */}
          {section.image?.float === "right" && <div className="clear-both" />}
        </section>
      ))}

      {/* Sources */}
      {article.sources.length > 0 && (
        <footer className="mt-12 pt-8 border-t border-stone-200 dark:border-stone-700">
          <h2 className="font-sans text-sm uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-4">
            Sources
          </h2>
          <ol className="list-decimal pl-5 text-sm text-stone-500 dark:text-stone-400 space-y-1">
            {article.sources.map((source, i) => (
              <li key={i}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {source.title}
                </a>
              </li>
            ))}
          </ol>
        </footer>
      )}

      {/* Stumble Again CTA */}
      <div className="text-center mt-12 py-6 text-stone-500 dark:text-stone-400 font-sans text-sm">
        <span className="text-2xl block mb-2">🎲</span>
        Enjoyed this?{" "}
        <Link
          href="/discover"
          className="text-violet-600 dark:text-violet-400 font-medium hover:underline"
        >
          Discover something new
        </Link>
      </div>
    </article>
  );
}
