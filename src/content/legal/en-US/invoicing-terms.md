---
docId: invoicing-terms
version: "2026-08-30"
effectiveDate: "2026-08-30"
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
sourceOfTruth: src/content/legal/en-US/invoicing-terms.md
artifactRoute: /en/legal/invoicing-terms
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-08-30"
reviewedBy: Technical drafting; legal and tax review pending
dependsOn: ["terms"]
sourceSections: ["terms@2026-08-11#descripcion","terms@2026-08-11#fiscal"]
releaseBlockers: ["verified-identity", "provider-account-contracts", "cfdi-tax-mapping", "cfdi-cancellation-state", "verifactu-readiness", "retention-evidence", "legal-review", "versioned-publication"]
---

# Invoicing terms

**TECHNICAL DRAFT — unpublished and not in force.** The frontmatter date is editorial. This proposal changes no issued documents, accepted contracts, tax configuration or fees. External legal and tax review and resolution of the technical blockers below are required.

## 1. Scope, parties and documents

Cord Invoicing helps the business using it (the Customer) prepare and manage documents for its transactions. Cord is Flouvia's tool; the operator's complete identity, address and contacts must be verified before publication. The Customer issues documents for its sales; invoices for Cord fees or subscriptions concern a different transaction and issuer.

A quote, commercial PDF, payment receipt, CFDI and Verifactu record are not interchangeable. Availability of a template or country does not establish reporting to an authority, deductibility, tax certification or coverage of all the Customer's obligations.

## 2. Data, taxes and credentials

The Customer must supply genuine issuer and recipient information, descriptions, quantities, prices, currency, tax regime, tax identifiers and other elements required for its transaction. It must review exemptions, withholdings, rates, product codes, units and payment treatment; defaults are not advice or a determination of its obligations.

Invoice currency differs from Cord plan currency. Where a document requires an exchange rate, it must match the applicable currency pair and date; parity is not assumed, and a bookkeeping rate for a third country is not treated as the required tax exchange rate.

Certificates, keys and authorizations must belong to the relevant issuer and remain under authorized persons' control. Uploading a credential does not establish that every transaction is valid or authorize its use for other issuers. Cord retains its own responsibilities for handling credentials and executing instructions received.

## 3. Mexico: CFDI issuance

The Mexico integration uses Facturapi to request CFDI issuance. Actual tax stamping depends on valid issuer credentials and configuration, sufficient tax information and the provider's response. A test result, simulated document, internal reference or PDF alone does not establish a real, valid CFDI. The issuing environment, XML, UUID and corresponding status must be checked.

Where credentials are unavailable, Cord's provider may produce a result marked as simulated; a test environment must not be used as a real tax receipt either. The Customer must check that the returned document's issuer and amounts match its transaction.

The reviewed integration does not yet demonstrate transmission of all configured line-item tax rates and withholdings to the provider. Complete tax equivalence between Cord's calculation and the stamped XML is therefore not promised. This is an implementation blocker requiring correction and testing, not a responsibility eliminated by a clause.

## 4. Cancellations, corrections and partial payments

Requesting CFDI cancellation does not demonstrate that cancellation is complete. The reason, linkage to a replacement document and possible recipient acceptance depend on the case. Final tax status must be verified and the relevant acknowledgment retained. The current path still needs to handle pending statuses and send the replacement UUID where required; it is not represented as fully covering those cases.

Recording a partial payment, deposit, refund or commercial credit note does not automatically create a payment receipt supplement (Complemento de Recepción de Pagos, REP) or determine whether one is required. Returning money and canceling a tax document are separate processes. The Customer must determine its transaction's treatment with its adviser and available tax tools, without relieving Cord of responsibility to correct its own failures.

## 5. Spain: Verifactu states and current limits

The organization's mode and issuance prerequisites determine the path. Commercial mode generates a document without tax reporting; it is not an assertion of a compliant NO VERI*FACTU system. In Verifactu mode, a missing issuer NIF or system identity can block issuance: automatic conversion to a commercial document is not guaranteed.

The states must be distinguished:

| Observed state | What it establishes |
|---|---|
| Commercial document | A generated document; not evidence of AEAT submission. |
| Chained record / pending | Local hash and record generation; not evidence of transmission. |
| Submission attempted | A communication attempt; not by itself evidence of accepted receipt. |
| Accepted, accepted with errors or rejected | A recorded authority response; its details and outstanding actions must be reviewed. |

The technical `authority_submission` flag, a QR code or a hash alone is not proof of acceptance. The reviewed deployment has daily scheduled processing and submission disabled by default; that cadence does not establish immediate reporting or overall conformity. The path is not offered as tax-ready while identity, the producer's declaration of responsibility, configuration, testing and status corrections remain outstanding.

The declaration of responsibility belongs to the system producer; it is not an approval granted by the AEAT. Generating cancellation or correction records does not authorize deletion or rewriting of the historical chain, or by itself demonstrate that the authority received the correction.

## 6. Other countries and commercial scope

Outside expressly verified tax paths, the document is commercial. Transmission to the SAT, AEAT or another authority, or compliance with every local format, ledger or report, is not promised. The offered country catalog does not expand that coverage.

The Customer must determine any additional documents and reports required for its activity. Features, plan quotas and payment methods are separate matters: issuing an invoice does not enable a payment rail or guarantee payment. Automatic late interest is disabled.

## 7. Retention, errors and closure

The Customer must keep the copies and acknowledgments needed for its obligations. Local files, backups and provider retention are separate layers; Cord does not guarantee permanent tax archiving or a uniform period across countries here. Deleting an organization does not cancel issued documents or erase authority or provider records.

If information differs or a response is uncertain, the existing document and status must be checked before issuing again or correcting it. Cord does not promise error-free operation, but this notice does not exclude its obligations for its own failures. Incident, support and retention procedures must be defined before publication.

## 8. Contractual coordination and blockers

The proposal supplements general terms, privacy and payment terms in the versions eventually approved. It does not replace issuer tax agreements or mandatory law. Precedence, governing law, forum, contact and acceptance must be reviewed with the master proposals.

**Editorial and operational blockers:** verified identity; Facturapi issuer/credentials and agreements; CFDI tax mapping; pending cancellation and replacement handling; Verifactu statuses and prerequisites; declaration of responsibility and reporting; verified retention and export; market-specific tax/legal review and versioned publication.

Evidence and primary sources: [phase 5.2 review](../../../../docs/historial/revisiones-legales/2026-08-30-payments.md). Originals remain preserved as identified by `sourceSections`.
