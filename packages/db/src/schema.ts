import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  real,
  integer,
  customType,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── pgvector custom type ─────────────────────────────────────────────────────
// Drizzle doesn't have a built-in vector type; we use customType.
// In drizzle-orm >=0.45 customType returns a column builder factory directly.

const vector = (dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${String(dimensions)})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(",")}]`;
    },
    fromDriver(value: string): number[] {
      return value.slice(1, -1).split(",").map(Number);
    },
  });

// ─── sessions ─────────────────────────────────────────────────────────────────

export const sessions = pgTable("sessions", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  userId: uuid("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ─── curiosity_profiles ──────────────────────────────────────────────────────

export const curiosityProfiles = pgTable("curiosity_profiles", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  sessionId: uuid("session_id").references(() => sessions.id),
  userId: uuid("user_id"),
  topicWeights: jsonb("topic_weights")
    .$type<Record<string, number>>()
    .default({}),
  moodHistory: jsonb("mood_history")
    .$type<Array<Record<string, unknown>>>()
    .default([]),
  embedding: vector(1536)("embedding"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ─── site_cache ───────────────────────────────────────────────────────────────

export const siteCache = pgTable(
  "site_cache",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    url: text("url").unique().notNull(),
    urlHash: text("url_hash").unique().notNull(),
    title: text("title"),
    description: text("description"),
    contentSummary: text("content_summary"),
    contentHtml: text("content_html"),
    extractedImages: jsonb("extracted_images")
      .$type<Array<{ url: string; altText: string }>>()
      .default([]),
    qualityScore: real("quality_score"),
    categories: jsonb("categories").$type<string[]>().default([]),
    embedding: vector(1536)("embedding"),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    moodAffinities: jsonb("mood_affinities")
      .$type<Record<string, number>>()
      .default({})
      .notNull(),
    language: text("language").default("en").notNull(),
    contentType: text("content_type").default("article").notNull(),
    popularity: integer("popularity").default(0).notNull(),
    loveCount: integer("love_count").default(0).notNull(),
    skipCount: integer("skip_count").default(0).notNull(),
    blockCount: integer("block_count").default(0).notNull(),
    lastShownAt: timestamp("last_shown_at", { withTimezone: true }),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    rescoreAt: timestamp("rescore_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)),
    status: text("status").default("ready").notNull(),
  },
  (table) => [
    uniqueIndex("idx_site_cache_url_hash").on(table.urlHash),
    // Vector index created in migration SQL (HNSW — see 0003_discovery_pipeline_refactor.sql)
  ],
);

// ─── moods ────────────────────────────────────────────────────────────────────

export const moods = pgTable("moods", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  seedPrompt: text("seed_prompt").notNull(),
  embedding: vector(1536)("embedding").notNull(),
  categoryPriors: jsonb("category_priors")
    .$type<Record<string, number>>()
    .default({})
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ─── blurb_cache ─────────────────────────────────────────────────────────────

export const blurbCache = pgTable(
  "blurb_cache",
  {
    siteCacheId: uuid("site_cache_id")
      .notNull()
      .references(() => siteCache.id, { onDelete: "cascade" }),
    moodId: text("mood_id")
      .notNull()
      .references(() => moods.id),
    blurb: text("blurb").notNull(),
    model: text("model").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.siteCacheId, table.moodId] }),
    index("idx_blurb_cache_site").on(table.siteCacheId),
  ],
);

// ─── ingest_attempts ─────────────────────────────────────────────────────────

export const ingestAttempts = pgTable(
  "ingest_attempts",
  {
    urlHash: text("url_hash").primaryKey(),
    url: text("url").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastTryAt: timestamp("last_try_at", { withTimezone: true }),
    attempts: integer("attempts").default(0).notNull(),
    status: text("status").default("pending").notNull(),
    rejectReason: text("reject_reason"),
    source: text("source"),
  },
  (table) => [index("idx_ingest_attempts_status").on(table.status)],
);

// ─── discovery_sessions ───────────────────────────────────────────────────────

export const discoverySessions = pgTable("discovery_sessions", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  sessionId: uuid("session_id").references(() => sessions.id),
  mood: text("mood"),
  topics: jsonb("topics").$type<string[]>().default([]),
  status: text("status").default("pending").notNull(), // pending | processing | complete | failed
  requestedAt: timestamp("requested_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ─── discoveries ─────────────────────────────────────────────────────────────

export const discoveries = pgTable(
  "discoveries",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    discoverySessionId: uuid("discovery_session_id").references(
      () => discoverySessions.id,
    ),
    siteCacheId: uuid("site_cache_id").references(() => siteCache.id),
    whyBlurb: text("why_blurb"),
    position: integer("position"),
    shownAt: timestamp("shown_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("idx_discoveries_session").on(table.discoverySessionId)],
);

// ─── feedback ────────────────────────────────────────────────────────────────

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    sessionId: uuid("session_id").references(() => sessions.id),
    siteCacheId: uuid("site_cache_id").references(() => siteCache.id),
    signal: text("signal").notNull(), // love | skip | block
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_feedback_session").on(table.sessionId),
    uniqueIndex("idx_feedback_session_site").on(
      table.sessionId,
      table.siteCacheId,
    ),
  ],
);

// ─── articles ────────────────────────────────────────────────────────────────

export const articles = pgTable(
  "articles",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    slug: text("slug").unique().notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    emoji: text("emoji").notNull(),
    publishedAt: timestamp("published_at", { mode: "date" }).notNull(),
    readingTime: text("reading_time").notNull(),
    heroImage: jsonb("hero_image")
      .$type<{
        url: string;
        altText: string;
        caption?: string;
        credit?: string;
      }>()
      .notNull(),
    keyFacts: jsonb("key_facts").$type<string[]>().default([]).notNull(),
    sections: jsonb("sections")
      .$type<
        Array<{
          heading: string;
          paragraphs: string[];
          image?: {
            url: string;
            altText: string;
            caption?: string;
            credit?: string;
            float?: "right";
          };
          blockquote?: { text: string; cite?: string };
          callout?: { label: string; text: string };
        }>
      >()
      .default([])
      .notNull(),
    sources: jsonb("sources")
      .$type<Array<{ title: string; url: string }>>()
      .default([])
      .notNull(),
    status: text("status").default("published").notNull(), // draft | published
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_articles_status_published").on(table.status, table.publishedAt),
  ],
);

// ─── Type exports ────────────────────────────────────────────────────────────

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type CuriosityProfile = typeof curiosityProfiles.$inferSelect;
export type NewCuriosityProfile = typeof curiosityProfiles.$inferInsert;

export type SiteCache = typeof siteCache.$inferSelect;
export type NewSiteCache = typeof siteCache.$inferInsert;

export type DiscoverySession = typeof discoverySessions.$inferSelect;
export type NewDiscoverySession = typeof discoverySessions.$inferInsert;

export type Discovery = typeof discoveries.$inferSelect;
export type NewDiscovery = typeof discoveries.$inferInsert;

export type Feedback = typeof feedback.$inferSelect;
export type NewFeedback = typeof feedback.$inferInsert;

export type ArticleRecord = typeof articles.$inferSelect;
export type NewArticleRecord = typeof articles.$inferInsert;

export type Mood = typeof moods.$inferSelect;
export type NewMood = typeof moods.$inferInsert;

export type BlurbCache = typeof blurbCache.$inferSelect;
export type NewBlurbCache = typeof blurbCache.$inferInsert;

export type IngestAttempt = typeof ingestAttempts.$inferSelect;
export type NewIngestAttempt = typeof ingestAttempts.$inferInsert;

// ─── metrics schema — read-only TypeScript types ─────────────────────────────
// These tables are written exclusively by the Python agent (psycopg3 bulk INSERT).
// Drizzle is used only for read queries in the admin dashboard.
// Using pgTable with explicit schema reference via the { schema } option.

import { pgSchema, smallint, numeric } from "drizzle-orm/pg-core";

export const metricsSchema = pgSchema("metrics");

export const metricsPageEvents = metricsSchema.table("page_events", {
  id: integer("id").notNull(),
  ts: timestamp("ts", { withTimezone: true }).notNull(),
  traceId: text("trace_id"),
  sessionId: text("session_id").notNull(),
  userId: text("user_id"),
  source: text("source").notNull().default("api"),
  workerId: text("worker_id"),
  path: text("path").notNull(),
  method: text("method").notNull(),
  status: smallint("status").notNull(),
  responseMs: integer("response_ms").notNull(),
  referrerHost: text("referrer_host"),
  country: text("country"),
  deviceClass: text("device_class"),
  appVersion: text("app_version"),
});

export const metricsAgentTaskEvents = metricsSchema.table("agent_task_events", {
  id: integer("id").primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).notNull(),
  traceId: text("trace_id"),
  workerId: text("worker_id").notNull(),
  taskName: text("task_name").notNull(),
  queue: text("queue"),
  status: text("status").notNull(),
  durationMs: integer("duration_ms"),
  retries: smallint("retries").notNull().default(0),
  errorType: text("error_type"),
});

export const metricsLlmCostEvents = metricsSchema.table("llm_cost_events", {
  id: integer("id").primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).notNull(),
  traceId: text("trace_id"),
  workerId: text("worker_id").notNull(),
  userId: text("user_id"),
  taskType: text("task_type").notNull(),
  callType: text("call_type").notNull(),
  model: text("model").notNull(),
  provider: text("provider").notNull(),
  promptTokens: integer("prompt_tokens").notNull(),
  completionTokens: integer("completion_tokens"),
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 6 })
    .notNull()
    .default("0"),
});

// Materialized view types (read-only, no primary key needed for admin queries)
export const metricsDailySummary = metricsSchema.table("daily_summary", {
  day: timestamp("day", { withTimezone: false }),
  dailySessions: integer("daily_sessions"),
  dailyUsers: integer("daily_users"),
  totalRequests: integer("total_requests"),
  avgResponseMs: numeric("avg_response_ms"),
  p95ResponseMs: numeric("p95_response_ms"),
  errors5xx: integer("errors_5xx"),
  countries: integer("countries"),
});

export const metricsDailyLlmCost = metricsSchema.table("daily_llm_cost", {
  day: timestamp("day", { withTimezone: false }),
  model: text("model"),
  provider: text("provider"),
  callType: text("call_type"),
  calls: integer("calls"),
  totalPromptTokens: integer("total_prompt_tokens"),
  totalCompletionTokens: integer("total_completion_tokens"),
  totalCostUsd: numeric("total_cost_usd"),
  usersCharged: integer("users_charged"),
});
