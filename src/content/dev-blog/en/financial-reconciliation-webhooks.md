---
title: "Real-time financial reconciliation with Webhooks"
date: "2026.07.15"
type: "VIDEO"
topic: "Payments"
authors:
  - "CORD ENG"
readTime: "12 MIN WATCH"
---
When money moves, your system needs to know about it instantly and accurately. Polling APIs for transaction statuses is inefficient and prone to rate limits. The industry standard for real-time financial updates is receiving webhooks from your payment provider.

However, handling webhooks in a financial context requires a level of rigor far beyond a simple HTTP endpoint. Processing webhooks safely ensures that your internal ledgers stay perfectly synced with platforms like Cord.

## The challenges of financial webhooks

Webhooks are essentially "fire and forget" HTTP requests. This introduces several critical challenges for engineers:

1. **Out-of-order delivery:** You might receive a `payment_failed` event before you receive the `payment_created` event.
2. **Duplicate delivery:** To guarantee delivery (At-Least-Once delivery), providers will often send the same webhook twice.
3. **Security:** Malicious actors can send fake webhooks to your endpoint to artificially inflate a user's balance.

## Engineering a robust webhook pipeline

### 1. Cryptographic Signature Verification
Never trust the payload of a webhook blindly. Always verify the signature provided in the headers using the shared secret from your Cord dashboard. In Node.js, this involves computing a SHA-256 HMAC of the raw request body and comparing it to the provided signature. If they don't match, instantly return a `401 Unauthorized`.

### 2. Acknowledge Fast, Process Later
Webhook providers expect a `2xx` HTTP response within a few seconds. If your database is locked or processing takes too long, the provider will assume the webhook failed and trigger a retry storm.
Instead, your endpoint should immediately push the raw payload onto a message queue (like Kafka or AWS SQS) and return a `202 Accepted`. Worker processes can then pull from the queue at their own pace.

### 3. Handle state with timestamps
To deal with out-of-order webhooks, rely on the `created_at` timestamp inside the payload, not the time your server received the request. When updating your database, use conditional updates:

```sql
UPDATE transactions 
SET status = 'failed' 
WHERE id = 'tx_123' AND updated_at < 'payload.timestamp';
```

This guarantees that a delayed `payment_created` event won't overwrite a newer `payment_failed` state in your database. By applying these patterns, you can build a webhook integration that is both real-time and financially sound.
