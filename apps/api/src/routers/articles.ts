import { Hono } from "hono";
import { z } from "zod";
import { articles } from "@serendip-bot/db";
import { eq, desc, and, sql } from "@serendip-bot/db";
import { db } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { requirePublishKey } from "../lib/auth.js";
import { processArticleImages } from "../services/image.service.js";
import { isSafePublicFetchUrl, isSafePublicUrl } from "../lib/url-safety.js";

// ─── Zod Schemas ───────────────────────────────────────────────────────────

const articleImageUrlSchema = z
  .string()
  .url()
  .refine((value) => isSafePublicUrl(value, { requireHttps: true }), {
    message: "Must be a public HTTPS URL",
  });

const sourceUrlSchema = z
  .string()
  .url()
  .refine((value) => isSafePublicUrl(value), {
    message: "Must be a public http(s) URL",
  });

const articleImageSchema = z.object({
  url: articleImageUrlSchema,
  altText: z.string(),
  caption: z.string().optional(),
  credit: z.string().optional(),
});

const articleSectionSchema = z.object({
  heading: z.string(),
  paragraphs: z.array(z.string()),
  image: articleImageSchema
    .extend({ float: z.enum(["right"]).optional() })
    .optional(),
  blockquote: z
    .object({ text: z.string(), cite: z.string().optional() })
    .optional(),
  callout: z.object({ label: z.string(), text: z.string() }).optional(),
});

const publishArticleSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase alphanumeric with hyphens",
    ),
  title: z.string().min(1).max(500),
  subtitle: z.string().max(500).optional(),
  emoji: z.string().min(1).max(10),
  publishedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format"),
  readingTime: z.string().min(1).max(50),
  heroImage: articleImageSchema,
  keyFacts: z.array(z.string()).min(1).max(20),
  sections: z.array(articleSectionSchema).min(1).max(50),
  sources: z
    .array(z.object({ title: z.string(), url: sourceUrlSchema }))
    .max(30),
});

type ArticleInsert = typeof articles.$inferInsert;

function pushFieldError(
  errors: Record<string, string[]>,
  field: string,
  message: string,
): void {
  errors[field] ??= [];
  errors[field].push(message);
}

async function validateFetchableArticleImages(
  data: z.infer<typeof publishArticleSchema>,
): Promise<Record<string, string[]>> {
  const errors: Record<string, string[]> = {};

  const imageChecks: Array<Promise<void>> = [
    (async () => {
      if (
        !(await isSafePublicFetchUrl(data.heroImage.url, {
          requireHttps: true,
        }))
      ) {
        pushFieldError(
          errors,
          "heroImage.url",
          "Image URL must resolve to a public HTTPS host",
        );
      }
    })(),
  ];

  data.sections.forEach((section, index) => {
    if (!section.image) return;
    imageChecks.push(
      (async () => {
        if (
          !(await isSafePublicFetchUrl(section.image!.url, {
            requireHttps: true,
          }))
        ) {
          pushFieldError(
            errors,
            `sections.${index}.image.url`,
            "Image URL must resolve to a public HTTPS host",
          );
        }
      })(),
    );
  });

  await Promise.all(imageChecks);
  return errors;
}

// ─── Routes ────────────────────────────────────────────────────────────────

export const articlesRouter = new Hono();

