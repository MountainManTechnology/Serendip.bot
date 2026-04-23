# Deployment Guide

Deploy Serendip Bot to production on your preferred cloud platform.

## Platform Comparison

| Platform         | Cost                | Setup Time | Scaling   | Best For                            |
| ---------------- | ------------------- | ---------- | --------- | ----------------------------------- |
| **Railway**      | $$$ Pay-per-use     | 15 min     | Automatic | Getting started, low traffic        |
| **Fly.io**       | $$ Monthly + usage  | 15 min     | Automatic | Global distribution, steady traffic |
| **Azure**        | $$ Monthly + usage  | 30 min     | Automatic | Enterprise, Microsoft ecosystem     |
| **AWS**          | $$$ Complex pricing | 1 hour     | Manual    | Scale, high traffic                 |
| **DigitalOcean** | $$ Fixed pricing    | 20 min     | Manual    | Predictable costs, learning         |

## Railway.app (Recommended for Getting Started)

### 1. Create Account

Visit https://railway.app and sign up with GitHub.

### 2. Create New Project

Click "New Project" → "Deploy from GitHub"

- Select your serendip-bot repository
- Authorize Railway to access your repo

### 3. Add Services

#### PostgreSQL Database

```bash
# Click "Add Service" → PostgreSQL
# Railway creates automatically, note the DATABASE_URL
```

#### Redis Cache

```bash
# Click "Add Service" → Redis
# Copy the REDIS_URL
```

#### Environment Variables

In Railway dashboard, go to Variables:

```
DATABASE_URL=<from PostgreSQL service>
REDIS_URL=<from Redis service>
NEXT_PUBLIC_API_URL=https://your-app.railway.app
API_PORT=4000
GEMINI_API_KEY=your-key
CLAUDE_API_KEY=your-key
NEXT_PUBLIC_ADSENSE_CLIENT_ID=ca-pub-...
```

#### Deploy API

Create `Dockerfile.api` in root:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 4000
CMD ["npm", "run", "start:api"]
```

#### Deploy Web

Create `Dockerfile.web` in root:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:web
EXPOSE 3000
CMD ["npm", "run", "start:web"]
```

### 4. Connect Custom Domain

In Railway project settings:

- Custom Domain → Add
- Point DNS to Railway's proxy
- Enable auto-SSL

## Fly.io

### 1. Install CLI

```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh
```

### 2. Login & Initialize

```bash
fly auth login
cd serendip-bot
fly launch --no-deploy
```

### 3. Create PostgreSQL

```bash
fly postgres create \
  --name stumble-db \
  --region sea  # Use your region
```

### 4. Create Redis

```bash
fly redis create \
  --name stumble-redis \
  --region sea
```

### 5. Update fly.toml

```toml
app = "serendip-bot"
primary_region = "sea"

[env]
  DATABASE_URL = "..."  # From fly postgres attach
  REDIS_URL = "..."     # From fly redis attach

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

### 6. Deploy

```bash
fly deploy
```

### 7. Scale

```bash
fly scale show              # View current scale
fly scale vm shared-cpu-1x  # Change machine type
fly scale count 3           # Run 3 instances
```

## Azure App Service (Recommended for Enterprise)

### 1. Prerequisites

```bash
# Install Azure CLI
brew install azure-cli

# Login
az login

# Create resource group
az group create \
  --name stumble-rg \
  --location eastus
```

### 2. Create PostgreSQL Flexible Server

```bash
az postgres flexible-server create \
  --resource-group stumble-rg \
  --name stumble-db \
  --admin-user stumble \
  --admin-password YourPassword123! \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 15
```

### 3. Create Cache for Redis

```bash
az redis create \
  --resource-group stumble-rg \
  --name stumble-cache \
  --location eastus \
  --sku Basic \
  --vm-size c0
```

### 4. Create App Service Plan

```bash
az appservice plan create \
  --name stumble-plan \
  --resource-group stumble-rg \
  --sku B2 \
  --is-linux
```

### 5. Create Web Apps

API:

```bash
az webapp create \
  --resource-group stumble-rg \
  --plan stumble-plan \
  --name stumble-api \
  --runtime "node|20-lts"
```

Web:

```bash
az webapp create \
  --resource-group stumble-rg \
  --plan stumble-plan \
  --name stumble-web \
  --runtime "node|20-lts"
```

### 6. Configure Settings

```bash
# API environment variables
az webapp config appsettings set \
  --resource-group stumble-rg \
  --name stumble-api \
  --settings \
    NODE_ENV=production \
    DATABASE_URL="postgresql://..." \
    REDIS_URL="redis://..." \
    GEMINI_API_KEY="key"

