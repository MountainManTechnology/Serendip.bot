# Database Schema

Full database schema for Serendip Bot, managed with [Drizzle ORM](https://orm.drizzle.team) and PostgreSQL + pgvector.

## Table of Contents

- [Overview](#overview)
- [Tables](#tables)
  - [sessions](#sessions)
  - [curiosity_profiles](#curiosity_profiles)
  - [site_cache](#site_cache)
  - [moods](#moods)
  - [blurb_cache](#blurb_cache)
  - [ingest_attempts](#ingest_attempts)
  - [discovery_sessions](#discovery_sessions)
  - [discoveries](#discoveries)
  - [feedback](#feedback)
  - [articles](#articles)
  - [rss_feeds](#rss_feeds)
- [Metrics Schema](#metrics-schema)
- [Indexes](#indexes)
- [Custom Types](#custom-types)
- [Migrations](#migrations)
- [Type Exports](#type-exports)

---

## Overview

The schema is defined in `packages/db/src/schema.ts` using Drizzle ORM's declarative API. PostgreSQL extensions used:

- **uuid-ossp** — Generates UUIDs via `uuid_generate_v4()`
- **pgvector** — Stores embedding vectors for similarity search

All tables use UUID primary keys. Timestamps use `TIMESTAMPTZ` (timezone-aware).

---

## Tables

### sessions

Tracks anonymous or authenticated browser sessions.

| Column           | Type        | Notes                               |
| ---------------- | ----------- | ----------------------------------- |
| `id`             | UUID        | PK, auto-generated                  |
| `user_id`        | UUID        | Nullable (NULL for anonymous users) |
| `created_at`     | TIMESTAMPTZ | Default: now                        |
| `expires_at`     | TIMESTAMPTZ | Nullable                            |
| `last_active_at` | TIMESTAMPTZ | Default: now                        |

### curiosity_profiles

Stores learned user preferences, updated by the feedback loop.

| Column          | Type         | Notes                                      |
| --------------- | ------------ | ------------------------------------------ |
| `id`            | UUID         | PK, auto-generated                         |
| `session_id`    | UUID         | FK → sessions                              |
| `user_id`       | UUID         | Nullable                                   |
| `topic_weights` | JSONB        | `{ "programming": 0.8, "art": -0.2, ... }` |
| `mood_history`  | JSONB        | Array of past mood selections              |
| `embedding`     | vector(1536) | For future semantic matching               |
| `updated_at`    | TIMESTAMPTZ  | Default: now                               |

**Topic weights** range from -1 to 1. Updated by feedback signals:

- `love` → +0.15
- `skip` → -0.05
- `block` → -0.30

### site_cache

Shared evaluation cache — every URL evaluated by the AI agent gets a row here.

| Column             | Type         | Notes                                                   |
| ------------------ | ------------ | ------------------------------------------------------- |
| `id`               | UUID         | PK, auto-generated                                      |
| `url`              | TEXT         | Unique, not null                                        |
| `url_hash`         | TEXT         | SHA256 hash, unique, not null                           |
| `title`            | TEXT         | Nullable                                                |
| `description`      | TEXT         | Nullable                                                |
| `content_summary`  | TEXT         | AI-extracted readable summary                           |
| `content_html`     | TEXT         | Readability-extracted HTML                              |
| `extracted_images` | JSONB        | `[{ url, altText }]`, default `[]`                      |
| `quality_score`    | REAL         | 0.0–1.0, set by LLM evaluation                          |
| `categories`       | JSONB        | `["programming", "creative"]`, default `[]`             |
| `mood_affinities`  | JSONB        | `{ "wonder": 0.8, "learn": 0.5 }`                       |
| `language`         | TEXT         | ISO code, default `'en'`                                |
| `content_type`     | TEXT         | `'article'` \| `'video'` \| etc., default `'article'`   |
| `popularity`       | INTEGER      | Serve count, default 0                                  |
| `love_count`       | INTEGER      | Total love signals, default 0                           |
| `skip_count`       | INTEGER      | Total skip signals, default 0                           |
| `block_count`      | INTEGER      | Total block signals, default 0                          |
| `last_shown_at`    | TIMESTAMPTZ  | Nullable                                                |
| `embedding`        | vector(1536) | Content embedding                                       |
| `evaluated_at`     | TIMESTAMPTZ  | Default: now                                            |
| `ingested_at`      | TIMESTAMPTZ  | Default: now                                            |
| `rescore_at`       | TIMESTAMPTZ  | Next scheduled re-evaluation (default: +90 days)        |
| `status`           | TEXT         | `'ready'` \| `'pending'` \| `'dead'`, default `'ready'` |

### moods

Configuration table for the 9 supported moods. Seeded at startup by the `seed_moods` Celery task.

| Column            | Type         | Notes                                      |
| ----------------- | ------------ | ------------------------------------------ |
| `id`              | TEXT         | PK, e.g., `'wonder'`, `'learn'`, `'chill'` |
| `display_name`    | TEXT         | Human-readable label, not null             |
| `seed_prompt`     | TEXT         | Prompt fragment used for LLM evaluation    |
| `embedding`       | vector(1536) | Mood concept embedding, not null           |
| `category_priors` | JSONB        | `{ "science": 0.8, "humor": 0.1, ... }`    |
| `updated_at`      | TIMESTAMPTZ  | Default: now                               |

Valid mood IDs: `wonder`, `learn`, `create`, `laugh`, `chill`, `explore`, `relax`, `inspire`, `challenge`

### blurb_cache

Pre-generated per-mood "why you'll love this" blurbs for site+mood pairs. Used when the pool serving path is active.

| Column          | Type        | Notes                           |
| --------------- | ----------- | ------------------------------- |
| `site_cache_id` | UUID        | PK (composite), FK → site_cache |
| `mood_id`       | TEXT        | PK (composite), FK → moods      |
| `blurb`         | TEXT        | Generated blurb text            |
| `model`         | TEXT        | Model that generated it         |
| `generated_at`  | TIMESTAMPTZ | Default: now                    |

### ingest_attempts

Tracks the URL ingestion pipeline — each URL that enters the system gets a row here.

| Column          | Type        | Notes                                                      |
| --------------- | ----------- | ---------------------------------------------------------- |
| `url_hash`      | TEXT        | PK (SHA256 of URL)                                         |
| `url`           | TEXT        | Not null                                                   |
| `first_seen_at` | TIMESTAMPTZ | Default: now                                               |
| `last_try_at`   | TIMESTAMPTZ | Nullable                                                   |
| `attempts`      | INTEGER     | Default 0                                                  |
| `status`        | TEXT        | `'pending'` \| `'done'` \| `'failed'` \| `'rejected'`      |
| `reject_reason` | TEXT        | Nullable — why URL was rejected (quality, blocklist, etc.) |
| `source`        | TEXT        | Nullable — where the URL came from (`'rss'`, `'snowball'`) |

### discovery_sessions

One row per "Surprise Me" click — tracks the lifecycle of a single discovery request.

| Column         | Type        | Notes                                               |
| -------------- | ----------- | --------------------------------------------------- |
| `id`           | UUID        | PK, auto-generated                                  |
| `session_id`   | UUID        | FK → sessions                                       |
| `mood`         | TEXT        | Nullable                                            |
| `topics`       | JSONB       | `string[]`, default `[]`                            |
| `status`       | TEXT        | `pending` \| `processing` \| `complete` \| `failed` |
| `requested_at` | TIMESTAMPTZ | Default: now                                        |
| `completed_at` | TIMESTAMPTZ | Nullable                                            |

### discoveries

Sites shown to a user in a specific discovery session.

| Column                 | Type        | Notes                               |
| ---------------------- | ----------- | ----------------------------------- |
| `id`                   | UUID        | PK, auto-generated                  |
| `discovery_session_id` | UUID        | FK → discovery_sessions             |
| `site_cache_id`        | UUID        | FK → site_cache                     |
| `why_blurb`            | TEXT        | AI-generated "why you'll love this" |
| `position`             | INTEGER     | Display order                       |
| `shown_at`             | TIMESTAMPTZ | Default: now                        |

### feedback

Records user reactions to discovered sites. One signal per (session, site) pair — enforced by unique index.

| Column          | Type        | Notes                                 |
| --------------- | ----------- | ------------------------------------- |
| `id`            | UUID        | PK, auto-generated                    |
| `session_id`    | UUID        | FK → sessions                         |
| `site_cache_id` | UUID        | FK → site_cache                       |
| `signal`        | TEXT        | `love` \| `skip` \| `block`, not null |
| `created_at`    | TIMESTAMPTZ | Default: now                          |

### articles

Published editorial articles for the site's content section.

| Column         | Type        | Notes                                                                             |
| -------------- | ----------- | --------------------------------------------------------------------------------- |
| `id`           | UUID        | PK, auto-generated                                                                |
| `slug`         | TEXT        | Unique, not null, lowercase with hyphens                                          |
| `title`        | TEXT        | Not null                                                                          |
| `subtitle`     | TEXT        | Nullable                                                                          |
| `emoji`        | TEXT        | Not null                                                                          |
| `published_at` | TIMESTAMP   | Not null                                                                          |
| `reading_time` | TEXT        | Not null (e.g., "5 min read")                                                     |
| `hero_image`   | JSONB       | `{ url, altText, caption?, credit? }`                                             |
| `key_facts`    | JSONB       | `string[]`                                                                        |
| `sections`     | JSONB       | Array of section objects with headings, paragraphs, images, blockquotes, callouts |
| `sources`      | JSONB       | `[{ title, url }]`                                                                |
| `status`       | TEXT        | `draft` \| `published`, default `published`                                       |
| `created_at`   | TIMESTAMPTZ | Default: now                                                                      |
| `updated_at`   | TIMESTAMPTZ | Default: now                                                                      |

### rss_feeds

Persistent registry of RSS feed URLs — populated via `POST /internal/feeds` and loaded by the hourly `refresh_seeds` task. Defined in raw SQL (not Drizzle).

| Column              | Type        | Notes                                                    |
| ------------------- | ----------- | -------------------------------------------------------- |
| `url_hash`          | TEXT        | PK (SHA256 of URL)                                       |
| `url`               | TEXT        | Not null, unique                                         |
| `category_hint`     | TEXT        | Default `'general'`                                      |
| `added_at`          | TIMESTAMPTZ | Default: now                                             |
| `last_harvested_at` | TIMESTAMPTZ | Nullable                                                 |
| `last_item_count`   | INTEGER     | Nullable                                                 |
| `status`            | TEXT        | `'active'` \| `'paused'` \| `'dead'`, default `'active'` |

---

## Metrics Schema

The `metrics` schema holds telemetry data for the admin dashboard. Populated by Celery telemetry tasks from the `metrics:events` Redis stream.

### metrics.page_events

HTTP request telemetry, partitioned by day with 30-day rolling retention. Partitions are created/dropped automatically by the `rotate_partitions` Celery Beat task.

Key columns: `ts`, `trace_id`, `session_id`, `path`, `method`, `status`, `response_ms`, `device_class`, `country`

### metrics.agent_task_events

Celery task execution events (started/success/failure). Retained indefinitely.

### metrics.llm_cost_events

LLM API cost tracking per task call. Retained indefinitely.

Materialized views refresh on a schedule via `agent.telemetry_tasks`: `current_concurrent`, `daily_summary`, `llm_cost_view`.

---

## Indexes

| Index                           | Table           | Column(s)                     | Type    |
| ------------------------------- | --------------- | ----------------------------- | ------- |
| `idx_site_cache_url_hash`       | site_cache      | `url_hash`                    | Unique  |
| `idx_discoveries_session`       | discoveries     | `discovery_session_id`        | B-tree  |
| `idx_feedback_session`          | feedback        | `session_id`                  | B-tree  |
| `idx_feedback_session_site`     | feedback        | `session_id`, `site_cache_id` | Unique  |
| `idx_articles_status_published` | articles        | `status`, `published_at`      | B-tree  |
| `idx_ingest_attempts_status`    | ingest_attempts | `status`                      | B-tree  |
| `idx_blurb_cache_site`          | blurb_cache     | `site_cache_id`               | B-tree  |
| `idx_rss_feeds_status`          | rss_feeds       | `status` (WHERE active)       | Partial |

An HNSW index on `site_cache.embedding` is created in `0003_discovery_pipeline_refactor.sql` directly (Drizzle doesn't support it declaratively).

---

## Custom Types

### vector(1536)

pgvector column type for storing embeddings. Defined as a Drizzle `customType`:

```typescript
const vector = (dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(",")}]`;
    },
    fromDriver(value: string): number[] {
      return value.slice(1, -1).split(",").map(Number);
    },
  });
```

Used in `curiosity_profiles.embedding` and `site_cache.embedding`.

---

## Migrations

Migrations are managed by Drizzle Kit and live in `packages/db/migrations/`. Some schema changes (e.g., `rss_feeds`, metrics partitioning) are in raw SQL files applied manually or by CI.

| File                                   | Description                                                                |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `0000_extensions_and_indexes.sql`      | Enables `uuid-ossp` and `vector` extensions                                |
| `0000_lucky_rocket_racer.sql`          | Creates initial tables (sessions, profiles, etc.)                          |
| `0002_salty_thunderbird.sql`           | Schema updates (articles, discovery_sessions)                              |
| `0003_discovery_pipeline_refactor.sql` | HNSW vector index, site_cache enhancements                                 |
| `0004_rss_feeds.sql`                   | Adds `rss_feeds` table (raw SQL)                                           |
| `0005_feedback_counts.sql`             | Adds feedback count columns to `site_cache`; unique constraint on feedback |
| `0006_metrics_schema.sql`              | Creates `metrics` schema with partitioned tables                           |

Configuration in `packages/db/drizzle.config.ts`. Run Drizzle-managed migrations with:

```bash
cd packages/db
npx drizzle-kit push
```

````

---

## Type Exports

The schema exports both select and insert types for each table:

```typescript
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert

export type SiteCache = typeof siteCache.$inferSelect
export type NewSiteCache = typeof siteCache.$inferInsert

// ... same pattern for all tables
````

These types are consumed by `apps/api` and shared via the `@serendip-bot/db` package.

---

## See Also

- [Architecture](Architecture.md) — System overview showing how the database fits in
- [API Reference](API-Reference.md) — Endpoints that read/write these tables
- [Python Agent](Python-Agent.md) — The agent that populates `site_cache` and `discoveries`
