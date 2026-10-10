---
title: "SAT product and unit keys on your invoices"
description: "Which key each item is stamped with, how to set it per product or per line, and when the generic 01010101 is used."
category: "Invoicing"
order: 2
---

This applies only to organizations in **Mexico**: every item on a CFDI 4.0 carries a Product or Service Key (`c_ClaveProdServ`, 8 digits) and a Unit Key (`c_ClaveUnidad`, such as `H87`, `E48` or `HUR`) from the SAT catalogs.

### Which key each item is stamped with

Cord picks the keys of each line in this order, field by field:

1. **The line's own key.** If you chose it in the editor (or sent it through the API), it wins.
2. **The product's key.** If the line comes from a catalog product that has SAT keys, those are used. Without a unit key, Cord derives it from the unit you wrote on the product ("hour" is `HUR`, "service" is `E48`).
3. **The SAT generic keys.** Without any of the above, the item goes out as `01010101` ("Not in the catalog") with unit `H87` ("Piece"). They are valid keys and don't block stamping, but they don't describe what you sell and your client can't classify the expense.

Keys are frozen on the invoice when you save it: changing the product's key later doesn't rewrite an invoice already issued.

### Set the key per product

In **Products**, open the product and fill in **E-invoicing (SAT, Mexico)**. You can search the key by description ("consulting", "software") or type the 8 digits. You can also import them in your products CSV with the columns `clave_sat` and `clave_unidad_sat`; the catalog export includes them.

### Set the key on a line

In the invoice and quote editors, each item shows its SAT key right below it. Tap the key to change it: you search the same SAT catalog, pick the unit and apply. It's mainly for free lines ("Freight", "March consulting") that don't come from a product.

If a line would be stamped with the generic `01010101`, the editor flags it on the line itself and, before issuing the invoice, tells you how many items would go out that way.

### Through the API

Each item of `POST /v1/facturas` and `POST /v1/cotizaciones` accepts `clave_sat` and `clave_unidad_sat`. A key with an invalid format is rejected when saving, naming the item, instead of failing at stamping time.

<Callout type="info">

When you **duplicate** an invoice, the copy keeps the SAT keys each item was stamped with.

</Callout>
