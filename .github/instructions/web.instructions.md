---
applyTo: apps/web/**
---

# Web (Next.js 15 App Router) Conventions

## Structure

```
src/
  app/
    layout.tsx              # Root layout — TRPCProvider, ErrorBoundary
    page.tsx                # Landing
    discover/page.tsx       # Discovery hero + example cards
    discover/[jobId]/page.tsx  # Live polling feed (client component)
    <domain>/page.tsx       # One directory per domain
    api/                    # Route handlers only — no business logic
  components/
    <domain>/               # Co-locate components with their domain
    layout/                 # Header, footer, nav
    providers/              # TRPCProvider, ErrorBoundary
  lib/
    trpc.ts                 # createTRPCReact<AppRouter>() — import, don't re-create
    session.ts              # Session helpers
    analytics.ts            # GA/analytics
```

## Components

- Server Components by default; add `"use client"` only when needed (hooks, event handlers, browser APIs)
- tRPC mutations and queries only in Client Components
- Sanitize any HTML from the crawler with `dompurify` before rendering

## tRPC / React Query

- Import `trpc` from `~/lib/trpc` — do not call `createTRPCReact` elsewhere
- `TRPCProvider` is already configured at the root — do not nest additional providers
- `QueryClient` settings: `staleTime: 30_000`, `retry: 1` — don't override per-query without a reason
- Polling pattern: `trpc.<router>.poll.useQuery(id, { refetchInterval: … })`
- Mutations: use `onSuccess`/`onError` callbacks; don't swallow errors silently

## Sentry

- Sentry is initialized in `instrumentation.ts` (server) and `instrumentation-client.ts` (client)
- Use `Sentry.captureException()` for caught errors in Server Actions and API routes
- `ErrorBoundary` in `components/providers/ErrorBoundary.tsx` handles client-side crashes
- Do not add a second Sentry init — use the existing configuration

## Security Headers

These are set in `next.config.ts` and must not be weakened:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — camera/microphone/geolocation disabled

## Metadata / SEO

- Set `metadata` export in every `page.tsx`; include `title`, `description`, and canonical via `NEXT_PUBLIC_SITE_URL`
- OG image uses the shared `/opengraph-image` route — don't duplicate per-page unless the page has a unique image

## Env Vars

| Var                             | Default                   | Notes          |
| ------------------------------- | ------------------------- | -------------- |
| `NEXT_PUBLIC_API_URL`           | `http://localhost:4000`   | tRPC base URL  |
| `NEXT_PUBLIC_SITE_URL`          | `https://serendipbot.com` | Canonical base |
| `NEXT_PUBLIC_SENTRY_DSN`        | optional                  |                |
| `NEXT_PUBLIC_ADSENSE_CLIENT_ID` | optional                  |                |
