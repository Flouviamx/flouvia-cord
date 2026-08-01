// src/lib/posthog-events.ts — Typed event helpers for PostHog.
// Each function maps to one event in the tracking plan.
// Add new events here as the tracking plan grows.

import { trackEvent } from './posthog';

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

// ── Event 3: quote_viewed ─────────────────────────────────────────────────────
// Fires when an external user views a quote via the public link.

interface QuoteViewedProps {
  quote_id: string;
  total: number;
  currency: string;
  source: 'public_link';
}

export function trackQuoteViewed(props: QuoteViewedProps): void {
  trackEvent('quote_viewed', props);
}

// ── Event 4: quote_approved ───────────────────────────────────────────────────
// Fires when a quote is approved (externally or manually by internal user).

interface QuoteApprovedProps {
  quote_id: string;
  total?: number;
  currency?: string;
  source: 'manual' | 'external';
}

export function trackQuoteApproved(props: QuoteApprovedProps): void {
  trackEvent('quote_approved', props);
}

// ── Event 5: quote_sent ───────────────────────────────────────────────────────
// Fires when an internal user clicks to send a quote or copies the link.

interface QuoteSentProps {
  quote_id: string;
}

export function trackQuoteSent(props: QuoteSentProps): void {
  trackEvent('quote_sent', props);
}

// ── Event 6: ai_draft_used ────────────────────────────────────────────────────
// Fires when an internal user uses the "Armar con IA" feature.

interface AiDraftUsedProps {
  has_file: boolean;
  has_text: boolean;
  item_count: number;
}

export function trackAiDraftUsed(props: AiDraftUsedProps): void {
  trackEvent('ai_draft_used', props);
}
