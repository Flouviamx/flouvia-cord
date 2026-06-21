---
title: "Ultimate Guide: CFDI 4.0 for wholesalers and distributors"
excerpt: "Everything you need to know about payment supplements (REP), carta porte, and fiscal validation in Mexico for 2026."
category: "Fiscal"
date: "12 Jun 2026"
readTime: "09 MIN"
img: "/images/blog/guia-cfdi-4-0-2026.png"
authorName: "Diego Fernández"
authorRole: "Tax Tech Lead"
---

Invoicing in Mexico has become a software engineering job. With the consolidation of CFDI 4.0, the Tax Administration Service (SAT) has closed evasion loopholes by demanding strict validations and exhaustive catalogs.

For B2B companies (wholesalers, distributors, agencies, and software companies), the slightest error in a zip code or tax regime can delay a million-dollar payment for weeks.

In this guide, we will break down the three operational pillars of CFDI 4.0 that you must master to ensure smooth collection in your B2B business.

## 1. Data Validation (The Entry Barrier)

With version 3.3, having the client's RFC was enough. In CFDI 4.0, the SAT mathematically compares your XML against its database. If a single character doesn't match, the stamp is rejected.

The critical fields that must match exactly with the Proof of Tax Situation (CSF) are:
- **Name or Corporate Name:** It must be in capital letters and *without* the corporate regime. That is, "EMPRESA DE MÉXICO" and not "EMPRESA DE MÉXICO, S.A. DE C.V.".
- **Fiscal Domicile Zip Code:** The client's, not the branch you deliver to, but the one the SAT has registered as the headquarters or main domicile.
- **Receiver's Tax Regime.**

> "40% of rejected B2B invoices in 2025 were due to typographical errors in the Name field or the inclusion of S.A. de C.V."

**The Solution:** Automate validation. Platforms like **Cord** automatically scan the client's Proof of Tax Situation in PDF upon registration, extracting the information and auto-completing the CRM to avoid human errors.

## 2. PPD vs PUE and Payment Supplements

In B2B sales, it's rare for a corporate client to pay you in full upfront or the same day you issue the invoice. This is where the SAT's sacred rule comes in:

### PUE (Payment in a Single Installment)
It should only be used if the client **has already paid you** or if they guarantee they will pay *before* the calendar month in which you issued the invoice ends. If you mark PUE and the client doesn't pay you that month, you are committing a fiscal fault and must cancel the invoice.

### PPD (Payment in Installments or Deferred)
If you give credit (Net 30, Net 60), you must **always** issue the invoice as PPD with Payment Method "99" (To be defined).

When the client finally deposits the following month, you have the legal obligation to issue a **Payment Receipt Supplement (REP or CRP)**. In CFDI 4.0, this payment receipt is as complex as an invoice itself, requiring tax breakdowns (VAT, withholdings) for each payment received.

If you don't issue the payment supplement before the 5th of the month following the deposit, your client won't be able to deduct the expense, and you could be subject to fines.

## 3. Carta Porte Supplement (Distributors)

If you move merchandise on federal highways, the Carta Porte Supplement is no longer optional.

For wholesalers, this implies that the billing team now needs to know logistics details they previously ignored: truck model, license plates, driver's name and RFC, exact weight of the merchandise, and origin/destination node according to SCT catalogs.

**Strategy:** Communication between warehouse/logistics and finance must be real-time. Use modern ERPs that generate the Carta Porte XML at the loading dock by scanning the outbound order, not from the accounting office.

## In Summary

CFDI 4.0 is relentless. You can no longer rely on "the accountant fixing it at the end of the month". Invoicing must be deeply integrated into your sales and operations flow. By using modern infrastructure like **Cord**, you validate from the quote to the automatic stamping of the payment supplement when the money hits your bank account.
