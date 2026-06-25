---
title: "API error code handling"
description: "Meaning of HTTP 400, 401, 403, 404, 429 and 500 in Cord's API."
category: "Developers"
---

When integrating Cord's API, it's worth handling failed responses well to give a good experience.

### Error structure

Failed responses return a flat JSON object with two fields:

```json
{
  "error": "Company name is required",
  "code": "invalid_request"
}
```

- `error`: a human-readable message you can show or log.
- `code`: a stable identifier to branch on in your code (e.g. `invalid_json`, `invalid_request`).

### Common HTTP codes

- **400 Bad Request:** a parameter is missing or the JSON is malformed.
- **401 Unauthorized:** your API key is invalid, revoked, or you didn't send the `Authorization` header.
- **403 Forbidden:** your key lacks the required scope (e.g. using a read-only key for a `POST`).
- **404 Not Found:** the resource doesn't exist or doesn't belong to your organization.
- **429 Too Many Requests:** you exceeded the request limit. See [Rate limits](/en/support/limites-peticiones).
- **500 Internal Server Error:** an error on our side (rare; contact support if it persists).

> Note: the v1 API does not process card charges directly (that happens on the public link via Stripe), so you won't see card-declined errors in these responses.
