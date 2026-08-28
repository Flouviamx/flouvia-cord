---
title: "Approve and reject deals (Customer flow)"
description: "How quote approval works from the end customer's perspective."
category: "Quotes"
order: 2
---

Cord allows you to configure an internal approval flow to prevent sales representatives from sending quotes with excessive discounts without supervision.

### Configure Approval Rules

1. Go to **Settings > Quotes > Approvals**.
2. Under **Thresholds**, set up to three independent caps (leave any at 0 to turn it off):
   - **Maximum discount (%):** the discount % off list price on any line item.
   - **Maximum amount:** the quote's total, in the sale currency.
   - **Minimum gross margin (%):** only applies to line items that have a unit cost entered.
3. Save. There's no free-text rule builder — these are the three numeric thresholds, evaluated together; crossing any one of them triggers approval.

### Sales Representative Experience
When a sales representative tries to send a quote that crosses any of the three thresholds, the quote is saved as a pending draft instead of being sent, tagged with the exact reason (for example, "discount 22% exceeds the 15% allowed"). Only team members with the **Approve** permission — typically owner/admin, configurable per person under **Settings > Team & roles** — see the **Approve and send** / **Reject** buttons on the quote.

Once approved, the quote is sent to the customer at that moment and the public link becomes available. While pending, or if rejected, the link is never shared with the customer — it isn't that the URL exists and returns an error; the quote simply hasn't been sent yet.
