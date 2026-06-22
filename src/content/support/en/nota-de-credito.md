---
title: "Issue Credit Note (Expense)"
description: "Apply legal refunds and bonuses."
category: "Billing & CFDI"
---

Credit Notes (Expense type CFDI) are the SAT's fiscal mechanism to apply refunds, bonuses, or correct errors in invoice balances.

### Issue a Credit Note in Cord

If you need to cancel an invoice balance without canceling it completely (e.g., you gave a 10% post-sale discount to the customer):

1. Locate the original Income Invoice in **Accounting > Invoices**.
2. In the options menu (three dots), select **Generate Credit Note**.
3. A panel will open with the original invoice concepts. Cord will automatically inject the relationship type **01 (Credit note of related documents)** and link the parent invoice's UUID.
4. Adjust the amount to refund/bonus. If it is a full refund of a specific product, leave the price intact. If it is a bonus, adjust the value to the amount to discount.
5. Click on **Stamp Expense**.

The system will automatically send an email to the customer attaching the XML and PDF of the Credit Note for their fiscal deduction purposes.
