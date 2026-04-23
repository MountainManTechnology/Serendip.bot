# Frontend

The Serendip Bot frontend (`apps/web`) is a Next.js 15 application with React, Tailwind CSS, and tRPC client integration.

## Table of Contents

- [Overview](#overview)
- [Routes](#routes)
- [Components](#components)
- [tRPC Client](#trpc-client)
- [SEO & Metadata](#seo--metadata)
- [Security Headers](#security-headers)
- [Configuration](#configuration)
- [Styling](#styling)

---

## Overview

The web app serves as the user-facing discovery interface. Key features:

- **Mood-based discovery** — Users pick a mood (Wonder, Learn, Create, Laugh, Chill) to guide AI recommendations
- **Real-time polling** — Frontend polls the API while the Python agent processes discovery jobs
- **Content previews** — Discovered sites shown with title, summary, quality score, and personalized "why" blurbs
- **Feedback loop** — Love/skip/block actions update the user's curiosity profile
- **Articles section** — Editorial content published via the API
- **Ad-supported** — Optional Google AdSense integration

---

## Routes

| Route             | Description                             |
| ----------------- | --------------------------------------- |
| `/`               | Landing page with mood selector and FAQ |
| `/discover`       | Discovery feed (after mood selection)   |
| `/moods/*`        | Mood-specific landing pages             |
| `/daily`          | Daily discovery page                    |
| `/articles/*`     | Editorial articles (date-based URLs)    |
| `/alternatives/*` | SEO comparison pages                    |

Source: `apps/web/src/app/` (Next.js App Router with file-based routing)

---

## Components

Organized by feature in `apps/web/src/components/`:

| Directory    | Purpose                                                      |
| ------------ | ------------------------------------------------------------ |
| `discovery/` | Core discovery UI — `HeroAction`, feed cards, preview modals |
| `articles/`  | Article rendering components                                 |
| `ads/`       | Google AdSense integration                                   |
| `providers/` | `TRPCProvider`, `ErrorBoundary`                              |

### Key Components

- **`HeroAction`** — The mood selector on the landing page ("Surprise Me" button + mood chips)
- **`TRPCProvider`** — Wraps the app with tRPC + React Query client
- **`ErrorBoundary`** — Catches React rendering errors gracefully

---

## tRPC Client

The frontend communicates with the API via tRPC. Client setup is in `apps/web/src/lib/trpc.ts`.

Usage pattern:

```typescript
// Trigger discovery
const result = await trpc.discovery.request.mutate({ mood: "wonder" });

// Poll for results
const data = trpc.discovery.poll.useQuery({ jobId: result.jobId });

// Submit feedback
await trpc.feedback.submit.mutate({ siteCacheId: "...", signal: "love" });
```

---

## SEO & Metadata

The app includes comprehensive SEO configuration in `apps/web/src/app/layout.tsx`:

- **Title template**: `%s · Serendip Bot` with default "AI-Powered StumbleUpon Alternative"
- **Meta description**: Optimized for discovery and StumbleUpon-related searches
- **Keywords**: stumbleupon alternative, random website generator, ai website discovery, etc.
- **Open Graph**: Full OG tags with dynamic image at `/opengraph-image`
- **Twitter Cards**: `summary_large_image` format
- **Robots**: Index + follow with generous googlebot settings
- **Manifest**: PWA manifest at `/manifest.webmanifest`
- **Structured data**: FAQ JSON-LD on the landing page

### Generated Files

| File                  | Purpose                                 |
| --------------------- | --------------------------------------- |
| `robots.ts`           | Dynamic robots.txt                      |
| `sitemap.ts`          | Dynamic sitemap (includes article URLs) |
| `opengraph-image.tsx` | Dynamic OG image generation             |

---

## Security Headers

Configured in `apps/web/next.config.ts`, applied to all routes:

| Header                      | Value                                          |
| --------------------------- | ---------------------------------------------- |
| `X-DNS-Prefetch-Control`    | `on`                                           |
| `X-Frame-Options`           | `DENY`                                         |
| `X-Content-Type-Options`    | `nosniff`                                      |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`              |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()`     |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |

The `Powered-By` header is disabled via `poweredByHeader: false`.

---

## Configuration

### `next.config.ts`

```typescript
const nextConfig: NextConfig = {
  output: "standalone", // Docker-optimized output
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    dangerouslyAllowSVG: false,
  },
};
```

**Image handling**: Remote patterns allow `https://**` since discovered sites have unpredictable image domains. SVG is disabled for security.

### Environment Variables

| Variable                        | Description                                       |
| ------------------------------- | ------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`           | API server URL (e.g., `http://localhost:4000`)    |
| `NEXT_PUBLIC_SITE_URL`          | Public site URL (e.g., `https://serendipbot.com`) |
| `NEXT_PUBLIC_ADSENSE_CLIENT_ID` | Google AdSense client ID                          |
| `NEXT_PUBLIC_DISABLE_ADS`       | Set to `true` to disable ads                      |
| `NEXT_PUBLIC_SENTRY_DSN`        | Sentry error tracking (optional)                  |

---

## Styling

- **Tailwind CSS** — Utility-first styling via `postcss.config.mjs`
- **Inter font** — Loaded via `next/font/google` with `display: swap`
- **Theme color**: `#7c3aed` (violet)
- **Global styles**: `apps/web/src/app/globals.css`

---

## See Also

- [API Reference](API-Reference.md) — Endpoints consumed by the frontend
- [Architecture](Architecture.md) — How the frontend fits into the system
- [Development Setup](Development-Setup.md) — Running the frontend locally
- [Self-Hosting](Self-Hosting.md) — Production frontend deployment
