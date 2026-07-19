---
title: "Analysis tools: projects (NPV/IRR), inventory, and variances"
description: "Decision calculators with saveable scenarios: project evaluation, optimal inventory (EOQ), and standard-vs-actual variance analysis."
category: "Budgets & Analysis"
order: 2
---

Beyond budget schedules, the **Budgets** section includes a **Tools** tab: three decision calculators with live results and scenarios you can save and reopen.

> [!NOTE]
> Tools require the **analytics** permission, just like schedules. Only the data you enter is saved; results are computed on the fly.

## Project evaluation (NPV)

To decide whether an investment is worth it. You enter the initial investment, the discount rate, the number of years, and the annual net cash flow (uniform or different each year). You get:

- **Net Present Value (NPV)** — with an **Accept / Reject** label.
- **Internal Rate of Return (IRR)** — to compare against your discount rate.
- **Payback period** — how many years it takes to recover the investment.
- **Annuity factor** — when the cash flow is uniform.

If you don't know the annual cash flow, open the **assistant**: enter the profit before depreciation and taxes, the depreciation, and the income tax rate, and Cord derives the net cash flow and applies it automatically.

## Optimal inventory (EOQ)

To know how much to order and when. You enter annual demand, ordering cost, holding cost, lead time, and working days per year. You get:

- **Economic Order Quantity (EOQ)** — the order size that minimizes total cost.
- **Reorder point** — the inventory level at which you should order again.
- **Orders per year** and the **total annual cost** broken into ordering and holding.

## Variance analysis (flexible budget)

To compare what your production **should** have cost against what it **actually** cost. You enter the units produced and a list of line items (raw material, labor, etc.), each with its standard and actual quantity and price. Cord breaks the difference into:

- **Price variance** — how much is due to paying a different amount per unit.
- **Quantity variance** — how much is due to using more or less input.

Each variance is tagged **F** (Favorable, cost less than standard) or **D** (Unfavorable, cost more). Price plus quantity always add up to the total variance.

## Saving and reusing scenarios

Any calculator can be saved with **Save scenario** (you give it a name). Scenarios appear in the list at the top; click one to reload it. If you edit a loaded scenario, you can **Save changes** over it or **Save as new** to keep the original.