# Web environment variables
az webapp config appsettings set \
  --resource-group stumble-rg \
  --name stumble-web \
  --settings \
    NEXT_PUBLIC_API_URL="https://stumble-api.azurewebsites.net" \
    NEXT_PUBLIC_ADSENSE_CLIENT_ID="ca-pub-..."
```

### 7. Deploy with GitHub Actions

Azure creates GitHub Actions workflow automatically.

## DigitalOcean App Platform

### 1. Connect GitHub

Visit https://cloud.digitalocean.com/apps

"Create App" → Connect GitHub → Select repository

### 2. Configure Services

DigitalOcean detects `docker-compose.yml` automatically.

Adjust settings:

- Set environment variables
- Configure database (managed PostgreSQL)
- Configure cache (managed Redis)

### 3. Deploy

Click "Deploy" — DigitalOcean builds and deploys automatically.

### 4. Custom Domain

In app settings:

- Domains → Add Domain
- Update DNS records

## AWS (For Scale)

### 1. Create RDS PostgreSQL

```bash
aws rds create-db-instance \
  --db-instance-identifier stumble-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username stumble \
  --master-user-password YourPassword123! \
  --allocated-storage 20
```

### 2. Create ElastiCache Redis

```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id stumble-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 1
```

### 3. Create ECS Cluster

```bash
aws ecs create-cluster --cluster-name stumble-cluster
```

### 4. Register Task Definitions

Create `task-definition.json`:

```json
{
  "family": "stumble-api",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "api",
      "image": "YOUR_ECR_URL/stumble-api:latest",
      "portMappings": [{ "containerPort": 4000 }],
      "environment": [
        { "name": "DATABASE_URL", "value": "..." },
        { "name": "REDIS_URL", "value": "..." }
      ]
    }
  ]
}
```

Register:

```bash
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

### 5. Create Service

```bash
aws ecs create-service \
  --cluster stumble-cluster \
  --service-name stumble-api \
  --task-definition stumble-api:1 \
  --desired-count 2
```

## SSL/TLS Certificates

All platforms provide free HTTPS automatically (via Let's Encrypt).

For custom domains, most platforms handle renewal automatically.

## Monitoring & Alerts

### Application Performance Monitoring

Install Sentry for error tracking:

```bash
# 1. Create account at sentry.io
# 2. Create new project for Node.js (API)
# 3. Copy DSN
# 4. Set env var: NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
```

### Log Aggregation

Using Papertrail (free tier available):

```bash
# 1. Create account at papertrailapp.com
# 2. Configure log destination
# 3. View logs in web dashboard
```

### Uptime Monitoring

Use a service like UptimeRobot:

```bash
# Monitor these endpoints:
curl https://your-app.com/api/health  # Should return 200
```

## Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong, randomly generated passwords
- [ ] Configure SSL/TLS (usually automatic)
- [ ] Set up automated backups
- [ ] Configure error tracking (Sentry)
- [ ] Set up log aggregation
- [ ] Configure uptime monitoring
- [ ] Set up database backups (daily)
- [ ] Document disaster recovery
- [ ] Test failover procedures
- [ ] Configure rate limiting
- [ ] Set up DDoS protection (if needed)
- [ ] Document all configuration
- [ ] Create runbook for common issues

## Cost Optimization

### Database

- Use smallest practical tier initially
- Scale up only if needed
- Enable automated backups

### Compute

- Use burstable instance types for low traffic
- Enable auto-scaling based on CPU/memory
- Use reserved instances for steady-state workloads

### Bandwidth

- Cache static assets with CDN
- Compress API responses
- Use CloudFront or similar

## Disaster Recovery

### Backup Strategy

Daily automated backups:

- Database (kept for 7 days)
- Redis (kept for 3 days)

Monthly manual backups:

- Full database export
- Configuration backup

### Recovery Time Objectives (RTO)

- Database: 1 hour (from most recent backup)
- Redis: 5 minutes (ephemeral data)
- Application: 5 minutes (auto-scaling)

### Test Recovery

Monthly:

1. Restore database from backup to test environment
2. Verify all data integrity
3. Document any issues

## Additional Resources

- [Railway Docs](https://docs.railway.app)
- [Fly.io Docs](https://fly.io/docs/)
- [Azure App Service Docs](https://learn.microsoft.com/en-us/azure/app-service/)
- [AWS ECS Docs](https://docs.aws.amazon.com/ecs/)
- [Sentry Docs](https://docs.sentry.io/)
