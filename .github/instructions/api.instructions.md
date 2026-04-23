---
applyTo: apps/api/**
---

# API (Hono + tRPC) Conventions

## Structure

```
src/
  index.ts          # Hono app entry, middleware registration, server startup
  trpc.ts           # tRPC context, createContext, initTRPC
  routers/
    index.ts        # appRouter aggregator — aggregate only, no logic here
    *.ts            # One file per domain (discovery, feedback, admin, …)
  lib/
    auth.ts         # requirePublishKey, timing-safe comparisons
    db.ts           # createDb, DATABASE_URL validation
    logger.ts       # pino instance — import and use, don't re-create
    redis.ts        # ioredis client
    telemetry.ts    # fire-and-forget metrics push
    cache.service.ts
  services/
    *.service.ts    # Domain services (image, profile, …)
  queue/
    *.queue.ts      # BullMQ queue definitions and enqueue helpers
```

## tRPC

- Procedures live in `routers/<domain>.ts`; export a single `<domain>Router`
- Aggregate only in `routers/index.ts` — no logic, no imports beyond routers
- Use `publicProcedure` for unauthenticated routes, extend for auth
- Always validate input with Zod inline (`.input(z.object({…}))`)
- Never expose raw DB/internal errors to the client — map to TRPCError with a safe message

## Auth & Security

- Secret comparisons use `timingSafeEqual` (Node `crypto`) — never `===`
- Cookie values with special characters must pass through `decodeURIComponent()` before comparison
- Admin routes validated via `admin_session` cookie against `ADMIN_SECRET_KEY`
- Publish routes validated via `requirePublishKey` middleware

## Logging

- Use the pino instance from `lib/logger.ts` — never `console.log`
- Structured fields: always include `requestId` (from `x-request-id` header) in request-scoped logs
- Never log secrets, tokens, session IDs, or PII at any level

## Queue / BullMQ

- Queue definitions and `enqueue*` helpers live in `queue/<domain>.queue.ts`
- Use `maxRetriesPerRequest: null` on the ioredis client for BullMQ compatibility
- Telemetry pushes are fire-and-forget — wrap in try/catch, never await in request path

## Env Vars

| Var                       | Default                  | Notes                               |
| ------------------------- | ------------------------ | ----------------------------------- |
| `PORT`                    | `4000`                   |                                     |
| `DATABASE_URL`            | required                 | Postgres                            |
| `REDIS_URL`               | `redis://localhost:6379` |                                     |
| `AGENT_URL`               | `http://agent-api:8001`  |                                     |
| `INTERNAL_API_TOKEN`      | required                 | Shared secret with agent            |
| `CORS_ORIGINS`            | `http://localhost:3000`  | Comma-separated                     |
| `ADMIN_SECRET_KEY`        | required                 | Admin cookie auth                   |
| `ARTICLE_PUBLISH_API_KEY` | required                 | Article publish auth                |
| `LOG_LEVEL`               | `info`                   |                                     |
| `NODE_ENV`                | —                        | Affects log format (pretty vs JSON) |
