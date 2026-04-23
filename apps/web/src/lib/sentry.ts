/**
 * Sentry error tracking configuration for production monitoring.
 * Initialize this in next.config.ts using the Sentry SDK.
 *
 * Required environment variable:
 * - NEXT_PUBLIC_SENTRY_DSN (get from https://sentry.io)
 *
 * Setup:
 * 1. npm install --save-dev @sentry/nextjs
 * 2. Sign up at https://sentry.io
 * 3. Create a new Next.js project
 * 4. Copy the DSN to NEXT_PUBLIC_SENTRY_DSN in .env.local
 * 5. The SDK is injected automatically via next.config.ts
 *
 * Usage:
 * - Errors are captured automatically by the SDK
 * - Use Sentry.captureException() for manual error logging
 * - Use Sentry.captureMessage() for info/debug messages
 * - Error Boundary will send caught errors to Sentry
 */

// Sentry is optional for Phase 4 — install via npm when ready
// import * as Sentry from '@sentry/nextjs'
// See: https://docs.sentry.io/platforms/javascript/guides/nextjs/
