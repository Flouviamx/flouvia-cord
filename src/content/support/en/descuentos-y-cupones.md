---
title: "Document discounts and coupons"
description: "How to apply a percentage or amount discount to a whole quote or invoice, create coupons with validity and usage limits, when a use is counted and how it shows on the CFDI and other documents."
category: "Quotes"
order: 6
---

Besides negotiating each line's price, you can discount **the whole sale**: a **document discount** by percentage or amount, or a **coupon** with a code you create once and apply on quotes and invoices. The discount is applied **before taxes** and Cord spreads it across the lines in proportion to their amount.

**In short:**

- **Where it is applied:** in the summary of the quote and invoice editors, with **+ Add discount or coupon**: **Percent**, **Amount** or **Coupon**.
- **Coupons:** created under **Settings › Discounts › Coupons** with code, type, value, validity, currency (for an amount) and total and per-client usage limits.
- **A coupon takes precedence over a manual discount:** a document carries one or the other.
- **A use is counted** when the invoice is issued or the quote is approved, and returned if the invoice is voided, the draft is deleted or the quote is rejected.
- **On every plan.** Creating coupons requires the **Settings** permission; applying them, the **Quotes** permission.
- **Tax documents:** the CFDI declares the discount on each item, and the other documents spread it per line; the PDF shows the gross amount and a "Discount" row with the coupon code.

## Apply a discount in the editor

1. In a quote or invoice editor, go to the summary and click **+ Add discount or coupon**.
2. Choose **Percent** (0 to 100) or **Amount** (in the document's currency) and enter the value.
3. Or choose **Coupon**, enter the code and click **Apply**. Cord checks it right away and tells you if it does not apply.
4. Subtotal, taxes and total are recalculated live. To take it off, click **Remove**.

An amount larger than the subtotal is capped at the subtotal. With tax-inclusive prices, the amount reduces what the client pays and the base is broken out afterwards. Withholdings are calculated on the discounted bases.

## Create a coupon

1. Open **Settings › Discounts › Coupons** and click **New coupon**.
2. **Code:** 3 to 32 letters, numbers, hyphen or underscore (for example `WELCOME10`). It is unique in your business.
3. **Name (optional)**, to recognize it in the list.
4. **Discount:** **Percentage** or **Fixed amount**, and its **Value**. A fixed amount requires its **Currency**: it only applies to documents in that currency.
5. **Valid from** and **Valid until** (optional), in your business time zone.
6. **Total uses** and **Uses per client** (optional; with no value, there is no limit).
7. Click **Create coupon**.

The code, type, value and currency do not change once created: for another value, create another coupon. A **deactivated** coupon can no longer be applied to new documents; those that already carry it keep it. A coupon that was already used cannot be deleted: deactivate it.

## When a use is counted

- **Invoice:** when it is issued, before the number is reserved. If the uses ran out, the invoice is not issued and you see it in its activity.
- **Quote:** when it is approved. If the uses ran out, the approval does not go through.
- **The invoice of a quote** reuses the quote's use: it does not count twice.
- **It is returned** if you void the invoice, delete the draft or the quote is rejected.

Validity and whether the coupon is active are checked **when it is applied**: a coupon already applied to a document is kept even if you edit that document after it expires.

## Messages when applying a coupon

| Message | What happens |
|---|---|
| "That coupon does not exist" | The code is not in your business. |
| "That coupon is deactivated" | Activate it under **Coupons** or use another one. |
| "That coupon is not valid yet" or "has expired" | Outside its validity dates. |
| "That coupon is in a different currency than this document" | A fixed-amount coupon only applies in its currency. |
| "That coupon has no uses left" | It reached its total limit. |
| "This client has already used that coupon as many times as allowed" | It reached its per-client limit. |
| "That coupon is limited per client: choose a client first" | Choose the client before applying it. |

## Discounts and approvals

If your business has approval workflows (**Settings › Quotes › Approvals**), a **manual discount** counts toward the discount threshold that requires approval; a **coupon** does not, because whoever created it already authorized it.

## Coupons on your website

Your buyers can enter a code in the **embeddable quote builder** on your site (Cord Elements), and it is checked the same way as in the editor.

## How it shows on each document

- **PDF and links:** each item shows its **gross** amount and the totals show the **Discount** row with the coupon code, if any.
- **CFDI (Mexico):** each item carries its share of the discount in the discount field. An item the discount brings to zero cannot be stamped. The global invoice declares each sale's discount, and a sale with a 100% discount is left out.
- **Verifactu (Spain):** declares the discounted base.
- **Factur-X, XRechnung and Peppol:** each line carries its gross amount and the discount as a document allowance per tax rate.
- **LatAm rails** (once active): ARCA reports it as a bonus, the NFS-e as an unconditional discount, the NF-e per item, the SII per line and the DIAN as a discount on each line.
- **Credit note:** spreads the discount the same way as the invoice.

## Duplicate, repeat and replace

- **Duplicate invoice** copies the gross price and the discount separately.
- A recurring invoice (**More actions › Repeat monthly**) only carries a manual discount, not a coupon.
- **Replacing a CFDI** inherits the original's discount as is, with its coupon and without checking it again; the use is not counted twice.
- A **partial approval** and the invoice of a quote apply the discount again on what was approved.

## Related

- [Apply discounts or promotions](/en/support/descuentos-promociones)
- [Products and discounts in the documentation](https://docs.cordhq.app/en/docs/cotizacion/productos)
