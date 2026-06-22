---
title: "Deposit reconciliation"
description: "Export reports to match deposits with your accounting."
category: "Payments & Deposits"
---

Reconciling B2B payments can be complex, especially if you receive multiple SPEI transfers or consolidated deposits from Stripe.

### Transfer Reconciliation (SPEI)
Cord does not have direct visibility into your bank statement. To reconcile transfers:
1. When you receive a deposit, search for the quote Folio or the client's RFC in Cord.
2. Open the quote and click on **Mark as Paid**.
3. If the quote requires a CFDI, this will immediately trigger the stamping of the Invoice (PUE) or the Payment Supplement (REP).

### Stripe Reconciliation
If your clients pay by card via the integrated checkout:
1. Cord marks the quote as 'Paid' instantly thanks to the webhook.
2. In your Stripe account, you will be able to see the Cord Quote number (e.g., `COT-042`) injected into the `metadata` of the PaymentIntent.
3. Use Stripe's reports to see which transactions make up each payout to your bank.
