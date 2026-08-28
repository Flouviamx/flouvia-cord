---
title: "Invoicing customers abroad"
description: "What to configure in Cord when your client is based outside your country."
category: "Invoicing"
---

Set the client up correctly and Cord bills the sale in the right currency; the specific tax treatment for a foreign client varies by the country you're issuing from.

### Common to any country: set the client's country

When you add the client, select their country in the **Country** field on their profile (not "inherit from issuer"). Cord uses that value, together with the tax ID you capture, to apply the correct treatment to the invoice.

### Mexico: service exports

Selling services or software licenses to a customer outside Mexico requires a service export CFDI:

1. In the client's tax ID field, use the SAT's generic international RFC: `XEXX010101000`. Cord doesn't have a separate field for your client's home-country Tax ID — today this single field is what's used.
2. In **CFDI Usage** on the client's profile, select **S01 (No tax effects)**, since the foreign recipient doesn't deduct taxes with the SAT.
3. When creating the quote or invoice, set its **currency** to the right one (for example, USD) and select the **Exempt** rate on the line item's tax if your accountant confirms that sale qualifies for the 0% export rate.

### Spain: a client inside or outside the European Union

If you issue Verifactu documents for a client with a country other than Spain, Cord uses the country you captured on their profile to automatically decide the correct treatment in the registry: intracommunity identification if the client is in the EU, or country-of-residence identification if they're outside it. You don't need to choose anything else beyond saving the client's correct country.

### Other countries

Outside Mexico and Spain, Cord doesn't have a special tax treatment for foreign clients beyond issuing the invoice in the sale currency you choose; check with your accountant for the correct service-export treatment in your country.
