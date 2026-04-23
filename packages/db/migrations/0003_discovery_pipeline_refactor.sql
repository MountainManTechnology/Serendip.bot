-- ADR-002 Phase 1: Discovery pipeline scaffolding
-- Extends site_cache, adds moods, blurb_cache, ingest_attempts tables.
-- Replaces IVFFlat index with HNSW on site_cache.embedding.
--
-- NOTE: The HNSW index (idx_site_cache_embed_hnsw) is created with a standard
-- CREATE INDEX (not CONCURRENTLY) for migration runner compatibility.
-- On a live production system with existing data, you may prefer to run the
-- index creation manually with CONCURRENTLY to avoid table locks.

-- ── Extend site_cache ────────────────────────────────────────────────────────
ALTER TABLE site_cache
  ADD COLUMN IF NOT EXISTS mood_affinities  jsonb        NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS language         text         NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS content_type     text         NOT NULL DEFAULT 'article',
  ADD COLUMN IF NOT EXISTS popularity       integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_shown_at    timestamptz,
  ADD COLUMN IF NOT EXISTS ingested_at      timestamptz  NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS rescore_at       timestamptz  NOT NULL DEFAULT (now() + interval '90 days'),
  ADD COLUMN IF NOT EXISTS status           text         NOT NULL DEFAULT 'ready';

-- ── moods ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS moods (
  id              text        PRIMARY KEY,
  display_name    text        NOT NULL,
  seed_prompt     text        NOT NULL,
  embedding       vector(1536) NOT NULL,
  category_priors jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── blurb_cache ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blurb_cache (
  site_cache_id uuid        NOT NULL REFERENCES site_cache(id) ON DELETE CASCADE,
  mood_id       text        NOT NULL REFERENCES moods(id),
  blurb         text        NOT NULL,
  model         text        NOT NULL,
  generated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_cache_id, mood_id)
);

-- ── ingest_attempts ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingest_attempts (
  url_hash      text        PRIMARY KEY,
  url           text        NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_try_at   timestamptz,
  attempts      integer     NOT NULL DEFAULT 0,
  status        text        NOT NULL DEFAULT 'pending',
  reject_reason text,
  source        text
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Drop old IVFFlat index
DROP INDEX IF EXISTS idx_site_cache_embedding;

-- HNSW vector index (better recall; pgvector >= 0.5.0 required)
CREATE INDEX IF NOT EXISTS idx_site_cache_embed_hnsw
  ON site_cache USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Fast filter for serving queries (status + quality)
CREATE INDEX IF NOT EXISTS idx_site_cache_quality_status
  ON site_cache (status, quality_score DESC)
  WHERE status = 'ready';

-- Session-staleness dampening
CREATE INDEX IF NOT EXISTS idx_site_cache_last_shown
  ON site_cache (last_shown_at NULLS FIRST);

-- Ingest queue draining
CREATE INDEX IF NOT EXISTS idx_ingest_attempts_status
  ON ingest_attempts (status)
  WHERE status = 'pending';

-- Blurb cache lookup
CREATE INDEX IF NOT EXISTS idx_blurb_cache_site
  ON blurb_cache (site_cache_id);
