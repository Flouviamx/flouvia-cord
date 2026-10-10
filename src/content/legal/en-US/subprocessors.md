---
docId: subprocessors
version: "2026-10-10"
effectiveDate: "2026-10-10"
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
lastReviewed: "2026-10-10"
reviewedBy: Technical drafting; external legal review pending
dependsOn: ["privacy"]
sourceSections: ["privacy@2026-09-28#dpa", "privacy@2026-09-28#internacionales"]
releaseBlockers: ["verified-identity", "provider-legal-entities", "account-contracts", "processing-locations", "transfer-mechanisms", "change-notice", "objection-procedure", "fr-platform-contract", "inbound-email-provider", "legal-review", "versioned-publication"]
---

# Third parties and sub-processors

**TECHNICAL DRAFT — not published or effective.** This list describes
integrations found in code as of October 10, 2026. It does not prove that every
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
| Facturapi | CFDI/CSD preparation, stamping, cancellation, and retrieval in Mexico, including payment complements and global invoices, if configured. | Pending |
| Inbound email (provider to be identified) | Receipt of email sent to Cord mailboxes: replies to collections and supplier documents in Chile's exchange mailbox, if inbound email is configured. | Pending; provider not identified |

Legal entity, address, processing country, specific products, downstream
sub-processors, and transfer mechanism must be completed for each row. A trade
name is not enough for a contractual appendix.

## 3. Providers with their own duties

| Provider | Observed purpose and condition |
|---|---|
| Stripe | Billing, payments, refunds, disputes, payouts, and financial/identity verification; payment methods and SEPA/ACH mandates saved by Customer's customers for automatic payments; US sales tax calculation in Customer's connected account, with its customer's address. When each feature is used. |
| Google | User-selected OAuth; Cord receives the authorized identifier, name, and email. |
| Apple | User-selected authentication; Cord receives the authorized identifier and data. |
| Mercado Pago | Collecting quotes and invoices with the Customer's account, and reading payments and refunds to reconcile them, when the Customer connects it. |
| Iopole | Approved platform in France: business registration (SIREN, VAT regime, email, address and, optionally, the representative's name and title), business-to-business invoices with the business's customer data, e-reporting of other sales and payments, and statuses. Identity verification and the mandate happen on its own page. Only if the service is enabled and the business completes registration; Flouvia's production contract remains pending. |

Their role may vary by product, jurisdiction, and data. Keeping them outside the
sub-processor table does not declare they never act as processors; it avoids a
universal role without analysis. Stripe and Resend public terms were reviewed,
but that does not replace account or configuration evidence.

## 4. Authorities and Customer-directed integrations

These are authorities or tax recipients, each only in the issuer's country and
when its rail is enabled and configured: SAT through the PAC when stamping CFDI;
AEAT with Verifactu (submission disabled by default) and, once the AEAT publishes
its service, the public business-to-business e-invoicing solution, with no
submissions today; ARCA; Sefin Nacional and SEFAZ (or its contingency service);
SUNAT; the SII; the DIAN; and the DGFiP through the approved platform. Cord
transmits to them as Customer's invoicing system, with Customer's credentials,
without acting as its attorney-in-fact or accredited technology provider. In
Chile, Customer's suppliers also receive exchange responses signed with
Customer's certificate.

SAML IdPs, MCP servers, Slack workspaces, and webhooks/endpoints configured by
Customer are Customer-directed recipients. Customer decides activation and
scope; Cord must apply authentication, minimization, and security. For MCP,
`[*]` authorization and no per-call confirmation prevent treating instruction
alone as sufficient control for tools with external effects.

HubSpot is a Customer-directed integration when Customer connects it through
OAuth. Cord sends to that account its customers' company name, contact, email,
and phone, and the number, customer, amount, currency, and stage of its sent
quotes; and reads back name, contact, email, and phone of already linked records.
Cord stores encrypted tokens, linked identifiers, and a sync queue. On
disconnection, Cord attempts to revoke access, deletes the tokens, and stops
syncing; data already sent to HubSpot is not deleted.

Also Customer-directed, each only if Customer connects it: Google (Sheets with
`drive.file`, sending from their Gmail with `gmail.send`, and the Gmail add-on),
Microsoft (Excel in their OneDrive and Teams), Intuit QuickBooks Online, Xero
(final invoices with customer, lines, currency and taxes), Shopify (catalog and
customers into Cord and the order back if enabled) and Meta (WhatsApp Business
with their templates). Cord stores their credentials encrypted and the linked
identifiers; disconnecting stops syncing and data already delivered stays in
Customer's account.

Zapier, Make, and other platforms using the API act with a Customer key: they
receive the events Customer chooses and run the actions the key allows. Cord
Workflows runs automations defined by Customer: it creates tasks, emails only
members of Customer's organization, and posts to the Slack Customer configured; it
does not write to end customers or move money.

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

Ten entries remain `account-evidence-pending`: Neon, Vercel, Anthropic, PostHog,
Upstash, Ops Slack, Facturapi, Google, Apple, and Mercado Pago. Accepted terms, product, region,
retention, and transfer evidence remain missing. The next Privacy Notice version
would add the French approved platform and the inbound email provider, both
without account evidence: the platform's production contract and the choice of
inbound email provider remain open.

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

Provenance and evidence: [phase 5.4 data-governance review](../../../../docs/historial/revisiones-legales/2026-09-01-data-governance.md) and [per-country invoicing review](../../../../docs/historial/revisiones-legales/2026-10-10-facturacion-paises.md). Original clauses remain preserved through `sourceSections`.
