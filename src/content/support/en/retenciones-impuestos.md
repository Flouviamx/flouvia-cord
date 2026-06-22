---
title: "Configure withholdings (ISR/IVA)"
description: "Automatically apply withholdings according to the tax regime."
category: "Billing & CFDI"
---

Invoicing professional services or fees to Legal Entities (Personas Morales) requires applying specific tax withholdings (Income Tax and VAT withholdings) to the subtotal.

### Withholding Automation

Cord calculates mandatory withholdings according to the Tax Regime you have configured for both yourself (issuer) and your customer.

For example, if you are RESICO (Simplified Trust Regime) and you quote a service to a Legal Entity:
1. Add the service to your quote for $10,000 MXN.
2. Upon creating the quote, Cord will automatically detect your regime and **apply a 1.25% Income Tax (ISR) withholding** ($125 MXN) transparently.
3. The customer will see the perfect breakdown on the proposal and pay the correct amount ($11,475 = 10,000 + 1,600 VAT - 125 ISR).

When converting the quote to a CFDI (electronic invoice), the XML will include the `Retenciones` (Withholdings) nodes required by the SAT. You can manually adjust or override these withholdings in the quote settings if you are selling a good that does not warrant it (e.g., pure hardware sales).
