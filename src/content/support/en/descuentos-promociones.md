---
title: "Apply discounts or promotions"
description: "Add line-item or total discounts to your proposal."
category: "Quotes"
---

Flexibility in B2B negotiation is vital. Cord allows you to apply discounts both at the individual line-item level and globally on the quote.

### Types of Discount

**1. Linear Discount (Per item):**
Ideal if you only want to discount a particular service (e.g., 20% off consulting, but the software license remains at full price).
- In the quote editor, click the `%` discount icon next to the item price. You can apply it as a percentage or as a fixed amount (e.g., -$500 MXN).

**2. Global Discount:**
Applies to the total sum of the subtotal.
- In the right configuration panel, under *Finance*, add a global discount.

**How does the SAT view this?**
When the quote is converted into an Invoice (CFDI 4.0), Cord perfectly maps the discounts to the tax XML in the `Descuento` (Discount) node, ensuring the transferred VAT calculation is based on the correct taxable base, preventing accounting discrepancies and mathematical errors with the SAT.
