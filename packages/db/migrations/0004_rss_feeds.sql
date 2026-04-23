-- RSS feed registry — persistent store for dynamically discovered feed URLs.
-- Feeds are submitted via POST /internal/feeds and loaded by the hourly
-- refresh_seeds task alongside the hardcoded fallback list.

CREATE TABLE IF NOT EXISTS rss_feeds (
    url_hash            text        PRIMARY KEY,
    url                 text        NOT NULL UNIQUE,
    category_hint       text        NOT NULL DEFAULT 'general',
    added_at            timestamptz NOT NULL DEFAULT now(),
    last_harvested_at   timestamptz,
    last_item_count     integer,
    status              text        NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'dead'))
);

CREATE INDEX IF NOT EXISTS idx_rss_feeds_status
    ON rss_feeds (status)
    WHERE status = 'active';
