---
title: "Get paid with Mercado Pago"
description: "Connect your Mercado Pago account so clients can pay by card from the link, in the countries where Cord Payments does not reach."
category: "Payments & Deposits"
order: 12
---

Cord Payments runs on Stripe, which does not open connected accounts in Colombia, Argentina, Chile or Peru. **Mercado Pago** covers that gap: the client pays by card from the same link and the money lands in your Mercado Pago account.

In Mexico and Brazil you can use both: Cord Payments and Mercado Pago.

### Connecting it

1. Go to **Settings › Payments**.
2. Click **Connect Mercado Pago**. It takes you to Mercado Pago to authorize Cord.
3. Accept and you come back to Cord with the account connected.

Cord stores the credentials you authorized, encrypted. It does not touch your balance and cannot move your money: it only opens a quote's charge on your behalf.

### What your client sees

The same as always: they open the quote link, hit pay and continue to Mercado Pago's checkout. When they finish they return to your link.

The breakdown is Cord's own: if the quote has a deposit and a balance, or installments, each part is charged separately and the quote is marked paid when nothing is left.

### When it is marked paid

Mercado Pago notifies Cord as soon as the payment is approved. Cord **reads the payment** from Mercado Pago before taking anything for granted: it never trusts the notice, because a notice can be forged and a payment read from the provider cannot.

A repeated notice — Mercado Pago resends them by design — does not charge twice.

### Disconnecting

From **Settings › Payments**, with **Disconnect**. Open charges can no longer be paid through that rail; the ones already paid keep their history.
