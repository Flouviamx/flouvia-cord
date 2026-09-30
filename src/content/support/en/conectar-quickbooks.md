---
title: "Connect QuickBooks Online"
description: "Every final Cord invoice lands in your QuickBooks with its customer, its lines and its currency, without entering it twice."
category: "Cuenta y Equipo"
order: 27
---

With QuickBooks connected, every invoice you issue in Cord shows up in your accounting with its customer, its line items and its currency. You stop entering the same thing twice and stop reconciling at month end what was already in two places.

**QuickBooks has no drafts.** What comes in this way is posted to your books, so Cord only sends invoices that are already **final** on its side: never a draft, never a quote.

### Connect it

1. Go to **Settings › Integrations › QuickBooks Online**. You need the **Settings** permission.
2. Click **Connect QuickBooks** and authorize with the account that administers your company in QuickBooks.
3. When you return you will see the connected company name. From then on, every new invoice travels on its own.
4. If you already had issued invoices, click **Send the pending invoices** to push the last 50 that are missing.

### What it creates in your accounting

- **The customer**, if it does not exist. Cord looks it up by email first and then by name, so your list does not fill up with duplicates. Once found, it remembers it: the next invoice for that customer reuses the record.
- **The invoice**, with its date, due date, currency and one line per item, with the negotiated price and its discount already applied.
- **A service named "Cord"** the first time. QuickBooks does not accept a loose line with an amount: every sales line hangs off an item. Cord creates a single one and reuses it, instead of inventing an item per concept and cluttering your catalog.
- Cord's invoice number goes in the **private note**, not in the document number: your accounting's numbering is yours, and overwriting it can collide with your own sequence.

### What it does not do yet

- **It does not send payments.** You record the payment in QuickBooks as usual. It is on the list.
- **It does not send invoices with withholdings.** QuickBooks does not record them on a sales invoice.

Each line enters with the QuickBooks tax code whose rate matches Cord's. If that rate does not exist, the invoice is not sent and the card tells you which one to create.
- **Nothing flows from QuickBooks into Cord.** This runs one way.

### If something goes wrong

An invoice is never sent twice: Cord remembers which one landed in QuickBooks and does not repeat it. If the connection expires, the card says so and reconnecting is enough; invoices that did not make it are sent with **Send the pending invoices**.
