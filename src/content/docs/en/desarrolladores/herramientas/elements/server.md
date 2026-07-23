---
title: "Cord Elements Server SDK"
description: "Verify webhooks and make secure calls to the Cord API from your Node.js or Edge backend."
---

<header class="content-header">
  <h1 class="page-title">Server SDK</h1>
  <p class="page-subtitle">Power for your backend: cryptographic validation and direct API access with your Secret Key.</p>
</header>

The Cord Elements SDK isn't just for the browser. It also exposes a dedicated server module (`@flouviahq/elements/server`) designed to run in Node.js environments, Next.js Route Handlers, or Edge Runtimes (like Cloudflare Workers).

## Installation

```bash
npm install @flouviahq/elements
```

## Configure the Client

Import `CordAPI` and provide your **Secret Key** (`sk_live_...`).

> **Warning:** Never import the Server SDK or expose your Secret Key in frontend environments.

```ts
import { CordAPI } from '@flouviahq/elements/server';

const cord = new CordAPI(process.env.CORD_SECRET_KEY);
```

## Verifying Webhooks

One of the primary use cases for the Server SDK is verifying cryptographic signatures (HMAC) coming from Cord. This ensures that the incoming webhook was genuinely emitted by our servers and is not an attacker attempting to inject false data.

### Node.js or Next.js Route Handler

To verify a webhook synchronously, use `cord.webhooks.constructEvent()`. You must provide the raw text payload, the request headers, and your **Webhook Secret** (configurable in Settings > Developers).

The SDK automatically checks mitigation signatures against Replay Attacks by verifying `X-Cord-Signature-V1` and discarding old events using a time tolerance (default 300 seconds).

```ts
// app/api/webhooks/cord/route.ts
import { CordAPI } from '@flouviahq/elements/server';

const cord = new CordAPI(process.env.CORD_SECRET_KEY!);

export async function POST(req: Request) {
  // 1. Get the raw text
  const body = await req.text();
  
  try {
    // 2. Construct and validate the event
    const event = cord.webhooks.constructEvent(
      body, 
      req.headers, 
      process.env.CORD_WEBHOOK_SECRET!
    );
    
    // event is strongly typed
    // { event: 'quote.paid', created_at: '...', data: { folio, status, ... } }
    
    if (event.event === 'quote.paid') {
      console.log(`Quote ${event.data.folio} was paid successfully!`);
    }
    
    return new Response('Webhook correctly received', { status: 200 });
  } catch (err) {
    // The signature is invalid or expired
    return new Response('Invalid signature', { status: 400 });
  }
}
```

### Edge Runtimes (Cloudflare Workers, Vercel Edge)

In environments where the native `node:crypto` module is not available, the SDK exposes an alternative method based on the standard `WebCrypto` API (`crypto.subtle`). Use `constructEventAsync()`:

```ts
const event = await cord.webhooks.constructEventAsync(
  body, 
  req.headers, 
  process.env.CORD_WEBHOOK_SECRET!
);
```

## Direct REST API

The `CordAPI` object exposes strongly typed submodules that wrap our official REST API methods. All methods return Promises and properly handle JSON formatting.

### Create a Quote

```ts
const quote = await cord.quotes.create({ 
  items: [
    { 
      descripcion: 'B2B Technical Implementation', 
      cantidad: 1, 
      precio_unitario: 50000 
    }
  ] 
});

console.log('Quote ID:', quote.id);
console.log('Visible Folio:', quote.folio);
console.log('Link for the Client:', quote.link_publico);
```

## Typed Errors (`CordError`)

The Server SDK abandons the concept of throwing a generic JavaScript `Error`. All errors arising from a failed network request or validation will throw a structured `CordError`.

This allows you to create much more precise recovery flows or analytics based on the `code`.

```ts
import { CordError } from '@flouviahq/elements/server';

try {
  await cord.quotes.create(data);
} catch (err) {
  if (err instanceof CordError) {
    console.error('HTTP Status:', err.status); // e.g. 400
    console.error('API Code:', err.code); // e.g. 'invalid_request', 'rate_limited'
    console.error('Readable Message:', err.message);
  }
}
```
