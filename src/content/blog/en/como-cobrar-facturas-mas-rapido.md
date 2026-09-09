---
title: "How to collect invoices faster: process, messages, and metrics"
excerpt: "An operating guide to reduce payment friction, prioritize receivables, and follow up without losing client context."
category: "Collections"
date: "28 Aug 2026"
publishedAt: "2026-08-28"
lastUpdated: "2026-08-28"
readTime: "10 MIN"
img: "/og-cord.jpg"
authorName: "Cord Team"
authorRole: "Product and financial operations"
reviewedBy: "Cord Product"
reviewedByRole: "Functional review"
keywords: ["how to collect invoices", "get invoices paid faster", "accounts receivable", "payment follow-up", "payment reminders"]
faq:
  - question: "What should a payment reminder include?"
    answer: "The client, invoice number, outstanding amount, currency, due date, payment link or instructions, a contact for questions, and a direct request for the expected payment date."
  - question: "When should the first reminder be sent?"
    answer: "Cadence depends on the relationship and agreed terms. A useful practice is to confirm receipt before the due date and follow up when due, without alleging delinquency while a valid dispute is open."
  - question: "Does marking an invoice as paid move money?"
    answer: "No. Recording payment updates internal receivables. Do it only after verifying the deposit or receiving confirmation from the payment provider."
  - question: "Does Cord automatically charge a recurring invoice?"
    answer: "No. Recurrence issues the next invoice on schedule; it does not charge a stored client card by itself. The buyer pays with the enabled methods."
sources:
  - name: "Cord Docs — receivables and follow-up"
    url: "https://docs.cordhq.app/en/docs/pagos/cartera-cobranza"
  - name: "Cord Docs — payment methods by market"
    url: "https://docs.cordhq.app/en/docs/pagos/metodos"
  - name: "Cord Docs — recurring invoices"
    url: "https://docs.cordhq.app/en/docs/pagos/facturas-recurrentes"
---

Getting paid faster does not start with a harsher message. It starts when the invoice
is correct, reaches the right person, and includes a payment method that actually works
for that client.

The operating sequence is:

1. agree on terms before selling;
2. issue without errors and deliver immediately;
3. confirm receipt and buyer requirements;
4. prioritize by due date, amount, and context;
5. provide a working payment link or bank instructions;
6. record promises, disputes, and payments with evidence;
7. measure where receivables become stuck.

## Define collection before closing the sale

Write down deposit and balance, immediate payment or credit days, currency, due-date
rule, accepted method, buyer tax data, purchase-order or vendor-portal requirements,
and any agreed operational consequence of delay. Avoid “payment to be agreed.” If the
condition is still unknown, the quote is not ready for approval.

## Issue an invoice the client can process

Review legal name, tax identifier, address where applicable, number, line items, taxes,
currency, issue date, and due date. Include a person who can resolve questions and a
usable method of payment.

In Mexico, Cord issues CFDI 4.0 after the tax profile and CSD are configured. In the
other offered markets, it creates a commercial invoice and does not automatically
report it to the local authority. See the [invoicing guide](https://docs.cordhq.app/en/docs/pagos/facturacion).

## Remove payment friction

The link should open the correct balance and show only methods available to the account.
Cord Payments supports card payments through Stripe Connect in Mexico, the United
States, Canada, Brazil, Spain, the United Kingdom, Germany, and France. In Colombia,
Argentina, Chile, and Peru, businesses can quote, invoice, and record payments, but
Cord online collection is not currently available.

Automated SPEI applies only in Mexico. Manual bank instructions can be displayed, but
reconciliation depends on your team verifying the deposit and recording the payment.

## Segment receivables before sending reminders

| Segment | Useful action |
|---|---|
| Not due yet | confirm receipt and requirements |
| Due today | resend invoice and payment instructions |
| Overdue without response | request a date and responsible person |
| Active promise | wait until the committed date |
| Open clarification | resolve it before escalating tone |
| Received but unreconciled | verify reference and amount |
| Dispute | separate disputed from undisputed amount |

Cord's [receivables view](https://docs.cordhq.app/en/docs/pagos/cartera-cobranza)
collects outstanding invoices and supports filters, payment promises, message copying,
and invoice detail.

## Write messages that make a response easy

A useful reminder names the client, invoice and due date, outstanding amount and
currency, payment link or instructions, one direct question — **what payment date may
we record?** — and a contact for questions.

Do not state that the client defaulted when a dispute is open or you cannot confirm that
the document was received.

## Record promises and payments carefully

A promise needs a date, note, and owner. When it expires, return the invoice to the work
queue rather than hiding it as a promise.

**Marking an invoice paid does not move money.** It updates internal control. Verify the
deposit, reference, currency, and amount or the payment provider's confirmation first.
For partial payment, record the actual amount and preserve the remaining balance.

## Automate within explicit limits

Cord supports manual collections from Pro. On Scale and Developer, the collections
agent can draft or send communications according to its configured mode. AI should not
invent discounts, write-offs, or payment agreements outside your policy.

Recurring invoices on Pro or higher issue new documents monthly, quarterly, or annually.
They **do not automatically charge a stored card**. The client pays each invoice using
the enabled methods.

## Metrics that help operations

Track total receivables, overdue balance, days sales outstanding (DSO) under a stable
definition, on-time payment rate, time from issue to delivery and first view, broken
promises, open disputes, collected amount, and unreconciled payments.

A simple period DSO formula is:

`closing accounts receivable ÷ period credit sales × days in period`

Document what is included and keep the formula consistent. Mixing total sales and credit
sales makes month-to-month comparison unreliable.

## Implementation checklist

- [ ] Payment terms appear on the quote.
- [ ] The invoice contains buyer data and processing requirements.
- [ ] Links or bank instructions have been tested.
- [ ] Every account has an owner.
- [ ] Promises, disputes, and partial payments have separate states.
- [ ] Nobody marks paid without evidence.
- [ ] Cadence changes with client context.
- [ ] The team reviews overdue accounts, broken promises, and delay causes weekly.

