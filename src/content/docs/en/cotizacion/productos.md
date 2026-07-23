---
title: "Products and discounts"
description: "Add SKUs, group items into kits, and negotiate prices."
---

<header class="content-header">
  <h1 class="page-title">Products and discounts</h1>
  <p class="page-subtitle">Build your commercial proposal by adding items, grouping into kits, and negotiating the perfect price.</p>
</header>

## Ways to build your Catalog

Before adding products to a quote, Cord allows you to nourish your base catalog in different ways:

1. **Manual Creation:** Add SKUs one by one, defining their Base Price, name, description, and SAT Product/Service Key.
2. **Bulk Import via CSV / Excel:** Download our template, paste your inventory from your current ERP (SAP, Microsip, Excel), and upload it. You can update thousands of prices in a single batch.
3. **Product Kits (Bundles):** If you usually sell the same things together (e.g., *Point of Sale Kit: Computer + Barcode Scanner + Thermal Printer*), you can create a **Kit** in Cord. When quoting, simply select the Kit and the system will automatically add all its parts, saving you from searching for and adding the same items multiple times.

## Adding line items to the quote

In the **Line Items** section of the quoter, you have two options:

1. **Search the Catalog:** Use the search bar to find the products, services, or Kits you already configured with their SAT keys.
2. **Free-text Line Item:** If you need to quote something unique on the fly (e.g., *A special weekend installation service*), you can add a **Free Line**. You simply type any name you want, set the quantity, and assign whatever price you want right there, without having to go create a product in the catalog first.

For each item you add, you can customize:
- **Quantity:** Number of units.
- **Override Unit Price:** The system will load the Base Price from your catalog, but you can freely edit it on the spot (e.g., lower it from $500 to $450) for that specific quote without affecting the general catalog.
- **Notes for the client:** Add notes or long descriptions right below the product. If you sell "Consulting", you can add a note: *"Includes 10 hours of frontend development and 2 hours of design"*. The client will see these notes under each item in the web link.

### Smart Discounts

B2B thrives on negotiation. Cord handles discounts hierarchically:

1. **Client Tier Discount (Automatic):** If you selected a VIP client, Cord has already applied their base discount automatically.
2. **Line item discount:** Applied only to a specific product (e.g., *20% off Software, but Hardware is charged full price*).
3. **Global discount:** Applied to the subtotal of the entire quote. You can enter it as a percentage (*10%*) or a fixed amount (*-$5,000 MXN*).

> **Important for the SAT:** All discounts in Cord are applied mathematically **before** calculating taxes (VAT/IEPS), strictly complying with CFDI 4.0 rounding rules. You don't have to worry about cent mismatches.

## Real-Time Calculation

As you add products or modify discounts, Cord instantly updates the breakdown at the bottom of the screen:
- **Subtotal:** Sum of all line items without taxes.
- **Discounts:** Total subtracted.
- **Taxes (VAT / IEPS):** Calculated based on the tax rules of each product.
- **Total:** What the client will ultimately pay.
