---
title: "Configure quote validity"
description: "Add an automatic expiration date to your proposals."
category: "Quotes"
---

Market conditions and supply prices change constantly. Never send a commercial proposal with an undetermined validity.

### Configure validity

When drafting a quote in Cord:
1. In the right-hand panel, locate the **Validity** field.
2. Choose how many days the offer is valid starting today — the options are 15, 30, 60 days, or whatever default you set for your organization. This isn't a calendar date picker: validity is always defined in days, and the exact expiration date is calculated for you.

**Automatic closure:**
Once the validity date has passed without the client deciding:
- The public link shows "Expired" in the quote's header.
- A daily job marks the quote as **expired** when it was still in "sent" or "viewed" status with no response. From that point on, accepting, rejecting, or sending a counteroffer from the public link is rejected server-side with a notice that the quote no longer accepts changes — you don't need to check each folio manually. Because this job runs once a day, there can be a window of up to 24 hours after the deadline where the quote is technically still open.
- This validity window only applies to the client's **decision** (accept/reject). If the quote was already approved under credit terms (Net 30/60), payment is governed by that term's due date, not by validity — see [Add credit terms](/en/support/terminos-de-credito).

If the client reaches out to revive an expired deal, edit the quote: saving the changes generates a new version with fresh validity starting from that moment.
