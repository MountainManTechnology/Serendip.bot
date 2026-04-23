# Architecture

System architecture for Serendip Bot — an AI-powered web discovery engine.

## Table of Contents

- [System Overview](#system-overview)
- [Data Flow — Discovery Request](#data-flow--discovery-request)
- [Data Flow — Feedback Loop](#data-flow--feedback-loop)
- [Package Graph](#package-graph)
- [Redis Key Naming (ADR-001)](#redis-key-naming-adr-001)
- [Monorepo Pipeline](#monorepo-pipeline)
- [Service Ports (Local Development)](#service-ports-local-development)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │               Next.js 15 (apps/web)                       │   │
│  │  Landing Page → Discovery Feed → Content Preview Modal    │   │
│  │  tRPC client ──────────────────────────────────────────►  │   │
│  └─────────────────────────────┬────────────────────────────┘   │
└────────────────────────────────│────────────────────────────────┘
                                 │ HTTP / tRPC (port 4000)
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Hono API (apps/api)                           │
│                                                                  │
│  Middleware: request-id, telemetry, structured logging           │
│                                                                  │
│  tRPC Routers:                                                   │
│  ├── discovery.request  → POST http://agent-api:8001/internal/discover
│  ├── discovery.poll     → GET  http://agent-api:8001/internal/job/{id}
│  └── feedback.submit    → update curiosity profile               │
│                                                                  │
│  Cache Service (lib/cache.service.ts)                            │
│  └── ADR-001 key naming: site:eval:, user:profile:, etc.        │
└────────────┬────────────────────────────────┬───────────────────┘
             │                                │ HTTP + INTERNAL_API_TOKEN
             ▼                                ▼
┌────────────────────────┐      ┌─────────────────────────────────┐
│   PostgreSQL + pgvector│      │   Agent API (agent-api:8001)    │
│                        │      │   FastAPI shim — private network │
│  sessions              │      │   POST /internal/discover        │
│  curiosity_profiles    │      │   GET  /internal/job/{id}        │
│  site_cache            │      │   POST /internal/feeds           │
│  discovery_sessions    │      └──────────────┬──────────────────┘
│  discoveries           │                     │ Celery task
│  feedback              │                     ▼
│  moods                 │      ┌─────────────────────────────────┐
│  blurb_cache           │      │   Redis (Celery + Cache)        │
│  ingest_attempts       │      │                                  │
│  rss_feeds             │      │  Broker: redis://redis:6379/1   │
│  metrics.*             │      │  Backend: redis://redis:6379/2  │
└─────────────┬──────────┘      │  Cache: discovery:job:*         │
              │                 │  Cache: site:eval:*             │
              │                 │  Cache: user:profile:*          │
              │                 │  Telemetry: metrics:events      │
              │                 └──────────────┬──────────────────┘
              │                                │ Celery
              │                                ▼
              │                 ┌─────────────────────────────────┐
              │                 │  Celery Workers (agent-worker)   │
              │                 │  Queues: discovery, finalize     │
              │                 │                                  │
              │                 │  discover task:                  │
              │                 │  1. Pick seed URLs by mood       │
              │                 │  2. Crawl + extract content      │
              │                 │  3. LLM evaluation pipeline:     │
              │                 │     ├── Tier 1: Gemini Flash     │
              │                 │     ├── Tier 2: Claude Haiku     │
              │                 │     ├── Tier 3: Claude Sonnet    │
              │                 │     └── Azure AI Foundry         │
              │                 │  4. Generate embeddings          │
              │                 │  5. Persist → PostgreSQL ────────┘
              │                 │  6. Write result → Redis cache
              │                 │                                  │
              │                 │  Scheduled tasks (agent-beat):   │
              │                 │  ├── refresh_seeds (hourly)      │
              │                 │  ├── ingest_batch (5 min)        │
              │                 │  ├── purge_stale_cache (daily)   │
              │                 │  └── telemetry drain (5s)        │
              └─────────────────┴─────────────────────────────────┘
```

The system consists of six main service groups:

1. **Next.js Frontend** (`apps/web`) — Server-rendered landing page, discovery feed with mood selection, and content preview modals. Communicates with the API via tRPC.

2. **Hono API** (`apps/api`) — Lightweight HTTP server on port 4000 with tRPC routers for discovery and feedback, plus REST routes for articles. Includes CORS, telemetry middleware, request correlation IDs, and structured logging.

3. **Agent API** (`agent-api`, port 8001) — FastAPI HTTP shim exposing private endpoints for the Node API to enqueue discovery jobs and poll results. Protected by `INTERNAL_API_TOKEN`. The only public HTTP surface of the Python agent.

4. **Celery Workers** (`agent-worker`) — Stateless Celery workers processing the `discovery` and `finalize` queues. Horizontally scalable via `docker compose up --scale agent-worker=N`. Orchestrated by `agent/celery_app.py`.

5. **Celery Beat** (`agent-beat`) — Singleton scheduler (do not scale past 1) that triggers periodic tasks: seed refresh, ingestion, cache purge, telemetry drain, and partition rotation.

6. **PostgreSQL + pgvector** and **Redis** — PostgreSQL is the primary data store; Redis serves as Celery broker/backend (DB 1/2) and application cache (DB 0).

---

## Data Flow — Discovery Request

```
1. User clicks "Surprise Me" on landing page
   └─► POST /trpc/discovery.request
       └─► API calls POST http://agent-api:8001/internal/discover
           (Authorization: INTERNAL_API_TOKEN)
           └─► agent-api enqueues Celery "discover" task → Redis DB 1
               └─► Returns { jobId }

2. Frontend polls /trpc/discovery.poll?jobId=...
   └─► API calls GET http://agent-api:8001/internal/job/{jobId}
       └─► agent-api checks Redis cache (discovery:job:{jobId})
           ├─► status = pending/processing → return { status }
           └─► status = complete → return cached sites

3. Celery worker picks up "discover" task
   └─► Selects seed URLs for mood (rss_feeds + Redis seed sets)
       └─► Crawls URLs (robots.txt + rate limiting)
           └─► LLM evaluates quality + extracts summary
               └─► Persists site_cache + discoveries rows
                   └─► Writes complete result to Redis
                       (discovery:job:{jobId}, TTL 10 min)
```

**Key points:**

- The Node API never talks directly to Redis for queuing — it delegates via the FastAPI shim over HTTP
- `INTERNAL_API_TOKEN` authenticates Node→Agent calls; both services should be on a private network
- Results are written to `discovery:job:{jobId}` (Redis DB 0) so any API instance can serve them immediately

---

## Data Flow — Feedback Loop

```
User clicks 👍 love / → skip / ✕ block
└─► POST /trpc/feedback.submit { siteCacheId, signal }
    └─► profile.service.updateFromFeedback()
        ├─► Fetch site categories from site_cache
        ├─► Upsert curiosity_profiles row
        ├─► Adjust topic_weights (love +0.15 / skip -0.05 / block -0.30)
        ├─► Clamp weights to [-1, 1]
        ├─► Record feedback row
        └─► Invalidate user:profile:{sessionId} cache
```

Feedback signals adjust the user's curiosity profile topic weights. These weights influence future discovery results by biasing seed URL selection toward preferred categories.

---

## Package Graph

```
packages/config        ← no deps (ESLint + TypeScript configs)
packages/types         ← no deps (shared TypeScript types)
packages/db            ← depends on: drizzle-orm (schema + migrations)
apps/api               ← depends on: packages/db, packages/types
apps/web               ← depends on: apps/api (types only), packages/types
services/agent         ← Python, standalone (reads from same DB + Redis)
```

The monorepo uses npm workspaces with Turborepo for task orchestration. TypeScript packages use `"main": "src/index.ts"` for direct source imports during development.

---

## Redis Key Naming (ADR-001)

### DB 0 — Application cache

| Key Pattern                 | TTL      | Purpose                       |
| --------------------------- | -------- | ----------------------------- |
| `site:eval:{url_hash}`      | 7 days   | LLM evaluation result         |
| `site:embed:{url_hash}`     | 30 days  | Embedding vector              |
| `user:profile:{sessionId}`  | 1 hour   | Curiosity profile snapshot    |
| `session:{sessionId}`       | 24 hours | Auth session data             |
| `anon:rate:{sessionId}`     | 1 hour   | Rate limit counter            |
| `discovery:job:{jobId}`     | 10 min   | Job status + results          |
| `seeds:category:{category}` | Managed  | Seed URL sets per category    |
| `seeds:articles`            | Managed  | Snowball article link pool    |
| `metrics:events`            | Stream   | Telemetry event queue (RPUSH) |
| `metrics:events:dlq`        | Stream   | Telemetry dead-letter queue   |
| `metrics:worker:alive:{id}` | 30s      | Celery worker heartbeat       |

### DB 1 — Celery broker

| Key Pattern          | Purpose                     |
| -------------------- | --------------------------- |
| `_kombu.*`           | Celery task queue internals |
| `celery-task-meta-*` | Task status/result metadata |

All application keys use colon-delimited namespaces. URL hashes are SHA256 for fast, collision-resistant lookups.

---

## Monorepo Pipeline

```
typecheck  →  lint  →  build  →  test
    ↕             ↕         ↕        ↕
  (all)        (all)    (prod)   (agent)
```

Tasks cache by default via Turborepo — only re-run when inputs change. CI runs lint, typecheck, test, Docker builds, and security audit in parallel.

---

## Service Ports (Local Development)

| Service   | Port | Description                         |
| --------- | ---- | ----------------------------------- |
| web       | 3000 | Next.js frontend                    |
| api       | 4000 | Hono + tRPC server                  |
| agent-api | 8001 | FastAPI shim (internal, agent HTTP) |
| postgres  | 5432 | PostgreSQL                          |
| redis     | 6379 | Redis (all DBs)                     |
| flower    | 5555 | Celery task monitoring UI           |
| adminer   | 8080 | DB admin UI (`--profile tools`)     |

---

## See Also

- [API Reference](API-Reference.md) — Detailed endpoint documentation
- [Database Schema](Database-Schema.md) — Full table definitions
- [Python Agent](Python-Agent.md) — Agent internals and crawling pipeline
- [LLM Providers](LLM-Providers.md) — Provider routing and tier system
