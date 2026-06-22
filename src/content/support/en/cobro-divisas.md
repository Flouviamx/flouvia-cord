---
title: "Multi-currency collections"
description: "How to charge in USD and settle in MXN."
category: "Payments & Deposits"
---

Cord natively supports the issuance of commercial proposals in over 100 currencies (Multi-currency).

### Create a quote in USD or EUR

When drafting the quote, in the **Global Settings** section (right panel), you will see a Currency selector.
1. Change from `MXN` to `USD` or `EUR`.
2. The prices of your entered line items will be read under that new currency.

### Payments via Stripe
If you have Stripe Checkout configured in Cord, the client will pay in that currency. Stripe will handle the foreign exchange (FX) conversion if your destination bank account is in Mexican pesos, charging their respective cross-border conversion fee.

### Invoicing and Exchange Rate (CFDI 4.0)
When invoicing this operation, Cord will issue the CFDI indicating `Currency: USD`. The system will calculate taxes based on the SAT requirements, for which it is essential that, when registering the payment, the corresponding `ExchangeRate` for the settlement day is determined.
