---
title: "Cord React SDK"
description: "Installation and usage of @cord/react in your frontend."
category: "Developers"
---

If you are building a Single Page Application (SPA) with React, Next.js, or Vite, you can integrate payment components and UI using our front-end library, `@flouviamx/cord-react`.

### Provider Setup

Wrap your application in the Provider by injecting your Public Key (`pk_test_...`). This will load the security scripts asynchronously.

```jsx
import { CordProvider } from '@flouviamx/cord-react';

function App() {
  return (
    <CordProvider publishableKey="pk_test_your_public_key">
      <YourRouter />
    </CordProvider>
  );
}
```

### Using the Checkout Component

In your checkout view, you can mount the secure form for the user to insert their card. The React component handles PCI DSS encryption automatically.

```jsx
import { PaymentForm, useCord } from '@flouviamx/cord-react';

function CheckoutScreen({ clientSecret }) {
  const cord = useCord();

  const handleSubmit = async () => {
    // Confirm the payment against the Cord API
    const { error, paymentIntent } = await cord.confirmPayment({
      clientSecret,
      return_url: 'https://yourapp.com/success'
    });
    if (error) console.error(error.message);
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentForm />
      <button type="submit">Pay $5,000</button>
    </form>
  );
}
```
