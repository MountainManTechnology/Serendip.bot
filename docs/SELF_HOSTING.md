# Self-Hosting Guide

This guide explains how to self-host Serendip Bot on your own infrastructure.

## Requirements

### System Requirements

- Docker and Docker Compose (or Kubernetes)
- 4GB RAM minimum (2GB per container)
- 20GB disk space
- Ubuntu 22.04 LTS or equivalent (or macOS for development)

### Services

- PostgreSQL 15+ with pgvector extension
- Redis 7+ for job queue and caching
- Node.js 20+ LTS
- Python 3.11+ for discovery agent

## Quick Start (Docker Compose)

### 1. Clone and Setup

```bash
git clone https://github.com/yourusername/serendip-bot.git
cd serendip-bot
cp .env.example .env
```

### 2. Configure Environment

Edit `.env` with your settings:

```bash
# Database
DATABASE_URL="postgresql://stumble:password@localhost:5432/stumble_ai"
REDIS_URL="redis://localhost:6379"

# Required shared secrets
INTERNAL_API_TOKEN="$(openssl rand -hex 32)"
ADMIN_SECRET_KEY="$(openssl rand -hex 32)"

# Discovery Agent
GEMINI_API_KEY="your-gemini-key"  # Primary LLM provider
ANTHROPIC_API_KEY="your-anthropic-key"  # Fallback provider (optional)

# Frontend
NEXT_PUBLIC_API_URL="http://localhost:4000"
NEXT_PUBLIC_SITE_URL="https://yourdomain.com"

# Monetization (Google AdSense)
NEXT_PUBLIC_ADSENSE_CLIENT_ID="ca-pub-xxxxxxxxxxxxxxxx"  # Optional
NEXT_PUBLIC_DISABLE_ADS="false"

# Error Tracking (Optional)
NEXT_PUBLIC_SENTRY_DSN=""  # Optional

# LLM Fallback
OLLAMA_BASE_URL="http://localhost:11434"  # Local Ollama (optional)
```

Docker Compose and the Python agent read `.env`, not `.env.local`.

### 3. Start Services

```bash
docker-compose up -d
```

This starts:

- PostgreSQL (port 5432)
- Redis (port 6379)
- API server (port 4000)
- Web frontend (port 3000)
- Discovery agent (background)

### 4. Verify Installation

```bash
# Check health endpoint
curl http://localhost:4000/health

# Check web frontend
open http://localhost:3000
```

## Configuration

### Database Setup

PostgreSQL should have pgvector extension installed:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

The app automatically runs migrations on startup.

### LLM Provider Hierarchy

The discovery agent uses this fallback chain:

1. **Gemini** (google-genai) — Primary, fastest
2. **Claude** (anthropic) — Fallback, slower
3. **Ollama** (local) — Fallback, requires local setup
4. **Error** — If all fail, job dead-letters

Set API keys in `.env`:

```bash
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=...
OLLAMA_BASE_URL=http://localhost:11434
```

### Redis Configuration

For better performance with BullMQ queue:

```bash
# In redis.conf or docker-compose override:
maxmemory 512mb
maxmemory-policy allkeys-lru
```

### Domain & SSL

For production, use a reverse proxy (nginx/Caddy):

```nginx
# nginx.conf
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

## Monitoring

### Logs

View service logs:

```bash
docker-compose logs -f api      # API server
docker-compose logs -f web      # Frontend (dev mode)
docker-compose logs -f postgres # Database
docker-compose logs -f redis    # Cache/queue
```

### Health Checks

```bash
# API health
curl http://localhost:4000/health

# Database
psql postgresql://stumble:password@localhost:5432/stumble_ai -c "SELECT 1"

# Redis
redis-cli PING
```

### Dead Letter Queue

Check failed discovery jobs:

```bash
redis-cli
> HGETALL bull:deadLetter
```

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

Redis data persists in Docker volumes automatically. For manual backup:

```bash
docker-compose exec redis redis-cli BGSAVE
docker cp serendip-bot-redis-1:/data/dump.rdb ./redis-backup.rdb
```

## Scaling

### Horizontal Scaling (Multiple API Instances)

```bash
# Update docker-compose.yml
services:
  api:
    deploy:
      replicas: 3
```

### Using Kubernetes

Use the Helm chart (if provided) or create manifests for:

- PostgreSQL StatefulSet
- Redis StatefulSet
- API Deployment (3 replicas)
- Web Deployment (2 replicas)
- Discovery Agent CronJob

### Load Balancing

Use Nginx or a cloud load balancer to distribute traffic:

```bash
# Requests → Load Balancer → [API 1, API 2, API 3]
```

All instances share PostgreSQL and Redis, so session state is consistent.

## Monetization

### Google AdSense

1. Sign up at https://www.google.com/adsense/
2. Copy your Client ID (ca-pub-...)
3. Set in `.env`:
   ```bash
   NEXT_PUBLIC_ADSENSE_CLIENT_ID="ca-pub-xxxxxxxxxxxxxxxx"
   ```
4. Ads appear automatically on discovery feed
5. To disable: `NEXT_PUBLIC_DISABLE_ADS=true`

### Custom Advertising

To add your own ad network:

1. Create `src/components/ads/CustomAdSlot.tsx`
2. Import in `DiscoveryFeed.tsx`
3. Replace `AdSlot` component in the ads section

Example custom ad slot (simple banner):

```tsx
export function CustomAdSlot({ className }: { className?: string }) {
  return (
    <div className={`bg-blue-600 text-white p-4 rounded-lg ${className || ""}`}>
      <p className="text-sm">Your Ad Here - sponsor.com</p>
    </div>
  );
}
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill and restart
kill -9 <PID>
docker-compose restart
```

### Database Connection Error

```bash
# Test connection
psql postgresql://stumble:password@localhost:5432/stumble_ai

# Check if postgres is running
docker-compose logs postgres
```

### Slow Discovery

- Check LLM API rate limits
- Verify Redis is running (`redis-cli PING`)
- Review dead-letter queue for errors
- Increase BullMQ timeout in `apps/api/src/queue/discovery.queue.ts`

### Out of Memory

```bash
# Increase container limits in docker-compose.yml
services:
  postgres:
    mem_limit: 4g
  redis:
    mem_limit: 1g
  api:
    mem_limit: 1g
```

## Production Checklist

- [ ] Disable debug mode (`NODE_ENV=production`)
- [ ] Set strong database password
- [ ] Configure SSL/TLS with Let's Encrypt
- [ ] Set up regular backups (daily)
- [ ] Monitor disk space and database size
- [ ] Configure rate limiting on API
- [ ] Set up log aggregation (e.g., ELK Stack)
- [ ] Configure Sentry for error tracking
- [ ] Set up health check monitoring
- [ ] Document custom configurations
- [ ] Create incident response plan
- [ ] Test disaster recovery procedure

## Support

For issues or questions:

1. Check logs: `docker-compose logs`
2. Review this guide
3. File issue on GitHub
4. Community Discord (if available)

## License

See LICENSE file in repository root.
