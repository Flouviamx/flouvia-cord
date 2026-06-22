---
title: "Verifying Webhook Signatures"
description: "Cryptographic implementation to validate events."
category: "Developers"
---

Ensuring the origin of Webhooks is critical. An attacker could send you a fake payload saying `{"type":"charge.succeeded", "amount": 100000}` so you release a product without them actually having paid.

### Verification in Node.js

Cord uses HMAC SHA-256 to sign the raw body of the webhook.

```javascript
const crypto = require('crypto');

// Your webhook endpoint
app.post('/webhook/cord', express.raw({type: 'application/json'}), (req, res) => {
  const signatureHeader = req.headers['cord-signature']; // format: "t=162345,v1=abcdef..."
  const secret = process.env.CORD_WEBHOOK_SECRET;
  
  // Extract timestamp and signature
  const [tStr, v1Str] = signatureHeader.split(',');
  const timestamp = tStr.split('=')[1];
  const signature = v1Str.split('=')[1];
  
  // Prevent replay attacks
  if (Math.abs(Date.now()/1000 - parseInt(timestamp)) > 300) {
    return res.status(400).send('Webhook too old');
  }
  
  // Sign the payload locally
  const payloadToSign = `${timestamp}.${req.body.toString('utf8')}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadToSign)
    .digest('hex');
    
  if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    // Valid signature, you can process the order
    res.status(200).send('Received');
  } else {
    res.status(401).send('Invalid signature');
  }
});
```
