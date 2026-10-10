---
title: "Void invoices and check cancellations"
description: "When an invoice can be voided, the SAT reason and replacement in Mexico, and what each country does: credit note where the authority does not cancel, cancellation deadlines and cancellation records."
category: "Invoicing"
---

## Voiding and crediting are different actions

**Voiding** changes an invoice's validity. A **credit note** is another document that reduces the creditable amount of the original. Neither one returns money: a refund is made separately, from **Payments**.

In Cord, open **Invoices**, go to the document and use **More actions › Void**. The option only appears on an open invoice **with no payments applied**; if it already has payments, use **More actions › Credit note**. Cord also requires resolving linked credit notes before voiding the original invoice, and does not void while a payment is on its way (for example, a bank debit that is processing). These are Cord's workflow rules; they do not replace the tax review of each case.

## Mexico: reason, request and confirmation

When you void a valid CFDI, Cord asks for the reason the SAT requires:

- **02 · Issued with errors, no relation:** it has an error and you will not issue another in its place (for example, you issued it twice or to the wrong client).
- **03 · The transaction did not take place:** the sale or service did not happen.
- **04 · Nominative transaction related to a global invoice:** only for a global invoice from which a client asked for their own invoice.
- **01 · Issued with errors, with relation:** not chosen here. Use **Replace CFDI**.

Click **Request cancellation**. Sending the request does not mean the CFDI is cancelled. Cord keeps its status and only marks the invoice void once the SAT confirms it:

- **Pending or verifying:** the invoice stays valid. If the recipient has to accept, they have up to three business days; with no answer, it is accepted.
- **Rejected, expired or unconfirmed:** the invoice is not marked void.
- **Accepted:** the invoice becomes void.

Use **Check cancellation status** on the detail to review a request. Checking is manual.

### Replace a CFDI

If the invoice has an error that must be corrected with another one, use **Replace CFDI** on its detail. Cord creates a draft with the same data for you to correct. When you issue it, the new CFDI is related to the original (relation 04), its payments and balance move to the new invoice and Cord requests the cancellation of the original under reason 01 with the replacement's tax folio. If the recipient rejects the cancellation, both CFDI stay valid: retry the cancellation or, if the replacement is not needed, cancel it under reason 02.

Replacing is not offered on an invoice with valid credit notes or issued payment complements: the SAT does not allow cancelling a CFDI with valid related documents. See [Cancel CFDI with related documents](/en/support/cancelar-cfdi-relacionados).

## What happens in each country

| Country | When you click Void |
|---|---|
| Mexico | Cancellation request to the SAT with its reason (above). |
| Spain with Verifactu active | A **cancellation record** is chained and sent to the AEAT; the original record is not deleted. |
| Brazil, NFS-e active | Cancellation event with the national NFS-e system, within the deadline and amount your municipality allows. |
| Brazil, NF-e active | Cancellation with the SEFAZ, within 24 hours of the authorization. |
| Argentina (ARCA), Peru (SUNAT), Chile (SII) and Colombia (DIAN) active | An authorized document **is not voided**: Cord asks you for a **credit note**. |
| France, invoice already transmitted through the platform | It is not voided with the platform: it is corrected with a credit note. |
| Elsewhere, and any commercial invoice or pro forma | The invoice is voided in Cord. It is not submitted to any authority. |

Voiding a commercial invoice locally does not prove that a tax authority received or accepted a cancellation. Tax-authority registration in Spain, Brazil, Argentina, Peru, Chile, Colombia and France is being turned on; see each country's guide under [Invoicing by country](/en/support/category/facturacion-por-pais).

## Common issues

- **I do not see Void.** The invoice has payments applied, is a draft or is already void. With payments, use the credit note.
- **"For reason 01, replace the invoice first".** Reason 01 is only used with **Replace CFDI**.
- **The invoice is still valid after requesting the cancellation.** The SAT or the recipient has not confirmed it yet. Click **Check cancellation status**.

> Availability of the September improvements is being verified. See [scope and release status](https://docs.cordhq.app/en/docs/pagos/mejoras-confiabilidad); contact support if a described action is not yet shown in your account.
