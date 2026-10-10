---
title: "Set up tax withholdings"
description: "Which withholdings Cord seeds per country, which base they are calculated on, how to make them the default and what each tax document does with them."
category: "Invoicing"
---

A **withholding** is **subtracted** from the total your client pays you: they pay it to the authority on your behalf. In Cord, withholdings live in your organization's tax catalog and apply to the whole document, not line by line.

**In short:**

- **Where:** **Settings › Quotes › Taxes**. Your catalog already includes your country's standard withholdings.
- **How they apply:** mark the withholding profile you use as the **default** and it applies to every new quote and invoice while it stays marked.
- **Base:** each profile says whether it is calculated on **the subtotal**, **the taxable subtotal** (without exempt items) or **the tax charged**.
- **Tax documents:** the CFDI and the Facturae declare them; Factur-X, XRechnung and Peppol have nowhere to, so an invoice with a withholding has no such versions.

## Which withholdings your catalog includes

| Country | Seeded withholdings | Calculated on |
|---|---|---|
| Mexico | Retención IVA 10.6667%, Retención ISR 1.25%, Retención IVA 4% (autotransporte), Retención IVA 6% (servicios de personal) | VAT: the taxable subtotal. ISR: the subtotal. |
| Colombia | ReteIVA 15%, ReteFuente 2,5% | ReteIVA: the VAT. ReteFuente: the subtotal. |
| Spain | Retención IRPF 15%, Retención IRPF 7% (nuevo autónomo) | The subtotal. |
| Chile | Retención honorarios 15,25% (not default) | The subtotal. |
| Peru | None, on purpose | IGV withholding is applied by your client if they are a withholding agent, not by your invoice. |
| Elsewhere | None | You can create one with **+ New tax**. |

Mexico's VAT withholding is two thirds of 16% (10.6667%, not 10.667%) and is only calculated on items that charge VAT: an exempt item is not part of its base. Colombia's ReteIVA is 15% **of the VAT**, not of the subtotal.

## Turn on a withholding

1. Go to **Settings › Quotes › Taxes**.
2. Review the withholding profile. When creating one with **+ New tax**, choose the **Type**, the **Rate (%)**, **Calculated on** and, in Mexico, the **Tax withheld on the CFDI** (VAT or ISR).
3. Mark the profile as **Default** (or turn on **Default for this type** when creating it).
4. From then on, every new quote or invoice applies that withholding and the editor summary shows it subtracted from the total.

<callout type="warning">

Cord does not detect your tax regime or your client's to decide whether a withholding applies: it applies because you marked a profile as the default. Since it is a whole-document policy, a default profile applies to **every** new quote or invoice. If you mix sales that carry a withholding with others that do not, remove the default before entering the ones that do not and mark it again afterwards.

</callout>

## What each document does with a withholding

| Document | Withholdings |
|---|---|
| CFDI 4.0 (Mexico) | Declares each VAT and ISR withholding per item. Sales with withholdings do not enter the global invoice: the SAT requires one invoice per transaction. |
| Facturae (Spain) | Declares IRPF. It is the only electronic version of an invoice with IRPF. |
| Factur-X, XRechnung, Peppol | Have nowhere to declare a withholding: that invoice has no electronic version. |
| Verifactu (Spain, being turned on) | Declares the total amount without subtracting IRPF; the PDF shows the invoice total and the amount to pay separately. |
| DIAN (Colombia, being turned on) | Reports ReteIVA and ReteRenta (your ReteFuente). A withholding that cannot be classified with certainty is not reported, but still reduces the total in Cord. |
| NFS-e (Brazil, being turned on) | Only ISS withheld by the client, if you mark that profile as ISS in the NFS-e section. |
| ARCA, SII and NF-e (being turned on) | Not issued with withholdings: the invoice is rejected before being sent. |
| SUNAT (Peru, being turned on) | Does not use the catalog: IGV withholding is set up with the list of your clients that are withholding agents in the SUNAT section. |
| Commercial invoice | Shows each withholding subtracted from the total. |

## Related

- [How to invoice in Mexico with Cord](/en/support/facturar-en-mexico)
- [How to invoice in Spain with Cord](/en/support/facturar-en-espana)
- [How to invoice in Colombia with Cord](/en/support/facturar-en-colombia)
