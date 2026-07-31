# Analytics Tracking — PostHog

This project uses **PostHog** for all product analytics. PostHog is the single source of truth for event tracking, user identification, and behavioral data. Do not introduce any other analytics tools, SDKs, or tracking libraries without explicit instruction from a user.

> **Note:** Vercel Analytics (`@vercel/analytics`) coexists for page-level web analytics (traffic, Core Web Vitals). PostHog handles product analytics (user actions, funnels, retention). They serve different purposes and do not conflict.

---

## Before You Add or Modify Any Tracking

**Do not write PostHog tracking code without reading this file first.**

Wrong assumptions about platform, identity, or consent will produce broken PostHog data that requires manual cleanup or data deletion requests.

### Mandatory checklist before writing any PostHog code

- [ ] Confirm you are using the correct PostHog SDK for this project's platform (see Tech Stack below)
- [ ] Check if this project routes data through a CDP — it does NOT; PostHog is direct
- [ ] Check if consent gating is required — NOT required (Mexican B2B SaaS, no EU/CA users)
- [ ] Review the existing PostHog tracking plan below before adding new events

---

## Tech Stack

| Detail | Value |
|---|---|
| **Platform** | Astro 6 (SSR) + React islands |
| **PostHog SDK** | posthog-js via CDN snippet |
| **Tracking method** | Client-side & Server-side (`posthog-node`) |
| **CDP (if any)** | None |
| **Consent required** | No |
| **PostHog Key location** | `.env` → `PUBLIC_POSTHOG_KEY` & `PUBLIC_POSTHOG_HOST` |

---

## PostHog Initialization

PostHog is initialized in two layout files via inline `<script>` tags:

- **Landing pages:** `src/layouts/Layout.astro` — init only (no identity)
- **App pages:** `src/layouts/AppLayout.astro` — init + `posthog.identify(userId)` + `posthog.group()`

The CDN script is loaded first, then an inline script initializes with the project keys from `import.meta.env.PUBLIC_POSTHOG_KEY` and `import.meta.env.PUBLIC_POSTHOG_HOST`.

**Typed helpers** are available in:
- `src/lib/posthog.ts` — `getPosthog()`, `identifyUser()`, `resetUser()`, `captureEvent()`
- `src/lib/posthog-events.ts` — `trackSignUpCompleted()`, `trackQuoteCreated()`
- `src/lib/posthog-server.ts` — For server-side events

**Do not:**
- Initialize PostHog in multiple places (it's already in both layouts)
- Create separate PostHog instances per component or module
- Import the CDN script again — it's loaded globally via the layouts

---

## PostHog Identity

PostHog identity is managed through Clerk's `userId` (stable, unique database ID):

| Action | When to call | Code location |
|---|---|---|
| `posthog.identify(userId)` | On every authenticated page load (handles login, signup, session restore) | `src/layouts/AppLayout.astro` (inline script) |
| `posthog.reset()` | On logout | `src/components/app/CustomOrgSwitcher.tsx` → `handleLogout()` |

**Rules:**
- `posthog.identify()` uses the Clerk `userId` — never email addresses
- `posthog.identify()` is called server-side via `currentUserId()` and passed to the client via `define:vars`
- `posthog.reset()` is called before `clerk.signOut()` to prevent cross-user attribution
- Never call `posthog.identify()` con un ID distinto sin llamar a `posthog.reset()` antes

---

## PostHog Tracking Plan

These are the PostHog events currently tracked in this project. **All new PostHog events must follow the same conventions.**

### Naming conventions

- PostHog event names: `snake_case`, past tense verb + noun (e.g., `report_generated`, `item_added_to_cart`)
- PostHog property names: `snake_case` (e.g., `sign_up_method`, `plan_type`)
- No abbreviations in PostHog event or property names — use full words
- Boolean PostHog properties: use `is_` prefix (e.g., `is_first_time`)

### Current PostHog events

| PostHog Event | Trigger | Key Properties | File |
|---|---|---|---|
| `sign_up_completed` | User completes account creation (lands on onboarding page) | `sign_up_method` (`email` / `google`), `platform` (`web`) | `src/pages/onboarding/workspace.astro` |
| `quote_created` | User creates a new cotización (manual, AI-draft populates then saves, o duplicate) | `has_items`, `item_count`, `currency`, `source` (`manual` / `duplicate`) | `src/pages/app/cotizaciones/nueva.astro`, `src/pages/app/cotizaciones/[id].astro` |
| `quote_viewed` | User (external) views a quote | `quote_id`, `quote_folio`, `company`, `total`, `currency` | `src/pages/q/[token].astro` |
| `quote_approved` | User (external or manual internal) approves a quote | `quote_id`, `quote_folio`, `company`, `total`, `currency`, `signed_by` | `src/pages/q/[token].astro`, `src/pages/app/cotizaciones/[id].astro` |
| `quote_sent` | Internal user clicks to send a quote | `quote_id`, `quote_folio` | `src/pages/app/cotizaciones/[id].astro` |
| `payment_received` | Stripe registers a payment (server side) | `quote_id`, `quote_folio`, `source` | `src/pages/api/stripe/webhook.ts`, `src/pages/app/cotizaciones/[id].astro` |
| `ai_draft_used` | Internal user clicks "Armar con IA" | `has_file`, `has_text`, `item_count` | `src/pages/app/cotizaciones/nueva.astro` |

---

## How to Add a New PostHog Event

1. **Check the tracking plan above** — if the PostHog event already exists, use it. Do not create duplicate PostHog events.
2. **Name the PostHog event** using the conventions above: `snake_case`, past tense, descriptive.
3. **Define PostHog properties** — only include properties available at the moment the event fires. Do not fetch additional data just for PostHog tracking.
4. **Place the PostHog tracking call** at the right moment:
   - Track PostHog events **after** the action succeeds (after DB write, after API response), not on button click or form submit
   - Track PostHog events **after** `posthog.identify()` if the event is tied to a logged-in action
5. **Add a typed helper** in `src/lib/posthog-events.ts` for the new event.
6. **Update this file** — add the new PostHog event to the tracking plan table above.
7. **Verify in PostHog Live View** — confirm the event appears in PostHog with correct properties before considering it done.

### PostHog event template

For inline scripts (`.astro` files):
```javascript
// Track [description] in PostHog
if (typeof posthog !== 'undefined') {
    posthog.capture('event_name', {
        property_name: value,
    });
}
```

For React components (`.tsx` files):
```typescript
import { captureEvent } from '../lib/posthog';
// After successful action:
captureEvent('event_name', { property_name: value });
```

---

## What Not to Do

- **Do not introduce other analytics tools.** This project uses PostHog (+ Vercel Analytics for web vitals). All product tracking goes through PostHog.
- **Do not track PostHog events on page load** unless explicitly measuring page views (auto page views are already enabled).
- **Do not track PII as PostHog properties** — no emails, full names, phone numbers, IP addresses, or payment details in PostHog event properties.
- **Do not fire PostHog events inside loops** — each PostHog event call is a network request.
- **Do not hardcode the PostHog project keys** — read it from `import.meta.env.PUBLIC_POSTHOG_KEY`.
- **Do not skip `posthog.reset()` on logout** — failing to reset causes PostHog to merge the next user's events with the previous user's profile.
- **Do not call `posthog.identify()` before the user is authenticated** — premature identification creates orphaned PostHog perfiles.
