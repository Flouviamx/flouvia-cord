---
title: "Accepting a Payment"
description: "Receive money via credit card or dynamic SPEI wire transfer."
---

<header class="content-header">
  <h1 class="page-title">Accepting a Payment</h1>
  <p class="page-subtitle">Offer your clients a native checkout experience without leaving the quote.</p>
</header>

## The Integrated Checkout

Once the client approves the quote (and electronically signs it), the Magic Link transforms. Instead of showing the approve button, it displays an elegant and responsive **Checkout panel**.

Depending on how you configured the quote (Cash, Advance, or Credit), the system will charge the corresponding amount. The client has two primary payment methods:

### 1. Interbank Transfer (Dynamic SPEI)

This is the preferred method for high-volume B2B transactions.
- By selecting "Wire Transfer", Cord generates a **unique interbank CLABE** exclusively tied to that specific quote (using the *Customer Balance* infrastructure).
- The client logs into their banking portal and transfers to that CLABE.
- **Magic Reconciliation:** The instant the money hits the account, Cord detects the deposit, changes the quote's status to "Paid," and sends you a notification (along with the client). No need to cross-reference receipts.

> **Zero Commissions:** SPEI payments travel through your Connect Custom account. Cord charges no percentage for these transactions.

### 2. Credit and Debit Cards

For quick payments or smaller amounts, the client can use their card.
- The form is powered by **Stripe Elements** under the hood, guaranteeing the highest security standards (PCI Compliance).
- Accepts Visa, Mastercard, and American Express.
- Funds also drop directly into your connected account. *(Note: The payment processor will hold the standard card processing fee, but Cord adds no additional fees).*

## Partial Payments and Advances

What happens if you configured a **50% Advance** on the quote?
1. The initial checkout will only show the advance amount.
2. Once the client pays that 50%, the quote is marked as "Advance Paid".
3. When the project delivery date arrives, Cord will automatically send a new email to the client with a "Settle Balance" button, taking them to the checkout for the remaining 50%.
