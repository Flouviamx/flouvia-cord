---
title: "Configure and inspect Webhooks"
description: "Receive real-time notifications on your server when events occur in Cord."
category: "Developers"
order: 2
---

Webhooks are HTTP calls (callbacks) that our server makes to yours when an important event occurs asynchronously (e.g., a client paid, or an invoice was stamped).

### Registering an Endpoint

To receive webhooks, you first need to expose a `POST` route on your server (e.g., `https://api.yourcompany.com/webhooks/cord`).
1. Go to **Developers > Webhooks** in the Cord dashboard.
2. Add your URL.
3. Select which events you want to subscribe to. We recommend starting with `charge.succeeded` and `invoice.created`.

### Signature Verification

For security reasons, someone could pretend to be Cord and send you fake events to attempt to hack your inventory. **It is mandatory that you validate the cryptographic signature** we send in the headers of each request.

The header is called `Cord-Signature` and includes a timestamp and the HMAC SHA-256 hash. Use the *Webhook Secret* we provided when creating the endpoint to verify it. [View verification code snippets in Node.js and Python](/en/support/firmas-webhooks).
