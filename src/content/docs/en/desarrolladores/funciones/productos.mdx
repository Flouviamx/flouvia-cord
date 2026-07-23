---
title: "Products API"
description: "Feed and query your product and service catalog."
---

<header class="content-header">
  <h1 class="page-title">Products</h1>
  <p class="page-subtitle">Feed your service catalog and securely expose inventories in your frontends.</p>
</header>

## Overview

The `Product` object contains the elements of your price list (SKU, name, base price, and unit metric). Cord's products API is secure enough that you can consume it not only from your internal servers, but also directly from your clients' browsers.

## Creating a Product

Use your **Secret API Key** (`sk_`) to mass-feed the catalog. Ideal for nightly integrations or webhooks originating from inventory management systems.

**Request:**

```bash
curl -X POST "https://api.cordhq.com/v1/productos" \
     -H "Authorization: Bearer sk_live_tU..." \
     -H "Content-Type: application/json" \
     -d '{
       "sku": "LIC-PRO-24",
       "nombre": "Professional Annual License",
       "unidad": "license",
       "precio": 12000,
       "activo": true
     }'
```

**Successful Response:**

```json
{
  "data": {
    "id": "prod_1a2b3c..."
  }
}
```

## Listing Products & Data Security

The listing API (`GET /v1/productos`) features a Dynamic Masking mechanism based on the trust level of the API key you authenticate with.

If you use a **Secret Key (`sk_`)**:
Cord assumes you are a trusted internal system and returns the complete object, **including hidden costs and profit margins (`costo`)**.

If you use a **Publishable Key (`pk_`)**:
Publishable keys are exposed in the browser (for example, to render a pricing list on a public React website). Cord assumes risk and **automatically removes the `costo` field from all results in memory** before serializing the JSON. This way, your margins are never leaked to the public frontend.

```bash
curl -X GET "https://api.cordhq.com/v1/productos?limit=50" \
     -H "Authorization: Bearer pk_live_yX..."
```
