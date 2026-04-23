# Contributing

How to contribute to Serendip Bot — code style, PR process, and project conventions.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Code Style](#code-style)
  - [TypeScript / JavaScript](#typescript--javascript)
  - [Python](#python)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Adding a tRPC Endpoint](#adding-a-trpc-endpoint)
- [Adding a Database Table](#adding-a-database-table)
- [Reporting Issues](#reporting-issues)

---

## Code of Conduct

Be kind, respectful, and constructive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).

---

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/serendip-bot.git`
3. **Set up** the development environment (see [Development Setup](Development-Setup.md))
4. **Create a branch**: `git checkout -b feat/your-feature-name`
5. **Make changes**, then open a Pull Request

---

## Code Style

### TypeScript / JavaScript

- **Formatter**: Prettier (config in root `package.json`)
- **Linter**: ESLint with TypeScript rules
- **TypeScript**: Strict mode + `exactOptionalPropertyTypes`
- Run checks: `npm run lint && npm run typecheck`

### Python

- **Formatter**: Ruff (`ruff format .`)
- **Linter**: Ruff (`ruff check .`)
- **Types**: mypy (strict)
- Run checks: `cd services/agent && ruff format . && ruff check . && mypy agent/ worker.py`

### General Rules

- No `any` casts without an explanatory comment
- All public functions should have JSDoc/docstrings
- Imports ordered: stdlib → third-party → internal
- Keep components small and single-purpose

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add mood selector to landing page
fix: correct session cookie expiry calculation
docs: update self-hosting guide with Ollama instructions
chore: upgrade bullmq to v5.10
refactor: extract cache key builders to cache.service
test: add coverage for discovery agent LLM routing
perf: reduce Redis round-trips in poll endpoint
ci: add wiki staleness check
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`

---

## Pull Request Process

1. **Target `main`** — all PRs go to `main`
2. **One concern per PR** — don't mix features with refactors
3. **TypeScript must pass**: `npm run typecheck` returns zero errors
4. **Tests must pass**: `npm test` (JS) and `pytest` (Python agent)
5. **Describe your change** in the PR description — what, why, how
6. **Link issues** with `Closes #N` in the PR body

### PR Title Format

Use Conventional Commits: `feat(feed): add mood re-selector to discovery feed`

---

## Adding a tRPC Endpoint

1. Add procedure to `apps/api/src/routers/your-router.ts`
2. Register in `apps/api/src/routers/index.ts`
3. Use in frontend via `trpc.yourRouter.yourProcedure.useQuery()`
4. Add input validation with Zod

---

## Adding a Database Table

1. Update `packages/db/src/schema.ts`
2. Generate migration: `cd packages/db && npx drizzle-kit generate`
3. Apply migration: `npx drizzle-kit migrate`
4. Update `packages/types/src/index.ts` if new public types are needed

---

## Reporting Issues

Use GitHub Issues with:

- A clear title describing the problem
- Steps to reproduce
- Expected vs actual behavior
- Environment info (OS, Node version, Docker version)

For security vulnerabilities, please email directly instead of filing a public issue.

---

## See Also

- [Development Setup](Development-Setup.md) — Get the project running locally
- [Architecture](Architecture.md) — Understand the system before contributing
- [API Reference](API-Reference.md) — tRPC endpoint patterns
- [Database Schema](Database-Schema.md) — Schema and migration workflow
