---
title: "How to invoice in Canada with Cord"
description: "Commercial invoice with GST/HST and the provincial taxes (QST, PST, RST) charged together with GST, QST number, card payments and what Cord does not file with the CRA."
category: "Invoicing by country"
order: 3
---

In Canada Cord issues a **commercial invoice** with a sequential number, the taxes of each item and both parties' details. Canada has no authority that authorizes invoices: Cord does not submit the invoice anywhere and **does not file your GST/HST or QST returns**.

**In short:**

- **Document:** commercial invoice and commercial credit note, on every plan (10 per month on Free, unlimited from Starter).
- **Taxes:** GST 5%, the HST of the harmonized provinces and the **combined** rates of provinces with their own tax: GST 5% + QST 9.975% (Quebec), GST 5% + PST 7% (British Columbia), GST 5% + RST 7% (Manitoba) and GST 5% + PST 6% (Saskatchewan).
- **The breakdown separates each tax:** the PDF, the invoice link and the editors show GST and the provincial tax on separate rows, and the sum is exactly what was charged.
- **What you need:** your Business Number (BN) with your GST/HST registration, your province and, if you are registered in Quebec, your QST number.
- **Collect:** card through Cord Payments in CAD. Cord charges no transaction fee of its own outside Mexican pesos.
- **Not covered yet:** filing GST/HST or QST returns, and bank debit (there is no direct debit for Canada).

## Which document Cord issues

| Situation | Document |
|---|---|
| Any plan | Commercial invoice with prefix `INV` (or the one you set). |
| Correction or return | Commercial credit note with prefix `NCC`. |

The invoice prints your GST/HST number and, if you entered it, your QST number next to it. In French, the taxes are called TPS, TVQ and TVH.

## How Cord calculates provincial taxes

In Quebec, British Columbia, Saskatchewan and Manitoba the provincial tax is charged **together with** the 5% GST, not instead of it. That is why each line carries **one combined rate** (14.975%, 12% or 11%) and the breakdown splits it: GST is calculated on the base and the provincial tax takes the rest, so the sum matches what was charged to the cent. The 7% provincial tax is called RST if your business is in Manitoba and PST elsewhere.

The HST of the harmonized provinces (13% in Ontario, 14% in Nova Scotia and 15% in New Brunswick, Newfoundland and Labrador and Prince Edward Island) is in every account's catalog, because it is charged when selling **into** those provinces, wherever your business is. Rates follow those published by the CRA from 1 April 2025.

## What you need

- A **Business Number (BN)** and **GST/HST** registration with the CRA, if your business must register.
- **QST** registration with Revenu Québec, if you sell in Quebec and must register. The number has 10 digits, `TQ` and 4 digits.
- If you sell in British Columbia, Saskatchewan or Manitoba, the provincial registration that applies.

Cord does not handle these registrations or decide whether you must register; confirm it with your advisor.

## Set up your account

1. Open **Settings › Invoicing › Tax details** and complete **Invoice identity**: **Legal name**, **BN / GST/HST no.**, **Address**, **City**, **Province or territory** (from the list), **Postal code** and, optionally, your **Invoice prefix**.
2. If you are registered in Quebec, enter the **QST registration number**.
3. Save. When you pick your province, Cord seeds under **Settings › Quotes › Taxes** your province's rate as the default, GST 5% alone, the HST rates for selling into the harmonized provinces and the **Zero-rated** option. If you had chosen a province before, a catalog you did not touch is seeded again.
4. Review the catalog and set the rate you use most as the default.

## Issue an invoice

From an approved quote click **Issue invoice**, or in **Invoices** click **New invoice**, choose the client, add items with their rate and click **Issue and send**. If you sell to a client in another province, pick their province's rate on each line.

## How you see the status

There is no registration with the authority. The invoice detail shows the business status (open, paid, past due, void or uncollectible), the balance, the payments and the activity.

## Void or correct

- **Void:** **More actions › Void**, only if the invoice has no payments.
- **Credit note:** **More actions › Credit note**, which credits the total and keeps the tax breakdown.
- A refund is a separate action, from **Payments**.

## Common issues

- **A Quebec sale only charged QST, or only GST.** Choose the combined rate **GST 5% + QST 9.975%**. A standalone provincial rate saved earlier (QST 9.975%, PST or RST 7%, PST 6%) is read by Cord as the combined rate, so an old draft does not silently drop to GST alone.
- **My QST number is not on the invoice.** Enter it under **Tax details**; it applies to invoices issued afterwards.
- **My catalog did not change when I picked the province.** Only a catalog you did not modify is seeded again. Adjust the rates manually.

## Not covered yet

- **Filing your GST/HST or QST returns.**
- **Bank debit** for clients in Canada: online payment is by card.
- **Telling "exempt" from "zero-rated"** in your return: Cord stores the item's rate (0%), not the regime.

## Related

- [Set up tax withholdings](/en/support/retenciones-impuestos)
- [Commercial invoicing on Free](/en/support/facturacion-gratis)
- [Invoicing by country in the documentation](https://docs.cordhq.app/en/docs/pagos/facturacion)
