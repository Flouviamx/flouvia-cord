---
title: "[EN] API: Gestionar clientes"
description: "Sincroniza el catálogo de clientes con tu ERP."
category: "Developers"
---

El objeto `Customer` es fundamental en la arquitectura de Cord, ya que vincula métodos de pago, facturación recurrente e historial crediticio.

### Creación de un Cliente

Para registrar un nuevo cliente desde tu backend, realiza una petición `POST` a `/v1/customers`:

```bash
curl -X POST https://api.flouvia.com/v1/customers \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "email": "pagos@acmecorp.com",
    "tax_id": "ACM190203XYZ",
    "metadata": {
      "erp_id": "CUST-8812"
    }
  }'
```

**Campos Clave:**
- `tax_id`: Si proporcionas un RFC válido en México, el sistema lo utilizará para emitir facturas (CFDI 4.0) automáticamente si así lo configuras.
- `metadata`: Utiliza este objeto (clave-valor) para guardar el ID de tu cliente en tu propio ERP o base de datos. Cord retornará esta metadata en todos los webhooks relacionados al cliente.
