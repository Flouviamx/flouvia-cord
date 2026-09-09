---
docId: acceptable-use-policy
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
sourceOfTruth: src/content/legal/en-US/acceptable-use-policy.md
artifactRoute: /en/legal/acceptable-use-policy
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-09-01"
reviewedBy: Technical drafting; external legal review pending
dependsOn: ["terms"]
sourceSections: ["terms@2026-08-11#prohibidas","terms@2026-08-11#fairuse"]
releaseBlockers: ["verified-identity", "provider-restriction-map", "organization-enforcement", "appeal-procedure", "mcp-tool-confirmation", "retention-evidence", "legal-review", "versioned-publication"]
---

# Acceptable use policy

**TECHNICAL DRAFT — unpublished and not in force.** The frontmatter date identifies an editorial proposal. This document does not itself expand suspension powers, create new monitoring or change accepted terms. Original clauses remain in force within their own scope until an authorized publication.

## 1. Scope and responsibility

The proposed policy applies to the use of Cord accounts, organizations, APIs, public links, documents, email, payments, invoicing, AI, MCP, webhooks and integrations. It covers owners, members, invitees, API clients and anyone acting with Customer credentials.

The Customer must administer permissions, protect credentials, supervise its team and obtain necessary authorization for content, data and instructions. It may not use Cord or a provider as a means to do what it could not lawfully do directly. Cord retains responsibility for its own controls, security and operational response.

## 2. Illegal, deceptive or harmful conduct

Cord must not be used to:

- violate applicable law, orders, sanctions or other persons' rights;
- impersonate, forge authorization, conceal the true issuer or mislead about the source, price, recipient or nature of a transaction;
- sell illegal goods or services, or regulated ones without required licensing and controls;
- harass, threaten, discriminate, exploit or disclose confidential or personal information without a basis;
- infringe intellectual property, privacy, professional secrecy or contractual commitments;
- distribute malware, phishing, spam, exploitation material or instructions intended to cause unlawful harm.

A provider-policy reference applies only to the feature using that provider and the relevant contractual version; it does not silently incorporate every future policy or replace a comprehensible Cord restriction list.

## 3. Invoicing, payments and collections

Simulated transactions, documents for nonexistent transactions, tax evasion, evidence alteration, manipulation of prices or identifiers, unauthorized charging and improperly obtained payment data are prohibited. Concealing refunds, fraudulent dispute activity, money laundering and financing unlawful activity are also prohibited.

The Customer must not present a commercial PDF, simulation, test environment, pending status or internal record as a tax receipt, confirmed payment or accepted authority response. It must use genuine issuer and recipient data and correct errors through the applicable process.

Collections must not harass, threaten nonexistent consequences, contact unrelated third parties, continue after an applicable stop request or invent a balance, interest, authority or acceptance. Automatic interest is disabled. Installment plans require attributable acceptance and clear conditions; ambiguous context must not activate them.

## 4. Security and infrastructure

Attempts at unauthorized access; evasion of authentication, RLS, permissions, quotas, rate limits or fraud controls; credential or card testing; malicious code; availability interference; cross-organization extraction; and automation intended to overload Cord or third parties are prohibited.

API keys, capture tokens, public links, MCP secrets, certificates and provider credentials must be limited to their purpose and authorized persons. Sharing them creates operational risk but does not excuse Cord from investigating its own failure. Good-faith security testing requires authorization and agreed scope; this policy creates no public bounty program.

The Customer must not configure integrations to internal or unsafe destinations or grant an agent broader tools than necessary. Cord's SSRF blocking or secret encryption does not establish the security or legitimacy of an external system.

## 5. AI and automation

AI must not be used to deceptively impersonate a person, generate fraud, threats, discrimination, unlawful surveillance, prohibited decisions or content violating this policy. Submitted data and documents must be necessary and authorized.

The Customer must review output where it can affect prices, payments, rights or communications. It must not remove automation disclosures or present a suggestion as confirmed fact. Automatic mode requires proportionate monitoring, exclusions and a human channel.

An MCP permission does not authorize every external effect. Until tool-level controls exist, write or destructive tools must not be enabled for the quote assistant. Attempts through documents or servers to induce the model to reveal secrets, ignore controls or execute unauthorized action violate this policy.

## 6. Quotas, “unlimited” and reasonable use

“Unlimited” describes a commercial dimension without a particular ordinary quota; it does not mean infinite capacity, guaranteed continuity or freedom from controls. Plan limits, metered usage, upload size, concurrency, security, provider and infrastructure protections still apply.

Cord may reject or limit requests when a gate cannot establish authorization, quota or safety margin. Rate limits are not universal: they vary by route and some fallbacks depend on configuration. Complete abuse detection or one global ceiling is not promised.

The inherited promise to migrate a high-usage account to dedicated infrastructure is removed. Any special capacity requires an express agreement; it does not arise automatically from high usage.

## 7. Response and measures

Current controls include validation, permissions, quotas, route-specific limits, file or destination rejection, session and key revocation, automation exclusions and manual Ops suspension of users. No general engine detects every violation, and no complete organization-suspension workflow under this policy has been demonstrated.

Where sufficient evidence exists and within applicable limits, Flouvia may take proportionate measures: request correction, limit the affected feature, preserve evidence, revoke credentials, suspend access or terminate under the contract. Urgency, security, fraud, legal obligation and third-party risk may justify action without advance notice; otherwise notice and reasonable opportunity to cure should be sought.

Reporting every suspicion is not promised. Information is shared with a provider or authority where required, validly requested or legitimately and proportionately necessary, subject to privacy and law. Suspension does not automatically determine forfeiture of payments or refunds; the contract and mandatory rules apply.

## 8. Review, contact and publication

A verifiable reporting and review channel must exist. Decisions should record scope, basis and measure, distinguish user from organization where appropriate and permit proportionate human review without exposing security controls. These procedures and contacts are not yet complete.

The policy coordinates with approved terms, privacy, payments, invoicing, collections and AI disclosures. Precedence, notices, evidence, exceptions, appeal and balance treatment must be resolved before publication.

**Blockers:** identity/contacts; provider/country restriction map; investigation and organization-suspension procedure; appeal and notices; MCP confirmation; retention/evidence; legal review and versioned publication.

Provenance and evidence: [phase 5.3 automation review](../../../../docs/historial/revisiones-legales/2026-09-01-automation.md). Original clauses remain preserved as identified by `sourceSections`.
