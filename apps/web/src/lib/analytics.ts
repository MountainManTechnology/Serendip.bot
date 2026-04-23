/**
 * Client-side analytics wrapper for Umami.
 *
 * Usage:
 *   import { track } from '@/lib/analytics'
 *   track('stumble_click', { mood: 'wonder' })
 *
 * The track() function is a no-op if Umami is not loaded (e.g. in SSR,
 * adblocked, or when NEXT_PUBLIC_UMAMI_ENABLED is false).
 *
 * Tracked events (keep this list short and stable — it's the conversion funnel):
 *   stumble_click       — user clicks "Surprise Me"
 *   mood_selected       — user picks a mood from the mood picker
 *   signup_started      — user initiates account creation
 *   signup_completed    — account created successfully
 *   paid_tier_viewed    — pricing/upgrade page viewed
 *   paid_tier_clicked   — upgrade CTA clicked
 */

type TrackData = Record<string, unknown>;

declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: TrackData) => void;
    };
  }
}

/**
 * Track a custom event with Umami.
 *
 * Safe to call in any context — returns immediately if:
 * - Called server-side (no `window`)
 * - Umami script not yet loaded
 * - Umami script blocked by an ad blocker
 */
export function track(event: string, data?: TrackData): void {
  if (typeof window === "undefined") return;
  window.umami?.track(event, data);
}
