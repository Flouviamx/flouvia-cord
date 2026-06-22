---
title: "Issue refunds to customers"
description: "How to partially or fully refund a payment directly to the buyer's card."
category: "Payments & Deposits"
order: 4
---

The refund process involves two areas: the payment gateway (where the money is) and Cord (where your accounting and CFDI are).

### Step 1: Return the Money (Stripe)
Cord cannot move the money back to the customer's card.
1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com/).
2. Locate the successful charge and click on **Refund**.
3. Stripe will request the issuing bank to return the money.

### Step 2: Tax Correction in Cord (Credit Note)
Issuing the refund in Stripe DOES NOT cancel the invoice with the SAT.
1. Go to Cord in **Accounting > Invoices** and locate the original invoice.
2. In the options menu (three dots), select **Generate Credit Note** (Expense).
3. Cord will automatically link the parent invoice's UUID using the `01` relationship type.
4. Click on **Stamp Expense**. This will deduct the income for accounting purposes and provide your client with their XML proof.
