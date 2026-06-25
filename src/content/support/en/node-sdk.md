---
title: "Using the Cord API from Node.js"
description: "How to call Cord's REST API from your Node.js or TypeScript backend."
category: "Developers"
---

> There is no official Node SDK yet. Cord's API is standard REST, so you call it directly with `fetch` (built into Node 18+) or your favorite HTTP client. If we publish an official package, we'll announce it here.

### A minimal wrapper

Centralize the base URL, key, and error handling in one helper:

```typescript
const BASE = 'https://cord.flouvia.com/api/v1';

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

### Create a quote

```typescript
const { data } = await cord('/cotizaciones', {
  method: 'POST',
  body: JSON.stringify({
    cliente_id: 'customer-id',      // optional
    terminos: 'net30',
    vigencia_dias: 15,
    send: true,                     // emails the link to the customer
    items: [
      { descripcion: 'Development hours', cantidad: 10, precio_unitario: 1500 }
    ],
  }),
});

console.log(data.folio, data.link_publico); // e.g. COT-0149  /q/abc123
```

**Remember:**
- Amounts are in **pesos** (`1500` = $1,500.00), not cents.
- `link_publico` is the path of the link your customer sees (`/q/{token}`); prefix it with `https://cord.flouvia.com`.
- Creating quotes requires a key with **write** scope.
