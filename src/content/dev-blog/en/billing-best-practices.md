---
title: "SaaS Billing best practices in 2026"
date: "2026.06.15"
type: "BLOG"
topic: "Billing"
authors:
  - "ANDRÉ VALLE"
readTime: "10 MIN READ"
---
Building a SaaS product is hard. Building a billing system that handles upgrades, downgrades, prorations, failed payments, and global tax compliance is often harder. 

Whether you are launching your first application or scaling an enterprise SaaS, here are the core billing best practices you should adopt when architecting your system.

## 1. Decouple entitlements from your payment gateway

One of the most common mistakes early-stage startups make is relying entirely on their payment gateway for access control. They query the gateway on every page load to check if a user is "active."

This creates severe latency and tightly couples your application logic to a third party. Instead, use webhooks (e.g., `subscription.updated`) to synchronize state with an internal `entitlements` database table. Your application should only ever query your local database or Cord to determine what features a user can access, keeping your app fast and resilient.

## 2. Plan for hybrid pricing models from Day 1

The era of simple "flat rate per month" SaaS is ending. Modern software often requires a hybrid approach:
- A flat base fee for platform access
- A per-seat fee for team members
- A usage-based fee for raw compute, AI tokens, or storage

If you hardcode your data model to assume one user equals one monthly subscription, refactoring for hybrid pricing later will take months of engineering time. Use Cord's flexible `line_items` to easily attach diverse billing metrics to a single `invoice`.

## 3. Automate involuntary churn recovery

Up to 40% of SaaS churn is involuntary—caused by expired credit cards, declined transactions, or network issues. You shouldn't lose customers just because their bank flagged a transaction.

Implement a smart dunning process:
- **Pre-dunning:** Email customers 7 days before their credit card expires.
- **Smart Retries:** Use platform features to retry on optimal days of the week when success rates are highest.
- **Grace Periods:** Allow users 3-5 days to update their payment methods before cutting off access to your product.

By treating billing as a core engineering challenge, you can significantly improve your Net Revenue Retention (NRR) and provide a much better experience for your users.
