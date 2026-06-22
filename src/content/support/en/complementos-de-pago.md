---
title: "Payment supplements (REP)"
description: "Guide on the automatic generation of Electronic Payment Receipts for PPD invoices."
category: "Billing & CFDI"
order: 3
---

When you issue an invoice under the PPD (Payment in Installments or Deferred) payment method, the SAT requires you to generate a "Payment Receipt Supplement" (REP) every time the client sends you a payment.

### Manual Generation

Since B2B clients typically pay large amounts via direct SPEI transfer to your bank:
1. Go to the Invoice in Cord.
2. Click on **Register Payment**.
3. Indicate the date the funds reached your bank account, the amount, and the receiving account.
4. Cord will stamp the REP based on that data and settle the invoice balance.

### Automation via Webhooks (Stripe)
If the client pays the quote or PPD invoice using the card payment button (Stripe Checkout), Cord will listen to the `checkout.session.completed` webhook from your Stripe account. Upon receiving it, Cord will mark the invoice as paid and automatically issue the REP with the SAT without any action on your part.
