---
title: "How to invoice in Mexico with Cord"
description: "CFDI 4.0 stamped with your CSD from Starter: requirements, setup, automatic payment complement, global invoice, replacement under reason 01 and what is not covered yet."
category: "Invoicing by country"
order: 1
---

In Mexico Cord stamps **CFDI 4.0** with the SAT using **your business's Digital Seal Certificate (CSD)**, from the **Starter** plan. On **Free** it issues **pro formas** (series `PRO`), which work for collecting payment but do not replace a CFDI.

**In short:**

- **Document:** income CFDI 4.0, expense CFDI (credit note), payment complement (type P CFDI) and global invoice to PUBLICO EN GENERAL.
- **What you need:** Starter or above, your RFC, tax regime and issuing zip code, and your CSD (`.cer`, `.key` and its password) uploaded under **Settings › Invoicing › Tax details**.
- **Allowance:** 30 tax-compliant invoices per month on Starter, 200 on Professional, 500 on Scale and 1,000 on Developer. Each CFDI counts once, including payment complements and the global invoice.
- **Payment complement:** automatic. An invoice that is not paid when stamped is issued PPD with payment method 99, and every payment you record or that comes in online issues its complement.
- **Void:** **More actions › Void** with the SAT reason (02, 03 or 04). To correct an invoice with another one, **Replace CFDI** (reason 01).
- **Not covered yet:** taxable 0% VAT, IEPS, the Foreign Trade complement, Carta Porte, payroll, the SAT advance-payment procedure and the automatic complement for a payment in another currency.

## Which document Cord issues

| Situation | Document |
|---|---|
| Free plan | Pro forma with series `PRO`. Not a CFDI. |
| Starter or above, with a CSD | CFDI 4.0 stamped under your RFC. In the editor you can choose **Pro forma** if you do not want to stamp. |
| Credit note on a CFDI | Expense CFDI (type E), relation 01 to the original UUID. |
| Payment on a PPD invoice | Payment complement (type P), one per payment. |
| Sales collected without the client asking for an invoice | Global invoice to PUBLICO EN GENERAL (XAXX010101000). |

The document type is fixed at issuance: upgrading does not turn a pro forma into a CFDI and downgrading does not turn a CFDI into a pro forma.

## What you need

- **Starter or above.** Integrated fiscal issuance starts on Starter.
- **Your CSD.** It is not the same as the e.firma: the CSD is used to seal invoices. You request it on the SAT portal with your e.firma, and the SAT does not charge for it. You need the `.cer` file, the `.key` file and the key password.
- **Your business tax details:** RFC, legal name as it appears on your tax certificate, tax regime and issuing zip code.
- **Your clients' details:** RFC, legal name, tax regime, tax zip code and CFDI use. Without them Cord uses defaults that may not match your client's certificate.

You do not need to buy stamps separately: stamping is included in your plan allowance. Above it, each additional CFDI is billed as overage on your subscription (MXN 3.00 on Starter and Professional, MXN 2.00 on Scale and MXN 1.50 on Developer). See [Your Cord subscription](/en/support/planes-suscripcion).

## Set up your account

1. Open **Settings › Invoicing › Tax details**.
2. Under **Tax identification**, enter **Tax ID (RFC)**, **Legal name**, **Tax regime**, **Issuing zip code** and, optionally, the **Default CFDI use**. Save.
3. Under **Digital Seal Certificate (CSD)**, choose your `.cer` file, your `.key` file and enter the **Key password**. Click **Upload CSD and connect**. When the status reads **CSD uploaded**, you are stamping under your RFC. The password is only used to decrypt the key when sealing and Cord does not store it.
4. Under **Settings › Quotes › Taxes**, review your rates. Your account starts with IVA 16%, IVA 8% border region, Exempt and four withholdings: IVA 10.6667%, ISR 1.25%, IVA 4% (freight) and IVA 6% (staffing services).
5. In **Products**, fill in each product's **E-invoicing (SAT, Mexico)** section with its product or service key and unit key. See [SAT product and unit keys](/en/support/catalogos-sat-claves).
6. On each client's profile, complete their tax details. If the client is abroad, pick their country: Cord issues the CFDI as to a foreign resident. See [Invoicing customers abroad](/en/support/facturas-extranjero).

## Issue a CFDI

**From an approved or paid quote:** open the quote and click **Stamp CFDI 4.0**. Cord copies the items, prices, discounts, taxes, withholdings and the exchange rate locked when quoting.

**Without a quote:** in **Invoices**, click **New invoice**, choose the client, add items and, under **Document type**, keep **CFDI 4.0**. In **CFDI details** you can set the **CFDI use** and the **Payment method**; on automatic, the use comes from the client's profile and the payment method from the payments. Click **Issue and send** or **Issue without sending**.

