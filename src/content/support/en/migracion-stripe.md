---
title: "Cord alongside your Stripe"
description: "How Cord fits with your existing Stripe account and how to bring your data over."
category: "Developers"
order: 5
---

An important clarification: **Cord does not replace Stripe — it uses it.** Card payments for your quotes are processed by **your own Stripe account** (Cord never touches the funds). What Cord adds on top is what Stripe doesn't do in Mexico: interactive B2B quotes, price lists, credit, collections, and CFDI 4.0 stamping.

That's why there is no "migration" in the sense of moving cards or subscriptions. What you do is **connect your Stripe and bring your catalog over**.

### Concept mapping

| Stripe object | In Cord | Note |
| :--- | :--- | :--- |
| `Customer` | Client | In Cord a client carries RFC, legal name, credit terms, and tax data for CFDI. |
| `Product` / `Price` | Product | Cord products can carry cost (for margin) and, in the future, a SAT code. |
| `Invoice` / `Checkout` | Quote | An approved quote is charged via Stripe and, when invoiced, generates the CFDI 4.0. |

> Cord has no recurring subscription engine for your business's customers. If you sell subscriptions, that still lives in Stripe Billing; Cord covers the quoting and CFDI invoicing side.

### Step 1: Connect your Stripe

Configure your Stripe key so the public link's pay button charges your account. Without Stripe connected, the public link still works but without online payment.

### Step 2: Import your catalog

You don't need the API for this:

1. In Stripe, export your customers to CSV (Customers > Export).
2. In Cord, go to **Clients > Import** and map the columns (`empresa`, `email`, `RFC`…). You can also import **Products** via CSV.

If you prefer to do it in code, use the REST API: see [API: Manage Customers](/en/support/api-clientes) and [API: Create Quotes](/en/support/api-cotizaciones).

### Step 3: Point your webhooks

If you react to events from your backend, add your URL in **Settings > Developers > Webhooks**. Cord emits its own events: `quote.sent`, `quote.viewed`, `quote.approved`, `quote.rejected`, `quote.paid`, and `quote.invoiced`. Test them with the "Test" button before relying on them.
