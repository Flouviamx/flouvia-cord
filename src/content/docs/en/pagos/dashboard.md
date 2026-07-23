---
title: "Payments Dashboard"
description: "Monitor your revenue, know your available balance, and check the dates of your upcoming payouts."
---

<header class="content-header">
  <h1 class="page-title">Payments Dashboard</h1>
  <p class="page-subtitle">Monitor your revenue, know your available balance, and check the dates of your upcoming payouts.</p>
</header>

## Overview

Once you have activated online payments through the payment settings and start receiving revenue, the main **Payments** page (located in the app's sidebar) will transform into a comprehensive financial dashboard.

This dashboard gives you full visibility into your cash flow in real-time, connecting directly with your Stripe Connect data.

### Metrics and KPIs

At the top, you will find three fundamental Key Performance Indicators (KPIs):

1. **TOTAL REVENUE (TOTAL COBRADO):** The sum of all payments you have received throughout the history of your account via Cord. This is a global indicator of completed sales.
2. **AVAILABLE BALANCE (SALDO DISPONIBLE):** The money that has been released by Stripe and is ready to be deposited into your bank account (or is already in the payout process).
3. **IN TRANSIT / PENDING (EN CAMINO):** The money from very recent payments (e.g., card payments made today) that Stripe is still settling. This balance will automatically become available, usually within a 2 to 7 day timeframe depending on your account settings.

## History and Payouts

Below the KPIs, the dashboard is divided into two main sections:

### Payouts (Depósitos)
Shows a list of the money transfers that Stripe has initiated to your registered bank account. Each record indicates the amount, the estimated arrival date, and the status:
- **Scheduled (Programado):** The payout will take place in the future.
- **In transit (En camino):** Stripe has sent the funds to the banking network and they should reflect in your account soon.
- **Deposited (Depositado):** The funds have successfully landed in your bank.

### Recent Payments (Cobros Recientes)
A detailed table recording each individual payment made by your clients across different quotes. It includes:
- **Date:** When the payment was made.
- **Amount:** The exact amount charged.
- **Method:** Whether the payment was made via "Credit/debit card", "SPEI Transfer (Stripe)", or "Manual Transfer".
- **Status & Link:** Allows you to identify which quote the payment belongs to and access the document directly to view details.

> **No more manual reconciliation:** Thanks to this view, you no longer need to hunt for deposits in your banking app and guess which invoice they belong to. Every payment is automatically linked to its quote and marks the documents as paid.
