# Architecture

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
│  Middleware: request-id, structured logging, error handler       │
│                                                                  │
│  tRPC Routers:                                                   │
│  ├── discovery.request  → enqueue BullMQ job                    │
│  ├── discovery.poll     → cache-aside: Redis → queue             │
│  └── feedback.submit    → update curiosity profile               │
│                                                                  │
│  Cache Service (lib/cache.service.ts)                            │
│  ├── TTL-configurable via env vars                               │
│  └── ADR-001 key naming: site:eval:, user:profile:, etc.        │
└────────────┬────────────────────────────────┬───────────────────┘
             │                                │
             ▼                                ▼
┌────────────────────────┐      ┌─────────────────────────────────┐
│   PostgreSQL + pgvector│      │   Redis (BullMQ + Cache)        │
│                        │      │                                  │
│  sessions              │      │  Queue: discovery               │
│  curiosity_profiles    │      │  Queue: discovery:dead (DLQ)   │
│  site_cache            │      │  Cache: site:eval:*             │
│  discovery_sessions    │      │  Cache: user:profile:*          │
│  discoveries           │      │  Cache: discovery:job:*         │
│  feedback              │      │  Cache: session:*               │
└────────────────────────┘      └──────────────┬──────────────────┘
                                                │ BullMQ job
                                                ▼
                                ┌─────────────────────────────────┐
                                │  Python AI Agent (services/agent)│
                                │                                  │
                                │  1. Pick seed URLs by mood       │
                                │  2. Crawl + extract content      │
                                │  3. LLM evaluation pipeline:     │
                                │     ├── Tier 1: Gemini Flash     │
                                │     ├── Tier 2: Claude Haiku     │
                                │     ├── Tier 3: Claude Sonnet    │
                                │     └── Local: Ollama            │
                                │  4. Generate embeddings          │
                                │  5. Persist to PostgreSQL        │
                                │  6. Write result to Redis        │
                                └─────────────────────────────────┘
```

---

## Data Flow — Discovery Request

```
1. User clicks "Surprise Me" on landing page
   └─► POST /trpc/discovery.request
       └─► Creates BullMQ job in Redis queue
           └─► Returns { jobId }

2. Frontend polls /trpc/discovery.poll?jobId=...
   └─► API checks Redis cache (discovery:job:{jobId})
       ├─► CACHE HIT: return cached result
       └─► CACHE MISS: check queue status
           ├─► status = pending/processing → return { status }
           └─► status = complete → cache result, return sites

3. Python agent picks up job from BullMQ
   └─► Selects seed URLs for mood
       └─► Crawls URLs (robots.txt + rate limiting)
           └─► LLM evaluates quality + extracts summary
               └─► Persists site_cache + discoveries rows
                   └─► Writes complete result to Redis
```

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

---

## Package Graph

```
packages/config        ← no deps
packages/types         ← no deps
packages/db            ← depends on: drizzle-orm
apps/api               ← depends on: packages/db, packages/types
apps/web               ← depends on: apps/api (types only), packages/types
services/agent         ← Python, standalone (reads from same DB + Redis)
```

TypeScript path resolution for monorepo development:

- `packages/*/package.json` → `"main": "src/index.ts"` (dev typecheck)
- `apps/api/package.json` → `"exports"` points to `src/` for dev

---

## Database Schema

```
sessions
├── id UUID PK
├── user_id UUID? (NULL for anonymous)
├── created_at, expires_at, last_active_at TIMESTAMPTZ

curiosity_profiles
├── id UUID PK
├── session_id UUID → sessions
├── user_id UUID?
├── topic_weights JSONB  { "programming": 0.8, "art": -0.2, ... }
├── mood_history JSONB
├── embedding vector(1536)  ← for future semantic matching
└── updated_at TIMESTAMPTZ

site_cache                   ← shared evaluation cache
├── id UUID PK
├── url TEXT UNIQUE
├── url_hash TEXT UNIQUE     ← SHA256 for fast lookup
├── title, description TEXT
├── content_summary TEXT     ← AI-extracted readable summary
├── extracted_images JSONB
├── quality_score FLOAT
├── categories JSONB         ← ["programming", "creative"]
├── embedding vector(1536)
└── evaluated_at TIMESTAMPTZ

discovery_sessions           ← one per "Surprise Me" click
├── id UUID PK
├── session_id UUID → sessions
├── mood TEXT
├── status TEXT              ← pending | processing | complete | failed
└── requested_at, completed_at TIMESTAMPTZ

discoveries                  ← sites shown in a session
├── id UUID PK
├── discovery_session_id UUID → discovery_sessions
├── site_cache_id UUID → site_cache
├── why_blurb TEXT           ← AI "why you'll love this"
├── position INT
└── shown_at TIMESTAMPTZ

feedback
├── id UUID PK
├── session_id UUID → sessions
├── site_cache_id UUID → site_cache
├── signal TEXT              ← love | skip | block
└── created_at TIMESTAMPTZ
```

---

## Redis Key Naming (ADR-001)

| Key Pattern                     | TTL      | Purpose                    |
| ------------------------------- | -------- | -------------------------- |
| `site:eval:{url_hash}`          | 7 days   | LLM evaluation result      |
| `site:embed:{url_hash}`         | 30 days  | Embedding vector           |
| `user:profile:{sessionId}`      | 1 hour   | Curiosity profile snapshot |
| `session:{sessionId}`           | 24 hours | Auth session data          |
| `anon:rate:{sessionId}`         | 1 hour   | Rate limit counter         |
| `discovery:job:{jobId}`         | 10 min   | Job status + results       |
| BullMQ: `bull:discovery:*`      | Managed  | Job queue internals        |
| BullMQ: `bull:discovery:dead:*` | 30 days  | Dead-letter queue          |

---

## LLM Provider Routing

```
Task submitted
└─► Is Gemini available + task is Tier 1?
    ├─► YES: use Gemini Flash
    └─► NO: Is Claude available + task is Tier 2?
        ├─► YES: use Claude Haiku
        └─► NO: Is task Tier 3?
            ├─► YES: use Claude Sonnet
            └─► NO: Is Ollama available?
                ├─► YES: use local model
                └─► NO: raise LLMUnavailableError → job fails → DLQ
```

Tier assignment:

- **Tier 1**: URL filtering, quality scoring (cheap, many calls)
- **Tier 2**: Content summarization, category extraction
- **Tier 3**: Deep analysis, why-blurb generation

---

## Monorepo Pipeline (Turborepo)

```
typecheck  →  lint  →  build  →  test
    ↕             ↕         ↕        ↕
  (all)        (all)    (prod)   (agent)
```

Tasks cache by default — only re-run if inputs change.
