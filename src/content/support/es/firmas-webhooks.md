---
title: "Verificar firmas de Webhooks"
description: "Valida criptográficamente que un webhook viene de Cord."
category: "Desarrolladores"
---

Asegurar la procedencia de los webhooks es crítico. Un atacante podría enviarte un payload falso (ej. `{"event":"quote.paid"}`) para que liberes algo sin que el cobro sea real. Por eso debes validar la firma.

### Cómo firma Cord

Cada entrega manda **dos** firmas del cuerpo en bruto, para que puedas migrar sin ventana de cortes:

- **`X-Cord-Signature-V1`** (recomendada): `t=<timestamp unix>,v1=<hmac-sha256 hex de "{t}.{cuerpo}">`. Incluye el timestamp dentro de lo firmado, así que puedes rechazar una entrega vieja reenviada (protección anti-replay). Durante una rotación de secreto puede traer dos pares `v1=`; basta con que uno cuadre.
- **`X-Cord-Signature`** (legacy, se mantiene por compatibilidad): `sha256=<hmac-sha256 hex del cuerpo>`, sin timestamp.

Además de la firma, cada entrega trae `X-Cord-Event` (nombre del evento), `X-Cord-Event-Id` (id estable del evento, igual en reintentos y en un reenvío manual — úsalo para deduplicar), `X-Cord-Delivery-Id` (cambia en cada intento) e `Idempotency-Key` (repite el mismo valor de `X-Cord-Event-Id`, para frameworks que la leen automáticamente).

### Con el SDK oficial (recomendado)

`@flouviahq/node` trae el verificador ya escrito: exige `X-Cord-Signature-V1`, compara en tiempo constante y rechaza una entrega con más de 300 segundos de antigüedad (configurable con `tolerance`). La firma legacy solo se acepta si la pides con `allowLegacySignature: true`.

```typescript
import { constructEvent, CordWebhookSignatureError } from '@flouviahq/node';

// Ejemplo con un Route Handler de Next.js — req.text() ya es el cuerpo crudo
export async function POST(req: Request) {
  try {
    const event = await constructEvent(await req.text(), req.headers, process.env.CORD_WEBHOOK_SECRET!);
    // event.event, event.data — el catálogo de eventos está en la guía de webhooks
    return new Response('ok');
  } catch (err) {
    if (err instanceof CordWebhookSignatureError) return new Response('Firma inválida', { status: 400 });
    throw err;
  }
}
```

`npx @flouviahq/cli init` crea esta ruta por ti, y `npx @flouviahq/cli listen` te deja probarla en tu máquina con firmas reales.

### Verificación manual en Node.js (Express)

Si no usas el SDK, puedes verificar la firma legacy a mano:

```javascript
const crypto = require('crypto');

app.post('/webhook/cord', express.raw({ type: 'application/json' }), (req, res) => {
  const received = req.headers['x-cord-signature'] || '';   // "sha256=<hex>"
  const secret = process.env.CORD_WEBHOOK_SECRET;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(req.body)            // req.body es el Buffer crudo, sin parsear
    .digest('hex');

  // Comparación en tiempo constante (mismo largo en ambos buffers)
  const ok = received.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));

  if (!ok) return res.status(401).send('Firma inválida');

  const evento = req.headers['x-cord-event'];
  const payload = JSON.parse(req.body.toString('utf8'));
  // ... procesa el evento (payload.data.id, payload.data.folio, etc.)
  res.status(200).send('Recibido');
});
```

**Clave:** firma sobre el cuerpo **crudo** (usa `express.raw`, no `express.json`), o el hash no coincidirá. Para verificar `X-Cord-Signature-V1` a mano, calcula el HMAC sobre `"{timestamp}.{cuerpo}"` en vez de solo el cuerpo, y valida que el timestamp esté dentro de tu tolerancia — o usa el SDK, que ya hace esto por ti.
