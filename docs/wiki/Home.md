# Serendip Bot Wiki

Serendip Bot is an AI-powered web discovery engine — a modern StumbleUpon alternative that finds small, wonderful websites curated by your curiosity.

## Table of Contents

- [Architecture](Architecture.md) — System overview, data flows, and package graph
- [API Reference](API-Reference.md) — tRPC routers, REST endpoints, and middleware
- [Database Schema](Database-Schema.md) — Tables, indexes, migrations, and Drizzle ORM usage
- [Python Agent](Python-Agent.md) — Discovery agent, crawler, seed system, and orchestration
- [LLM Providers](LLM-Providers.md) — Provider routing, tier system, and configuration
- [Frontend](Frontend.md) — Next.js web app, routes, components, and SEO
- [Deployment](Deployment.md) — Production deployment guides for Railway, Fly.io, Azure, AWS, and DigitalOcean
- [Self-Hosting](Self-Hosting.md) — Docker Compose setup, environment configuration, and monitoring
- [Development Setup](Development-Setup.md) — Local development environment and monorepo tooling
- [Contributing](Contributing.md) — Code style, PR process, and project conventions

---

## Quick Links

| What        | Where                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| Source Code | [github.com/MountainManTechnology/Serendip.bot](https://github.com/MountainManTechnology/Serendip.bot) |
| Live Site   | [serendipbot.com](https://serendipbot.com)                               |
| Issues      | [GitHub Issues](https://github.com/MountainManTechnology/Serendip.bot/issues)           |
| License     | MIT                                                                      |

---

## Tech Stack

| Layer         | Technology                                 |
| ------------- | ------------------------------------------ |
| Frontend      | Next.js 15, React, Tailwind CSS            |
| API           | Hono, tRPC                                 |
| Database      | PostgreSQL + pgvector                      |
| Cache/Queue   | Redis                                      |
| AI Agent      | Python 3.11+, Celery, httpx, BeautifulSoup |
| LLM Providers | Gemini, Claude, Azure AI Foundry, Ollama   |
| Monorepo      | Turborepo, npm workspaces                  |
| CI/CD         | GitHub Actions                             |

---

## How It Works

1. **User picks a mood** — Wonder, Learn, Create, Laugh, Chill, or more
2. **API calls the Agent API** (FastAPI on port 8001) which enqueues a Celery discovery task
3. **Celery worker** picks up the task, selects seed URLs from RSS feeds and Redis sets, crawls the web
4. **LLM pipeline** evaluates quality, extracts summaries, generates personalized blurbs
5. **Results are cached** in Redis and persisted to PostgreSQL
6. **Frontend polls** for results and renders a curated discovery feed
7. **User feedback** (love/skip/block) updates a curiosity profile for better future recommendations

---

## See Also

- [Architecture](Architecture.md) — Start here for a technical deep dive
- [Development Setup](Development-Setup.md) — Get the project running locally
- [Contributing](Contributing.md) — Ready to contribute?
