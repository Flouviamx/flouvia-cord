---
title: "Rate limits"
description: "Understand Cord's API limits and how to handle 429 responses."
category: "Developers"
order: 4
---

To keep the service stable for everyone, Cord applies a request limit **per IP**.

### The limit

There is a global floor of roughly **500 requests per minute per IP** across all routes. On top of that, each **API key** has its own limit: **600 requests per minute** for a secret key (`sk_`) and **120 per minute** for a publishable key (`pk_`, more restricted since it lives exposed in the browser). All of these are per-**minute** limits (a rolling 60-second window), not per second. For normal B2B integrations (syncing catalogs, creating quotes, reading receivables) this is plenty of headroom.

Separately from the request-rate limit, your subscription **plan** includes a monthly quota of API calls; exceeding it also responds `429`, but with `code: "api_quota_exceeded"` instead of a speed problem — the fix there is upgrading your plan, not retrying slower.

### Handling 429

If you exceed the request-rate limit, Cord responds with `429 Too Many Requests` and a `Retry-After: 60` (seconds) header. Your app should handle it with **exponential backoff**:

1. On a 429, wait and retry (respect `Retry-After` if present).
2. If it fails again, double the wait: 1s, 2s, 4s, 8s…
3. Cap the number of retries so you don't loop forever.

**Best practices:** batch reads with pagination (`limit`/`offset`) instead of many small calls, and avoid aggressive polling — to learn about changes use [Webhooks](/en/support/configurar-webhooks) rather than polling in a loop.
