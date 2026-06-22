---
title: "Cord 101: Getting Started"
description: "Accelerate your integration. Set up your corporate account, issue invoices, and receive payments in 5 easy steps."
category: "Account"
order: 1
---

Welcome to Cord. We have designed this guide so you can have your account operating, invoicing, and collecting payments in less than 20 minutes.

If this is your first time using the platform, we recommend following this linear path.

## Step 1: Company Setup
The core of Cord is your tax and operational profile. Before issuing a payment or an invoice, you need to validate your corporate identity.

1. Navigate to **Settings > Company**.
2. Enter your Legal Name, Tax ID (RFC), and Tax Regime.
3. Upload your **CSD (Digital Seal Certificate)**. This is the `.cer` and `.key` file provided by the SAT (Mexican Tax Authority), along with your password. *Without this step, you will not be able to issue invoices or payment supplements (REP).*

## Step 2: Connect your API (For Developers)
If you are going to use Cord programmatically (via our API or SDKs), the next step is to obtain your credentials.

- Go to **Developers > API Keys**.
- You will see two environments: `Test Mode (Sandbox)` and `Live Mode (Production)`.
- Copy your test `Secret Key`. Inject it into your local development environment.
- Consult our technical documentation to make your first `/ping` test call.

## Step 3: Configure Payment Methods
Cord allows you to collect payments via Credit Card, Bank Transfer (SPEI), and International Currencies.

1. Go to **Collection > Payment Methods**.
2. Activate the gateways you wish to use.
3. *Important note:* International collections (Wire) require additional KYC (Know Your Customer) validation which can take up to 48 hours to activate.

## Step 4: Create your first Customer
To issue a quote or invoice, you need a counterpart.

1. Go to **Customers > New Customer**.
2. Enter their Legal Name and Tax ID (RFC).
3. Assign credit terms (e.g., Net-30). If the customer has an approved credit limit, add it in this step so Cord automatically monitors their credit exposure.

## Step 5: Issue your first collection
You are ready. Now you can create an **Interactive Quote** or simply send a public **Payment Link**.

- **For Quick Links:** Go to *Collection > Payment Links* and generate a universal link.
- **For B2B Flows:** Create a quote, add the items, and upon sending it, Cord will automatically generate a payment flow. When the customer pays, Cord will automatically stamp the PUE invoice.

## What's next?
- [Configure Webhooks](/en/support/configurar-webhooks)
- [Invite your team](/en/support/invitar-miembros-roles)
- [Understand dispute management](/en/support/manejo-disputas)
