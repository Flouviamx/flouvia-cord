---
title: "Verifying Webhook Signatures"
description: "Cryptographically validate that a webhook comes from Cord."
category: "Developers"
---

Ensuring the origin of webhooks is critical. An attacker could send you a fake payload (e.g. `{"event":"quote.paid"}`) so you release something without a real payment. That's why you must validate the signature.

### How Cord signs

Cord computes the **HMAC-SHA256 of the raw webhook body** using your *signing secret*, and sends it in the `X-Cord-Signature` header in the format `sha256=<hash>`. The event name travels in `X-Cord-Event`. There is no timestamp in the signature.

### Verification in Node.js (Express)

```javascript
const crypto = require('crypto');

app.post('/webhook/cord', express.raw({ type: 'application/json' }), (req, res) => {
  const received = req.headers['x-cord-signature'] || '';   // "sha256=<hex>"
  const secret = process.env.CORD_WEBHOOK_SECRET;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(req.body)            // req.body is the raw Buffer, unparsed
    .digest('hex');

  // Constant-time comparison (both buffers must be equal length)
  const ok = received.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));

  if (!ok) return res.status(401).send('Invalid signature');

  const event = req.headers['x-cord-event'];
  const payload = JSON.parse(req.body.toString('utf8'));
  // ... process the event (payload.data.id, payload.data.folio, etc.)
  res.status(200).send('Received');
});
```

**Key point:** sign over the **raw** body (use `express.raw`, not `express.json`), or the hash won't match.
