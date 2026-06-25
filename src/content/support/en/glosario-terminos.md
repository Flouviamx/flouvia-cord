---
title: "FinTech and Accounting Glossary"
description: "Dictionary of technical, financial, and tax (SAT) terms used on the Cord platform."
category: "Account & Team"
order: 99
---

Cord bridges two worlds that speak different languages: **Developers** and **Accountants**.

This glossary resolves the most common ambiguities so that both teams can integrate the platform without friction.

## Invoicing Terms (SAT)

### CFDI (Comprobante Fiscal Digital por Internet)
It is the official XML file that represents an electronic invoice in Mexico. Cord issues CFDI version 4.0 automatically.

### PUE (Pago en Una sola Exhibición)
Used when the collection of an invoice is made at the exact moment of issuance or before issuing it. If a customer pays via Credit Card on a Cord link, the generated invoice will be PUE.

### PPD (Pago en Parcialidades o Diferido)
Used when the invoice is issued but the payment will be received at a future date (credit). PPD invoices **always** require a REP to be issued later when the money arrives in the account.

### REP (Recibo Electrónico de Pago)
Also known as "Payment Receipt Supplement". It is a secondary receipt issued to "settle" an original PPD invoice. Cord can automate the issuance of REPs when it detects the reconciliation of the bank deposit.

### CSD (Certificado de Sello Digital)
These are the cryptographic files (`.cer` and `.key`) issued by the SAT that allow software to digitally sign invoices on behalf of a company. It is different from the FIEL (Advanced Electronic Signature). In Cord, you only need to upload your CSD.

### CFDI Usage (Uso de CFDI)
A key from the SAT catalog that indicates what the recipient (customer) will use the invoice for (e.g., `G03 - General expenses`, `I04 - Computer equipment`).

---

## Technical Terms (Developers)

### Idempotency
It is the property of Cord's APIs that guarantees that the same operation is not executed twice, even if the request is sent multiple times due to a network error. To achieve this, you send an `Idempotency-Key` in the headers of your requests. [More information](/en/support/idempotencia).

### Webhook
It is a mechanism by which Cord proactively notifies your server (via an HTTP POST request) that an important event has occurred (e.g., `quote.paid`, `quote.invoiced`). [More information](/en/support/configurar-webhooks).

### Cord Elements
It is our suite of pre-built user interface (UI) components that you can embed directly into your application (React, Vue, or plain HTML) to process payments without having to design the checkout flow from scratch. [More information](/en/support/cord-elements).

### Test mode
`sk_test_` keys don't consume your usage meter or count toward billing, so they're useful for integrating the API without affecting your plan. Note: they operate on the same organization data (there's no 100% isolated sandbox yet), and whether stamping is real or simulated depends on your Facturapi configuration.

### Endpoint
A specific URL of the Cord API designed to execute an action (e.g., `POST /api/v1/cotizaciones` to create a quote).

---

## B2B Financial Terms

### Net-30 / Credit Terms
It means that the customer has 30 calendar days from the issuance of the invoice (or product delivery) to settle the total balance.

### Dispute (Chargeback)
Occurs when an end customer contacts their bank to reject a charge processed via Cord. The bank temporarily holds the funds while Cord helps you submit evidence to win the dispute.

### Reconciliation
The process of matching a money movement in the corporate bank account with its respective invoice or accounting record. Cord automates 95% of B2B reconciliation.
