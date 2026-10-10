---
title: "Invoice advance payments"
description: "The tax treatment of charging a percentage up front and the rest later."
category: "Invoicing"
---

Charging a percentage up front and the rest on delivery is common in B2B projects, but it requires careful tax handling with the SAT.

### Tax rule for advances

According to the SAT's filing guide, an advance payment only exists when **the good or service, or its final price, is not known or has not been determined**. If you already sent a detailed quote for $100,000 MXN and ask for a 50% deposit, for accounting purposes **it is not an advance**: it is a payment in installments.

### How you collect it in Cord

Cord splits the charge for you with the deposit feature (see [Collect a deposit](/en/support/cobrar-anticipo)):

1. Create your quote for the total amount ($100,000).
2. Set the **deposit %** (e.g. 50%) in the editor's sidebar.
3. When the client approves, the deposit ($50,000) is immediately payable by card (or SPEI, for businesses billing in Mexican pesos), and the balance is collected per the terms.

### The tax side is up to you

> [!NOTE]
> Cord handles the split **collection** and the payment complement of every payment applied to a PPD invoice. It does not issue the SAT advance-payment procedure (advance CFDI and its application).

For the CFDI, click **Stamp CFDI 4.0** from the quote detail. Cord decides the method: if the sale is already fully paid it is issued `PUE`; if a balance remains, it is issued `PPD` and every payment you receive afterwards (the balance, an installment or a partial payment) issues its automatic payment complement. What was collected **before** stamping (for example, the advance) moves to the invoice as one more payment. If your transaction is a true advance, the SAT requires its own procedure: resolve it with your accountant **before** stamping. See [PPD invoices and payment complements](/en/support/complementos-de-pago).
