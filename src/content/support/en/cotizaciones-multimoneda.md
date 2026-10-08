---
title: "Multi-currency quotes"
description: "Send proposals in USD, EUR, or MXN."
category: "Quotes"
---

Cord supports issuing commercial proposals in 14 currencies: the currencies of the 12 countries where the platform operates (MXN, USD, CAD, BRL, EUR, GBP, COP, ARS, CLP, PEN) plus four international-trade currencies (JPY, CNY, CHF, AUD). This isn't an open catalog of the ~180 ISO currencies — it's a closed set that only grows when Cord enables the matching payment rail and payout account format.

### How to create a quote in another currency?

When drafting the quote, in step 3 of the editor, **Terms**, you'll see the **Which currency are you quoting in?** selector (on an invoice it's called **Invoice currency**).
1. Change from your account's default currency (set under **Settings > General**) to any of the offered currencies.
2. All line items in that quote are entered and shown in the currency you picked — it's the sale currency, and it's what your client sees on the public link.

Changing the currency **doesn't convert prices**: your lines keep the same numbers, now in the new currency, and the editor reminds you to review each price.

If the sale currency differs from your accounting currency, the editor shows the **Rate today** and **Your protected rate**: you choose how cautious you want to be (Light +1%, Normal +2% or Cautious +5%) and see what your client pays and its approximate equivalent in your books. On a quote the rate is locked for 30 days; on an invoice it's stated on the document.

### Impact on Billing and Payments

- **For your client:** They will receive the document and the payment link in the currency you chose (e.g., $10,000 USD). If they pay by card, their bank will charge them in that currency or in their own local currency, depending on their banking contract.
- **For you (tax document):** if the quote's sale currency differs from your organization's accounting currency, the fiscal document declares the exchange rate frozen at the moment the quote was created — pulled from a real, dated exchange-rate source (never invented; if no source publishes the pair, the operation fails instead of using an estimate). In Mexico, the CFDI declares this same rate as `TipoCambio` to the SAT when the invoice currency isn't MXN; in other countries the fiscal document states the exchange rate without that SAT-specific node, which is exclusive to Mexico.
- **For you (money):** settlement is processed by your Cord Payments account and lands in your payout account in whatever currency that account uses for your country (for example, pesos in Mexico, dollars in the United States, euros in Spain), applying its own conversion rate if the sale currency was different.
