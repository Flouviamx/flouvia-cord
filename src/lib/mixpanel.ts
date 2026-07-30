// src/lib/mixpanel.ts — Mixpanel client-side initialization and identity helpers.
// Uses the CDN-loaded global `mixpanel` object (loaded via <script> in layouts).
// All tracking code should import helpers from here or from mixpanel-events.ts.

declare global {
  interface Window {
    mixpanel?: any;
  }
}

/** Safe accessor — returns the global mixpanel instance or undefined if not loaded. */
export function getMixpanel(): any | undefined {
  return typeof window !== 'undefined' ? window.mixpanel : undefined;
}

/**
 * Identify the current user in Mixpanel.
 * Call on every authenticated page load (login, signup, session restore).
 * @param userId  Stable unique ID (Clerk userId — never email)
 * @param traits  Optional user profile properties ($name, $email, plan_type, etc.)
 */
export function identifyUser(userId: string, traits?: Record<string, any>): void {
  const mp = getMixpanel();
  if (!mp) return;
  mp.identify(userId);
  if (traits && Object.keys(traits).length > 0) {
    mp.people.set(traits);
  }
}

/**
 * Reset Mixpanel identity on logout.
 * Clears distinct_id and generates a new anonymous ID.
 */
export function resetUser(): void {
  const mp = getMixpanel();
  if (!mp) return;
  mp.reset();
}

/**
 * Generic event tracker with type safety.
 * Prefer the typed wrappers in mixpanel-events.ts for known events.
 */
export function trackEvent(eventName: string, properties?: Record<string, any>): void {
  const mp = getMixpanel();
  if (!mp) return;
  mp.track(eventName, properties);
}
