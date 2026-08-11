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

### Online payment
The customer pays in the currency shown on the link when that currency, country, and method combination is enabled for your account. If your bank settlement currency differs, the payment network may apply conversion and cross-border charges. Review the estimated net amount under **Payments** before reconciling.

### Invoicing and Exchange Rate (CFDI 4.0)
When invoicing this operation, Cord will issue the CFDI indicating `Currency: USD`. The system will calculate taxes based on the SAT requirements, for which it is essential that, when registering the payment, the corresponding `ExchangeRate` for the settlement day is determined.
