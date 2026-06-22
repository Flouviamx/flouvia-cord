---
title: "Invoicing Foreign Customers"
description: "Usage of the generic foreign RFC and Tax ID."
category: "Billing & CFDI"
---

Selling services or software licenses to customers outside of Mexico requires the issuance of a service export CFDI.

### The Foreign RFC

The SAT provides a generic international RFC that you must use whenever your customer resides in another country: **XEXX010101000**.

### Configuring the Invoice in Cord

1. Add your foreign customer to the Cord database. In the RFC field, enter `XEXX010101000`.
2. The system will detect that it is a foreign RFC and will allow you to enter their Tax Identification Number (Tax ID / EIN) from their country of origin (optional but recommended).
3. When creating the quote or invoice, select **CFDI Usage: S01 (Without tax effects)**, since the foreign recipient does not deduct taxes with the Mexican tax authority.
4. Configure the invoice **Currency** to USD (or the corresponding one) and select the **0% VAT Rate** (by law, the export of IT services taxed in Mexico and utilized abroad has a zero rate).

Cord will stamp the XML with the `ResidenciaFiscal` and `NumRegIdTrib` nodes required by the authority.
