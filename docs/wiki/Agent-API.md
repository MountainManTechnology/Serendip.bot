# Agent API

Documentation for the Python Agent HTTP shim (`agent-api`) exposed by `services/agent`.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Endpoints](#endpoints)
  - [POST /internal/discover](#post-internaldiscover)
  - [GET /internal/job/{id}](#get-internaljobid)
  - [POST /internal/feeds](#post-internalfeeds)
  - [GET /healthz](#get-healthz)
  - [GET /readyz](#get-readyz)
  - [POST /internal/bootstrap](#post-internalbootstrap)
- [Celery Integration](#celery-integration)
- [Examples](#examples)

---

## Overview

The Agent API is a private FastAPI shim that accepts requests from the Node API (`apps/api`) and enqueues Celery tasks processed by the discovery workers. It listens on port `8001` in local and compose setups.

Source: `services/agent/agent/api.py`

---

## Authentication

All internal endpoints require the `x-internal-token` HTTP header. The token value must match the `INTERNAL_API_TOKEN` environment variable configured in both the Node API and the Agent API. Calls without this header will be rejected with `401`.

---

## Endpoints

### POST /internal/discover

Enqueues a new `discover` Celery task.

- Auth: `x-internal-token` header (required)
- Body (JSON):

```json
{
  "mood": "wonder",
  "topics": ["space", "astronomy"]
}
```

- Response (201):

```json
{ "jobId": "<uuid>", "sessionId": "<uuid>" }
```

Behavior: Validates input, creates/updates a discovery session row, and calls `discover.apply_async(...)` on the `discovery` queue. Also writes an initial `discovery:job:{jobId}` Redis key with a `pending` status.

### GET /internal/job/{id}

Poll job status and result previously written by Celery workers.

- Auth: `x-internal-token`
- Path params: `id` (jobId UUID)
- Response (200):

```json
{
  "status": "pending|processing|complete|failed",
  "sites": [
    /* optional, present when complete */
  ],
  "error": "optional error message"
}
```

The agent reads `discovery:job:{jobId}` from Redis (DB 0) and returns the payload. Terminal states (`complete`/`failed`) are safe to cache at the API layer for short TTLs.

### POST /internal/feeds

Submit or upsert RSS feed URLs into the `rss_feeds` table (used by `refresh_seeds`).

- Auth: `x-internal-token`
- Body (JSON): `[{ "url": "https://example.com/feed", "category_hint": "science" }, ...]`
- Response: `202 Accepted` on success

This endpoint is rate-limited and intended for administrative or automated feed imports.

### GET /healthz

Lightweight health check for the agent HTTP process. Returns `200` when the HTTP server is operational.

### GET /readyz

Readiness probe that verifies broker/backends (Redis/Celery) connectivity. Returns `200` only when broker connectivity is confirmed.

### POST /internal/bootstrap

Idempotent bootstrap helper that triggers a set of background initialization tasks (seed moods, refresh seeds, backfill affinities). Intended for operator-driven setup during first boot.

- Auth: `x-internal-token`
- Response: `202 Accepted` on accepted actions

---

## Celery Integration

- Broker: Redis (configured via `CELERY_BROKER_URL`, default: `{REDIS_URL}/1`)
- Result backend: Redis (default: `{REDIS_URL}/2`)
- Queues: `discovery`, `finalize`

The Agent API enqueues tasks but does not perform heavy work itself. Celery workers (`agent-worker`) process discovery workflows and write results back to Redis and PostgreSQL.

---

## Examples

Trigger a discovery (curl):

```bash
curl -X POST http://localhost:8001/internal/discover \
  -H "Content-Type: application/json" \
  -H "x-internal-token: ${INTERNAL_API_TOKEN}" \
  -d '{"mood":"wonder","topics":["space"]}'
```

Poll a job:

```bash
curl -H "x-internal-token: ${INTERNAL_API_TOKEN}" http://localhost:8001/internal/job/<JOB_ID>
```

---

## See Also

- [API Reference](API-Reference.md) — Node API (tRPC + REST) that calls this shim
- [Python Agent](Python-Agent.md) — Internal agent architecture and Celery task catalog
