-- Feedback count columns on site_cache for fast admin stats reads.
-- Also enforces one signal per (session, site) pair to support toggle logic.

ALTER TABLE site_cache
  ADD COLUMN IF NOT EXISTS love_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skip_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS block_count integer NOT NULL DEFAULT 0;

-- Backfill counts from existing feedback rows
UPDATE site_cache sc
SET
  love_count  = counts.love,
  skip_count  = counts.skip,
  block_count = counts.block
FROM (
  SELECT
    site_cache_id,
    COUNT(*) FILTER (WHERE signal = 'love')  AS love,
    COUNT(*) FILTER (WHERE signal = 'skip')  AS skip,
    COUNT(*) FILTER (WHERE signal = 'block') AS block
  FROM feedback
  GROUP BY site_cache_id
) AS counts
WHERE sc.id = counts.site_cache_id;

-- Deduplicate existing feedback rows (keep the latest per session+site pair)
-- before adding the unique constraint.
DELETE FROM feedback
WHERE id NOT IN (
  SELECT DISTINCT ON (session_id, site_cache_id) id
  FROM feedback
  ORDER BY session_id, site_cache_id, created_at DESC
);

-- Unique constraint: one signal per (session, site)
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_session_site
  ON feedback (session_id, site_cache_id);
