---
title: "Change Cord Subscription Plan"
description: "Manage your Cord billing plan, additional licenses and billing."
category: "Account & Team"
order: 4
---

The recurring revenue model requires billing automation (recurring billing). Cord has an advanced subscription engine.

### Create Plans and Products

1. Go to **Subscriptions > Products**.
2. Create your main product (e.g., "Enterprise SaaS Platform").
3. Create a **Billing Plan** associated with the product. You can define Monthly, Quarterly, or Annual cycles.

### Pricing Models
Cord supports complex SaaS subscription schemes:
- **Flat Rate:** The classic $99 USD/month.
- **Per Seat:** $15 USD for each active user the customer registers in your app.
- **Tiered/Metered:** Dynamic billing by consumption (e.g., The first 1,000 emails are free, the following cost $0.05c each).

The system will attempt to charge the customer's card automatically when the cycle renews. If the card fails, it will trigger a *Dunning* process (Collection Reminders), retrying the charge on days 3, 5, and 7. If it ultimately fails, it will cancel the membership and send you a webhook so you can cut off access in your app.
