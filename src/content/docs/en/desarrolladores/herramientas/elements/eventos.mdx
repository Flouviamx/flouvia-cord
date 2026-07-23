---
title: "Elements Events"
description: "Learn how to listen to client actions inside the iframe to build dynamic experiences."
---

<header class="content-header">
  <h1 class="page-title">Events (Relay)</h1>
  <p class="page-subtitle">React in the browser when your clients interact with the quote.</p>
</header>

## The Message Bridge

The Cord Elements iframe is designed to never isolate your website from what happens inside it. Using a bidirectional bridge via `window.postMessage`, Cord "relays" card events directly to your parent `window` environment.

This is incredibly powerful for triggering analytics pixels (like Meta Pixel or Google Analytics), launching confetti animations when a proposal is approved, or redirecting the user to a "Thank You" page after a successful payment.

## Listening to Events

You can listen to events natively by attaching an `addEventListener` to the DOM node of the embedded element:

```javascript
const container = document.querySelector('[data-cord-token]');

container.addEventListener('cord:approved', (event) => {
  console.log('The quote was approved!');
  console.log('Approved by:', event.detail.signed_by);
});
```

## Events Dictionary

All events have the `cord:` prefix to avoid naming collisions with other libraries.

### Component lifecycle
- **`cord:ready`**: Fired at the exact moment the SDK finishes rendering content, calculating final height, and loading fonts.
- **`cord:resize`**: Emitted continuously every time the iframe height changes (useful only if you write your own container and don't use `embed.js`).
- **`cord:viewed`**: Fired when the iframe becomes visible and Cord officially records in the database that the client has viewed the quote.

### Commercial interaction
- **`cord:approved`**: Emitted the instant the user approves the terms of the commercial proposal. Returns useful data in the `detail` such as the validation hash and who signed (`signed_by`).
- **`cord:signed`**: Fired sequentially upon capturing a legally binding signature.
- **`cord:pay`**: Emitted when the user clicks the button to start their payment flow (Stripe, wire transfer, etc.).
- **`cord:rejected`**: Fired if the client explicitly marks the proposal as declined.
- **`cord:message`**: Triggered whenever the client leaves a general comment in the quote chat.
- **`cord:item_comment`**: Fired when the user leaves a specific comment on an item (product line) of the quote.
