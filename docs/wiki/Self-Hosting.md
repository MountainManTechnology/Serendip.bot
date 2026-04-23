# Self-Hosting

Run Serendip Bot on your own infrastructure with Docker Compose.

## Table of Contents

- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Environment Configuration](#environment-configuration)
- [Redis Configuration](#redis-configuration)
- [Domain & SSL](#domain--ssl)
- [Monitoring](#monitoring)
- [Backup & Recovery](#backup--recovery)
- [Scaling](#scaling)
- [Monetization](#monetization)

---

## Requirements

### System

- Docker and Docker Compose v2+
- 4 GB RAM minimum (2 GB per container)
- 20 GB disk space
- Ubuntu 22.04 LTS or equivalent (macOS for development)

### Services

- PostgreSQL 15+ with pgvector extension
- Redis 7+
- Node.js 20+ LTS
- Python 3.11+

### LLM Provider

At least one API key:

- **Gemini** (recommended primary) — fastest, cheapest
- **Anthropic Claude** — fallback
- **Ollama** — fully local, no API key needed

---

## Quick Start

### 1. Clone & Configure

```bash
git clone https://github.com/MountainManTechnology/Serendip.bot.git
cd serendip-bot
cp .env.example .env.local
```

### 2. Edit Environment

Edit `.env.local`:

```bash
# Database
DATABASE_URL="postgresql://stumble:password@localhost:5432/stumble_ai"
REDIS_URL="redis://localhost:6379"

# Node→Agent authentication
INTERNAL_API_TOKEN="generate-a-random-secret-here"
ADMIN_SECRET_KEY="generate-another-secret-here"

# LLM Providers (at least one required)
GEMINI_API_KEY="your-gemini-key"
ANTHROPIC_API_KEY="your-claude-key"    # Optional fallback
OLLAMA_BASE_URL="http://localhost:11434"  # Optional local

# Frontend
NEXT_PUBLIC_API_URL="http://localhost:4000"

# Ads (optional)
NEXT_PUBLIC_ADSENSE_CLIENT_ID="ca-pub-..."
NEXT_PUBLIC_DISABLE_ADS="false"
```

### 3. Start Services

```bash
docker-compose up -d
```

This starts:

| Service      | Port | Description                             |
| ------------ | ---- | --------------------------------------- |
| postgres     | 5432 | Primary database with pgvector          |
| redis        | 6379 | Celery broker/backend + app cache       |
| api          | 4000 | Hono + tRPC server                      |
| web          | 3000 | Next.js frontend                        |
| agent-api    | 8001 | FastAPI HTTP shim (private, Node→Agent) |
| agent-worker | —    | Celery workers (2 replicas by default)  |
| agent-beat   | —    | Celery Beat scheduler (singleton)       |
| flower       | 5555 | Celery task monitoring UI               |

> **Note**: `adminer` (DB admin UI on port 8080) starts only with `--profile tools`.

### 4. Verify

```bash
curl http://localhost:4000/health
# → { "status": "ok", "timestamp": "..." }

open http://localhost:3000
```

---

## Environment Configuration

| Variable                        | Required    | Default                  | Description                            |
| ------------------------------- | ----------- | ------------------------ | -------------------------------------- |
| `DATABASE_URL`                  | Yes         | —                        | PostgreSQL connection string           |
| `REDIS_URL`                     | Yes         | `redis://localhost:6379` | Redis connection string (DB 0)         |
| `CELERY_BROKER_URL`             | No          | `{REDIS_URL}/1`          | Celery broker (DB 1)                   |
| `CELERY_RESULT_BACKEND`         | No          | `{REDIS_URL}/2`          | Celery result backend (DB 2)           |
| `INTERNAL_API_TOKEN`            | Yes         | —                        | Shared secret for Node→Agent HTTP auth |
| `GEMINI_API_KEY`                | Recommended | —                        | Google Gemini API key (Tier 1)         |
| `ANTHROPIC_API_KEY`             | No          | —                        | Anthropic Claude API key (Tier 2/3)    |
| `OLLAMA_BASE_URL`               | No          | `http://localhost:11434` | Local Ollama URL                       |
| `AZURE_AI_FOUNDRY_ENDPOINT`     | No          | —                        | Azure AI Foundry endpoint              |
| `AZURE_AI_FOUNDRY_API_KEY`      | No          | —                        | Azure AI Foundry key                   |
| `AZURE_AI_FOUNDRY_DEPLOYMENT`   | No          | —                        | Chat model deployment name             |
| `NEXT_PUBLIC_API_URL`           | Yes         | —                        | Public URL of the API server           |
| `CORS_ORIGINS`                  | No          | `http://localhost:3000`  | Comma-separated allowed origins        |
| `PORT`                          | No          | `4000`                   | API server port                        |
| `ADMIN_SECRET_KEY`              | Yes (prod)  | —                        | Admin dashboard secret                 |
| `FLOWER_USER`                   | No          | `admin`                  | Flower UI username                     |
| `FLOWER_PASSWORD`               | No          | `localdev`               | Flower UI password                     |
| `NEXT_PUBLIC_ADSENSE_CLIENT_ID` | No          | —                        | Google AdSense client ID               |
| `NEXT_PUBLIC_DISABLE_ADS`       | No          | `false`                  | Disable ads entirely                   |
| `SENTRY_DSN`                    | No          | —                        | Sentry error tracking DSN              |

See [LLM Providers](LLM-Providers.md) for detailed provider configuration.

---

## Redis Configuration

Redis tuning for queue performance (BullMQ & Celery):

```bash
# redis.conf or docker-compose override
maxmemory 512mb
maxmemory-policy allkeys-lru
# For BullMQ compatibility, use `maxmemory-policy allkeys-lru` and
# keep `maxmemory` large enough for queue workloads. Celery (Redis broker)
# has no special maxmemory requirement but ensure persistence and backups
# are configured for your traffic patterns.
```

---

## Domain & SSL

For production, use a reverse proxy (nginx or Caddy):

```nginx
upstream api {
  server localhost:4000;
}
upstream web {
  server localhost:3000;
}

server {
  listen 443 ssl;
  server_name example.com;

  ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

  location /api/ {
    proxy_pass http://api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }

  location / {
    proxy_pass http://web;
    proxy_set_header Host $host;
  }
}
```

---

## Monitoring

### Logs

```bash
docker-compose logs -f api          # API server
docker-compose logs -f web          # Frontend
docker-compose logs -f agent-api    # FastAPI shim
docker-compose logs -f agent-worker # Celery workers
docker-compose logs -f agent-beat   # Celery scheduler
docker-compose logs -f postgres     # Database
docker-compose logs -f redis        # Cache/queue
```

### Health Checks

```bash
curl http://localhost:4000/health                    # API
curl http://localhost:8001/healthz                   # Agent API
psql "$DATABASE_URL" -c "SELECT 1"                   # Database
redis-cli -u "$REDIS_URL" PING                       # Redis
```

### Celery Monitoring

Visit `http://localhost:5555` for the Flower task monitoring UI (login: `FLOWER_USER`/`FLOWER_PASSWORD`).

```bash
# Check active workers from CLI
celery -A agent.celery_app inspect active
```

### Dead Letter Queue

Check failed telemetry events:

```bash
redis-cli LLEN "metrics:events:dlq"
```

---

## Backup & Recovery

### Database Backup

```bash
docker-compose exec postgres pg_dump -U stumble stumble_ai > backup.sql
```

### Database Restore

```bash
docker-compose exec -T postgres psql -U stumble stumble_ai < backup.sql
```

### Redis Backup

```bash
docker-compose exec redis redis-cli BGSAVE
docker cp serendip-bot-redis-1:/data/dump.rdb ./redis-backup.rdb
```

---

## Scaling

### Horizontal (Multiple Workers / API Instances)

```bash
# Scale Celery workers
docker compose up --scale agent-worker=4

# Scale API instances (all share PostgreSQL and Redis)
docker compose up --scale api=3
```

All instances share PostgreSQL and Redis, so session state is consistent.

### Kubernetes

Create manifests for:

- PostgreSQL StatefulSet
- Redis StatefulSet
- API Deployment (N replicas)
- Web Deployment (N replicas)
- Agent API Deployment (N replicas)
- Agent Worker Deployment (N replicas)
- Agent Beat Deployment (**exactly 1 replica**)

---

## Monetization

### Google AdSense

1. Sign up at [google.com/adsense](https://www.google.com/adsense/)
2. Copy your Client ID (`ca-pub-...`)
3. Set `NEXT_PUBLIC_ADSENSE_CLIENT_ID` in `.env`
4. Ads appear automatically on the discovery feed
5. To disable: `NEXT_PUBLIC_DISABLE_ADS=true`

---

## See Also

- [Deployment](Deployment.md) — Cloud platform deployment guides
- [Development Setup](Development-Setup.md) — Local development environment
- [LLM Providers](LLM-Providers.md) — Configure AI providers
- [Architecture](Architecture.md) — System overview
