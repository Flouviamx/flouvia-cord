---
title: "PCI-DSS compliance"
description: "How Cord protects credit card information."
category: "Security & Privacy"
order: 1
---

The Payment Card Industry Data Security Standard (PCI DSS) protects credit card information.

### Risk Delegation to Stripe

Cord **does not touch, store, or process directly** your clients' credit card numbers.

When you configure online payments in Cord using your `STRIPE_SECRET_KEY`:
1. Upon clicking "Pay", your client is redirected to a secure page hosted directly by Stripe (Stripe Checkout).
2. The client enters their card details directly into Stripe's servers.
3. Stripe processes the charge and simply notifies Cord via webhook that the payment was successful.

Therefore, the immense burden of Level 1 PCI-DSS compliance falls entirely on Stripe. Your company and the Cord platform are exempted from complex audits.
