---
title: "Error Handling"
description: "Understand the status codes and error responses of the Cord API."
---

<header class="content-header">
  <h1 class="page-title">Error Handling</h1>
  <p class="page-subtitle">Cord uses conventional HTTP codes and a predictable error structure to indicate success or failure.</p>
</header>

## HTTP Status Codes

The Cord API always returns standard HTTP status codes. As a general rule:
- **`2xx`** indicates success.
- **`4xx`** indicates an error originating from the provided information (e.g., missing parameters, invalid token).
- **`5xx`** indicates an error on Cord's servers (these are very rare).

### Code Summary

| Code | Description |
|---|---|
| **200 OK** | Everything worked as expected. |
| **400 Bad Request** | The request was unacceptable. Usually means `invalid_request` (missing fields) or `invalid_json`. |
| **401 Unauthorized** | Your API Key is missing or incorrect. |
| **403 Forbidden** | You have insufficient permissions (e.g., trying to write with a read-only key). |
| **404 Not Found** | The resource (quote, client) does not exist. |
| **409 Conflict** | For example, trying to delete test data (`/api/test-mode/reset`) without being in a Sandbox organization. |

## Error Object Structure

When a `4xx` or `5xx` error occurs, Cord always responds with a unified JSON object containing the error type and a human-readable message to help you diagnose the problem immediately.

**Error Response Example:**

```json
{
  "error": {
    "code": "invalid_request",
    "message": "The company name is required"
  }
}
```

### Common Error Codes (`error.code`)

- `invalid_json`: Occurs when your `POST` or `PATCH` request body is not valid JSON.
- `invalid_request`: Occurs when business validations fail. For example, sending a quote without specifying a valid client, or attempting to apply a discount greater than 100%. The `message` field will explain the exact reason.
