---
title: "API: Gestionar clientes"
description: "Sincroniza el catálogo de clientes con tu ERP vía la API REST."
category: "Desarrolladores"
---

El recurso `clientes` te permite leer y crear el directorio de clientes de tu organización desde tu backend, ideal para sincronizar con tu ERP o CRM.

### Listar clientes

```bash
curl "https://cordhq.app/api/v1/clientes?limit=50&offset=0" \
  -H "Authorization: Bearer sk_live_tu_llave"
```

Devuelve `{ "data": [ ... ], "meta": { "limit": 50, "offset": 0, "total": 128 } }`.

### Crear un cliente

Haz un `POST` a `/api/v1/clientes` (requiere una llave con alcance de **escritura**):

```bash
curl -X POST https://cordhq.app/api/v1/clientes \
  -H "Authorization: Bearer sk_live_tu_llave" \
  -H "Content-Type: application/json" \
  -d '{
    "empresa": "Acme Corp",
    "contacto": "Laura Méndez",
    "email": "pagos@acmecorp.com",
    "telefono": "5512345678",
    "rfc": "ACM190203XYZ",
    "terminos": "net30",
    "limite": 500000,
    "nivel": "oro",
    "descuento_pct": 10
  }'
```

Respuesta: `{ "data": { "id": "..." } }`.

**Campos:**
- `empresa` (obligatorio): razón social o nombre comercial.
- `rfc`: si capturas un RFC válido, podrás timbrar CFDI 4.0 a nombre de este cliente al facturar su cotización.
- `terminos`: `contado`, `net30` o `net60`.
- `limite`: límite de crédito en pesos (MXN).
- `nivel`: `estandar`, `plata`, `oro` o `distribuidor` (lista de precios).
- `descuento_pct`: descuento automático del nivel (0–100).

Los montos siempre van en **pesos** (no centavos).
