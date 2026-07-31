// src/lib/posthog.ts — PostHog client-side initialization and identity helpers.
// Uses the CDN-loaded global `posthog` object (loaded via <script> in layouts).
// All tracking code should import helpers from here or from posthog-events.ts.

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
 * Generic event tracker with type safety.
 * Prefer the typed wrappers in posthog-events.ts for known events.
 */
export function trackEvent(eventName: string, properties?: Record<string, any>): void {
  const ph = getPostHog();
  if (!ph) return;
  ph.capture(eventName, properties);
}
