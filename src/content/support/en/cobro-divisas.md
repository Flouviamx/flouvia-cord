---
title: "Multi-currency collections"
description: "How to quote and collect in a currency different from your accounting currency, which methods collect each currency and how the invoice declares the exchange rate."
category: "Payments & Deposits"
---

Cord keeps three currencies distinct and never mixes them: the **selling currency** (what you quote and charge the client in), the **accounting currency** (what your business keeps its books in) and the **platform currency** (what Cord charges you for your subscription in: MXN in Mexico, EUR in Spain, Germany and France, and USD in the other countries). This article is about the first one.

The selector offers the currencies of the 12 countries where Cord operates (MXN, USD, CAD, BRL, EUR, GBP, COP, ARS, CLP, PEN) plus four international-trade currencies (JPY, CNY, CHF, AUD). It is not an open catalog: a currency that no exchange-rate source publishes and no bank can settle is not offered, so you do not discover the problem only when it is time to collect.

## Create a quote in another currency

1. In the quote editor, under **What currency are you quoting in?**, choose the selling currency (for example, USD).
2. Your items' prices are entered in that currency.
3. If your books are in another currency, the editor shows **Today's exchange rate** and **Your locked-in rate**: under **How cautious do you want to be?** you choose a +1%, +2% or +5% buffer.
4. When you save, the rate is **locked for 30 days**.

The exchange rate comes from real, dated sources, starting with the European Central Bank reference. If no source publishes the pair, the quote is not saved and you are told why: Cord never makes up a rate.

## Online payment by currency

| Method | Currencies |
|---|---|
| Card (Cord Payments) | The selling currency, if your payments account supports it. |
| SPEI (Mexico) | MXN only. In another currency, your client pays by card even if you have SPEI on. |
| SEPA Direct Debit | EUR only, on the invoice and the portal. |
| ACH bank debit | USD only, on the invoice and the portal. |
| Mercado Pago | Whatever Mercado Pago supports on your account. |

If your bank's settlement currency is different, the payment network may apply conversion and cross-border fees. Check the net amount under **Payments** before reconciling.

## Invoicing and exchange rate

When the selling currency differs from your accounting currency, the invoice **declares the exchange rate locked when quoting** and the converted total; quoted amounts are never rewritten. Invoicing a multi-currency quote without a usable rate does not go through: Cord asks you to recalculate it.

- **Mexico:** the CFDI declares the currency and the exchange rate. A payment complement for a payment in another currency is not automatic: it needs the official rate of the payment date.
- **European Union:** if you invoice in another currency, the PDF also prints the tax amount in euros.
- **LatAm rails (being turned on):** ARCA uses the locked rate if your accounting currency is ARS (otherwise ARCA's official rate); the DIAN requires the rate to COP; SUNAT requires it for the withholding in soles; the SII and the NF-e only issue in their national currency.

## Related

- [Receive international payments](/en/support/pagos-internacionales)
- [Invoicing customers abroad](/en/support/facturas-extranjero)
- [Treasury and exchange rate in the documentation](https://docs.cordhq.app/en/docs/pagos/tesoreria-fx)
