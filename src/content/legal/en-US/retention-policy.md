---
docId: retention-policy
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
sourceOfTruth: src/content/legal/en-US/retention-policy.md
artifactRoute: /en/legal/retention-policy
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-10-10"
reviewedBy: Technical drafting; external legal review pending
dependsOn: ["privacy"]
sourceSections: ["privacy@2026-09-28#seguridad", "privacy@2026-09-28#portabilidad"]
releaseBlockers: ["record-level-schedule", "kyc-deletion-conflict", "durable-deletion-evidence", "provider-retention", "backup-rotation", "legal-acceptance-period", "complete-export", "fiscal-retention-after-closure", "legal-review", "versioned-publication"]
---

# Retention, export, and deletion

**TECHNICAL DRAFT — not published or effective.** This text separates implemented
periods, undefined schedules, and duties that may vary by record and country. It
does not turn code comments into legal bases or promise deletion in systems Cord
does not control.

## 1. Scope and principles

Retention should be limited to a documented purpose: service delivery, security,
dispute, contract, tax, compliance, or defense. Each category needs an owner,
start event, period, deletion event, exception, and evidence. “As necessary” does
not replace that schedule.

The product must distinguish primary database, backups, logs, providers,
authorities, Customer-directed transfers, and legal evidence. Account or
organization deletion does not produce the same outcome in every layer.

## 2. Implemented and verifiable periods

| Record | Observed rule |
|---|---|
| User session | 30-day cookie and sliding validity; 180-day absolute database cap |
| OAuth, passkey, 2FA, and legal challenges | Short expiry, usually 5 to 15 minutes; several are removed on use or lazily |
| KYC capture session | Until `expires_at` or one hour after closure; daily cron |
| Technical KYC evidence | Five-year sweeper from `created_at`, while the organization exists |
| Webhook deliveries | Older than 30 days or beyond the latest 500 per endpoint |
| Resolved webhook events | 30 days; failed events, 90 days |
| Integration OAuth connection requests | 10 minutes; removed when another connection starts in the organization |
| HubSpot sync queue | Finished or failed jobs, 14 days; daily cron |
| HubSpot tokens | Until disconnection; deleted on disconnection |
| API idempotency keys | Expire after 24 hours, but are deleted only when the same key is reused |
| Cookie preference | 6 months; language, organization, sandbox, and public visitor, up to 1 year |
| Health samples | Public view queries at most 90 days; no equivalent purge exists in code |
| Customer portal link | Valid until the business rotates or turns it off |
| Tax authority access ticket | Encrypted; renewed on expiry (ARCA: 12 hours) and deleted when the credential is removed |
| Tax credentials | Until the business replaces or deletes them; an expired certificate is not deleted automatically; a CAF with used folios cannot be removed |
| US sales tax calculation | The provider expires it after 90 days; the Cord row, with the customer's address, has no purge |
| Registration with the French approved platform | An uncertain one with no trace is discarded after 2 hours; others have no purge |

A query window is not retention. These are observed technical behaviors; legal
basis and sufficiency must be validated by data type and market.

## 3. Data without a complete schedule

Quotes, customers, products, invoices, payments, CFDI, messages, audit, incidents,
billing, provider files, and most operational records live while the organization
exists or until a specific action. There is no general age-based sweeper. The same
applies to the domain event log (`domain_events`), Cord Workflows runs, and links
between Cord and HubSpot records: they do not yet have their own period.

Nor do these have a period: automatic-payment authorization evidence (a new
authorization replaces the previous one, which is not kept), the record of who
turned it off, coupon redemptions (they survive document deletion), documents
received from suppliers in Chile and the responses sent, transmissions and
statuses of the French approved platform, messages for the AEAT's public
solution, and attempts before Latin American authorities.

`legal_acceptances` stores a pseudonymous person identifier, organization,
document, version, hash, full IP, user-agent, and time without a user foreign key
or approved period. It survives closure to preserve contract evidence, but its
duration, access, redaction, and later deletion remain undefined.

Vercel/Neon backups and logs and Stripe, Facturapi, Resend, Anthropic, PostHog,
and other provider retention lack sufficient account evidence. This draft does
not invent their periods.

## 4. KYC, tax, payments, and disputes

Cord does not persist the identity-document bytes transmitted to Stripe in the
reviewed flow. It stores technical KYC metadata —hash, size, format, metrics, IP,
user-agent, person/account, and outcome— under a five-year sweeper. Stripe may
retain images and data under its own roles.

