---
title: "Rate limits"
description: "Understand Cord's API limits and how to handle 429 responses."
category: "Developers"
order: 4
---

To keep the service stable for everyone, Cord applies a request limit **per IP**.

### The limit

There is a global floor of roughly **500 requests per minute per IP** across all routes. It is a per-**minute** limit (a rolling 60-second window), not per second. For normal B2B integrations (syncing catalogs, creating quotes, reading receivables) this is plenty of headroom.

### Handling 429

If you exceed the limit, Cord responds with `429 Too Many Requests` and a `Retry-After: 60` (seconds) header. Your app should handle it with **exponential backoff**:

1. On a 429, wait and retry (respect `Retry-After` if present).
2. If it fails again, double the wait: 1s, 2s, 4s, 8s…
3. Cap the number of retries so you don't loop forever.

**Best practices:** batch reads with pagination (`limit`/`offset`) instead of many small calls, and avoid aggressive polling — to learn about changes use [Webhooks](/en/support/configurar-webhooks) rather than polling in a loop.
