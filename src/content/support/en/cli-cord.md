---
title: "Using the Cord CLI"
description: "Connect your terminal from the browser, set up your account, integrate your project and test webhooks on your machine."
category: "Developers"
---

The Cord CLI (`@flouviahq/cli`) is the terminal tool for integrating Cord into your project. It only works in **test mode**: nothing you do with it touches live data.

### The fastest way: the wizard

```bash
npx @flouviahq/cli
```

It walks you through it with menus: connects your terminal, sets up your account with AI, integrates your project (installs the SDK, creates the routes and saves the keys to your `.env.local`) and starts listening for webhooks. At the end it shows a summary of what's ready.

### Install and sign in

```bash
npm install -g @flouviahq/cli
cord login
```

`cord login` opens your browser with a confirmation code. Check that it matches the one in your terminal and click **Authorize**. You need Settings permission in the company. The terminal receives a restricted test key on its own: it can use the simulators, read events and propose setups, and it expires in 90 days. It shows up in the **Developers › API** dock as `CLI · <your machine>`, where you can revoke it.

- Working over SSH without a browser? `cord login --no-browser` prints the address so you can open it on another device.
- Prefer to paste your own key? `cord login --api-key`.

### Main commands

| Command | What for |
|---|---|
| `cord setup` | Proposes your account setup from your website and price list. You approve it in the browser. |
| `cord init` | Detects your framework and adds the webhook route with signature verification. |
| `cord listen --forward-to http://localhost:3000/api/webhooks/cord` | Forwards test webhooks to your local server. |
| `cord trigger quote.approved` | Fires a test event. |
| `cord simulate fiscal pac_caido` | The next test invoice fails as if the PAC didn't respond. |
| `cord events tail` | Shows events as they happen. |
| `cord whoami` / `cord logout` | Shows the connected company / deletes the saved key. |

### Common issues

- **"The code expired":** the code lasts 10 minutes. Run `cord login` again.
- **"That's a live key":** the CLI rejects `sk_live_` keys on purpose. Use a test one.
- **You don't see the authorize screen:** your user needs Settings permission in the company. Ask your administrator.

More detail in the [CLI guide](https://docs.cordhq.app/en/docs/desarrolladores/herramientas/cli).
