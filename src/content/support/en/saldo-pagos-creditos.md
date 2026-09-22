---
title: "Understand an invoice balance"
description: "Partial payments, credits and money returned."
category: "Invoicing"
---

# Understand an invoice balance


## Payments, credits and refunds are different

Cord keeps payments, issued credit notes and confirmed refunds separate. This
helps prevent counting the same movement twice and explains balance changes.

**Amount due = total − issued credits − recorded payments + confirmed refunds**,
with a minimum of zero. A draft credit note does not reduce the balance. A pending
or failed refund does not count as money returned.

| Example in MXN | Result |
| --- | --- |
| 1,000 invoice; 400 payment | 600 remains due |
| 1,000 invoice; 200 issued credit; 800 payment | Zero balance |
| Paid 1,000 invoice; 200 issued credit | Zero balance and 200 to return |
| Same case, with a confirmed 200 refund | Zero balance and nothing to return |
| Paid 1,000 invoice; 200 refund without a credit | 200 becomes due again |

The last case requires reviewing the agreement with the customer. Returning money
does not itself reduce the document amount. Issuing a credit does not send money.

## Partial payments and confirmation

After a partial payment is applied, a new payment is prepared for the current
balance. An attempt still in progress must be resolved before opening another.
A repeated notification for the same payment must not add the amount again.

After returning from payment, use **Refresh balance**. Returning to the link is
not confirmation: status depends on the payment record. If the bank shows a charge
but the balance has not changed, contact the business before paying again.

## When the balance does not match

Open the invoice detail and compare payments, issued credits, confirmed refunds
and activity. Check currency and the relevant document. If a movement is pending,
wait for confirmation or request a review; do not add another manual payment to
force the balance to zero.

These changes do not silently recalculate every historical document. Older cases
that do not match require individual review.

> Availability of the September improvements is being verified. See [scope and release status](https://docs.cordhq.app/en/pagos/mejoras-confiabilidad); contact support if a described action is not yet shown in your account.
