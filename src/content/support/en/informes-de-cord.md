---
title: "Cord's reports: which one answers which question"
description: "The 15 reports under Reports, grouped by topic: what each one answers, which follow the date range, which export, and which permissions and plans they need."
category: "Reports & Analytics"
order: 3
---

**Reports**, in the sidebar, brings all of your business analysis together in one place. There are 15 reports, grouped like a library: **Overview**, **Sales**, **Clients**, **Products**, **Finance**, **Team**, and **Custom**.

### Open a report

1. Go to **Reports** in the sidebar.
2. Click the report picker at the top right (it shows the name of the open report).
3. Search by name in **Search reports** or pick one from the list. Under each name you can read whether it works by **Date range** or **As of today**.
4. If the report uses a range, adjust the dates with the picker next to it. If it's **As of today**, you'll see a tag with today's date instead of the picker.

### Two kinds of report

- **Widget reports:** a board of cards and charts, like Home. You customize them with **Customize** (move, hide, resize, add from the library). They don't export.
- **Table reports:** at the top, up to four key figures compared with the previous period; in the middle, a chart; at the bottom, the full table with a **Total** row, which you can sort by any column and download with **Export CSV**.

### The 15 reports and when to use each one

**Overview**

| Report | Kind | Use it to |
|---|---|---|
| **Overview** | Widgets, by range | Get the quick picture of the period: close rate, closed value, pipeline velocity, lost value, commercial movement, and cohort maturity. |
| **Commercial diagnosis** | Widgets, by range | Find where you lose sales: at which stage conversion breaks, stalled quotes, the cost of discounts, and median time by stage. |

**Sales**

| Report | Kind | Use it to |
|---|---|---|
| **Sales over time** | Table, by range | See period by period how much you quote, win, and collect. Sales count by close date and collections by payment date. Group by **Day**, **Week**, or **Month**. |
| **Sales by client** | Table, by range | Know who buys from you: sales, ticket, last purchase, client since, and their **Balance today**. |
| **Sales by product** | Table, by range | What sells, how many units, at what **Gross margin**, and how often it wins when it's quoted. |

**Clients**

| Report | Kind | Use it to |
|---|---|---|
| **Clients** | Widgets, by range | Clients by closed value, client conversion, new vs. returning, clients at risk, and relationships to reactivate. |
| **Repeat purchase by cohort** | Table, as of today | Measure loyalty: of the clients who first bought each month, what percentage came back to buy 1 to 6 months later. It's a heat map: the darker, the more repeat purchase. |

**Products**

| Report | Kind | Use it to |
|---|---|---|
| **Products** | Widgets, by range | Products by quoted amount, volume, discount elasticity, and close rate by product. |

**Finance**

| Report | Kind | Use it to |
|---|---|---|
| **Payments received** | Table, by range | Every payment that came in, from quotes and invoices, with date, number, client, method, amount, refund, and net. It's the report for reconciling. |
| **Invoiced taxes** | Table, by range | Taxes and withholdings from your issued invoices, month by month: what you report. |
| **Finance** | Widgets, as of today | Recurring revenue (MRR and ARR), MRR at risk, days sales outstanding (DSO), weighted pipeline, concentration, and profitability by client tier. |
| **Cash flow · 90 days** | Widgets, as of today | How much money will come in over the coming weeks: weekly flow, cumulative cash, and expected daily inflow. |
| **Collections and receivables** | Widgets, as of today | How healthy your receivables are: overdue, aging, client exposure, payment promise compliance, and actual vs. agreed DSO. |

**Team**

| Report | Kind | Use it to |
|---|---|---|
| **Sales by team member** | Table, by range | What each team member quoted and closed, with their close rate, ticket, and days to close. The team member is whoever created the quote. |

**Custom**

| Report | Kind | Use it to |
|---|---|---|
| **Custom report** | Table, by range | Build your own table: you choose how to group (client, product, team member, status, month, country, currency, and more) and up to six metrics. You can save it and get it by email. See [Create custom reports](/en/support/informes-personalizados). |

Reports you save appear in the same **Custom** group, labeled **Saved report**.

### How to read a table report

- **Key figures** are compared with the previous period of the same length: under each one you read "vs. 48,200 the previous period". Amounts and counts change as a percentage; rates, in points.
- **The chart** leads to the detail: in **Sales by client** and **Sales by product**, a bar opens that client's or product's page; in **Sales over time** grouped by week or month, a bar opens that period. On a phone, the first tap shows the value and **View detail** inside the label takes you there.
- **The table** sorts with a click on the header: the first click sorts high to low, the second low to high. Empty cells (—) always stay at the bottom. Where it applies, the first column links to the client, product, quote, or invoice.
- **The Total row** uses the period's real totals. That's why a rate or an average ticket isn't the sum of the rows, and some columns leave the total blank.
- **Sales over time** picks its own grouping: by day up to 31 days, by week up to 124 days, and by month for longer ranges. You can change it with **Day**, **Week**, or **Month**.
- **Gross margin** only counts lines with a cost captured when quoting: a line without a cost adds to sales but not to margin. The report reminds you at the bottom.

### Collected means the same thing everywhere

On Home and in every report, **Collected** is the money that came in, by payment date: quote payments (deposits, installments, and retainers), invoice payments including partial payments, and quotes you marked as paid manually, minus refunds.

### Permissions and plans

- All of **Reports** requires the **Reports** permission (**Settings › Team & roles**). Without it you'll see "No access".
- **Payments received** and **Collections and receivables** show money owed to you, so they also require the **Collections** permission. If you don't have it, they don't appear in the picker; if you open a direct link, you'll see "Restricted report".
- **Finance**, **Cash flow · 90 days**, and **Collections and receivables** are included from the **Professional** plan. On the Free and Starter plans they appear in the picker and, when you open them, show what they include and how to upgrade.
- All other reports, the Custom report, and CSV export are on every plan.

### Common issues

**A report says "No data in this range".** There was no activity on those dates. Widen the range or pick another period. While the table is empty, **Export CSV** doesn't appear.

**A figure doesn't match between two reports.** Check which date each one uses: sales count by close date, collections by payment date, and the **Custom report** by the quote's creation date. All three are correct; they answer different questions.

**I just recorded something and it doesn't show.** Reports are recalculated every minute (**Repeat purchase by cohort**, every five). Wait a moment and reload.

**A team member doesn't appear in Sales by team member.** The report lists active members. If someone left the team, their sales still count in the total, but they no longer have their own row.

**The figures are in a currency that isn't mine.** All amounts are expressed in your business's base currency. See [Amounts in multiple currencies and time zone](/en/support/importes-en-varias-divisas-informes).

Full guide: [Reports and sales performance](/en/docs/gestion/informes).
