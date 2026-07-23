---
title: "Fees and advantages"
description: "Understand the true cost of payment processing, the benefits of automation, and what to consider before enabling Stripe."
---

<header class="content-header">
  <h1 class="page-title">Fees and advantages</h1>
  <p class="page-subtitle">Understand the true cost of payment processing, the benefits of automation, and what to consider before enabling Stripe.</p>
</header>

## Real fees and commissions

The golden rule at Cord is simple: **Cord does not charge any commission for processing your payments.** All the money flows through a **Stripe Connect Custom** account that you own, meaning the money lands directly in your bank without ever passing through our hands.

However, Stripe as a payment gateway does charge industry-standard fees for the use of their financial infrastructure:

### Card Payment Fee (Credit and Debit)
- **Cost:** 3.6% + $3.00 MXN (plus VAT) per successful transaction.
- **Ideal use:** International clients, clients looking for installment plans (if enabled), or urgent payments for smaller amounts.
- *Note: Stripe does not refund processing fees if you decide to refund the client.*

### SPEI Transfer Fee (Automatic Stripe transfer)
- **Cost:** Stripe charges a flat nominal fee (typically $8.00 MXN plus VAT, depending on your negotiated volume) for each processed SPEI, regardless of whether the client pays $100 pesos or $100,000 pesos.
- **Ideal use:** High-volume B2B collections. Since it's a flat fee, the commission percentage becomes mathematically invisible on large payments.

### Manual Transfer Fee (Outside of Stripe)
- **Cost:** $0.00 (Free).
- **Ideal use:** When the client prefers to wire the money directly to your traditional bank account using your standard CLABE/IBAN. The client uploads their receipt and you mark the payment as completed manually.

## Advantages of charging through Cord

Activating online payments with Cord (via Stripe) completely transforms your accounts receivable operation:

1. **100% automated reconciliation:** No more hunting for deposits in your banking portal and guessing which invoice they belong to. Every payment is automatically linked to its quote and the status changes to paid in real-time.
2. **Money direct to you:** By using a *Connect Custom* architecture, Cord doesn't hold your funds or act as a risky middleman. You are the sole financial owner of your payouts.
3. **Brand experience:** Your client pays on an elegant in-house checkout embedded in the document (without strange redirects or third-party logos), keeping your brand front and center.
4. **Retainers and split payments:** The system supports charging a deposit today and the balance on credit (Net 30/60), or even monthly retainers where Stripe debits the client's card automatically every month.

## Disadvantages and considerations

To be completely transparent, relying on an international payment gateway comes with a few rules you must agree to:

1. **Payout time:** The money does not hit your local bank immediately. Stripe operates on a rolling payout schedule, which in Mexico typically takes between **2 to 7 business days** to arrive.
2. **Rigorous onboarding (KYC):** Stripe is regulated as a financial entity, and its anti-money laundering processes are strict. They will require IDs, Tax IDs, articles of incorporation, and might ask questions about your business model if you experience an unusual spike in sales volume.
3. **Chargeback freezes:** If a client denies a charge on their card (a chargeback), Stripe will temporarily freeze that money plus a dispute penalty fee while you prove with evidence (the signed quote) that the service was delivered.

> **Golden recommendation:** If your quotes are for millions of dollars, the "Manual Transfer" method will always be the safest and cheapest option (0% commission, instant money). Use Stripe's features for deposits, monthly retainers, and card payments where the automation justifies the cost and payout time.
