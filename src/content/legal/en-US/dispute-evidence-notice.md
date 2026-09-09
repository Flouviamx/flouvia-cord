---
docId: dispute-evidence-notice
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
sourceOfTruth: src/content/legal/en-US/dispute-evidence-notice.md
artifactRoute: /en/legal/dispute-evidence-notice
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-08-30"
reviewedBy: Technical drafting; external legal review pending
dependsOn: ["payments-terms","privacy"]
sourceSections: ["terms@2026-08-11#reembolsos","privacy@2026-08-29#datos"]
releaseBlockers: ["verified-identity", "processing-roles", "provider-account-contracts", "evidence-minimization", "retention-evidence", "legal-review", "versioned-publication"]
---

# Dispute evidence notice

**TECHNICAL DRAFT — unpublished and not in force.** The frontmatter date is an editorial working date. This proposed notice describes the reviewed flow; it is not an instruction to send data, buyer acceptance or a new authorization. Legal and privacy review must be completed before publication.

## 1. Purpose and participants

When a buyer disputes a payment, the selling business (the Customer) can prepare a response through Cord. Cord, Flouvia's tool, receives instructions from authorized organization users and transmits files or evidence to Stripe in the context of its connected account. The operator's complete identity and contact channels must be verified for the final version.

Stripe receives the information to process the dispute; the response may be passed to the card issuer and payment network under the applicable procedure. Cord does not determine the outcome. Roles, agreements and international transfer mechanisms must be verified per processing activity and provider; this notice does not create them.

## 2. Data that evidence may contain

The response may include buyer name and email, product or service description, service date, purchase or approval IP, transaction references, amounts and currency, receipts, selected communication, delivery documents and refund or cancellation policies. The user must review file contents, not just filenames.

Cord's generated receipt includes available business and quote details, buyer and email, amount and currency, payment method and date, transaction, line items, signer's name, approval date and full approval IP address. No promise is made that this IP is anonymized or that each automatic receipt field can be excluded individually.

Communication converted to PDF comes from the text the user provides for that purpose, together with customer and quote references. The entire conversation thread is not automatically attached. A saved text field is not, by itself, a file submitted as evidence.

## 3. When information leaves Cord

Three actions must be distinguished:

| Action | Effect in the reviewed flow |
|---|---|
| Save draft | Stores fields and references in Cord; that action does not upload new files or submit the response. It may contain references to files previously transmitted. |
| Prepare or upload files with confirmation | Sends bytes to Stripe and receives file identifiers, even before the final response is submitted. |
| Submit final response with confirmation | Sends selected fields and references to Stripe with an instruction to submit dispute evidence. |

Preparing a receipt or communication PDF may transfer data even if the draft is later abandoned. Removing a reference, replacing a file or closing the screen does not itself revoke a previous transfer. A failure after uploading a file may leave it with the provider even without complete local confirmation.

## 4. Review, minimization and confirmation

Before preparing files or submitting evidence, the user must review the information shown, its relevance to the case and the transfer notice. Cord requires confirmation at these steps; saving a draft is different. Final submission also requires a recently authenticated session.

The Customer must provide truthful information and preserve necessary context, without fabricating documents or misleadingly omitting facts. It must exclude information unrelated to the dispute, credentials, unnecessary card data and unrelated third-party information. If irrelevant information needs to be obscured, an appropriate copy must be prepared before upload; comprehensive automatic content redaction is not offered.

If the automatic receipt includes irrelevant data, it must not be generated on the assumption that those data are already hidden. An appropriate alternative must be reviewed before confirming transfer. Technical format or file-security controls do not replace content review.

## 5. Customer instruction and processing basis

The acting user must have permission and authority to represent the Customer in that dispute. Confirmation instructs transmission and acknowledges the notice presented; it does not establish consent by the buyer, signer or every person mentioned.

The Customer and Cord must identify their respective legal bases and information duties according to the processing and jurisdiction. Defending a transaction does not authorize unlimited collection or transmission of any data. Provider participation does not remove Cord's own obligations either. If a person requests rights concerning already transmitted information, the response must be coordinated under applicable roles and obligations.

## 6. Deadlines, submission and outcome

The Customer must meet the actual deadline communicated for the case. Saving a draft or uploading a file does not by itself satisfy the submission deadline. Local confirmation must be checked against provider status if an error or uncertain response occurs.

The reviewed flow prevents evidence changes once final submission is recorded. Withdrawal, replacement or resubmission is not guaranteed. Before confirming, the Customer must review the completeness of the package and the case conditions.

Stripe communicates the procedural outcome, which depends on the issuer or network as applicable. Cord does not guarantee a win, recovery of funds, avoidance of a fee or suspension of debits by preparing evidence. Financial consequences are reviewed in the payment terms, not created in this notice.

## 7. Retention, deletion and contact

Cord retains the draft, file references, dispute status and technical action records; Stripe retains received files under its applicable framework. This notice sets no single period for every layer and does not guarantee synchronized deletion across Cord, provider, issuer and network.

Deleting an organization, discarding a draft or requesting data deletion does not demonstrate that a submitted file has disappeared from the provider's case record. Requests and preservation exceptions require a verifiable procedure and genuine privacy contact, pending for publication. No unimplemented external-file retrieval or deletion capability is promised.

## 8. Related documents and blockers

This proposal is coordinated with approved privacy and payment terms, without replacing processor agreements or mandatory law. It does not incorporate future versions of other texts or automatically become part of an existing acceptance.

**Editorial and operational blockers:** identity/contact; roles, bases and transfers; evidence of the exact content confirmed; automatic receipt minimization review; provider contract and retention; orphan-file and uncertain-response handling; rights procedure; legal review and versioned publication.

Provenance and evidence: [phase 5.2 review](../../../../docs/historial/revisiones-legales/2026-08-30-payments.md). Original clauses remain preserved as identified by `sourceSections`.
