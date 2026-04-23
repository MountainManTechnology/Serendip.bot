-- 0006_metrics_schema.sql
-- Telemetry Foundation — Phase 1
-- Three event tables + four materialized views.
-- page_events is partitioned by day (30-day rolling retention via Celery rotate_partitions task).
-- agent_task_events and llm_cost_events are retained indefinitely.

CREATE SCHEMA IF NOT EXISTS metrics;

-- ─── page_events — HTTP request events from Hono middleware ────────────────────
-- Partitioned by day; 30-day retention via daily Celery task.
CREATE TABLE metrics.page_events (
  id            BIGSERIAL,
  ts            TIMESTAMPTZ   NOT NULL,
  trace_id      TEXT,                         -- UUID from Hono middleware; links page → agent → llm events
  session_id    TEXT          NOT NULL,       -- sha256(ip + ua + daily_salt)[:16]
  user_id       TEXT,                         -- NULL for anonymous
  source        TEXT          NOT NULL DEFAULT 'api',  -- 'api' | 'web' | 'agent'
  worker_id     TEXT,                         -- HOSTNAME of the emitting container
  path          TEXT          NOT NULL,
  method        TEXT          NOT NULL,
  status        SMALLINT      NOT NULL,
  response_ms   INTEGER       NOT NULL,
  referrer_host TEXT,                         -- host only, not full URL
  country       TEXT,                         -- from x-azure-clientcountry header
  device_class  TEXT,                         -- mobile | desktop | tablet | bot
  app_version   TEXT,
  PRIMARY KEY (id, ts)
) PARTITION BY RANGE (ts);

CREATE INDEX ON metrics.page_events (ts DESC);
CREATE INDEX ON metrics.page_events (session_id, ts);
CREATE INDEX ON metrics.page_events (user_id, ts) WHERE user_id IS NOT NULL;
CREATE INDEX ON metrics.page_events (path, ts);
CREATE INDEX ON metrics.page_events (trace_id) WHERE trace_id IS NOT NULL;

-- Create initial 14-day set of daily partitions (today - 7 days through today + 7 days).
-- The Celery rotate_partitions task (runs daily at 01:00 UTC) keeps this rolling.
DO $$
DECLARE
  start_date DATE := CURRENT_DATE - INTERVAL '7 days';
  end_date   DATE := CURRENT_DATE + INTERVAL '7 days';
  d          DATE;
  tbl        TEXT;
BEGIN
  d := start_date;
  WHILE d <= end_date LOOP
    tbl := 'page_events_' || TO_CHAR(d, 'YYYY_MM_DD');
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'metrics' AND c.relname = tbl
    ) THEN
      EXECUTE format(
        'CREATE TABLE metrics.%I PARTITION OF metrics.page_events
         FOR VALUES FROM (%L) TO (%L)',
        tbl,
        d::TEXT,
        (d + INTERVAL '1 day')::TEXT
      );
    END IF;
    d := d + INTERVAL '1 day';
  END LOOP;
END
$$;

-- ─── agent_task_events — Celery task lifecycle events ──────────────────────────
-- Emitted via task_prerun / task_postrun / task_failure signals.
-- Retained indefinitely for ops analysis.
CREATE TABLE metrics.agent_task_events (
  id           BIGSERIAL     PRIMARY KEY,
  ts           TIMESTAMPTZ   NOT NULL,
  trace_id     TEXT,                          -- matches trace_id passed in Celery task kwargs
  worker_id    TEXT          NOT NULL,        -- socket.gethostname() of the worker container
  task_name    TEXT          NOT NULL,        -- e.g. 'agent.tasks.discover'
  queue        TEXT,                          -- 'discovery' | 'finalize'
  status       TEXT          NOT NULL,        -- 'started' | 'success' | 'failure'
  duration_ms  INTEGER,                       -- NULL for 'started' events
  retries      SMALLINT      NOT NULL DEFAULT 0,
  error_type   TEXT                           -- exception class name on failure
);

