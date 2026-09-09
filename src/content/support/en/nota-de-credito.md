---
title: "Issue a Credit Note"
description: "Apply refunds and bonuses on top of an already-issued invoice."
category: "Invoicing"
---

# Issue a Credit Note


A Credit Note is the mechanism to credit the balance of an already-issued invoice without cancelling it outright — for example, when you give a client a post-sale discount, or need to refund part of what was collected. In Mexico it's issued as an Expense-type CFDI, linked by its UUID to the original invoice.

### Issue a Credit Note in Cord

1. Locate the original invoice in your **Invoices** inbox. Only an **issued** invoice can have a Credit Note.
2. Open its options menu and choose **Generate Credit Note**.
3. Cord creates a new Credit Note as a draft, for the **full amount** of the original invoice, and takes you straight to its detail page.
4. From there, edit it like any draft: adjust the amount if you only need to credit part of it, and add a line explaining the reason. When it's ready, issue it from the same draft editor you use for any new invoice.

<Callout type="info">
When you use the button from the app, the Credit Note is created for the full amount of the original invoice — there isn't an in-between step in the interface today to specify a partial amount before creating it. If you invoice through the API, you can send the partial amount you want to credit directly.
</Callout>

Cord **does not automatically email** the client when you create the Credit Note: it's generated as a draft for you to review, and you send it yourself with the send button on its detail page once you've issued it — just like with any other invoice.

## Effect on the balance

Only an issued, non-void credit note reduces the balance; a draft does not. In Mexico it is issued as an expense CFDI linked to the original UUID. If the invoice was already paid, an amount may remain to return. Issuing the note does not execute a refund. See [how balances are calculated](/en/support/saldo-pagos-creditos).

> Availability of the September improvements is being verified. See [scope and release status](https://docs.cordhq.app/en/pagos/mejoras-confiabilidad); contact support if a described action is not yet shown in your account.
