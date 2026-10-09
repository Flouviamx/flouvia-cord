---
title: "Cancel CFDI with related documents"
description: "Review payments, credit notes and status before voiding."
category: "Invoicing"
---


## Voiding and crediting are different actions

**Voiding** changes an invoice's validity. A **credit note** is a separate document
that reduces the creditable amount of the original. Neither action automatically
returns money.

In Cord, open **Invoices**, select the document and use **More actions > Void
invoice**. The app blocks voiding when payments have been applied and suggests a
credit note. It also requires resolving linked credit notes before voiding the
original invoice. These are Cord workflow rules, not a replacement for reviewing
the tax treatment of a specific case.

## Mexico: request and confirmation

Submitting a request does not mean the CFDI has been canceled. Cord retains the
request status and only presents the invoice as void once confirmed:

- **Pending or verifying:** the invoice remains valid.
- **Rejected, expired or unconfirmed:** the invoice is not marked void.
- **Accepted:** its state changes to void.

Use **Check cancellation status** in the detail to review a request. This is a
manual check, not continuous automatic monitoring.

### The SAT reason

When you void a valid CFDI, Cord asks for the reason the SAT requires:

- **02 · Issued with errors, without a replacement:** it has an error and you
  will not issue another in its place (for example, it was issued twice or to
  the wrong client).
- **03 · The transaction did not take place:** the sale or service did not happen.
- **04 · Named transaction included in a global invoice:** only for a global
  invoice when a client asked for their own invoice.
- **01 · Issued with errors, with a replacement:** not chosen here. Use
  **Replace CFDI**.

### Replace a CFDI

If the invoice has an error that has to be corrected with another one, use
**Replace CFDI** in its detail. Cord creates a draft with the same data for you
to correct. When you issue it, the new CFDI is related to the original
(relationship 04), its payments move to the new invoice and Cord requests the
cancellation of the original under reason 01 with the replacement's fiscal
folio. If the recipient has to accept it, the detail shows the status; if they
reject it, both CFDI remain valid and you can retry.

Cord does not offer replacing an invoice with valid credit notes or issued
payment complements: the SAT does not allow cancelling a CFDI with valid related
documents. Do not use a credit note just to simulate cancellation.

## Other markets

Cord uses the available country rail and retains document history. Locally voiding
a commercial invoice does not prove a tax authority has received or accepted a
cancellation.

> Availability of the September improvements is being verified. See [scope and release status](https://docs.cordhq.app/en/docs/pagos/mejoras-confiabilidad); contact support if a described action is not yet shown in your account.
