// src/lib/posthog.ts — PostHog client-side identity helpers for React islands.
// Uses the CDN-loaded global `posthog` object (loaded via <script> in layouts).
// Plain `.astro` <script> blocks should use window.cordTrack instead (it also
// tags is_sandbox/is_demo — see AppLayout.astro/Layout.astro).

declare global {
  interface Window {
    posthog?: any;
  }
}

/** Safe accessor — returns the global posthog instance or undefined if not loaded. */
export function getPostHog(): any | undefined {
  return typeof window !== 'undefined' ? window.posthog : undefined;
}

/**
 * Identify the current user in PostHog.
 * Call on every authenticated page load (login, signup, session restore).
 * @param userId  Stable unique ID (userId — never email)
 * @param traits  Optional user profile properties ($name, $email, plan_type, etc.)
 */
export function identifyUser(userId: string, traits?: Record<string, any>): void {
  const ph = getPostHog();
  if (!ph) return;
  if (traits && Object.keys(traits).length > 0) {
    ph.identify(userId, traits);
  } else {
    ph.identify(userId);
  }
}

/**
 * Reset PostHog identity on logout.
 * Clears distinct_id and generates a new anonymous ID.
 */
export function resetUser(): void {
  const ph = getPostHog();
  if (!ph) return;
  ph.reset();
}

/**
 * Generic event tracker for React islands (outside the Astro <script> world,
 * where `window.cordTrack` — defined in AppLayout.astro/Layout.astro — is the
 * standard). Does NOT tag is_sandbox/is_demo the way cordTrack does; prefer
 * cordTrack from plain `.astro` scripts.
 */
export function trackEvent(eventName: string, properties?: Record<string, any>): void {
  const ph = getPostHog();
  if (!ph) return;
  ph.capture(eventName, properties);
}
