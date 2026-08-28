---
title: "Multi-currency collections"
description: "How to quote and collect in a currency different from your accounting currency."
category: "Payments & Deposits"
---

Cord keeps three currencies distinct and never mixes them: the **sale currency** (what you quote and charge the client in), the **accounting currency** (what your business keeps its books in), and the **platform currency** (what Cord charges you for your subscription in, always MXN or USD depending on your country). This article is about the first one.

The currency selector offers the currencies of the 12 countries where Cord operates (MXN, USD, CAD, BRL, EUR, GBP, COP, ARS, CLP, PEN) plus four international-trade currencies (JPY, CNY, CHF, AUD). It isn't an open catalog: a currency that no exchange-rate source publishes and no bank can settle isn't offered for capture, so you don't discover the problem only once it's time to collect.

### Create a quote in another currency

When drafting the quote, in the **Global Settings** section (right panel), you will see a Currency selector.
1. Change the sale currency to the one you need (for example, from MXN to USD).
2. The prices of your entered line items are read under that new currency.

### Online payment

The customer pays in the currency shown on the link when that currency, country, and method combination is enabled for your account. If your bank settlement currency differs, the payment network may apply conversion and cross-border charges. Review the estimated net amount under **Payments** before reconciling. SPEI transfer only exists for payments in Mexican pesos; in any other currency, online payment is by card.

### Invoicing and exchange rate

When the sale currency differs from your business's accounting currency, the invoice declares the day's exchange rate — the amounts you already quoted are never rewritten. That rate comes from a real, dated source (it is never invented); if no source publishes it that day, the operation fails with a clear message instead of risking the wrong rate.

In **Mexico**, the invoice is a CFDI 4.0 and declares `Currency` and `ExchangeRate` per the SAT's format. In every other supported country, the invoice is a commercial invoice (or Verifactu in Spain) that declares the same sale currency, accounting currency, and applied exchange rate, without SAT-specific vocabulary that doesn't apply outside Mexico.
