---
docId: invoicing-terms
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
sourceOfTruth: src/content/legal/en-US/invoicing-terms.md
artifactRoute: /en/legal/invoicing-terms
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-10-10"
reviewedBy: Technical drafting; legal and tax review pending
dependsOn: ["terms"]
sourceSections: ["terms@2026-09-28#descripcion","terms@2026-09-28#fiscal"]
releaseBlockers: ["verified-identity", "provider-account-contracts", "fr-platform-contract", "latam-rail-activation", "verifactu-readiness", "spfe-publication", "fiscal-retention-after-closure", "retention-evidence", "legal-review", "versioned-publication"]
---

# Invoicing terms

**TECHNICAL DRAFT — unpublished and not in force.** The frontmatter date is editorial. This proposal changes no issued documents, accepted contracts, tax configuration or fees. External legal and tax review and resolution of the technical blockers below are required. Reviewed on October 10, 2026 against the per-country tax rails, CFDI replacement, discounts and United States sales tax.

## 1. Scope, parties and documents

Cord Invoicing helps the business using it (the Customer) prepare and manage documents for its transactions. Cord is Flouvia's tool; the operator's complete identity, address and contacts must be verified before publication. The Customer issues documents for its sales; invoices for Cord fees or subscriptions concern a different transaction and issuer.

A quote, commercial PDF, payment receipt, CFDI, Verifactu record and document authorized by another authority are not interchangeable. Availability of a template, electronic format or country does not establish reporting to an authority, deductibility, tax certification or coverage of all the Customer's obligations.

Depending on the issuer's country and the enabled rails, Cord can stamp CFDI in Mexico through an authorized provider; generate and submit Verifactu records to the AEAT; transmit directly to ARCA (Argentina), Sefin Nacional and SEFAZ (Brazil), SUNAT (Peru), the SII (Chile) and the DIAN (Colombia); issue through an approved platform in France; or issue a commercial invoice that is not transmitted. Each rail starts disabled and is enabled separately; until then, the document is commercial.

## 2. Data, taxes and credentials

The Customer must supply genuine issuer and recipient information, descriptions, quantities, prices, currency, tax regime, tax identifiers and other elements required for its transaction. It must review exemptions, withholdings, rates, product codes, units and payment treatment; defaults are not advice or a determination of its obligations.

Invoice currency differs from Cord plan currency. Where a document requires an exchange rate, it must match the applicable currency pair and date; parity is not assumed, and a bookkeeping rate for a third country is not treated as the required tax exchange rate.

Certificates, keys, folio files (CAF) and access passwords for the authority —including Peru's SOL user and password and Colombia's software PIN and technical key— must belong to the issuer or to a person authorized to use them on its behalf, and remain under authorized persons' control. By uploading them, the Customer authorizes Cord to use them only to sign and transmit that organization's documents, check their status and, in Chile, answer its suppliers. Cord stores them encrypted, per rail and environment, and never returns them to the browser. Uploading a credential does not establish that every transaction is valid or authorize its use for other issuers. Cord retains its own responsibilities for handling credentials and executing instructions received.

A document discount is applied before taxes and allocated across the lines; each tax document declares it according to its format. The Customer defines its coupons (value, currency, validity and limits) and is responsible for its promotions complying with applicable law. Cord records each coupon use when the invoice is issued or the quote approved and, if the coupon is exhausted, does not issue or approve the document.

## 3. Mexico: CFDI issuance

The Mexico integration uses Facturapi to request CFDI issuance. Actual tax stamping depends on valid issuer credentials and configuration, sufficient tax information and the provider's response. A test result, simulated document, internal reference or PDF alone does not establish a real, valid CFDI. The issuing environment, XML, UUID and corresponding status must be checked.

Where credentials are unavailable, Cord's provider may produce a result marked as simulated; a test environment must not be used as a real tax receipt either. The Customer must check that the returned document's issuer and amounts match its transaction.

The integration declares, per line, the VAT rate frozen in the document (16%, 8% or exempt), VAT and income-tax withholdings and the allocated discount, and rejects before the provider a document whose breakdown does not reconcile or that requires IEPS or a taxable zero rate, which are not yet represented. SAT product and unit codes come from the line or the product; without them the SAT generic codes are used and the editor warns about it. It also issues the global invoice to the general public and CFDI to foreign recipients, without the foreign-trade complement. This mapping narrows, but does not remove, the need to review the stamped XML.

## 4. Cancellations, replacements and partial payments

