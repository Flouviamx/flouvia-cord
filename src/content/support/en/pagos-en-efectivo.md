---
title: "Cash Payment Reception"
description: "Enable collections at Oxxo and convenience stores."
category: "Payments & Deposits"
---

Although B2B transactions are usually via SPEI transfer, if you use Stripe as a payment processor in Cord, you can enable alternative payment methods like OXXO.

### Activate OXXO through Stripe

1. Go to the Stripe dashboard.
2. Under Payment Methods, activate OXXO.
3. When the customer opens the quote in Cord and decides to pay, Stripe Checkout will offer them to download a voucher (barcode) to pay in cash at the store.

**Asynchronous Flow:**
The customer has days to pay the voucher. During this time, the quote in Cord will remain in *Pending* status. When the customer finally pays at the OXXO, Stripe sends us a webhook (sometimes it takes up to 24 business hours), and at that moment Cord changes the quote to *Paid*. From there you can stamp the CFDI with one click.
