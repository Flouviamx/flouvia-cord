---
title: "Test Environment (Sandbox)"
description: "Simulate payments, declines, and invoices without real money."
category: "Developers"
---

Integrating a payment and billing system requires a secure environment to experiment without the fear of spending money or getting into legal trouble with the tax authority (SAT). For this reason, we have provided every Cord organization with a parallel Sandbox (Testing) environment.

### Activate Test Mode

On your main dashboard, locate the top button or toggle called **Test Mode** and activate it. The interface will turn orange.

In this alternative environment:
- All customers, quotes, and invoices created here are fake and do not exist in Production.
- **Fake Payments:** You can test your customer's experience using provided test cards (e.g., the famous Visa test card ending in `4242`).
- **Simulated Stamping:** When issuing a CFDI in this environment, the invoice is validated by an engine that checks the SAT syntax (ensuring codes and calculations match), but it **DOES NOT** send the official XML to the SAT. This way, your accountant won't lose their mind.

Make sure to use the Test API Keys (`sk_test_...`) in your code while developing.
