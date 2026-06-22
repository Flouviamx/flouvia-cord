---
title: "Approve and reject deals (Customer flow)"
description: "How quote approval works from the end customer's perspective."
category: "Quotes"
order: 2
---

Cord allows you to configure an internal approval flow to prevent sales representatives from sending quotes with excessive discounts without supervision.

### Configure Approval Rules

1. Go to **Settings > Sales and Quotes**.
2. Look for the **Internal Approval Flows** section.
3. Add a rule, for example: *"If the Total Discount exceeds 15%, Manager approval is required"*.

### Sales Representative Experience
When a sales representative attempts to send a quote that breaks this rule, the "Send to customer" button will change to **"Request Approval"**. The administrator or manager will receive a notification (via email and within the app).

Once the manager reviews it and clicks **Approve Deal**, the sales representative is given the green light and the public quote URL becomes active. If rejected, the URL will return a 404 error to the end customer until the conditions are corrected.
