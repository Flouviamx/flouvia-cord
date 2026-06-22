---
title: "Authentication and API Keys"
description: "Learn how to generate and authenticate your requests to Cord's REST API."
category: "Developers"
order: 1
---

Your API Keys are the gateway to your account. Treat them with the same care as your database password.

### Environments (Live vs Test)

In the **Developers > API Keys** section you will find two pairs of keys:
- **Test Mode (`sk_test_...`):** Use them for development. They do not generate real charges to cards nor do they stamp real invoices before the SAT (they simulate them).
- **Live Mode (`sk_live_...`):** Use them in your production environment. Every charge is real and every CFDI has legal validity.

### Key Rotation
If you suspect that your secret key has been leaked (e.g. mistakenly uploaded to GitHub):
1. Immediately enter the API Keys panel.
2. Click on the three dots button next to your live key and select **"Roll Key"**.
3. The system will give you a new key instantly and you have the option for the old one to stop working immediately, or to give it a 24-hour grace period so you can update your servers without taking down your application in production.
