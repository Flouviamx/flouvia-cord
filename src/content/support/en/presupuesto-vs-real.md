---
title: "Budget vs. Actuals: compare your plan against what really happened"
description: "Connect rows of your schedules to your closed sales, units sold, or collections received and see the variance month by month, with zero data entry."
category: "Budgets & Analysis"
order: 2
---

**Budget vs. Actuals** is what a spreadsheet cannot do: since your sales and collections already live in Cord, your budget can compare itself against reality **automatically, month by month**. Under each budgeted cell you'll see the actual figure for that month with its variance — green if you're above plan, red if you're below.

> [!NOTE]
> Available from the **Professional** plan. On plans without the feature, the connect button shows you what it unlocks.

## Connecting a row

1. Open a schedule under **Budgets** and find the row you want to compare (it can be an input or a formula row).
2. Press the **link icon** next to the row's name.
3. Choose the data source:
   - **Closed sales ($)** — the total of your approved, paid, or invoiced quotes, by closing month.
   - **Units sold** — the quantities from the accepted lines of those quotes.
   - **Collections received ($)** — money actually collected (quote payments, deposits, balances, and installments), by collection month.
4. Save. The row is marked with a green link and a "vs." tag with its source; the schedule shows the **Connected to real data** badge.

To change the source or disconnect the row, press the link icon again.

## How months are matched

Cord reads each **period label** to know which month to compare against:

- Formats like `Jan 2026`, `January 2026`, `2026-01`, or `01/2026` work.
- Labels without a recognizable month and year (e.g. `Q1`, `Week 3`, or `Jan` with no year) **don't show an actual** — the budgeted cell renders normally, with no actual line below.
- **Future months** don't show actuals either: the figure appears once the month arrives.
- A past month **with no activity** shows `actual 0` — that's information too.

> [!TIP]
> If you create the schedule with the period presets (Quarter, 6 months, Full year), the labels already come in the right format.

## Reading the variance

Under each cell you'll see `actual $X` followed by a pill with the percentage against the budget:

- **Green (+13%)** — the actual met or beat your budget.
- **Red (−8%)** — the actual came in below plan.

The comparison uses the same criteria as the rest of Cord's reports: closed sales follow the Analytics criterion, and collections add up payments actually received, with no double counting.

## The shortcut: a plan that's already connected

If you create your budget with the **Full financial plan** (the one-click wizard), the Sales and Collections rows come pre-connected to their real sources — nothing to configure.
