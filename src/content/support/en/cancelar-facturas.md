---
title: "Cancel invoices and credit notes"
description: "How invoice cancellation actually works in Cord, and when the SAT requires a Credit Note instead."
category: "Invoicing"
order: 4
---

For organizations in **Mexico**, Cord cancels a CFDI 4.0 following the SAT's process. Outside Mexico, "cancelling" an invoice is a local Cord operation (there's no document to deregister with a tax authority), and the same business rules below apply, except for the SAT-specific part.

### How cancellation works in Cord

From the invoice detail page, open the options menu and choose **Cancel invoice**. Cord asks you to confirm, and if you accept, it cancels the document. In Mexico, the cancellation travels to the SAT with reason `02 — Document issued with errors without relationship`, the correct reason when you're going to redo the invoice from scratch (for example, the client's RFC was wrong).

An invoice with payments already applied **cannot be cancelled**: Cord tells you right away and points you to issue a Credit Note instead (see [Issue a Credit Note](/en/support/nota-de-credito)), because voiding a document that already backs collected money would leave that payment without a receipt.

### SAT catalog reasons

The official catalog has four possible reasons. Here's when each one applies:

- **01 (Errors with relationship):** you made a mistake in the price or concept and you're going to replace the invoice with a new one. This reason requires declaring to the SAT which CFDI replaces it — Cord's cancel button doesn't build that link today; if you need it, [reach out to us](/en/contacto/ventas).
- **02 (Errors without relationship):** you made a mistake in the client's RFC or another detail that doesn't warrant relating a replacement. Cancel it and redo it from scratch. This is the reason the **Cancel invoice** button uses.
- **03 (The operation wasn't carried out):** the sale fell through and was never paid.
- **04 (Nominative operation related to a global invoice):** exclusive to General Public invoices.

### Cancellations with client acceptance

When the invoice amount exceeds $1,000 MXN or more than 24 hours have passed since it was issued, the SAT doesn't cancel immediately: it places the request in a pending state and notifies the client through their Tax Mailbox (Buzón Tributario), who has 72 hours to accept or reject it. This process happens entirely on the SAT's side and in the client's Tax Mailbox. Cord marks the invoice as cancelled as soon as the stamping provider confirms it accepted the cancellation request; Cord doesn't currently monitor or update the status if your client rejects it afterward within those 72 hours, so for a rejected case check the status directly in the Tax Mailbox or with your accountant.
