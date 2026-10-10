---
title: "Download an invoice's PDF and XML"
description: "Where to find each invoice's PDF, the tax XML (CFDI, SUNAT, DIAN, SII, NF-e) and the European e-invoice formats, invoice by invoice."
category: "Invoicing"
---


Every invoice issued in Cord has its PDF. In addition, when the invoice is an electronic document before a tax authority, it has its XML (the actual tax document, the one your accountant needs):

- **Mexico (CFDI), Peru (SUNAT) and Colombia (DIAN):** **More actions › Download XML** on the invoice detail.
- **Brazil (NF-e):** the authorized XML is downloaded from the invoice's **NF-e** panel. See [How to invoice in Brazil with Cord](/en/support/facturar-en-brasil).
- **Chile (SII):** the **DTE XML** and the **Assignable copy (cedible)** are downloaded from the invoice's **SII** panel. See [How to invoice in Chile with Cord](/en/support/facturar-en-chile).
- **Spain, Germany and France:** the European e-invoice formats (Factur-X, XRechnung, Peppol and, in Spain, Facturae) are in the **E-invoice** section of the detail. See [European e-invoicing](/en/support/factura-electronica-europea).

A commercial invoice or a pro forma only has a PDF. To see which document Cord issues in your country and which tax rails are being activated, see [Invoicing by country](/en/support/category/facturacion-por-pais).

### Where to find them

Go to **Invoices** in the main menu and open the invoice you need. Its detail page has **Download PDF** and, when it applies, **More actions › Download XML**.

You can also reach the same file from the detail page of the quote that generated that invoice, in the tax documents section.

<Callout type="info">

Downloads are per-invoice today, from each invoice's own detail page — there's no bulk `.ZIP` export of a whole period yet. If you need several invoices for your accountant, open them one by one from your **Invoices** inbox.

</Callout>

## From the customer link

An invoice link lets the recipient view that document without creating an
account or entering the seller's dashboard. It shows the balance, line items,
payments and available downloads. Share it only with intended recipients: anyone
holding the link can view the invoice.

## View, download and contact

- Use **Refresh balance** to check recent changes.
- Download the **PDF** and, for an available CFDI where applicable, the **XML**
  directly from the link. Download access is limited to that invoice.
- Use the business contact when shown. Otherwise, reply to the email that
  delivered the invoice.
- On mobile, scroll the line-item table to see all amounts.

## If you just paid

Returning from payment does not itself mark the invoice as paid. If confirmation
is pending, refresh the balance. If your bank already shows a charge, contact the
seller before paying again.

A void invoice, credit note or test document has a different next step from an
open invoice. Test documents are identified and cannot receive a real payment.
The payment button depends on document state, balance and the seller's payment
account.

> Availability of the September improvements is being verified. See [scope and release status](https://docs.cordhq.app/en/docs/pagos/mejoras-confiabilidad); contact support if a described action is not yet shown in your account.

A pro forma in Mexico or Spain has a downloadable PDF, but no fiscal XML. Free includes ten commercial invoices per month. Downloading a document already issued does not consume another unit, even after changing plans.
