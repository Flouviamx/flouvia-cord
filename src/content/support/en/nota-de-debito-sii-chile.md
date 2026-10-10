---
title: "Debit note and SII certification (Chile)"
description: "How to issue a debit note (DTE 56) on an invoice or to cancel a credit note, and how to complete the SII certification with Cord: test set, ledgers, simulation, exchange and printed samples."
category: "Invoicing by country"
order: 13
---

This applies to businesses in **Chile** using the SII electronic invoice, which **is being turned on** in Cord: if you need to issue DTEs or get certified with Cord, write to us to enable it. See [How to invoice in Chile with Cord](/en/support/facturar-en-chile).

**In short:**

- **Debit note (56):** on an accepted **invoice**, it charges an additional amount (interest, price difference, a fee) and corrects amounts; on an accepted **credit note**, it cancels it in full, once.
- **Where:** in the **SII** panel of an accepted document's detail: **Issue a debit note** or, on a credit note, **Cancel with a debit note**. It is created as a draft and you issue it like any invoice.
- **Folios:** it needs debit note folios (CAF type 56), which expire after six months, like invoice folios.
- **Certification:** under **Settings › Invoicing › Tax details**, the **SII certification** section builds and sends the test set, the sales and purchase ledgers, the exchange and the printed samples. It only exists in the certification environment.
- **What Cord does not build from the set:** dispatch guide (52) and its ledger, export documents (110 to 112) and an issued purchase invoice (46).

## Issue a debit note

1. Open the invoice (or credit note) accepted by the SII.
2. In the **SII** panel, expand **Issue a debit note** (or **Cancel with a debit note** if it is a credit note).
3. On an invoice: enter the **Concept** and the **Net amount (CLP)** of each charge and tick **Exempt from VAT** if it applies. On a credit note, the debit note copies its items and total.
4. Enter the **Reason**: it is printed as the reference reason.
5. Click **Create draft**. Cord takes you to the draft; review it and click **Issue debit note**.

How it is declared to the SII:

- **On an invoice**, the debit note references the invoice and "corrects amounts".
- **On a credit note**, it "cancels" it completely; a credit note can only be cancelled once.

The debit note is **a receivable of its own**: it has its own balance and link, does not change the original invoice's balance, carries no payment terms or assignable copy and is numbered with its `ND-` series. Outside Chile, Cord replies that the document does not support a debit note.

## SII certification

To issue DTEs with market software, the SII requires a certification. Cord supports it from **Settings › Invoicing › Tax details › Electronic invoicing with the SII › SII certification**, while your account is in the **certification environment**. Beforehand you need your digital certificate registered with the SII, your application as an electronic issuer and the certification folios uploaded.

### 1. Test set

1. Paste the text of the file the SII assigned you into **Test set (text of the file the SII gave you)** or click **Open file**. Copy the text exactly: an unreadable character (a lost accent) is rejected, because the description must be exact.
2. Click **Load test set**. Cord reads each case and by default picks clients with different RUTs for the invoices; you can change them.
3. Click **Sign and send to the SII**. Cord validates the whole set **before** taking folios, takes one certification folio per case, signs all the cases and sends them **in a single submission** to the SII.
4. Click **Check the SII verdict**. The verdict comes per document type: accepted, with objections or rejected. With objections or rejections, **New attempt (new folios)** sends again with new folios (a used folio never comes back).

Test set documents do not enter your receivables or your numbering.

### 2. Sales and purchase ledgers

Once the SII accepts the set, Cord builds the ledgers your set asks for:

- **Sales ledger:** with the documents of the last accepted set.
- **Purchase ledger:** with the documents included in the purchase ledger set. Add each one's supplier with their RUT (and the legal name for paper documents). An observation Cord cannot record is rejected on loading.

Each ledger is sent with **Sign and send to the SII** and its status is checked with **Check the SII status**. A sent ledger is not resent: **New attempt** creates a new one that keeps the suppliers. The signed XML is downloaded with **Signed ledger (XML)**. Outside certification, the SII's Purchase and Sales Register replaces the ledgers.

### 3. Simulation

Issue documents representative of your business from **Invoices** while your account is in certification.

### 4. Exchange

The SII sends you documents as if it were a supplier. Under **Documents received from suppliers (exchange)** upload the received XML and click **Receive and acknowledge**. Cord sends the acknowledgement and, for each document, you choose **Accept**, **Accept with discrepancies** or **Reject (claim)** with its reason, and click **Sign and send the answer**. In certification, the answers go to the SII exchange mailbox.

### 5. Printed samples

Download from Settings the **Printed sample** and the **Assignable copy** of each test-set case and upload them on the SII site.

### 6. Declaration of compliance

Your legal representative signs it on the SII site.

## What the set may ask for and Cord does not build

If you chose these documents when applying, Cord tells you when loading the set, with its attention number:

- **Dispatch guide (52)** and its **dispatch ledger**.
- **Export documents** (110, 111 and 112).
- **Purchase invoice (46)** as an issued document (it does appear as a line of the purchase ledger, which only records it).

## Common issues

- **"This document does not support a debit note".** The account is not in Chile or the document is not an invoice, debit note or credit note accepted by the SII.
- **There are no debit note folios.** Download a type 56 CAF from the SII and upload it under **Folios (CAF)**.
- **The set is rejected on loading.** Check that the text is complete and has no altered characters.
- **I do not see the certification section.** It only appears while your account is in the SII certification environment.

## Related

- [How to invoice in Chile with Cord](/en/support/facturar-en-chile)
- [Issue a credit note](/en/support/nota-de-credito)
