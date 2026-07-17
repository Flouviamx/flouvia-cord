---
title: "Cord 101: Getting Started"
description: "Set up your account, create your first client, and send your first quote in minutes."
category: "Account & Team"
order: 1
---

Welcome to Cord. This guide gets you operating —quoting, collecting, and invoicing— in under 20 minutes. If it's your first time, follow this linear path.

## Step 1: Set up your company
The core of Cord is your tax and brand profile.

1. Go to **Settings > General** and enter your legal name, contact, and basic details.
2. In **Settings > Billing & CFDI**, enter your RFC and tax regime, and upload your **CSD (Digital Seal Certificate)**: the `.cer` and `.key` files the SAT gives you, with their password. *Without the CSD you can quote, but not stamp CFDI.*

## Step 2: (Optional) Connect your Stripe
To collect online card payments, Cord uses **your own Stripe account** (we charge no per-transaction fee). Connect it in Settings to enable the public link's pay button. If your clients pay by bank transfer (SPEI), you don't need this step: they transfer to your business's CLABE and you mark the quote as paid.

## Step 3: Create your first client
1. Go to **Clients > New client**.
2. Enter their legal name and RFC.
3. Assign credit terms (e.g. Net-30) and, if applicable, their credit limit so Cord monitors their exposure.
4. For named CFDI, add their tax regime, zip code, and CFDI use in the tax details section.

## Step 4: Send your first quote
1. Go to **Quotes > New**.
2. Pick the client, add line items (from your catalog or free lines), and review the total.
3. When you send it, Cord generates a **public link** and, if email is configured, sends it to the client. They open it, review, approve and —if you connected Stripe— pay online.

## Step 5: (For devs) Connect the API
If you'll use Cord programmatically:

- Go to **Settings > Developers > API** and create a key (`sk_test_...` or `sk_live_...`).
- Verify it works with the simplest call:

```bash
curl https://cordhq.app/api/v1/me -H "Authorization: Bearer sk_test_your_key"
```

## What's next?
- [Configure Webhooks](/en/support/configurar-webhooks)
- [Invite your team](/en/support/invitar-miembros-roles)
- [Dispute management](/en/support/manejo-disputas)
