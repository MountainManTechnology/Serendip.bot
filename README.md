# Serendip Bot

> Discover the internet you didn't know existed.

Serendip Bot is an AI-powered web discovery engine built as a modern StumbleUpon alternative. Pick a mood, request a discovery session, and the stack crawls, scores, reranks, and serves a small batch of surprising websites instead of an infinite feed.

## What It Does

- Mood-driven discovery sessions for curiosity-led browsing
- AI evaluation, summaries, and "why this is interesting" blurbs
- Anonymous session-based personalization with a curiosity profile
- Daily article publishing pipeline with optional image mirroring to Azure Blob Storage
- Admin dashboard and metrics pages for monitoring the system
- Self-hostable stack with Docker Compose, Redis, PostgreSQL, and a Python agent

## Stack

| Layer           | Technology                               |
| --------------- | ---------------------------------------- |
| Frontend        | Next.js 15, React 19, tRPC client        |
| API             | Hono, tRPC, Node.js                      |
| Agent HTTP      | FastAPI                                  |
| Background work | Celery workers + Celery Beat             |
| Data            | PostgreSQL 16 + pgvector, Redis          |
| LLM routing     | Azure AI Foundry, Gemini, Claude, Ollama |
| Monorepo        | npm workspaces + Turborepo               |

At a high level the flow is:

1. The web app calls the Hono API on port `4000`.
2. The API forwards discovery jobs to the internal FastAPI shim at `agent-api`.
3. Celery workers process discovery and finalize queues.
4. Results are cached in Redis and persisted to PostgreSQL.

See [docs/architecture.md](docs/architecture.md) and the [wiki home](docs/wiki/Home.md) for the deeper system docs.

## Quick Start

### Requirements

- Docker Desktop or Docker Engine with Compose v2
- 4 GB RAM minimum
- One LLM provider configured, unless you are using Ollama locally

### 1. Clone the repo

```bash
git clone https://github.com/MountainManTechnology/Serendip.bot.git serendip-bot
cd serendip-bot
```

### 2. Create your environment file

```bash
cp .env.example .env
```

Set these first in `.env`:

- `INTERNAL_API_TOKEN`
- `ADMIN_SECRET_KEY`

Generate both with:

```bash
openssl rand -hex 32
```

Choose one provider path:

- Azure AI Foundry (preferred): set `AZURE_AI_FOUNDRY_ENDPOINT`, `AZURE_AI_FOUNDRY_API_KEY`, and `AZURE_AI_FOUNDRY_DEPLOYMENT`
- Gemini + Claude fallback: set `GEMINI_API_KEY`, optionally `ANTHROPIC_API_KEY`
- Ollama: run Ollama locally and keep `OLLAMA_BASE_URL=http://host.docker.internal:11434`

Vision / Image pipeline (Azure Cognitive Services)

- To enable image OCR and image-embedding features, set the Azure Cognitive
  Services Computer Vision env vars in your `.env`:
  - `AZURE_COMPUTER_VISION_ENDPOINT` — your Cognitive Services endpoint (example: `https://<resource>.cognitiveservices.azure.com`)
  - `AZURE_COMPUTER_VISION_KEY` — your Computer Vision subscription key
  - `AZURE_STORAGE_CONNECTION_STRING` and `AZURE_STORAGE_CONTAINER` — optional: mirror images to Azure Blob Storage
  - `AZURE_IMAGE_EMBED_DEPLOYMENT` (optional) — an Azure Foundry image-embedding deployment name to return true image embeddings
  - `AZURE_IMAGE_EMBED_ENDPOINT` (optional) — alternate embed endpoint if different from Foundry endpoint

