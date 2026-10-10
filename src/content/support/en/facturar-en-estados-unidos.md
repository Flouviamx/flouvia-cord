---
title: "How to invoice in the United States with Cord"
description: "Commercial invoice with sales tax by state or calculated from the client's address, EIN, card and ACH payments, and what Cord does and does not do with the states."
category: "Invoicing by country"
order: 2
---

In the United States Cord issues a **commercial invoice** with a sequential number, the sales tax of each item and both parties' details. The United States has no authority that authorizes invoices: Cord does not submit the invoice anywhere and **does not file your sales tax returns**.

**In short:**

- **Document:** commercial invoice and commercial credit note. On every plan; Free includes 10 per month and from Starter they are unlimited.
- **What you need:** your EIN (or Tax ID) and address under **Settings › Invoicing › Tax profile**, and a sales tax permit in each state where you collect.
- **Sales tax:** when you pick your state, Cord seeds the state rate and an exempt option. From Starter you can calculate it **from the client's address** (state, county, city and districts), with a monthly allowance per plan.
- **Collect:** card through Cord Payments and bank debit (ACH) in USD; automatic payments from the client portal (ACH debit and automatic payments are new and being rolled out: they may not be available on your account yet). Cord charges no transaction fee of its own outside Mexican pesos.
- **Void or correct:** **More actions › Void** if it has no payments; if it does, **Credit note**.
- **Not covered yet:** filing sales tax returns with the states, reports of recorded sales inside Cord, and a tax classification per product.

## Which document Cord issues

| Situation | Document |
|---|---|
| Any plan | Commercial invoice with prefix `INV` (or the one you set). |
| Correction or return | Commercial credit note with prefix `NCC`. |

The invoice prints the sales tax of each item. With address-based calculation, it prints one row per jurisdiction ("California 6%", "Los Angeles County 0.25%") and, when it applies, the 0% note: "No obligation to collect sales tax in Texas" or the reference to the client's exemption certificate.

## What you need

- **Your business EIN or Tax ID.** The IRS assigns it at no cost.
- **A sales tax permit** in each state where you must collect. You apply with each state, and each state decides whether it charges for it. Cord does not apply for permits or decide where you have nexus: confirm it with your advisor.
- **For address-based calculation:** Starter or above and an active Cord Payments account.

## Set up your account

1. Open **Settings › Invoicing › Tax profile** and complete **Invoice identity**: **Legal name**, **EIN / Tax ID**, **Address**, **City**, **State or region** (you pick your state from the list), **Postal code** and, optionally, your **Invoice prefix**. Save.
2. When you pick your state, Cord seeds under **Settings › Quotes › Taxes** the state rate ("Sales tax CA 7.25%", for example) and the **Exempt / Resale** option. A state with no state sales tax, such as Oregon, only gets the exempt option.
3. The state rate is the state minimum. If you sell in a city with local tax, create your own rate with **+ New tax** or turn on address-based calculation.
4. For address-based calculation, under **Settings › Quotes › Taxes › Sales tax by address**, turn on **Calculate sales tax from the client’s address**, enter **Your business address**, choose **What you sell**, tick the **States where you collect sales tax** and click **Save**. See [Automatic US sales tax](/en/support/sales-tax-automatico).
5. If a client is exempt, mark it on their profile under **Sales tax exemption**, with the certificate number, state and expiry date.

## Issue an invoice

From an approved quote click **Issue invoice**, or in **Invoices** click **New invoice**, choose the client, add items and click **Issue and send**. The email carries the PDF and the payment link. The number is assigned at issuance: a draft uses no number and no allowance.

With address-based calculation, the client needs at least a state and a 5-digit ZIP code; street and city improve accuracy. If data is missing or the calculation is unavailable, the invoice is not saved and the editor tells you what is missing. Cord never uses an estimated rate.

## Collect

- **Card** from the invoice link, through Cord Payments.
- **Bank debit (ACH)** in USD, if you turn it on under **Settings › Payments**. It takes up to 4 business days to confirm and only supports full refunds. See [SEPA Direct Debit and ACH](/en/support/domiciliacion-sepa-ach).
- **Client portal** to pay several invoices at once, and **automatic payments** on the due date. See [Client portal](/en/support/portal-del-cliente) and [Automatic payments](/en/support/cobro-automatico).

## How you see the status

There is no registration with an authority. The invoice detail shows its business status (open, paid, past due, void or uncollectible), the balance, the payments and the activity. With address-based calculation, each issued invoice is recorded as a sale in the states where you collect, so you have the data when you file.

## Void or correct

- **Void:** **More actions › Void**, only if the invoice has no payments. With address-based calculation, voiding reverses the recorded sale.
- **Credit note:** **More actions › Credit note** credits the invoice total. The note copies the sales tax breakdown to print it.
- **Refund:** returning money is a separate action, from **Payments**. See [Refund customers](/en/support/emitir-reembolsos).

## Common issues

- **The rate is lower than my city's.** The seeded rate is only the state rate. Use address-based calculation or create your locality's combined rate.
- **"The client's address needs its state and a 5-digit US ZIP code".** Complete them on the client's profile. If the message mentions your address, your states or the payments account, complete your setup under **Settings › Quotes › Taxes** or **Settings › Payments**.
- **A sale to another state comes out at 0%.** That is correct if you did not tick that state: you are not registered there and the invoice says so. If you do collect there, tick it in the setup.
- **I reached my plan's invoices with automatic sales tax.** Until next month, upgrade your plan or enter the rate manually.

## Not covered yet

- **Filing your sales tax returns** with the states.
- **Seeing the recorded-sales reports** for filing inside Cord.
- **A tax classification per product:** today it is one per business (services, physical goods, SaaS or digital services).
- **Partial reversal** of the recorded sale when you issue a credit note for part of an invoice.

## Related

- [Automatic US sales tax](/en/support/sales-tax-automatico)
- [SEPA Direct Debit and ACH](/en/support/domiciliacion-sepa-ach)
- [Commercial invoicing on Free](/en/support/facturacion-gratis)
- [Invoicing by country in the documentation](https://docs.cordhq.app/en/docs/pagos/facturacion)
