---
title: "Client portal and paying several invoices"
description: "One link per client with all their invoices, their balance per currency and paying several at once: how to create it, send it, rotate it and what your client sees."
category: "Payments & Deposits"
order: 6
---

The **client portal** is a personal link per client where they see **all their issued invoices**, their **balance due per currency**, download each invoice and **pay several at once** in a single charge. They also turn on [automatic payments](/en/support/cobro-automatico) there.

**In short:**

- **Where it is created:** on the client's profile (**Clients**, open the client), **Client portal** section, with **Create portal link**. You need the **Clients** permission.
- **What your client sees:** **Your invoices**, the **Balance due** in each currency, the invoices **To pay** (with overdue ones marked) and the **Paid** ones, each with its PDF.
- **Pay several:** your client ticks invoices in the same currency and clicks **Pay selected**. Cord splits the payment using each invoice's real balance.
- **Requirement to pay online:** an active Cord Payments account. Without it, the portal shows the invoices and asks your client to contact you to pay.
- **The link is the credential:** no account or password needed. You can generate another one (the previous one stops working) or disable it.
- **No extra cost** and on every plan.

## Create and share the link

1. Open **Clients**, go to the client and find **Client portal**.
2. Click **Create portal link**.
3. Share it with **Copy**, open it with **Open** or click **Send by email**: your client receives "Your invoices with" your business, with the **Open my portal** button.

Every action is recorded in your business audit log. The portal always lives on `cordhq.app`, even if you have a custom domain for your quotes.

## Rotate or disable

- **Generate new link:** the current link stops working and you need to share the new one. Use it if the link reached the wrong person.
- **Disable link:** your client cannot open their portal until you generate another one. Automatic payments do not change.

## What your client sees

- **Balance due** per currency, without adding different currencies together, and how many invoices are left to pay and how much is overdue.
- **To pay:** number, due date, balance (and the total, if they already paid part), and the **Overdue** and **Payment processing** labels. Each invoice has **View** (its link) and **PDF**.
- **Paid**, in a collapsible section.
- The notice that the link is personal and gives access to their invoices and payments, and your contact email for questions.

Only **issued** invoices assigned to that client appear. A replaced invoice does not appear (its replacement does) and neither does Mexico's global invoice.

## Pay several invoices at once

1. Your client ticks the invoices they want to pay. The portal shows how many and the total ("2 invoices · USD 1,250.00").
2. They click **Pay selected**, choose the method and confirm with the **Pay** button and the amount.
3. If they tick **Save this method for automatic payments**, automatic payments are also turned on.

Rules Cord applies:

- **One currency at a time.** Invoices in different currencies are paid separately.
- **The server decides the split** with each invoice's real balance when the charge is created; the browser only chooses which ones. Each invoice receives its share as its own payment in its history, and a Mexican invoice issued PPD gets its payment complement.
- **Methods:** card and, if you turned them on and the currency matches, SEPA Direct Debit (EUR) or ACH bank debit (USD). In Mexican pesos the portal charges by card; SPEI is offered on each quote's link.
- **A bank debit takes days:** while a debit is processing, that invoice shows **Payment processing**, it cannot be charged again or voided, and the portal tells your client not to pay again.

## Refund a payment that covered several invoices

If you refund part of a charge that paid several invoices, Cord allocates the refund from the last invoice applied to the first, each one in full before moving to the next.

## Common issues

- **My client cannot pay from the portal.** Your Cord Payments account is not active, or your country collects online through Mercado Pago: in that case your client pays each invoice from its own link.
- **An invoice is missing.** Check that it is issued (not a draft) and assigned to that client.
- **The link no longer opens.** You disabled it or generated a new one. Share the current one from the client's profile.
- **My client sees a "Test portal" notice.** It is a test account: online payment is disabled.

## Related

- [Automatic payments and retries](/en/support/cobro-automatico)
- [SEPA Direct Debit and ACH](/en/support/domiciliacion-sepa-ach)
- [Public invoice link](/en/support/enlace-publico-factura)
- [Payment methods in the documentation](https://docs.cordhq.app/en/docs/pagos/metodos)
