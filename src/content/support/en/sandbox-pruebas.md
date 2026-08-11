---
title: "Testing Cord without affecting production"
description: "How to experiment with payments and stamping without spending money or stamping for real."
category: "Developers"
---

Before going live you'll want to test the flow (send a quote, collect, stamp) risk-free. Cord does not yet have an **isolated sandbox** with separate data; instead, use these pieces to test safely.

### Test-mode API keys

Create an `sk_test_...` key in **Settings > Developers > API**. Test keys **don't consume your usage meter or count toward billing**, so you can iterate your integration at no cost. Note they operate on the **same data** as your organization (there's no parallel environment); label or delete any test records you create.

### Testing card payments

The public link of a production organization processes real transactions and **must not be tested with laboratory card numbers**. For a development integration, ask support for a separate test environment. Never use a real card to simulate failures.

### Testing stamping (CFDI)

Stamping depends on your Facturapi configuration:
- **No CSD / no Facturapi key:** Cord returns a **simulated** stamp (marked as such), sending nothing to the SAT. Ideal to test the flow without affecting your accountant.
- **With a Facturapi test key:** syntax is validated without issuing a tax-valid CFDI.
- **With a CSD and live key:** it stamps for real with the SAT.
