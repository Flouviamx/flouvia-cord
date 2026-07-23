---
title: "Basic concepts"
description: "Learn how Cord's time-series mathematical engine works: rows, combo formulas, offsets, and cross-references."
---

<header class="content-header">
  <h1 class="page-title">Basic concepts</h1>
  <p class="page-subtitle">Understand the engine behind Cord. Learn about time series, the Combo formula, time offsets, and the Budget vs. Actual connection.</p>
</header>

## The anatomy of a Master Budget

In Cord, a "Schedule" is not a unit quote, but a financial matrix. The columns represent **periods in time** (e.g., Jan 2026, Feb 2026), and the rows represent **income or expense line items**.

There are two fundamental types of rows in any schedule:

1. **Input Rows (Assumptions):** These are the cells where you manually "type" the information. They are used to establish future facts. For example: the units you expect to sell in March, or your starting inventory in January. They are not calculated, they are assumed.
2. **Formula Rows:** These are the cells where the engine does its magic. The value of each month in this row is calculated automatically by referencing other rows in the project.

## The "Combo" formula engine

To avoid the fragility of Excel spreadsheets (where someone deletes a cell and breaks the entire formula), Cord uses a single, extremely robust mathematical primitive called **Combo**.

A Combo formula is a sequential weighted sum. It allows you to add, subtract, multiply by percentages, or scale values in a single mathematical rule without needing to write code. Each term of the formula has a `coefficient` and an operation type:
- **Sum/Subtract:** `(Row X value * 1) + (Row Y value * -1)`
- **Percentage (pct):** Multiplies the running total by a percentage defined in another row.
- **Product:** Multiplies the running total by the absolute value of another row.

## Time Offsets

Cash flow rarely occurs in the same month as the sale. If you close a $100,000 project in January with Net-30 terms, the money will hit the bank in February.

To model this, Cord's engine includes **Offsets**. You can tell a formula row: *"Take the value from the Sales row, but shift it 1 period forward (Offset: 1)"*. This allows you to automatically create real-world collection policies without moving columns by hand.

## Cross-references

Companies do not operate in silos, and their budgets shouldn't either. Cord allows you to link schedules together through cross-references.

- You can have a **Sales Schedule** that the commercial team updates.
- You can have a **Collections Schedule** that *cross-references* the final sales row to calculate projected revenue.
- You can have a **Cash Flow Schedule** that *cross-references* the projected revenue and subtracts expenses.

If Sales changes its projection today, the Cash Flow Schedule will instantly update, giving you total corporate visibility.

## Budget vs. Actual

Projecting the future is useless if you don't measure reality. Cord's engine allows you to connect any row in your budget to the **company's actual transactions**.

By detecting the month columns ("Jan 2026"), Cord will automatically cross-reference your expectations with the successful charges processed in Stripe or collected invoices. This way, you will know if your deviation was 5% or 20%, allowing you to steer the ship before it's too late.
