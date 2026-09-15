---
title: "Connect Cord with Make"
description: "Receive Cord events in a Make scenario and create or update Cord data from Make."
category: "Developers"
order: 4
---

You can connect Cord with Make using two modules Make already includes: **Webhooks** to receive Cord events and **HTTP** to call the Cord API.

### Receive Cord events

1. In your Make scenario, add the **Webhooks › Custom webhook** module, create a webhook, and copy the URL Make gives you.
2. In Cord, turn on **Developer mode** (the switch at the bottom of the Settings index) and open the **Webhooks** tab in the Developers dock.
3. Paste the Make URL, choose the events you care about (for example `quote.approved`), and save.
4. In Make, click **Redetermine data structure**, then use the endpoint's **Test** button in Cord. Make learns the shape of the event, and you can map fields like `data.folio`, `data.total`, or `data.cliente`.

Every event arrives with `id`, `event`, `created_at`, and `data`. Use the `id` so you don't process the same event twice if Cord retries the delivery.

Make does not verify Cord's signature for you. Treat the webhook URL as a secret: don't share it, and if you think it leaked, delete the endpoint in Cord and create a new one.

Each endpoint counts toward your plan's webhook limit.

### Create or update data in Cord

1. In Cord, create a **secret key** with write permission from the **API** tab in the Developers dock.
2. In Make, add the **HTTP › Make a request** module.
3. Set it up like this:
   - **URL**: the endpoint you need, for example `https://cordhq.app/api/v1/clientes`.
   - **Method**: `POST` to create, `PATCH` to update.
   - **Headers**: `Authorization` with the value `Bearer sk_live_...` and `Content-Type` with `application/json`.
   - **Body type**: `Raw`, JSON content, with the resource fields.
4. If the scenario can retry, add an `Idempotency-Key` header with a fixed value per operation, for example the `id` of the event that started it. That way a retry doesn't create the record twice.

What you can do from Make:

- Create a client with `POST /api/v1/clientes` or update it with `PATCH /api/v1/clientes/{id}`.
- Find a client by email with `GET /api/v1/clientes?email=...`.
- Create a quote with `POST /api/v1/cotizaciones`.
- Send it or mark it paid with `POST /api/v1/cotizaciones/{id}` and `action`.
- Create a task with `POST /api/v1/tareas`.

The fields for each endpoint are in the [developer documentation](/en/docs/desarrolladores/funciones/clientes).
