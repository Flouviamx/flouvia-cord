---
title: "Cancellation with Related CFDI (01)"
description: "Properly replace invoices with errors."
category: "Billing & CFDI"
---

The SAT is very strict when you attempt to cancel an invoice (Income) that already has related documents, such as Credit Notes (Expense) or Payment Receipt Supplements (REP). The SAT will throw a 400 error indicating that the CFDI is not cancellable.

### Steps to untangle a related CFDI

To achieve the cancellation, you must "break" the chain from back to front:

1. Locate the Payment Receipt Supplement (REP) or Credit Note that is related to the main invoice.
2. **Cancel that secondary document first.** Use the reason `02 - Document issued with errors without relationship`.
3. Wait 5 minutes for the SAT to process the cancellation of the child document and for its status to change to *Cancelled*.
4. Now, go to the main invoice and request its cancellation. If you are going to replace it, use the reason `01 - Document issued with errors with relationship`. Otherwise, use the reason `02`.

Cord simplifies this by displaying a relationship tree in the invoice view, indicating exactly which document is blocking which.
