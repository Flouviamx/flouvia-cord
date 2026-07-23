---
title: "Pagination"
description: "Learn to navigate long lists of results in the Cord API."
---

<header class="content-header">
  <h1 class="page-title">Pagination</h1>
  <p class="page-subtitle">Efficiently navigate large volumes of data using offset cursors.</p>
</header>

## Why do we paginate?

Endpoints that return collections of objects, like listing all your clients or quotes, can return hundreds of thousands of records. To ensure the Cord API is always fast and stable, these endpoints limit the number of objects returned by default (usually 50 or 100) using a pagination model based on `limit` and `offset`.

## Query Parameters

All list reading routes (`GET /v1/cotizaciones`, `GET /v1/clientes`, `GET /v1/productos`) accept the following parameters in the URL:

- `limit`: (Integer) Determines the maximum number of results to return.
- `offset`: (Integer) Specifies how many results to skip before starting to return data.

**Request Example (Page 2):**

```bash
curl -X GET "https://api.cordhq.com/v1/clientes?limit=50&offset=50" \
     -H "Authorization: Bearer sk_live_tU..."
```

## Response Structure (Meta)

All Cord paginated responses return a JSON object with two main properties: `data` (the array of objects) and `meta` (pagination information for your frontend or scripts).

```json
{
  "data": [
    { "id": "cus_123", "empresa": "ACME Corp" },
    { "id": "cus_124", "empresa": "Stark Ind" }
  ],
  "meta": {
    "limit": 50,
    "offset": 50,
    "total": 142
  }
}
```

- Use `meta.total` to build pagination controls in your UI or to know exactly when to stop a data export script.
