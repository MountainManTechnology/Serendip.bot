# Copilot Instructions — SerendipBot

## Monorepo Layout

- `apps/api` — Hono + tRPC API server (Node)
- `apps/web` — Next.js 15 frontend (App Router)
- `packages/db` — Drizzle schema + migrations (shared)
- `packages/types` — Shared TypeScript types
- `services/agent` — Python FastAPI + Celery discovery pipeline

Run tasks with `turbo`: `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`.
DB commands are dotenv-wrapped: `npm run db:migrate`, `db:generate`, `db:seed`, `db:studio`.

## Change Management

**These changes require discussion and explicit approval before any code is written:**

- New tRPC routers or procedures
- New Celery tasks or queues
- Schema migrations (new tables, columns, or index changes)
- LLM provider additions or tier routing changes
- New environment variables (any app)
- Docker Compose or Dockerfile modifications
- Caddyfile routing changes
- Changes to the BullMQ queue interface between API and agent

For everything else, implement directly but keep changes minimal and focused.

## CHANGELOG

- Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
- Root version: `yyyy.mm.dd.N` (date-based, increment N per release)
- Sub-packages: semver `x.y.z`
- New work goes under `## [Unreleased]`
- Entries must be specific and include the affected path/component in bold

## Code Style

- TypeScript strict mode; no `any` without a comment explaining why
- Zod for all external input validation
- `timingSafeEqual` / `hmac.compare_digest` for any secret comparison — never `===`
- Never log secrets, tokens, or PII — even at debug level
- Errors returned to clients must not expose internal stack traces or messages
