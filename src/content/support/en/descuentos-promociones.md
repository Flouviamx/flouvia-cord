---
title: "Apply discounts or promotions"
description: "Add line-item or total discounts to your proposal."
category: "Quotes"
---

Flexibility in negotiation is vital. Cord doesn't have a separate "% discount" field: the discount lives directly in each line item's price, plus two mechanisms that automate it. There is no global discount on the subtotal — every line is negotiated on its own.

### How it works

**1. Negotiated price per line item:**
Every row in the quote has two columns: **List** (the catalog price) and **Negotiated** (the final price you're charging this client). To give a discount, edit the Negotiated field directly — for example, lower it from $1,000 to $800. Cord calculates the resulting discount % and shows it next to that line's gross margin (if you entered the product's cost), so you see in real time how much margin you're giving up. You can leave one item at full price and discount only another within the same quote.

**2. Automatic discount by client tier or volume:**
If the client has a **discount %** configured on their profile (**Clients > [client] > tier/discount**), the editor applies that percentage automatically when you add each line item — you can override it by hand on any line. If the product also has volume pricing set up in the catalog, the negotiated price adjusts based on the quantity entered.

**Guardrail against excessive discounts:**
If your organization has the approval flow enabled (**Settings > Quotes > Approvals**), a per-line discount that exceeds the configured maximum % — or that leaves the gross margin below the minimum — blocks direct sending and requires approval before the quote reaches the client.

**Tax note (Mexico):** when invoicing a quote with negotiated prices, the CFDI 4.0 declares the discount in the `Descuento` node against the correct taxable base. Outside Mexico this doesn't apply: each country's fiscal document simply reflects the already-negotiated price, without a SAT-specific discount node.
