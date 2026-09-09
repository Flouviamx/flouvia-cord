---
docId: cookies-policy
version: "2026-09-01"
effectiveDate: "2026-09-01"
supersedes: null
locale: en-US
jurisdiction: GLOBAL
appliesToCountries: [MX, US, CA, BR, ES, GB, DE, FR, CO, AR, CL, PE]
requiresAction: false
action: none
acceptanceScope: none
publicationStatus: draft
sourceKind: markdown
editorialStage: technical-draft
sourceOfTruth: src/content/legal/en-US/cookies-policy.md
artifactRoute: /en/legal/cookies-policy
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-09-01"
reviewedBy: Technical drafting; external legal review pending
dependsOn: ["privacy"]
sourceSections: ["privacy@2026-08-29#cookies"]
releaseBlockers: ["complete-cookie-inventory", "vercel-storage-access-assessment", "posthog-cookie-evidence", "granular-consent-review", "server-analytics-basis", "withdrawal-procedure", "legal-review", "versioned-publication"]
---

# Cookie and local-storage policy

**TECHNICAL DRAFT — not published or effective.** It describes code reviewed on
September 1, 2026. “Cookie” includes HTTP cookies, `localStorage`, scripts, tags,
and technologies that store or access device information; a cookieless tool is
not automatically outside applicable rules.

## 1. Scope and categories

Cord uses necessary technologies for authentication, security, preferences,
requested flows, and recognition of public-link visitors. PostHog browser
analytics runs only after the available acceptance choice. Vercel Web Analytics
loads without a consent gate because the implementation treats it as cookieless;
its legal exemption by market remains to be verified.

No third-party behavioral advertising was found in the reviewed code. A new
purpose, provider, cookie, or storage use requires inventory, banner, and legal
basis review before activation.

## 2. Necessary and functional technologies

| Family | Purpose | Observed duration |
|---|---|---|
| `cord_session`, `cord_auth_hint` | Authenticated session and non-authenticating visual hint. | 30 days, renewable; 180-day database session cap |
| `cord_active_org` | User-selected active organization. | 1 year |
| `cord_public_lang` | Selected public language. | 1 year |
| `cord_q_visitor` | Distinguish a public-link visitor without cross-site profiling. | 1 year |
| `cord_cookie_consent` | Remember analytics acceptance or rejection. | 6 months |
| `cord_test_mode` | Preserve selected sandbox environment. | 1 year |
| OAuth, SAML, passkey, 2FA, and legal cookies | State, nonce, PKCE, challenge, or one-use intent. | Usually 5, 10, or 15 minutes |
| Ops cookies | Privileged session and internal challenges. | Session up to 8 hours; challenges 5 minutes |
| `cord_capture_device` | Temporarily bind the KYC capture device. | 1 hour |

This summarizes families found and does not replace an automated inventory of
all variants, domains, flags, and consumers. Several cookies are HttpOnly;
language, consent, and test-mode preferences are browser-readable. `Secure`
applies in production where each flow declares it.

## 3. PostHog consent

PostHog starts with `opt_out_capturing_by_default: true`. The banner offers
“Necessary only” and “Accept all”; only acceptance calls
`opt_in_capturing()`. Rejection calls `opt_out_capturing()`. There are no more
categories because the code exposes one optional analytics purpose.

The choice is stored in `cord_cookie_consent` with `SameSite=Lax`, `path=/`, and
on Cord hosts `Domain=.cordhq.app`; it is also mirrored to `localStorage` as a
fallback. Sharing across subdomains broadens scope and requires justification.
The cookie records no date, policy version, or separate categories, so consent
evidence is limited.

PostHog may set its own cookies or storage after opt-in. Actual names, domains,
and durations in the deployed configuration are not fixed in the repository and
remain an inventory blocker.

## 4. Browser and server analytics

After opt-in, PostHog may measure views and adoption and identify authenticated
users and organizations. Sandboxes, demo, and internal organizations carry flags
or exclusions. Withdrawal prevents future SDK capture, but the procedure does
not demonstrate retroactive PostHog deletion.

Separately, the backend emits business and MCP events at organization level when
PostHog is configured, with person profiles disabled in the generic path. That
processing does not depend on the browser cookie or preference and needs its own
basis, transparency, minimization, and retention; it is not covered by “Accept
all.”

## 5. Vercel Web Analytics

Vercel Web Analytics receives aggregated views without third-party cookies under
the implementation. Before sending, Cord strips query strings and replaces
identifiers in customer, document, dispute, SSO, invitation, public-link, and
identity-capture routes. Hosting still handles the technical request needed to
serve the site.

The component loads after PostHog rejection except on surfaces where
`analyticsDisabled` turns it off. There is no visible Vercel-only objection
control. Current United Kingdom rules also cover scripts, tags, and other storage/
access technologies; being cookieless does not by itself establish an exception.
Actual operation must be assessed in each market.

## 6. Preferences, rejection, and withdrawal

A first visit with no stored choice shows two options. Rejection does not block
the service or enable PostHog. The privacy notice's “Manage cookie preferences”
link reopens the banner. Changing acceptance to rejection applies opt-out to
future capture and overwrites the six-month preference.

There is no granular center, versioned receipt, or server-side synchronization of
the decision. Clearing cookies or storage may cause Cord to ask again. Withdrawal
does not affect necessary technologies or itself delete previously transferred
data; rights requests use their separate process.

## 7. Third parties, security, and changes

PostHog and Vercel receive data under the conditions above. Authentication
providers may set technologies on their own domains during a selected flow; their
policies apply there. Cord does not control cookies placed by linked external
sites.

Sensitive session tokens and major challenges are HttpOnly, use SameSite flags
appropriate to the flow, and have bounded expiry. That reduces risk, but a
necessary cookie still requires transparency and cannot be repurposed for
analytics.

A material change in purpose, provider, duration, or scope should trigger review,
an update, and where required a new choice before loading.

## 8. Coordination and blockers

This policy coordinates with privacy, DPA, sub-processors, and retention. It does
not turn optional consent into contract acceptance or cover server telemetry
through a browser choice.

**Blockers:** complete automated inventory; actual PostHog cookies/storage;
Vercel assessment under EU, UK, Brazil, and other markets; server-analytics basis;
sufficiency of two choices and cross-subdomain scope; consent evidence,
withdrawal, and erasure; identity/contact, legal review, and versioned publication.

Provenance and evidence: [phase 5.4 data-governance review](../../../../docs/historial/revisiones-legales/2026-09-01-data-governance.md). Original clauses remain preserved through `sourceSections`.
