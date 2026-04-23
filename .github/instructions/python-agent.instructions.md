---
applyTo: services/agent/**
---

# Python Agent (FastAPI + Celery) Conventions

## Structure

```
agent/
  api.py              # FastAPI app — routes only, delegate to tasks/agent
  celery_app.py       # Celery config, queue definitions — do not import tasks here
  config.py           # Pydantic Settings (single source of truth for all env vars)
  tasks.py            # @app.task definitions; async logic runs via asyncio.run()
  discovery_agent.py  # DiscoveryAgent orchestrator — core pipeline logic
  crawler.py          # httpx async crawler — do not add sync HTTP calls
  logging.py          # structlog setup — import get_logger(), don't configure elsewhere
  providers/
    base.py           # LLMProvider Protocol, LLMResponse model, TaskType enum
    router.py         # LLMRouter — tier selection and cost tracking
    *.py              # One file per provider (azure_ai, claude, gemini, ollama)
```

## API

- Auth: `x-internal-token` header compared with `hmac.compare_digest()` — never `==`
- Endpoints return structured Pydantic models — no raw dicts
- Do not add unauthenticated endpoints to the `/internal/` prefix

## Celery

- Tasks are defined in `tasks.py` — keep them thin; delegate to `discovery_agent.py` or services
- Async task bodies **must** use `_run_async(coro)` — **never** call `asyncio.run()` directly in a task (see Gevent Worker section below)
- Queues: `discovery` (fan-out), `finalize` (chord bodies) — do not add queues without discussion
- Telemetry pushes (Redis) are fire-and-forget — catch all exceptions, never raise

## Gevent Worker — CRITICAL: Do Not Change This Pattern

### Why gevent and asyncio conflict

The `discovery` queue worker runs with Celery's **gevent pool** (`--pool=gevent`). gevent
monkey-patches the Python standard library at import time, replacing `threading.Thread`,
`socket`, `ssl`, and other I/O primitives with greenlet-backed equivalents. This means:

- `threading.Thread(target=fn).start()` starts a **greenlet**, not an OS thread.
- `concurrent.futures.ThreadPoolExecutor` spawns greenlets, not OS threads.
- Both share gevent's event loop.

`asyncio.run()` checks for a running event loop before creating a new one. Inside a gevent
greenlet, `asyncio` detects the gevent loop as "already running" and raises:

```
RuntimeError: asyncio.run() cannot be called from a running event loop
```

### The correct pattern — `_run_async()`

`gevent.get_hub().threadpool` is backed by **real OS threads** (libev/libuv), invisible to
gevent's loop detector. `_run_async()` in `tasks.py` routes every coroutine through this
threadpool:

```python
def _run_async(coro: Any) -> Any:
    import gevent
    return gevent.get_hub().threadpool.spawn(asyncio.run, coro).get()
```

Every `async` helper called from a Celery task **must** go through `_run_async()`. Never
bypass it.

### Rules — enforced

| Rule | Reason |
|------|--------|
| Always use `_run_async(coro)` in task bodies | `asyncio.run()` raises under gevent pool |
| Never use `asyncio.run()` directly in tasks | Causes `RuntimeError` in gevent workers |
| Never use `ThreadPoolExecutor` to isolate asyncio | Threads are greenlets under gevent — still shares the loop |
| Never use `threading.Thread` to isolate asyncio | Same reason as above |
| `_run_async` must stay in `tasks.py` / `celery_app.py` | Must be imported after gevent monkey-patch |
| The `finalize` queue uses `prefork` pool — `asyncio.run()` is safe there | Only `discovery` uses gevent |

### Worker pool configuration (docker-compose)

```yaml
agent-worker-gevent:   # discovery queue
  environment:
    POOL: gevent
    QUEUES: discovery

agent-worker:          # finalize queue
  environment:
    POOL: prefork      # or solo — asyncio.run() is safe here
    QUEUES: finalize
```

Do **not** change the `POOL` of the gevent worker to `prefork` or `solo` without also
removing `_run_async()` calls — and vice versa. The two must stay in sync.

### Hot-path rule

Do **not** call expensive one-time setup (seed loading, DB inserts, heavy ingestion) from
`discover()` / `_discover()`. Those belong in scheduled Beat tasks (`refresh_seeds`,
`seed_moods_task`). The discover hot path must return in < 2 s.

## LLM Providers

- All LLM calls go through `LLMRouter` in `providers/router.py` — never instantiate a provider directly in tasks or the agent
- Tier routing: Tier 1 (quality_eval, content_summary, why_blurb) → Tier 2 (profile_match) → Tier 3 (novel_topic)
- Priority order: Azure AI Foundry → Gemini → Claude → Ollama
- New providers must implement the `LLMProvider` Protocol in `providers/base.py`

## Logging

- Use `structlog` via `from agent.logging import get_logger; logger = get_logger(__name__)`
- Always bind context (`session_id`, `job_id`, `mood`) before the first log in a task
- Never log secrets, API keys, PII, or raw HTTP response bodies

## HTTP / Crawler

- Use `httpx.AsyncClient` — no `requests` or `urllib`
- Respect per-domain rate limiting (token bucket in `crawler.py`)
- Validate URLs with `url_safety.py` before crawling

## Config

- All env vars live in `config.py` as a Pydantic `Settings` class — no `os.environ` reads elsewhere
- Access config via `from agent.config import settings`

## Testing

- Mock LLM providers at the `LLMRouter` level, not individual providers
- Mock `httpx.AsyncClient` for crawler tests — never make real HTTP calls in tests
- Use `pytest-asyncio` for async test functions

## Key Env Vars

| Var                                 | Default                  | Notes                             |
| ----------------------------------- | ------------------------ | --------------------------------- |
| `DATABASE_URL`                      | required                 | Postgres                          |
| `REDIS_URL`                         | `redis://localhost:6379` |                                   |
| `INTERNAL_API_TOKEN`                | required                 | Shared secret with API            |
| `AZURE_AI_FOUNDRY_ENDPOINT`         | optional                 | Preferred LLM provider            |
| `AZURE_AI_FOUNDRY_API_KEY`          | optional                 |                                   |
| `AZURE_AI_FOUNDRY_DEPLOYMENT`       | optional                 | e.g. `gpt-4o`                     |
| `AZURE_AI_FOUNDRY_EMBED_DEPLOYMENT` | optional                 | e.g. `text-embedding-3-large`     |
| `GEMINI_API_KEY`                    | optional                 | Tier 1 default                    |
| `ANTHROPIC_API_KEY`                 | optional                 | Tier 2/3 default                  |
| `LOG_LEVEL`                         | `INFO`                   |                                   |
| `DISCOVERY_RESULT_COUNT`            | `3`                      | Sites returned per request        |
| `DISCOVERY_SURPRISE_FACTOR`         | `0.25`                   | Fraction outside user preferences |
