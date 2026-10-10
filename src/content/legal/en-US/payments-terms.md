---
docId: payments-terms
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
sourceOfTruth: src/content/legal/en-US/payments-terms.md
artifactRoute: /en/legal/payments-terms
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-10-10"
reviewedBy: Technical drafting; external legal review pending
dependsOn: ["terms"]
sourceSections: ["terms@2026-09-28#pagos-autorizacion","terms@2026-09-28#reembolsos"]
releaseBlockers: ["verified-identity", "provider-account-contracts", "fee-reconciliation", "negative-balance-review", "autopay-consent-evidence", "debit-notice-verification", "legal-review", "versioned-publication"]
---

# Payment terms

**TECHNICAL DRAFT — unpublished and not in force.** The frontmatter date identifies a working copy, not the start of obligations. This text proposes standalone terms; it does not replace accepted terms or fee version `cord-pagos-2026-08-11`. External legal review and resolution of the blockers below are required. Reviewed on October 10, 2026 against Mercado Pago, the customer portal, automatic payments and direct debit.

## 1. Scope and parties

Cord Payments enables the business using Cord (the Customer) to request payments from its buyers through its connected Stripe account. Where available, the Customer may also collect with its own Mercado Pago account, which is governed by that provider's terms. Cord is Flouvia's tool; its operator's complete identity, address and contractual contact channels must be verified before publication. This document does not create a new entity or establish financial licensing.

The Customer remains the seller: it defines the transaction, obtains the buyer's authorization, delivers goods or services, handles complaints and determines its tax obligations. Cord transmits instructions to the processor and records results; it does not offer a bank account or promise immediate access to funds. Using Stripe or Mercado Pago does not remove Cord's own obligations.

## 2. Onboarding, availability and authorization

Online payment availability depends on supported country, transaction method and currency, verification requirements and enabled capabilities. Stripe does not open connected accounts in Colombia, Argentina, Chile or Peru; there, and also in Mexico and Brazil, the Customer can connect its Mercado Pago account. Where both exist, Cord Payments is the primary rail and Mercado Pago the alternative. Without a connected rail, payments are recorded manually. Choosing a quote currency does not guarantee that online collection is available.

The person configuring the account must have authority to represent the Customer and accept the applicable Stripe agreements presented during onboarding, or Mercado Pago's when connecting that account. Payment, refund and payout-management instructions must come from authorized users. Personal acceptance of general terms does not replace organizational authority or any required buyer consent.

## 3. Fees and currencies

For organizations that activated and accepted the current Cord Payments schedule, the MXN table provides: card payments, 4% plus MXN 3, plus VAT; recurring card payments, the same blended rate, including Cord's 0.4% margin, not another 0.4% on top of 4%. SPEI: 1% plus MXN 7, plus VAT, capped at MXN 588.12 combined per transaction. The cap reflects Cord's MXN 500 margin plus the fixed component and their taxes; it does not cap the payment amount.

Calculations use the currency's minor units and processor rounding. Platform fees and processing costs are different components; Cord's estimate does not replace Stripe's actual settlement or establish an account's negotiated pricing.

The platform schedule for USD, EUR, GBP, CAD and BRL is disabled. This does not mean free processing: Stripe costs may apply under the account agreement. Mexican pricing and VAT are not converted into other currencies. Direct debit is offered only where Cord charges no platform fee; where it does (currently MXN), only cards are offered. Legacy organizations retain their prior arrangement until specifically accepting the new schedule. This draft changes no amounts, taxes or charge authorizations.

## 4. Deposits, recurring payments, automatic payments and payouts

The Customer must communicate the transaction amount, currency, frequency, due dates and cancellation conditions to the buyer. Recording a deposit, installment or payment term does not provide Cord financing or guarantee recovery of the balance. Automatic late interest is disabled.

**Portal and grouped payments.** The Customer may share with each customer a personal link where they see their invoices and balance per currency and pay several at once. The link works as a credential; the Customer creates, rotates or turns it off. A payment covering several invoices allocates the amount using each invoice's actual balance when it is created.

