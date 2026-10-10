---
title: "How to invoice in Chile with Cord"
description: "Commercial invoice today with VAT rounded per document; SII electronic tax documents being turned on: certification, folios (CAF), taxable and exempt invoices, credit and debit notes, exchange and what is not covered."
category: "Invoicing by country"
order: 11
---

In Chile the tax-valid invoice is an **electronic tax document (DTE)** sent to the **SII**. Cord has the direct rail with the SII built (it takes the folio, stamps, signs, sends and checks the verdict, without an intermediary provider), but **it is being turned on**: today your invoices are issued as a **commercial invoice without tax validity**. If you need to issue DTEs from Cord, write to us to enable it on your account.

**In short:**

- **Today:** commercial invoice and commercial credit note, on every plan (10 per month on Free, unlimited from Starter). They are not sent to the SII.
- **VAT per document, already today:** in Chile Cord calculates VAT once on the total net amount (net × 19%, rounded), as the SII format requires, rather than adding up each line's rounded VAT.
- **Being turned on:** electronic invoice (33), exempt invoice (34), debit note (56) and credit note (61). Under **Settings › Invoicing › Tax profile › Electronic invoicing with the SII** it reads **Coming soon**.
- **What you will need:** Starter or above, your RUT, a **digital certificate** of a person authorized with the SII, passing the **certification** as an electronic issuer with market software, the SII **resolution** and the **folios (CAF)** for each document type.
- **Void:** an accepted DTE is not voided: it is corrected with a **credit note** and, to charge more or reverse a credit note, with a **debit note**.
- **Collect:** in Chile online payment is through **Mercado Pago**; Cord Payments is not available.

## Which document Cord issues

| Situation | Document |
|---|---|
| Today, any plan | Commercial invoice (no tax validity). |
| With the SII active, taxable items | Electronic invoice (33) with electronic stamp and assignable copy. |
| With the SII active, all items exempt | Non-taxable or exempt invoice (34). |
| With the SII active, on Free or choosing **Commercial invoice** | Pro forma with the `PRO` series: it is used to collect, but it is not a tax document. |
| Amount correction or cancellation | Credit note (61). |
| Additional charge or cancellation of a credit note | Debit note (56). |

## What you will need

- A **digital certificate** of the person who signs with the SII (your business's authorized user), issued by an accredited entity and registered with the SII. Its cost is set by the entity that issues it.
- **Application and certification** as an electronic issuer with market software on the SII site: test set, simulation, information exchange, printed samples and declaration of compliance. Cord walks you through each stage. See [Debit note and SII certification](/en/support/nota-de-debito-sii-chile).
- The **SII resolution** (number and date) that authorizes you as an electronic issuer. In certification the number is 0.
- **Folios (CAF)** for each document type, which you download from the SII. Invoice, credit note and debit note folios expire six months after authorization.
- Your business details: **line of business (giro)**, **economic activities** (up to 4), **comuna** and the **SII office** that applies to you.

## Set up your account (once it is turned on)

1. Under **Invoice identity**, enter your legal name and your **RUT**.
2. Under **Electronic invoicing with the SII › Issuer details**: **Line of business (giro), as registered with the SII**, **Economic activity codes (up to 4)**, **SII office (regional directorate)**, the address if it differs, **Comuna**, **City**, **Branch name** and its code if it applies, and the **SII resolution number** and **Resolution date**. Click **Save SII details**.
3. Under **Folios (CAF)**, upload the **Folio file** exactly as you downloaded it from the SII, unmodified, with **Upload folios**. Cord checks that it belongs to your RUT, is of a type it issues and that the key matches.
4. Under **Digital certificate**, upload your `.pfx`/`.p12` with its password and the **RUT of the certificate holder** if Cord cannot read it, and click **Upload certificate**.
5. On each Chilean client's profile, complete **Customer's line of business (giro)** and **Comuna**: the SII requires the client's RUT, legal name, line of business, address and comuna on every invoice.

## How you see the status

The invoice detail has an **SII** panel:

- **Being validated by the SII:** the SII validates each submission after receiving it. Cord waits a few seconds and, if the verdict does not arrive, checks it on its own until the invoice is complete.
- **Accepted by the SII**, with the folio and the submission number. If the SII accepted it with remarks, the observation is recorded.
- **The SII rejected the document**, with the reason.
- **Waiting for the SII to confirm:** if the submission response was lost, Cord queries the document; it never sends another one with the same folio.

From the panel you download the **DTE XML** and the **Assignable copy (cedible)** (invoices 33 and 34), with the Law 19.983 acknowledgement of receipt. The PDF carries the box with your RUT, type and folio, and the electronic stamp. **Settings** warns you when few folios are left or a CAF is about to expire.

## Void or correct

- **Void:** an accepted DTE is not voided.
- **Credit note (61):** **More actions › Credit note**. It cancels the total or corrects amounts, referencing the accepted invoice.
- **Debit note (56):** from the **SII** panel of an accepted document, **Issue a debit note** to charge an additional amount (interest, price difference) or, on a credit note, **Cancel with a debit note**. See [Debit note and SII certification](/en/support/nota-de-debito-sii-chile).
- **A used folio never comes back:** a rejection frees the document, not the folio.

## Documents your suppliers send you

Under **Documents received from suppliers (exchange)** you upload the XML a supplier sent you with **Receive and acknowledge**. Cord validates the submission and the signature, sends the acknowledgement and lets you accept, accept with discrepancies or claim each document, and record that decision with the SII within 8 calendar days.

## Common issues

- **"Missing: invoice folios (CAF)".** Download the type 33 folio file from the SII (and 34, 56 or 61 if you issue them) and upload it.
- **"Request more from the SII".** Few folios are left: request another range before they run out.
- **The SII rejects because of the certificate.** Check that it is registered with the SII for the authorized person and valid.
- **The client has no RUT or is foreign.** They would need a receipt (boleta) or an export invoice, which Cord does not issue yet; this is said before taking a folio.
- **VAT does not match the sum of the lines.** That is correct in Chile: VAT is 19% of the total net amount, rounded once.

## Not covered yet

- **Electronic receipt** (39 and 41), **export invoice** (110 to 112), **dispatch guide** (52) and **fee receipt** (boleta de honorarios).
- **Withholdings** on the DTE: the fee withholding belongs to the fee receipt.
- **Another currency:** the DTE is in whole Chilean pesos.
- **Purchase and sales ledgers** outside the certification set: since 2017 the Purchase and Sales Register replaces them.

## Related

- [Debit note and SII certification](/en/support/nota-de-debito-sii-chile)
- [Collect with Mercado Pago](/en/support/cobrar-mercado-pago)
- [Invoicing by country in the documentation](https://docs.cordhq.app/en/docs/pagos/facturacion)
