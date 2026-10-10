---
title: "Automatic payments and what happens when a charge fails"
description: "Your client saves a method in their portal and each invoice is charged on its due date: what is charged, when, how they authorize it and the retry policy by decline type."
category: "Payments & Deposits"
order: 7
---

With **automatic payments**, your client saves a card or bank account in their [portal](/en/support/portal-del-cliente) and each invoice is charged on its due date. **Your client turns it on**, with their authorization; your business decides whether to offer it and can turn it off at any time.

**In short:**

- **Offer it:** turn on **Automatic payments** under **Settings › Payments**. You need an active Cord Payments account.
- **Turn it on:** your client clicks **Turn on automatic payments** in their portal and accepts the authorization, or ticks **Save this method for automatic payments** when paying.
- **What is charged:** each open invoice **due today or earlier**, due **on or after the day your client authorized it**, and issued at least one day before. All invoices in the same currency go in **a single charge**.
- **When:** once a day. Each invoice email tells your client the date and method of the charge.
- **If it fails:** Cord only retries when it makes sense, depending on the decline reason, up to 4 attempts by card and 3 by bank debit. Your client gets an email with their portal and you get a task when the charge stops.
- **Turn it off:** per client from their profile (**Turn off automatic payments**) or for everyone under **Settings › Payments**.

## How your client authorizes it

In their portal, the **Automatic payments** section reads "Save a method and each invoice is paid on its due date, without you having to come back". When they click **Turn on automatic payments**, your client accepts: "I authorize your business to charge this method, on its due date, each invoice it issues to me from today on. I can turn this off at any time from this portal". Then they save their method with **Save method**.

- Cord records the authorization with date, IP and browser, and activates it **only once the bank confirms that method**.
- With a bank account, the portal reads "We're verifying your bank account" until it is confirmed.
- A bank debit method only covers its currency: SEPA covers EUR and ACH covers USD. An invoice in another currency is not charged with it.
- Your client can **Change method** or **Turn off** whenever they want; their invoices stay in the portal to pay manually.

## What is charged and when

An invoice is included in the day's charge if, at the same time:

- it is **issued and open**, with a balance, without a bank debit processing or a cancellation in progress, and it is not a test document;
- it is **due today or earlier** (with no due date, issued today or earlier) and was issued **at least one day before**, so your client receives it before the charge;
- it is **due on or after the day your client authorized** automatic payments: what they already owed before is not charged by surprise, they pay it from the portal;
- the method covers its currency and your business still accepts that method.

All invoices in the same currency go in **a single charge**: one movement on your client's statement. Each invoice receives its share as its own payment in its history.

## Retry policy

Cord does not retry blindly: it decides by the decline reason. A decline counts once even if the notice arrives twice.

| Decline reason | Examples | What Cord does |
|---|---|---|
| **Blocked** | Stolen, lost or fraud-flagged card | Never retries. Removes the method and turns automatic payments off until your client adds another. |
| **Authorization withdrawn** | Your client withdrew the debit mandate | Does not retry. Removes the method; your client turns it on again if they want. |
| **Method no longer works** | Expired card, wrong details, closed account | Does not retry. Asks for another method. |
| **Authentication required** | The bank asks to confirm the payment | Does not retry: your client pays that invoice from their portal. Automatic payments **stay on**. |
| **Insufficient funds** (card) | Not enough balance | Retries on the next 1st or 16th of the month if it falls within a week (and at least 2 days later); otherwise after 3 days. |
| **Bank technical failure** (card) | Issuer unavailable | Retries the next day. |
| **Other decline** (card) | Generic decline | Retries after 2, 4 and 7 days. |

**Caps:**

- **Card:** at most **4 attempts** (the first and three retries). Then it stops.
- **Bank debit (SEPA or ACH):** only retried for **insufficient funds**, at most **2 times**, on the next 1st or 16th within a week (at least 3 days later; otherwise after 4 days), and always within **30 days** (SEPA) or **40 days** (ACH) of the first attempt. Any other debit decline is resolved by your client with their bank.

## What you and your client see

- **Your client** gets an email with the **Open my portal** button: "We couldn't charge … We'll try again on …", or that their method can no longer be used, that their bank asks to confirm the payment, or that the charge failed after several attempts. Their portal says the same above their invoices.
- **You** see the status on the client's profile, under **Client portal › Automatic payments**: "Attempt N declined in USD. Next attempt: …", "Stopped in EUR: …" or "Turned off automatically: …". When the charge stops, Cord creates a **task** for you ("Automatic payments stopped: …").

## If the bank did not respond

If the charge was sent and there was no response, Cord does not open another one: the next run retries **the same operation**, so there is no double charge. If there is no trace of the charge within 20 hours, it is cancelled. Cord also reconciles every day the charges that got no notice and debits that have been processing for more than 3 days.

## Requirements and limits

- **An active Cord Payments account** under **Settings › Payments**. In Colombia, Argentina, Chile and Peru, where online payment is through Mercado Pago, automatic payments are not available: Mercado Pago charges when your client opens the link.
- **In Mexican pesos**, automatic payments use a card.
- Your business **cannot turn it on** for your client: it can only offer it or turn it off.

## Related

- [Client portal and paying several invoices](/en/support/portal-del-cliente)
- [SEPA Direct Debit and ACH](/en/support/domiciliacion-sepa-ach)
- [Declined payment reasons](/en/support/pagos-rechazados)
- [Payment methods in the documentation](https://docs.cordhq.app/en/docs/pagos/metodos)
