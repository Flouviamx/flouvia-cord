---
title: "Issue refunds to customers"
description: "How to partially or fully refund a payment directly to the buyer's card."
category: "Payments & Deposits"
order: 4
---


Cord lets you initiate a full or partial refund from the payment history without leaving the platform. The tax correction remains a separate step when the payment already has a CFDI.

### Step 1: Refund the payment in Cord

1. Go to **Payments** and locate the successful payment.
2. Select **Refund**, enter the amount, and confirm the operation.
3. For card payments, Cord requests the return to the issuing bank and updates the net amount when it receives the result.
4. For SPEI transfers (Mexican peso payments only), Cord creates a high-priority task in **Tasks** with the amount and reference, assigned to whoever requested the refund. You must complete the transfer from your bank; Cord never simulates an outgoing transfer.

Only the owner or a member with refund permission can confirm the operation. For security, Cord may request a recent password or second-factor verification.

The processing fee shown before confirmation is not returned by default. A refund also does not automatically reopen or cancel the quote.

### Step 2: Tax correction (Credit Note)

Issuing a refund does not by itself cancel the original tax document.

**In Mexico**, it does not cancel the invoice with the SAT:
1. Go to **Invoices** and open the original invoice.
2. Click **More actions › Credit note**. Cord creates the draft of an expense CFDI related to the invoice's UUID (relation 01).
3. On the draft, click **Issue credit note**. Your client receives its XML when you send it from the detail.

**In every other country**, the correction is a credit note linked to the original invoice: commercial while the country's registration with the tax authority is being turned on, or the document each authority requires once it is active. In **Spain with Verifactu active**, the credit note is a corrective invoice with its own chained record: the already-signed record is never edited. See [Issue a credit note](/en/support/nota-de-credito).

A refund on an **ACH bank debit** can only be for the full amount.

## Effect on a linked invoice

Cord distinguishes a requested refund from a confirmed one. Only confirmed refunds
count toward money returned on the invoice; repeated events must not subtract it
again. A refund can arrive before the payment record and await that link. A credit
note reduces the document amount while a refund returns money: these are separate
actions. Review [balance calculation](https://docs.cordhq.app/en/docs/pagos/facturas-emitidas).

> Availability of the September improvements is being verified. See [scope and release status](https://docs.cordhq.app/en/docs/pagos/mejoras-confiabilidad); contact support if a described action is not yet shown in your account.