Requesting CFDI cancellation does not demonstrate that cancellation is complete. Cord asks for the SAT reason and stores the status the provider returns (accepted, awaiting the recipient's response, under verification, rejected or expired); until accepted, the invoice remains valid and the status can be checked again. Cord does not cancel a CFDI with valid credit notes (they must be voided first) or with recorded payments (it asks for a credit note instead).

CFDI replacement is now available: Cord creates a draft with the original's data, stamps it linked to the original (relationship 04), moves the original's payments and coupon to it in the same operation, and then requests cancellation of the original with reason 01 and the replacement's tax folio. If that cancellation remains pending or is rejected, it is stored and can be retried. The global invoice is corrected by canceling it, with reason 04 when a customer asks for its own invoice.

Cord issues the payment receipt supplement (Complemento de Recepción de Pagos, REP) for each payment recorded against a CFDI stamped as deferred or installment payment (PPD), once per payment, and keeps a supplement that failed visible on the invoice so it can be retried. A deposit, refund or commercial credit note does not by itself determine whether another tax document is required. Returning money and canceling a tax document are separate processes. The Customer must determine its transaction's treatment with its adviser and available tax tools, without relieving Cord of responsibility to correct its own failures.

## 5. Spain: Verifactu, business-to-business e-invoicing and current limits

The organization's mode and issuance prerequisites determine the path. Commercial mode generates a document without tax reporting; it is not an assertion of a compliant NO VERI*FACTU system. With AEAT submission disabled, Cord does not generate chained records: the document is commercial, without QR code or legend. In Verifactu mode, a missing issuer NIF or system identity can block issuance: automatic conversion to a commercial document is not guaranteed.

The states must be distinguished:

| Observed state | What it establishes |
|---|---|
| Commercial document | A generated document; not evidence of AEAT submission. |
| Chained record / pending | Local hash and record generation; not evidence of transmission. |
| Submission attempted | A communication attempt; not by itself evidence of accepted receipt. |
| Accepted, accepted with errors or rejected | A recorded authority response; its details and outstanding actions must be reviewed. |

The technical `authority_submission` flag, a QR code or a hash alone is not proof of acceptance. Submission is disabled by default; when enabled, it runs in batches every hour and after issuing or voiding, observing the waiting time the AEAT sets. That cadence does not establish immediate reporting or overall conformity. The path is not offered as tax-ready while identity, the producer's declaration of responsibility, configuration and testing remain outstanding.

The declaration of responsibility belongs to the system producer; Cord publishes it on its own page, but it is not an approval granted by the AEAT. Generating cancellation or correction records does not authorize deletion or rewriting of the historical chain, or by itself demonstrate that the authority received the correction. Verifactu records cannot be deleted and, while they exist, prevent deleting the organization.

Mandatory business-to-business e-invoicing (Law 18/2022 and Royal Decree 238/2026) will travel through the AEAT's public solution. Cord has that submission built, but transmits nothing until the AEAT publishes its service; the screen shows it as coming soon. Invoices with personal income-tax withholding (IRPF) are downloaded as Facturae until the AEAT publishes how to declare them through that channel. If the Customer enables Facturae signing, Cord signs it on the Customer's behalf with the certificate uploaded for Verifactu; without that option it is downloaded unsigned.

## 6. Other countries and commercial scope

In Argentina, Brazil, Peru, Chile and Colombia, when the rail is enabled and the Customer has uploaded its credentials, Cord acts as its invoicing system and transmits directly to the authority, without an intermediary provider and without acting as attorney-in-fact or accredited technology provider. A document has tax validity only once the authority authorizes it; a submission without a response is queried and never blindly resent; an authorized document is not edited: it is voided only where the authority allows it and otherwise corrected with a credit note. Each rail rejects before sending what it does not yet cover (for example, consumer receipts, exports, withholdings or levies it does not model) and says so on screen. In test environments documents carry a legend stating they have no tax validity.

In Chile, if the Customer uses receipt of its suppliers' documents, Cord validates each document, automatically sends the receipt acknowledgment signed with the Customer's certificate and, when the Customer decides, sends the acceptance or claim and registers it with the SII. The Customer must decide within the legal deadline; the decision cannot be changed afterwards and Cord does not make it on the Customer's behalf.

In France, when the service is enabled and the Customer completes registration and signs the mandate on the approved platform's page, Cord transmits its invoices between businesses established in France and reports the other sales and payments the law requires. The platform is the Customer's counterparty for that service and is governed by its own terms. Cord only issues; the Customer needs its own receiving platform. Reported data is not corrected from Cord, and a rejected invoice is corrected with a new one.

Elsewhere in the European Union, Cord generates Factur-X, XRechnung or Peppol when the invoice allows it and, as the Customer chooses, attaches them to email; it does not transmit them through the Peppol network or to FACe. In the United States, address-based sales tax calculation uses the states where the Customer declares it collects; the Customer collects and files, and Cord does not handle registrations or file returns.

Outside those verified paths, the document is commercial. The offered country catalog does not expand that coverage. The Customer must determine any additional documents and reports required for its activity. Features, plan quotas and payment methods are separate matters: issuing an invoice does not enable a payment rail or guarantee payment. Automatic late interest is disabled.

## 7. Retention, errors and closure

The Customer must keep the copies, XML and acknowledgments its tax law requires for the applicable period. Cord keeps tax documents and authority responses while the organization exists, with no age-based deletion. Deleting the organization erases them, except Verifactu records, which prevent deletion. Deleting an organization does not cancel issued documents or erase authority, platform or provider records. Before closing its account, the Customer must download what it needs to keep; the general export does not include tax documents and there is currently no bulk XML download.

If information differs or a response is uncertain, the existing document and status must be checked before issuing again or correcting it. Cord does not promise error-free operation, but this notice does not exclude its obligations for its own failures. Incident, support and retention procedures must be defined before publication.

## 8. Contractual coordination and blockers

The proposal supplements general terms, privacy and payment terms in the versions eventually approved. It does not replace issuer tax agreements or mandatory law. Precedence, governing law, forum, contact and acceptance must be reviewed with the master proposals.

**Editorial and operational blockers:** verified identity; Facturapi issuer/credentials and agreements; production contract with the French approved platform; activation and real testing of each Latin American rail with a certificate from that country; Verifactu statuses and prerequisites; declaration of responsibility and reporting; publication of the AEAT's business-to-business e-invoicing service; retention after closure and download of tax documents; market-specific tax/legal review and versioned publication.

Evidence and primary sources: [phase 5.2 review](../../../../docs/historial/revisiones-legales/2026-08-30-payments.md) and [per-country invoicing review](../../../../docs/historial/revisiones-legales/2026-10-10-facturacion-paises.md). Originals remain preserved as identified by `sourceSections`.
