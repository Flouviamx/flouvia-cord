---
title: "SEPA Direct Debit and ACH bank debit"
description: "Collect in EUR with SEPA Direct Debit (Spain, Germany and France) and in USD with ACH (United States): how to turn it on, how long it takes, returns, refunds and where it is offered."
category: "Payments & Deposits"
order: 8
---

Besides card, your clients can pay with a **direct debit from their bank account**: **SEPA Direct Debit** in euros if your business is in Spain, Germany or France, and **ACH bank debit** in dollars if your business is in the United States. It serves clients who prefer paying from their bank and automatic payments, but **it takes days to confirm**.

**In short:**

| | SEPA Direct Debit | ACH bank debit |
|---|---|---|
| Your business in | Spain, Germany, France | United States |
| Currency | EUR only | USD only |
| Client's account | IBAN in the SEPA area | US bank account |
| Confirmation | Up to 6 business days | Up to 4 business days |
| Returns | The account holder can request a return of the debit for 8 weeks, without giving a reason | The account holder can dispute the debit with their bank |
| Refunds | Full or partial | Full only |

- **Where it is offered:** on each invoice's link, in the [client portal](/en/support/portal-del-cliente) and in [automatic payments](/en/support/cobro-automatico). It is not offered on the quote link.
- **Turn it on:** under **Settings › Payments**, turn on **SEPA Direct Debit** or **ACH bank debit**. You need an active Cord Payments account.
- **Cord's cost:** outside Mexican pesos Cord charges no transaction fee of its own.

## Turn it on

1. Open **Settings › Payments** with the **Payment settings** permission.
2. Turn on **SEPA Direct Debit** (if your business is in Spain, Germany or France) or **ACH bank debit** (if it is in the United States). The switch only appears in your country.
3. Cord requests the capability for your payments account. The label next to the name shows its status: **Active**, **Under review** or **Unavailable: check your verification**.
4. It is only offered to your clients once it reads **Active**. While it is under review, your clients keep paying by card.

## What your client sees

On the invoice link or in their portal, your client chooses to pay from their bank account, enters their IBAN (SEPA) or their account details (ACH) and accepts the mandate that authorizes you to debit them. Cord stores only the type, the bank and the last four digits, never the full account.

Your client receives by email the notice of each SEPA debit and the ACH mandate confirmation, which is why Cord needs their email on their profile.

## While the debit is processing

A debit does not confirm instantly:

- The invoice shows that **a bank debit is processing**: it cannot be charged again or voided until it is confirmed or fails.
- The invoice link and the portal tell your client ("Payment processing") so they do not pay twice.
- Once confirmed, the payment is applied to the invoice like any other. If it fails, the invoice stays open with its balance and, in automatic payments, the [retry policy](/en/support/cobro-automatico) applies.

## Returns and refunds

- **SEPA:** the account holder can ask their bank to return a debit for **8 weeks** without giving a reason. If they do, the amount is deducted from you: contact your client to sort it out.
- **ACH:** only supports **full refunds**. To return part of it, agree another method with your client.
- A refund you start is made from **Payments**, like any other.

## If a debit fails

A debit is only retried for **insufficient funds**, at most twice and within 30 days (SEPA) or 40 days (ACH) of the first attempt. Any other decline (closed account, mandate withdrawn) is resolved by your client with their bank or with another method.

## Common issues

- **I do not see the switch.** Your business is not in Spain, Germany, France or the United States, or you do not have the **Payment settings** permission.
- **It reads "Unavailable: check your verification".** Your payments account is missing a requirement. Check **Settings › Payments**.
- **My client does not see the option.** The invoice is not in the method's currency (EUR for SEPA, USD for ACH), the capability is not **Active** yet, or it is a quote link.

## Related

- [Automatic payments and retries](/en/support/cobro-automatico)
- [Client portal and paying several invoices](/en/support/portal-del-cliente)
- [Payment methods in the documentation](https://docs.cordhq.app/en/docs/pagos/metodos)
