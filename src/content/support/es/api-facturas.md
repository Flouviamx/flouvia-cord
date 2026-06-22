---
title: "API: Emitir y descargar facturas"
description: "Timbra CFDI 4.0 directamente desde tus sistemas internos."
category: "Desarrolladores"
---

El endpoint de `Invoices` controla el timbrado de CFDI 4.0 en México. Cuando utilizas este endpoint en modo *Live*, te conectas directamente a nuestro PAC certificado (Facturapi).

### Timbrar una Factura Directa

Si no deseas pasar por el flujo de una cotización y solo quieres generar un CFDI 4.0 (Ingreso):

```bash
curl -X POST https://api.flouvia.com/v1/invoices \
  -H "Authorization: Bearer sk_live_..." \
  -d '{
    "customer_id": "cus_12345",
    "payment_form": "03", // 03 = Transferencia electrónica de fondos
    "payment_method": "PUE", // Pago en una sola exhibición
    "use": "G03", // Gastos en general
    "items": [
      {
        "product_key": "43231500", // Clave SAT de Software
        "description": "Desarrollo a la medida",
        "price": 5000000
      }
    ]
  }'
```

**Generación Asíncrona:** La API responderá con un `status: processing`. El timbrado con el PAC puede demorar entre 1 a 5 segundos. Te recomendamos escuchar el evento webhook `invoice.created` para saber cuándo descargar el PDF y XML.
