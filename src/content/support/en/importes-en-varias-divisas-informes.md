---
title: "Amounts in multiple currencies and time zone on Home and in reports"
description: "How Cord converts your sales in other currencies to your business's base currency, which exchange rate it uses, what happens when none is available, and how your time zone shapes the days."
category: "Reports & Analytics"
order: 7
---

If you sell in more than one currency, Cord doesn't add up amounts in different currencies as if they were the same: USD 1,000 plus MXN 1,000 is not "2,000". Everything you see on Home, in reports, in CSV files, and in scheduled emails is expressed in **a single currency: your business's base currency**.

### Which currency your reports use

It's the **Base currency** under **Settings › General**. If you always quote in that currency, there's nothing to convert and you won't see any note.

### How each amount is converted

For each quote, invoice, or payment, Cord uses the best real rate available, in this order:

1. **It's in your base currency:** it's added as is.
2. **It has a locked exchange rate:** if Cord locked an exchange rate to your base currency when the quote was saved (or the invoice was issued), that one is used. It's the same rate your invoice states, so your reports match your documents. See [Multi-currency quotes](/en/support/cotizaciones-multimoneda).
3. **It doesn't have one:** today's published exchange rate is used.

Payments on a quote use their quote's exchange rate. Invoice payments in another currency are converted with today's published rate.

### The currency note

When there are amounts in more than one currency, a note like this appears under the money indicator on Home and at the bottom of each report:

> Amounts in USD. Sales in EUR and MXN are converted with the exchange rate set on each quote or invoice, or with today's published rate when there is none.

If a currency has no exchange rate available at all, the note adds:

> No exchange rate is available for COP, so those sales are not included for now.

### What happens when there's no exchange rate

Cord **never makes up a rate** or adds those amounts as if they were worth one to one. As long as there's no published exchange rate for that currency:

- Its amounts are **left out** of the totals (Closed, Collected, Sold, Quoted) and of the sales count behind the average ticket.
- The quotes still count in figures that don't depend on money, like **Quotes** or **Close rate**.
- As soon as a rate is available again, those sales are added back on their own. You don't have to do anything.

### Why a figure changes from one day to the next

Sales **without** a locked exchange rate are converted with today's rate, so the total for a past period can shift slightly when the rate moves. Sales with a locked exchange rate never move.

### If you change your base currency

Changing the **Base currency** under **Settings › General** doesn't modify your quotes or invoices, but all analysis switches to the new currency: Home, reports, CSV files, and emails. It can take a few minutes to show everywhere.

### Currencies in the CSV

CSV amounts come as numbers, and the last column, **Currency**, says which currency they're in: always the base currency. See [Export a report to CSV](/en/support/exportar-informes-csv).

To see how many sales you have in each currency, use a **Custom report** grouped by **Currency**: each row is a selling currency, with its amounts already converted to your base currency. See [Create, save, and share custom reports](/en/support/informes-personalizados).

### Time zone

The days in your analysis start and end at midnight **in your business's time zone** (**Settings › General › Time zone**), not the server's or your computer's:

- **"Today"** is your business's day. A sale approved at 11 p.m. in Mexico City counts on that day, not the next.
- **Weeks start on Monday** and months on the 1st, both in your time zone.
- **Scheduled emails** go out on Monday or the 1st in your time zone, with the full week or month in your time zone.
- **Repeat purchase by cohort** counts months in your time zone.

If your team works in another time zone, reports follow the business's time zone so everyone sees the same numbers.

### Common issues

**My dollar sales don't show up in the total.** Check the currency note: if it says no exchange rate is available for that currency, they're left out until one is. If the note doesn't appear, check that the period includes those sales.

**The total for a past month changed.** It has sales in another currency without a locked exchange rate: they're converted at today's rate. Quotes that lock an exchange rate when saved don't change.

**A sale shows up on the wrong day.** Check the **Time zone** under **Settings › General**: days are cut at midnight in that zone.

**I see amounts in a different currency than I expected.** Reports use the **Base currency** under **Settings › General**, not each quote's currency.

Full guide: [Reports and sales performance](/en/docs/gestion/informes).
