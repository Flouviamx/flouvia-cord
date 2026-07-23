---
title: "Test Environments"
description: "Learn how to isolate your development using the Cord Sandbox."
---

<header class="content-header">
  <h1 class="page-title">Test Environments (Sandbox)</h1>
  <p class="page-subtitle">Isolate your development, experiment fearlessly, and clear your data with a single click.</p>
</header>

## Why use Test Environments?

When integrating financial APIs, it is critical to test your application's logic without generating real transactions or sending emails to real customers. Cord solves this by providing you with a completely isolated **Test Environment (Sandbox)**.

Data created in test mode (quotes, clients, webhooks) never interacts with your live data.

## Identifying Test Mode

1. **In the Dashboard:** When Test Mode is active, you will see a visual orange indicator in the interface. All manual actions you perform will occur within the isolated environment.
2. **In the API:** Your secret API keys automatically determine which environment you are calling. A test key will interact with the Sandbox, while a live key will touch your real data.

> **Important:** Never use real keys in your unit or integration test suites.

## Quick Reset (Sandbox Reset)

During integration development, you will often generate thousands of garbage records. Cord has a radical tool to return your environment to a clean slate: the Reset Endpoint.

### Clearing test environment data

You can invoke a destructive cleanup (which will cascade delete clients, quotes, products, and events from the test environment) by making a POST to the following internal endpoint (requires an active browser session in Test Mode):

```bash
POST /api/test-mode/reset
```

> **Warning:**
> This endpoint contains strict database protections (`sandbox_of is not null`). Even if you call it by mistake in your live environment, the database will abort the transaction to protect your real data. It only works within Sandbox environments.
