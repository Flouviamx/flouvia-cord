---
title: "Automate with Cord Workflows"
description: "Create flows that react to what happens in Cord: when a quote is approved, create a task, post to Slack, or add a note in HubSpot."
category: "Quotes"
order: 40
---

A workflow is a rule: **when this happens, do this**. Cord starts the workflow from what happens in your account — a quote sent, approved or paid, a new client, a broken payment promise — and runs the steps you defined.

### Create your first workflow

1. Open **Workflows** in the sidebar and click **New workflow**.
2. If it is your first one, Cord offers ready-made ideas (for example "Follow up if the client does not open"). You can start from one and change it.
3. Choose the **trigger**: the Cord event that starts the flow.
4. Add steps with **Add a step**:
   - **Action:** create a task, email your team, send a Slack message, or add a note in HubSpot.
   - **Condition:** the flow continues down one branch or the other based on the data, for example if the total is above a certain amount.
   - **Wait:** pauses the flow for the number of days you set, then continues.
5. Click **Publish**. A draft workflow never runs.

In any text you can insert data from the event, such as `{{cliente}}`, `{{folio}}` or `{{total}}`. Cord only offers the fields that trigger actually has.

### Review what happened

The **Runs** tab shows every time the workflow fired: when, which step ran, and the result. If a step fails, the error appears there and Cord retries it.

A step that fails for a temporary reason is retried automatically. If the problem persists, the run is marked with an error so you can see it.

### What a workflow never does

- It never writes to your client: the email goes to your team.
- It never charges or issues invoices. Those stay human decisions.
- It never triggers on its own events, so two workflows cannot loop forever.

### Actions that need a connection

- **Slack message:** requires the Slack webhook in Settings › Integrations.
- **HubSpot note:** requires HubSpot connected. The note goes on the quote's Deal or, when there is no Deal, on the client's Company.

If the connection is missing, the run ends with an error telling you what is needed.

### How many can be active

The number of active workflows depends on your plan; you can see it above the list. You can keep as many drafts as you want.
