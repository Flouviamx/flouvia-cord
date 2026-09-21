---
title: "Connect Cord with Zapier"
description: "Accept the invitation to the Cord app on Zapier, authorize access with one click and create Zaps that start when something happens in Cord."
category: "Developers"
order: 5
---

The Cord app for Zapier lets you start a Zap when a quote moves forward and create or update Cord data from any other app.

### Connect it

1. In Cord open **Settings › Integrations › Zapier** and click **Open Cord on Zapier**. Accept the invitation.
2. In Zapier create a Zap, choose Cord and click **Connect**.
3. On the Cord screen pick the workspace and click **Authorize**. There are no keys to create or paste.

You need access to **Settings** in that workspace to authorize.

### What you can do

- **Triggers:** quote created, sent, opened, approved, rejected or paid; partial payment; invoice paid; new client or any Cord event.
- **Actions:** create and update clients, create and send quotes, mark them paid and create tasks.
- **Searches:** client by email or name and quote by number.

Each active Zap creates its own webhook in Cord, with a limit of 100 per organization separate from your plan's endpoints.

To cut the access, open **Settings › Developer mode › API** and revoke Zapier's connection (it shows as **Authorized connection**). Your Zaps will ask you to reconnect the account.
