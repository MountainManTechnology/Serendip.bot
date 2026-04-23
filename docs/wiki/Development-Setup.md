# Development Setup

Get Serendip Bot running locally for development.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Monorepo Structure](#monorepo-structure)
- [Turborepo Scripts](#turborepo-scripts)
- [Python Agent Setup](#python-agent-setup)
- [Environment Variables](#environment-variables)
- [Database Migrations](#database-migrations)
- [Running Tests](#running-tests)

---

## Prerequisites

| Tool           | Version | Install                              |
| -------------- | ------- | ------------------------------------ |
| Node.js        | 20+     | [nodejs.org](https://nodejs.org)     |
| npm            | 10+     | Bundled with Node.js                 |
| Python         | 3.11+   | [python.org](https://www.python.org) |
| Docker         | Latest  | [docker.com](https://www.docker.com) |
| Docker Compose | v2+     | Bundled with Docker Desktop          |

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/MountainManTechnology/Serendip.bot.git
cd serendip-bot

# 2. Install Node.js dependencies
npm install

# 3. Copy environment template
cp .env.example .env.local

# 4. Start infrastructure (PostgreSQL + Redis)
docker compose up -d postgres redis

# 5. Start all services in dev mode
npm run dev
```

This starts:

- **Web** at `http://localhost:3000` (Next.js with hot reload)
- **API** at `http://localhost:4000` (Hono with watch mode)
- **Agent** — Python worker (if configured)

---

## Monorepo Structure

```
serendip-bot/
├── apps/
│   ├── api/          # Hono + tRPC API server (port 4000)
│   └── web/          # Next.js 15 frontend (port 3000)
├── services/
│   └── agent/        # Python AI discovery worker
├── packages/
│   ├── db/           # Drizzle ORM schema + migrations
│   ├── types/        # Shared TypeScript types
│   └── config/       # Shared ESLint + TypeScript configs
├── docs/             # Documentation
│   ├── wiki/         # Wiki pages (published to GitHub Wiki)
│   └── internal/     # Internal notes (not published)
├── turbo.json        # Turborepo pipeline config
├── package.json      # Root workspace config
└── docker-compose.yml
```

The monorepo uses **npm workspaces** with **Turborepo** for task orchestration. Packages reference each other via workspace protocol:

```json
"dependencies": {
  "@serendip-bot/db": "*",
  "@serendip-bot/types": "*"
}
```

TypeScript packages use `"main": "src/index.ts"` for direct source imports during development — no build step required for dev.

---

## Turborepo Scripts

| Command             | Description                               |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Start all services in dev mode            |
| `npm run build`     | Build all packages and apps               |
| `npm run lint`      | ESLint across all TypeScript packages     |
| `npm run typecheck` | TypeScript strict typecheck               |
| `npm run format`    | Prettier format all files                 |
| `npm run clean`     | Remove build artifacts and `node_modules` |

Turbo caches task outputs — only re-runs when inputs change.

---

## Python Agent Setup

```bash
cd services/agent

# Create virtual environment
python3.11 -m venv .venv
source .venv/bin/activate

# Install with dev dependencies
pip install -e ".[dev]"

# Or use uv for faster installs
pip install uv
uv pip install --system ".[dev]"
```

The agent requires at least one LLM API key to function. See [LLM Providers](LLM-Providers.md) for configuration.

---

## Environment Variables

Create `.env.local` in the project root:

```bash
# Database (required)
DATABASE_URL="postgresql://stumble:password@localhost:5432/stumble_ai"
REDIS_URL="redis://localhost:6379"

# Node→Agent auth (required when running agent-api)
INTERNAL_API_TOKEN="localdev-only-token-change-me"

# LLM Providers (at least one required for agent)
GEMINI_API_KEY="your-key"
ANTHROPIC_API_KEY="your-key"       # Optional
OLLAMA_BASE_URL="http://localhost:11434"  # Optional

# Frontend
NEXT_PUBLIC_API_URL="http://localhost:4000"
CORS_ORIGINS="http://localhost:3000"
```

See [Self-Hosting](Self-Hosting.md#environment-configuration) for the full variable reference.

---

## Database Migrations

Migrations are managed by Drizzle Kit in `packages/db/`:

```bash
# Generate a migration from schema changes
cd packages/db
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit push

# Or apply via Docker Compose (auto-runs on startup)
docker compose up -d
```

See [Database Schema](Database-Schema.md) for the full schema reference.

---

## Running Tests

### TypeScript

```bash
npx turbo test           # Run all Vitest tests
```

### Python

```bash
cd services/agent
pytest                   # Run all tests
pytest -v                # Verbose output
pytest tests/test_crawler.py  # Specific file
```

### Linting

```bash
npm run lint             # ESLint
npm run typecheck        # TypeScript strict mode
ruff check .             # Python (from services/agent/)
ruff format --check .    # Python format check
mypy agent/ worker.py    # Python type check
```

---

## See Also

- [Contributing](Contributing.md) — Code style and PR process
- [Architecture](Architecture.md) — System design overview
- [Self-Hosting](Self-Hosting.md) — Docker Compose for full-stack local run
