---
title: "Add credit terms (Net 30/60)"
description: "How to sell on trade credit and how payment is collected once the term lapses."
category: "Quotes"
order: 3
---

Not all transactions are paid upfront. In the corporate B2B environment, offering short-term financing (e.g. Net 30) is an industry standard. Cord automates the management of these agreements.

### Configure payment terms

When creating a quote or an invoice, in step 1 of the editor, next to the client, you'll see the **Payment terms**. Choose between:

- **Due on receipt:** payment can be made immediately as soon as the client approves.
- **Net 15 / Net 30 / Net 60:** the client has 15, 30, or 60 calendar days to pay, counted from the quote's approval (on an invoice, from its date).
- **Other term:** opens the list with **Net 7**, **Net 45**, and **Net 90**.

You can also set default terms per client on their record: when you pick them in the editor, their terms are preselected automatically. On an invoice, changing the terms recalculates the **Due date**.

A **Monthly recurring charge (retainer)** is always due on receipt: it can't be combined with a credit term.

### What happens with a credit sale

- The public link shows the client their terms and the exact due date.
- **The online payment button does not appear until the due date arrives.** It makes no sense to ask a client you granted 30-day credit to for money on the same day they approve: while the term runs, they'll see "Order confirmed with Net 30 credit — due on [date]."
- When the due date arrives, the payment button is automatically enabled in the same link, and —if you have autonomous collections active— the collections agent starts sending reminders with the payment link. See [Automatic AI collections](/en/support/cobranza-automatica).

> [!NOTE]
> If you also want to ask for a percentage up front (which *is* payable on approval) and the rest on credit, use the **deposit** feature. See [Collect a deposit](/en/support/cobrar-anticipo).