- Behavior: when configured the agent will mirror images (Blob or local),
  call Azure Computer Vision OCR to extract `ocr_text` and `ocr_panel_count`,
  compute OCR text embeddings, and attempt true image embeddings via an
  Azure Foundry image deployment when `AZURE_IMAGE_EMBED_DEPLOYMENT` is set.
  If no Azure image-deploy is configured the agent will fall back to a
  textual embedding of `alt`/`caption`/OCR text, or a local CLIP-based
  embedding if you install the optional image deps (see below).

- Local CLIP fallback: to enable a local CLIP image embedding path install
  optional image deps in the agent environment: `pip install -e "services/agent[image]"`.
  This path is recommended only for development or GPU-enabled hosts.

Notes:

- Docker Compose and the Python agent both read the root `.env` file.
- The `*_DOCKER` variables in `.env.example` are the internal container-to-container defaults. Leave them alone unless you are changing Docker networking or service names.

### 3. Start the stack

```bash
docker compose up -d
```

Optional local tools:

```bash
docker compose --profile tools up -d
```

That adds:

- Flower at `http://localhost:5555`
- Adminer at `http://localhost:8080`

### 4. Verify

```bash
curl http://localhost:4000/health
```

Then visit:

- `http://localhost:3000` for the app
- `http://localhost:3000/admin` for the admin login

The admin password is your `ADMIN_SECRET_KEY`.

## Local Development

There are two practical ways to work locally.

### Option A: Full stack in Docker

This is the easiest path when you want the same topology as production.

```bash
docker compose up -d --build
```

### Option B: Web/API on host, infra + agent managed separately

Use this when you want fast TypeScript iteration.

```bash
npm install
cp .env.example .env
docker compose up -d postgres redis
npm run dev
```

`npm run dev` starts the Node workspaces, but not the Python agent. To run the agent locally on your machine:

```bash
cd services/agent
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn agent.api:app --host 0.0.0.0 --port 8001 --reload
```

In separate shells:

```bash
cd services/agent
source .venv/bin/activate
celery -A agent.celery_app worker -Q discovery,finalize --loglevel=info --concurrency=4
```

```bash
cd services/agent
source .venv/bin/activate
celery -A agent.celery_app beat --loglevel=info
```

For host-based development, the default `.env.example` values already point `AGENT_URL` at `http://localhost:8001`.

## Useful Commands

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm test
python3 -m pytest services/agent/tests
```

`npm test` currently runs the API test suite from the repo root.

## LLM Routing

When Azure AI Foundry is configured, the agent uses the configured deployment as the primary chat provider across tasks. Otherwise the router falls back to:

1. Gemini for fast and cheap tier-1 tasks
2. Claude for mid-tier and high-quality tasks
3. Ollama as the local fallback

You can override the default Gemini and Claude model names with:

- `LLM_TIER1_MODEL`
- `LLM_TIER2_MODEL`
- `LLM_TIER3_MODEL`

The full environment reference lives in [.env.example](.env.example) and [docs/wiki/LLM-Providers.md](docs/wiki/LLM-Providers.md).

## Ads, Analytics, and Articles

These pieces are optional and can stay unset for local development:

- `NEXT_PUBLIC_ADSENSE_CLIENT_ID` and `NEXT_PUBLIC_DISABLE_ADS`
- `NEXT_PUBLIC_UMAMI_ENABLED`, `NEXT_PUBLIC_UMAMI_SRC`, `NEXT_PUBLIC_UMAMI_RECORDER_SRC`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID`
- `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`
- `ARTICLE_PUBLISH_API_KEY`
- `AZURE_STORAGE_CONNECTION_STRING` and `AZURE_STORAGE_CONTAINER`

If Blob Storage is not configured, published articles keep their original remote image URLs.

## Documentation

- [Self-Hosting Guide](docs/SELF_HOSTING.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Architecture](docs/architecture.md)
- [Wiki Home](docs/wiki/Home.md)
- [Roadmap](docs/ROADMAP-production-issues.md)
- [Contributing](CONTRIBUTING.md)

## License

AGPL. See [LICENSE](LICENSE).
