# Analytics Tracking — Mixpanel

This project uses **Mixpanel** for all product analytics. Mixpanel is the single source of truth for event tracking, user identification, and behavioral data. Do not introduce any other analytics tools, SDKs, or tracking libraries without explicit instruction from a user.

> **Note:** Vercel Analytics (`@vercel/analytics`) coexists for page-level web analytics (traffic, Core Web Vitals). Mixpanel handles product analytics (user actions, funnels, retention). They serve different purposes and do not conflict.

---

## Before You Add or Modify Any Tracking

**Do not write Mixpanel tracking code without reading this file first.**

Wrong assumptions about platform, identity, or consent will produce broken Mixpanel data that requires manual cleanup or data deletion requests.

### Mandatory checklist before writing any Mixpanel code

- [ ] Confirm you are using the correct Mixpanel SDK for this project's platform (see Tech Stack below)
- [ ] Check if this project routes data through a CDP — it does NOT; Mixpanel is direct
- [ ] Check if consent gating is required — NOT required (Mexican B2B SaaS, no EU/CA users)
- [ ] Review the existing Mixpanel tracking plan below before adding new events

---

## Tech Stack

| Detail | Value |
|---|---|
| **Platform** | Astro 6 (SSR) + React islands |
| **Mixpanel SDK** | mixpanel-browser via CDN (`cdn.mxpnl.com/libs/mixpanel-2-latest.min.js`) |
| **SDK version** | Latest (CDN auto-updates) |
| **Tracking method** | Client-side |
| **CDP (if any)** | None |
| **Consent required** | No |
| **Mixpanel project token location** | `.env` → `PUBLIC_MIXPANEL_TOKEN` |

---

## Mixpanel Initialization

Mixpanel is initialized in two layout files via inline `<script>` tags:

- **Landing pages:** `src/layouts/Layout.astro` — init only (no identity)
- **App pages:** `src/layouts/AppLayout.astro` — init + `mixpanel.identify(userId)` + `mixpanel.people.set()`

The CDN script is loaded first, then an inline script initializes with the project token from `import.meta.env.PUBLIC_MIXPANEL_TOKEN`.

**Typed helpers** are available in:
- `src/lib/mixpanel.ts` — `getMixpanel()`, `identifyUser()`, `resetUser()`, `trackEvent()`
- `src/lib/mixpanel-events.ts` — `trackSignUpCompleted()`, `trackQuoteCreated()`

**Do not:**
- Initialize Mixpanel in multiple places (it's already in both layouts)
- Create separate Mixpanel instances per component or module
- Import the CDN script again — it's loaded globally via the layouts

---

## Mixpanel Identity

Mixpanel identity is managed through Clerk's `userId` (stable, unique database ID):

| Action | When to call | Code location |
|---|---|---|
| `mixpanel.identify(userId)` | On every authenticated page load (handles login, signup, session restore) | `src/layouts/AppLayout.astro` (inline script) |
| `mixpanel.reset()` | On logout | `src/components/app/CustomOrgSwitcher.tsx` → `handleLogout()` |

**Rules:**
- `mixpanel.identify()` uses the Clerk `userId` — never email addresses
- `mixpanel.identify()` is called server-side via `currentUserId()` and passed to the client via `define:vars`
- `mixpanel.reset()` is called before `clerk.signOut()` to prevent cross-user attribution
- Never call `mixpanel.identify()` with a different user ID without calling `mixpanel.reset()` first

---

## Mixpanel Tracking Plan

These are the Mixpanel events currently tracked in this project. **All new Mixpanel events must follow the same conventions.**

### Naming conventions

- Mixpanel event names: `snake_case`, past tense verb + noun (e.g., `report_generated`, `item_added_to_cart`)
- Mixpanel property names: `snake_case` (e.g., `sign_up_method`, `plan_type`)
- No abbreviations in Mixpanel event or property names — use full words
- Boolean Mixpanel properties: use `is_` prefix (e.g., `is_first_time`)

### Current Mixpanel events

| Mixpanel Event | Trigger | Key Properties | File |
|---|---|---|---|
| `sign_up_completed` | User completes account creation (lands on onboarding page) | `sign_up_method` (`email` / `google`), `platform` (`web`) | `src/pages/onboarding/workspace.astro` |
| `quote_created` | User creates a new cotización (manual, AI-draft populates then saves, or duplicate) | `has_items`, `item_count`, `currency`, `source` (`manual` / `duplicate`) | `src/pages/app/cotizaciones/nueva.astro`, `src/pages/app/cotizaciones/[id].astro` |

---

## How to Add a New Mixpanel Event

1. **Check the tracking plan above** — if the Mixpanel event already exists, use it. Do not create duplicate Mixpanel events.
2. **Name the Mixpanel event** using the conventions above: `snake_case`, past tense, descriptive.
3. **Define Mixpanel properties** — only include properties available at the moment the event fires. Do not fetch additional data just for Mixpanel tracking.
4. **Place the Mixpanel tracking call** at the right moment:
   - Track Mixpanel events **after** the action succeeds (after DB write, after API response), not on button click or form submit
   - Track Mixpanel events **after** `mixpanel.identify()` if the event is tied to a logged-in action
5. **Add a typed helper** in `src/lib/mixpanel-events.ts` for the new event.
6. **Update this file** — add the new Mixpanel event to the tracking plan table above.
7. **Verify in Mixpanel Live View** — confirm the event appears in Mixpanel with correct properties before considering it done.

### Mixpanel event template

For inline scripts (`.astro` files):
```javascript
// Track [description] in Mixpanel
if (typeof mixpanel !== 'undefined') {
    mixpanel.track('event_name', {
        property_name: value,
    });
}
```

For React components (`.tsx` files):
```typescript
import { trackEvent } from '../lib/mixpanel';
// After successful action:
trackEvent('event_name', { property_name: value });
```

---

## What Not to Do

- **Do not introduce other analytics tools.** This project uses Mixpanel (+ Vercel Analytics for web vitals). All product tracking goes through Mixpanel.
- **Do not track Mixpanel events on page load** unless explicitly measuring page views (auto page views are already enabled via `track_pageview: true`).
- **Do not track PII as Mixpanel properties** — no emails, full names, phone numbers, IP addresses, or payment details in Mixpanel event properties.
- **Do not fire Mixpanel events inside loops** — each Mixpanel event call is a network request.
- **Do not hardcode the Mixpanel project token** — read it from `import.meta.env.PUBLIC_MIXPANEL_TOKEN`.
- **Do not skip `mixpanel.reset()` on logout** — failing to reset causes Mixpanel to merge the next user's events with the previous user's profile.
- **Do not call `mixpanel.identify()` before the user is authenticated** — premature identification creates orphaned Mixpanel profiles.
