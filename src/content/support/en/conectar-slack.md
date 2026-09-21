---
title: "Connect Slack"
description: "Get an alert in your channel every time a quote is sent, opened, approved, or paid."
category: "Account & Team"
order: 21
---

Cord posts your alerts to the Slack channel you choose.

### Connect it

1. Go to **Settings › Integrations › Slack** and click **Add to Slack**.
2. In Slack pick the channel for the alerts and click **Allow**.
3. Back in Cord, click **Send test** to confirm the message arrives.

Slack adds an app called **Cord** to your workspace, which signs the messages. If your workspace restricts app installs, a Slack admin will need to approve it.

### With your own webhook

If you prefer messages to show your own Slack app's name, open **Use your own webhook** on the same card, paste an Incoming Webhook URL (it starts with `https://hooks.slack.com/services/`) and click **Save**.

### Which alerts you get

The events you choose in **Settings › Notifications**. That is where you decide what goes by email and what goes to Slack.

You can also send your own messages from a workflow with the **Send a Slack message** action, using your text and the data from the sale.

### Change the channel or disconnect

Click **Change channel** to pick another one in Slack, or **Disconnect** so Cord stops posting.
