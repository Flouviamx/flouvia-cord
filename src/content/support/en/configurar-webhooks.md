---
title: "Configure and inspect Webhooks"
description: "Receive real-time notifications on your server when events occur in Cord."
category: "Developers"
order: 2
---

Webhooks are HTTP calls (callbacks) that our server makes to yours when an important event occurs asynchronously (e.g., a quote was approved or paid).

### Registering an endpoint

To receive webhooks, expose a `POST` route on your server (e.g., `https://api.yourcompany.com/webhooks/cord`).

1. Go to **Settings > Developers > Webhooks** in the Cord dashboard.
2. Add your URL and save. The **signing secret** is shown only once: store it.
3. Select which events to subscribe to.

### Available events

Cord emits these quote lifecycle events:

- `quote.sent` — sent to the customer.
- `quote.viewed` — the customer opened it.
- `quote.approved` — the customer approved it.
- `quote.rejected` — the customer rejected it.
- `quote.paid` — it was paid.
- `quote.invoiced` — the CFDI was stamped.

The body is JSON: `{ "event": "quote.paid", "created_at": "...", "data": { "id", "folio", "status", "total", "cliente", "link_publico" } }`.

### Signature verification

Always validate the signature to ensure the event comes from Cord. Each request includes two headers: `X-Cord-Event` (the event name) and `X-Cord-Signature` in the format `sha256=<hash>`, where the hash is the HMAC-SHA256 of the **raw body** using your signing secret. [See the verification code](/en/support/firmas-webhooks).

### Retries and inspection

Each endpoint keeps a **delivery log** (status, latency, and response for every attempt). If a delivery fails, you can **redeliver** it from the dashboard, and use the **Test** button to send a test event.
