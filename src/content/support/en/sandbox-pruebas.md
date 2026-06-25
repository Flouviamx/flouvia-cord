---
title: "Testing Cord without affecting production"
description: "How to experiment with payments and stamping without spending money or stamping for real."
category: "Developers"
---

Before going live you'll want to test the flow (send a quote, collect, stamp) risk-free. Cord does not yet have an **isolated sandbox** with separate data; instead, use these pieces to test safely.

### Test-mode API keys

Create an `sk_test_...` key in **Settings > Developers > API**. Test keys **don't consume your usage meter or count toward billing**, so you can iterate your integration at no cost. Note they operate on the **same data** as your organization (there's no parallel environment); label or delete any test records you create.

### Testing card payments

Payments go through **your Stripe account**. Put your Stripe account in **test mode** and use [Stripe's test cards](/en/support/tarjetas-prueba) (e.g. the Visa `4242 4242 4242 4242`) in the public link's checkout. No charge is real while Stripe is in test mode.

### Testing stamping (CFDI)

Stamping depends on your Facturapi configuration:
- **No CSD / no Facturapi key:** Cord returns a **simulated** stamp (marked as such), sending nothing to the SAT. Ideal to test the flow without affecting your accountant.
- **With a Facturapi test key:** syntax is validated without issuing a tax-valid CFDI.
- **With a CSD and live key:** it stamps for real with the SAT.
