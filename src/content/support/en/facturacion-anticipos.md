---
title: "Invoice advance payments"
description: "Issue the advance CFDI and its remainder."
category: "Billing & CFDI"
---

Invoicing large projects where you charge a percentage upfront and the rest upon delivery requires special handling with the SAT.

### Tax Rule for Advances

According to the SAT's filling guide, an advance payment only exists when **the good or service, or its final price, is not known or has not been determined**. If you already sent a detailed quote for $100,000 MXN and ask for a 50% deposit, for accounting purposes **it is not an advance**, it is an installment payment.

### How to charge in installments in Cord

1. Create your Quote for the total amount ($100,000).
2. In the *Payments and Advances* section, select **Require partial initial payment**.
3. Define the percentage (e.g., 50%).
4. When the client accepts and pays those $50,000 with a card, Cord will issue an Invoice for the total amount in `PPD` (Payment in Installments) method.
5. At that very moment, Cord will automatically stamp an **Electronic Payment Receipt (REP) Complement** covering the deposit of the initial $50,000.

When the final delivery arrives, you just have to enter the invoice and generate a payment link for the remaining balance. Once paid, Cord will issue the second and final REP.
