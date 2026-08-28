---
title: "Client Catalog and Tax ID"
description: "How Cord stores your clients' tax IDs and what validation actually happens."
category: "Invoicing"
---

This article covers the RFC as Mexico's tax ID field; in other countries the same field stores your client's local tax identifier (NIF/CIF in Spain, EIN/Tax ID in the United States, and so on, based on the country you've configured).

### What Cord stores today

When you add a client, the tax ID field is saved exactly as you type it, in uppercase. Cord **does not validate the postal code against the SAT catalog, nor does it automatically clean up the corporate name** (for example, stripping "S.A. DE C.V.") — if the SAT rejects a CFDI 4.0 because the captured name or postal code doesn't match your client's Tax Situation Certificate (CSF), the fix today is manual: copy the name and postal code exactly as they appear on the CSF before saving the client.

### Bulk import via CSV

If you're coming from another system, use the bulk import from your **Clients** directory. Each row accepts: company name, contact, email, phone, tax ID, payment terms (cash, Net 30, or Net 60), and credit limit. If a client already exists (same tax ID or same company name), the import updates that row instead of duplicating it.

<Callout type="info">
Since the import doesn't validate the tax ID or the postal code against any official catalog, data quality depends entirely on your source file: copy it directly from the CSF (or the equivalent tax document in your country) for each client to avoid rejections when invoicing.
</Callout>
