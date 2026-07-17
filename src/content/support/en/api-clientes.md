---
title: "API: Manage Customers"
description: "Synchronize your customer catalog with your ERP via the REST API."
category: "Developers"
---

The `clientes` (customers) resource lets you read and create your organization's customer directory from your backend, ideal for syncing with your ERP or CRM.

### List customers

```bash
curl "https://cordhq.app/api/v1/clientes?limit=50&offset=0" \
  -H "Authorization: Bearer sk_live_your_key"
```

Returns `{ "data": [ ... ], "meta": { "limit": 50, "offset": 0, "total": 128 } }`.

### Create a customer

Make a `POST` to `/api/v1/clientes` (requires a key with **write** scope):

```bash
curl -X POST https://cordhq.app/api/v1/clientes \
  -H "Authorization: Bearer sk_live_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "empresa": "Acme Corp",
    "contacto": "Laura Mendez",
    "email": "ap@acmecorp.com",
    "telefono": "5512345678",
    "rfc": "ACM190203XYZ",
    "terminos": "net30",
    "limite": 500000,
    "nivel": "oro",
    "descuento_pct": 10
  }'
```

Response: `{ "data": { "id": "..." } }`.

**Fields:**
- `empresa` (required): legal or trade name.
- `rfc`: if you capture a valid RFC, you can stamp CFDI 4.0 in this customer's name when invoicing their quote.
- `terminos`: `contado` (cash), `net30`, or `net60`.
- `limite`: credit limit in pesos (MXN).
- `nivel`: `estandar`, `plata`, `oro`, or `distribuidor` (price tier).
- `descuento_pct`: automatic tier discount (0–100).

Amounts are always in **pesos** (not cents).