CREATE INDEX ON metrics.agent_task_events (ts DESC);
CREATE INDEX ON metrics.agent_task_events (worker_id, ts);
CREATE INDEX ON metrics.agent_task_events (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX ON metrics.agent_task_events (task_name, ts);

-- ─── llm_cost_events — LLM call cost events from providers/router.py ──────────
-- Emitted after every chat-completion and embedding call.
-- Retained indefinitely for unit-economics analysis.
-- user_id is included to support p95 cost-per-user queries (ADR-001: ≤$0.05–0.10/user/mo).
CREATE TABLE metrics.llm_cost_events (
  id                  BIGSERIAL       PRIMARY KEY,
  ts                  TIMESTAMPTZ     NOT NULL,
  trace_id            TEXT,                    -- matches trace_id from originating request
  worker_id           TEXT            NOT NULL,
  user_id             TEXT,                    -- NULL for anonymous; enables p95 cost-per-user
  task_type           TEXT            NOT NULL, -- 'QUALITY_EVAL' | 'CONTENT_SUMMARY' | 'WHY_BLURB' | 'PROFILE_MATCH' | 'NOVEL_TOPIC' | 'EMBEDDING'
  call_type           TEXT            NOT NULL, -- 'chat' | 'embedding' | 'moderation'
  model               TEXT            NOT NULL,
  provider            TEXT            NOT NULL, -- 'azure' | 'gemini' | 'claude' | 'ollama'
  prompt_tokens       INTEGER         NOT NULL,
  completion_tokens   INTEGER,                  -- NULL for embeddings
  estimated_cost_usd  NUMERIC(10,6)   NOT NULL DEFAULT 0
);

CREATE INDEX ON metrics.llm_cost_events (ts DESC);
CREATE INDEX ON metrics.llm_cost_events (worker_id, ts);
CREATE INDEX ON metrics.llm_cost_events (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX ON metrics.llm_cost_events (user_id, ts) WHERE user_id IS NOT NULL;

-- ─── Materialized view 1: current concurrent (refreshed every 60s) ─────────────
-- Beat task: refresh_current_concurrent, offset :07 to avoid thundering herd.
CREATE MATERIALIZED VIEW metrics.current_concurrent AS
SELECT
  COUNT(DISTINCT session_id)                                                AS concurrent_sessions,
  COUNT(DISTINCT session_id) FILTER (WHERE user_id IS NOT NULL)             AS concurrent_logged_in,
  COUNT(*)                                                                  AS requests_last_5m,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY response_ms)                 AS p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_ms)                 AS p95_ms,
  COUNT(*) FILTER (WHERE source = 'api')                                    AS api_requests_5m,
  COUNT(*) FILTER (WHERE source = 'web')                                    AS web_requests_5m,
  MAX(ts)                                                                   AS latest_event
FROM metrics.page_events
WHERE ts > NOW() - INTERVAL '5 minutes'
WITH NO DATA;

REFRESH MATERIALIZED VIEW metrics.current_concurrent;

-- ─── Materialized view 2: daily summary (refreshed every 5 min) ───────────────
-- Beat task: refresh_daily_summary, offset :02.
CREATE MATERIALIZED VIEW metrics.daily_summary AS
SELECT
  DATE(ts)                                                              AS day,
  COUNT(DISTINCT session_id)                                            AS daily_sessions,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)            AS daily_users,
  COUNT(*)                                                              AS total_requests,
  AVG(response_ms)                                                      AS avg_response_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_ms)             AS p95_response_ms,
  COUNT(*) FILTER (WHERE status >= 500)                                 AS errors_5xx,
  COUNT(DISTINCT country)                                               AS countries
FROM metrics.page_events
GROUP BY DATE(ts)
WITH NO DATA;

CREATE UNIQUE INDEX ON metrics.daily_summary (day);
REFRESH MATERIALIZED VIEW metrics.daily_summary;

-- ─── Materialized view 3: hourly per-path summary (7-day window) ──────────────
CREATE MATERIALIZED VIEW metrics.hourly_path_summary AS
SELECT
  DATE_TRUNC('hour', ts)                                                AS hour,
  path,
  COUNT(*)                                                              AS requests,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_ms)             AS p95_ms,
  COUNT(*) FILTER (WHERE status >= 500)                                 AS errors_5xx
FROM metrics.page_events
WHERE ts > NOW() - INTERVAL '7 days'
GROUP BY 1, 2
WITH NO DATA;

REFRESH MATERIALIZED VIEW metrics.hourly_path_summary;

-- ─── Materialized view 4: daily LLM cost by model (refreshed every 15 min) ────
-- Used by admin dashboard "Today's LLM spend" tile and 7-day cost table.
CREATE MATERIALIZED VIEW metrics.daily_llm_cost AS
SELECT
  DATE(ts)                                                              AS day,
  model,
  provider,
  call_type,
  COUNT(*)                                                              AS calls,
  SUM(prompt_tokens)                                                    AS total_prompt_tokens,
  SUM(COALESCE(completion_tokens, 0))                                   AS total_completion_tokens,
  SUM(estimated_cost_usd)                                               AS total_cost_usd,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)            AS users_charged
FROM metrics.llm_cost_events
GROUP BY DATE(ts), model, provider, call_type
WITH NO DATA;

CREATE UNIQUE INDEX ON metrics.daily_llm_cost (day, model, provider, call_type);
REFRESH MATERIALIZED VIEW metrics.daily_llm_cost;
