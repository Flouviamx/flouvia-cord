---
title: "How to invoice in Colombia with Cord"
description: "Commercial invoice today; electronic sales invoice with prior validation by the DIAN being turned on: enablement as your own software, test set, numbering resolution, certificate, credit note and what is not covered."
category: "Invoicing by country"
order: 9
---

In Colombia the electronic sales invoice needs **prior validation by the DIAN**. Cord has the direct rail with the DIAN built as **each business's own software** (without a technology provider), but **it is being turned on**: today your invoices are issued as a **commercial invoice without tax validity**. If you need to invoice with the DIAN from Cord, write to us to enable it on your account.

**In short:**

- **Today:** commercial invoice and commercial credit note, on every plan (10 per month on Free, unlimited from Starter). They are not submitted to the DIAN.
- **Being turned on:** electronic sales invoice and credit note with prior validation (Technical Annex 1.9). Under **Settings › Invoicing › Tax details › Electronic invoicing with the DIAN** it reads **Coming soon**.
- **What you will need:** Starter or above, your NIT with its check digit, enabling yourself on the DIAN portal as **own software** with a PIN, passing the **test set**, a **numbering resolution** associated with the software and a **digital signature certificate** from an ONAC-accredited entity.
- **Void:** a validated invoice is not voided: it is adjusted with a **credit note** (cancellation if it credits the total, reduction if it credits part).
- **Collect:** in Colombia online payment is through **Mercado Pago**; Cord Payments is not available.

## Which document Cord issues

| Situation | Document |
|---|---|
| Today, any plan | Commercial invoice (no tax validity). |
| With the DIAN active (Starter or above) | Electronic sales invoice with CUFE and QR code. |
| With the DIAN active, on Free or choosing **Commercial invoice** | Pro forma with the `PRO` series: it is used to collect, but it is not an electronic sales invoice. |
| Correction | Credit note with CUDE, linked to the invoice. |

## What you will need

- **Enablement with the DIAN.** On the DIAN portal, **Registro y habilitación › Documentos electrónicos › Factura electrónica**, you choose the **Software propio** (own software) operating mode, name the software and set a 5-digit **PIN**. The DIAN assigns the **software ID** and a **test set** (TestSetId, test range with its prefix, resolution, validity and technical key).
- A **numbering resolution** for production, which you request from the DIAN and **associate with your software**.
- A **digital signature certificate** for e-invoicing issued to your NIT by an ONAC-accredited certification authority, with its full chain. Its cost is set by that authority.
- Enablement with the DIAN has no cost.

## Set up your account (once it is turned on)

1. Under **Invoice identity**, enter your legal name, your **NIT** with its check digit and your address.
2. Under **Electronic invoicing with the DIAN**, complete **Your business in the RUT**: **Type of taxpayer**, **VAT responsibility**, **Municipality of your tax address**, the **Tax responsibilities (box 53 of the RUT)** and, optionally, **Trade name**, **Commercial registration** and **Reception email registered with the DIAN**.
3. Under **Software and numbering**: **Software ID**, **Software PIN (5 digits)**, the range (resolution number, **Prefix**, **From number**, **To number**, **Valid from**, **Valid until**), the **Technical key of the range**, the **Credit note prefix** and whether **Your 0% sales are** **VAT exempt** or **Excluded from VAT**. Click **Save DIAN settings**. The PIN and the technical key are stored encrypted and never shown again.
4. Under **Signing certificate**, upload your `.p12`/`.pfx` (or certificate and key) with the intermediate and root chain if it is not in the file, and click **Upload certificate**.
5. Under **Test set (enablement)**, enter the **TestSetId** and the number of invoices, credit notes and debit notes your set asks for, and click **Send test set**. **Check result** queries each submission. When the DIAN accepts it, you sync to production from its portal.
6. In production, enter the real resolution and click **Get from the DIAN** to store the range's technical key.
7. On each client's profile, complete **Electronic invoicing data (DIAN)**: document type, individual or legal entity and responsibilities. A domestic client without an ID is invoiced as a **final consumer**.

## Taxes and withholdings

- **VAT** per line at 19%, 5%, 16% or 0%. 0% lines go as exempt or excluded according to your choice; without it, an invoice with 0% lines is not sent.
- **INC, ICUI, ICA and health taxes** are not reported yet: a line with those taxes is rejected before sending.
- **Withholdings:** the one calculated on VAT is reported as **ReteIVA** and the income one (your **ReteFuente** profile) as **ReteRenta**. A withholding that cannot be classified with certainty is not reported to the DIAN, but still reduces the total in Cord.
- **Another currency:** an invoice outside COP declares the document's locked rate to COP; without it, or if your ledger currency is not COP, it is not sent.

## How you see the status

The invoice detail has a **DIAN** panel:

- **Validated by the DIAN**, with the CUFE.
- **Waiting for the DIAN to confirm**: Cord **queries** by the CUFE, it never resends another document.
- **The DIAN rejected the document**, with the reason. A rejection frees its number.

The PDF carries the CUFE in the footer of every page, the lookup QR code and the numbering authorization. **More actions › Download XML** delivers the container the DIAN signs (AttachedDocument), and the invoice email carries it in a `.zip` together with the PDF. **Settings** warns you when fewer than 50 numbers (or 5%) or fewer than 30 days of the resolution's validity remain.

## Void or correct

- **Void:** an invoice validated by the DIAN is not voided. Use **More actions › Credit note**: if it credits the total it carries the cancellation concept; if it credits part, the reduction concept. The note carries the invoice's buyer, currency and rate.
- **Before validation**, a draft is corrected in the editor.

## Common issues

- **"The numbering range is used up" or "the resolution expired".** Request a new resolution from the DIAN, associate it with the software and enter it in Cord.
- **Certificate rejection.** Check that it comes from an ONAC-accredited entity, is issued to your NIT, has digital signature and non-repudiation, and includes the full chain.
- **An invoice with 0% lines is not sent.** Choose in Settings whether your 0% sales are exempt or excluded.
- **The client has no NIT.** They go as a final consumer; if they have a cédula, enter it on their profile.

## Not covered yet

- **Export** invoices and **contingency** invoices.
- **INC, ICUI, ICA**, reported ReteICA, **AIU**, mandates, tips and document charges.
- **Support document**, **electronic payroll** and **RADIAN events** (acknowledgement and acceptance).
- **Debit note** outside the test set.

## Related

- [Collect with Mercado Pago](/en/support/cobrar-mercado-pago)
- [Set up tax withholdings](/en/support/retenciones-impuestos)
- [Invoicing by country in the documentation](https://docs.cordhq.app/en/docs/pagos/facturacion)
