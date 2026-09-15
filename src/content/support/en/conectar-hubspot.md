---
title: "Connect HubSpot"
description: "Sync your Cord clients and quotes with HubSpot Companies, Contacts, and Deals."
category: "Account & Team"
order: 20
---

When you connect HubSpot, Cord keeps your CRM up to date so you don't enter data twice.

### What syncs

- **Clients → Companies and Contacts.** Each Cord client is created in HubSpot as a Company and, if it has a contact or email, as an associated Contact. If a Contact with that email already exists in HubSpot, Cord reuses it instead of creating a duplicate.
- **Fixes from HubSpot.** If you change the Company name, or the Contact's name, email, or phone in HubSpot, the change reaches the client in Cord. A field you leave empty in HubSpot doesn't erase the value in Cord.
- **Quotes → Deals.** When you send a quote, a Deal is created with its number, client, amount, and currency. Cord moves the Deal stage when the client opens, approves, rejects, lets it expire, or pays. Drafts aren't sent.
- **One direction for Deals.** Moving a Deal in HubSpot doesn't change the quote in Cord: its status is decided by the client's approval and payment.

Cord never deletes anything in HubSpot. If you delete a client or a draft in Cord, it simply stops syncing.

### Connect

1. Open **Settings › Integrations** and click **Connect HubSpot**. You need Settings permission.
2. HubSpot asks you to choose the account and accept the permissions. When you return, the card says **Connected**.
3. Choose the **pipeline** and the **HubSpot stage** for each quote status, and save. If you use HubSpot's default pipeline, Cord already suggests stages.
4. To also send what you already had, click **Send existing data**. It sends up to 500 clients and 500 sent quotes.

A HubSpot account can only be connected to one Cord organization at a time.

### Currencies

Each Deal carries the quote's currency. If that currency isn't enabled in your HubSpot account, the Deal isn't created and the card shows the error. Enable it in HubSpot's currency settings and send your existing data again.

### Errors and reconnecting

The card shows how many changes are queued, errors from the last 7 days, and the last error. If HubSpot removes Cord's access (for example, because you uninstalled the app), the card says **Needs reconnecting**: click **Reconnect** and pending changes are sent automatically.

### Disconnect

Click **Disconnect**. Cord removes its access to your HubSpot account and stops syncing. What's already in HubSpot stays as it is.
