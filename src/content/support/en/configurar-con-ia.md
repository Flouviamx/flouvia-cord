---
title: "Set up your account with AI"
description: "Cord reads your website, your description and your price list, and proposes your setup for you to approve."
category: "Account & Team"
---

Instead of filling in Settings field by field, you can give Cord three things and let it propose the whole setup. Nothing is applied until you approve it.

### Where it is

- **When you create your account:** it appears right after signing up.
- **Later:** in **Settings > General > Set up with AI**.

### What you give it

1. **Your website** (optional): it provides your name, contact details, logo and brand color.
2. **What your business does** (optional): how you charge, on what terms and which taxes you handle, in your own words.
3. **Your price list** (optional): Excel, CSV, PDF or a photo, up to 3 MB.

One is enough, but the more you give it, the better the result.

### What you review

Cord shows the proposal by section: branding, business details, quotes, taxes, catalog and messages. You can change any field, drop the logo and uncheck products. New taxes arrive **unchecked**: check them only if you really use them. When you click **Apply**, Cord saves them with the same validations as Settings and shows you what was applied.

### Good to know

- **It validates before proposing.** A tax ID that fails your country's validation, an invalid email or an out-of-range rate is dropped, and the review tells you why.
- **It doesn't upload your certificate or enable payments.** The CSD in Mexico, the Verifactu certificate in Spain and Cord Payments remain your steps.
- **Limit:** up to six proposals a day per company. Each one expires after 7 days if you don't apply it. It doesn't use your plan's AI credits.
- **If you're in the test environment** and open a proposal, Cord asks you to leave it: the proposal sets up your real account.

### From the terminal or an agent

If you work with a developer or an AI assistant, the same proposal can be requested with `cord setup` from the [Cord CLI](/en/support/cli-cord) or with the `proponer_configuracion` tool of the [MCP server](/en/support/conectar-ia-mcp). Either way you get a link to this same review.
