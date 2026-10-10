---
title: "Cancel CFDI with related documents"
description: "What to check before cancelling or replacing a CFDI that has credit notes, payment complements, a replacement in progress or is part of a global invoice."
category: "Invoicing"
---

This applies to organizations in **Mexico**. The SAT **does not allow cancelling a CFDI that has valid related documents**: if you try, it marks it "Not cancellable". Before voiding or replacing an invoice, check which documents depend on it.

**In short:**

| The invoice has… | What to do |
|---|---|
| Valid credit notes | Void the credit notes first; then the invoice. Cord does not void or replace the invoice while they exist. |
| Issued payment complements | **Replace CFDI** is not available from the app: write to soporte@flouvia.com to replace it. |
| Payments applied | It is not voided: use **More actions › Credit note**. The payments stay on the invoice. |
| A replacement in progress | Continue it with **Continue the replacement**; another one is not created. |
| Sales in a global invoice | Cancel the global invoice under reason 04 and issue it again without that sale. |

## Credit notes

An issued credit note is an expense CFDI related to the invoice's UUID. While it is valid:

- **Voiding** the invoice is rejected until the note is resolved.
- **Replace CFDI** is not offered: the detail says "To replace it, first void its credit notes".

Void the credit note from its own detail (**More actions › Void**) and, once the SAT confirms its cancellation, go back to the invoice.

## Payment complements

Each payment on a PPD invoice carries a payment complement related to it. To cancel or replace that invoice, its complements would have to be cancelled first, and Cord does not do that from the app yet. The invoice detail says so: "It has payment complements issued… Write to soporte@flouvia.com to replace it". See [PPD invoices and payment complements](/en/support/complementos-de-pago).

## Payments applied

An invoice with payments is not voided, because the money already came in. If the amount must be corrected, issue a **credit note**; if money must also be returned, make the refund separately from **Payments**.

## Replacement in progress

When you click **Replace CFDI**, Cord creates a draft linked to the original. There can only be one live replacement per invoice: if it already exists, the detail offers **Continue the replacement**. While the original's cancellation waits for the recipient's acceptance, both CFDI stay valid; if the recipient rejects it, retry the cancellation or, if the replacement is not needed, cancel it under reason 02. Voiding a replacement without payments returns the balance to the original.

## Global invoice

A sale included in a valid global invoice cannot be invoiced separately. If a client asks for their invoice:

1. Open the global invoice and use **More actions › Void** with reason **04 · Nominative transaction related to a global invoice**.
2. Once the cancellation is confirmed, its sales are free again. Click **Issue the period's global invoice again** and untick the client's sale.
3. Issue the client's invoice from their quote.

The global invoice is not replaced: it is corrected by cancelling it. See [General public invoicing and the global invoice](/en/support/facturar-publico-general).

## Related

- [Void invoices and check cancellations](/en/support/cancelar-facturas)
- [Issue a credit note](/en/support/nota-de-credito)
- [How to invoice in Mexico with Cord](/en/support/facturar-en-mexico)

> Availability of the September improvements is being verified. See [scope and release status](https://docs.cordhq.app/en/docs/pagos/mejoras-confiabilidad); contact support if a described action is not yet shown in your account.
