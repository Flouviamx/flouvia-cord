---
title: "Invoicing customers abroad"
description: "What Cord does when your client is outside your country: CFDI to a foreign resident in Mexico, reverse charge and export in the EU, and what each tax rail covers."
category: "Invoicing"
---

How a sale to a foreign client is treated depends on the country **you issue from**. Cord decides it with two details from the client's profile: their **country** and their **tax ID**.

**In short:**

- **Common step:** on the client's profile choose their **Country** and enter their tax ID (EIN, VAT number, RFC…). Cord validates the check digit in Cord's 12 countries.
- **Mexico:** the CFDI is automatically issued to a **foreign resident**: generic RFC XEXX010101000, their country, use S01 and their tax ID as the tax registration number. You do not need to enter the generic RFC.
- **European Union (Spain, Germany, France):** a business client in another EU country with a VAT number goes under **reverse charge**; one outside the EU, as an **export**.
- **Currency:** the invoice is issued in the selling currency. If your books are in another one, it declares the exchange rate locked when quoting.
- **Limitation in Mexico:** a 0% item is declared **exempt** on the CFDI; Cord does not issue taxable 0% VAT yet.

## Mexico: CFDI to a foreign resident

If the client's country is not Mexico, Cord issues the CFDI like this, without you entering anything else:

- **Recipient RFC:** XEXX010101000, the generic one for foreigners.
- **Tax residence:** the country on the profile.
- **Tax registration number:** the tax ID you entered (optional).
- **CFDI use:** S01 (no tax effects), also on their credit notes.
- The tax regime and use on the profile do not apply to a foreigner and are not sent.

**You decide each item's rate with your accountant.** Keep in mind that Cord declares a 0% item as **exempt**: it does not yet distinguish the **taxable 0% rate** that applies, for example, to the export of services. If your transaction needs the 0% rate, issue that CFDI outside Cord for now.

Cord stamps the transaction as "Not applicable" for export and **does not issue the Foreign Trade complement** required for the definitive export of goods.

## European Union: Spain, Germany and France

- **Business client in another EU country** with a VAT number, and you with yours: the transaction goes under **reverse charge** (no VAT, with the legal notice). Pick the right 0% rate on the line, for example **Entrega intracomunitaria (art. 25)** or **Inversión del sujeto pasivo** in Spain.
- **Client outside the EU:** export, without VAT. In Spain, **Exportación (art. 21)**.
- **E-invoicing:** Factur-X, XRechnung and Peppol declare the right category and, on an intra-community supply, the client's full address. See [European e-invoicing](/en/support/factura-electronica-europea).
- **Foreign currency:** if an EU issuer invoices in another currency, the PDF also prints the tax amount in euros.

In Spain, while Verifactu registration is being turned on, Cord issues pro formas. See [How to invoice in Spain with Cord](/en/support/facturar-en-espana).

## United States, Canada and the United Kingdom

The commercial invoice is issued with the rate you choose on each line. In the United Kingdom an export usually goes as **Zero-rated**; in Canada, as **Zero-rated**; in the United States, a sale outside the country carries no sales tax. Confirm it with your advisor.

## LatAm tax rails (being turned on)

| Country | Client abroad |
|---|---|
| Peru (SUNAT) | Export invoice (operation 0200 goods or 0201 services). |
| Colombia (DIAN) | Invoice with the client identified as a foreign NIT. The export invoice is not covered yet. |
| Argentina (ARCA) | Not covered: export invoice E is not issued yet. |
| Chile (SII) | Not covered: the export invoice is not issued yet. |
| Brazil (NFS-e and NF-e) | Not covered: exports are not issued yet. |

While those rails are being turned on, the sale is issued as a commercial invoice.

## Related

- [Receive international payments](/en/support/pagos-internacionales)
- [Multi-currency payments](/en/support/cobro-divisas)
- [Invoicing by country](/en/support/category/facturacion-por-pais)
