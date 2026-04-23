# Deployment

Production deployment guides for Serendip Bot on major cloud platforms.

## Table of Contents

- [Platform Comparison](#platform-comparison)
- [Railway (Recommended for Getting Started)](#railway-recommended-for-getting-started)
- [Fly.io](#flyio)
- [Azure App Service](#azure-app-service)
- [AWS](#aws)
- [DigitalOcean](#digitalocean)

---

## Platform Comparison

| Platform         | Cost            | Setup Time | Scaling   | Best For                            |
| ---------------- | --------------- | ---------- | --------- | ----------------------------------- |
| **Railway**      | Pay-per-use     | ~15 min    | Automatic | Getting started, low traffic        |
| **Fly.io**       | Monthly + usage | ~15 min    | Automatic | Global distribution, steady traffic |
| **Azure**        | Monthly + usage | ~30 min    | Automatic | Enterprise, Microsoft ecosystem     |
| **AWS**          | Complex pricing | ~1 hour    | Manual    | High-scale production               |
| **DigitalOcean** | Fixed pricing   | ~20 min    | Manual    | Predictable costs                   |

All deployments require:

- PostgreSQL 15+ with pgvector extension
- Redis 7+
- At least one LLM API key (Gemini recommended as primary)

---

## Railway (Recommended for Getting Started)

### 1. Create Project

1. Sign up at [railway.app](https://railway.app) with GitHub
2. Click "New Project" → "Deploy from GitHub"
3. Select the SerendipBot repository

### 2. Add Infrastructure Services

Add **PostgreSQL** and **Redis** via the Railway dashboard ("Add Service" → select each). Note the connection URLs.

### 3. Set Environment Variables

In the Railway dashboard, go to Variables:

```bash
DATABASE_URL=<from PostgreSQL service>
REDIS_URL=<from Redis service>
NEXT_PUBLIC_API_URL=https://your-app.railway.app
API_PORT=4000
GEMINI_API_KEY=your-key
ANTHROPIC_API_KEY=your-key           # Optional fallback
NEXT_PUBLIC_ADSENSE_CLIENT_ID=ca-pub-...  # Optional
```

### 4. Deploy

Railway auto-deploys from the `main` branch using the existing Dockerfiles:

- `apps/api/Dockerfile` — API server
- `apps/web/Dockerfile` — Web frontend
- `services/agent/Dockerfile` — Discovery agent

### 5. Custom Domain

In Railway project settings: Custom Domain → Add → Point DNS → Enable auto-SSL.

---

## Fly.io

### 1. Install CLI & Login

```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh

fly auth login
```

### 2. Initialize

```bash
cd serendip-bot
fly launch --no-deploy
```

### 3. Create Infrastructure

```bash
fly postgres create --name stumble-db --region sea
fly redis create --name stumble-redis --region sea
```

### 4. Configure `fly.toml`

```toml
app = "serendip-bot"
primary_region = "sea"

[env]
  DATABASE_URL = "..."
  REDIS_URL = "..."

[[services]]
  internal_port = 4000
  protocol = "tcp"
  [[services.ports]]
    handlers = ["http"]
    port = "80"
  [[services.ports]]
    handlers = ["tls", "http"]
    port = "443"
```

### 5. Deploy & Scale

```bash
fly deploy
fly scale vm shared-cpu-1x
fly scale count 3  # multiple instances
```

---

## Azure App Service

### 1. Prerequisites

```bash
brew install azure-cli
az login
az group create --name stumble-rg --location eastus
```

### 2. Create PostgreSQL

```bash
az postgres flexible-server create \
  --resource-group stumble-rg \
  --name stumble-db \
  --admin-user stumble \
  --admin-password YourSecurePassword! \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 15
```

### 3. Create Redis

```bash
az redis create \
  --resource-group stumble-rg \
  --name stumble-cache \
  --location eastus \
  --sku Basic \
  --vm-size c0
```

### 4. Create App Service

```bash
az appservice plan create \
  --name stumble-plan \
  --resource-group stumble-rg \
  --sku B2 \
  --is-linux

# API
az webapp create --resource-group stumble-rg \
  --plan stumble-plan --name stumble-api --runtime "node|20-lts"

# Web
az webapp create --resource-group stumble-rg \
  --plan stumble-plan --name stumble-web --runtime "node|20-lts"
```

### 5. Configure Environment

```bash
az webapp config appsettings set \
  --resource-group stumble-rg --name stumble-api \
  --settings NODE_ENV=production DATABASE_URL="..." REDIS_URL="..." GEMINI_API_KEY="..."
```

---

## AWS

For AWS deployments, use ECS (Fargate) or EC2 with the existing Dockerfiles. Key services needed:

- **RDS PostgreSQL** with pgvector extension
- **ElastiCache Redis**
- **ECS Fargate** or **EC2** for running containers
- **ALB** for load balancing
- **ECR** for container image registry

Refer to the [AWS ECS documentation](https://docs.aws.amazon.com/ecs/) for detailed setup.

---

## DigitalOcean

### 1. Create Droplet or App Platform

For App Platform (managed):

1. Connect your GitHub repo
2. Add a managed PostgreSQL database
3. Add a managed Redis instance
4. Configure environment variables

For Droplets (manual):

1. Create an Ubuntu 22.04 droplet (4GB+ RAM)
2. Install Docker and Docker Compose
3. Follow the [Self-Hosting](Self-Hosting.md) guide

---

## See Also

- [Self-Hosting](Self-Hosting.md) — Docker Compose setup for your own infrastructure
- [Architecture](Architecture.md) — System overview for understanding deployment topology
- [Development Setup](Development-Setup.md) — Local development before deploying
