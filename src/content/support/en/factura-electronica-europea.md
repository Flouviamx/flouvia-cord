---
title: "European e-invoicing: Factur-X, XRechnung, Peppol and Facturae"
description: "Which formats Cord generates for EU issuers, what data each one needs, how to download them or attach them to the email, signing the Facturae and when they cannot be generated."
category: "Invoicing"
order: 21
---

If your business is established in the **European Union** (among Cord's countries: Spain, Germany and France), each invoice can also be downloaded in an electronic format your client's system reads without typing anything. It is **the same invoice** as the PDF, with the same amounts, written for a machine following the European standard EN 16931.

**In short:**

- **Formats:** **Factur-X** (PDF/A-3 with the XML inside; also ZUGFeRD), **XRechnung 3.0** (UBL and CII), **Peppol BIS 3.0** (UBL) and, in Spain only, **Facturae 3.2.2**, which also declares IRPF.
- **Where:** on the invoice detail, **E-invoice** section. Your client sees the available formats on their link.
- **Email:** by default France attaches the **Factur-X PDF**, Germany the **PDF + XRechnung XML** and Spain the PDF only. Change it under **Attach to invoice emails**.
- **Cord generates and attaches, it does not transmit:** it does not send over the Peppol network or to FACe. In France, issuing through an approved platform is being turned on.
- **Not generated** for drafts, voided invoices, test documents, pro formas or invoices with withholdings (except Facturae).
- **No extra cost:** it uses no allowance and does not depend on the plan.

## Which formats there are

| Format | What it is for | Available for |
|---|---|---|
| **Factur-X (PDF)** | A PDF that reads as usual and carries the XML inside. The standard in France; in Germany it is known as ZUGFeRD. | EU issuers |
| **XRechnung (UBL)** and **XRechnung (CII)** | The German format, mandatory for public administration and accepted between businesses. | EU issuers |
| **Peppol BIS 3.0 (UBL)** | The Peppol network format, used across Europe. | EU issuers |
| **Facturae 3.2.2 (XML)** | The Spanish format, which also declares the IRPF withholding. | Issuers in Spain, in euros |

## Prepare your data once

Under **Settings › Invoicing › Tax profile › European e-invoicing**:

- **Billing contact** and **Contact phone**: XRechnung requires a contact with name, phone and email (your business email). Without a phone here, the one in General is used.
- **Electronic address** with its scheme and **Identifier**: your Peppol participant identifier (for example a GLN or your VAT number). Peppol requires it; XRechnung uses your email if there is none.
- **Company registration number** and **BIC / SWIFT**. The IBAN is your payout account's, under **Settings › Payments**.
- **Attach to invoice emails:** automatic, **PDF only**, **Factur-X PDF (replaces the PDF)**, **PDF + XRechnung XML** or, in Spain, **PDF + Facturae XML**.
- In Spain, **Sign the Facturae with my electronic certificate** (see below).

On the **client's profile**: their electronic address and, if they require it (German public sector), their **Buyer reference (Leitweg-ID)**. Cord checks the Leitweg-ID check digit. On the **invoice**: **Buyer reference** and **Purchase order**, if your client requires them.

For 0% lines, under **Settings › Quotes › Taxes** each exempt profile has its **E-invoice classification** (in Spain, **Exemption reason (Verifactu)**). If you leave it on **Automatic (from the client)**, Cord derives it: a client in another member state with a VAT number goes under reverse charge; one outside the EU, as an export; a domestic one, as exempt.

## Download and send

1. Issue the invoice.
2. On its detail, the **E-invoice** section lists the available formats. Click the one you need to download it.
3. If the invoice is missing something for a format, the same section says **To generate the other formats:** and which data is missing, with a link to where it is fixed.

An issued invoice keeps the data it was issued with: what you correct in Settings or on the client applies to the next ones. If an invoice does not support the format chosen for the email, it goes out with the usual PDF: the email never fails because of this.

## What each format needs

- **XRechnung:** the buyer reference, a contact with name, phone and email, the client's city and postal code and, on an invoice, the IBAN.
- **Peppol:** the buyer reference or purchase order, your electronic address and the client's and, between German businesses, the IBAN.
- **Factur-X and XRechnung CII:** that IGIC is not at 0% (in that case, use XRechnung UBL or Peppol).
- **Facturae:** an issuer in Spain and an invoice in euros.

## The Facturae and its signature

The Facturae declares VAT, IGIC, IPSI and the **IRPF** withholding, so an invoice with IRPF is **only** available as Facturae: Factur-X, XRechnung and Peppol have nowhere to declare a withholding.

Unsigned, the Facturae works for your client. To submit it to **FACe** (public administrations) it must be signed and carry the public body's DIR3 codes, which Cord does not collect yet, and Cord does not submit it to FACe. If you turn on **Sign the Facturae with my electronic certificate**, Cord signs it (XAdES) with the certificate you uploaded for Verifactu, on behalf of your business; that is why it only applies if you turn it on.

## When it cannot be generated

- **Draft, voided invoice or test document.**
- **Pro forma.** A pro forma is not an invoice. In Spain, while Verifactu registration is being turned on, Cord issues pro formas: the electronic formats become available once it is active.
- **Issuer outside the EU** (the United Kingdom, for example).
- **Withholdings**, except Facturae.
- **Totals or lines that do not add up**, a currency with three decimals, a Leitweg-ID that fails its check digit, or incomplete identity data.

## Common issues

- **The email went out with the PDF only.** The invoice was missing data for the format. Check the **E-invoice** section of the detail.
- **"The Leitweg-ID is not valid".** It fails the check digit: confirm it with your client.
- **Peppol does not appear.** Your electronic address, the client's or the buyer reference is missing.
- **My client in Spain asks for the invoice through the AEAT public solution.** It is being turned on. See [How to invoice in Spain with Cord](/en/support/facturar-en-espana).

## Not covered yet

- **Transmission over the Peppol network** and submission to **FACe**.
- The Facturae **DIR3 codes**.
- **Order-X** and the Factur-X EXTENDED profile.

## Related

- [How to invoice in Germany with Cord](/en/support/facturar-en-alemania)
- [How to invoice in France with Cord](/en/support/facturar-en-francia)
- [How to invoice in Spain with Cord](/en/support/facturar-en-espana)
- [European e-invoicing in the documentation](https://docs.cordhq.app/en/docs/pagos/factura-electronica)
