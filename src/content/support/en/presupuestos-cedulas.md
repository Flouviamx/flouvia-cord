---
title: "Budget schedules: plan sales, production, and cash"
description: "Build the financial planning cascade (Sales, Production, Purchases, Collections, Cash) with templates, a one-click full plan, cross-schedule formulas, and comparison against your real data."
category: "Budgets & Analysis"
order: 1
---

**Budget schedules** are Cord's financial planning tool. They let you build the classic cost-accounting cascade —Sales → Production → Raw Material Purchases → Collections → Cash— without a spreadsheet that ends up disconnected from your operation, and **compare it against your real sales and collections** month by month. You'll find them under **Budgets** (side menu, Intelligence section).

> [!NOTE]
> Budgets require the **analytics** permission. The Free plan includes 1 schedule and Starter 3; from Professional you get unlimited schedules, the one-click full financial plan, the comparison against real data, and the analysis tools.

## Creating a budget

Press **+ New budget** and choose what you want to plan:

1. **Full financial plan (recommended, from Professional)** — the wizard creates the Sales → Collections → Cash cascade in one click, already connected across schedules (adjustable 40/30/30 staggered collections, month-by-month cash balance), seeded with your **real average sales from recent months**, and with the key rows already connected to [Budget vs. Actuals](/en/support/presupuesto-vs-real). Check the production box if your business carries inventory to also add Production and Raw Material Purchases. Requires at least 3 periods.
2. **Or an individual schedule** — each template seeds ready-to-edit rows:
   - **Sales** — the base row per period.
   - **Sales with adjustment factors** — base sales + unit adjustments, chained percentage factors (e.g. economic, distribution), and the final amount in pesos.
   - **Production** — Production = Sales + Desired ending inventory − Beginning inventory, pre-wired.
   - **Raw Material Purchases** — the same pattern over raw material consumption.
   - **Labor & Overhead** — input rows so you can build your own total cost.
   - **Collections** — credit sales distributed by the percentage collected in the current and following months.
   - **Cash** — staggered collections and payments per period, plus beginning and ending balance.
   - **Custom** — a blank schedule.
2. **Name** — accept the suggestion or type your own.
3. **Periods** — they come pre-filled with 6 months starting from the current month; use the presets (Quarter, 6 months, Full year) or type them comma-separated. Use the **"Month Year"** format (e.g. `Jan 2026`) so Cord can compare each column against your real data for that month, and the **same period names** across schedules that will reference each other.

## The grid: input rows and formula rows

Each schedule is a table of **line items (rows) × periods (columns)**. There are two row types:

- **Input** — you type it, cell by cell. It saves when you leave the cell.
- **Formula** — carries an **ƒx** badge, is shown in light gray and **recalculated automatically** when you change an input it depends on. Below the label you'll see the formula in plain language (e.g. `= Sales + Desired ending inv. − Beginning inv.`). When it recalculates, the affected cells briefly flash.

Each row also shows its **Total** (the sum across all periods) in the last column.

## Adding periods and duplicating

- **+ Period** (top bar of the editor) appends a month at the end of the schedule — Cord suggests the one after the last (e.g. after `Jun 2026`, it suggests `Jul 2026`). Up to 36 periods per schedule.
- **Duplicate** (copy icon in the budgets list) creates a full copy — rows, formulas and values. You can copy it with the **same periods** (to try another scenario for the same year) or **shifted to the next year** (`Jan 2026` → `Jan 2027`, ideal to kick off next year's plan from this base).

To rename the schedule, click its name. To delete a row, use the trash icon; if another formula referenced it, that formula will now compute 0 for that row.

## Building a formula

When you add a row and choose the **Formula** type, the term builder appears. Each term has:

- **Operation:**
  - **Add / subtract** — accumulates a row's value (positive coefficient adds, negative subtracts).
  - **% of another row** — applies a percentage change over the running total so far (e.g. +1% economic, then +3% distribution).
  - **× another row** — multiplies the running total by another full row (e.g. units × price).
- **Schedule** and **Row** — the reference. It can be a row in **this same schedule or in another one** in your organization — so "Production" pulls from "Sales" with zero retyping.
- **Coef.** — the coefficient (only applies to add/subtract).
- **Back** — takes the value from a prior period (0 = same period, 1 = last period). Useful for staggered collections (e.g. 40% this month, 30% last, 30% the one before).

Terms are applied **in the order you add them**.

> [!NOTE]
> Schedules are a **planning** tool, not a live inventory. The desired beginning/ending inventory is an assumption you type per period, not a balance tracked from real warehouse movements.

## Comparing against your real data

Any row can be connected to your **closed sales, units sold or collections received** — Cord shows the actual and the variance under each budgeted month, with zero data entry. See [Budget vs. Actuals](/en/support/presupuesto-vs-real).

## Current limits

- There's no **editing an existing formula** — you can add or delete rows.
- The comparison against real data matches by **calendar month** — periods whose labels don't name a recognizable month and year (e.g. "Q1" or "Jan" with no year) don't show an actual.
