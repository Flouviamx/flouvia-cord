---
title: "Invoice advance payments"
description: "The tax treatment of charging a percentage up front and the rest later."
category: "Billing & CFDI"
---

Charging a percentage up front and the rest on delivery is common in B2B projects, but it requires careful tax handling with the SAT.

### Tax rule for advances

According to the SAT's filing guide, an advance payment only exists when **the good or service, or its final price, is not known or has not been determined**. If you already sent a detailed quote for $100,000 MXN and ask for a 50% deposit, for accounting purposes **it is not an advance**: it is a payment in installments.

### How you collect it in Cord

Cord splits the charge for you with the deposit feature (see [Collect a deposit](/en/support/cobrar-anticipo)):

1. Create your quote for the total amount ($100,000).
2. Set the **deposit %** (e.g. 50%) in the editor's sidebar.
3. When the client approves, the deposit ($50,000) is immediately payable by card or SPEI, and the balance is collected per the terms.

### The tax side is up to you

> [!NOTE]
> Cord handles the split **collection**, but stamping each installment is not automatic. Cord does not by itself generate the Payment Receipt Complement (REP) for each payment.

For the CFDI, stamp the invoice for the total amount with the appropriate method (`PUE` if cash, `PPD` if credit or installments) from the quote detail, and coordinate with your accountant to issue the REP for each payment received based on your actual operation. Automatic REP generation is on our roadmap.
