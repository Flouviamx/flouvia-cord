---
title: "Authentication"
description: "How to authenticate your requests to the Cord API using Bearer Tokens."
---

<header class="content-header">
  <h1 class="page-title">Authentication</h1>
  <p class="page-subtitle">Learn how to structure your authenticated requests to Cord's servers.</p>
</header>

## Bearer Tokens

The Cord API uses Bearer Tokens to authenticate incoming requests. You must send the API Key you generated in the dashboard as an HTTP `Authorization` header.

All requests must be made over HTTPS. Requests without authentication or sent via plain HTTP will fail.

**Request Example:**

```bash
curl -X GET "https://api.cordhq.com/v1/cotizaciones" \
     -H "Authorization: Bearer sk_live_tU..."
```

## Secret vs Publishable Keys

Cord supports two main scopes of API keys to guarantee your data security:

1. **Secret Keys (`sk_`):** Designed to be used **only** on your backend servers. They have full read and write permissions.
2. **Publishable Keys (`pk_`):** Designed to be exposed in the frontend (web browsers, mobile apps). 

### Automatic Data Masking

Publishable keys have automatic security restrictions imposed by the API. For example, if you query the [Products API](/docs/desarrolladores/funciones/productos) using a publishable key, the Cord server will automatically omit the `costo` (margin) field to ensure your website visitors cannot discover your profit margins.

> **Caution:**
> **Never expose your Secret Keys.** If your secret key is compromised, you must immediately revoke it from the Settings > Developers > API tab.

## Quick Identity Check

If you need to test if your API key is working correctly and which account it belongs to, you can use the `me` endpoint:

```bash
curl -X GET "https://api.cordhq.com/v1/me" \
     -H "Authorization: Bearer sk_live_tU..."
```
