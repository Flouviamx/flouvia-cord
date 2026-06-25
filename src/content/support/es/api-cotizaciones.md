---
title: "API: Crear cotizaciones"
description: "Genera y envía cotizaciones programáticamente con la API REST de Cord."
category: "Desarrolladores"
---

El recurso `cotizaciones` te permite generar propuestas dinámicas desde tu backend, ideal para integraciones con tu CRM o ERP.

### Crear una cotización

Haz un `POST` a `/api/v1/cotizaciones` con al menos un ítem (requiere alcance de **escritura**):

```bash
curl -X POST https://cord.flouvia.com/api/v1/cotizaciones \
  -H "Authorization: Bearer sk_live_tu_llave" \
  -H "Content-Type: application/json" \
  -d '{
    "cliente_id": "id-del-cliente",
    "terminos": "net30",
    "vigencia_dias": 15,
    "send": true,
    "items": [
      {
        "descripcion": "Licencia anual ERP",
        "cantidad": 1,
        "precio_unitario": 15000
      }
    ]
  }'
```

Respuesta:

```json
{ "data": { "id": "...", "folio": "COT-0149", "status": "sent", "link_publico": "/q/abc123" } }
```

**Campos del cuerpo:**
- `items` (obligatorio): arreglo de partidas. Cada una con `descripcion`, `cantidad`, `precio_unitario` y, opcionalmente, `producto_id` y `precio_negociado`.
- `cliente_id` (opcional): id de un cliente existente (créalo con [API: Gestionar clientes](/soporte/api-clientes)).
- `terminos`: `contado`, `net30` o `net60`.
- `vigencia_dias`: días que la cotización permanece válida.
- `send`: si es `true`, Cord envía el link público al correo del cliente al crearla.

**Importante:**
- Todos los montos van en **pesos** (`15000` = $15,000.00 MXN), no en centavos.
- El IVA y los totales se calculan en el servidor según la configuración de tu organización.
- `link_publico` es la ruta del link que ve tu cliente (`/q/{token}`); antepón `https://cord.flouvia.com`.

### Listar cotizaciones

```bash
curl "https://cord.flouvia.com/api/v1/cotizaciones?status=sent&limit=50" \
  -H "Authorization: Bearer sk_live_tu_llave"
```

Devuelve `{ "data": [ ... ], "meta": { "limit": 50, "offset": 0, "total": 87 } }`. El detalle de una cotización (con ítems y eventos) está en `GET /api/v1/cotizaciones/{id}`.
