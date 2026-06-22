---
title: "Cord Node.js SDK"
description: "Installation and usage of @cord/node in your backend."
category: "Developers"
---

For backend developers using Node.js or TypeScript, we have created an official library that encapsulates all the authentication, serialization, and error handling logic of our API.

### Installation

```bash
npm install @flouviamx/cord-node
# or with yarn
yarn add @flouviamx/cord-node
```

### Strict Typing and Usage (TypeScript)

The SDK provides native auto-completion and type inference for all request and response payloads.

```typescript
import Cord from '@flouviamx/cord-node';

const cord = new Cord(process.env.CORD_SECRET_KEY);

async function createQuote() {
  try {
    const quote = await cord.quotes.create({
      customer_id: 'cus_123',
      currency: 'mxn',
      line_items: [
        { name: 'Development Hours', quantity: 10, unit_price: 150000 }
      ]
    });
    console.log(quote.hosted_url);
  } catch (error) {
    if (error.type === 'CordInvalidRequestError') {
      console.error(error.message);
    }
  }
}
```

The SDK internally uses TCP `keep-alive` and exponential retries under the hood to mitigate transient network errors (502, 503, 504).
