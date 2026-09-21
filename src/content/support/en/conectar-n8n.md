---
title: "Connect n8n"
description: "Use Cord from n8n: the community node with a webhook trigger, or the HTTP Request node against the v1 API."
category: "Developers"
order: 43
---

n8n connects to Cord in two ways. The **Cord node** is the short path; the **HTTP Request node** covers any endpoint the node does not have yet.

### With the Cord node

1. In n8n, go to **Settings › Community nodes** and install `n8n-nodes-cord`. (On n8n Cloud, community nodes are installed from that same screen; on a self-hosted instance you need admin rights.)
2. Create a secret key in Cord: **Settings**, turn on developer mode at the bottom of the index and open the **API** tab. Use a key with write permission; keys that start with `sk_test_` work against your test environment.
3. In n8n, create a **Cord API** credential and paste the key. The test button queries your account and tells you whether the key is test or live.
4. Add the **Cord Trigger** node, choose the events and activate the flow: n8n registers the webhook in Cord for you and deletes it when you deactivate the flow.
5. To act on Cord, add the **Cord** node: clients (create, update, get, search), quotes (create, get, search, send, mark as paid) and tasks.

The trigger verifies the `X-Cord-Signature-V1` signature on every delivery, so a POST to the webhook URL that does not come from Cord is discarded.

### With the HTTP Request node

1. In Cord, add your webhook in **Settings › Developer mode › Webhooks** with the URL from n8n's **Webhook** node.
2. To call the API, use the **HTTP Request** node against `https://cordhq.app/api/v1/...` with the `Authorization: Bearer sk_...` header.

### Limits

Webhooks and API calls count against your plan limits, the same as with Zapier or Make. You can see them in **Settings › Developer mode**.
