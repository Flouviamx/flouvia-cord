---
title: "Cord Elements for React"
description: "Embed Cord's quoter in your React app with @flouviahq/elements."
category: "Developers"
---

On the frontend, Cord does not expose a standalone payment-form SDK: card processing happens inside the quote's secure public-link iframe. What we do publish is **Cord Elements** (`@flouviahq/elements`), with two pieces for React: a viewer for already-created quotes, and a builder for creating new quotes from your own UI.

### Installation

```bash
npm install @flouviahq/elements
```

### `CordProvider`: publishable key or your own proxy

To create quotes or read the catalog from the browser, wrap your app in `CordProvider`. It's a discriminated union: pass `publishableKey` **or** `proxyUrl`, never both.

```jsx
import { CordProvider } from '@flouviahq/elements/react';

function Layout({ children }) {
  return (
    <CordProvider publishableKey={process.env.NEXT_PUBLIC_CORD_PUBLISHABLE_KEY}>
      {children}
    </CordProvider>
  );
}
```

With `publishableKey` (`pk_live_...`/`pk_test_...`, generated in Settings › Developers), the browser can create quotes and read the product catalog directly; it **cannot** read your customer directory (`useCordClients()` returns a `CordError` with `code: 'clients_require_proxy'`), nor touch invoicing or collections. If you need that, use `proxyUrl` pointing at a backend route that calls Cord with an `sk_` key.

### View, approve, or pay an existing quote

```jsx
import { CordCotizador } from '@flouviahq/elements/react';

function MyPortal({ token }) {
  return (
    <CordCotizador
      token={token}
      onApproved={(e) => console.log('Approved, signed by', e.signed_by)}
      onPay={(e) => window.location.assign(e.url)}
      onRejected={(e) => console.log('Rejected:', e.comentario)}
    />
  );
}
```

`CordCotizador` mounts the same quoter used at `/q` inside a secure auto-height iframe; it works without `CordProvider` if you only need to show/approve a quote (not create new ones or read the catalog).

### Creating a new quote

`CordBuilder` ships a ready-made UI with stable `.cord-*` classes you can override with your own CSS:

```jsx
import { CordBuilder } from '@flouviahq/elements/react';

function NewQuote() {
  return <CordBuilder onQuoteCreated={(q) => console.log(q.folio, q.link_publico)} />;
}
```

If you'd rather build your own interface, `useQuoteBuilder()` gives the same state (items, client, totals, `handleSubmit`) as a headless hook, with no visual component in between.

### Available events

`CordCotizador` emits `onReady`, `onViewed`, `onApproved`, `onSigned` (fires together with `onApproved`, same action), `onRejected`, `onMessage`, `onItemComment`, and `onPay`. Use them to react in your app (redirect, show a thank-you, log analytics, etc.).

### Other frameworks

The same package ships the `<cord-cotizador>` Web Component (Astro, Vue, Svelte, PHP, any HTML) and wrappers for Vue and Framer. For no-build sites (WordPress, Webflow) use the one-line `embed.js` loader. See the [Cord Elements](/elements) page for all snippets.
