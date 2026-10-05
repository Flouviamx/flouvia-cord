---
title: "Using the Cord API from Node.js"
description: "How to call Cord's REST API from your Node.js or TypeScript backend, with or without the official SDK."
category: "Developers"
---

The official SDK for your backend is `@flouviahq/node`. It is a separate package from Cord Elements (which lives in the browser), has no dependencies, and runs on Node 20+, Bun, Deno, Cloudflare Workers and Vercel. If you used `@flouviahq/elements/server` with `CordAPI`, it still works but no longer gets changes.

### Install

```bash
npm install @flouviahq/node
```

### Create and list

```typescript
import { Cord, CordError } from '@flouviahq/node';

const cord = new Cord(process.env.CORD_SECRET_KEY!); // sk_live_..., sk_test_... or rk_...

try {
  const quote = await cord.quotes.create({
    cliente: { empresa: 'Acme', email: 'purchasing@acme.com' },
    items: [{ descripcion: 'Installation', cantidad: 1, precio_unitario: 12500, tax_rate: 0.16 }],
    base_currency: 'MXN',
  });
  console.log(quote.folio, quote.link_publico);
} catch (err) {
  if (err instanceof CordError) console.error(err.code, err.requestId);
}

for await (const invoice of cord.invoices.listAll({ estado: 'open' })) {
  console.log(invoice.numero, invoice.saldo);
}
```

The SDK retries only network errors, 429 and 5xx, and every operation carries an `Idempotency-Key` repeated across its retries: it never creates the same thing twice.

### Verify webhooks

```typescript
import { constructEvent } from '@flouviahq/node';

export async function POST(req: Request) {
  const event = await constructEvent(await req.text(), req.headers, process.env.CORD_WEBHOOK_SECRET!);
  // event.event: 'quote.approved', 'invoice.paid', ...
  return new Response('ok');
}
```

Pass it the **raw** request body. An event with an altered signature or older than 5 minutes is rejected. To test them on your machine, use `cord listen` from the [CLI](/en/docs/desarrolladores/herramientas/cli).

### Without the SDK

Cord's API is standard REST, so you can also call it with `fetch`:

```typescript
const res = await fetch('https://cordhq.app/api/v1/cotizaciones', {
  headers: { Authorization: `Bearer ${process.env.CORD_SECRET_KEY}` },
});
const body = await res.json();
if (!res.ok) throw new Error(`${body.code}: ${body.error} (${body.request_id})`);
```

**Remember:**
- Amounts are in the document currency's unit (`1500` in MXN is $1,500.00), not cents, and always with their currency.
- Creating quotes, clients or products requires a key with **write** permission. A restricted key (`rk_`) can only touch the resources you granted it.
- If you retry a creation yourself, send the same `Idempotency-Key` header on every attempt.
