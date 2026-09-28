---
title: "Connect Excel"
description: "Every quote and every invoice as a row in your Excel workbook, in a real table, kept current on its own."
category: "Cuenta y Equipo"
order: 26
---

Cord writes your quotes and invoices into an Excel workbook of yours, in your OneDrive: one row per document, updated on its own when the document changes state. It is there for the usual work — totaling the month, filtering by client, building a chart — without exporting anything by hand.

**Cord creates the workbook and works only with that one.** The data goes into a real **Excel table**, not a loose range: that gives you filters, banded rows, a header that stays put as you scroll, and formulas by column name, such as `=SUM(CordCotizaciones[total])`.

### Connect it

1. Go to **Settings › Integrations › Microsoft Excel**. You need the **Settings** permission.
2. Click **Connect Excel** and authorize with your Microsoft work account.
3. When you return, Cord creates the workbook in your OneDrive and starts filling it with what you already had.
4. Click **Open the spreadsheet** to see it. The first fill takes a moment if you have a lot of history.

### What the spreadsheet holds

Two sheets, **Quotes** and **Invoices**, each with its own table (`CordCotizaciones` and `CordFacturas`) and one row per document:

- **Quotes:** number, client, status, date, valid until, currency, subtotal, discount, taxes, total, collected, and the public link.
- **Invoices:** number, client, status, fiscal status, date, due date, currency, total, paid, balance, and the public link.

Three details that make the sheet actually useful:

- **Amounts are numbers, not text.** You can sum, average and chart them without cleaning anything first.
- **Currency has its own column.** If you quote in two currencies, the sheet says so instead of hiding it inside the number, so you never add pesos to dollars by accident.
- **Dates use your account's time zone**, in `YYYY-MM-DD` format, which sorts correctly and both spreadsheets recognize as a date.

### How it stays current

When a quote is sent, approved, rejected, expires or is paid — and when an invoice is issued, sent, paid, falls overdue or is voided — Cord looks up its number in column A and **replaces that row**. If it cannot find it, it adds it at the end.

That is why you can sort, filter and even add your own columns to the right: Cord goes by the document number, not by the row position. The one thing to leave alone is **column A**, where that number lives.

The **Update now** button rewrites your latest 500 documents in each tab. Use it right after connecting, or whenever something looks off.

### If something goes wrong

- **"The connection to your spreadsheet stopped working":** access was revoked or the account password changed. Connect it again from the same card.
- **You deleted the file:** disconnect and connect again; Cord creates a new one.
- **You deleted the header row:** nothing breaks, Cord writes it again on the next update.
