---
title: "Move your payment flows to Cord"
description: "How to activate Cord Payments and bring over customers, products, and current processes."
category: "Developers"
order: 5
---

Cord Payments brings the proposal, acceptance, and payment into one link. Funds reach your connected payment account; Cord does not hold balances or act as a bank.

Migration means activating payments, importing your commercial data, and gradually moving new flows to Cord. Saved cards from another system cannot be copied: each customer authorizes their payment method inside the new secure flow.

### Concept mapping

| Current object | In Cord | Note |
| :--- | :--- | :--- |
| Customer | Client | Keeps contact, legal name, commercial terms, and tax data. |
| Product or price | Product | Includes price, cost, taxes, and fiscal codes when applicable. |
| Invoice or payment link | Quote | Brings together the proposal, approval, payment schedule, and CFDI. |

Monthly retainers can be configured as recurring quotes. The customer authorizes their card once, and Cord records each monthly payment in the account history.

### Step 1: Activate Cord Payments

Go to **Settings › Payments** and complete the embedded onboarding to connect your payment account. Without an active account, the public link still works but without online payment.

### Step 2: Import your catalog

You don't need the API for this:

1. Export your customers to CSV from your current system.
2. In Cord, go to **Clients > Import** and map the columns (`empresa`, `email`, `RFC`…). You can also import **Products** via CSV.

If you prefer to do it in code, use the REST API: see [API: Manage Customers](/en/support/api-clientes) and [API: Create Quotes](/en/support/api-cotizaciones).

### Step 3: Point your webhooks

If you react to events from your backend, add your URL in **Settings > Developers > Webhooks**. Cord emits its own events: `quote.sent`, `quote.viewed`, `quote.approved`, `quote.rejected`, `quote.paid`, and `quote.invoiced`. Test them with the "Test" button before relying on them.
