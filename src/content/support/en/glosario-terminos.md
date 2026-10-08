---
title: "FinTech and Accounting Glossary"
description: "Dictionary of technical, financial, tax (SAT), and reporting terms used on the Cord platform."
category: "Account & Team"
order: 99
---

Cord bridges worlds that speak different languages: **developers**, **accountants**, and the people who read the business's **reports**.

This glossary resolves the most common ambiguities so everyone can use the platform without friction.

## Invoicing Terms (SAT)

### CFDI (Comprobante Fiscal Digital por Internet)
It is the official XML file that represents an electronic invoice in Mexico. Cord issues CFDI version 4.0 automatically.

### PUE (Pago en Una sola Exhibición)
Used when the collection of an invoice is made at the exact moment of issuance or before issuing it. If a customer pays via Credit Card on a Cord link, the generated invoice will be PUE.

### PPD (Pago en Parcialidades o Diferido)
Used when the invoice is issued but the payment will be received at a future date (credit). PPD invoices **always** require a REP to be issued later when the money arrives in the account.

### REP (Recibo Electrónico de Pago)
Also known as "Payment Receipt Supplement". It is a secondary receipt issued to "settle" an original PPD invoice. Today Cord records each partial payment and updates the invoice balance, but it **does not stamp the REP**: you generate that receipt yourself until automatic stamping arrives (see [PPD invoices and Payment Receipt Supplements](/en/support/complementos-de-pago)).

### CSD (Certificado de Sello Digital)
These are the cryptographic files (`.cer` and `.key`) issued by the SAT that allow software to digitally sign invoices on behalf of a company. It is different from the FIEL (Advanced Electronic Signature). In Cord, you only need to upload your CSD.

### CFDI Usage (Uso de CFDI)
A key from the SAT catalog that indicates what the recipient (customer) will use the invoice for (e.g., `G03 - General expenses`, `I04 - Computer equipment`).

---

## Technical Terms (Developers)

### Idempotency
It is the property of Cord's APIs that guarantees that the same operation is not executed twice, even if the request is sent multiple times due to a network error. To achieve this, you send an `Idempotency-Key` in the headers of your requests. [More information](/en/support/idempotencia).

### Webhook
It is a mechanism by which Cord proactively notifies your server (via an HTTP POST request) that an important event has occurred (e.g., `quote.paid`, `quote.invoiced`). [More information](/en/support/configurar-webhooks).

### Cord Elements
It is our suite of pre-built user interface (UI) components that you can embed directly into your application (React, Vue, or plain HTML) to process payments without having to design the checkout flow from scratch. [More information](/en/support/cord-elements).

### Test mode
`sk_test_` keys don't consume your usage meter or count toward billing, so they're useful for integrating the API without affecting your plan. Note: they operate on the same organization data (there's no 100% isolated sandbox yet), and whether stamping is real or simulated depends on whether you have your CSD connected.

### Endpoint
A specific URL of the Cord API designed to execute an action (e.g., `POST /api/v1/cotizaciones` to create a quote).

---

## Financial Terms

### Net-30 / Credit Terms
It means that the customer has 30 calendar days from the issuance of the invoice (or product delivery) to settle the total balance.

### Dispute (Chargeback)
Occurs when an end customer contacts their bank to reject a charge processed via Cord. The bank temporarily holds the funds while Cord helps you submit evidence to win the dispute.

### Reconciliation
The process of matching a money movement in the corporate bank account with its respective invoice or accounting record. Cord automates this for payments that go through Cord Payments (card, and in Mexico, SPEI); a manual bank transfer deposit is confirmed by you.

---

## Reports and Analytics Terms

### Range
The period you pick in the date picker on Home or in a report (for example, **Last 30 days** or a **Custom** range). Widgets tagged **Range** follow it; those tagged **Today** are a snapshot of right now, and those tagged **All time** add up your whole history. [Learn more](/en/support/leer-kpis-y-rango).

### Previous period
The period of the same length immediately before the chosen range: each figure's change is calculated against it. **Last 30 days** is compared with the 30 days before, and **This month** on the 8th is compared with the previous 8 days, not all of last month. Amounts change as a percentage and rates in points.

### Collected
Money that came in, by payment date: quote and invoice payments (including partial payments) and quotes marked as paid manually, minus refunds. It means the same thing on Home and in every report.

### Close rate
Of the quotes sent in the period, what percentage was won (approved, paid, or invoiced). It's measured on a **cohort** so two periods compare without mixing dates.

### Cohort
A group followed over time based on when it started. In **Close rate** and the **Custom report**, the cohort is the quotes created in the period and what happened to them afterward. In **Repeat purchase by cohort**, it's the clients who first bought in the same month.

### Average ticket
What was sold in the period divided by the number of sales that make it up.

### Base currency
Your business's currency (**Settings › General**). Every amount on Home, in reports, CSV files, and scheduled emails is expressed in it; sales in other currencies are converted with the exchange rate locked on the quote or, if there's none, with today's published rate. [Learn more](/en/support/importes-en-varias-divisas-informes).

### Table report
A report with key figures compared with the previous period, a chart, and a full table you sort by column and export with **Export CSV**. For example, **Sales over time** or **Payments received**. [Learn more](/en/support/informes-de-cord).

### Custom report
A table report you build yourself: you choose **Group by** and up to six metrics. You can share it with a link, save it with a name for the whole team, and get it by email. [Learn more](/en/support/informes-personalizados).

### Drill-down (view detail)
Going from an aggregate figure to what makes it up: a click on a client's bar opens their page, and one on a month's bar opens that month in more detail. On a phone, the first tap shows the value and **View detail** takes you there.

### Widget
Each card on Home and in widget reports. You move, resize, hide, and add them from the library with **Customize**. [Learn more](/en/support/personalizar-inicio-widgets).
