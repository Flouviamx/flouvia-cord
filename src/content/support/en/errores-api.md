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

- **400 Bad Request:** a parameter is missing or the JSON is malformed (`code: "invalid_request"` or `"invalid_json"`).
- **401 Unauthorized:** your API key is invalid, revoked, or you didn't send the `Authorization` header (`"invalid_key"`, `"missing_key"`).
- **402 Payment Required:** your subscription hit the number of API keys included in your plan (`"subscription_key_limit"`); revoke an older key or upgrade.
- **403 Forbidden:** your key lacks the required scope (e.g. using a read-only key for a `POST`, code `"insufficient_scope"`), or a publishable key is used from an unauthorized origin/domain (`"unauthorized_origin"`, `"missing_origin"`).
- **404 Not Found:** the resource doesn't exist or doesn't belong to your organization.
- **409 Conflict:** the action doesn't fit the resource's current state — for example, voiding an invoice that already has payments applied responds `409` with `code: "credit_note_required"`: the correct document is a credit note instead.
- **413/415:** the request body exceeds the size cap (`"payload_too_large"`) or isn't sent as `application/json` (`"unsupported_media_type"`).
- **429 Too Many Requests:** you exceeded either the request-rate limit or your plan's monthly quota (`"api_quota_exceeded"`). See [Rate limits](/en/support/limites-peticiones).
- **500 Internal Server Error:** an error on our side (rare; contact support if it persists).
- **502/503:** an external provider the operation depends on didn't respond — for example, stamping an invoice without being able to prove the exchange rate responds `503` with `code: "fx_unavailable"` instead of making one up (see the exchange-rate policy in the invoicing documentation).

> Note: the v1 API does not process card charges directly; that happens on the Cord public link. Therefore, card-decline errors do not appear in these responses.
