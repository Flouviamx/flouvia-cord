---
title: "PCI-DSS compliance"
description: "How Cord protects credit card information."
category: "Security & Privacy"
order: 1
---

The Payment Card Industry Data Security Standard (PCI DSS) protects credit card information.

### Isolated card data

Cord **does not touch, store, or process directly** your clients' credit card numbers.

1. The secure form is embedded in the Cord link, while sensitive fields are isolated and tokenized directly by the certified processor behind Cord Payments — never inside a Cord server.
2. Cord servers receive a payment identifier, never the full PAN or CVC.
3. Cord validates the event's cryptographic signature before recording the payment result, to rule out spoofed notifications.

This design reduces your business's compliance scope — because you never touch or store card data, your PCI-DSS self-assessment (SAQ) usually qualifies for the lowest level, though the exact level depends on your full operation, not only on Cord — but it does not replace your own security obligations or certify you automatically. Never request card numbers through email, chat, quote notes, or custom fields.
