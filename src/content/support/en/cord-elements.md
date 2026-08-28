---
title: "Cord Elements (Embeddable UI components)"
description: "Embed Cord's quoter directly into your own web application, with your brand."
category: "Developers"
order: 3
---

Cord Elements (`@flouviahq/elements`) is the component library that lets you embed Cord's quoter directly inside your own site or app, without sending the client to another domain.

### Benefits

- **Reduced abandonment:** the client never leaves your domain (e.g., `app.yourcompany.com/portal`) to view, approve, or pay a quote.
- **PCI compliance:** card payment happens inside the quote's secure public-link iframe — sensitive card data never touches your servers.

### The two real components

1. **`CordCotizador`** — an auto-height iframe that shows an **already-created** quote so the client can view it, approve (sign) it, or pay it. It's the same quoter that runs at `/q/{token}`, brandable via the `appearance` API (colors, typography, light/dark theme).
2. **`CordBuilder`** (or the headless `useQuoteBuilder` hook) — builds and creates a **new** quote from your own interface: client, line items, taxes, and totals computed with the same engine the server uses.

There is no separate "payment-only" component, nor an embeddable self-service invoice portal: downloading an invoice's PDF/XML or updating tax details today happens from the invoice's public link or inside the Cord app itself, not as a standalone Elements component.

### Security: publishable key or your own proxy

Creating quotes or reading the catalog from the browser requires deciding how your app talks to the API: with a **publishable key** (`pk_live_.../pk_test_...`, exposed client-side but with a narrow scope — it can never read your customer directory or touch invoicing) or with **your own proxy** (your backend calls Cord with an `sk_` key). The `CordCotizador` viewer needs neither: it only needs the quote's public `token`.

### Installation

```bash
npm install @flouviahq/elements
```

See [Cord Elements for React](/en/support/react-sdk) for the React wrapper, or the [Cord Elements](/elements) page for the `<cord-cotizador>` Web Component (works on any site) and the Vue and Framer wrappers.
