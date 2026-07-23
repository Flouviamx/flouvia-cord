---
title: "Quotes API"
description: "Create, update, and send quotes programmatically."
---

<header class="content-header">
  <h1 class="page-title">Quotes</h1>
  <p class="page-subtitle">The transactional heart of Cord. Create proposals, get their public links, and manage them.</p>
</header>

## Overview

The `Quote` (`cotizacion`) object represents a commercial proposal to a client. Using the Cord API, you can inject quotes directly from an ERP, CRM, or generate automated shopping cart workflows.

All quotes generated via API are recorded in the audit log (`audit_log`), automatically tagged as originating from your API Key.

## Creating a Quote

To create a draft quote, you must perform a `POST /v1/cotizaciones` sending the commercial details.

**Request:**

```bash
curl -X POST "https://api.cordhq.com/v1/cotizaciones" \
     -H "Authorization: Bearer sk_live_tU..." \
     -H "Content-Type: application/json" \
     -d '{
       "cliente_id": "cus_9x8f7",
       "terminos": "net30",
       "vigencia_dias": 15,
       "notas": "Annual project",
       "items": [
         { "sku": "SERV-01", "cantidad": 12, "precio": 500 }
       ]
     }'
```

**Successful Response:**

Cord returns not only the internal database ID, but also the pre-built **Public Token** (`link_publico`) so you can immediately send it to your client via WhatsApp, SMS, or an external email engine.

```json
{
  "data": {
    "id": "qte_2a9d8",
    "folio": "COT-00104",
    "token": "tok_x8Yj9Z...",
    "link_publico": "https://cordhq.app/q/tok_x8Yj9Z...",
    "needs_approval": false
  }
}
```

## Listing Quotes

You can retrieve your paginated quote history or filter by status (for example, finding all `sent` or `paid` quotes).

**Request:**

```bash
curl -X GET "https://api.cordhq.com/v1/cotizaciones?status=pagada&limit=10" \
     -H "Authorization: Bearer sk_live_tU..."
```
