---
title: "How to invoice in Peru with Cord"
description: "Commercial invoice today; electronic invoice sent directly to SUNAT being turned on: SEE - Del Contribuyente enrollment, secondary SOL user, series, IGV, withholding, credit note and what is not covered."
category: "Invoicing by country"
order: 12
---

In Peru the electronic invoice is sent to **SUNAT**, which answers with a receipt (CDR). Cord has the direct rail with SUNAT built as **SEE - Del Contribuyente** (without an OSE or PSE), signed with your business's certificate, but **it is being turned on**: today your invoices are issued as a **commercial invoice without tax validity**. If you need to invoice with SUNAT from Cord, write to us to enable it on your account.

**In short:**

- **Today:** commercial invoice and commercial credit note, on every plan (10 per month on Free, unlimited from Starter). They are not sent to SUNAT.
- **Being turned on:** electronic invoice (01) and credit note (07). Under **Settings › Invoicing › Tax profile › Electronic invoicing with SUNAT** it reads **Coming soon**.
- **What you will need:** Starter or above, your RUC, enrolling as an electronic issuer from your own systems (SEE - Del Contribuyente), a **digital certificate** issued to your RUC and registered with SUNAT, a **secondary SOL user** with the document-sending profile and an **`F###` series** reserved for Cord.
- **Invoices only:** a client without a RUC would need a **sales receipt (boleta de venta)**, which Cord does not issue yet.
- **Void:** Cord does not file cancellation notices (comunicación de baja): an invoice is corrected with a **credit note**, cancellation if it credits the total or reduction if it credits part.
- **Collect:** in Peru online payment is through **Mercado Pago**; Cord Payments is not available.

## Which document Cord issues

| Situation | Document |
|---|---|
| Today, any plan | Commercial invoice (no tax validity). |
| With SUNAT active (Starter or above), client with a RUC | Electronic invoice (01) in your `F###` series. |
| Client abroad | Export invoice (operation 0200 goods or 0201 services). |
| With SUNAT active, on Free or choosing **Commercial invoice** | Pro forma with the `PRO` series: it is used to collect, but it is not an electronic document. |
| Correction | Credit note (07) in the same series, with its own numbering. |

## What you will need

- **Enrollment** as an electronic issuer from your own systems (SEE - Del Contribuyente) in SUNAT Operaciones en Línea.
- A **digital certificate** issued to your RUC and registered with SUNAT. It is issued by a certification authority and its cost is set by that authority.
- A **secondary SOL user** with the electronic document-sending profile.
- An **`F###` series** reserved for Cord. If you already issued in that series outside Cord, the last number issued, to continue the numbering.

## Set up your account (once it is turned on)

1. Under **Invoice identity**, enter your legal name and your **RUC**.
2. Under **Electronic invoicing with SUNAT**: **Invoice series**, **What you sell** (goods or services), **Last invoice number issued outside Cord**, **Last credit note number issued outside Cord**, **Items without IGV are** (**Exempt (exonerado)** or **Not subject (inafecto)**), **Establishment code** and, optionally, **Trade name**.
3. Tick what applies to your business: small restaurant or hotel business with reduced IGV, goods or services subject to the SPOT withholding system (detracciones), IGV perception agent, or **My customers do not withhold IGV from me**. Under **RUC of customers that are IGV withholding agents**, list their RUCs. Click **Save SUNAT settings**.
4. Under **Secondary SOL user**, enter the **User (without the RUC)** and the **Password**, and click **Save SOL user**. Cord tests it with a query that has no effect.
5. Under **Digital certificate**, upload your `.p12`/`.pfx` (or certificate and key) and click **Upload certificate**.

## IGV, withholding and payment terms

- **IGV** at 18% per item. 0% items go as **exonerado** or **inafecto**, according to what you set in Settings; Cord does not guess it. An invoice carries **a single IGV rate**.
- **Small restaurants and hotels:** with the regime declared, IGV of 10.5% in 2026 and 15% in 2027.
- **IGV withholding:** your client applies it if they are a withholding agent. On a taxable credit sale above PEN 700 to a client on your list, the invoice carries the 3% withholding and the outstanding net amount deducts it. In another currency the document's locked exchange rate to soles is required.
- **Payment terms:** cash, or credit with the outstanding net amount and one installment with its due date. The invoice also prints the amount in words.
- **Detracciones and perceptions:** not modeled. If you tick them in Settings, the rail is not turned on for your account, so nothing is issued half-done.

## How you see the status

The invoice detail has a **SUNAT** panel:

- **Accepted by SUNAT**, with its CDR. If SUNAT accepted it with observations, they are recorded.
- **Waiting for SUNAT to confirm:** if the response was lost, Cord **queries** SUNAT; it never resends the invoice in production.
- **SUNAT did not accept the invoice**, with the reason. A rejection uses up the number; the next attempt takes another.

The PDF carries the SUNAT QR code, the summary value and the printed-representation legend. **More actions › Download XML** delivers exactly the XML SUNAT accepted; your client can also download it from their link.

## Void or correct

- **Void:** Cord does not file cancellation notices, because it delivers the invoice to your client when issuing it. Use **More actions › Credit note**: type 01 (cancellation) if it credits the whole invoice, or 09 (reduction in value) if it credits part.
- A draft is corrected in the editor before issuing.

## Common issues

- **The invoice is refused because the client has no RUC.** A client without a RUC (a final consumer with a DNI) needs a sales receipt, which Cord does not issue yet. Add the RUC on their profile or issue the receipt outside Cord.
- **Rejection because of the certificate or SOL user.** Check that the certificate is issued to your RUC and registered with SUNAT, and that the secondary SOL user has the sending profile.
- **SUNAT rejects because of the rate.** An invoice cannot mix IGV rates: split it.
- **The rail does not turn on.** You ticked detracciones or perceptions, which Cord does not issue yet.

## Not covered yet

- **Sales receipt** and daily summary, **cancellation notice**, **debit note** and **dispatch guide**.
- **Detracciones, perceptions**, advances, free transactions, ISC, ICBPER and IVAP.
- **Several installments** per invoice.

## Related

- [Collect with Mercado Pago](/en/support/cobrar-mercado-pago)
- [Set up tax withholdings](/en/support/retenciones-impuestos)
- [Invoicing by country in the documentation](https://docs.cordhq.app/en/docs/pagos/facturacion)
