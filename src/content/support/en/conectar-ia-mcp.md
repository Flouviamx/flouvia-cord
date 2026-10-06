---
title: "Connect Claude, Cursor or another AI to Cord (MCP)"
description: "How to give an AI assistant access to your quotes, invoices and collections with Cord's MCP server, and what it can do."
category: "Developers"
---

Cord's MCP server connects assistants like Claude Desktop, Claude Code or Cursor to your business data. The AI can look things up and, if you allow it, also create and send.

### Connect it

1. Go to **Settings > MCP** and copy the configuration block for your client (Claude Desktop, Cursor or a direct URL).
2. Use an API key: **read** if you only want it to look things up, **write** if you also want it to draft or send quotes.
3. Before connecting anything, you can try any read tool in the tester on that same screen.

### What it can do

There are 26 tools. Some of the most useful:

- **Look up:** quotes, invoices and their balance, overdue receivables, clients, products, event history and a business summary.
- **Create and send** (write key): draft quotes and invoices, send a quote, mark it approved or paid, add clients, tasks and payment promises.
- **Set up your account:** `proponer_configuracion` builds your profile, taxes and catalog from your website and shares a link for you to approve. The AI never applies it on its own.
- **Help with integration:** searches the docs, validates an RFC or NIF before saving it and fires test webhooks (test keys only).

### Good to know

- **Actions that reach your client** (send, approve, reject, record payment) are marked as having real effects: a well-configured MCP client asks you to confirm before running them.
- **No tool stamps invoices** or changes your account settings directly.
- **What your client writes** on the public link reaches the AI marked as an external message, so it doesn't follow it as an instruction.
- **Every call counts** as an API request on your plan and shows up in the activity log.

Technical detail in the [MCP server guide](https://docs.cordhq.app/en/docs/desarrolladores/herramientas/mcp).
