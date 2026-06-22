---
title: "[EN] Verificar firmas de Webhooks"
description: "Implementación criptográfica para validar eventos."
category: "Developers"
---

Asegurar la procedencia de los Webhooks es crítico. Un atacante podría enviarte un payload falso diciendo `{"type":"charge.succeeded", "amount": 100000}` para que liberes un producto sin que realmente haya pagado.

### Verificación en Node.js

Cord utiliza HMAC SHA-256 para firmar el cuerpo raw (en bruto) del webhook.

```javascript
const crypto = require('crypto');

// Tu webhook endpoint
app.post('/webhook/cord', express.raw({type: 'application/json'}), (req, res) => {
  const signatureHeader = req.headers['cord-signature']; // formato: "t=162345,v1=abcdef..."
  const secret = process.env.CORD_WEBHOOK_SECRET;
  
  // Extraer timestamp y signature
  const [tStr, v1Str] = signatureHeader.split(',');
  const timestamp = tStr.split('=')[1];
  const signature = v1Str.split('=')[1];
  
  // Prevenir ataques de repetición (Replay attacks)
  if (Math.abs(Date.now()/1000 - parseInt(timestamp)) > 300) {
    return res.status(400).send('Webhook demasiado viejo');
  }
  
  // Firmar el payload localmente
  const payloadToSign = `${timestamp}.${req.body.toString('utf8')}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadToSign)
    .digest('hex');
    
  if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    // Firma válida, puedes procesar la orden
    res.status(200).send('Recibido');
  } else {
    res.status(401).send('Firma inválida');
  }
});
```
