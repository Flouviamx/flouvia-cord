---
title: "Connect Microsoft Teams"
description: "Get a card in your Teams channel every time a quote is opened, approved or paid, and post from your workflows."
category: "Account and Team"
order: 22
---

Cord posts to Teams through a **Power Automate flow**. The old Teams connectors (the Office 365 "Incoming Webhook") are retired by Microsoft, so the URL you need comes from the flow, not from the channel.

### Create the flow in Teams

1. In Teams, open the channel where you want the notices.
2. From the channel's three-dot menu, go to **Workflows**.
3. Find the **"Post to a channel when a webhook request is received"** template and open it.
4. Confirm the account, pick the team and the channel, and finish the wizard.
5. Copy the **flow URL**. It starts with `https://prod-…logic.azure.com`.

The URL is a credential: anyone who has it can post to that channel. If it leaks, delete the flow and create a new one.

### Paste the URL into Cord

1. In Cord, go to **Settings › Integrations › Microsoft Teams**.
2. Paste the URL and click **Save**.
3. Click **Send test**: a sample card should show up in the channel.

### Choose what gets posted

In **Settings › Notifications**, check the **Teams** column on the events you want: quote viewed, approved, rejected, paid, about to expire, and payment overdue. Each channel is checked separately, so you can send some events to Teams and others to Slack or email.

### Use Teams in a workflow

In **Workflows**, the **Send a Teams message** action posts the text you write, with the event data (`{{cliente}}`, `{{folio}}`, `{{total}}`). It is independent from the notification matrix: the workflow posts even when those notices are off.

### If something fails

- **"The Teams URL must be the one from the channel's Power Automate flow"**: you pasted a different address. Check that it starts with `https://` and ends on a `logic.azure.com` domain.
- **"Teams did not accept the card"**: the flow was turned off or deleted in Teams. Open it in Workflows and turn it on, or create a new one and paste the new URL.
