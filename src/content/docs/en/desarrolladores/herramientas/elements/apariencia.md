---
title: "Elements Appearance"
description: "Customize the look of Cord Elements with CSS variables, Dark Mode, and custom fonts."
---

<header class="content-header">
  <h1 class="page-title">Appearance</h1>
  <p class="page-subtitle">Make the quoter look like it was developed in-house by your product team.</p>
</header>

## The Appearance API

By default, Cord Elements renders with our clean, neutral color palette, but you can deeply control its aesthetics using a JSON configuration object. 

Because the quoter lives inside an iframe, you cannot inject traditional stylesheets directly. Instead, the `embed.js` script sends your aesthetic preferences to Cord's servers, which safely render validated CSS.

### The Appearance Parameter

The embeddable script reads the `appearance` object from your HTML tag or initialization config.

```html
<script src="https://cordhq.app/embed.js" async></script>
<div 
  data-cord-token="tok_A1B2C3D4E5" 
  data-appearance='{
    "theme": "dark",
    "variables": {
      "colorBackground": "#18181b",
      "colorText": "#f4f4f5",
      "colorPrimary": "#3b82f6",
      "borderRadius": "8px"
    },
    "fonts": [
      {
        "cssSrc": "https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap"
      }
    ]
  }'>
</div>
```

## Available Options

### 1. Themes (`theme`)
You can instruct the iframe to render using a base theme. 
- `light` (Default)
- `dark` (Renders the design with black backgrounds and inverts the palette)
- `auto` (The iframe uses `@media (prefers-color-scheme: dark)` to respect the visitor's operating system preference).

### 2. CSS Variables (`variables`)
Cord exposes a series of internal CSS variables that you can override. Write the variables in `camelCase` format inside the JSON.

- `colorBackground`: Main background of the card.
- `colorText`: General text color.
- `colorPrimary`: Main color for buttons and accents.
- `borderRadius`: Corner rounding (e.g. `0px` for sharp edges, `12px` for soft curves).
- `fontFamily`: Font family to apply to all texts.

### 3. External Fonts (`fonts`)
Cord allows you to load your own commercial or free typography directly inside the iframe.

Pass a `fonts` array with objects containing the `cssSrc`. 
> **Note:** For strict security reasons and to prevent interface injections (UI-redressing), Cord will only execute `@import` directives coming from verified typography hosts, such as `fonts.googleapis.com` or `fonts.bunny.net`. Any other external URL will be silently discarded.
