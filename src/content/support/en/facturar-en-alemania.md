---
title: "How to invoice in Germany with Cord"
description: "Rechnung with USt., Kleinunternehmer, date of supply, XRechnung, Factur-X (ZUGFeRD) and Peppol, Leitweg-ID and SEPA Direct Debit: what Cord does and what it does not."
category: "Invoicing by country"
order: 7
---

In Germany Cord issues a **commercial invoice** (Rechnung) in German, with a sequential number, the USt. of each item and the mentions the law requires. Each invoice can also be downloaded as **XRechnung**, **Factur-X (ZUGFeRD)** and **Peppol BIS**, the e-invoice formats your client can process automatically. Cord **does not transmit** invoices over the Peppol network or file your USt. returns.

**In short:**

- **Document:** Rechnung and commercial credit note, on every plan (10 per month on Free, unlimited from Starter).
- **E-invoicing:** XRechnung (UBL and CII), Factur-X and Peppol BIS are downloaded from the invoice detail. By default, each invoice email carries the **PDF and the XRechnung XML**.
- **Taxes:** USt. 19%, USt. 7% and **Steuerfrei**. If you are a **Kleinunternehmer (§ 19 UStG)**, turn it on and your tax-free invoices carry the legal notice.
- **Date of supply (Leistungsdatum):** enter it in the editor; if left empty, the PDF says it matches the invoice date.
- **What you need:** Steuernummer or USt-IdNr. and, for XRechnung, a contact with name, phone and email.
- **Collect:** card and **SEPA Direct Debit** in EUR, and automatic payments from the client portal.

## Which document Cord issues

| Situation | Document |
|---|---|
| Any plan | Rechnung with prefix `INV` (or the one you set), in German. |
| Correction or return | Commercial credit note with prefix `NCC`. |
| Electronic download | XRechnung 3.0 (UBL and CII), Factur-X EN 16931 (PDF/A-3 with the XML inside, also ZUGFeRD) and Peppol BIS 3.0. |

## What you need

- Your business **Steuernummer** or **USt-IdNr.** Cord validates the identifier.
- **For XRechnung:** a billing contact with name, phone and email, the client's city and postal code, and the IBAN of your payout account.
- **For a public-sector client:** their **Leitweg-ID** as the buyer reference.
- **For Peppol:** your participant identifier (electronic address) and your client's, and the buyer reference or purchase order.

## Set up your account

1. Under **Settings › Invoicing › Tax details › Invoice identity**, enter **Legal name**, **Steuernummer / USt-IdNr.**, address, **Postal code** and your **Invoice prefix**.
2. If you apply the small-business scheme, turn on **Small business (§ 19 UStG)**. The notice is only printed on invoices that charge no tax.
3. Under **European e-invoicing**, complete **Billing contact**, **Contact phone**, the **Electronic address** with its scheme and **Identifier**, the **Company registration number** and the **BIC / SWIFT**. The IBAN is the one under **Settings › Payments**.
4. Under **Attach to invoice emails**, keep the automatic option (PDF + XRechnung) or choose **PDF only**, **Factur-X PDF (replaces the PDF)** or **PDF + XRechnung XML**.
5. On each business client's profile, enter their electronic address and, for the public sector, their **Buyer reference (Leitweg-ID)**. Cord checks the Leitweg-ID check digit.

## Issue an invoice

In **Invoices › New invoice** (or **Issue invoice** from an approved quote), add items with their rate and, in the summary, the **Date of supply**: a date or the start and end of a period. If the client asks for it, fill in **Buyer reference** and **Purchase order**. Click **Issue and send**.

A sale to a company in another EU country with a VAT ID on both sides goes under reverse charge with its notice; a sale to a client outside the EU, without German USt. Choose the right 0% rate with your advisor.

## How you see the status

There is no registration with the authority. The invoice detail shows the business status and, under **E-invoice**, the formats available to download and, if something is missing, which data and where to fix it. An issued invoice keeps the data it was issued with: what you correct in Settings or on the client applies to the next invoices.

## Void or correct

- **Void:** **More actions › Void**, only if the invoice has no payments.
- **Credit note (Gutschrift / Rechnungskorrektur):** **More actions › Credit note**, which credits the total. Its XRechnung is issued as a credit note (381).
- A refund is a separate action, from **Payments**.

## Common issues

- **The email went out with the PDF only.** The invoice was missing data for the format. The detail tells you which; the next ones go out complete once you fix it.
- **"The Leitweg-ID is not valid".** It fails the check digit. Check the one your public client gave you.
- **Peppol is not available.** Your electronic address, your client's or the buyer reference is missing.
- **The invoice has a withholding.** No EN 16931 format has a place to declare it: that invoice has no electronic version.

## Not covered yet

- **Sending over the Peppol network** or to government portals: Cord generates the files and attaches them to the email.
- **Filing your USt. returns.**
- **Order-X** and the Factur-X EXTENDED profile.

## Related

- [European e-invoicing](/en/support/factura-electronica-europea)
- [SEPA Direct Debit and ACH](/en/support/domiciliacion-sepa-ach)
- [European e-invoicing in the documentation](https://docs.cordhq.app/en/docs/pagos/factura-electronica)
