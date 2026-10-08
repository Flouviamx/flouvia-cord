---
title: "Team tasks and reminders"
description: "Create to-dos with an assignee, due date, and priority, organize them by urgency, and get an email every morning with what's due today and overdue."
category: "Quotes"
order: 5
---

Tasks are your team's to-dos: the follow-up call, the pending delivery, the chargeback that needs a response. Each one has an **assignee**, a **due date**, and a **priority**, and Cord emails whoever it belongs to.

### Where they are

- **Home:** the **Tasks and reminders** widget shows the most urgent ones and a composer to add a new one.
- **Tasks** in the sidebar (shortcut `G` then `T`): every task, with **Mine**, **All**, and **Unassigned** filters, and the **Completed** tab.
- **Create › Task** in the top bar (or the `T` key), from any screen.

### Create a task

1. Type the task, for example "Call Luis to ask whether he reviewed the quote".
2. Pick the date with **Today**, **Tomorrow**, or **Monday**, or with the calendar. You can leave it without a date.
3. If it's urgent, turn on **High priority**.
4. If your account has more than one person, choose the **assignee**. If you don't, the task belongs to whoever typed it.
5. Click **Add** or press `Enter`.

### Organize your day

- Tasks are grouped into **Overdue**, **Today**, **Tomorrow**, **This week**, **Later**, and **No date**, based on the day in your business's time zone.
- Click the circle to complete it. For a few seconds you can click **Undo**.
- Each task's **···** menu lets you **Edit** (title, notes, date, priority, and assignee), **Snooze** until tomorrow, Monday, or in a week, **Assign to me**, and **Delete**.
- If the task comes from a quote or invoice, its number and the client show as a link to the document.
- In the sidebar, **Tasks** shows how many of yours or unassigned ones are due today or overdue.

### The email reminder

Every morning, from 8:00 in your business's time zone, each assignee gets **a single email** with their tasks due today and overdue.

- An unassigned task goes to whoever created it; if a workflow, the API, or Cord itself added it (for example, a chargeback), it goes to the account owner.
- If you snooze a task, it reminds again on its new date.
- An overdue task shows up in each day's email until you complete or snooze it.
- To turn it off for the whole organization, uncheck **Task reminder** in **Settings › Notifications**.

<Callout type="info">
Cord also creates tasks for you, with high priority: **Responder contracargo** when a client disputes a card charge, with the deadline to submit evidence as the due date, and **Transferir reembolso SPEI** when you request a refund of a bank-transfer payment.
</Callout>

### Frequently asked questions

**Who can create or edit tasks?** Anyone with the Quotes, Collections, or Clients permission. Without any of the three, you see tasks but can't change them.

**I didn't get the reminder.** It only arrives if you have tasks due today or overdue. Check that **Task reminder** is still on in Settings › Notifications, and your spam folder.

**Can I create tasks automatically?** Yes: with the **Create a task** action in [Cord Workflows](/en/support/automatizar-con-workflows), with the API (`POST /api/v1/tareas`), or from an AI assistant connected through MCP.

Full guide: [Tasks and follow-up](/en/docs/gestion/tareas).
