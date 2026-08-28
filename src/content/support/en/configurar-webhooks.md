---
title: "Configure and inspect Webhooks"
description: "Receive real-time notifications on your server when events occur in Cord."
category: "Developers"
order: 2
---

Webhooks are HTTP calls (callbacks) that our server makes to yours when an important event occurs asynchronously (e.g., a quote was approved or paid).

### Registering an endpoint

To receive webhooks, expose a `POST` route on your server (e.g., `https://api.yourcompany.com/webhooks/cord`).

1. Turn on **Developer mode** (the switch at the bottom of the Settings index) and open the **Webhooks** tab in the Developers dock, the bar at the bottom of the screen.
2. Add your URL and save. The **signing secret** is shown only once: store it.
3. Select which events to subscribe to.

### Available events

Cord emits quote lifecycle events and, separately, events for the invoice as its own object (see [Invoicing and the API](/en/support/api-facturas)):

- `quote.sent` — sent to the customer.
- `quote.viewed` — the customer opened it.
- `quote.approved` — the customer approved it.
- `quote.rejected` — the customer rejected it.
- `quote.updated` — it was edited and resent.
- `quote.expired` — it expired without a response.
- `quote.deleted` — a draft was deleted.
- `quote.paid` — it was paid in full.
- `payment.partial` — a deposit, balance, or installment was collected without covering the full total.
- `payment.failed` — a recurring charge failed.
- `invoice.finalized`, `invoice.sent`, `invoice.paid`, `invoice.payment_failed`, `invoice.voided`, `invoice.marked_uncollectible`, `invoice.overdue` — lifecycle of an invoice created as its own resource via `/api/v1/facturas`.

The body is JSON: `{ "id": "evt_...", "event": "quote.paid", "created_at": "...", "data": { "id", "folio", "status", "total", "cliente", "link_publico" } }`. The event's `id` is stable across retries and a manual redelivery from the dashboard — use it to deduplicate on your side.

### Signature verification

Always validate the signature to ensure the event comes from Cord. Every delivery includes `X-Cord-Signature-V1` (with a timestamp, replay protection) and, for backward compatibility, the legacy `X-Cord-Signature` (no timestamp). The event name travels in `X-Cord-Event` and its stable id in `X-Cord-Event-Id`/`Idempotency-Key`. On Node, the `@flouviahq/elements/server` package validates both forms for you (`CordWebhooks.constructEvent`); if you'd rather verify it by hand in any language, [see the verification code](/en/support/firmas-webhooks).

### Retries and inspection

Each endpoint keeps a **delivery log** (status, latency, and response for every attempt). If a delivery fails, you can **redeliver** it from the dashboard, and use the **Test** button to send a test event.
