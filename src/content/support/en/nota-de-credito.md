---
title: "Issue a credit note"
description: "Credit an issued invoice: how it is created from the detail page, why it starts at the full amount, which document is issued in each country and its effect on the balance."
category: "Invoicing"
---

A **credit note** credits an issued invoice without cancelling it: for example, a post-sale discount, a return or an amount error. It reduces what your client owes you; it **does not return money** by itself.

**In short:**

- **Where:** on the detail of an **issued** invoice, **More actions › Credit note**.
- **For the total:** from the app the note is created for the invoice's **total**, with the same items, rates and withholdings. To credit only part of it, today it is done through the API with the partial amount.
- **Issued from its detail:** Cord takes you to the note's draft and you issue it with **Issue credit note**. It is not sent to the client on its own.
- **Effect on the balance:** only an issued, non-voided note reduces the balance. If the invoice was already paid, an amount to refund remains, which is handled separately.
- **Each country issues its own document:** expense CFDI in Mexico, corrective invoice in Spain with Verifactu, credit note with its authorization on the LatAm rails, and a commercial credit note elsewhere.

## Issue a credit note

1. Open **Invoices** and go to the original invoice. Only an **issued** invoice supports a credit note.
2. Click **More actions › Credit note**.
3. Cord creates the note as a **draft** for the invoice total and takes you to its detail.
4. Review it and click **Issue credit note**.
5. Send it to your client with **Send to client** from its detail.

The note keeps the original invoice's breakdown: it is not edited in the invoice editor. For a different amount, the API accepts the amount you want to credit; a partial amount that does not add up after rounding is rejected. The sum of valid notes cannot exceed the invoice total.

## Which document is issued in each country

| Country | Credit note |
|---|---|
| Mexico | Expense CFDI (type E), use G02 (S01 for a foreign client), relation 01 to the original UUID. |
| Spain with Verifactu active | Corrective invoice by differences, with its own chained record. |
| Argentina (ARCA) | Credit note of the same class, recipient, status and currency, with the invoice as the associated document. |
| Peru (SUNAT) | Credit note type 01 (cancellation) if it credits the total, or 09 (reduction) if it credits part. |
| Chile (SII) | Credit note (61) that cancels the total or corrects amounts. |
| Colombia (DIAN) | Credit note with the cancellation concept (total) or reduction concept (partial). |
| Brazil (NFS-e or NF-e) | Does not exist: the NFS-e is voided and another is issued; a return of goods is another NF-e that Cord does not issue yet. |
| Elsewhere, and commercial invoices | Commercial credit note with prefix `NCC`, linked to the invoice. |

Tax-authority registration in Spain and LatAm is being turned on; meanwhile, the note is commercial. See [Invoicing by country](/en/support/category/facturacion-por-pais).

## Effect on the balance

Only an issued, non-voided note reduces the balance; the draft does not change it. The note starts with a zero collectible balance: it is not new debt and cannot be charged. If the invoice was already paid, the detail shows the amount to refund; issuing the note does **not** execute that refund. See [how the balance is calculated](/en/support/saldo-pagos-creditos).

## Void a credit note

An issued credit note is voided from its own detail with **More actions › Void**, like an invoice. Before voiding the original invoice you must resolve its valid notes.

> Availability of the September improvements is being verified. See [scope and release status](https://docs.cordhq.app/en/docs/pagos/mejoras-confiabilidad); contact support if a described action is not yet shown in your account.
