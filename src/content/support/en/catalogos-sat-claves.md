---
title: "SAT product and unit keys on your invoices"
description: "How to give each product its SAT product or service key and unit key, and which key Cord uses when you don't."
category: "Invoicing"
order: 2
---

This applies only to organizations in **Mexico**: every item on a CFDI 4.0 carries a **Product or service key** (c_ClaveProdServ catalog, 8 digits) and a **Unit key** (c_ClaveUnidad catalog) from the SAT.

### Assign the keys to a product

1. In **Products**, open the product (or create a new one).
2. Under **E-invoicing (SAT, Mexico)**, type a word that describes what you sell in **SAT product or service key** (for example "software" or "consulting") and pick the key from the list. If you already know the key, type its 8 digits.
3. The **SAT unit key** fills itself from the product's **Unit**: "hour" is stamped as `HUR`, "month" as `MON`, "kg" as `KGM`, "service" as `E48`. If you need a different one, type it and it stays fixed (for example `ACT` for an activity).
4. Save the product.

From then on, every quote or invoice that includes the product is stamped with its keys. Keys are read at stamping time and saved in the CFDI: changing them later doesn't alter invoices already issued.

### Which key is used if you don't assign one

- **Item from a product without a product key:** the generic key `01010101` ("Not in the catalog").
- **Product without a unit key:** the one that matches its unit; if the unit isn't recognized, `H87` ("Piece").
- **Free line** (typed by hand, not from the catalog): `01010101` and `H87`.

Generic keys are valid for the SAT and don't block stamping, but they don't describe your business: your client can't classify the expense precisely. If your accountant asks for specific keys, assign them to your products.

<Callout type="info">
If the search doesn't respond, type the key's 8 digits directly. Cord checks that it has the catalog's shape before saving and before stamping.
</Callout>
