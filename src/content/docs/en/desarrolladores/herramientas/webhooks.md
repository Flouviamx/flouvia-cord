---
title: "Cord Webhooks"
description: "Build real-time integrations by reacting to events that occur in Cord."
---

<header class="content-header">
  <h1 class="page-title">Webhooks</h1>
  <p class="page-subtitle">React instantly to state changes in your quotes without having to poll the API.</p>
</header>

## Why use Webhooks?

Instead of your system (like an ERP or an automated Zapier/Make workflow) asking Cord every 5 minutes "has the client paid yet?", Cord's Webhooks "notify" your system at the exact moment the event occurs, sending an HTTP `POST` to your server.

Common use cases:
- Automatically provision a software license when a quote enters the `pagada` (paid) state.
- Send an internal Slack message when a quote is first `vista` (viewed) by the client.
- Trigger the billing process in your ERP.

## Setting up an Endpoint

To start receiving events, you must register your server's URL:
1. Navigate to **Settings > Developers > Webhooks**.
2. Click on **Add Endpoint**.
3. Enter your public HTTPS URL. Unencrypted HTTP URLs are not allowed for security reasons.
4. Select the subset of events you want to listen to (e.g., `cotizacion.enviada`, `cotizacion.pagada`).

## Security and Signatures (HMAC-SHA256)

Because your endpoint must be public on the Internet, anyone could send you fake requests trying to trick your system. 

To prevent this, Cord cryptographically signs every payload sent to your server using an **Endpoint Secret**.

### Verifying the signature on your server

1. Cord includes an `X-Cord-Signature` header in the `POST` request.
2. You must use your Endpoint Secret to calculate the HMAC-SHA256 hash of the exact request body.
3. Compare the hash you calculated with the one Cord sent. If they match, the request is authentically from Cord.

## Retries and Fault Tolerance

If your destination server is down or returns an error code (anything other than `2xx`), Cord will consider the delivery as failed.

You can navigate to the **Delivery Log** inside the Webhooks Settings to examine the request body that failed and the exact response your server gave (useful for debugging). There you can also click "Retry Delivery" manually.
