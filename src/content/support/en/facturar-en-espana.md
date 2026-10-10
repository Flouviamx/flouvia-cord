---
title: "How to invoice in Spain with Cord"
description: "Pro forma today; Verifactu and business-to-business e-invoicing being turned on: electronic certificate, IRPF, IGIC and IPSI, exemption causes, Facturae, deadlines and how a record is corrected."
category: "Invoicing by country"
order: 5
---

In Spain an invoice has to come from a **verifiable invoicing system (Verifactu)**: each invoice creates a record chained to the previous one that is sent to the AEAT. Cord has Verifactu built and validated against the official schemas, but **registration with the AEAT is being turned on**: today accounts in Spain issue **pro formas** (series `PRO`), which do not replace an invoice. If you need to issue with Verifactu from Cord, write to us to enable it on your account. Meanwhile, use your current invoicing system for the tax document and Cord to quote, collect and follow up.

**In short:**

- **Today:** pro forma with series `PRO`, on every plan (10 per month on Free, unlimited from Starter). It has no hash, QR code or AEAT record, and its PDF says so.
- **Being turned on:** Verifactu (registering each invoice with the AEAT) and business-to-business e-invoicing through the AEAT public solution. Under **Settings › Invoicing › Tax details**, the **Verifactu** section reads **Certificate saved, registration not active yet** even after you upload your certificate.
- **What you will need:** Starter or above, your NIF and an **electronic certificate** (`.p12` or `.pfx`). The FNMT issues the individual certificate for free; a company representative certificate has a cost set by the provider.
- **Legal deadlines:** Verifactu is mandatory from 1 January 2027 for corporate income tax payers and from 1 July 2027 for everyone else. Business-to-business e-invoicing, from 6 October 2027 if you invoice more than 8 million euros a year and from 6 October 2028 for everyone else.
- **Correct:** a chained record is not edited. It is corrected with a new record (correction or cancellation) or with a corrective invoice.
- **Collect:** card through Cord Payments in EUR, SEPA Direct Debit and automatic payments.

## Which document Cord issues

| Situation | Document |
|---|---|
| Today, any plan | Pro forma with series `PRO`. |
| With Verifactu active (Starter or above, valid certificate) | Invoice with a Verifactu record: chained hash, tax QR code and the VERI\*FACTU legend. |
| Client without a tax ID (with Verifactu) | Simplified invoice (F2). |
| Correction (with Verifactu) | Corrective invoice (R1 by differences), with its own record. |

A pro forma has no e-invoice version: Facturae, Factur-X, XRechnung and Peppol are generated from invoices, so in Spain they become available once Verifactu is active. See [European e-invoicing](/en/support/factura-electronica-europea).

## What you will need

- **Starter or above.** Integrated fiscal issuance starts on Starter.
- **Your NIF** under **Invoice identity**. Cord validates NIF, NIE and CIF with their check digit.
- **Your business's electronic certificate** as `.p12` or `.pfx`, with its password. If the certificate belongs to a representative, Cord accepts it with a warning: that representative needs authority from your business.
- The AEAT does not charge for receiving Verifactu records, and the public solution for business-to-business invoices is free.

## Set up your account

1. Under **Settings › Invoicing › Tax details › Invoice identity**, enter **Legal name**, **NIF / CIF**, **Address**, **City**, **State or region**, **Postal code** and your **Invoice prefix**. Spain numbers by series **and** fiscal year: the year is attached to the prefix.
2. In the **Verifactu** section, choose your electronic certificate, enter the **Certificate password** and click **Upload certificate**. Cord checks the password and reads the expiry date. The **Responsible declaration of the invoicing system** is linked right there.
3. Under **Settings › Quotes › Taxes**, review your catalog. Your account starts with IVA 21%, 10% and 4%, Exempt, the exemption causes **Exportación (art. 21)**, **Entrega intracomunitaria (art. 25)**, **Exenta art. 20** and **Inversión del sujeto pasivo**, and the withholdings **Retención IRPF 15%** and **Retención IRPF 7% (nuevo autónomo)**. If your business is in the Canary Islands, the catalog seeds IGIC; in Ceuta and Melilla, only exempt options.
4. If you invoice companies that process invoices automatically, complete the **European e-invoicing** section (contact, electronic address and what to attach to the email).

## Exemption causes

A 0% line carries its cause: the one you chose in the catalog (export, intra-community supply, exempt under art. 20 or reverse charge) is frozen on the line and travels to the record and the PDF, which cites the legal provision. With the generic **Exempt**, Cord derives the cause from the client: a business client in the EU with a VAT number, or a client outside the EU, is reported as not subject; a client in Spain, as exempt.

## How you see the status (with Verifactu active)

The invoice detail has a **Verifactu** panel:

- **Waiting to be sent to the AEAT:** the record is already chained. Sending happens after issuance, without blocking the invoice.
- **Registered with the AEAT.**
- **Registered with errors**, **Rejected by the AEAT** or **Could not be sent to the AEAT:** with the AEAT code and reason, and the **Correct and resend** button.

**Settings › Invoicing › Tax details** lists the **Invoices to correct**. The PDF carries the tax verification QR code at the top of the first page.

## Void or correct

- **Void a pro forma:** **More actions › Void**, if it has no payments.
- **With Verifactu:** voiding creates a **cancellation record** added to the chain; the previous one is neither deleted nor edited.
- **Correct:** **More actions › Credit note** issues a corrective invoice by differences, with its own record.
- **Rejected record:** **Correct and resend** creates a correction record; there you can set the exemption cause of 0% items. Amounts never change.

## Business-to-business e-invoicing

The law will require businesses and professionals to issue and receive e-invoices between them, sent through the **AEAT public solution**. Cord has it built, but it reads **Coming soon** under **Settings › Invoicing › Tax details › E-invoicing between businesses (AEAT)**: the AEAT has not yet published the technical specification of its service. When it does, Cord will turn it on with the same Verifactu certificate and will report each invoice's payments. Invoices with IRPF will be sent once the AEAT publishes how they are declared; until then, download them as Facturae.

## Common issues

- **I uploaded my certificate and I still issue pro formas.** That is expected while AEAT registration is being turned on. Write to us if you need it now.
- **The certificate is not accepted.** Check that it is `.p12` or `.pfx`, that the password is the file's and that it has not expired.
- **"Disconnect" is not allowed.** With unsent records or records from the current fiscal year, Cord does not let you remove it.
- **Invoice with IRPF.** Factur-X, XRechnung and Peppol have nowhere to declare a withholding: that invoice is only available as Facturae.

## Not covered yet

- **AEAT registration** (Verifactu) and **business-to-business e-invoicing:** being turned on.
- **IGIC, IPSI and the equivalence surcharge** in the Verifactu record: rejected at issuance.
- **The Basque Country and Navarre** (TicketBAI and the foral systems).
- **Submitting the Facturae to FACe** and the DIR3 codes of public administrations.

## Related

- [European e-invoicing](/en/support/factura-electronica-europea)
- [SEPA Direct Debit and ACH](/en/support/domiciliacion-sepa-ach)
- [Set up tax withholdings](/en/support/retenciones-impuestos)
- [European e-invoicing in the documentation](https://docs.cordhq.app/en/docs/pagos/factura-electronica)
