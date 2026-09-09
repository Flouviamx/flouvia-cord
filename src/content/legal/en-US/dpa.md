---
docId: dpa
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
editorialStage: technical-draft
dependsOn: ["terms", "privacy", "subprocessors", "retention-policy"]
sourceSections: ["privacy@2026-08-29#dpa", "privacy@2026-08-29#internacionales"]
releaseBlockers: ["verified-parties", "processing-schedules", "security-schedule", "account-contracts", "transfer-map", "subprocessor-notice", "incident-procedure", "retention-schedule", "legal-review", "execution-evidence", "versioned-publication"]
sourceKind: markdown
sourceOfTruth: src/content/legal/en-US/dpa.md
artifactRoute: /en/dpa
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-09-01"
reviewedBy: Technical drafting; external legal review pending
---

# Data Processing Addendum

**TECHNICAL DRAFT — not published, offered, accepted, or effective.** The
frontmatter date identifies this editorial copy. Although a final DPA will
normally require organization execution, this file requests no acceptance and
cannot join the agreement through a metadata change alone.

## 1. Parties, scope, and hierarchy

The final addendum will identify Cord's operator and Customer with verified
addresses, tax identifiers, contacts, authority, and execution date. Those
details are incomplete. “Cord” is the service and does not replace the legal
counterparty's name.

It will apply only to Customer Data processed on Customer's behalf to provide
enabled functions and will prevail over the main agreement only for that
processing. A privacy notice, product use, or acknowledgment does not execute
this addendum.

Each party retains any role assigned by law for account data, security, its own
billing, fraud, compliance, payments, or direct relationships. The controller/
processor — or local equivalent — classification is made by activity; Cord is
not a universal processor for every flow.

## 2. Subject matter, duration, and instructions

The proposed subject matter is operation of functions Customer enables during
the account term and agreed return or deletion period. Processing may include
receipt, organization, hosting, retrieval, document and message generation,
transmission, backup, export, restriction, and deletion.

Documented instructions may come from settings, APIs, authenticated actions,
and executed agreements. Customer must ensure they are lawful and recipients
are authorized. Cord should inform Customer and suspend an instruction it
considers contrary to law unless notice is prohibited, without turning that
review into Customer legal advice.

Customer Data may not be sold, used for third-party behavioral advertising, or
included in voluntary model training for an incompatible purpose. Cord's own
security, billing, or compliance operations may involve another role and basis
that must be explained in the privacy notice.

## 3. People, data, purposes, and operations

Data subjects may include users, members, prospects, customers, buyers, signers,
commercial debtors, representatives, directors, and beneficial owners. Data may
include identity and contact, commercial, tax and technical data, quotes,
invoices, payments, communications, delivery or dispute evidence, files, and
fields Customer enters.

The executable addendum must complete, by function, categories, people, purposes,
frequency, recipients, countries, periods, and sensitive data. This general list
does not replace transfer appendices or an impact assessment.

Health records, children's data, identification biometrics, and other special
categories are not authorized without a prior written agreement, necessity,
basis, assessment, and specific controls. The KYC flow can transmit identity
documents to Stripe; that activity must use its actual role rather than a generic
authorization.

## 4. Duties, rights, and incidents

When acting as processor, Cord should process under documented instructions,
bind authorized people to confidentiality, apply measures appropriate to risk,
and reasonably assist with rights, assessments, and consultations considering
the nature of processing and available information.

Cord should notify Customer without undue delay after becoming aware of a
Customer Data breach and provide available information in stages. Timeline,
channel, severity, contact, cooperation, and format do not yet have a demonstrated
operating procedure; this draft promises no contractual 24-, 48-, or 72-hour
deadline.

Customer is responsible for instructions, bases, notices, accuracy, recipients,
and primary handling of its data subjects. No clause removes Cord's own duties
or requires disclosure of other customers' secrets or weakened security.

## 5. Security, audit, and continuity

The code baseline includes TLS, hashed tokens, authentication, permissions,
organization-scoped controls, rate limits, selected event records, and field
encryption for CLABEs and configured secrets. Not all data is field encrypted.
RLS policies exist in schema, but effective activation with the application
database role remains pending.

The measures schedule must validate the deployed environment and specifically
describe access, encryption, availability, backups, restoration, testing,
vulnerabilities, personnel, and incidents. No certification, residency, RTO/RPO,
penetration test, backup period, or provider erasure is promised without evidence.

Audits should first use available documentation and reports and, if insufficient,
an agreed mechanism protecting security, confidentiality, and other customers.
Scope, frequency, costs, and procedure remain open.

## 6. Sub-processors and Customer-directed integrations

The proposed general authorization covers only providers actually classified as
sub-processors. Stripe, Google, and Apple may have their own duties; SAT/PAC/AEAT
are legal recipients; SAML, MCP, Slack, and webhooks configured by Customer are
Customer-directed integrations. One table does not make every role a sub-processor.

Before a new sub-processor handles Customer Data, the final contract must impose
equivalent protection and set advance notice, channel, period, and handling of
objections. Cord has no change-subscription mechanism or fixed period today, so
the authorization is not ready for execution.

Customer remains responsible for scope, credentials, and lawfulness of the
integrations it directs. Cord remains responsible for connection and execution
controls; an instruction does not authorize unlimited external effects.

## 7. International transfers

Each flow must identify exporter, importer, roles, countries, data, purpose, and
mechanism. Where GDPR Chapter V applies, the correct 2021/914 SCC module or other
valid mechanism will be selected with appendices, assessment, and supplementary
measures. A public provider DPA link does not prove Cord's account region or
execution.

United Kingdom, Brazil, Mexico, and other applicable market mechanisms must also
be assessed; EU SCCs are not a universal solution. Privacy-notice consent will
not be used as a blanket transfer substitute.

Regions and contracts for nine inventory entries remain pending. Until completed,
this addendum must not claim universal residency, adequacy, or regularized
transfers.

## 8. Return, deletion, termination, and blockers

Customer has a partial JSON export and product/client CSV files. It is not a
complete return: JSON omits several tables and limits audit history to 1,000
rows. Organization deletion removes the primary row and dependencies; it does
not itself erase backups, provider-held data, or an active Connect account.

KYC evidence has a five-year sweeper, but its `on delete cascade` foreign key
deletes it with the organization. Legal-acceptance evidence survives with no
approved period. Organization `audit_log`, including the deletion-start event,
also cascades. These conflicts prevent a uniform return, retention, or deletion
certificate promise.

**Blockers:** parties/contacts; processing and security schedules; roles by flow;
contracts/regions; transfer map; sub-processor notice and objection; incident and
rights procedures; retention and deletion evidence; legal review, execution, and
versioned publication.

Provenance and evidence: [phase 5.4 data-governance review](../../../../docs/historial/revisiones-legales/2026-09-01-data-governance.md). Original clauses remain preserved through `sourceSections`.
