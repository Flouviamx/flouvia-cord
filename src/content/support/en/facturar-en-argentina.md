---
title: "How to invoice in Argentina with Cord"
description: "Commercial invoice today; electronic invoice A, B or C with an ARCA CAE being turned on: certificate and point of sale, VAT status, credit note and what is not covered."
category: "Invoicing by country"
order: 10
---

In Argentina every invoice must be authorized by **ARCA**, which assigns its number and its **CAE**. Cord has the direct rail with ARCA built (electronic invoicing web services, without an intermediary), but **it is being turned on**: today your invoices are issued as a **commercial invoice without tax validity**. If you need to invoice with ARCA from Cord, write to us to enable it on your account.

**In short:**

- **Today:** commercial invoice and commercial credit note, on every plan (10 per month on Free, unlimited from Starter). They are not submitted to ARCA.
- **Being turned on:** invoice A, B or C with CAE, credit note and the ARCA QR code on the PDF. Under **Settings › Invoicing › Tax details › Electronic invoicing with ARCA** it reads **Coming soon**.
- **What you will need:** Starter or above, your CUIT, an **ARCA digital certificate** associated with the electronic invoicing service and a **"Factura electrónica - Web services" point of sale**.
- **Cord decides the class** from your VAT status and your client's: monotributo and exempt businesses issue C, without itemized VAT.
- **Void:** a document with a CAE is not voided: it is adjusted with a **credit note** of the same class.
- **Collect:** in Argentina online payment is through **Mercado Pago**; Cord Payments is not available.

## Which document Cord issues

| Situation | Document |
|---|---|
| Today, any plan | Commercial invoice (no tax validity). |
| With ARCA active (Starter or above) | Invoice A, B or C with CAE, its expiry and the ARCA QR code. |
| With ARCA active, on Free or choosing **Commercial invoice** | Pro forma with the `PRO` series: it is used to collect, but it is not a valid document before ARCA. |
| Correction | Credit note of the same class, associated with the invoice. |

On a **B** invoice the PDF prints the tax transparency legend; to a final consumer, "A CONSUMIDOR FINAL"; on an **A** to a monotributista, the legend about their tax credit.

## What you will need

- Your business **CUIT** under **Invoice identity**.
- **ARCA digital certificate.** You generate it with your clave fiscal in ARCA's digital certificate administration, from a private key of your own, and associate it with the electronic invoicing service (`wsfe`). ARCA does not charge for it. Cord accepts the certificate plus key (`.crt` and `.key`) or a `.p12`/`.pfx` file.
- A **point of sale** created in ARCA as **"Factura electrónica - Web services"**, exclusive to Cord.
- Your **VAT status** and what you sell (products, services or both).

## Set up your account (once it is turned on)

1. Under **Invoice identity**, enter your legal name and your **CUIT**.
2. Under **Electronic invoicing with ARCA**: **Point of sale (web service)**, **VAT status**, **What you sell** and, optionally, **Gross income tax number (optional)** and **Start of activities (optional)**. Click **Save ARCA settings**.
3. Under **ARCA certificate**, choose the format (**Certificate + private key** or **.p12 / .pfx file**), upload the files, enter the **Key password (if it has one)** and click **Upload certificate**. The certificate must be issued to your CUIT and valid.
4. On each Argentine client's profile, complete **Customer's VAT status**. Without it, a client with no CUIT is treated as a final consumer; one with a CUIT needs the status entered.
5. Review your catalog under **Settings › Quotes › Taxes**: your account starts with IVA 21%, 10.5%, 27% and Exempt.

## How Cord picks the class and the recipient

- **Class A, B or C** from your status and your client's (table of RG 5616/2024). Monotributo and exempt issue **C**.
- **Recipient:** with CUIT, with DNI or as an unidentified final consumer. The unidentified final consumer only applies to B and C and below ARS 10,000,000.
- **Services:** the invoice reports the billed period and the payment due date.
- **Another currency:** the document's locked rate is used if your ledger currency is ARS; otherwise ARCA's official rate. Without a rate, it is not sent.
- **Document discount:** it travels as a bonus, with the net and VAT already discounted.

## How you see the status

The invoice detail has an **ARCA** panel:

- **Authorized by ARCA**, with the number, the CAE and its expiry.
- **Waiting for ARCA to confirm**: if the response was lost, Cord **queries** ARCA for the last authorized document; it never requests another CAE for the same invoice.
- **ARCA did not authorize the invoice**, with the reason.

In the test environment (homologación) the number carries the `H-` prefix and the PDF says it has no tax validity.

## Void or correct

- **Void:** a document with a CAE is not voided. Use **More actions › Credit note**: it is issued with the same class, recipient, status, concept and currency as the invoice, and cites it as the associated document.
- A draft without a CAE is corrected in the editor.

## Common issues

- **"Missing: a certificate issued to your CUIT".** The certificate belongs to another CUIT. Generate one for yours.
- **"Missing: a valid certificate".** The certificate expired. Generate another one in ARCA and upload it.
- **ARCA rejects the point of sale.** Check that it is of the "Factura electrónica - Web services" type and that no other system uses it.
- **The client with a CUIT has no status.** Enter it on their profile; Cord does not guess it.

## Not covered yet

- **Export invoice E** (client outside Argentina) and **MiPyME Electronic Credit Invoice**.
- **Uncategorized** recipient, **withholdings**, **perceptions and other taxes**, **CAEA** and **M** documents.

## Related

- [Collect with Mercado Pago](/en/support/cobrar-mercado-pago)
- [Issue a credit note](/en/support/nota-de-credito)
- [Invoicing by country in the documentation](https://docs.cordhq.app/en/docs/pagos/facturacion)
