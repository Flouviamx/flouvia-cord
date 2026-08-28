---
title: "Non-Disclosure Agreements (NDA)"
description: "How Cord protects the confidential information in your most sensitive deals."
category: "Security & Privacy"
order: 4
---

For Enterprise accounts or sensitive corporate transactions, confidentiality in Cord works at two levels: the contract you already have with us, and the evidence generated when your customer approves a quote.

### Contractual confidentiality

Section 9 (Confidentiality) of your [Terms and Conditions](/terminos) is, in effect, a mutual non-disclosure agreement between your business and Flouvia: both parties commit to protecting the other's technical, financial, or business information with the same care they use for their own, and the obligation survives the termination of your subscription. You don't need to request or sign a separate document for this — it's already part of your existing contract.

### Signature evidence on every approval

When your customer approves a quote from its public link, Cord doesn't just log a click: it stores their name, email, IP address, and an immutable SHA-256 hash of the exact content they approved. If you edit the quote after the customer already opened it, the system detects the mismatch between what the customer saw and the current version — the signature stays tied to the exact version they approved, never to one you changed afterward.

This evidence supports that an identified person, on a specific date, approved exactly those terms — the backing you need if a dispute over what was agreed comes up later.

**Legal validity:** electronic signature standards vary by country. The evidence Cord generates (declared identity, IP, date, and document hash) is designed to support a simple electronic signature under frameworks such as NOM-151 in Mexico, eIDAS in the European Union/United Kingdom, the ESIGN Act/UETA in the United States, and the equivalent framework in the rest of the countries where Cord operates — but it does not replace your own legal counsel's advice on what signature level your transaction requires.

Cord does not yet offer a flow that hides a quote's prices until the customer signs a separate NDA before viewing it. If your business needs that additional control, write to us so we can evaluate it.
