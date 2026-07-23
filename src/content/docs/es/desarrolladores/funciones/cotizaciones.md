---
title: "API de Cotizaciones"
description: "Crea, actualiza y envía cotizaciones mediante programación."
---

<header class="content-header">
  <h1 class="page-title">Cotizaciones</h1>
  <p class="page-subtitle">El corazón transaccional de Cord. Crea propuestas, obtén sus links públicos y adminístralas.</p>
</header>

## Descripción General

El objeto `Cotizacion` (`quote`) representa una propuesta comercial hacia un cliente. Usando la API de Cord, puedes inyectar cotizaciones directamente desde un ERP, CRM o generar flujos automatizados de carritos de compra.

Todas las cotizaciones generadas vía API quedan registradas en el registro de auditoría (`audit_log`) etiquetadas automáticamente como provenientes de tu Clave de API.

## Crear una Cotización

Para crear un borrador de cotización, debes realizar un `POST /v1/cotizaciones` enviando el detalle comercial.

**Petición:**

```bash
curl -X POST "https://api.cordhq.com/v1/cotizaciones" \
     -H "Authorization: Bearer sk_live_tU..." \
     -H "Content-Type: application/json" \
     -d '{
       "cliente_id": "cus_9x8f7",
       "terminos": "net30",
       "vigencia_dias": 15,
       "notas": "Proyecto anual",
       "items": [
         { "sku": "SERV-01", "cantidad": 12, "precio": 500 }
       ]
     }'
```

**Respuesta Exitosa:**

Cord te devuelve no solo el ID interno de la base de datos, sino también el **Token Público** (`link_publico`) preconstruido para que se lo envíes a tu cliente inmediatamente vía WhatsApp, SMS o un motor de correos externo.

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

## Listar Cotizaciones

Puedes recuperar tu historial paginado de cotizaciones o filtrar por estado (por ejemplo, buscar todas las cotizaciones `enviadas` o `pagadas`).

**Petición:**

```bash
curl -X GET "https://api.cordhq.com/v1/cotizaciones?status=pagada&limit=10" \
     -H "Authorization: Bearer sk_live_tU..."
```
