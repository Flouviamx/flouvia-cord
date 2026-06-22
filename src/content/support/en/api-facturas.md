---
title: "API: Issue and Download Invoices"
description: "Stamp CFDI 4.0 directly from your internal systems."
category: "Developers"
---

The `Invoices` endpoint controls CFDI 4.0 stamping in Mexico. When you use this endpoint in *Live* mode, you connect directly to our certified PAC (Facturapi).

### Stamp a Direct Invoice

If you do not wish to go through a quote flow and only want to generate a CFDI 4.0 (Income):

```bash
curl -X POST https://api.flouvia.com/v1/invoices \
  -H "Authorization: Bearer sk_live_..." \
  -d '{
    "customer_id": "cus_12345",
    "payment_form": "03", // 03 = Electronic funds transfer
    "payment_method": "PUE", // Payment in a single installment
    "use": "G03", // General expenses
    "items": [
      {
        "product_key": "43231500", // SAT Software Key
        "description": "Custom development",
        "price": 5000000
      }
    ]
  }'
```

**Asynchronous Generation:** The API will respond with a `status: processing`. Stamping with the PAC can take between 1 to 5 seconds. We recommend listening to the `invoice.created` webhook event to know when to download the PDF and XML.
