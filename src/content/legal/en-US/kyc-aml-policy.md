---
docId: kyc-aml-policy
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
sourceOfTruth: src/content/legal/en-US/kyc-aml-policy.md
artifactRoute: /en/legal/kyc-aml-policy
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-08-30"
reviewedBy: Technical drafting; external legal review pending
dependsOn: ["payments-terms","privacy"]
sourceSections: ["privacy@2026-08-29#datos"]
releaseBlockers: ["verified-identity", "person-consent-evidence", "processing-roles", "provider-account-contracts", "retention-evidence", "legal-review", "versioned-publication"]
---

# Identity verification notice and KYC conditions

**TECHNICAL DRAFT — unpublished and not in force.** The frontmatter date identifies this review, not a newly effective policy. The editorial identifier `kyc-aml-policy` does not establish that Cord is a financial institution, a regulated entity in every country or a certified anti-money-laundering service.

## 1. Scope and participants

This notice describes information Cord requests to configure and maintain a business's (the Customer's) connected payment account, instructions transmitted to Stripe and associated technical records. Cord is Flouvia's tool; the operator's complete identity, address and privacy contact must be verified before publication.

Participants include the Customer, its representatives and other people requiring identification, Cord and Stripe. Data protection roles must be determined per processing activity: a technical function or commercial agreement does not automatically make every participant the Customer's processor. The privacy notice, Stripe agreements and applicable DPA must be coordinated without asserting unverified contracts or roles.

## 2. Information requested

Requirements are derived from the account and associated persons and may change during use. As applicable, they include personal or business name, address, date of birth, personal or tax identification, business activity, contact information, bank account and relationship to the organization. Identity, address, incorporation or representation documents may be requested.

Representative, administrator, director and beneficial-owner roles must reflect actual circumstances and the provider's requirement. The first person is not presumed to own 100%, and no universal 25% ownership threshold is imposed. Not every field or document is mandatory for every person or country.

## 3. Purposes, representation and separate decisions

Information is used to process payment verification and enablement, address subsequent requirements and maintain traceability and flow security. Capture-quality metrics and provider responses also help evaluate legibility issues. These purposes are not presented as consent to advertising or optional analytics.

Anyone supplying another person's data must have authority and a lawful basis, provide required information to that person and obtain consent where necessary. They must not accept on someone's behalf without valid representation or substitute their own information merely to complete onboarding.

Accepting payment terms, acknowledging a privacy notice and consenting to specific processing are different acts. Current onboarding validates the fee version and a privacy confirmation by the acting user, with server-derived date and IP for the acceptance sent to Stripe. This does not demonstrate versioned acceptance or consent by every identified person. Bases and evidence per person, including financial or sensitive data where applicable, must be completed before publishing this notice as definitive.

## 4. Document capture and transmission

Documents are processed to check format, size and legibility and transmitted to Stripe for the purpose matching the requirement. A quality check does not guarantee authenticity, approval or absence of fraud. Taking an ordinary photograph is not represented as an implemented biometric liveness test.

The identity flow removes unnecessary metadata from supported images while preserving technical orientation where needed. Bytes are handled during transmission; images are not stored in Cord's KYC evidence table. This does not mean that other records contain no personal data or that the provider immediately deletes received copies.

The link for continuing capture on a phone is a temporary credential. It must only be shared with the person whose capture is required. Its expiry and device controls are not that person's consent mechanism and do not justify sharing the link with unauthorized third parties.

## 5. Technical records and retention

Cord attempts to record organization, account and person identifiers, purpose, document type, SHA-256 hash, size, format, dimensions, quality metrics, origin, acting user, IP, browser, dates and provider response status or details. Not every field is present in every case. The hash is not the photograph, but the associated record may still be personal data.

Current configuration sets five years from transmission for KYC technical-evidence cleanup. This is an implemented policy awaiting validation of necessity, legal basis and exceptions; no assertion is made that AML law imposes that period on Cord in every jurisdiction. Recording is best effort and may fail. Cleanup depends on scheduled execution, and deleting an organization may affect records earlier; no guarantee of a complete five-year evidentiary archive is given here.

Provider retention, backups and preservation obligations must be assessed separately. Expiring a capture session does not itself delete a document already transmitted to Stripe.

## 6. Review, restrictions and updates

A successful upload does not mean verification approval. Stripe may request corrections, additional documents or steps that cannot be completed in Cord's interface. The ability to charge and receive payouts has separate statuses. Information must be kept current, and the actual deadline for the requirement must be addressed.

Cord does not guarantee approval, fixed review timelines or permanent verification. An incomplete requirement may prevent or restrict payments or payouts. Dependence on the provider does not remove Cord's own obligations concerning information, security and execution of the flow.

## 7. Rights and requests

Individuals must be able to request information, corrections and applicable rights through the privacy contact verified for publication. The procedure must identify who handles each processing activity, what proportionate verification is needed and how coordination with the Customer or Stripe works. No representative, DPO, new mailbox or uniform deadline is invented here.

Withdrawing consent where it is the applicable basis does not cancel contracts or erase records that must be retained under another valid basis. It also does not justify continued processing without a basis. Closing Cord does not demonstrate Connect closure or permit a promise to erase every third-party copy.

## 8. Coordination and publication conditions

This proposal must be read with approved privacy and payment terms. It authorizes no new processing, does not replace Stripe agreements and creates no universal regulatory obligations.

**Editorial and operational blockers:** verified identity and contact; roles and legal bases by purpose/country/person; representation and consent evidence; provider contracts and transfers; retention, deletion and execution evidence; unsupported requirements and onboarding translation review; legal review and versioned publication.

Provenance and evidence: [phase 5.2 review](../../../../docs/historial/revisiones-legales/2026-08-30-payments.md). The original privacy source remains preserved as identified by `sourceSections`.
