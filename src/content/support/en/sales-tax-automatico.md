---
title: "Automatic US sales tax from the client's address"
description: "How state, county, city and district sales tax is calculated, how many invoices each plan includes, overage, exempt clients, limits and what is not covered yet."
category: "Invoicing"
order: 20
---

A US business catalog only carries the **state** rate, which is the minimum: a sale in Los Angeles carries more tax than California's 7.25%. With **Calculate sales tax from the client’s address**, each line of a quote or invoice for a client in the US takes the **combined state, county, city and special-district rate** of their address, and the document prints one row per jurisdiction.

**In short:**

- **Plan:** from **Starter**. Not available on Free.
- **Included per month:** 10 invoices with automatic sales tax on Starter, 25 on Professional, 60 on Scale and 150 on Developer.
- **Published overage:** USD 0.75, MXN 15.00 or EUR 0.70 per additional invoice, depending on your subscription currency (Developer has no self-serve EUR rate). Today that overage is not billed yet, so the included amount works as a **cap**: once you reach it, upgrade your plan or enter the rate manually until next month.
- **What counts:** each issued invoice and each paid quote recorded in a state **where you collect**, once. Previews do not count, a sale to a state where you do not collect does not either, and a quote and its invoice count as a single sale.
- **What you need:** an active Cord Payments account, your full address and the states where you are permitted to collect.
- **It never estimates:** if data is missing or the calculation is unavailable, the document is not saved and you are told what is missing.

## Turn it on

1. Activate Cord Payments under **Settings › Payments**: the calculation lives in your payments account.
2. Open **Settings › Quotes › Taxes** and scroll to **Sales tax by address**.
3. Turn on **Calculate sales tax from the client’s address**.
4. Under **Your business address**, enter **Street address**, **City**, **State** and **ZIP**. In states that tax at the seller's location, your address decides the rate.
5. Under **What you sell**, choose **General services**, **General tangible goods**, **Software as a service (business use)** or **General electronically supplied services**. It decides whether a state taxes what you sell: many states do not tax services.
6. Under **States where you collect sales tax**, tick only those where you hold a permit.
7. Click **Save**. The status reads **Automatic sales tax is on** and lists your states.

Removing a state stops collecting from today; documents already calculated keep their tax. If something is missing, Cord says so and leaves the calculation off.

## How it looks on the document

- The item column shows the **combined legal rate** (for example 9.5%).
- The summary prints **one row per jurisdiction**: "California 6%", "Los Angeles County 0.25%" and any districts that apply.
- A client in a state where you do **not** collect carries 0% and the note "No obligation to collect sales tax in Texas".
- An exempt client carries 0% and the note "Tax-exempt customer" with their certificate. A sale that a state does not tax carries the note "Not subject to sales tax in" and the state.
- The total matches the calculated tax to the cent, also with tax-inclusive prices. The calculation is done in the selling currency, with the document discount already spread across the lines.

This works the same in the editor, the PDF, the quote link (`/q`), the invoice link (`/i`) and your team's views.

## Exempt clients

On the client's profile, under **Sales tax exemption**, mark them as exempt with their **certificate number**, state and expiry date. Without a certificate number the exemption is not saved, and with an expired certificate the document is not saved until you update it.

## Messages you may see

| Message | What to do |
|---|---|
| "The client's address needs its state and a 5-digit US ZIP code" | Complete them on the client's profile. Street and city improve accuracy. |
| "We could not locate the client's address" | Check street, city, state and ZIP. |
| "Your business address (street, city, state and ZIP) is missing" | Enter street, city, state and ZIP under **Sales tax by address**. |
| "Add at least one state where your business collects sales tax" | Tick your states and save. |
| "One of your registered states is not active" | Save your states again. |
| "The sales tax calculation for this document is no longer valid" | Save the document again to recalculate. |
| "You reached the N invoices with automatic sales tax included in your plan this month" | Upgrade your plan or enter the rate manually until next month. |
| "This document reached today's N sales tax calculations" | Save it to lock in its tax; you can recalculate tomorrow. |
| "Your business reached today's N sales tax calculations" | They renew in 24 hours; until then, enter the rate manually. |
| "Automatic sales tax is not available right now" | Try again in a few minutes; no estimated rate was used. |

To keep the cost of each calculation in check, Cord limits calculations per business (per minute, per hour and up to 500 a day) and per document (up to 20 new calculations a day in the preview), and reuses the preview calculation when saving if nothing changed. A typical quote uses 1 to 3 calculations.

## Recording the sale

When you issue an invoice (including one that comes from a quote), or when a quote is paid, Cord records the sale once with the tax the document charges. If the document changed afterwards and the tax no longer matches to the cent, the sale is held for review instead of recording a different figure. **Voiding** an invoice reverses its sale, unless it backs a quote that was already paid.

## If you downgrade

The preference is kept, but it is **paused**: the status reads **Paused: your current plan does not include it** and your documents use your catalog rates until you are back on Starter or above.

## Not covered yet

- **Filing your sales tax returns** or seeing the recorded-sales reports inside Cord.
- **Classification per product:** today it is one per business.
- **Partial reversal** of the sale when you issue a credit note.
- **The API and the MCP server** do not expose the client's exemption or the per-jurisdiction breakdown (the documents they create do calculate by address).

## Related

- [How to invoice in the United States with Cord](/en/support/facturar-en-estados-unidos)
- [Your Cord subscription](/en/support/planes-suscripcion)
- [Invoicing by country in the documentation](https://docs.cordhq.app/en/docs/pagos/facturacion)
