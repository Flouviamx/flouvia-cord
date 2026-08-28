---
title: "Testing Cord without affecting production"
description: "How to experiment with payments and stamping without spending money or stamping for real."
category: "Developers"
---

Before going live you'll want to test the flow (send a quote, collect, stamp) risk-free. Cord has a real **Test environment**: a mirror organization (`orgs.sandbox_of`), fully isolated from your production data.

### Turning on the Test environment

Open the organization switcher (top left) and turn on **Test environment**. The app navigates to a 1:1 space with the same look as your account (branding, quote-number prefix, plan) but its own quotes, clients, products, and invoices — nothing you do there touches your real data. A persistent banner reminds you while you're inside.

- **Clear test data:** from that same banner, "Clear test data" fully deletes the mirror organization (cascading); the next time you enter the test environment it's recreated clean.
- **Test-mode API keys:** an `sk_test_...` key (**API** tab of the Developers dock, turn it on in Settings) automatically resolves against this same mirror organization — it doesn't consume your usage meter or count toward billing. See [Authentication and API Keys](/en/support/claves-api).
- **CFDI stamping:** inside the test environment, stamping follows the same rules as production based on whether you have your CSD connected (see below) — the isolation comes from the organization, not a forced simulation.

### What the Test environment does NOT cover: card payments

Cord Payments (connecting a payment account) is deliberately blocked inside the mirror organization — you cannot connect a test payment account from there. The public link of a production organization processes real transactions and **must not be tested with laboratory card numbers**. To simulate card payments (approval, 3D Secure, declines), ask support for a dedicated isolated environment. Never use a real card to simulate failures.

### Testing stamping (CFDI)

Stamping depends on whether you have your CSD connected:
- **No CSD connected:** Cord returns a **simulated** stamp (marked as such), sending nothing to the SAT. Ideal to test the flow without affecting your accountant.
- **With a test CSD:** syntax is validated without issuing a tax-valid CFDI.
- **With a real CSD connected:** it stamps for real with the SAT.
