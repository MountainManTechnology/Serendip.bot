# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

- **Root version**: date-based `yyyy.mm.dd.N`
- **Sub-packages**: [Semantic Versioning](https://semver.org/spec/v2.0.0.html) `x.y.z`

## [Unreleased]


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
