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

`@flouviahq/elements/server` trae el verificador ya escrito: intenta primero `X-Cord-Signature-V1` (con tolerancia configurable, default 300 s) y cae a la legacy `X-Cord-Signature` si el endpoint todavía no la recibe.

```typescript
import { CordAPI } from '@flouviahq/elements/server';

const cord = new CordAPI(process.env.CORD_SECRET_KEY!);

// Ejemplo con un Route Handler de Next.js — req.text() ya es el cuerpo crudo
export async function POST(req: Request) {
  const body = await req.text();
  try {
    const event = cord.webhooks.constructEvent(body, req.headers, process.env.CORD_WEBHOOK_SECRET!);
    // event.event, event.data — ver /soporte/api-facturas y /soporte/migracion-stripe para el catálogo de eventos
    return new Response('ok');
  } catch {
    return new Response('Firma inválida', { status: 400 });
  }
}
```

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
