---
title: "Export a report to CSV (Excel and Google Sheets)"
description: "Download any table report in one click: what the file contains, how amounts and currency come through, and how to open it in Excel with accents intact."
category: "Reports & Analytics"
order: 4
---

Every table report downloads as a CSV file, ready for Excel, Google Sheets, or your accounting system. The file contains exactly what you see on screen, with numbers as numbers.

### Which reports export

- **Sales over time**
- **Sales by client**
- **Sales by product**
- **Repeat purchase by cohort**
- **Payments received**
- **Invoiced taxes**
- **Sales by team member**
- **Custom report**, including the reports you saved

Widget reports (**Overview**, **Commercial diagnosis**, **Clients**, **Products**, **Finance**, **Cash flow · 90 days**, and **Collections and receivables**) don't export. If you need that data in a spreadsheet, the **Custom report** can almost always build the equivalent table.

### How to export

1. Open **Reports** and pick the report in the picker.
2. Set the period with the date picker. In **Sales over time**, also choose **Day**, **Week**, or **Month**; in the **Custom report**, the grouping and metrics.
3. Click **Export CSV**, above the key figures.
4. The file downloads with a name like `cord-ventas-cliente-2026-09-01_2026-09-30.csv`: the report and the exported period. **Repeat purchase by cohort**, which doesn't depend on dates, carries today's date: `cord-recompra-2026-10-08.csv`.

If the table is empty ("No data in this range"), the button doesn't appear: there's nothing to export.

### What the file contains

- **The same columns as the table**, named in your account's language, and one row per table row.
- **Amounts as numbers**, with no currency symbol or thousands separators and a decimal point: `48250.50` (or `48250` if it's a whole number), not `$48,250.50`. You can sum, filter, and build pivot tables without cleaning anything.
- **The currency in its own column.** If the report has amounts, the last column is **Currency**, with your business's base currency code (for example `USD` or `EUR`) on every row. All amounts in the file are in that currency.
- **Percentages as whole numbers:** a **Close rate** of 43% comes through as `43`.
- **Dates as year-month-day:** `2026-09-30`. In reports grouped by week, the date is that week's Monday; by month, the 1st.
- **Payment methods by name**, as on screen: **Card**, **Bank transfer**, **Cash**, **Recorded manually**.
- **Empty cells** where the table shows a dash (—), for example a margin with no captured cost.

The file does **not** include the **Total** row: that way you can sum or filter rows without counting twice. If you need the total, add it up in the spreadsheet or take it from the screen.

How much it contains: the full table for the period, with the same limits as the screen (up to 500 clients, products, or groups, and the 1,000 most recent payments in the period).

### Open the file in Excel

The CSV is encoded in UTF-8 with the marker Excel needs to read accented characters, and separates columns with commas.

- **If your Excel uses commas to separate lists** (the usual setting in the United States and Mexico), open it with a double click: each value lands in its column and accents look right.
- **If everything shows up in a single column** (Excel set to semicolons, common in Spain and other countries), don't open it with a double click. In Excel go to **Data › From Text/CSV**, choose the file, select **Comma** as the delimiter and, if decimals come out wrong, set the wizard's locale to one that uses a decimal point. Click **Load**.
- **In Google Sheets**, go to **File › Import › Upload** and choose the file. Sheets detects the commas and accents on its own.

### Formula protection

If a text value in the file starts with `=`, `+`, `-`, or `@` (for example, a client saved as `=HYPERLINK(...)`), Cord prefixes it with an apostrophe so Excel or Sheets display it as text instead of running it. Amounts aren't touched: they travel as numbers.

### Who can export

Anyone who can see the report. **Payments received** also requires the **Collections** permission. Exporting is included on every plan.

### Frequently asked questions

**Does the CSV respect the period I'm looking at?** Yes. It exports the range, grouping, and metrics shown on screen, not a period saved somewhere else.

**Can I get the CSV automatically?** Yes, with a saved custom report with email delivery: every Monday or every 1st you get the period that just ended with the CSV attached. See [Get a report by email](/en/support/recibir-informes-por-correo).

**Why don't the amounts have a currency symbol?** So they're real numbers in your spreadsheet. The currency is in the **Currency** column.

**I sell in several currencies. How does that come through?** Everything is converted to your business's base currency with the best available rate, and the **Currency** column says which. See [Amounts in multiple currencies and time zone](/en/support/importes-en-varias-divisas-informes).

Full guide: [Reports and sales performance](/en/docs/gestion/informes).
