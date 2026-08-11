---
title: "PCI-DSS compliance"
description: "How Cord protects credit card information."
category: "Security & Privacy"
order: 1
---

The Payment Card Industry Data Security Standard (PCI DSS) protects credit card information.

### Isolated card data

Cord **does not touch, store, or process directly** your clients' credit card numbers.

1. The secure form is embedded in the Cord link, while sensitive fields are isolated and tokenized directly by the certified processor.
2. Cord servers receive a payment identifier, never the full PAN or CVC.
3. Cord validates the event signature before recording the payment result.

This design reduces compliance scope but does not replace your company's security obligations. Never request card numbers through email, chat, quote notes, or custom fields.
