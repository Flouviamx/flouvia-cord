---
title: "Upfront and balance"
description: "Learn how to split the payment of a quote to receive a percentage upfront and collect the rest later."
---

<header class="content-header">
  <h1 class="page-title">Upfront and balance</h1>
  <p class="page-subtitle">Learn how to split the payment of a quote to receive a percentage upfront and collect the rest later.</p>
</header>

## The split payment model

In service-based projects (agencies, consultancies, software development), it is very common not to charge 100% upfront, but rather to require an initial deposit (e.g., 50%) to kick off the work and settle the balance upon delivery.

In traditional invoicing platforms, this forces you to generate **two different payment links** or duplicate the invoice. In Cord, the quote is **smart** and handles split payments without you having to do double the work.

### How to configure an upfront payment

1. Open the quote editor.
2. On the right sidebar, look for the **Terms** section.
3. Make sure the payment term is set to **Due on receipt (Contado)** (upfront payments do not apply to Net 30/60 credit terms).
4. Check the **"% Upfront"** field and enter the percentage (e.g., `50`).
5. You'll see the live preview update instantly, showing the client exactly how much they will pay today to approve the document.

> **Productivity tip:** You can go to *Settings > Quotes* and set a "Default upfront %". If you set it to 50%, all your new quotes will be pre-configured with that model.

## What does the client see?

When the client opens the public link of the quote, below the total amount they will see a clear breakdown:

- **Project total:** $10,000
- **Pay upfront today (50%):** $5,000
- **Balance:** $5,000 (Due upon delivery)

### Automatic payment button mutation

The magic of Cord's architecture (based on independent PaymentIntents for each slice) happens at checkout:

1. **First charge:** The client clicks "Approve and Pay". The button charges them **only the $5,000** of the upfront deposit. Once processed, the quote switches to "Approved" and is ready for you to start working.
2. **Second charge:** Weeks later, when you are ready to collect the balance, the client can **re-enter the exact same link** from the original quote. The system will detect that the upfront deposit has already been paid, and the payment button will have automatically mutated to charge the **remaining Balance**.

You didn't have to send a second email, nor generate a "payment link for the balance". Everything lives in the same ecosystem.
