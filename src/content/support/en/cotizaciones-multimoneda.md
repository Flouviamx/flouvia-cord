---
title: "Multi-currency quotes"
description: "Send proposals in USD, EUR, or MXN."
category: "Quotes"
---

Cord natively supports issuing commercial proposals in over 100 currencies.

### How to create a quote in another currency?

When drafting the quote, in the **Global Settings** section (right panel), you will see a Currency selector.
1. Change from `MXN - Peso Mexicano` to `USD - Dólar Estadounidense` or `EUR - Euro`.
2. All prices for your entered line items will be read under this new currency.

### Impact on Billing and Payments

- **For your client:** They will receive the document and the payment link showing dollars (e.g., $10,000 USD). If they pay by credit card, their bank will charge them in dollars or in their local currency according to their banking contract.
- **For you (Invoice):** Cord will automatically stamp the CFDI with the SAT indicating `Currency: USD` and will automatically include the official `TipoCambio` (Exchange Rate) node from the Official Journal of the Federation (DOF) on the day of collection. This ensures that the SAT receives the correct value of the transferred taxes converted to pesos for your monthly declaration.
- **For you (Money):** Our payment engine will settle the transaction in your Mexican bank account **in Pesos (MXN)** using a competitive wholesale exchange rate at the time of capture.
