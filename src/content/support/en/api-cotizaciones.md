---
title: "API: Create Quotes"
description: "Endpoint to generate and send quotes programmatically."
category: "Developers"
---

The Quotes API allows you to programmatically generate dynamic proposals, ideal for integrations with CRMs like Salesforce or HubSpot.

### Create a Quote

Quotes require at least one `line_item`.

```javascript
// Example using the Cord Node.js SDK
const cord = require('cord-node')('sk_live_...');

const quote = await cord.quotes.create({
  customer_id: 'cus_9a8b7c6d',
  expiration_date: 1735689600, // Unix timestamp
  line_items: [
    {
      name: 'Annual ERP License',
      quantity: 1,
      unit_price: 1500000, // In cents ($15,000.00 MXN)
      tax_rate: 'tx_iva_16'
    }
  ],
  require_signature: true
});

console.log(quote.hosted_url); // Link to send to the customer
```

**Cents Pricing Logic:** Absolutely all amounts in the Cord API are handled in cents to avoid floating-point precision errors. A price of `1500000` is equivalent to $15,000.00.
