---
title: "PPD invoices and payment complements (REP)"
description: "How Cord decides between PUE and PPD, when it issues each payment's complement on its own, the cases it leaves to your accountant and how to see their status."
category: "Invoicing"
order: 3
---

This applies to organizations in **Mexico**. When a CFDI is issued with the **PPD** method (payment in installments or deferred), the SAT requires a **payment complement** (type P CFDI, also called REP or electronic payment receipt) for every payment you receive afterwards, no later than the 5th of the following month. **Cord issues it on its own** when each payment is recorded.

**In short:**

- **Cord decides PUE or PPD when stamping:** if the invoice is already paid, it is issued **PUE** with the real payment method; if not, **PPD** with method **99**. An invoice with the generic RFC (XAXX010101000) is always PUE.
- **Automatic complement:** every payment applied to a PPD invoice (with **Record payment**, an online payment, a quote payment that moves to the invoice or a payment from the portal) issues its complement.
- **Once per payment:** the same payment never gets two complements, even if the notice arrives twice.
- **Uses allowance:** each complement counts as one tax-compliant invoice on your plan.
- **Cases that are not automatic:** a payment in another currency, which Cord writes in the invoice activity, and the SAT advance-payment procedure, which Cord does not issue.

## How Cord decides between PUE and PPD

When stamping, Cord adds up what has already been collected for that sale (on the quote and on the invoice):

- **Fully paid:** **PUE** CFDI, with the payment method of the largest payment (card 04, transfer 03, cash 01). If you set a **Payment method** under **CFDI details** in the editor, that one is used.
- **Unpaid or partly paid:** **PPD** CFDI with payment method **99** (to be defined). Each later payment gets its complement.

You do not need to choose the method manually.

## When the complement is issued

As soon as a payment is applied to a stamped PPD invoice:

1. **Record payment** on the invoice detail (transfer, cash, check or other).
2. An **online payment** from the invoice link or from the client portal.
3. A **quote payment** (advance, balance or installment) that moves to the invoice.

Cord stamps the complement with that payment's amount, date and payment method, related to the invoice's UUID, and logs it in the invoice **Activity**: "Payment complement issued" with its tax folio.

## Cases Cord leaves to your accountant

- **Payment in another currency:** the complement needs the official exchange rate of the payment date, which Cord does not have.
- **Advance in the SAT's sense:** if you received the payment when the good, the service or its price were not determined, the SAT requires its advance-payment procedure (an advance CFDI and its application), which Cord does not issue. Review it with your accountant **before** stamping: what was collected on the quote moves to the invoice and, if it is issued PPD, gets its complement like any other payment.

When Cord does not issue a complement, the invoice activity says it is not automatic and why.

## If a complement fails

If stamping the complement fails, the payment **is still recorded** and the activity says "Payment complement pending" with the reason. Write to us and we retry it: the retry uses the same operation, so the SAT never receives two complements for the same payment.

## Replacing or cancelling an invoice with complements

The SAT does not allow cancelling a CFDI with valid related documents. An invoice with issued payment complements cannot use **Replace CFDI** from the app: write to us to do it. See [Cancel CFDI with related documents](/en/support/cancelar-cfdi-relacionados).

## Related

- [How to invoice in Mexico with Cord](/en/support/facturar-en-mexico)
- [Invoice advance payments](/en/support/facturacion-anticipos)
- [Balance, payments and credits](/en/support/saldo-pagos-creditos)
