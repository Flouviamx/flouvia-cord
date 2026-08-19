---
title: "Invoicing (CFDI) and the API"
description: "How invoices are issued in Cord and what the public v1 API exposes."
category: "Developers"
---

Invoicing **is** exposed in the public v1 API. An invoice is a resource of its own: you can create it, issue it, send it, record payments against it and void it, without going through a quote.

### The invoice lifecycle

An invoice carries two axes that never get mixed: its **commercial state** (`draft`, `open`, `paid`, `void`, `uncollectible`) and its **tax state** (`pending`, `issued`, `cancelled`, `error`). "Stamped with the SAT" and "paid by the client" are different facts.

1. **Draft** — `POST /api/v1/facturas` with `cliente_id` and `items`. Consumes no invoice number and no stamp.
2. **Issue** — `POST /api/v1/facturas/{id}` with `{ "action": "finalize" }`. This reserves the next sequential number and stamps the document: CFDI 4.0 with the SAT in Mexico (under your organization's digital seal certificate), a commercial invoice with your own numbering everywhere else.
3. **Send** — `{ "action": "send" }` emails the invoice to the client with its PDF and a link to its own payment page.
4. **Collect** — the client pays by card from that link, or you record a manual payment with `{ "action": "payment", "monto": 1000, "moneda": "MXN" }`. Either one reduces the balance; at zero the invoice becomes `paid`.
5. **Void or credit** — `{ "action": "void" }` cancels with the SAT. If the invoice already has payments applied, the response is `409` with `code: "credit_note_required"`: the correct document is a credit note, `{ "action": "credit_note" }`.

### Endpoints

| Method | Path | Scope |
|---|---|---|
| `GET` | `/api/v1/facturas?estado=&cliente=&q=&cursor=` | `read` |
| `POST` | `/api/v1/facturas` | `write` |
| `GET` | `/api/v1/facturas/{id}` | `read` |
| `POST` | `/api/v1/facturas/{id}` (`finalize`, `send`, `payment`, `void`, `credit_note`) | `write` |

The list endpoint paginates by cursor: if the response carries `meta.next_cursor`, repeat the call with `?cursor=`.

### From a quote

If the deal already lived in Cord, nothing changes: you mark the quote as **invoiced** and Cord issues the document inheriting client, lines and currency. Both paths produce the same invoice, with the same lifecycle.

For the CFDI to be issued to a specific tax ID, fill in the client's **tax regime, postal code and CFDI use** on their record. Without those, the document is issued to the general public.

### Webhooks

Every state change fires an event carrying an **invoice** payload (number, tax folio, balance, due date), not a quote one:

`invoice.finalized`, `invoice.sent`, `invoice.paid`, `invoice.payment_failed`, `invoice.voided`, `invoice.marked_uncollectible`, `invoice.overdue`.

### MCP

Cord's MCP server exposes `listar_facturas`, `detalle_factura` and `crear_factura_borrador`. Write access stops at the draft on purpose: stamping is irreversible and costs real money, so it happens from the app or from the API with a write key.
