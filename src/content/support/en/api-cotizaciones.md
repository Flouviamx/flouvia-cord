---
title: "API: Create Quotes"
description: "Generate and send quotes programmatically with Cord's REST API."
category: "Developers"
---

The `cotizaciones` (quotes) resource lets you generate dynamic proposals from your backend, ideal for integrations with your CRM or ERP.

### Create a quote

Make a `POST` to `/api/v1/cotizaciones` with at least one item (requires **write** scope):

```bash
curl -X POST https://cordhq.app/api/v1/cotizaciones \
  -H "Authorization: Bearer sk_live_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "cliente_id": "customer-id",
    "terminos": "net30",
    "vigencia_dias": 15,
    "send": true,
    "items": [
      {
        "descripcion": "Annual ERP license",
        "cantidad": 1,
        "precio_unitario": 15000
      }
    ]
  }'
```

Response:

```json
{ "data": { "id": "...", "folio": "COT-0149", "status": "sent", "link_publico": "/q/abc123" } }
```

**Body fields:**
- `items` (required): array of line items. Each with `descripcion`, `cantidad`, `precio_unitario` and, optionally, `producto_id`, `precio_negociado`, `costo_unitario`, and `tax_rate` (fraction 0–1, e.g. `0.16`; if omitted, your organization's default rate is used — tax is a line-level fact, not a document-level one).
- `cliente_id` (optional): id of an existing customer (create one with [API: Manage Customers](/en/support/api-clientes)).
- `cliente` (optional, alternative to `cliente_id`): an object `{ empresa, email?, contacto?, telefono?, rfc? }` for a customer that doesn't exist yet — Cord looks it up by company/email within your organization and creates it if not found.
- `terminos`: `contado` (cash), `net30`, or `net60`.
- `vigencia_dias`: days the quote stays valid.
- `notas`: free text shown at the bottom of the quote.
- `send`: if `true`, Cord emails the public link to the customer on creation.
- `base_currency`/`fiscal_currency` (optional): the currency the customer sees the quote in, and the accounting currency it's invoiced in, when they differ. `fx_buffer_pct` adds a buffer on top of the frozen exchange rate.
- `iva_incluido` (optional): if `true`, the items' `precio_unitario` already include tax.

**Important:**
- All amounts are in **pesos** (`15000` = $15,000.00 MXN), not cents.
- Totals (taxes, withholdings, and currency) are computed server-side with the same engine the app uses — never trust a total computed on the client.
- `link_publico` is the path of the link your customer sees (`/q/{token}`); prefix it with `https://cordhq.app`.

### List quotes

```bash
curl "https://cordhq.app/api/v1/cotizaciones?status=sent&limit=50" \
  -H "Authorization: Bearer sk_live_your_key"
```

Returns `{ "data": [ ... ], "meta": { "limit": 50, "offset": 0, "total": 87 } }`. A quote's detail (with items and events) is at `GET /api/v1/cotizaciones/{id}`.
