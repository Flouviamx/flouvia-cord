---
title: "Create, save, and share custom reports"
description: "Build your own table with Group by and up to six metrics, share it with a link, save it with a name for the whole team, and edit or delete it."
category: "Reports & Analytics"
order: 5
---

The **Custom report** answers the questions the fixed reports don't cover: "how much did I sell by country this quarter?", "which team member has the best close rate with new clients?", "how many quotes did I lose each week?". You choose how to group and what to measure, and Cord builds the table with its chart, key figures, and CSV export.

### What this report counts

It counts the **quotes created in the period** (excluding drafts) and what happened to them afterward. So each row answers "of what we quoted on these dates, how much was won, how much was lost, and how long did it take?".

That's why its **Sold** may not match **Sales over time**, which counts sales by their close date: a quote created in September and won in October shows up in September here and in October there. Both figures are correct.

### Build a report

1. Go to **Reports**, open the report picker, and choose **Custom report** (**Custom** group).
2. Pick the period with the date picker.
3. In **Group by**, choose how to split the table:
   - **Client**, **Product**, or **Team member** (whoever created the quote).
   - **Status**: Sent, Viewed, Approved, Paid, Invoiced, Rejected, or Expired.
   - **Month**, **Week**, or **Day** of creation.
   - The client's **Country**, **Client tier**, or the quote's **Currency**.
4. Under **Metrics**, check up to six:
   - **Quotes:** how many were created.
   - **Quoted:** their total amount.
   - **Sales:** how many were won (approved, paid, or invoiced).
   - **Sold:** the amount of the won ones.
   - **Close rate:** sales divided by quotes sent, as a percentage.
   - **Average ticket:** sold divided by sales.
   - **Lost:** how many were rejected or expired.
   - **Days to close:** average days from creating the quote to its approval.
   - **Units:** units sold. Only when grouping by product.
   - **Gross margin:** sold minus cost, only for lines with a captured cost. Only when grouping by product.
5. Every change applies right away: the table reloads on its own.

What to expect:

- By default the report groups by **Client** with **Quotes**, **Sales**, **Sold**, and **Close rate**.
- The first four metrics you check appear at the top as key figures, compared with the previous period of the same length.
- The chart uses the first money metric you chose (or the first metric, if none is about money). Grouped by time it draws a bar per period; grouped by anything else, the top 10.
- The table is sorted by the first metric, high to low (or by date when grouping by time), and shows up to 500 rows.
- The **Total** row is the period's real total, not the sum of the rows: a rate or an average ticket can't be added up.

Metric rules:

- When you check the sixth, the rest are disabled and you read "Up to six metrics at a time.". Uncheck one to choose another.
- You can't end up with no metrics: unchecking the last one does nothing.
- A grayed-out metric doesn't apply to that grouping. Hover to see why: "Only when grouping by product" (**Units**, **Gross margin**) or "Not available by product" (**Days to close**).

### Go to the detail

- In the chart or the first column, a **client** or a **product** opens its page.
- Grouped by **Month**, a bar opens that month grouped by **Week**; grouped by **Week**, it opens that week by **Day**. The metrics are kept.
- On a phone, the first tap shows the value; **View detail** inside the label takes you there.

### Share with a link

The configuration lives in the page address: the period, the grouping, and the metrics. Copy the address from your browser and send it: whoever opens it sees the same table. They need to be part of your organization (with it as their active organization) and have the **Reports** permission. The CSV they export will be exactly that table, too.

### Save the report

1. With the table the way you want it, click **Save** (the pin icon).
2. Enter a **Name** of 1 to 80 characters, for example "Sales by country this quarter".
3. Under **Email delivery**, leave **No delivery** or choose **Every Monday** or **On the 1st of every month**. See [Get a report by email](/en/support/recibir-informes-por-correo).
4. Click **Save**.

What to expect:

- The report appears in the picker, in the **Custom** group, labeled **Saved report**, and its name becomes the page title.
- **The whole organization sees it:** anyone with the **Reports** permission can open it.
- **The grouping and metrics are saved, not the dates.** When you open it, it uses the period in the picker, so the same report works for any month.
- Each organization can have up to 50 saved reports.

### Edit a saved report

1. Open it from the picker.
2. Change the grouping or metrics. The table updates right away, but the saved report **doesn't change** until you save it.
3. Click **Save changes**. In the dialog you can also change the name or the email delivery.
4. Click **Save changes** to replace it, or **Save as new** to create a copy with another name and leave the original as it was.

### Delete a saved report

1. Open it from the picker.
2. Click the trash can icon (**Delete**), next to **Save changes**.
3. Confirm "Delete this saved report? This does not delete any data.". If it had email delivery, it stops arriving.

### Who can do what

| Action | Who |
|---|---|
| Build, view, and export custom reports | Anyone with the **Reports** permission |
| Save a new report | Anyone with the **Reports** permission |
| Edit or delete a saved report | Whoever saved it, the account owner, or an admin |
| Schedule or change email delivery | Only whoever saved it |
| Turn off delivery on someone else's report | The account owner or an admin (choose **No delivery**) |

When you open a report someone else saved, you see "Saved by another team member".

### Save your own copy of someone else's report

If you open a report someone else saved and you can't edit it, the button says **Save** (not **Save changes**) and has no delete icon. When you click it, the dialog opens with an empty name: type one and click **Save**. Cord creates a **new report of your own** with the grouping and metrics on screen; the original doesn't change. Since the copy is yours, you can also schedule its email delivery.

### Common issues

**I want to change a report someone else saved.** If you didn't save it and aren't an admin, you can't replace it, but **Save** creates your own copy with your changes (see above). If you see "Only the person who saved the report or an admin can change it.", someone changed your permissions or the report while you had the page open: reload it.

**It says "You reached the maximum of 50 saved reports."** Delete the ones your team no longer uses and save again.

**It says "Give it a name of 1 to 80 characters."** The name is empty or too long.

**I grouped by Currency and one currency shows zero.** Amounts are always expressed in your business's base currency. If a currency has no exchange rate available, its amounts are left out of the total and the note under the report says so. See [Amounts in multiple currencies and time zone](/en/support/importes-en-varias-divisas-informes).

**Rows like "No client", "No team member", or "No data" appear.** They're quotes without a client, without an identified team member, or without a country or tier captured on the client.

Related guides: [Export a report to CSV](/en/support/exportar-informes-csv) · [Custom reports in the documentation](/en/docs/gestion/informes-personalizados).
