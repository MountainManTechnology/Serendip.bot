# Python Agent

The Python AI agent (`services/agent`) is the core discovery engine. It crawls the web, evaluates content via LLM providers, persists results, and runs scheduled maintenance tasks.

## Table of Contents

- [Overview](#overview)
- [Service Architecture](#service-architecture)
  - [agent-api (FastAPI)](#agent-api-fastapi)
  - [agent-worker (Celery)](#agent-worker-celery)
  - [agent-beat (Celery Beat)](#agent-beat-celery-beat)
- [Celery Task Catalog](#celery-task-catalog)
- [Discovery Agent](#discovery-agent)
  - [Pipeline Steps](#pipeline-steps)
  - [Candidate Selection](#candidate-selection)
  - [Mood-Category Mapping](#mood-category-mapping)
- [Crawler](#crawler)
  - [Safety Features](#safety-features)
  - [Content Extraction](#content-extraction)
  - [Configuration](#configuration)
- [Seed System](#seed-system)
  - [RSS Feeds](#rss-feeds)
  - [Seed Snowball](#seed-snowball)
  - [Domain Blocklist](#domain-blocklist)
- [Telemetry Tasks](#telemetry-tasks)

---

## Overview

The agent is a standalone Python 3.11+ service composed of three container roles:

| Container      | Dockerfile        | Purpose                                 |
| -------------- | ----------------- | --------------------------------------- |
| `agent-api`    | Dockerfile.api    | FastAPI HTTP shim — only public surface |
| `agent-worker` | Dockerfile.worker | Celery workers (scalable)               |
| `agent-beat`   | Dockerfile.beat   | Celery Beat scheduler (singleton)       |

Key source files:

| File                       | Purpose                                  |
| -------------------------- | ---------------------------------------- |
| `agent/api.py`             | FastAPI shim endpoints                   |
| `agent/tasks.py`           | Celery task definitions                  |
| `agent/celery_app.py`      | Celery app + queue topology              |
| `agent/telemetry_tasks.py` | Telemetry/metrics tasks                  |
| `agent/discovery_agent.py` | Core discovery orchestration             |
| `agent/crawler.py`         | Async web crawler                        |
| `agent/config.py`          | Pydantic settings                        |
| `agent/db.py`              | Database operations                      |
| `agent/url_safety.py`      | SSRF protection                          |
| `agent/providers/`         | LLM provider implementations             |
| `agent/seeds/`             | YAML seed URL catalogs                   |
| `worker.py`                | Legacy BullMQ worker (unused in compose) |

---

## Service Architecture

### agent-api (FastAPI)

Source: `services/agent/agent/api.py`

The only HTTP-facing component of the agent. Listens on port 8001 and is called by the Node API using `INTERNAL_API_TOKEN` for authentication.

Endpoints:

| Method | Path                  | Description                                                                   |
| ------ | --------------------- | ----------------------------------------------------------------------------- |
| POST   | `/internal/discover`  | Enqueue a Celery `discover` task                                              |
| GET    | `/internal/job/{id}`  | Get job status from Redis cache                                               |
| POST   | `/internal/feeds`     | Submit RSS feed URLs to `rss_feeds`                                           |
| GET    | `/healthz`            | Health check                                                                  |
| GET    | `/readyz`             | Broker connectivity probe (checks Redis/Celery)                               |
| POST   | `/internal/bootstrap` | Idempotent bootstrapping: seed_moods, refresh_seeds, backfill_mood_affinities |

| GET | `/readyz` | Broker readiness probe (checks Celery broker)
| POST | `/internal/bootstrap` | Trigger idempotent bootstrapping tasks: `seed_moods`, `refresh_seeds`, `backfill_mood_affinities` |

Valid moods: `wonder`, `learn`, `create`, `laugh`, `chill`, `explore`, `relax`, `inspire`, `challenge`

### agent-worker (Celery)

Workers consume the `discovery` and `finalize` queues from Redis DB 1. Scale horizontally:

```bash
docker compose up --scale agent-worker=4
```

Default configuration: 4 concurrent tasks per worker, `acks_late=True` for reliability.

### agent-beat (Celery Beat)

Singleton scheduler — do **not** scale past 1 instance. Triggers periodic tasks on their configured schedules (see [Celery Task Catalog](#celery-task-catalog)).

---

## Celery Task Catalog

Source: `agent/tasks.py`, `agent/telemetry_tasks.py`

| Task                                          | Queue     | Schedule        | Description                                                                                |
| --------------------------------------------- | --------- | --------------- | ------------------------------------------------------------------------------------------ |
| `agent.tasks.discover`                        | discovery | On-demand       | Core discovery pipeline for one job                                                        |
| `agent.tasks.refresh_seeds`                   | discovery | Hourly          | Load `rss_feeds` into Redis seed sets                                                      |
| `agent.tasks.ingest_batch`                    | discovery | Every 5 min     | Crawl + evaluate pending `ingest_attempts`                                                 |
| `agent.tasks.rescore_stale`                   | discovery | Daily           | Re-evaluate `site_cache` rows past `rescore_at`                                            |
| `agent.tasks.purge_stale_cache`               | finalize  | Daily           | Mark dead/expired entries in `site_cache`                                                  |
| `agent.tasks.decay_popularity`                | finalize  | Daily           | Apply time-decay to `site_cache.popularity`                                                |
| `agent.tasks.backfill_mood_affinities`        | finalize  | On-demand       | Backfill `mood_affinities` on existing rows                                                |
| `agent.tasks.seed_moods`                      | finalize  | On-demand       | Seed the `moods` table from config                                                         |
| `agent.tasks.retune_moods`                    | finalize  | Weekly          | Recompute `moods.category_priors` from feedback                                            |
| `agent.tasks.prewarm_blurbs`                  | finalize  | Every 30 min    | Pre-generate `why_blurb` entries for high-quality sites to reduce latency during discovery |
| `agent.tasks.process_image_site`              | finalize  | On-demand       | Image mirroring / OCR / follow-up processing for discovered images                         |
| `agent.telemetry_tasks.drain_telemetry_queue` | finalize  | Every 5s        | Drain `metrics:events` Redis stream to Postgres                                            |
| `agent.telemetry_tasks.worker_heartbeat`      | finalize  | Every 15s       | SETEX `metrics:worker:alive:{id}`                                                          |
| `agent.telemetry_tasks.refresh_daily_summary` | finalize  | Every 5 min     | Refresh `metrics.daily_summary` view                                                       |
| `agent.telemetry_tasks.rotate_partitions`     | finalize  | Daily 01:00 UTC | Create/drop `page_events` day partitions                                                   |

---

## Discovery Agent

Source: `services/agent/agent/discovery_agent.py`

The `DiscoveryAgent` class orchestrates the full discovery flow.

### Pipeline Steps

```
1. Get candidate URLs
   ├── Mood-biased category seeds from Redis
   ├── Bootstrap seeds (curated homepage URLs)
   ├── Article deep-links from previous crawls
   └── Discovered URLs from the general seed pool

2. Partition candidates
   ├── Already in site_cache? → use cached evaluation
   └── Not cached? → needs crawling + evaluation

3. Crawl + evaluate uncached URLs
   ├── Fetch page content (respecting robots.txt + rate limits)
   ├── LLM quality evaluation (Tier 1)
   ├── Content summarization (Tier 1)
   └── Persist to site_cache

4. Rank all candidates
   ├── Quality score weighting
   ├── Topic relevance to user profile
   └── Surprise factor (25% outside known preferences)

5. Generate personalized blurbs (Tier 1)
   └── "Why you'll love this" sentence per site

6. Persist results
   ├── Record discovery_session + discoveries in PostgreSQL
   ├── Track shown URLs in Redis (session:shown:{sessionId})
   └── Increment global popularity counters (site:served:{urlHash})
```

### Candidate Selection

The agent mixes three URL sources for variety:

1. **Category seeds** — Redis sets keyed by `seeds:category:{category}`. The agent pulls random members from categories matching the user's mood.
2. **Bootstrap seeds** — A hardcoded set of curated, high-quality homepage URLs that ensure a quality baseline.
3. **Article deep-links** — URLs harvested from outbound links on previously crawled quality sites, stored in `seeds:articles`.

Previously shown URLs (tracked in `session:shown:{sessionId}`) are excluded.

### Mood-Category Mapping

Mood-to-category priors are stored in the `moods` database table and seeded by `agent.tasks.seed_moods`. The default priors are:

| Mood      | Primary Categories                       |
| --------- | ---------------------------------------- |
| wonder    | science, nature, philosophy, history     |
| learn     | science, technology, history, philosophy |
| create    | design, culture, technology              |
| explore   | travel, nature, culture, history         |
| laugh     | humor, culture, gaming                   |
| chill     | nature, food, travel, culture            |
| relax     | nature, food, travel, culture            |
| inspire   | culture, philosophy, science, design     |
| challenge | science, philosophy, technology          |

---

## Crawler

Source: `services/agent/agent/crawler.py`

The `Crawler` class fetches and extracts content from web pages asynchronously.

### Safety Features

- **SSRF protection** — Every URL (including redirect targets) is checked against `url_safety.is_safe_url()` before any network request
- **robots.txt compliance** — Fetches and parses `/robots.txt` for each domain, respects disallow rules
- **Per-domain rate limiting** — Token-bucket limiter prevents flooding any single domain
- **Redirect safety** — Follows redirects manually, re-checking each hop for SSRF
- **Content size limit** — Hard ceiling of 2 MB per page to prevent DoS
- **Concurrency cap** — Semaphore limits concurrent requests (default: 20)

### Content Extraction

The crawler uses a pipeline of:

1. **httpx** — Async HTTP client with configurable timeout
2. **BeautifulSoup** (lxml parser) — HTML parsing
3. **readability-lxml** (`Document`) — Extracts main article content, stripping navigation and ads
4. **Meta extraction** — Pulls `<meta name="description">` for fallback descriptions

Extracted data:

```python
@dataclass
class CrawlResult:
    url: str
    status_code: int
    title: str
    description: str
    content_text: str        # Plain text, max 5000 chars
    content_html: str        # Readability-extracted HTML
    extracted_images: list   # Up to 5 images with alt text
    outbound_links: list     # SSRF-filtered links for seed snowball
    word_count: int
    fetch_time_ms: int
    error: str | None
```

### Configuration

| Setting               | Default | Env Var                         |
| --------------------- | ------- | ------------------------------- |
| Max concurrency       | 20      | `CRAWLER_MAX_CONCURRENCY`       |
| Per-URL timeout       | 10s     | `CRAWLER_TIMEOUT_SECONDS`       |
| Rate limit per domain | 1 req/s | `CRAWLER_RATE_LIMIT_PER_DOMAIN` |

User agent: `SerendipBot/1.0 (+https://github.com/MountainManTechnology/Serendip.bot)`

---

## Seed System

### RSS Feeds

The primary seed source is the `rss_feeds` PostgreSQL table. The `refresh_seeds` Celery task (runs hourly) loads active feed URLs into Redis category sets (`seeds:category:{category}`), making them available for the discovery pipeline without a DB query per request.

New feeds can be submitted at runtime via `POST /internal/feeds` on the `agent-api`.

### Seed Snowball

Outbound links extracted during crawling are fed back into the seed pool:

1. Crawler extracts all `<a href>` links from crawled pages
2. Links are filtered through SSRF safety checks
3. Article-like links (same domain, path with 2+ segments) are added to `seeds:articles`
4. This creates a snowball effect — each crawl discovers new URLs for future requests

### Domain Blocklist

The agent maintains a blocklist of domains that should never enter the seed pool:

- **Social media**: twitter.com, facebook.com, instagram.com, tiktok.com, reddit.com, etc.
- **E-commerce**: amazon.com, ebay.com, etsy.com, walmart.com, etc.
- **Search engines**: google.com, bing.com, duckduckgo.com
- **URL shorteners**: bit.ly, t.co, goo.gl
- **App stores**: play.google.com, apps.apple.com

Subdomain matching is included (e.g., `shop.gap.com` is blocked by `gap.com`).

---

## Telemetry Tasks

Source: `services/agent/agent/telemetry_tasks.py`

Telemetry events from the Node API and Celery workers are pushed to the `metrics:events` Redis list. The `drain_telemetry_queue` task (every 5 seconds) batch-inserts them into the `metrics` PostgreSQL schema.

Event types: `page_event`, `agent_task`, `llm_cost`

A dead-letter queue (`metrics:events:dlq`) captures events that fail to insert, capped at 999 entries.

Monitor live Celery workers at `http://localhost:5555` (Flower UI, auth required).

---

## See Also

- [LLM Providers](LLM-Providers.md) — Provider routing and tier system used by the agent
- [Architecture](Architecture.md) — How the agent fits into the system
- [Database Schema](Database-Schema.md) — Tables populated by the agent
- [Self-Hosting](Self-Hosting.md) — Running the agent with Docker Compose
