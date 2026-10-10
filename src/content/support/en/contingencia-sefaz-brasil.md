---
title: "SEFAZ contingency (Brazil)"
description: "What Cord does with your NF-e when your state SEFAZ does not respond: issuing at the contingency Virtual SEFAZ, how it looks, how it returns by itself and what happens with cancellations and correction letters."
category: "Invoicing by country"
order: 14
---

This applies to businesses in **Brazil** using the **NF-e** (sale of goods), which **is being turned on** in Cord: if you need to issue NF-e from Cord, write to us to enable it. See [How to invoice in Brazil with Cord](/en/support/facturar-en-brasil).

Each state has a **contingency Virtual SEFAZ (SVC)**, SVC-AN or SVC-RS, that authorizes NF-e when the normal SEFAZ is unavailable. Cord enters and leaves contingency on its own.

**In short:**

- **When it starts:** if your state SEFAZ **did not receive** the request (no connection, or it answered that it is out of service) and your state's SVC is operating.
- **What it does:** issues the NF-e at the SVC, as a contingency note, with the contingency date and justification.
- **How you see it:** **Settings › Invoicing › Tax profile › NF-e** shows the notice while it lasts, and each NF-e issued that way says "Issued in contingency".
- **When it ends:** by itself, as soon as the normal SEFAZ responds again. Cord checks it every 5 minutes when issuing.
- **What it does not do:** an NF-e sent to the normal SEFAZ that was left **without an answer** does not move to the SVC: Cord **queries** it, so the same sale is never authorized twice.

## How it works

1. You issue a product invoice as usual.
2. Cord sends the NF-e to your state's authorizing SEFAZ.
3. If there is no connection, or the SEFAZ says it is paralyzed, Cord asks your state's SVC whether it is operating.
4. If the SVC responds, Cord **opens contingency** for your business and issues the NF-e at the SVC.
5. The following NF-e go to the SVC while contingency lasts, and every 5 minutes Cord tries the normal SEFAZ again.
6. When the normal SEFAZ responds, Cord **closes contingency** and issues there again.

## How it looks

- **In Settings**, the **NF-e** section reads: "The SEFAZ of your state is unavailable: since … Cord authorizes your NF-e at the SVC (contingency). It returns to your state SEFAZ by itself when it is back."
- **On the invoice**, the **NF-e** panel reads "Issued in contingency at the SVC-AN" (or SVC-RS), with its number, access key and protocol like any other.
- **In the XML**, the NF-e carries the contingency issuance type, its date and its justification, as the SEFAZ requires.

An NF-e issued in contingency has the same validity: you do not need to issue it again.

## Cancel or correct a contingency NF-e

- **Cancel:** **More actions › Void**, within 24 hours of its authorization. The cancellation of a note issued at the SVC is sent to the SVC.
- **Correction letter (CC-e):** always goes to your state's normal SEFAZ. If it is still out of service, wait until it is back.

## Why a note without an answer does not move to the SVC

If Cord sent the NF-e to the normal SEFAZ and no readable answer came back, the SEFAZ may have authorized it. Issuing it again at the SVC could leave **two authorized notes for the same sale**. That is why Cord leaves it as "waiting for confirmation" and **queries** it by its access key: if the SEFAZ authorized it, that is the one; if it did not register it, that attempt is discarded and the invoice can be issued again without leaving unused numbers. Anything left unresolved is queried by an automatic job every hour.

## Common issues

- **The contingency notice does not go away.** The normal SEFAZ is still not responding; Cord tries it again on the next issuance, at least every 5 minutes.
- **An NF-e is "waiting for confirmation".** That is expected when the answer was lost: Cord queries it and resolves it on its own.
- **The CC-e is not sent.** The correction letter does not use the SVC; wait until your state SEFAZ is back.

## Related

- [How to invoice in Brazil with Cord](/en/support/facturar-en-brasil)
