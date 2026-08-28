---
title: "Cancelling an invoice with related documents"
description: "What to do when the SAT rejects a cancellation because of a linked Credit Note or another related document."
category: "Invoicing"
---

This applies only to organizations in **Mexico**, where Cord stamps CFDI 4.0 with the SAT. Outside Mexico this block doesn't exist, because there's no chained tax document to break.

The SAT is strict when you try to cancel an invoice (Income) that already has a related document, such as a Credit Note (Expense). If the child document is still active, the SAT rejects the cancellation of the parent invoice.

### Break the chain from back to front

1. Locate the related Credit Note. Its own detail page shows which invoice it came from (you'll see the label "Credit note of [invoice number]"); if you don't have it handy, search for it in your **Invoices** inbox by date or client.
2. Open that Credit Note and cancel it first, from its own detail page options menu.
3. Wait a few minutes for the SAT to register the child document's cancellation.
4. Now go back to the main invoice and cancel it.

### What Cord does when you cancel

The **Cancel invoice** button asks for confirmation and cancels the document with the SAT using the standard reason `02 — Document issued with errors without relationship`. That's the correct reason when you're going to redo the invoice from scratch (for example, you made a mistake in the client's RFC).

<Callout type="info">
Reason `01 — Document issued with errors with relationship` requires declaring to the SAT which CFDI replaces the one you're cancelling, and that link isn't built automatically from Cord's interface today. If you need to cancel by substituting one CFDI for another, reach out to us and we'll help you sort it out.
</Callout>
