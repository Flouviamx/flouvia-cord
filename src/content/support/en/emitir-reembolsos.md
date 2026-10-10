---
title: "Issue refunds to customers"
description: "How to refund a quote or invoice payment, fully or partially, and how to correct the tax document afterwards."
category: "Payments & Deposits"
order: 4
---


Cord lets you initiate a full or partial refund from where you see the payment, without leaving the platform. The tax correction remains a separate step when the payment already has a CFDI.

### Step 1: Refund the payment in Cord

**A quote payment** (full payment, deposit, balance, installments or retainer):

1. Go to **Payments** and locate the successful payment.
2. Select **Refund**, enter the amount, and confirm the operation.
3. For card payments, Cord requests the return to the issuing bank and updates the net amount when it receives the result.
4. For a quote's SPEI transfers (Mexican peso payments only), Cord creates a high-priority task in **Tasks** with the amount and reference, assigned to whoever requested the refund. You must complete the transfer from your bank; Cord never simulates an outgoing transfer.

**An invoice payment** (from its link, the client portal or automatic payments), by card, SEPA debit, ACH debit, SPEI transfer or Mercado Pago:

1. Go to **Invoices**, open the invoice and, under **Payments**, click **Refund** next to the payment.
2. Before you confirm, the dialog tells you how much you can return and, when it can't be returned, why: an ACH debit can only be returned in full, a SEPA or ACH debit only within 180 days, and a debit still in progress can't be returned until it's confirmed.
3. If the payment covered several invoices, choose **This invoice only** (up to what the payment applied to it) or **The whole payment**.
4. Enter the amount, check the fee box and confirm. The invoice gets a balance again for what you returned as soon as the refund is confirmed.
5. For an invoice's SPEI transfer, your client receives an email to provide the bank account the money is returned to (the invoice needs their email). Until they do, the refund is on hold; if they don't respond within 45 days, it isn't completed and the money stays as a balance in their favor in your payments account: write to us to return it.

This feature is new and may not be enabled on your account yet. If you don't see it, write to us. A manually recorded invoice payment has no button: Cord did not move that money. A quote payment made with Mercado Pago is refunded from your Mercado Pago account, and Cord records it on its own.

Only the owner or a member with refund permission can confirm the operation. For security, Cord may request a recent password or second-factor verification.

The processing fee shown before confirmation is not returned by default. A refund also does not automatically reopen or cancel the quote.

### Step 2: Tax correction (Credit Note)

Issuing a refund does not by itself cancel the original tax document. Cord doesn't issue the correction on its own, because not every refund is a return of the sale (refunding a duplicate charge, for example, doesn't change what was invoiced).

**In Mexico**, it does not cancel the invoice with the SAT, and if the payment had a payment complement, it doesn't cancel that either. While there is refunded money without a credit note covering it, the invoice detail page reminds you. To issue it:

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
