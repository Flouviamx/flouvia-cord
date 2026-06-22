---
title: "API error code handling"
description: "Meaning of HTTP 400, 401, 402, 404 and 500 in Cord."
category: "Developers"
---

When integrating the Cord API, it is essential to know how to handle failed responses to provide a good experience to your users.

### Error Structure

All failed responses (HTTP 4xx and 5xx) return a standardized JSON object:

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "parameter_missing",
    "message": "The 'amount' field is required to process the payment.",
    "param": "amount",
    "doc_url": "https://cord.flouvia.com/en/support/errores-api#parameter_missing"
  }
}
```

### Common HTTP Codes
- **400 Bad Request:** Your request is missing a parameter or is incorrectly formatted.
- **401 Unauthorized:** Your API Key is invalid or you did not send the authorization header.
- **402 Payment Required:** The charge attempt failed (e.g., declined card or insufficient funds).
- **403 Forbidden:** Your key does not have permissions to access this resource.
- **429 Too Many Requests:** You have exceeded the request limit (Rate Limit).
- **500 Internal Server Error:** Error on our side (very rare, but contact support if it persists).

To handle card declines gracefully, read the `code` property (e.g., `card_declined` or `insufficient_funds`) and show a friendly message to your client.
