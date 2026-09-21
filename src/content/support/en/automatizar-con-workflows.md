---
title: "Automate with Cord Workflows"
description: "Create flows that react to what happens in Cord: when a quote is approved, create a task, email the client, post to Slack, or send the data to another tool."
category: "Quotes"
order: 40
---

A workflow is a rule: **when this happens, do this**. Cord starts the workflow from what happens in your account — a quote sent, approved or paid, a new client, a broken payment promise — and runs the steps you defined.

### Create your first workflow

1. Open **Workflows** in the sidebar and click **New workflow**.
2. If it is your first one, Cord offers ready-made ideas (for example "Follow up if the client does not open"). You can start from one and change it.
3. Choose the **trigger**: a Cord event, or a **fixed schedule** ("every Monday at 9", in your account's time zone). Besides what already happened, three triggers get ahead of a date — **A quote is about to expire**, **An invoice is about to be due** and **An invoice has been past due for days**: they carry the days left or the days elapsed, and a condition picks the exact day you want to act on.
4. Add steps with **Add a step**:
   - **Action:** create a task, email your team, email the client with your branding, expire a quote, approve an internal request, void an invoice, send the data to a URL (Zapier, Make, n8n or your own server), send a Slack or Microsoft Teams message, or add a note in HubSpot.
   - **Condition:** the flow continues down one branch or the other based on the data, for example if the total is above a certain amount. On update events (quote resent, client and product) you can also ask whether a field **changed**, not only what it is.
   - **Wait:** pauses the flow for the number of days you set, then continues. **Wait until...** also watches a condition and continues the moment it is met, with a time limit.
   - **Lookup:** brings a number from your account — overdue receivables, pipeline, what was collected, client balance — to use in the message or in the condition of the steps that follow.
5. Click **Test** to run the draft with your latest real event: you see which steps would be met and with what text, without sending anything.
6. Click **Publish**. A draft workflow never runs.

In any text you can insert data from the event, such as `{{cliente}}`, `{{folio}}` or `{{total}}`. Cord only offers the fields that trigger actually has. On top of that, every workflow has your business data: `{{negocio}}`, `{{negocio_correo}}`, `{{negocio_telefono}}`, `{{negocio_moneda}}` and `{{hoy}}`.

### Review what happened

Above the workflow list you will see how your automations are doing over the last 30 days: runs, completed, failed and waiting, with the most frequent failure causes and which workflow it last happened in.

The **Runs** tab shows every time the workflow fired: when, which step ran, and the result. If a step fails, the error appears there and Cord retries it.

A step that fails for a temporary reason is retried automatically. If the problem persists, the run is marked with an error so you can see it.

### What a workflow never does

- It never charges, never issues invoices or CFDIs, and never records payments. Those stay human decisions.
- It never approves or rejects a quote on your client's behalf.
- When it emails the client, it goes to the email of the document's client, never to an address typed into the step; that email uses one send from your plan.
- It never triggers on its own events, so two workflows cannot loop forever.

### Actions that need a connection

- **Slack message:** requires the Slack webhook in Settings › Integrations.
- **Teams message:** requires the channel's Power Automate flow, in Settings › Integrations.
- **HubSpot note:** requires HubSpot connected. The note goes on the quote's Deal or, when there is no Deal, on the client's Company.
- **Send the data to a URL:** requires an `https` address on a public server. Cord POSTs the event as JSON; it is not signed, so to verify the origin use the webhooks in the Developers dock.

If the connection is missing, the run ends with an error telling you what is needed.

### How many can be active

The number of active workflows depends on your plan; you can see it above the list. You can keep as many drafts as you want.
