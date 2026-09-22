---
title: "Issue refunds to customers"
description: "How to partially or fully refund a payment directly to the buyer's card."
category: "Payments & Deposits"
order: 4
---

# Issue refunds to customers


Cord lets you initiate a full or partial refund from the payment history without leaving the platform. The tax correction remains a separate step when the payment already has a CFDI.

### Step 1: Refund the payment in Cord

1. Go to **Payments** and locate the successful payment.
2. Select **Refund**, enter the amount, and confirm the operation.
3. For card payments, Cord requests the return to the issuing bank and updates the net amount when it receives the result.
4. For SPEI transfers (Mexican peso payments only), Cord creates a manual task with the amount and reference. You must complete the transfer from your bank; Cord never simulates an outgoing transfer.

Only the owner or a member with refund permission can confirm the operation. For security, Cord may request a recent password or second-factor verification.

The processing fee shown before confirmation is not returned by default. A refund also does not automatically reopen or cancel the quote.

### Step 2: Tax correction (Credit Note)

Issuing a refund does not by itself cancel the original tax document.

**In Mexico**, it does not cancel the invoice with the SAT:
1. Go to Cord in **Accounting > Invoices** and locate the original invoice.
2. In the options menu (three dots), select **Generate Credit Note** (Expense).
3. Cord will automatically link the parent invoice's UUID using the `01` relationship type.
4. Click on **Stamp Expense**. This will deduct the income for accounting purposes and provide your client with their XML proof.

**In every other country**, the correction is issued as a commercial credit note linked to the original invoice. **In Spain**, if your account issues under Verifactu, the correction never edits the already-signed chained record: it generates a NEW cancellation record, which is added to the chain instead of rewriting the previous one. See [Issuing credit notes](/en/support/nota-de-credito).

## Effect on a linked invoice

Cord distinguishes a requested refund from a confirmed one. Only confirmed refunds
count toward money returned on the invoice; repeated events must not subtract it
again. A refund can arrive before the payment record and await that link. A credit
note reduces the document amount while a refund returns money: these are separate
actions. Review [balance calculation](/en/docs/pagos/facturas-emitidas).

> Availability of the September improvements is being verified. See [scope and release status](https://docs.cordhq.app/en/pagos/mejoras-confiabilidad); contact support if a described action is not yet shown in your account.
