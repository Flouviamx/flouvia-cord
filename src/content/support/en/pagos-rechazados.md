---
title: "Reasons for Declined Payments"
description: "Common bank error codes and how to fix them."
category: "Payments & Deposits"
---

Seeing a failed payment is frustrating, but Cord delegates processing directly to Stripe, so the decline comes from anti-fraud algorithms or the card-issuing bank.

### Identify the reason in Stripe

If a customer reports that their card does not go through when trying to pay a quote:
1. Go to your Stripe Dashboard and navigate to **Payments**.
2. You will see the failed attempts. Stripe will tell you exactly why it bounced (e.g., *insufficient_funds*, *do_not_honor*, *fraudulent*).
3. Since these are high-amount B2B collections (tens of thousands of pesos), it is extremely common for banks to block the card preventively.

**Recommended Solution:**
Ask the customer to call their bank, confirm that they are trying to make a large online payment, and then try the payment again from the Cord quote.
