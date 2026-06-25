---
title: "Verificar firmas de Webhooks"
description: "Valida criptográficamente que un webhook viene de Cord."
category: "Desarrolladores"
---

Asegurar la procedencia de los webhooks es crítico. Un atacante podría enviarte un payload falso (ej. `{"event":"quote.paid"}`) para que liberes algo sin que el cobro sea real. Por eso debes validar la firma.

### Cómo firma Cord

Cord calcula el **HMAC-SHA256 del cuerpo en bruto** del webhook usando tu *secreto de firma*, y lo envía en el header `X-Cord-Signature` con el formato `sha256=<hash>`. El nombre del evento viaja en `X-Cord-Event`. No hay timestamp en la firma.

### Verificación en Node.js (Express)

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

**Clave:** firma sobre el cuerpo **crudo** (usa `express.raw`, no `express.json`), o el hash no coincidirá.
