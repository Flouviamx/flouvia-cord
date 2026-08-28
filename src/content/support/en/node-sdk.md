---
title: "Using the Cord API from Node.js"
description: "How to call Cord's REST API from your Node.js or TypeScript backend, with or without the official SDK."
category: "Developers"
---

Cord publishes an official Node.js/TypeScript SDK inside the same package used by the frontend: `@flouviahq/elements`. Its `/server` entry point exposes a typed REST client (`CordAPI`) and the webhook signature verifier — you don't need a separate package for your backend.

### Installation

```bash
npm install @flouviahq/elements
```

### The `CordAPI` client

```typescript
import { CordAPI, CordError } from '@flouviahq/elements/server';

const cord = new CordAPI(process.env.CORD_SECRET_KEY); // sk_live_... or sk_test_...

try {
  const quote = await cord.quotes.create({
    cliente_id: 'customer-id',      // optional
    terminos: 'net30',
    vigencia_dias: 15,
    send: true,                     // emails the link to the customer
    items: [
      { descripcion: 'Development hours', cantidad: 10, precio_unitario: 1500 }
    ],
  });
  console.log(quote.folio, quote.link_publico); // e.g. COT-0149  https://cordhq.app/q/abc123
} catch (err) {
  if (err instanceof CordError) {
    // err.code: 'invalid_request' | 'missing_key' | 'invalid_key' | 'insufficient_scope'
    //         | 'rate_limited' | 'network_error' | 'server_error' | 'unknown' | ...
    console.error(err.status, err.code, err.message);
  }
}
```

`cord.quotes`, `cord.clients`, and `cord.products` expose `create()`/`list()` over `/cotizaciones`, `/clientes`, and `/productos` respectively; `link_publico` in the response is already absolute (no need to prefix the domain).

### Verifying webhooks with the same client

The SDK ships a ready-to-use signature verifier (see [Verifying webhook signatures](/en/support/firmas-webhooks) for how the mechanism works):

```typescript
// Example with a Next.js Route Handler
export async function POST(req: Request) {
  const body = await req.text();
  try {
    const event = cord.webhooks.constructEvent(body, req.headers, process.env.CORD_WEBHOOK_SECRET!);
    if (event.event === 'quote.paid') { /* ... */ }
    return new Response('ok');
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }
}
```

### Without the SDK

Cord's API is standard REST, so you can also call it directly with `fetch` (built into Node 18+) without installing anything:

```typescript
const BASE = 'https://cordhq.app/api/v1';

async function cord(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${process.env.CORD_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Cord API ${res.status}`);
  return body;
}
```

**Remember:**
- Amounts are in **pesos** (`1500` = $1,500.00), not cents.
- Creating quotes, clients, or products requires a key with **write** scope.
