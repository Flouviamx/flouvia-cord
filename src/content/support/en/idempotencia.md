---
title: "Idempotency Keys"
description: "Prevent duplicate charges using idempotency keys."
category: "Developers"
---

Idempotency is a technique that ensures an API operation occurs exactly once, regardless of how many times the same request is retried. It is vital for preventing double billing due to network failures.

### How to use Idempotency keys?

When making `POST` requests that alter the state (e.g., creating a charge, refunding, stamping an invoice), you must send the HTTP header `Idempotency-Key`.

```bash
curl -X POST https://api.flouvia.com/v1/charges \
  -H "Idempotency-Key: cobro_mensual_u102_abril" \
  -d '{...}'
```

**System Rules:**
- The key can be any unique string (e.g., a v4 UUID or an internal ID from your database) of up to 255 characters.
- If the connection drops and you retry the `POST` with the same `Idempotency-Key`, Cord will not charge the card again. It will simply return the exact same JSON response that it generated the first time (the original successful charge).
- Idempotency keys expire and are cleared from our cache **24 hours** after being received.
