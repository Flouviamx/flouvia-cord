---
title: "Apply discounts or promotions"
description: "Negotiate each line item's price, apply the client's automatic discount or a discount on the whole document."
category: "Quotes"
---

Flexibility in negotiation is vital. Cord offers three ways to give a discount: negotiating each line item's price, the automatic discount by client tier or volume, and a **document discount** (by percentage, amount or coupon) on the whole sale. This article covers the first two; the third is in [Document discounts and coupons](/en/support/descuentos-y-cupones).

### How it works

**1. Negotiated price per line item:**
Every row in the quote has two columns: **List** (the catalog price) and **Negotiated** (the final price you're charging this client). To give a discount, edit the Negotiated field directly — for example, lower it from MXN 1,000 to MXN 800. Cord calculates the resulting discount % and shows it next to that line's gross margin (if you entered the product's cost), so you see in real time how much margin you're giving up. You can leave one item at full price and discount only another within the same quote.

**2. Automatic discount by client tier or volume:**
If the client has a **discount %** configured on their profile (**Clients > [client] > tier/discount**), the editor applies that percentage automatically when you add each line item — you can override it by hand on any line. If the product also has volume pricing set up in the catalog, the negotiated price adjusts based on the quantity entered.

**Guardrail against excessive discounts:**
If your organization has the approval flow enabled (**Settings > Quotes > Approvals**), a per-line discount that exceeds the configured maximum % — or that leaves the gross margin below the minimum — blocks direct sending and requires approval before the quote reaches the client.

**Discount on the whole sale:** to lower the total (for example, 10% or a `WELCOME10` coupon), use **+ Add discount or coupon** in the editor summary. See [Document discounts and coupons](/en/support/descuentos-y-cupones).

**Tax note:** a negotiated price is the line's price: the CFDI and the other documents declare it as its unit value, without a separate discount. The document discount or a coupon, on the other hand, is declared as a discount on each item (in Mexico, on each item of the CFDI).
