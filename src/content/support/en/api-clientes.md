---
title: "API: Manage Customers"
description: "Synchronize your customer catalog with your ERP."
category: "Developers"
---

The `Customer` object is fundamental in Cord's architecture, as it links payment methods, recurring billing, and credit history.

### Creating a Customer

To register a new customer from your backend, make a `POST` request to `/v1/customers`:

```bash
curl -X POST https://api.flouvia.com/v1/customers \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "email": "payments@acmecorp.com",
    "tax_id": "ACM190203XYZ",
    "metadata": {
      "erp_id": "CUST-8812"
    }
  }'
```

**Key Fields:**
- `tax_id`: If you provide a valid RFC in Mexico, the system will use it to automatically issue invoices (CFDI 4.0) if configured to do so.
- `metadata`: Use this key-value object to store your customer's ID from your own ERP or database. Cord will return this metadata in all customer-related webhooks.
