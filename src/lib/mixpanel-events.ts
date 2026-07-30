// src/lib/mixpanel-events.ts — Typed event helpers for Mixpanel.
// Each function maps to one event in the tracking plan.
// Add new events here as the tracking plan grows.

import { trackEvent } from './mixpanel';

// ── Event 1: sign_up_completed ────────────────────────────────────────────────
// Fires once after the user completes account creation (post-signup destination).

export function trackSignUpCompleted(
  method: 'email' | 'google' | 'sso',
): void {
  trackEvent('sign_up_completed', {
    sign_up_method: method,
    platform: 'web',
  });
}

// ── Event 2: quote_created ────────────────────────────────────────────────────
// Fires after POST /api/cotizaciones succeeds (new cotización created).

interface QuoteCreatedProps {
  has_items: boolean;
  item_count: number;
  currency: string;
  total_amount: number;
  source: 'manual' | 'ai_draft' | 'duplicate';
}

export function trackQuoteCreated(props: QuoteCreatedProps): void {
  trackEvent('quote_created', props);
}
