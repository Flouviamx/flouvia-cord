---
title: "Migration Guide: From Stripe to Cord"
description: "Step-by-step guide to exporting your customers, subscriptions, and catalogs from Stripe and importing them to Cord's B2B platform."
category: "Developers"
order: 5
---

If you currently process payments or subscriptions with Stripe, migrating to Cord will grant you key additional benefits for the Latin American market (such as automatic CFDI 4.0 stamping, receiving bank transfers, and issuing REPs).

Cord's architecture was designed with a philosophy similar to Stripe's, so the learning curve for your engineering team will be minimal.

## Key Conceptual Differences

Before starting data export, it is important to align the concepts:

| Object in Stripe | Equivalent object in Cord | Difference |
| :--- | :--- | :--- |
| `Customer` | `Client` | In Cord, a Client requires the `RFC` and `Legal Name` for B2B invoicing purposes. |
| `Product` | `Product` | In Cord, products can be assigned SAT Product/Service Keys. |
| `Price` | `Price` | - |
| `Subscription` | `Subscription` | Cord can automate the monthly PPD invoice for subscriptions paid via SPEI. |
| `Invoice` | `Quote` / `Invoice` | A Stripe "Invoice" maps as a Quote that, when paid, generates a CFDI. |

## Step 1: Secure Card Export (Data Migration)

Due to PCI-DSS compliance, you cannot export raw card numbers (`PAN`) from the Stripe dashboard.

To migrate your customers' card vault to Cord without asking them to re-enter their details, you need to request a **PCI data migration**:

1. Contact Stripe support and request a secure card data export to a Level 1 PCI-DSS processor.
2. Stripe will ask for Cord's public PGP key. Contact our support team (`soporte@flouvia.com`) to provide you with this file.
3. Stripe will send us the encrypted vault directly. We will decrypt it and inject the cards (as tokenized `Payment Methods`) directly into your customers' profiles in Cord.

*This technical process may take between 5 and 10 business days due to Stripe's regulations.*

## Step 2: Import your Customer Catalog

If you are not going to migrate credit cards (for example, if your customers pay exclusively via bank transfer), you can do it in minutes:

1. Go to your Stripe Dashboard > Customers > **Export**.
2. You will get a `.csv` file.
3. Go to your Cord Dashboard > Customers > **Import**.
4. Select the column mapping (Make sure to map `email`, `name`, and if you have metadata with the `RFC`, assign it).

## Step 3: Subscription Migration (Recurrence)

To avoid double charges during the billing engine transition:

1. Import your customers and product catalog to Cord.
2. Identify your customers' next billing cycle (e.g., 15th of the month).
3. Write a script using our [Subscriptions API](/en/developers/api) that creates the subscriptions in Cord with the parameter `trial_end` or `billing_cycle_anchor` set to the exact date of the next charge.
4. Pause or cancel active subscriptions in Stripe.

### Example of creation with deferred cycle (Node.js)

```javascript
const cord = require('cord-node')('sk_test_your_key');

// Create the subscription scheduled to charge on the future date
const subscription = await cord.subscriptions.create({
  customer: 'cus_12345',
  items: [{ price: 'price_98765' }],
  billing_cycle_anchor: 1718968200 // Unix timestamp of the next charge
});
```

## Step 4: Change Webhook URLs

Finally, you will need to point your backend's business logic to Cord.

1. Go to **Settings > Webhooks** in Cord.
2. Add your receiver URL (e.g., `https://your-api.com/webhooks/cord`).
3. Modify your controllers. If you previously listened to Stripe's `invoice.paid` event, you will now listen to Cord's `invoice.payment_succeeded` event.
4. Run tests by sending events from the Cord **Sandbox** before turning off the production Stripe integration.
