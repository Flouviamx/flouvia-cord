---
title: "Get a report by email every week or every month"
description: "Schedule a custom report to arrive every Monday or every 1st with the period that just ended, its key figures, and the CSV attached. How to change it, turn it off, and why it may stop arriving."
category: "Reports & Analytics"
order: 6
---

A saved custom report can land in your inbox on its own: every Monday with the previous week or every 1st with the previous month, with the key figures and the full detail in an attached CSV.

### Schedule delivery

1. Under **Reports**, open a **Custom report** and build it with the grouping and metrics you want to receive. See [Create, save, and share custom reports](/en/support/informes-personalizados).
2. Click **Save** (or **Save changes** if it's already one of your reports).
3. Under **Email delivery**, choose:
   - **Every Monday:** you get the full previous week, Monday to Sunday.
   - **On the 1st of every month:** you get the full previous month, from the 1st to the last day.
4. Click **Save** (or **Save changes**).

Under the field you read "It goes to you, covering the period that just ended, with the CSV attached.".

### When the first one arrives

The first email goes out **when the next period starts**, not the moment you schedule it. If you schedule it on a Wednesday with **Every Monday**, the first one arrives the following Monday with the week that just ended. If you schedule it on the 15th with **On the 1st of every month**, it arrives on the 1st of the next month.

Deliveries go out once a day. "Monday" and "the 1st" are counted in your business's time zone (**Settings › General › Time zone**), just like the days of the period: the week runs from 00:00 Monday to 23:59 Sunday, business time.

### Who gets it

**Only whoever saved the report**, at the email they use to sign in to Cord. You can't pick another recipient. If someone else on the team wants it, they can build the same report from **Custom report** and save it with their own delivery: that way each person controls what they receive.

An admin or the account owner can **turn off** delivery on someone else's report, but can't turn it on or change its frequency: the dialog shows only **No delivery** and the current frequency, with the note "As an admin you can turn this delivery off; only the person who saved the report can schedule it.". If the other person's report has no delivery, the dialog says "Email delivery is scheduled by whoever saved the report.". If you want to receive it yourself, save your own copy and schedule it.

### What the email contains

- **Subject:** the report name, a middle dot, and the period, from the first to the last date.
- **Header:** your business name, the report name, and the period.
- **Key figures:** the report's first four metrics, each with "vs. … the previous period": the full previous calendar period. In a weekly delivery that's the previous week (Monday to Sunday); in a monthly one, the full previous month (September is compared against all of August, even though they have a different number of days).
- **The attached CSV** with the full table, ready for Excel or Google Sheets, with a name like `cord-informe-2026-09-01_2026-09-30.csv`. It comes in the same format as **Export CSV**: see [Export a report to CSV](/en/support/exportar-informes-csv).
- **Open in Cord:** opens the report in the app with that same period.

The email arrives in your account's language, and the amounts in your business's base currency.

### Change the frequency or turn it off

1. Open the saved report from the **Reports** picker (**Custom** group).
2. Click **Save changes**.
3. Under **Email delivery**, choose another frequency or **No delivery**.
4. Click **Save changes**.

It also stops arriving if you **delete** the saved report. Deleting it doesn't delete any data in your account.

### Why it stopped arriving

- **You left the team** in that organization, or your account was deactivated in it.
- **You lost the Reports permission.** If you get it back, delivery resumes on its own.
- **Someone deleted the report**, or you changed it to **No delivery**.
- **The delivery failed.** Cord retries the next day without skipping the period: it arrives a day late, but it arrives.
- **It's in your spam or promotions folder.** Search for it by the report name and mark the sender as safe.

### Frequently asked questions

**Can I get the fixed reports, like Sales by client, by email?** Scheduled delivery is for saved custom reports. Build an equivalent one: for example, group by **Client** with **Sales**, **Sold**, and **Average ticket**. Keep in mind the custom report counts the quotes created in the period.

**Can I pick another day or time?** For now the options are **Every Monday** and **On the 1st of every month**.

**Does the email use the dates I had on screen when I saved it?** No. It always sends the period that just ended: the full previous week or month.

Full guide: [Custom reports](/en/docs/gestion/informes-personalizados).
