---
title: "API: Crear cotizaciones"
description: "Endpoint para generar y enviar cotizaciones programáticamente."
category: "Desarrolladores"
---

La API de Cotizaciones (Quotes) permite generar propuestas dinámicas programáticamente, ideal para integraciones con CRMs como Salesforce o HubSpot.

### Crear una Cotización (Quote)

Las cotizaciones requieren al menos un `line_item` (partida).

```javascript
// Ejemplo usando el SDK de Node.js de Cord
const cord = require('cord-node')('sk_live_...');

const quote = await cord.quotes.create({
  customer_id: 'cus_9a8b7c6d',
  expiration_date: 1735689600, // Unix timestamp
  line_items: [
    {
      name: 'Licencia Anual ERP',
      quantity: 1,
      unit_price: 1500000, // En centavos ($15,000.00 MXN)
      tax_rate: 'tx_iva_16'
    }
  ],
  require_signature: true
});

console.log(quote.hosted_url); // Enlace para enviar al cliente
```

**Lógica de Precios en Centavos:** Absolutamente todos los montos en la API de Cord se manejan en centavos para evitar errores de precisión de punto flotante. Un precio de `1500000` equivale a $15,000.00.
