---
title: "Cord 101: Getting Started"
description: "Set up your account, create your first client, and send your first quote in minutes."
category: "Account & Team"
order: 1
---

Welcome to Cord. This guide gets you operating —quoting, collecting, and invoicing— in under 20 minutes. If it's your first time, follow this linear path.

## Step 1: Set up your company
**Shortcut:** when you finish signing up, Cord offers to set up your account with AI. Give it your website, what your business does and your price list, and it proposes profile, branding, taxes, catalog and templates for you to review and approve. If you skipped it, it's in **Settings > General > Set up with AI**. See [Set up your account with AI](/en/support/configurar-con-ia).

The core of Cord is your tax and brand profile. What you are asked for depends on your account's country: Cord operates end to end in Mexico, the United States, Canada, Brazil, Spain, the United Kingdom, Germany, France, Colombia, Argentina, Chile and Peru, and the tax vocabulary changes with each one.

1. Go to **Settings > General** and enter your legal name, contact and basic details (currency, language and time zone are detected from your country, and you can adjust them there).
2. Go to **Settings > Invoicing > Tax details** (**Tax profile** outside Mexico) and enter your tax ID: RFC in Mexico, NIF/CIF in Spain, EIN/Tax ID in the United States, and the equivalent in each of the other countries.
   - **If your account is in Mexico:** also upload your **CSD (Digital Seal Certificate)**: the `.cer` and `.key` files the SAT gives you, with their password. Without the CSD you can quote, but not stamp CFDI.
   - **If your account is in Spain:** you can already upload your electronic certificate (`.p12`/`.pfx`) in the **Verifactu** section. Registering invoices with the AEAT is being turned on: meanwhile Cord issues pro formas, and the section says so ("Certificate saved, registration not active yet"). See [How to invoice in Spain](/en/support/facturar-en-espana).
   - **In the other countries**, your tax ID and company details are enough to issue the commercial invoice. In Argentina, Brazil, Chile, Colombia, Peru and France, registration with the authority (ARCA, NFS-e and NF-e, SII, DIAN, SUNAT and the approved platform) is being turned on; write to us if you need it. Your country's guide is under [Invoicing by country](/en/support/category/facturacion-por-pais).

## Step 2: (Optional) Activate Cord Payments
To collect by card (and, in Mexico, automatic SPEI transfer) from the link, activate **Cord Payments** under **Settings > Payments**. There you will see the fee per method, register your payout account in your country's format (CLABE, IBAN, routing + account number, sort code and others) and complete verification. In Colombia, Argentina, Chile and Peru online payment is through **Mercado Pago**, which you connect on the same screen. If you prefer manual transfers, you can still record the payment by hand.

## Step 3: Create your first client
1. Go to **Clients > New client**.
2. Enter their legal name and tax ID (the same vocabulary as in Step 1, depending on the client's country).
3. Assign credit terms (e.g. Net-30) and, if applicable, their credit limit so Cord monitors their exposure.
4. If your account is in Mexico and you will invoice them by name, also add their tax regime, zip code and CFDI use in their tax details section; this data is specific to the Mexican CFDI.

## Step 4: Send your first quote
1. Go to **Quotes > New**.
2. Pick the client, add line items (from your catalog or free lines), and review the total.
3. When you send it, Cord generates a **public link** and, if email is configured, sends it to the client. They open it, review, approve and, if Cord Payments is active, pay online.

## Step 5: (For devs) Connect the API
If you'll use Cord programmatically:

- Go to **Settings > Developers > API** and create a key (`sk_test_...` or `sk_live_...`).
- Verify it works with the simplest call:

```bash
curl https://cordhq.app/api/v1/me -H "Authorization: Bearer sk_test_your_key"
```

- Or use the [Cord CLI](/en/support/cli-cord): `npx @flouviahq/cli login` connects your terminal from the browser and `npx @flouviahq/cli init` integrates your project.

## Step 6: Automate and connect your apps
- In **Workflows** create your first workflow from one of the ideas: for example, alert the team when a client approves. It is one of the steps in the **Set up Cord** checklist.
- In **Settings › Integrations** connect the tools you already use. Slack, Zapier and Make connect with one click, without copying keys or URLs; your connected apps show up in the top bar.

## What's next?
- [Configure Webhooks](/en/support/configurar-webhooks)
- [Invite your team](/en/support/invitar-miembros-roles)
- [Dispute management](/en/support/manejo-disputas)
