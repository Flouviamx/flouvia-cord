---
title: "Invoicing customers abroad"
description: "What to configure in Cord when your client is based outside your country."
category: "Invoicing"
---

Set the client up correctly and Cord bills the sale in the right currency; the specific tax treatment for a foreign client varies by the country you're issuing from.

### Common to any country: set the client's country

When you add the client, choose their country in the **Country** field at the top of their profile. It comes preselected with your business's country: change it if the client is based elsewhere. Cord uses that value, together with the tax ID you capture, to apply the correct treatment to the invoice; it also adjusts the tax ID's name, the phone's country code and the address format.

### Mexico: CFDI to a foreign resident

If your business is in Mexico and the client's country is another one, Cord stamps the CFDI to a **foreign resident** without any extra setup:

1. In the client's profile, choose their **Country** and enter **their home-country tax number** in the tax ID field (EIN in the United States, NIF in Spain, VAT number in the United Kingdom…). Don't type an RFC: they don't have one.
2. When stamping, Cord uses the SAT generic foreign RFC (`XEXX010101000`), declares the **tax residence** of the country in the profile, sends their tax number as the **foreign tax registration number** and sets the use to **S01 (No tax effects)**. The tax regime and CFDI use in the profile don't apply to a foreign client.
3. When creating the quote or invoice, choose its **currency** (for example, USD) and the tax rate of each line. That's your call with your accountant: exported services usually go at 0%.

Cord doesn't issue the **Foreign Trade complement** (Comercio Exterior), which the definitive export of goods (key A1) requires. Services and licenses don't need it.

### Spain: a client inside or outside the European Union

If you issue Verifactu documents for a client with a country other than Spain, Cord uses the country you captured on their profile to automatically decide the correct treatment in the registry: intracommunity identification if the client is in the EU, or country-of-residence identification if they're outside it. You don't need to choose anything else beyond saving the client's correct country.

### Other countries

Outside Mexico and Spain, Cord doesn't have a special tax treatment for foreign clients beyond issuing the invoice in the sale currency you choose; check with your accountant for the correct service-export treatment in your country.
