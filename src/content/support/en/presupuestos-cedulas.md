---
title: "Budget schedules: plan sales, production, and cash"
description: "Build the financial planning cascade (Sales, Production, Purchases, Collections, Cash) with templates, formula rows, and cross-schedule references."
category: "Budgets & Analysis"
order: 1
---

**Budget schedules** are Cord's financial planning tool. They let you build the classic cost-accounting cascade —Sales → Production → Raw Material Purchases → Collections— without a spreadsheet that ends up disconnected from your operation. You'll find them under **Budgets** (side menu, Intelligence section).

> [!NOTE]
> Budgets require the **analytics** permission. The organization owner and any member with analytics access can use it.

## Creating a schedule

Press **+ New schedule** and choose:

1. **Type** — a template that seeds ready-to-edit rows. When you pick a type, Cord suggests a name and explains what the template includes. Available types:
   - **Sales** — the base row of units per period.
   - **Sales with adjustment factors** — base sales + unit adjustments, chained percentage factors (e.g. economic, distribution), and the final amount in pesos.
   - **Production** — Production = Sales + Desired ending inventory − Beginning inventory, pre-wired.
   - **Raw Material Purchases** — the same pattern over raw material consumption.
   - **Labor & Overhead** — input rows so you can build your own total cost.
   - **Collections** — credit sales distributed by the percentage collected in the current and following months.
   - **Cash** — staggered collections and payments per period, plus beginning and ending balance.
   - **Custom** — a blank schedule.
2. **Name** — accept the suggestion or type your own.
3. **Periods** — use the presets (Quarter, 6 months, 12 months) or type them comma-separated. Use the **same period names** across schedules that will reference each other (e.g. Production and Raw Material Purchases).

## The grid: input rows and formula rows

Each schedule is a table of **line items (rows) × periods (columns)**. There are two row types:

- **Input** — you type it, cell by cell. It saves when you leave the cell.
- **Formula** — shown in light gray and **recalculated automatically** when you change an input it depends on. Below the label you'll see the formula in plain language (e.g. `= Sales + Desired ending inv. − Beginning inv.`). When it recalculates, the affected cells briefly flash.

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

## Current limits

- You can't **add periods** to an existing schedule — recreate it if you need more.
- There's no **editing an existing formula** — you can add or delete rows.
- There's no **budgeted vs. actual** pulling data from real quotes or sales; schedules run on the assumptions you type.
