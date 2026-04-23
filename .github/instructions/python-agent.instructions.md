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
- Async task bodies use `asyncio.run(_async_fn())` — do not use `loop.run_until_complete`
- Queues: `discovery` (fan-out), `finalize` (chord bodies) — do not add queues without discussion
- Telemetry pushes (Redis) are fire-and-forget — catch all exceptions, never raise

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
