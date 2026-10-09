---
title: "General Public invoicing and the global invoice"
description: "When to use the generic RFC and how to issue the period's global invoice."
category: "Invoicing"
---

This applies only to organizations in **Mexico**. The sales you collect without
the client asking for an invoice — counter sales, payments where nobody asked
for a CFDI — are documented to the SAT in a **global invoice** for the period,
addressed to **PUBLICO EN GENERAL** with the generic RFC **XAXX010101000**.

## Issue the global invoice

1. Open **Invoices** and click **Global invoice**.
2. Choose the **frequency** (daily, weekly, fortnightly or monthly), the
   **month** and the **year** it declares. The two-month frequency only appears
   if your tax regime is Incorporación Fiscal (621). For daily, weekly or
   fortnightly, also pick the days it covers, within that month.
3. Click **Show sales for the period**. Cord lists the quotes **collected** on
   those dates that have no invoice of their own and are not in another global
   invoice. Untick the ones you do not want to include.
4. Check the **payment method**. Cord suggests the one of the largest sale, as
   the SAT requires.
5. Click **Issue global invoice**.

Each sale goes in as one item with product key **01010101**, unit **ACT** and
the quote number as its identification number. If the sale had a discount or a
coupon, the item declares it as its **Discount**: the global invoice covers what
you actually collected. The CFDI is issued in Mexican
pesos, with payment method **PUE**, use **S01** and your business's tax postal
code as the recipient's address. That is why Cord asks you to enter it in
**Settings › Tax details** before issuing it.

The SAT requires issuing the global invoice no later than 24 hours after the
period closes.

### Sales left out

Cord tells you why a sale of the period does not appear:

- it already has its own invoice, or it is already in another global invoice;
- it was collected in another currency (the global invoice is issued in pesos);
- it has withholdings (the SAT requires one invoice per transaction with withholdings);
- the client is abroad (it needs an individual invoice);
- it has a VAT rate other than 0%, 8% or 16%;
- it has no amount to document (a 100% discount).

While a sale is in a valid global invoice, Cord does not let you issue an
individual invoice for it: the same sale would be invoiced twice.

## If a client asks for their invoice later

1. Open the global invoice and use **More actions › Void invoice** with reason
   **04 · Named transaction included in a global invoice**.
2. Once the cancellation is confirmed, its sales are free again. Click **Issue
   the period's global invoice again**, which opens the same frequency, month
   and year, and untick the client's sale.
3. Issue the client's invoice from their quote.

## An individual invoice to a client without an RFC

If you issue an invoice to a client with no RFC on file, Cord stamps it with the
generic RFC XAXX010101000, tax regime 616 and your business's tax postal code,
and with **your client's name**. The name "PUBLICO EN GENERAL" is reserved for
the global invoice: with that name the SAT requires the period details, so Cord
does not allow it on an individual invoice.
