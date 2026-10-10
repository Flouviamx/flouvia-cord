---
title: "Issue CFDI 4.0 from a quote or from scratch"
description: "How to stamp a sale's CFDI 4.0 from the approved quote or from Invoices, what Cord decides for you (PUE or PPD, use, payment method) and what to check before issuing."
category: "Invoicing"
order: 1
---

This applies to organizations in **Mexico** on **Starter** or above with the CSD uploaded under **Settings › Invoicing › Tax details**. Stamping is always confirmed by a person: Cord does not stamp on its own when a payment comes in.

## From an approved quote

1. Open the **approved** or **paid** quote.
2. Click **Stamp CFDI 4.0**. You need the **Approvals** permission.
3. Cord copies the items, prices, discounts, taxes, withholdings, SAT keys and the exchange rate locked when quoting, and what was collected on the quote moves to the invoice.
4. The CFDI is stamped with its tax folio and you send it to your client from its detail.

If the button reads **Issue pro forma** in your account, your plan does not include fiscal issuance or you chose the commercial option.

## Without a quote

1. Go to **Invoices** and click **New invoice**.
2. Choose the client and add items (from your catalog or free lines). Below each item you see its SAT key and can change it.
3. Under **Document type**, keep **CFDI 4.0** (or choose **Pro forma** if you do not want to stamp).
4. Under **CFDI details**, **CFDI use** and **Payment method** stay on automatic; change them only if your client asks.
5. Under **Review and issue**, click **Issue and send** (or **Issue without sending**). A final review shows client, total, due date and email before stamping.

The number is assigned at issuance: a draft uses no number and no allowance. If stamping completes and the email fails, the number is kept and you resend from the detail.

## What Cord decides for you

- **Payment method type:** if the invoice is already paid when stamped it is issued **PUE**; if not, **PPD** with method 99, and each later payment gets its automatic payment complement. See [PPD invoices and payment complements](/en/support/complementos-de-pago).
- **Payment method:** the one of the largest payment, unless you set it under **CFDI details**.
- **CFDI use:** the one on the client's profile (or your account's default use); S01 if the client is abroad.
- **Recipient:** RFC, legal name, regime and zip code from the client's profile. Without an RFC, the generic XAXX010101000 with regime 616 and your issuing zip code.
- **SAT keys:** the line's, then the product's and, with neither, 01010101 and H87. The editor tells you how many items would use the generic key.

## Before issuing

- That the client's profile has the details from their tax certificate.
- That each item has its SAT key.
- That rates are IVA 16%, IVA 8% or exempt: Cord's CFDI does not issue IEPS or taxable 0% VAT (a 0% item is issued as exempt).

Once stamped, a CFDI is not edited: it is corrected with **Replace CFDI** or with a credit note. See [Void invoices and check cancellations](/en/support/cancelar-facturas).

## Related

- [How to invoice in Mexico with Cord](/en/support/facturar-en-mexico)
- [SAT product and unit keys](/en/support/catalogos-sat-claves)
- [General public invoicing and the global invoice](/en/support/facturar-publico-general)
