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
It is the official XML file that represents an electronic invoice in Mexico. Cord stamps CFDI version 4.0 from the Starter plan, with your business's CSD.

### PUE (Pago en Una sola Exhibición)
Used when the invoice is already paid when issued. Cord decides it on its own: if the sale is fully collected when stamping, the CFDI is issued PUE with the real payment method.

### PPD (Pago en Parcialidades o Diferido)
Used when the invoice is issued and payment will be received later (credit or installments). Cord stamps PPD with payment method 99 when the invoice is not paid when issued, and each later payment requires a REP.

### REP (Recibo Electrónico de Pago)
Also known as "payment complement" or type P CFDI. It documents each payment on a PPD invoice. Cord issues it on its own every time a payment is applied to a PPD invoice: when recorded manually, paid online or moved from the quote to the invoice. A payment in another currency is left to your accountant. See [PPD invoices and payment complements](/en/support/complementos-de-pago).

### CSD (Certificado de Sello Digital)
These are the cryptographic files (`.cer` and `.key`) issued by the SAT that allow software to digitally sign invoices on behalf of a company. It is different from the FIEL (Advanced Electronic Signature). In Cord, you only need to upload your CSD.

### CFDI Usage (Uso de CFDI)
A key from the SAT catalog that indicates what the recipient (customer) will use the invoice for (e.g., `G03 - General expenses`, `I04 - Computer equipment`).

### Global invoice (Factura global)
A CFDI that documents, addressed to PUBLICO EN GENERAL (RFC XAXX010101000), the collected sales of a period where the client did not ask for an invoice. See [General public invoicing and the global invoice](/en/support/facturar-publico-general).

### Replacement (reason 01)
The way to correct a CFDI with another: the new one is related to the original and Cord cancels the original under reason 01. See [Void invoices](/en/support/cancelar-facturas).

---

## Invoicing terms in other countries

### Pro forma and commercial invoice
A **pro forma** (Mexico and Spain) is a commercial document that states it does not replace a tax invoice. A **commercial invoice** (the other countries) carries a number, taxes and both parties' details, but Cord does not submit it to any authority.

### Verifactu
The verifiable invoicing system required by Spanish law: each invoice creates a chained record sent to the AEAT. In Cord it is being turned on. See [How to invoice in Spain](/en/support/facturar-en-espana).

### Factur-X, XRechnung, Peppol and Facturae
European e-invoice formats that the client's system reads without manual entry. See [European e-invoicing](/en/support/factura-electronica-europea).

### CAE, CUFE and DTE
What each LatAm authority gives an authorized invoice: the **CAE** from ARCA (Argentina), the **CUFE** from the DIAN (Colombia) and the **DTE** with its SII folio (Chile). In Cord, those rails are being turned on. See [Invoicing by country](/en/support/category/facturacion-por-pais).

### NFS-e and NF-e
In Brazil, the **NFS-e** documents services (issued by the national NFS-e system) and the **NF-e** documents the sale of goods (authorized by each state's SEFAZ). See [How to invoice in Brazil](/en/support/facturar-en-brasil).

### Debit note
A document that increases what the client owes on an issued invoice (interest, price difference). In Cord it exists for Chile (DTE 56). See [Debit note and SII certification](/en/support/nota-de-debito-sii-chile).

---

## Technical Terms (Developers)

### Idempotency
It is the property of Cord's APIs that guarantees that the same operation is not executed twice, even if the request is sent multiple times due to a network error. To achieve this, you send an `Idempotency-Key` in the headers of your requests. [More information](/en/support/idempotencia).

### Webhook
It is a mechanism by which Cord proactively notifies your server (via an HTTP POST request) that an important event has occurred (e.g., `quote.paid`, `quote.invoiced`). [More information](/en/support/configurar-webhooks).

### Cord Elements
It is our suite of pre-built user interface (UI) components that you can embed directly into your application (React, Vue, or plain HTML) to process payments without having to design the checkout flow from scratch. [More information](/en/support/cord-elements).

### Test mode
`sk_test_` keys don't consume your usage meter or count toward billing, so they're useful for integrating the API without affecting your plan. Note: they operate on the same organization data (there's no 100% isolated sandbox yet), and whether stamping is real or simulated depends on whether you have your CSD connected.

### Endpoint
A specific URL of the Cord API designed to execute an action (e.g., `POST /api/v1/cotizaciones` to create a quote).

---

## B2B Financial Terms

### Net-30 / Credit Terms
It means that the customer has 30 calendar days from the issuance of the invoice (or product delivery) to settle the total balance.

### Dispute (Chargeback)
Occurs when an end customer contacts their bank to reject a charge processed via Cord. The bank temporarily holds the funds while Cord helps you submit evidence to win the dispute.

### Reconciliation
The process of matching a money movement in the corporate bank account with its respective invoice or accounting record. Cord automates this for payments that go through Cord Payments (card, and in Mexico, SPEI); a manual bank transfer deposit is confirmed by you.
