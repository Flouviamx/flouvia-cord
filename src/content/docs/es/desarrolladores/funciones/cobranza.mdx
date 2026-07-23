---
title: "API de Cobranza"
description: "Consulta el envejecimiento de la cartera de clientes y cuentas por cobrar."
---

<header class="content-header">
  <h1 class="page-title">Cobranza</h1>
  <p class="page-subtitle">Diseñada para alimentar motores de alertas tempranas, agentes de IA y recordatorios automatizados.</p>
</header>

## Descripción General

La API de Cobranza es un endpoint analítico y de lectura masiva diseñado específicamente para flujos de trabajo de recuperación. En lugar de forzarte a descargar miles de cotizaciones y calcular fechas manualmente, Cord realiza el cálculo completo de antigüedad (Aging) y saldos en el backend.

Este endpoint es perfecto para ser consumido por un trabajo Cron (`node-cron` o Github Actions) para disparar recordatorios SMS, o para alimentar un dashboard de PowerBI.

## Recuperar Estado de Cartera

El endpoint `GET /v1/cobranza` devuelve un resumen maestro de la salud financiera de la organización.

**Petición:**

```bash
curl -X GET "https://api.cordhq.com/v1/cobranza" \
     -H "Authorization: Bearer sk_live_tU..."
```

**Respuesta (Snapshot Analítico):**

La respuesta está estructurada para uso inmediato, retirando todos los `tokens` públicos secretos por seguridad.

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
