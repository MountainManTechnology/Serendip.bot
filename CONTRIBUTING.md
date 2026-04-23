# Contributing to Serendip Bot

Thank you for your interest in contributing! This document explains how to get started.

---

## Code of Conduct

Be kind, respectful, and constructive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).

---

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/serendip-bot.git`
3. **Set up** the development environment (see [README.md](README.md))
4. **Create a branch**: `git checkout -b feat/your-feature-name`
5. **Make changes**, then open a Pull Request

---

## Development Setup

```bash
# Install dependencies (Node.js 20+ required)
npm install

# Copy and configure environment
cp .env.example .env.local

# Start Docker services (postgres + redis)
docker compose up -d postgres redis

# Start all services in dev mode
npm run dev
```

### Python Agent Setup

```bash
cd services/agent
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Run tests
python -m pytest
```

---

## Code Style

### TypeScript / JavaScript

- **Formatter**: Prettier (config in root `package.json`)
- **Linter**: ESLint with TypeScript rules
- **TypeScript**: Strict mode + `exactOptionalPropertyTypes`
- Run checks: `npm run lint && npm run typecheck`

### Python

- **Formatter**: Black (`black .`)
- **Linter**: Ruff (`ruff check .`)
- **Types**: Pyright (strict)
- Run checks: `cd services/agent && black . && ruff check .`

### General

- No `any` casts without an explanatory comment
- All public functions should be documented with JSDoc/docstrings
- Imports ordered: stdlib → third-party → internal
- Keep components small and single-purpose

---

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add mood selector to landing page
fix: correct session cookie expiry calculation
docs: update self-hosting guide with Ollama instructions
chore: upgrade bullmq to v5.10
refactor: extract cache key builders to cache.service
test: add coverage for discovery agent LLM routing
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`

---

## Pull Request Process

1. **Target `main`** — all PRs go to `main`
2. **One concern per PR** — avoid mixing features with refactors
3. **TypeScript must pass**: `npm run typecheck` returns zero errors
4. **Tests must pass**: `npm test` for the Python agent
5. **Describe your change** in the PR description — what, why, how
6. **Link issues** with `Closes #N` in the PR body

### PR Title Format

Use Conventional Commits format: `feat(feed): add mood re-selector to discovery feed`

---

## Project Structure

```
apps/
  web/        Next.js 15 frontend
  api/        Hono + tRPC API server
services/
  agent/      Python AI discovery worker
packages/
  db/         Drizzle ORM schema and client
  types/      Shared TypeScript types
  config/     Shared ESLint + TypeScript configs
docs/         Documentation
```

### Key Files

| File                                 | Purpose                              |
| ------------------------------------ | ------------------------------------ |
| `packages/types/src/index.ts`        | All shared types — change here first |
| `packages/db/src/schema.ts`          | Database schema                      |
| `apps/api/src/routers/`              | tRPC procedures                      |
| `apps/web/src/components/discovery/` | Core UI components                   |
| `services/agent/src/`                | Python AI pipeline                   |

---

## Adding a New tRPC Endpoint

1. Add procedure to `apps/api/src/routers/your-router.ts`
2. Register in `apps/api/src/routers/index.ts`
3. Use in frontend via `trpc.yourRouter.yourProcedure.useQuery()`
4. Add input validation with Zod

---

## Adding a New Database Table

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

## Questions?

Open a GitHub Discussion or file an issue with the `question` label.
