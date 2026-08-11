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
4. For SPEI transfers, Cord creates a manual task with the amount and reference. You must complete the transfer from your bank; Cord never simulates an outgoing transfer.

Only the owner or a member with refund permission can confirm the operation. For security, Cord may request a recent password or second-factor verification.

The processing fee shown before confirmation is not returned by default. A refund also does not automatically reopen or cancel the quote.

### Step 2: Tax Correction in Cord (Credit Note)
Issuing a refund does not cancel the invoice with the SAT.
1. Go to Cord in **Accounting > Invoices** and locate the original invoice.
2. In the options menu (three dots), select **Generate Credit Note** (Expense).
3. Cord will automatically link the parent invoice's UUID using the `01` relationship type.
4. Click on **Stamp Expense**. This will deduct the income for accounting purposes and provide your client with their XML proof.
