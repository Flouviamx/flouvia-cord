---
title: "Authentication and API Keys"
description: "Learn how to generate and authenticate your requests to Cord's REST API."
category: "Developers"
order: 1
---

Your API Keys are the gateway to your account. Treat them with the same care as your database password.

### Where to generate them

Turn on **Developer mode** (the switch at the bottom of the Settings index) and open the **API** tab in the Developers dock, the bar that appears at the bottom of the screen (`/app?wb=api`). There you create new keys, pick their scope (read or write), and revoke them. The secret key is shown **only once** when created; store it in a secrets manager, never in source code.

### Authentication

The API is REST over HTTPS. Every request carries your key in the `Authorization` header:

```bash
curl https://cordhq.app/api/v1/me \
  -H "Authorization: Bearer sk_live_your_key"
```

Response:

```json
{ "org": { "id": "...", "nombre": "Your Business", "plan": "pro" }, "scope": "write", "mode": "live" }
```

### Environments (Live vs Test)

When you create a key you choose its mode:
- **Test (`sk_test_...`):** does not consume your API usage meter or count toward billing. Operates on your account's **test environment** (a mirror organization, isolated from your real data — the same mechanism as the "Test environment" switch on the organization switcher). The first call with a test key creates that mirror organization if it doesn't exist yet. Whether CFDI stamping is real or simulated depends on whether you have your CSD connected, not on the key's mode. See [Testing Cord without affecting production](/en/support/sandbox-pruebas).
- **Live (`sk_live_...`):** use it in production. Every call counts toward your plan usage.

### Scopes

- **Read (`read`):** query quotes, clients, products, and receivables.
- **Write (`write`):** can also create quotes, clients, and products.

### Key Rotation

There is no in-place rotation with a grace period. If a key leaks (e.g. accidentally pushed to GitHub):

1. Open the **API** tab in the Developers dock (turn it on in Settings > Company if you don't see it).
2. Create a new key and update your servers with it.
3. **Revoke** the compromised key. Revocation is immediate: any request with that key returns `401`.
