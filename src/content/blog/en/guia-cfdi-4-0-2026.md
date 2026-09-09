---
title: "CFDI 4.0 in 2026: data, issuance, and Cord boundaries"
excerpt: "An operating guide to prepare CFDI 4.0 in Cord, understand minimum recipient data, and identify fiscal complements that remain outside the product."
category: "Tax"
date: "12 Jun 2026"
publishedAt: "2026-06-12"
lastUpdated: "2026-08-28"
readTime: "09 MIN"
img: "/og-cord.jpg"
authorName: "Cord Team"
authorRole: "Product and invoicing"
reviewedBy: "Cord Product"
reviewedByRole: "Functional-scope review; not tax advice"
keywords: ["CFDI 4.0", "Mexico electronic invoicing", "CFDI recipient data", "CSD", "issue CFDI"]
faq:
  - question: "What minimum recipient data does CFDI 4.0 require?"
    answer: "SAT identifies RFC, name or legal name, tax regime, and fiscal postal code as minimum recipient data. The transaction also needs all other applicable fields, including CFDI use."
  - question: "Can Cord issue CFDI 4.0?"
    answer: "Yes, for Mexican organizations with a valid tax profile and CSD. Cord sends the document to Facturapi as stamping infrastructure; XML and a PDF representation are available after confirmed issuance."
  - question: "Does Cord issue payment-receipt or Carta Porte complements?"
    answer: "Not currently. Cord issues income CFDI within the documented scope. Payment-receipt, Carta Porte, payroll, and other specialized complements must be handled outside Cord."
sources:
  - name: "SAT — CFDI 4.0 invoicing service"
    url: "https://wwwmat.sat.gob.mx/aplicacion/75169/servicio-de-facturacion-cfdi-version-4.0-%28vigente-a-partir-del-1-de-enero-de-2022%29"
  - name: "SAT — invoicing guidance"
    url: "https://www.sat.gob.mx/minisitio/Factura/emite_materialdeayudaparafactura.htm"
  - name: "SAT — payment receipt complement"
    url: "https://wwwmat.sat.gob.mx/consultas/92764/comprobante-de-recepcion-de-pagos"
  - name: "Cord Docs — fiscal invoicing"
    url: "https://docs.cordhq.app/en/docs/pagos/facturacion"
---

Issuing CFDI 4.0 requires more than an RFC. SAT identifies the recipient's **RFC, name
or legal name, tax regime, and fiscal postal code** as minimum data. The transaction also
needs the applicable concepts, taxes, currency, payment form and method, and CFDI use.

This guide explains Cord's workflow. It does not replace your accountant or SAT guidance
for a particular transaction.

## Configure the issuer once

Under **Settings > Invoicing > Tax details**, enter the issuer RFC, legal name, tax
regime, fiscal postal code, numbering, and a valid Digital Seal Certificate with its
private key and password.

Cord validates the format and sends the material to the fiscal provider. Never expose
the `.key` file, password, or certificate in email, chat, or support tickets. Replace an
expired or revoked CSD before issuing again.

## Review every invoice

Check recipient RFC, legal name, regime, fiscal postal code, CFDI use, line items and
units, tax object and amounts, currency and exchange rate, and payment form and method.

Cord does **not** automatically scan a Certificate of Tax Status or decide the correct
regime, use, or tax treatment for you.

## What happens during stamping

Cord freezes an issuer, recipient, line-item, tax, and total snapshot and requests
stamping through Facturapi. After confirmation, Cord stores the fiscal identifier, XML,
and PDF representation associated with the document.

Fiscal issuance is not merely a visual status change. Corrections follow applicable
fiscal mechanisms, including cancellation or related documents. Review before confirming.

## PUE, PPD, and payment receipts

SAT distinguishes when the transaction is paid. In general, PUE applies to a transaction
paid in a single installment under applicable rules; PPD applies when payment is deferred
or split and may require a payment-type CFDI.

Cord **does not currently issue the payment receipt complement**. Recording payment in
receivables updates operational control inside Cord but does not create that fiscal
complement. Arrange issuance through your fiscal system or provider and adviser.

## Carta Porte and other complements

Cord also does not issue Carta Porte, payroll, foreign-trade, or other specialized
complements. An income CFDI issued in Cord does not automatically satisfy those duties.
Determine the required document with a specialist.

## Common errors

- Recipient name does not match tax records.
- Postal code belongs to a branch rather than the required fiscal address.
- Tax regime and CFDI use are incompatible.
- CSD is expired or revoked, or its password is wrong.
- A payment recorded in Cord is mistaken for a fiscal payment complement.
- Issuance occurs before resolving a currency, tax, or total discrepancy.

Read the [Cord invoicing guide](https://docs.cordhq.app/en/docs/pagos/facturacion) for
the exact configuration, issuance, download, and correction workflow.
