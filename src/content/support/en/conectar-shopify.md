---
title: "Connect Shopify"
description: "Bring your store's products and customers into Cord to quote wholesale with real data, and keep them current on their own."
category: "Account & Team"
order: 24
---

With Shopify connected, your store's catalog and customers come into Cord and stay current. You quote wholesale with the prices and SKUs you already have, without typing them again.

**Cord only reads from your store.** It does not change prices, inventory, or orders in Shopify.

### Connect it

1. Go to **Settings › Integrations › Shopify**. You need the **Settings** permission.
2. Type your store domain, the one ending in `myshopify.com`. You'll find it in Shopify › Settings › Domains.
3. Click **Connect Shopify**. It takes you to Shopify to authorize the app, where you can see exactly what it asks for: read products and read customers.
4. When you return, the card says connected. The first sync takes a few minutes depending on catalog size.

### What it brings, and how

- **Products:** each Shopify **variant** is a product in Cord, because that is what has its own price and SKU. A shirt with three sizes arrives as three products.
- **Customers:** the company comes from the customer's company in Shopify; if there is none, from the person's name. If that email already exists in your client list, Cord does not duplicate it: it recognizes it and fills in what's missing.
- **Kept current:** when you change a product or customer in Shopify, Cord updates it within seconds. A product deleted in Shopify is **deactivated** in Cord, not deleted: it may sit inside a quote you already sent.
- **Sync now:** the button on the card reads the whole catalog again. Useful right after connecting, or whenever something looks off.

### Disconnect

From the same card, with **Disconnect**. The products and customers already imported stay in Cord, like any other data of yours; they simply stop updating. If you uninstall the app from Shopify, Cord finds out on its own and marks the connection as disconnected.

### If something fails

- **"Type your store domain"**: you used your own domain (`mystore.com`). Shopify authenticates with its own, the one ending in `myshopify.com`.
- **"We could not verify the response came from Shopify"**: the install return arrived without the right signature or too late. Start again from Cord, not from a saved link.
- **The card says it needs reconnecting**: someone uninstalled the app in Shopify or changed its permissions. Connect it again from Cord.