// POST /api/articles/publish — authenticated, accepts Article JSON
articlesRouter.post("/publish", requirePublishKey, async (c) => {
  const body = await c.req.json();
  const parsed = publishArticleSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      },
      400,
    );
  }

  const data = parsed.data;
  const urlErrors = await validateFetchableArticleImages(data);
  if (Object.keys(urlErrors).length > 0) {
    return c.json({ error: "Validation failed", details: urlErrors }, 400);
  }

  // Process images (download to Azure Blob if configured)
  // Strip undefined keys to satisfy exactOptionalPropertyTypes
  const heroImg: Record<string, string> = {
    url: data.heroImage.url,
    altText: data.heroImage.altText,
  };
  if (data.heroImage.caption) heroImg["caption"] = data.heroImage.caption;
  if (data.heroImage.credit) heroImg["credit"] = data.heroImage.credit;

  const cleanSections = data.sections.map((s) => {
    const section: Record<string, unknown> = {
      heading: s.heading,
      paragraphs: s.paragraphs,
    };
    if (s.image) {
      const img: Record<string, string> = {
        url: s.image.url,
        altText: s.image.altText,
      };
      if (s.image.caption) img["caption"] = s.image.caption;
      if (s.image.credit) img["credit"] = s.image.credit;
      if (s.image.float) img["float"] = s.image.float;
      section["image"] = img;
    }
    if (s.blockquote) {
      const bq: Record<string, string> = { text: s.blockquote.text };
      if (s.blockquote.cite) bq["cite"] = s.blockquote.cite;
      section["blockquote"] = bq;
    }
    if (s.callout) {
      section["callout"] = { label: s.callout.label, text: s.callout.text };
    }
    return section;
  });

  type ImageServiceInput = Parameters<typeof processArticleImages>[0];
  const processed = await processArticleImages({
    slug: data.slug,
    heroImage: heroImg as ImageServiceInput["heroImage"],
    sections: cleanSections as ImageServiceInput["sections"],
  });

  const publishedAt = new Date(data.publishedAt + "T00:00:00Z");

  // Build the row — cast to satisfy exactOptionalPropertyTypes
  const row: ArticleInsert = {
    slug: data.slug,
    title: data.title,
    subtitle: data.subtitle ?? null,
    emoji: data.emoji,
    publishedAt,
    readingTime: data.readingTime,
    heroImage: processed.heroImage as ArticleInsert["heroImage"],
    keyFacts: data.keyFacts,
    sections: processed.sections as ArticleInsert["sections"],
    sources: data.sources,
    status: "published",
    updatedAt: new Date(),
  };

  // Upsert: insert or update on slug conflict
  const results = await db
    .insert(articles)
    .values(row)
    .onConflictDoUpdate({
      target: articles.slug,
      set: {
        title: row.title,
        subtitle: row.subtitle,
        emoji: row.emoji,
        publishedAt: row.publishedAt,
        readingTime: row.readingTime,
        heroImage: row.heroImage,
        keyFacts: row.keyFacts,
        sections: row.sections,
        sources: row.sources,
        status: "published",
        updatedAt: new Date(),
      },
    })
    .returning({ id: articles.id, slug: articles.slug });

  const result = results[0];
  if (!result) {
    return c.json({ error: "Failed to insert article" }, 500);
  }

  logger.info({ slug: data.slug, id: result.id }, "article published");

  const year = publishedAt.getUTCFullYear();
  const month = String(publishedAt.getUTCMonth() + 1).padStart(2, "0");

  return c.json({
    success: true,
    slug: result.slug,
    url: `/articles/${year}/${month}/${result.slug}`,
  });
});

// GET /api/articles — public, paginated list
articlesRouter.get("/", async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? "1"));
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? "20")));
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      slug: articles.slug,
      title: articles.title,
      subtitle: articles.subtitle,
      emoji: articles.emoji,
      publishedAt: articles.publishedAt,
      readingTime: articles.readingTime,
      heroImage: articles.heroImage,
    })
    .from(articles)
    .where(eq(articles.status, "published"))
    .orderBy(desc(articles.publishedAt))
    .limit(limit)
    .offset(offset);

  const countRows = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(articles)
    .where(eq(articles.status, "published"));

  const total = countRows[0]?.count ?? 0;

  return c.json({
    articles: rows.map((r) => ({
      ...r,
      publishedAt: r.publishedAt.toISOString().split("T")[0],
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

// GET /api/articles/slugs — public, all published slugs (for sitemap)
// NOTE: Must be before /:year/:month/:slug to avoid route conflict
articlesRouter.get("/slugs", async (c) => {
  const rows = await db
    .select({
      slug: articles.slug,
      publishedAt: articles.publishedAt,
    })
    .from(articles)
    .where(eq(articles.status, "published"))
    .orderBy(desc(articles.publishedAt));

  return c.json(
    rows.map((r) => ({
      slug: r.slug,
      publishedAt: r.publishedAt.toISOString().split("T")[0],
    })),
  );
});

// GET /api/articles/:year/:month/:slug — public, single article
articlesRouter.get("/:year/:month/:slug", async (c) => {
  const { slug } = c.req.param();

  const rows = await db
    .select()
    .from(articles)
    .where(and(eq(articles.slug, slug), eq(articles.status, "published")))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return c.json({ error: "Article not found" }, 404);
  }

  // Verify year/month match the actual published date
  const year = row.publishedAt.getUTCFullYear().toString();
  const month = String(row.publishedAt.getUTCMonth() + 1).padStart(2, "0");
  if (c.req.param("year") !== year || c.req.param("month") !== month) {
    return c.json({ error: "Article not found" }, 404);
  }

  return c.json({
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    emoji: row.emoji,
    publishedAt: row.publishedAt.toISOString().split("T")[0],
    readingTime: row.readingTime,
    heroImage: row.heroImage,
    keyFacts: row.keyFacts,
    sections: row.sections,
    sources: row.sources,
  });
});
