---
title: "Monthly retainers"
description: "Turn your quotes into automatic monthly subscriptions where the client authorizes their card only once."
---

<header class="content-header">
  <h1 class="page-title">Monthly retainers</h1>
  <p class="page-subtitle">Turn your quotes into automatic monthly subscriptions where the client authorizes their card only once.</p>
</header>

## Goodbye to the hassle of collecting every month

If you are a marketing agency, a consulting firm, or you sell a service on a "Retainer" basis, you know how painful it is to have to send a payment link or a manual invoice to your client every 1st of the month and chase them down to pay it.

Cord solves this by turning your quote into a **real Stripe Subscription**, natively integrated with your bank account.

### How to enable a monthly retainer?

For the recurring model to work, it is strictly required that you have your payments account connected (Stripe) and the **Credit/debit card method enabled**. *(Note: Automatic monthly billing cannot work with SPEI, because SPEI requires the client to manually initiate the transfer from their bank every month).*

1. Open your quote editor.
2. On the right sidebar, under "Terms", toggle the **Monthly recurring charge (retainer)** switch.
3. This will automatically disable the "Upfront" option, as a recurring charge is a fixed fee.

## The client experience

When you send the quote link, the client will read their proposal normally, but they will notice the approval button is different:

1. The button will say **"Authorize monthly charge of $X"**.
2. Upon clicking, the client will securely enter their credit or debit card.
3. The system will make the **first charge immediately** to activate the retainer, marking the quote as Approved.
4. Stripe will handle **tokenizing the card** and charging that exact amount automatically every month, sending the funds straight to your bank account.

You never store card data; Stripe Connect handles tokenization and automatic retries if the client's card fails one month due to insufficient funds.

## Cancellation

Unlike traditional quotes (which switch to a "Paid" status once fully paid), a recurring retainer **is never marked as fully paid**, because it is continuous.

In your dashboard, inside the details of that quote, you will see a status card indicating that the subscription is "Active". When you decide to end the business relationship with the client, simply press the red **"Cancel retainer"** button. This will instantly stop all automatic charges for the following months.
