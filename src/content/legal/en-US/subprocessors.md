---
docId: subprocessors
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
sourceOfTruth: src/content/legal/en-US/subprocessors.md
artifactRoute: /en/legal/subprocessors
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-09-01"
reviewedBy: Technical drafting; external legal review pending
dependsOn: ["privacy"]
sourceSections: ["privacy@2026-08-29#dpa", "privacy@2026-08-29#internacionales"]
releaseBlockers: ["verified-identity", "provider-legal-entities", "account-contracts", "processing-locations", "transfer-mechanisms", "change-notice", "objection-procedure", "legal-review", "versioned-publication"]
---

# Third parties and sub-processors

**TECHNICAL DRAFT — not published or effective.** This list describes
integrations found in code as of September 1, 2026. It does not prove that every
integration is configured, that public terms were accepted for Cord's account,
or that one legal classification applies to every flow.

## 1. Scope and how to read the list

A sub-processor handles Customer Data on Cord's behalf. A provider with its own
duties may determine part of its processing. An authority receives data for a
legal duty or function. A Customer-directed integration is selected and
configured by Customer. These categories are not interchangeable.

The condition shows when a flow may activate, not its legal basis, region, or
retention. Catalog presence also does not prove it currently receives a
particular Customer's data.

## 2. Identified sub-processors

| Provider | Observed purpose and condition | Account evidence |
|---|---|---|
| Neon | PostgreSQL containing account, operational, and customer data; core infrastructure. | Pending |
| Vercel | Hosting, request execution, technical logs, and Web Analytics; core infrastructure. | Pending |
| Anthropic | Text, image/PDF, and context processing when an AI function is invoked. | Pending |
| Resend | Email delivery and double-opt-in newsletter when Cord sends email. | Public terms reviewed; account evidence to retain |
| PostHog | Browser analytics after consent and server-side organization telemetry if configured. | Pending |
| Upstash | Rate limiting and ephemeral MCP sessions if variables exist; PostgreSQL fallback. | Pending |
| Slack, Cord alerts | Minimized operational alerts if Cord's internal webhook is configured. | Pending |
| Facturapi | CFDI/CSD preparation, stamping, and retrieval in Mexico if configured. | Pending |

Legal entity, address, processing country, specific products, downstream
sub-processors, and transfer mechanism must be completed for each row. A trade
name is not enough for a contractual appendix.

## 3. Providers with their own duties

| Provider | Observed purpose and condition |
|---|---|
| Stripe | Billing, payments, refunds, disputes, payouts, and financial/identity verification when used. |
| Google | User-selected OAuth; Cord receives the authorized identifier, name, and email. |
| Apple | User-selected authentication; Cord receives the authorized identifier and data. |

Their role may vary by product, jurisdiction, and data. Keeping them outside the
sub-processor table does not declare they never act as processors; it avoids a
universal role without analysis. Stripe and Resend public terms were reviewed,
but that does not replace account or configuration evidence.

## 4. Authorities and Customer-directed integrations

SAT, PAC, and AEAT are authorities or tax recipients. SAT/PAC participate in
CFDI stamping; AEAT would receive data only when Verifactu and submission are
actually configured, and submission is disabled by default today.

SAML IdPs, MCP servers, Slack workspaces, and webhooks/endpoints configured by
Customer are Customer-directed recipients. Customer decides activation and
scope; Cord must apply authentication, minimization, and security. For MCP,
`[*]` authorization and no per-call confirmation prevent treating instruction
alone as sufficient control for tools with external effects.

## 5. Data, activation, and minimization

Neon and Vercel are core infrastructure. Other flows are conditional on email,
analytics, AI, rate limiting, alerts, tax, payment, or authentication. The final
DPA must connect each provider to data categories, people, purpose, frequency,
and retention.

Cord strips query strings and selected route identifiers before Vercel Web
Analytics; it does not eliminate the hosting request. PostHog browser capture is
off by default, while server-side business events use a separate path. Anthropic
and integrations can receive Customer content. Minimization must be evaluated
per call, not per provider name.

## 6. Contracts, regions, and transfers

Nine entries remain `account-evidence-pending`: Neon, Vercel, Anthropic, PostHog,
Upstash, Ops Slack, Facturapi, Google, and Apple. Accepted terms, product, region,
retention, and transfer evidence remain missing.

A public DPA or trust center describes general terms; it does not prove Cord's
account location or an executed mechanism. Each transfer must map exporter,
importer, role, country, and safeguard. The 2021/914 SCCs, where applicable,
require the correct module and completed appendices.

## 7. Additions, changes, and objections

Cord currently has no public subscription to list changes, advance-notice period,
immutable history, or objection procedure. A static table alone does not satisfy
the operation of a general sub-processor authorization.

The final contract must define which changes trigger notice, channel and lead
time, information provided, reasonable-objection handling, and the outcome when
an objection cannot be resolved. Urgent security replacements need separate
treatment.

## 8. Responsibility, coordination, and blockers

Cord should impose DPA-compatible duties on a sub-processor and retain
responsibility to the applicable extent. Customer retains responsibility for
integrations it directs; own-duty providers and authorities operate under their
regimes. This separation does not reduce Cord's direct duties.

**Blockers:** legal identity; provider entities and addresses; account contracts;
countries/regions; categories and retention by flow; transfer mechanisms; notice,
history, and objections; legal review and versioned publication.
`src/lib/legal-providers.ts` remains a technical inventory, not a self-updating
contractual list.

Provenance and evidence: [phase 5.4 data-governance review](../../../../docs/historial/revisiones-legales/2026-09-01-data-governance.md). Original clauses remain preserved through `sourceSections`.
