---
title: "Client Catalog and RFC"
description: "Management and validation of RFCs in the client list."
category: "Billing & CFDI"
---

Client management in Cord is designed to avoid SAT rejections when issuing CFDI 4.0.

### Real-time Validation (CFDI 4.0)

In version 4.0 of the CFDI, the Name/Corporate Name and the Postal Code must match letter by letter with the client's Tax Situation Certificate (CSF).
When you add a client in Cord:
1. The system validates the Postal Code against the official SAT list.
2. If the Corporate Name includes the corporate regime (e.g. "ACME S.A. DE C.V."), Cord will **automatically clean it** to "ACME", since the SAT rejects invoices that include the "SA de CV".

**Bulk import tip:** If you are coming from another system, use our CSV import tool. Make sure that the Name and Postal Code columns come directly from the CSF of your clients to avoid future operational blockages.
