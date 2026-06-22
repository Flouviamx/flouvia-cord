---
title: "Managing multiple companies"
description: "Switch between different legal entities from a single account."
category: "Account & Team"
---

Many corporations operate through different legal entities (RFCs) depending on the business line or geographic state. Cord supports Multi-Tenant architecture natively.

### Multi-Organization Management

With a single email and password (Single Sign-On for your base account), you can be an administrator of multiple companies in Cord.

1. On your top left panel, click on your current company's name.
2. Select **Add new Organization**.
3. A clean fiscal configuration flow will deploy.

**Isolation Levels:**
Each organization is a 100% isolated data vault. They have their own customers, their own quotes, their own API keys (`sk_live_...`), and most importantly: **their own independent billing from facturapi** and their own CLABE account for bank disbursement.

To switch contexts, simply use the top dropdown menu. The change is instantaneous and does not require reloading the page.
