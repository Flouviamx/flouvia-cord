---
title: "Managing multiple workspaces"
description: "Switch between different organizations — even in different countries — from a single account."
category: "Account & Team"
---

Many businesses operate through different legal entities, depending on the business line, brand, or country. With the same Cord account (same email and password) you can belong to several organizations and switch between them without signing in again.

### Create an additional workspace

1. Open the workspace switcher at the top of the sidebar (the square with your organization's initial or logo, next to its name) and select **Create workspace**. On a phone, first open the menu with the three-line button in the top bar.
2. Choose whether the new account is **independent** (a separate entity, no hierarchical relationship) or **nested** under your current organization (for example, a subsidiary).
3. Choose the country where that entity operates — it doesn't have to be the same country as your original account. The tax profile, currency, time zone, and starter tax rates are seeded based on that country.

This feature requires the **Professional plan or higher**; it's not available on Free or Starter.

### Isolation between organizations

Each organization is an isolated data vault: it has its own customers, quotes, API keys (`sk_live_...`), tax configuration, and — if the country requires it, like Mexico's SAT-issued certificate (CSD) — its own signing certificate. Payments for each organization go through its own connected Cord Payments account; Cord doesn't mix or hold funds across organizations.

### Switch workspaces

Open the same switcher at the top of the sidebar and pick the organization. The switch is immediate and doesn't ask you to sign in again: Cord keeps you on the same section of the other workspace, or takes you to **Home** if you were inside a specific record (a quote, a client), because that record belongs to the previous organization.

Your **pinned** pages and the sidebar groups you collapsed are saved per person and per workspace: each organization keeps its own. More in [Getting around Cord](/en/support/moverse-por-cord).
