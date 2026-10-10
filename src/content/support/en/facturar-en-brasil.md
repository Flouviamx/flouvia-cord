---
title: "How to invoice in Brazil with Cord"
description: "Commercial invoice today; NFS-e for services and NF-e for goods being turned on: ICP-Brasil certificate, municipality and SEFAZ, setup, cancellation, correction letter and what is not covered."
category: "Invoicing by country"
order: 4
---

In Brazil the tax-valid invoice is the **NFS-e** for services (issued by the national NFS-e system) and the **NF-e model 55** for the sale of goods (authorized by your state SEFAZ). Cord has both rails built, connecting directly with the authority and without an intermediary, but **they are being turned on**: today your invoices are issued as a **commercial invoice without tax validity**. If you need to issue NFS-e or NF-e from Cord, write to us to enable it on your account.

**In short:**

- **Today:** commercial invoice and commercial credit note, on every plan (10 per month on Free, unlimited from Starter). They are not submitted to any authority.
- **Being turned on:** NFS-e (services) and NF-e (goods). Under **Settings › Invoicing › Tax profile**, the **NFS-e** and **NF-e** sections read **Coming soon** while they are not active.
- **What you will need:** Starter or above, your CNPJ, an **ICP-Brasil A1** digital certificate (e-CNPJ), a municipality that has joined the national NFS-e issuer and, for the NF-e, being enabled as an issuer with your state SEFAZ with your Inscrição Estadual.
- **An invoice cannot mix products and services:** they are two different documents (municipal NFS-e and state NF-e). Split it in two.
- **Void:** the NFS-e is cancelled within the deadline your municipality sets; the NF-e within 24 hours of its authorization. Neither has a credit note in Cord.
- **Collect:** card through Cord Payments in BRL and, as an alternative, Mercado Pago.

## Which document Cord issues

| Situation | Document |
|---|---|
| Today, any plan | Commercial invoice (no tax validity). |
| With the NFS-e active (Starter or above) | National-standard NFS-e, one service per note. |
| With the NF-e active (Starter or above) | NF-e model 55 with its DANFE. |
| With the NFS-e or the NF-e active, on Free or choosing **Commercial invoice** | Pro forma with the `PRO` series: it is used to collect, but it is not a tax note. |
| Invoice mixing products and services | Not issued: it must be split. |

Cord decides which note applies from the items: if all are products with their NF-e data it goes to the NF-e; if none are, to the NFS-e.

## What you will need

- **ICP-Brasil A1 digital certificate** issued to your CNPJ (e-CNPJ), as a `.pfx`/`.p12` file or as a certificate plus private key. It is issued by an ICP-Brasil certificate authority and its cost is set by that authority. A head office e-CNPJ also signs for its branches (same root CNPJ), and the same certificate works for the NFS-e and the NF-e.
- **For the NFS-e:** your municipality must have joined the national public issuer with an active agreement, your Simples Nacional status and your service code in the national list (LC 116/2003). If your municipality requires it, your municipal registration.
- **For the NF-e:** being enabled (credenciado) as an NF-e issuer with your state SEFAZ and your Inscrição Estadual. The states of AM, MS, PE, PR, SC and TO also require a technical officer for the system that Cord does not have yet: in those states the NF-e is not available for now, and Settings says so.

## Set up your account (once it is turned on)

1. Under **Settings › Invoicing › Tax profile › Invoice identity**, enter your legal name and your **CNPJ / CPF**.
2. In the **NFS-e** section: **Municipality of your establishment (IBGE code)**, **Municipal registration** if it applies, **Simples Nacional status** (and, if you are ME/EPP, the **Simples Nacional assessment** and the **Approximate Simples Nacional taxes (%)**), **Service (national list, LC 116/2003)**, a **DPS series** exclusive to Cord and, if you continue a numbering, the **First DPS number**. Click **Save NFS-e settings**.
3. Under **ICP-Brasil digital certificate (A1)**, upload your file and its password with **Upload certificate**. Cord tests the connection with the national NFS-e system without issuing anything.
4. In the **NF-e** section (if you sell goods): **Tax regime (CRT)**, **State registration (Inscrição Estadual)**, the establishment address with its **Municipality (IBGE code)**, an **NF-e series** exclusive to Cord, the **Nature of the operation**, **How you sell**, **Freight** and the default PIS/COFINS. Click **Save NF-e settings**. If the NFS-e certificate belongs to the same CNPJ, the NF-e uses it; if not, upload one in this section.
5. On each **product**: NCM, CEST if it applies, CFOP, origin, unit, GTIN and the ICMS of your regime, IPI and IBS/CBS.
6. On each **client** of a sale of goods: number, district, municipality (IBGE code), state registration indicator (taxpayer, exempt or non-taxpayer), their IE and whether they buy as a final consumer.

