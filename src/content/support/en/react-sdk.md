---
title: "Cord Elements for React"
description: "Embed Cord's quoter in your React app with @flouviahq/elements."
category: "Developers"
---

On the frontend, Cord does not expose a "payment form" SDK: card processing is handled by **your own Stripe account** through the quote's public link. What we do publish is **Cord Elements**, the embeddable quoter, available as a Web Component and with a React wrapper.

### Installation

```bash
npm install @flouviahq/elements
```

### Usage in React / Next.js

Import the component from `@flouviahq/elements/react` and pass it a quote's public `token`. The component mounts the quoter (the same one at `/q`) inside a secure auto-height iframe.

```jsx
import { CordCotizador } from '@flouviahq/elements/react';

function MyPortal() {
  return (
    <CordCotizador
      token="public_quote_token"
      onApproved={(e) => console.log('Approved', e)}
      onPay={(e) => console.log('Payment started', e)}
    />
  );
}
```

### Available events

The component emits the quoter's events: `onApproved`, `onRejected`, `onMessage`, and `onPay`. Use them to react in your app (redirect, show a thank-you, log analytics, etc.).

### Other frameworks

The same package ships the `<cord-cotizador>` Web Component (Astro, Vue, Svelte, HTML) and wrappers for Vue and Framer. For no-build sites (WordPress, Webflow) use the one-line `embed.js` loader. See the [Cord Elements](/elements) page for all snippets.
