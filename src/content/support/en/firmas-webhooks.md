---
title: "Verifying Webhook Signatures"
description: "Cryptographically validate that a webhook comes from Cord."
category: "Developers"
---

Ensuring the origin of webhooks is critical. An attacker could send you a fake payload (e.g. `{"event":"quote.paid"}`) so you release something without a real payment. That's why you must validate the signature.

### How Cord signs

Every delivery carries **two** signatures of the raw body, so you can migrate without a cutover window:

- **`X-Cord-Signature-V1`** (recommended): `t=<unix timestamp>,v1=<hex hmac-sha256 of "{t}.{body}">`. It includes the timestamp inside what's signed, so you can reject an old delivery being replayed (anti-replay protection). During a secret rotation it may carry two `v1=` pairs; either one matching is enough.
- **`X-Cord-Signature`** (legacy, kept for backward compatibility): `sha256=<hex hmac-sha256 of the body>`, with no timestamp.

Alongside the signature, every delivery also carries `X-Cord-Event` (event name), `X-Cord-Event-Id` (a stable event id, the same across retries and a manual redelivery — use it to deduplicate), `X-Cord-Delivery-Id` (changes on every attempt), and `Idempotency-Key` (repeats the same value as `X-Cord-Event-Id`, for frameworks that read it automatically).

### With the official SDK (recommended)

`@flouviahq/elements/server` ships the verifier already written: it tries `X-Cord-Signature-V1` first (with a configurable tolerance, default 300s) and falls back to the legacy `X-Cord-Signature` if the endpoint hasn't received it yet.

```typescript
import { CordAPI } from '@flouviahq/elements/server';

const cord = new CordAPI(process.env.CORD_SECRET_KEY!);

// Example with a Next.js Route Handler — req.text() is already the raw body
export async function POST(req: Request) {
  const body = await req.text();
  try {
    const event = cord.webhooks.constructEvent(body, req.headers, process.env.CORD_WEBHOOK_SECRET!);
    // event.event, event.data — see /en/support/api-facturas and /en/support/migracion-stripe for the event catalog
    return new Response('ok');
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }
}
```

### Manual verification in Node.js (Express)

If you don't use the SDK, you can verify the legacy signature by hand:

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

**Key point:** sign over the **raw** body (use `express.raw`, not `express.json`), or the hash won't match. To verify `X-Cord-Signature-V1` by hand, compute the HMAC over `"{timestamp}.{body}"` instead of just the body, and check the timestamp is within your tolerance — or use the SDK, which already does this for you.