There is a conflict: `connect_kyc_evidencia.org_id` uses `on delete cascade`, so
organization deletion immediately removes evidence despite the five-year
sweeper. The inherited basis is also not validated for every person, country,
and flow. Until resolved, no uniform five-year or post-closure preservation is
promised.

CFDI and Verifactu records, payments, refunds, and disputes need rules by role
and law. A Mexican tax period must not automatically apply to every commercial
record or another country.

Tax documents: Cord keeps them while the organization exists and, except for
Verifactu, deletes them with it. Each country's law requires the issuer to keep
them for its own period. The table summarizes references for legal review,
**not verified in every case against the current text**:

| Country | Retention reference (to confirm) | What Cord keeps | On organization deletion |
|---|---|---|---|
| Mexico | CFF, art. 30: five years from the related return | Document and PAC response | Deleted in Cord; the PAC keeps under its rules |
| Spain | LGT, arts. 66 and 70; Commercial Code, art. 30 | Verifactu records and responses; SPFE messages | Verifactu prevents deletion, with no exit period |
| Argentina | Law 11,683 and its regulation (tied to the statute of limitations); Civil and Commercial Code, art. 328 | Request, response and CAE | Deleted |
| Brazil | CTN, arts. 173, 174 and 195; Ajuste SINIEF 07/05 | NFS-e and NF-e XML, events | Deleted |
| Peru | Tax Code, art. 87(7) | Signed XML and CDR | Deleted |
| Chile | Tax Code, arts. 17 and 200 | DTE, CAF, ledgers, received documents and responses | Deleted |
| Colombia | Tax Statute, art. 632; Law 962 of 2005, art. 46 | Signed XML, ApplicationResponse and container | Deleted |
| France | LPF, art. L102 B; Commercial Code, art. L123-22 | Sent Factur-X, e-reporting and statuses | Deleted; the platform keeps under its rules |
| United States | Varies by state | Calculations and transactions | Deleted; the provider keeps the transaction |

Until an approach is decided —blocking closure as with Verifactu, offering a
complete tax archive before closure, or retaining after closure with a basis and
period— no post-closure tax retention is promised.

## 5. Export and portability

An organization can download product and customer CSV files and JSON containing
organization, products, customers, quotes/items, events, tasks, masked API keys,
and up to 1,000 audit rows.

The endpoint comment says “all data,” but the file omits invoices/tax documents,
charges, payments, disputes, KYC, integrations, messages, billing, and audit rows
beyond the limit, among other records. Its helper also returns an empty list when
a query fails. It must not be presented as a complete export, comprehensive
rights response, or restorable backup.

Customer should download available artifacts before closure. The final DPA must
set return format, scope, window, and assistance.

## 6. Organization and account deletion

The owner can delete an organization after reauthentication and typing its name.
Cord attempts best-effort Stripe subscription cancellation and then deletes the
`orgs` row; approximately 33 dependencies cascade. An active Connect account is
not deleted by this path and needs provider review.

Organization `audit_log` also cascades, including the “deletion started” row, so
no durable database evidence shows completion. The Ops path has a separate
record but is not equivalent to owner deletion. There is no certificate,
provider queue, or backup reconciliation.

Personal closure deletes sole-owned organizations, blocks when active members
would remain, and tombstones selected references in surviving organizations. It
does not delete pseudonymous legal acceptances.

## 7. Providers, backups, holds, and exceptions

Data already sent to a Customer-directed recipient, authority, or provider with
its own duty is not erased by deleting Cord alone. Request, contract, retention
duty, backup, and response must be documented.

A litigation, security, fraud, tax, or contract hold should be limited,
authorized, and recorded. Restriction does not mean unrestricted use. Deletion
should resume after the exception ends.

Evidence is insufficient to promise residency, backup rotation, instant erasure,
or cascade to every provider.

## 8. Rights, coordination, and blockers

Access, correction, objection, restriction, or erasure requests are assessed by
role and law. Customer primarily handles requests about its data; Cord should
assist as processor and handle requests for which it is controller. Identity,
channel, and periods still need definition.

**Blockers:** table/provider/backup schedule; KYC conflict; durable deletion
evidence; contracts and regions; legal-acceptance period/redaction; complete
export or transparent limits; holds and DSAR; identity/contact, legal review, and
versioned publication.

Provenance and evidence: [phase 5.4 data-governance review](../../../../docs/historial/revisiones-legales/2026-09-01-data-governance.md) and [per-country invoicing review](../../../../docs/historial/revisiones-legales/2026-10-10-facturacion-paises.md). Original clauses remain preserved through `sourceSections`.
