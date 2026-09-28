---
title: "Connect Xero"
description: "Every final Cord invoice lands in your Xero as a draft, with its contact, its lines and its currency."
category: "Cuenta y Equipo"
order: 28
---

With Xero connected, every invoice you issue in Cord shows up in your accounting with its contact, its line items and its currency. You stop entering the same thing twice.

**It arrives as a DRAFT, and you approve it.** An outside system should not post to anyone's books on its own: Cord leaves the invoice ready and your accountant reviews it before approving.

### Connect it

1. Go to **Settings › Integrations › Xero**. You need the **Settings** permission.
2. Click **Connect Xero** and authorize. Xero asks which organisation to grant access to: choose your company's.
3. When you return you will see the connected organisation name. From then on, every new invoice travels on its own.
4. If you already had issued invoices, click **Send the pending invoices** to push the last 50 that are missing.

### What it creates in your accounting

- **The contact**, if it does not exist, looking it up by email first so it is not duplicated. Once found, it remembers it.
- **The sales invoice** (`ACCREC`) in **DRAFT** status, with its date, due date, currency, Cord's invoice number in the reference, and one line per item with the negotiated price and its discount already applied.
- Amounts are declared **tax exclusive**, because Cord already calculated tax per line on its side and we do not want Xero applying its default tax on top.

### What it does not do yet

- **It does not approve the invoice.** That is deliberate: you approve it in Xero.
- **It does not send payments** or map your tax codes. Check the tax on the first invoice before approving it.
- **Nothing flows from Xero into Cord.** This runs one way.

### If something goes wrong

An invoice is never sent twice: Cord remembers which one landed in Xero. If the connection expires — Xero rotates its access every 30 minutes and revokes the previous one — the card says so and reconnecting is enough.
