# API Reference

Documentation for the Serendip Bot API server (`apps/api`), including tRPC routers, REST endpoints, and middleware.

## Table of Contents

- [Overview](#overview)
- [Server Setup](#server-setup)
- [Middleware](#middleware)
- [tRPC Routers](#trpc-routers)
  - [discovery.request](#discoveryrequest)
  - [discovery.poll](#discoverypoll)
  - [feedback.submit](#feedbacksubmit)
  - [feedback.getForSession](#feedbackgetforsession)
  - [admin.getStats](#admingetstats)
- [REST Endpoints](#rest-endpoints)
  - [Articles API](#articles-api)
  - [Health Check](#health-check)
- [Authentication](#authentication)

---

## Overview

The API is built with [Hono](https://hono.dev) and serves on port `4000` (configurable via `PORT` env var). It exposes:

- **tRPC routers** at `/trpc/*` for discovery and feedback
- **REST routes** at `/api/articles/*` for article management
- **Health check** at `/health`

Source: `apps/api/src/index.ts`

---

## Server Setup

```typescript
// apps/api/src/index.ts
const app = new Hono();

// CORS, request logging, error handling middleware
// tRPC at /trpc/*
// Articles REST at /api/articles/*
// Health check at /health

const port = Number(process.env["PORT"] ?? 4000);
serve({ fetch: app.fetch, port });
```

---

## Middleware

All requests pass through these middleware layers (in order):

### CORS

- **Allowed origins**: Configured via `CORS_ORIGINS` env var (comma-separated). Defaults to `http://localhost:3000`.
- **Methods**: `GET`, `POST`, `OPTIONS`
- **Credentials**: Enabled
- **Max age**: 600 seconds

### Request Correlation ID

Every request gets a unique `x-request-id` header (from the incoming request, or auto-generated UUID). Returned in the response for tracing.

### Structured Logging

Logs method, path, status, and duration in milliseconds for every request using [pino](https://getpino.io).

### Error Handler

Catches unhandled errors, logs them with the request ID, and returns a generic `500` response to avoid leaking internals.

---

## tRPC Routers

The tRPC API is defined in `apps/api/src/routers/index.ts`:

```typescript
export const appRouter = router({
  discovery: discoveryRouter,
  feedback: feedbackRouter,
});
```

### discovery.request

**Type**: Mutation  
**Path**: `POST /trpc/discovery.request`

Enqueues a new discovery job for the Python agent to process.

**Input**:

```typescript
{
  mood?: 'learn' | 'create' | 'laugh' | 'wonder' | 'chill',
  topics?: string[]  // max 5 items, each max 50 chars
}
```

**Output**:

```typescript
{
  jobId: string,
  sessionId: string
}
```

**Behavior**:

1. Creates or reuses a session (upserts into `sessions` table)
2. Calls the Python agent HTTP shim (`POST ${AGENT_URL:-http://agent-api:8001}/internal/discover`) with the `x-internal-token` header to enqueue a Celery `discover` task.
3. The API writes an initial `discovery:job:{jobId}` Redis key with `status: 'pending'` so the frontend can poll immediately, then returns the `jobId` and `sessionId`.

### discovery.poll

**Type**: Query  
**Path**: `GET /trpc/discovery.poll?input={jobId}`

Polls for discovery job results using a cache-aside pattern.

**Input**:

```typescript
{
  jobId: string; // non-empty
}
```

**Output**:

```typescript
{
  status: 'pending' | 'processing' | 'complete' | 'failed',
  sites?: Array<{
    url: string,
    title: string,
    description: string,
    content_summary: string,
    quality_score: number,
    categories: string[],
    why_blurb: string,
    extracted_images: Array<{ url: string, altText: string }>
  }>,
  error?: string
}
```

**Behavior**:

1. Checks Redis cache (`discovery:job:{jobId}`) first.
2. On cache miss, the API reads the Redis key `discovery:job:{jobId}` (written by the agent worker) to obtain job status and result.
3. Only caches terminal states (`complete` / `failed`) to avoid stale in-progress entries.

### feedback.submit

**Type**: Mutation  
**Path**: `POST /trpc/feedback.submit`

Submits user feedback on a discovered site. Requires an active session.

**Input**:

```typescript
{
  siteCacheId: string,  // UUID
  signal: 'love' | 'skip' | 'block'
}
```

**Output**:

```typescript
{
  ok: true,
  sessionId: string,
  siteCacheId: string,
  signal: string
}
```

**Behavior**:

1. Validates session exists
2. Calls `profile.service.updateFromFeedback()` which adjusts curiosity profile topic weights and records the feedback row

### feedback.getForSession

**Type**: Query  
**Path**: `GET /trpc/feedback.getForSession`

Returns all feedback signals for the current session. Used by the frontend to restore active button states after page load.

**Output**:

```typescript
Array<{ siteCacheId: string; signal: "love" | "skip" | "block" }>;
```

### admin.getStats

**Type**: Query  
**Path**: `GET /trpc/admin.getStats`

Administrative procedure that returns aggregate statistics for the admin dashboard (sessions, sites, feedback counts, ingestion metrics, top loved/skipped/blocked sites, etc.).

**Auth**: Requires a valid `admin_session` cookie; tokens are validated server-side against the `ADMIN_SECRET_KEY` environment variable.

---

## REST Endpoints

### Articles API

Base path: `/api/articles`

#### `POST /api/articles/publish`

Publishes or updates an article. **Requires `ARTICLE_PUBLISH_API_KEY` (Bearer token) authentication** via the `Authorization` header.

**Body** (JSON):

```typescript
{
  slug: string,          // lowercase alphanumeric with hyphens
  title: string,
  subtitle?: string,
  emoji: string,
  publishedAt: string,   // YYYY-MM-DD
  readingTime: string,
  heroImage: { url: string, altText: string, caption?: string, credit?: string },
  keyFacts: string[],
  sections: Array<{
    heading: string,
    paragraphs: string[],
    image?: { url: string, altText: string, caption?: string, credit?: string, float?: 'right' },
    blockquote?: { text: string, cite?: string },
    callout?: { label: string, text: string }
  }>,
  sources: Array<{ title: string, url: string }>
}
```

**Response**: `{ success: true, slug: string, url: string }`

Uses upsert on the `slug` field — publishing the same slug again updates the existing article.

#### `GET /api/articles`

Returns a paginated list of published articles.

**Query params**: `page` (default: 1), `limit` (default: 20, max: 50)

**Response**:

```typescript
{
  articles: Array<{ slug, title, subtitle, emoji, publishedAt, readingTime, heroImage }>,
  total: number,
  page: number,
  totalPages: number
}
```

#### `GET /api/articles/slugs`

Returns all published article slugs (used for sitemap generation).

#### `GET /api/articles/:year/:month/:slug`

Returns a single article by its date-based path.

### Health Check

**Path**: `GET /health`

**Response**: `{ status: "ok", timestamp: "2026-04-18T..." }`

---

## Authentication

- **tRPC endpoints**: Public (no auth required). Session is created automatically on first `discovery.request`.
- **Article publishing**: Protected by the `ARTICLE_PUBLISH_API_KEY` environment variable. The `POST /api/articles/publish` route expects a Bearer token in the `Authorization` header and validates it in the `requirePublishKey` middleware.
- **Admin router**: Protected via a signed `admin_session` cookie; the cookie is validated server-side against `ADMIN_SECRET_KEY`. Admin procedures (for example, `admin.getStats`) require a valid admin session token and return aggregate statistics for the admin dashboard.

---

## See Also

- [Architecture](Architecture.md) — System overview and data flows
- [Database Schema](Database-Schema.md) — Table definitions used by the API
- [Python Agent](Python-Agent.md) — The Celery-based discovery pipeline (agent-api + Celery workers)
- [Frontend](Frontend.md) — The Next.js app that consumes this API
