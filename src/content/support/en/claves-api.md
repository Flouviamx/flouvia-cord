---
title: "Authentication and API Keys"
description: "Learn how to generate and authenticate your requests to Cord's REST API."
category: "Developers"
order: 1
---

Your API Keys are the gateway to your account. Treat them with the same care as your database password.

### Where to generate them

Go to **Settings > Developers > API** (`/app/ajustes/api`). There you create new keys, pick their scope (read or write), and revoke them. The secret key is shown **only once** when created; store it in a secrets manager, never in source code.

### Authentication

The API is REST over HTTPS. Every request carries your key in the `Authorization` header:

```bash
curl https://cord.flouvia.com/api/v1/me \
  -H "Authorization: Bearer sk_live_your_key"
```

Response:

```json
{ "org": { "id": "...", "nombre": "Your Business", "plan": "pro" }, "scope": "write", "mode": "live" }
```

### Environments (Live vs Test)

When you create a key you choose its mode:
- **Test (`sk_test_...`):** does not consume your API usage meter or count toward billing. Useful for testing integrations. **Important:** it operates on the same organization data — there is no isolated sandbox yet. Whether CFDI stamping is real or simulated depends on your Facturapi configuration (CSD / key), not on the key's mode.
- **Live (`sk_live_...`):** use it in production. Every call counts toward your plan usage.

### Scopes

- **Read (`read`):** query quotes, clients, products, and receivables.
- **Write (`write`):** can also create quotes, clients, and products.

### Key Rotation

There is no in-place rotation with a grace period. If a key leaks (e.g. accidentally pushed to GitHub):

1. Go to **Settings > Developers > API**.
2. Create a new key and update your servers with it.
3. **Revoke** the compromised key. Revocation is immediate: any request with that key returns `401`.
