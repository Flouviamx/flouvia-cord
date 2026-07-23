---
title: "API Keys"
description: "Manage the cryptographic keys that grant access to the platform."
---

<header class="content-header">
  <h1 class="page-title">API Keys</h1>
  <p class="page-subtitle">The cryptographic token that identifies your systems when interacting with Cord.</p>
</header>

## How Keys Work

Every programmatic request to the Cord API requires an **API Key**. You can manage, revoke, and monitor their usage from **Settings > Developers > API**.

For security, Cord's systems store your API Key as an irreversible Hash (`sha-256`). The plain text key (the string starting with `sk_...` or `pk_...`) will only be shown to you **once** upon creation. If you lose it, there is no way to recover it; you must revoke it and generate a new one.

## Security Best Practices

### Do not commit secret keys to repositories
Never commit (e.g., in Git) a key starting with `sk_live_`. If Cord detects a compromised key in public Github sources, automated fraud mechanisms may preemptively suspend it. Use environment variables (like unversioned `.env` files) on your servers.

### Use the correct scope (Publishable vs Secret)
- **Secret Keys (`sk_`):** Have full read and write access to your finances and clients. They should only live on backend servers under your control.
- **Publishable Keys (`pk_`):** Designed to be safely injected into web applications (frontend). Cord will automatically apply restrictions on what these keys can see or hide sensitive fields (such as the cost/margin of [products](/docs/desarrolladores/funciones/productos)) when receiving a request signed with them.

## Real-Time Activity

Within the API tab in the dashboard, you will have access to a live audit log of each key's usage, allowing you to quickly track which IP or which flow (traditional API or MCP) originated a change in your system.
