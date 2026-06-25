---
title: "Invoicing (CFDI) and the API"
description: "How CFDI 4.0 invoices are issued in Cord and what the public API exposes."
category: "Developers"
---

Unlike other resources, **CFDI 4.0 stamping is not exposed as a public v1 API endpoint yet**. Invoicing happens within the quote flow, not as a direct "create invoice" call.

### How invoicing works in Cord

1. You create or receive a quote (you can do this via the API: see [API: Create quotes](/en/support/api-cotizaciones)).
2. The customer approves it (or you mark it approved).
3. You mark the quote as **invoiced** from the app. At that point Cord builds the CFDI 4.0 from the quote data (products, quantities, prices, RFC and the customer's tax details) and stamps it with the SAT through our PAC, **Facturapi**.
4. The XML and PDF stay linked to the quote and available to you and your customer.

To issue the CFDI to a specific RFC, capture the customer's **tax regime, zip code, and CFDI use** in their record. Without that data, the receipt is issued as "general public".

### What you CAN do via the API

- **Create and query quotes** (`/api/v1/cotizaciones`), which are the source of every invoice.
- **Query your receivables** (`/api/v1/cobranza`) to know what is paid or overdue.
- **Receive webhooks** for the `quote.invoiced` event when a quote is invoiced, to react from your system.

> A direct stamping endpoint (without going through a quote) is on our roadmap. For now, the source is always a quote.