**Cord decides PUE or PPD:** if the invoice is already paid when stamped, it is issued **PUE** with the real payment method (card 04, transfer 03, cash 01). If not, it is issued **PPD** with method **99**, and every later payment gets its complement. An invoice to a client with the generic RFC is always PUE.

## The payment complement

When you record a payment with **Record payment** on a PPD invoice, when your client pays online, or when a quote payment moves to the invoice, Cord stamps that payment's complement and logs it in the invoice **Activity** ("Payment complement issued"). It is idempotent: one payment never gets two complements.

Cord does not issue it automatically in two cases, and writes it in the invoice activity so you handle it with your accountant:

- **Payment in another currency:** the complement needs the official exchange rate of the payment date.
- **Advance in the SAT's sense** (the good, the service or its price were not determined when collecting): the SAT requires its advance-payment procedure, which Cord does not issue. Review it with your accountant before stamping.

If a complement fails because of a stamping error, the activity reads "Payment complement pending" with the reason. Write to us to retry it. See [PPD invoices and payment complements](/en/support/complementos-de-pago).

## How you see the status with the SAT

- The invoice detail shows the **Tax folio** (UUID) and offers **Download PDF** and, under **More actions**, **Download XML**.
- An invoice labeled **Test document** was not issued with the SAT: it has no validity and your client's link does not allow paying it.
- If the SAT rejects the stamping, the invoice stays as a draft with the notice "The tax provider rejected this invoice" and a **Retry issuing** button.
- A cancellation shows its status (pending, verifying, accepted or rejected) with the **Check cancellation status** button.

## Void or correct

**Void:** on the detail page, **More actions › Void**. Cord asks for the SAT reason:

- **02 · Issued with errors, no relation:** the CFDI has an error and you will not replace it with another.
- **03 · The transaction did not take place.**
- **04 · Nominative transaction related to a global invoice:** only on the global invoice.

A request does not cancel the CFDI until the SAT confirms it. If the recipient has to accept it, they have up to three business days; with no answer, it is accepted. Meanwhile the invoice stays valid. An invoice with payments applied cannot be voided: Cord suggests a credit note.

**Replace (reason 01):** if the invoice has an error that is corrected by issuing another one, click **Replace CFDI**. Cord creates a draft with the same data; when you issue it, Cord relates it to the original (relation 04), moves the payments and balance to it, and requests the cancellation of the original under reason 01 with the replacement's UUID. It is not offered if the invoice has valid credit notes or issued payment complements, because the SAT does not allow cancelling a CFDI with valid related documents. See [Cancel CFDI with related documents](/en/support/cancelar-cfdi-relacionados).

**Credit note:** **More actions › Credit note** creates an expense CFDI for the invoice total, related to its UUID. See [Issue a credit note](/en/support/nota-de-credito).

## Global invoice

Sales you collected without the client asking for an invoice are documented under **Invoices › Global invoice**: choose frequency, month and year, Cord lists the collected quotes with no invoice of their own, and issues a single CFDI to PUBLICO EN GENERAL. See [General public invoicing and the global invoice](/en/support/facturar-publico-general).

## Common issues

- **My invoice came out as a pro forma.** Check your plan (Starter or above), that the CSD reads **CSD uploaded** and that you did not choose **Pro forma** under **Document type**.
- **My client says their CFDI is no good to them.** Check their tax regime, zip code and CFDI use on their profile. If their RFC, regime or zip code do not match their certificate, replace the CFDI with the right data.
- **Stamping is refused with the generic RFC.** An invoice to a client without an RFC uses XAXX010101000 and your issuing zip code as address: enter it under **Tax details**. The name "PUBLICO EN GENERAL" is only accepted on the global invoice.
- **An item is stamped with key 01010101.** It has no key of its own and no classified product. Pick its key on the line before issuing.
- **I cannot replace the invoice.** It has valid credit notes or payment complements. Void the notes first; if it has complements, write to us.

## Not covered yet

- **Taxable 0% VAT.** An item at 0% is declared **Exempt** on the CFDI. If your transaction needs the 0% rate (for example, export of services with 0% VAT), confirm it with your accountant and issue that CFDI outside Cord for now.
- **IEPS** and any tax classification other than IVA 16%, IVA 8% or exempt.
- **Foreign Trade complement** for the definitive export of goods.
- **Carta Porte, payroll, donation receipts** and other complements. See [Issue a transfer CFDI (Carta Porte)](/en/support/cfdi-traslado).
- **Automatic complement** for a payment in another currency, and the SAT **advance-payment procedure** (advance CFDI and its application).

## Related

- [Issue CFDI 4.0 from a quote or from scratch](/en/support/emitir-cfdi)
- [PPD invoices and payment complements](/en/support/complementos-de-pago)
- [Void invoices and check cancellations](/en/support/cancelar-facturas)
- [Invoicing by country in the documentation](https://docs.cordhq.app/en/docs/pagos/facturacion)
- [Digital Seal Certificate in the documentation](https://docs.cordhq.app/en/docs/cuenta/csd)
