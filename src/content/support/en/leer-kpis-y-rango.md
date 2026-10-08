---
title: "Read the KPIs and the date picker"
description: "What each Home figure measures, how it compares to the previous period, what Today, Range, and All time mean, and why the range no longer appears in the address bar."
category: "Reports & Analytics"
order: 2
---

The figures on Home don't all measure the same thing: some follow the dates you pick, others are a snapshot of right now, and others add up your whole history. This guide tells you how to read each one.

### Pick the period

1. In the Home money indicator, click the date picker. It shows the current period, for example **Last 30 days**.
2. Choose a quick period: **Last 12 months**, **Today**, **Yesterday**, **Last 7 days**, **Last 30 days**, **Last 90 days**, **This month**, **Last month**, **This quarter**, or **Year to date**.
3. For exact dates, choose **Custom**, click the first and last day on the calendar (you'll see them under **From** and **To**), and click **Apply**. **Cancel** closes without changing anything.

What to expect:

- The starting period is **Last 30 days**.
- Home covers the last 12 months: you can't pick earlier days.
- "Today" is the day in your business's time zone (**Settings › General › Time zone**), not your computer's.

### The range is remembered, but no longer in the address

Cord remembers in this browser the last period you picked on Home. The page address no longer carries `?rango=`: the bar stays clean and an old bookmark can't trap you in a period. If you open an old link that does carry it, Cord respects it that once and cleans up the address.

**Reports** works differently: there the period does go in the address, so when you share a report link the other person sees the same dates. Each report also remembers its own period.

### Today, Range, and All time

Next to each widget's title there's a tag. Hover over it to see the explanation.

- **Range** — "Follows the date range selected above." It changes when you move the picker.
- **Today** — "A snapshot of right now; it does not follow the date picker." For example, the pipeline, receivables, or what's in progress: what's happening today doesn't depend on the period you're looking at.
- **All time** — "Your whole history, regardless of the range." For example, **Days to close** or the **Sales leaderboard**.

The note under the money indicator sums it up: "The range applies to revenue, trend, funnel and rankings. Receivables, pipeline and health always show today."

| Follows the range | Snapshot of today | Whole history |
|---|---|---|
| Money indicator, Close rate, Average ticket, Collected, Monthly trend, Conversion funnel, Clients by approval rate, Products by revenue | In progress, Needs follow-up, Pipeline, Receivables aging, Expected cash flow, Pipeline health, Needs follow-up list, Overdue invoices | Days to close, Sales leaderboard, Sent to paid |

### What each figure measures

- **Closed:** the total of the quotes you won (approved, paid, or invoiced), by the date they were approved.
- **Collected:** money that came in, by payment date, from quotes and invoices (including partial payments), minus refunds.
- **Quoted:** the total of the quotes you created, excluding drafts, by creation date.
- **Close rate:** of the quotes you sent in the period, what percentage you've already won. Below it you see the numbers, for example "6 of 15 sent in the range". It's measured on what went out in the period (a cohort), so two periods compare without mixing dates.
- **Average ticket:** what closed in the period divided by the number of sales that make it up.
- **In progress:** what's been sent or viewed and the client hasn't decided yet; the bar splits how much is still **Sent** and how much is already **Viewed**.
- **Needs follow-up:** quotes the client opened and hasn't answered.

In the money indicator, the **Closed**, **Collected**, and **Quoted** tabs switch the big figure and the chart.

### The change versus the previous period

Figures that follow the range are compared with the **previous period of the same length, immediately before**:

- **Last 30 days** is compared with the 30 days before that.
- **This month**, if today is October 8, is compared with the 8 days before October 1 (September 23 to 30), not with all of September. To compare full months, choose **Last month** or a **Custom** range.

How it's shown:

- **Amounts and counts, as a percentage.** Collecting 12,000 vs. 10,000 shows as an up arrow with "20%".
- **Rates, in points.** Going from 38% to 43% shows as "5 pts" up, not "13%": a rate that rises five points didn't grow thirteen percent.
- The arrow and color tell you whether it went up or down.
- In the money indicator chart, the previous period appears as a dashed line.

When there's **no** change shown:

- When the previous period is zero. A "+100%" against nothing means nothing, so Cord doesn't show the arrow; under **Collected** you read "No previous period to compare".
- With **Last 12 months**: Home doesn't load the prior year to compare it.
- When the previous period would start before the 12 months Home covers (for example, **Year to date** in the second half of the year).

### Why a widget didn't change when you moved the dates

- It's tagged **Today** or **All time**: it doesn't follow the picker, on purpose.
- **Monthly trend** changes its grouping on its own: by day up to 16 days, by week up to 70 days (each bar starts on Monday), and by month for longer ranges.
- **Clients by approval rate** only compares clients with enough data: if at least three have two or more quotes, the ranking is made among them only, so a "1 of 1" doesn't show up as your best client.

### Common issues

**Home opens on a period I didn't pick.** It's the last one you used in this browser. Change the period and the new one is remembered. In another browser or in private mode it starts at **Last 30 days**.

**I sent a teammate the Home link and they see different dates.** Home no longer shares the period through the address. To share figures with fixed dates, use a report under **Reports**: its link does carry the period.

**A Home figure doesn't match a report.** Check that both use the same period and the same definition: **Sales over time** counts sales by close date, while the **Custom report** counts the quotes created in the period and what happened to them. See [Cord's reports](/en/support/informes-de-cord).

**I recorded a payment and the figure didn't change.** Home figures are recalculated in under a minute; wait a moment and reload the page. If the payment is in another currency with no exchange rate available, it's left out of the total and the currency note says so: see [Amounts in multiple currencies and time zone](/en/support/importes-en-varias-divisas-informes).

Full guide: [Home and quote views](/en/docs/gestion/dashboard).
