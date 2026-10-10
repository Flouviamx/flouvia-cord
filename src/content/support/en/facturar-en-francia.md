---
title: "How to invoice in France with Cord"
description: "Invoice with the mentions the reform requires, Factur-X, VAT regime and the option to pay VAT on debits; issuing through an approved platform and e-reporting being turned on, and what Cord does not receive."
category: "Invoicing by country"
order: 8
---

In France Cord issues a **commercial invoice** in French with the **mentions the e-invoicing reform requires** (transaction category, client SIREN, option to pay VAT on debits, delivery address) and delivers it as **Factur-X**. **Issuing through an approved platform (PA)**, **e-reporting** and payment reporting are built, but **being turned on**: today Cord does not transmit anything to the administration. If you need to issue through the platform from Cord, write to us to enable it on your account.

**In short:**

- **Document:** invoice and commercial credit note, on every plan (10 per month on Free, unlimited from Starter). By default each invoice email carries the **Factur-X PDF** (the PDF with the XML inside).
- **Being turned on:** issuing through an approved platform, e-reporting and payment reporting. Under **Settings › Invoicing › Tax details › E-invoicing in France** it reads **Coming soon**.
- **Reform calendar:** since 1 September 2026 every business established in France must be able to **receive** e-invoices, and large companies and mid-caps (ETI) also issue and report. SMEs and micro-businesses issue and report from **1 September 2027**.
- **Cord only issues:** it does not receive your suppliers' invoices. You need your own reception platform.
- **What you need:** your SIREN (or your VAT number, which contains it), your **VAT regime**, whether you opted to pay VAT on debits and the type of each product (goods or service).
- **Collect:** card and **SEPA Direct Debit** in EUR, and automatic payments from the client portal.

## Which document Cord issues

| Situation | Document |
|---|---|
| Any plan | Commercial invoice in French with prefix `INV` (or the one you set). |
| Correction or return | Commercial credit note with prefix `NCC`. |
| Electronic download | Factur-X EN 16931, XRechnung and Peppol BIS. |
| With the platform active | Invoices between French businesses are transmitted as Factur-X; sales to consumers and with other countries are reported. |

## The reform mentions

All your French invoices already carry them, with or without the platform:

- **Transaction category** (goods, services or mixed), taken from each product's **Type of sale** (product, service or subscription) and, for items typed by hand, from **Lines without a catalog product** in Settings. Without it, the invoice cannot be transmitted.
- **Option to pay VAT on debits**, if you have it: the invoice prints "Option pour le paiement de la taxe d'après les débits".
- **Client SIREN** and their electronic address in the directory.
- **Delivery address**, if it differs from the client's and it is not services only: the **Delivery address (optional)** field in the invoice editor.
- The business-to-business terms: late payment penalties, the fixed 40 EUR recovery cost indemnity and no discount for early payment; and, if you apply the franchise, the art. 293 B CGI notice.

## What you need

- Your business **SIREN** or your intra-community VAT number, which contains it.
- Your **VAT regime**: monthly standard, quarterly standard or simplified (the franchise is taken from the franchise switch).
- **A reception platform** for the invoices you receive: Cord does not receive them.
- Once issuing is turned on, verifying your identity and signing the mandate with the approved platform Cord issues through.

## Set up your account

1. Under **Settings › Invoicing › Tax details › Invoice identity**, enter **Legal name**, **SIREN / N° TVA**, address and your **Invoice prefix**. If you apply the franchise, turn on **VAT small-business exemption (art. 293 B du CGI)**.
2. Under **E-invoicing in France**, choose your **VAT regime**, set **Lines without a catalog product** (goods or services) and, if it applies, turn on **I opted to pay VAT on debits**. These details feed the mentions even while the platform is off.
3. In **Products**, check each one's **Type of sale**: a product is a supply of goods; a service, subscription or license is a supply of services.
4. Under **European e-invoicing**, complete contact, electronic address and what to attach to the email.
5. Once the platform is active: **Register with the platform** and, on its page, **verify your identity and sign the mandate**.

## How you see the status

Today, the invoice detail shows its business status and, in the **E-invoicing platform** panel, how the reform treats it (between French businesses, with a foreign business or to a consumer) and whether it already has what it requires or what is missing. With the platform active, the same panel shows the submission, each status with its date and reason (200 to 213) and the payments reported. Settings shows the queue (queued, without confirmation, reports past their deadline) and what needs attention.

## Void or correct

- **Void:** **More actions › Void**, only if the invoice has no payments. An invoice already transmitted through the platform is not voided there: it is corrected with a credit note.
- **Credit note:** **More actions › Credit note**, which cites the original invoice and its date.
- **Invoice rejected** by the client (210) or by a platform (213): an accounting cancellation without a flow is recorded and a new invoice with the right data is issued. Nothing corrects itself.

## Common issues

- **"Cannot be transmitted yet".** Something the reform requires is missing: SIREN, the transaction category of an item, a valid French rate or an invoice number with allowed characters. The panel lists it.
- **I do not receive supplier invoices in Cord.** That is on purpose: Cord only issues. Keep your reception platform.
- **The invoice has services and goods.** It is a mixed transaction and is reported as such; each item takes the category of its type.

## Not covered yet

- **Issuing through the platform, e-reporting and payment reporting:** being turned on.
- **Receiving** supplier invoices.
- **Correcting data already reported** in e-reporting from Cord.
- Not issued through the platform: self-billing, multi-vendor, advances or the margin scheme.

## Related

- [European e-invoicing](/en/support/factura-electronica-europea)
- [SEPA Direct Debit and ACH](/en/support/domiciliacion-sepa-ach)
- [European e-invoicing in the documentation](https://docs.cordhq.app/en/docs/pagos/factura-electronica)
