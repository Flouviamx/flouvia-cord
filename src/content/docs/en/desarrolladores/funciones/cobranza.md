---
title: "Collections API"
description: "Query the aging of your client portfolio and accounts receivable."
---

<header class="content-header">
  <h1 class="page-title">Collections</h1>
  <p class="page-subtitle">Designed to feed early warning engines, AI agents, and automated reminders.</p>
</header>

## Overview

The Collections API is an analytical, mass-read endpoint specifically designed for recovery workflows. Instead of forcing you to download thousands of quotes and calculate dates manually, Cord performs the complete aging and balance calculations on the backend.

This endpoint is perfect for being consumed by a Cron job (`node-cron` or Github Actions) to trigger SMS reminders, or to feed a PowerBI dashboard.

## Retrieving Portfolio Status

The `GET /v1/cobranza` endpoint returns a master summary of the organization's financial health.

**Request:**

```bash
curl -X GET "https://api.cordhq.com/v1/cobranza" \
     -H "Authorization: Bearer sk_live_tU..."
```

**Response (Analytical Snapshot):**

The response is structured for immediate use, stripping all secret public `tokens` for security.

```json
{
  "data": {
    "resumen": {
      "total_vencido": 150000,
      "total_por_cobrar": 450000,
      "facturas_vencidas_count": 12
    },
    "aging": {
      "dias_0_30": 300000,
      "dias_31_60": 50000,
      "dias_61_90": 20000,
      "dias_90_mas": 80000
    },
    "items": [
      {
        "id": "qte_...",
        "folio": "COT-00104",
        "status": "vencida",
        "dias_retraso": 14,
        "saldo_pendiente": 5000
      }
    ],
    "clientes": [
      {
        "id": "cus_...",
        "empresa": "Stark Industries",
        "deuda_total": 55000
      }
    ]
  }
}
```
