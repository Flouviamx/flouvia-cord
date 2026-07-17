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
- `items` (required): array of line items. Each with `descripcion`, `cantidad`, `precio_unitario` and, optionally, `producto_id` and `precio_negociado`.
- `cliente_id` (optional): id of an existing customer (create one with [API: Manage Customers](/en/support/api-clientes)).
- `terminos`: `contado` (cash), `net30`, or `net60`.
- `vigencia_dias`: days the quote stays valid.
- `send`: if `true`, Cord emails the public link to the customer on creation.

**Important:**
- All amounts are in **pesos** (`15000` = $15,000.00 MXN), not cents.
- Tax (IVA) and totals are computed server-side based on your organization's settings.
- `link_publico` is the path of the link your customer sees (`/q/{token}`); prefix it with `https://cordhq.app`.

### List quotes

```bash
curl "https://cordhq.app/api/v1/cotizaciones?status=sent&limit=50" \
  -H "Authorization: Bearer sk_live_your_key"
```

Returns `{ "data": [ ... ], "meta": { "limit": 50, "offset": 0, "total": 87 } }`. A quote's detail (with items and events) is at `GET /api/v1/cotizaciones/{id}`.
