---
title: "Test card numbers"
description: "List of PANs to simulate 3D Secure flows and failures."
category: "Developers"
---

When you are in the implementation phase or developing against the API in the **Sandbox** environment, do not use real credit cards. You can simulate successful payments using the test numbers provided by Stripe.

### Magic Cards (Test mode only)

Make sure you have your Stripe `sk_test_...` key configured in Cord.
In the Stripe Checkout form, enter any future expiration date and any 3-digit CVC.

**To simulate successful payments:**
- Use the generic Visa card: `4242 4242 4242 4242`

**To simulate bank declines:**
Stripe provides specific numbers to simulate errors. Use any of these with any date and CVC:
- Insufficient funds: `4000 0000 0000 0004`
- Card reported stolen: `4000 0000 0000 0002`

The system will react the same as in production: Cord will not approve the quote or issue the invoice in test mode if the payment fails.