## Taxes in Cord

Brazil starts **without a national rate seeded** under **Settings › Quotes › Taxes**, only with the **Isento** option: state ICMS, municipal ISS and PIS/COFINS do not fit in a single rate. On the NFS-e, ISS is **included in the price** and the municipality sets the rate. On the NF-e, ICMS, PIS, COFINS, IBS and CBS are inside the price and the only tax added on top is **IPI**: the line rate in Cord must be exactly the product's IPI rate.

## How you see the status

The invoice detail has an **NFS-e** or **NF-e** panel with the status with the authority:

- **NFS-e issued** or NF-e authorized, with the number, access key and protocol.
- **Waiting for confirmation**: Cord **queries** the authority, it never resends the same note. Anything left without an answer is resolved by an automatic query every hour.
- **Did not issue the NFS-e** or rejected by the SEFAZ: with the translated reason. A rejection does not use up an NF-e number: it is reused and leaves no gaps.
- **The SEFAZ denied the use of the NF-e**: the number is used up.

The NF-e PDF is the **DANFE** with the access key as a barcode, and its authorized XML (**NF-e XML (nfeProc)**) can be downloaded from the invoice's **NF-e** panel and from your client's link. The NFS-e PDF is Cord's document with the full access key and the QR code of the public NFS-e lookup. In the test environment, the document says it has no legal validity.

## Void or correct

- **Cancel an NFS-e:** **More actions › Void**. Cord sends the cancellation event; if the deadline or amount your municipality allows has passed, the cancellation is rejected with the reason and the note stays valid.
- **Cancel an NF-e:** **More actions › Void**, within **24 hours** of the authorization. After that the SEFAZ rejects it and the note stays valid.
- **Correction letter (CC-e):** from the **NF-e** panel of the detail, **Issue a correction letter (CC-e)**, up to 20 per note. Each letter replaces the previous one and must repeat everything that still needs correcting. It cannot change amounts, quantities, rates, bases, issuer, recipient or dates.
- **No credit note:** the NFS-e has none, and a return of goods is another NF-e that Cord does not issue yet. To correct an NFS-e, void it and issue another.
- **Unused numbers (inutilização):** in the **NF-e** section of Settings, **Unused numbers (inutilização)** lists the numbers left without a note; you declare the range with a reason and **Declare to the SEFAZ**.

## If your state SEFAZ does not respond

Cord issues in contingency at your state's Virtual SEFAZ (SVC) and returns to the normal SEFAZ by itself when it is back. See [SEFAZ contingency](/en/support/contingencia-sefaz-brasil).

## Common issues

- **"Split the invoice in two".** It mixes products and services. Issue one invoice with the products (NF-e) and another with the services (NFS-e).
- **The municipality has not joined or has no active agreement.** The national NFS-e system reports it and Cord translates it. Confirm it with your city hall.
- **Certificate rejection.** Check that it is A1, valid, for your CNPJ (or the head office root CNPJ) and for the right environment.
- **My state requires something Cord does not have yet.** In AM, MS, PE, PR, SC and TO the technical officer is missing; the NF-e is not available there for now.
- **The ISS the municipality applied is not the one in my withholding profile.** The NFS-e is issued and the invoice shows the difference in the net amount.

## Not covered yet

- **NFS-e:** exports and foreign currency, services taxed where they are provided, construction works and events, base deductions, municipal benefits, federal withholdings (IRRF, CSLL, PIS/COFINS, INSS) and the IBS/CBS group.
- **NF-e:** tax substitution, DIFAL to a non-taxpayer in another state, exports, fuels, withholdings, Normal Regime sales to another state, returns (finNFe 4) and Simples Nacional from 4 January 2027.
- **Withholdings:** on the NFS-e only ISS withheld by the client.

## Related

- [SEFAZ contingency](/en/support/contingencia-sefaz-brasil)
- [Collect with Mercado Pago](/en/support/cobrar-mercado-pago)
- [Invoicing by country in the documentation](https://docs.cordhq.app/en/docs/pagos/facturacion)