**Automatic payments.** The Customer's customer turns them on from their portal, through an express authorization in favor of the Customer that Cord records with text version, date, IP and browser, and that takes effect only once the processor confirms the saved method. Invoices due from the authorization date onward are charged in a single charge per customer and currency. A definitive decline (stolen card, fraud, revoked mandate) turns the method off; other declines are retried under a fixed policy with a maximum number of attempts. Cord emails the customer, in the Customer's name, when a charge fails, and gives the Customer a task when collection stops. The Customer can only turn it off; it cannot turn it on for its customer.

**Direct debit.** SEPA in euros (Spain, Germany and France) and ACH in US dollars (United States), only if the Customer enables it and the processor enables the capability on its account. A debit takes days to confirm and the payer's bank may return it later; while processing, the invoice cannot be charged again or voided. The processor sends the account holder the notice of each SEPA charge and the ACH mandate confirmation. The Customer is responsible for complying with debit scheme rules and handling returns.

A pending balance is not an available balance or a received bank payout. Payout scheduling depends on availability, verification, processor restrictions and banking timelines. Cord does not guarantee a deposit date or change the provider's reserve or withholding powers through this document.

## 5. Buyer refunds

The Customer must review the transaction, refundable amount and fee disclosure before confirmation. The card flow requests a refund from Stripe and retains the platform fee; the request may remain pending or fail. Confirmation of a request does not demonstrate that the buyer has received the money. A partial refund of a payment that covered several invoices is allocated from the last invoice applied to the first. ACH does not support partial refunds.

For SPEI, Cord records a pending manual refund and a task: the Customer must make the transfer separately. That record does not move money. Under the inherited commercial policy, transaction and processing fees are not returned for a voluntary refund unless Flouvia expressly confirms otherwise in writing, without excluding mandatory rights or applicable adjustments. Refunding the price does not automatically cancel a tax document.

## 6. Disputes and negative balances

Stripe may debit disputed amounts and applicable fees. If the balance is insufficient, Flouvia may be liable to the processor under the account's configuration and agreements. The inherited allocation is retained **as a proposal requiring review**, without expansion: the Customer is responsible to Flouvia for disputed amounts, fees and negative balances attributable to its transactions, except to the extent directly caused by Flouvia's proven fraud or willful misconduct.

That inherited clause contemplates repayment within five business days after written notice, recovery against present or future balances where law and Stripe allow, pausing new payments or payouts, and requesting another authorized payment method. Its scope, exceptions and procedure require legal approval before publication. No automatic recovery mechanism is represented as implemented, and no new bank debit authorization is obtained here.

The Customer must provide truthful evidence within the case deadline. Cord assists in preparing and transmitting it but does not decide or guarantee the outcome. A favorable outcome does not guarantee return of every processor or network fee.

## 7. Cord subscription and closure

Cord's plan price is separate from the fee for collecting buyer payments. Renewal, authorized usage charges and cancellation are governed by the general terms and plan agreement. The inherited policy against refunds for unused months or overages requires review of its legal exceptions; this document does not expand it.

Deleting an organization does not demonstrate successful cancellation of an external subscription, Connect account closure or settlement of outstanding obligations. Transactions, refunds, disputes and provider statuses must be verified separately.

## 8. Related documents and publication control

The proposal is to be read with approved versions of general terms, privacy, invoicing terms and KYC/evidence notices. Processor agreements govern its service; no clause overrides mandatory law. Precedence, governing law, forum, notices and organizational acceptance remain subject to approval. No unknown future version is incorporated by reference.

**Editorial blockers:** verified identity and contacts; actual Stripe and Mercado Pago agreements per account/country; fee reconciliation and recurring rounding; review of refund exclusions, liability and balance recovery; sufficiency and retention of automatic-payment evidence (a new authorization currently replaces the previous one); confirming SEPA and ACH debit notices on a real account; alignment with master revisions; versioned acceptance and explicit publication.

Provenance and technical evidence: [phase 5.2 review](../../../../docs/historial/revisiones-legales/2026-08-30-payments.md) and [per-country invoicing review](../../../../docs/historial/revisiones-legales/2026-10-10-facturacion-paises.md). Original clauses remain preserved in the sources identified by `sourceSections`.
