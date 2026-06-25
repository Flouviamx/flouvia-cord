---
title: "Avoiding duplicate operations"
description: "How to prevent duplicate quotes or records when integrating the API."
category: "Developers"
---

Idempotency is a technique that ensures an operation occurs exactly once, no matter how many times the same request is retried. It's useful for preventing duplicates when a connection drops mid-`POST`.

> **Current status:** Cord's v1 API **does not expose an `Idempotency-Key` header yet**. While we add it, use the following strategies to avoid duplicates from your integration.

### Recommended strategies

- **Store the response `id`.** When you create a quote (`POST /api/v1/cotizaciones`), the response includes `data.id` and `data.folio`. Persist them in your system and don't retry if you already have an id for that logical operation.
- **Check before retrying.** If a `POST` fails on timeout, first run a `GET` (for example the recent quotes list) to see whether the creation actually happened before sending it again.
- **Lean on the importer's dedupe.** **Client** import deduplicates by RFC or name, and **product** import by SKU. If you sync catalogs, re-importing won't create duplicates.

When we ship official `Idempotency-Key` support, we'll update this guide with the header and its rules.
