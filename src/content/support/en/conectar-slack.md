---
title: "Connect Slack"
description: "Get an alert in your channel every time a quote is sent, opened, approved, or paid."
category: "Account & Team"
order: 21
---

Cord posts to Slack through an **Incoming Webhook**: a URL Slack gives you for a specific channel.

### Create the URL in Slack

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create an app from scratch for your workspace.
2. Open **Incoming Webhooks** and turn them on.
3. Click **Add New Webhook to Workspace**, pick the channel for the alerts, and authorize.
4. Copy the URL that starts with `https://hooks.slack.com/services/`.

### Paste it in Cord

1. Go to **Settings › Integrations › Slack**.
2. Paste the URL and click **Save**.
3. Use **Send test** to confirm the message reaches the channel.

Cord only accepts URLs from `hooks.slack.com`.

### Which alerts you get

The events you choose in **Settings › Notifications**. That is where you decide what goes by email and what goes to Slack.

You can also send your own messages from a workflow with the **Send a Slack message** action, using your text and the data from the sale.

### Change the channel or disconnect

To change channels, create another webhook in Slack and paste the new URL. To stop the alerts, clear the URL and save: the connection goes back to not configured and Cord stops posting.
