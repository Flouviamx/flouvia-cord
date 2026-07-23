---
title: "Payments Overview"
description: "Discover how Cord automates your B2B collections with no hidden fees."
---

<header class="content-header">
  <h1 class="page-title">Payments Overview</h1>
  <p class="page-subtitle">The financial engine of your B2B business. Collect via wire transfer or card without anyone holding your money.</p>
</header>

<section class="docs-section split" style="margin-top: 40px; border-top: none; padding-top: 0; margin-bottom: 64px;">
  <div class="section-text">
    <h2>Start now</h2>
    <p>Integrate Cord to start accepting B2B payments online instantly, automate bank transfer reconciliation, and natively issue CFDI invoices.</p>
    <a href="/docs/pagos/aceptar?lang=en" class="action-link-text">Find your use case &rarr;</a>
  </div>
  <div class="section-visual">
    <div class="mockup-card" style="border-radius: 12px; transform: scale(1); box-shadow: 0 12px 32px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05); overflow: hidden; display: flex; width: 100%; min-height: 380px;">
      <!-- Mockup Left (Dark) -->
      <div style="flex: 1; background: #1a1f36; padding: 24px; color: white;">
        <div style="font-size: 13px; color: #8792a2; font-weight: 500; margin-bottom: 32px;">&larr; Invoice 0451</div>
        <div style="font-size: 13px; color: #a0aec0; margin-bottom: 4px;">Enterprise Subscription</div>
        <div style="font-size: 28px; font-weight: 600; letter-spacing: -0.02em; margin-bottom: 32px;">$14,500.00</div>
        
        <!-- Cart Item abstract visual -->
        <div style="display: flex; gap: 12px; align-items: center; background: rgba(255,255,255,0.03); padding: 12px; border-radius: 8px;">
          <div style="width: 40px; height: 40px; background: rgba(255,255,255,0.1); border-radius: 6px;"></div>
          <div style="flex: 1;">
            <div style="height: 6px; width: 80%; background: rgba(255,255,255,0.2); border-radius: 4px; margin-bottom: 6px;"></div>
            <div style="height: 6px; width: 40%; background: rgba(255,255,255,0.1); border-radius: 4px;"></div>
          </div>
        </div>
      </div>
      
      <!-- Mockup Right (Light form) -->
      <div style="flex: 1.3; background: #ffffff; padding: 24px;">
        <div style="display: flex; gap: 8px; margin-bottom: 24px;">
          <div style="flex: 1; height: 32px; background: #0071e3; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 600;">SPEI</div>
          <div style="flex: 1; height: 32px; background: #050505; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 600;">G Pay</div>
        </div>
        
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
          <div style="flex: 1; height: 1px; background: #e3e8ee;"></div>
          <span style="font-size: 11px; color: #8792a2; font-weight: 500;">Or pay with card</span>
          <div style="flex: 1; height: 1px; background: #e3e8ee;"></div>
        </div>
        
        <div class="mockup-form" style="gap: 12px;">
          <label>Billing information</label>
          <div class="input-field full" style="margin-bottom: 8px;"><span>Email address</span></div>
          
          <label>Card details</label>
          <div class="input-field full"><span>Card number</span></div>
          <div class="input-row" style="margin-top: -4px;">
            <div class="input-field half"><span>MM / YY</span></div>
            <div class="input-field half"><span>CVC</span></div>
          </div>
          
          <div style="margin-top: 12px; height: 36px; background: #050505; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; font-size: 13px; font-weight: 600;">Pay $14,500.00</div>
        </div>
      </div>
    </div>
  </div>
</section>

## Goodbye manual reconciliations

In traditional B2B, receiving a payment means: asking the client to email the transfer receipt, sales forwarding it to finance, and finance searching for the exact deposit in the bank portal the next day to cross-reference it against the quote.

**Cord completely eliminates this process.** Our payment infrastructure is natively designed for B2B, automating reconciliation and sending the money straight to your bank account.

### What you will learn in this section:

1. **Accepting a payment:** How dynamic CLABEs (SPEI wire transfers) and card payments work, and why the money goes straight to you without us touching a dime.
2. **Advances and balances:** How to charge 50% today and the rest when you deliver the project.
3. **Cash flow:** How to view the money you have in transit and what's projected for the next month.

## A "Direct-to-Bank" architecture

Unlike generic payment gateways that hold your money and then do "payouts", Cord operates on **Stripe Connect Custom**.
This means that when your client pays, the funds travel *directly* to your own bank account. Cord is not a middleman; it is the software layer that orchestrates the transaction.
