---
title: "Clients API"
description: "Synchronize and manage the client directory from your accounting systems."
---

<header class="content-header">
  <h1 class="page-title">Clients</h1>
  <p class="page-subtitle">Synchronize your database of organizations and commercial prospects.</p>
</header>

## Overview

The `Client` object contains the master commercial record of the people or organizations you bill. Synchronizing clients via the API is the foundation for keeping Cord perfectly aligned with your ERP or CRM (like Salesforce or HubSpot).

## Creating a Client

Create a new client by sending a `POST /v1/clientes`. The only strictly required field is the company name (`empresa`), but it is recommended to include the RFC and credit terms (`limite`, `terminos`).

**Request:**

```bash
curl -X POST "https://api.cordhq.com/v1/clientes" \
     -H "Authorization: Bearer sk_live_tU..." \
     -H "Content-Type: application/json" \
     -d '{
       "empresa": "Stark Industries",
       "contacto": "Tony Stark",
       "email": "tony@stark.com",
       "rfc": "STA120412XYZ",
       "terminos": "net30",
       "limite": 500000,
       "nivel": "oro",
       "descuento_pct": 15
     }'
```

**Successful Response:**

```json
{
  "data": {
    "id": "cus_8f7b2c..."
  }
}
```

### Automated Business Rules

When you create clients via API, Cord applies real-time logical constraints:
- Payment terms (`terminos`) must be valid (`contado`, `net30`, `net60`). If you pass an invalid term, it defaults to `contado`.
- Partnership level (`nivel`) is restricted to `estandar`, `plata`, `oro`, or `distribuidor`.
- The RFC is automatically formatted and uppercase-normalized.
- The discount (`descuento_pct`) is mathematically bounded between 0 and 100.

## Listing Clients

Retrieve the complete catalog using [Pagination](/docs/desarrolladores/esenciales/paginacion).

```bash
curl -X GET "https://api.cordhq.com/v1/clientes?limit=100" \
     -H "Authorization: Bearer sk_live_tU..."
```
