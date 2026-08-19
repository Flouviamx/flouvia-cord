---
title: "Sending invoices in bulk"
description: "Send several invoices at once, with their PDF and payment link."
category: "Invoicing"
---

If you issued many invoices at once — from a recurrence, from the API, or at
month end — you don't have to open them one by one to send them.

### How to send them

1. Go to **Invoices**.
2. Tick the checkboxes of the invoices you want to send. The header checkbox
   selects every invoice on the page.
3. A bar appears at the bottom with your selection. Click **Send by email**.

Each client gets their own email, with your business name as the sender, your
intro and signature if you set them up in **Settings › Email**, their invoice PDF
attached, and a link to their payment page showing the balance of THAT invoice.

### What can and can't be sent

Only **issued** invoices that are still open or marked uncollectible get sent. A
draft isn't sent — it isn't a document yet — and neither is a voided or already
paid invoice.

If a client has no email on file, their invoice is skipped. Cord tells you how
many went out and how many didn't: if you selected 20 and 17 were sent, you'll
read it in the notice rather than finding out later.

You can send up to 50 invoices per batch. If you have more, repeat.

### If it repeats every month

When it's always the same thing for the same client, don't send it by hand: open
an invoice you already issued and use **Repeat monthly**. Cord issues it, stamps
it where that applies, and sends it on its own on the date you set. You manage
them from **Invoices › View recurring**.

For the ones that do go overdue, the reminder ladder already works on its own:
Cord warns before the due date and follows up after, without you selecting
anything.
