# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

- **Root version**: date-based `yyyy.mm.dd.N`
- **Sub-packages**: [Semantic Versioning](https://semver.org/spec/v2.0.0.html) `x.y.z`

## [Unreleased]

### Fixed

- **Celery gevent + asyncio runtime error** — `services/agent/agent/tasks.py` and `services/agent/agent/celery_app.py` updated to run async coroutines in a real OS thread via `gevent.get_hub().threadpool.spawn(asyncio.run, coro).get()` (available as `_run_async(...)`), removing direct `asyncio.run(...)` call sites so Celery workers using the `gevent` pool no longer raise "asyncio.run() cannot be called from a running event loop".

- **Prevent hot-path seed ingestion** — `load_seed_files()` was removed from the discover hot path to stop repeated seed DB inserts on every discovery request; scheduled `refresh_seeds` / `seed_moods` tasks now handle seed ingestion.

- **Performance & stability** — fixes return interactive discovery latency to expected levels and prevent Celery runtime failures under `gevent`.

- **mypy strict compliance** — resolved all type errors across `services/agent/`: made `_run_async()` generic (`Coroutine[Any, Any, _T] -> _T`) eliminating `no-any-return` errors throughout `tasks.py`; added `isinstance(href, str)` guards for BeautifulSoup `AttributeValueList` in `seeds/content_scraper.py`; switched OpenAI embeddings call in `providers/router.py` from `AsyncOpenAI` to sync `OpenAI` to fix coroutine-in-thread bug; wrapped both `EmbeddingsClient.embed` overloads in `providers/azure_ai.py` with lambdas; fixed `aioredis.Redis` type-arg in `telemetry_tasks.py`; added `# type: ignore[import-untyped]` to `yaml` imports in `seeds/review_seeds.py`, `seeds/fast_probe_feeds.py`, and `hourly_discovery.py`.

- **Stale test removal** — deleted `tests/test_image_mirroring_integration.py`, `tests/test_ingestion_image_gates.py`, and `tests/test_image_ocr_smoke.py` which tested image pipeline code removed in the article-first evaluation simplification; all 21 remaining tests pass.

## [2026.04.22.1] — 2026-04-22

### Changed

- **`.github/workflows/release.yml`** — replaced hardcoded `serendip.bot` domain fallbacks with localhost placeholders (`NEXT_PUBLIC_API_URL` → `http://localhost:3000`, `NEXT_PUBLIC_SITE_URL` → `http://localhost:3001`); `NEXT_PUBLIC_UMAMI_ENABLED` defaults to `false`; `NEXT_PUBLIC_UMAMI_SRC` defaults to empty string; all values remain overridable via GitHub repository variables
- **`.github/workflows/publish-wiki.yml`** — updated wiki URL reference from `WFord26/SerendipBot` to `MountainManTechnology/Serendip.bot`
- **`.github/instructions/wiki-conventions.instructions.md`** — updated image CDN URL from `WFord26/SerendipBot` to `MountainManTechnology/Serendip.bot`
- **`.github/agents/wiki.agent.md`** — updated image CDN URL from `WFord26/SerendipBot` to `MountainManTechnology/Serendip.bot`

### Added

- **Initial public release** — open-source baseline of the Serendip.bot monorepo under `MountainManTechnology/Serendip.bot`
- **`apps/api`** — Hono + tRPC API server (Node 22)
- **`apps/web`** — Next.js 15 frontend (App Router) with daily discovery spotlight, stumble feed, and admin dashboard
- **`packages/db`** — Drizzle ORM schema and migrations (PostgreSQL)
- **`packages/types`** — shared TypeScript types
- **`services/agent`** — Python FastAPI + Celery discovery pipeline with vector-based mood matching, LLM blurb generation, and content ingestion
- **CI workflow** (`ci.yml`) — TypeScript lint/typecheck/test, Python lint/typecheck/test, Docker build validation, security audit, version hash check, wiki freshness check
- **Release workflow** (`release.yml`) — multi-arch Docker image builds (amd64 + arm64) pushed to GHCR with manifest merging and GitHub Release creation
- **Wiki publish workflow** (`publish-wiki.yml`) — auto-publishes `docs/wiki/` to GitHub Wiki on push to main
- **Self-hosting documentation** — `.env.example`, `docker-compose.yml`, and `docs/SELF_HOSTING.md`
