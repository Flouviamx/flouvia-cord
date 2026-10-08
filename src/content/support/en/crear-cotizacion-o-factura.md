---
title: "Create a quote or an invoice step by step"
description: "Cord's editor from start to finish: client and terms, lines, terms of sale, preview, sending, autosave and shortcuts."
category: "Quotes"
order: 0
---

A new quote, a draft, a new version and an invoice all use **the same editor**. Open it from **Quotes > New quote**, **Invoices > New invoice** or the **Create** button in the top bar. What changes between a quote and an invoice is the wording and step 3.

### Optional shortcut: build it with AI

At the top of the editor is **Build the quote with AI** (or **Build the invoice with AI**). Paste the client's order or attach a photo or PDF of their purchase order and click **Build quote with AI**: Cord matches the request against your catalog and fills in the lines. Always check quantities and prices. If the document already had lines, it asks whether to **Replace** them or **Add at the end**.

When the document already has lines, this block shows up folded into a single bar with an **Open** button. It's optional: you can start right at step 1.

### Step 1: Who are you quoting?

1. In **Client**, type in the search box: it filters by company, contact, email or tax ID. Move with the arrow keys and pick with **Enter**; **Escape** closes the list and keeps the client you already had.
2. If the client doesn't exist, the last option is always **+ Create new client…**: you add them in a dialog and they stay selected.
3. Below you'll see their email and tax ID. If the client has a discount tier, the note "Client tier: −10% applied to your catalog list prices" appears (with their percentage).
4. On the right you choose the **Payment terms**: **Due on receipt**, **Net 15**, **Net 30**, **Net 60** or **Other term** (Net 7, Net 45 or Net 90). Picking the client preselects the terms on their record.

### Step 2: What are you quoting?

- **Add from your catalog:** type in "Search your catalog… (name or SKU)" and press **Enter**. To add several units at once, type the quantity next to the name: "40 pipe", "40x pipe" or "pipe x40" adds 40. You can add several products in a row without leaving the search box.
- **Free line:** **+ Free line** for an item that isn't in your catalog.
- **Kits:** **+ Insert kit** adds every line of a kit; you can say how many times to insert it and, if the kit has a bundle price, it's applied.
- **Price:** each line shows **List** (your catalog price) and **Price** (what you charge). Lower the price without touching your list price; the list price shows struck through. Quantities accept decimals (1.5, 0.125) and prices accept a comma or a period.
- **Duplicate and remove:** each line has buttons to duplicate or remove it. If you remove one by mistake, the "Removed … Undo" bar lets you get it back for a few seconds.
- **Reorder:** drag the line by its handle, or use **Alt + Up/Down arrow** from any field in the line.
- **Tax per line:** if your catalog has more than one rate, each line shows its own tax column.
- **Margin:** on quotes, the **Margin** column shows your profit on the price when the product has a cost entered.

A line without a price or with a zero quantity is flagged in red and isn't saved until you fix it (the price can be 0 if that's what you decide).

### Step 3: Terms

**On a quote:**
- **Valid for:** how many days the offer is valid (15, 30, 60 or your account's default).
- **Deposit (%)** (optional): the editor tells you how much your client pays on approval and how much later. See [Collect a deposit](/en/support/cobrar-anticipo).
- **Which currency are you quoting in?:** the sale currency. See [Multi-currency quotes](/en/support/cotizaciones-multimoneda).
- **Monthly recurring charge (retainer):** charges the total every month by card. It only works with due-on-receipt terms and has no deposit.

**On an invoice:**
- **Due date:** the payment deadline; changing the terms recalculates it.
- **Document type:** pro forma or commercial invoice, or your country's tax document (CFDI 4.0 in Mexico, VERI\*FACTU in Spain) when your plan and tax setup allow it. See [Commercial invoicing on Free](/en/support/facturacion-gratis).
- **Invoice currency.**

If you change the currency, prices are **not converted**: your lines keep the same numbers in the new currency, so review them. At the end you can add a **Note for your client** (optional).

### Review and send

The summary on the right shows the line and unit count, the subtotal, the discount given, taxes by rate, withholdings and the **Total**, with the terms below it (for example "Net 30 · valid for 30 days"). That's also where you turn on **Prices include VAT** (or your country's tax) if your prices already include it.

- **Preview** opens "What your client will see": an approximate view of the document. It doesn't save anything; the final PDF uses your template, branding and tax details.
- **Quote:** **Create and send** (or **Save and send** on a draft) generates the public link and sends it. **Save draft** (or **Save changes**) saves without sending. If your organization uses approvals and the discount, amount or margin falls outside your policy, sending asks for approval instead of reaching the client.
- **Invoice:** **Issue and send** opens a final review with the client, total, due date and the email it goes to before **Issue invoice**. You also have **Issue without sending** and **Save and exit**. Issuing assigns the number and can't be undone: after that, a correction needs a void or a credit note.

### Autosave and unsaved changes

- An existing **draft** saves itself a few seconds after each change; the summary shows "Saved at …" or warns you if it couldn't save.
- A **new** document isn't created in your account until you save or send it. Meanwhile, this browser keeps a copy: if you close without saving, the next time you open **New quote** or **New invoice** it asks whether to **Restore** the client, terms, note and lines. The copy lasts 7 days and lives only on that device.
- If you try to leave with unsaved changes, Cord asks you to confirm.

### Keyboard shortcuts

- **⌘ Enter** (Ctrl + Enter on Windows): sends the quote or issues the invoice.
- **⌘ S** (Ctrl + S): saves the draft.
- **/**: jumps to the catalog search. **⌘ K** (Ctrl + K) still opens the app-wide search.

Outside the editor, `C` opens a new quote and `F` a new invoice from any screen. Every app shortcut is in [Getting around Cord](/en/support/moverse-por-cord).

### On your phone

The editor stacks into a single column and nothing is hidden: in each line, quantity and price carry their own label. A bar fixed at the bottom shows the **Total** and the main button, and steps aside once the summary is in view. Keyboard shortcuts and drag-to-reorder are desktop only.

### New version of a sent quote

If the client asks for changes to a quote that was sent, viewed or has expired, open it and use **Modify and resend** (it shows the next version number, for example V2). The same editor opens with the version tag: you change lines and prices, while the client, currency and terms stay as they were sent. **Send new version** publishes it at the same link and the previous one stays in the history.

The version restarts the validity from today with the same length it was sent with (this is how an expired quote comes back). If you need to change the client, currency or terms, use **Duplicate quote** to start from a copy. See [Duplicate or Clone Quotes](/en/support/clonacion-cotizaciones).
