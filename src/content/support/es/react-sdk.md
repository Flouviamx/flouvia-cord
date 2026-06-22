---
title: "Cord React SDK"
description: "Instalación y uso de @cord/react en tu frontend."
category: "Desarrolladores"
---

Si estás construyendo una aplicación Single Page (SPA) con React, Next.js o Vite, puedes integrar componentes de cobro y UI utilizando nuestra librería de front-end, `@flouviamx/cord-react`.

### Setup del Provider

Envuelve tu aplicación en el Provider inyectando tu Llave Pública (`pk_test_...`). Esto cargará los scripts de seguridad de manera asíncrona.

```jsx
import { CordProvider } from '@flouviamx/cord-react';

function App() {
  return (
    <CordProvider publishableKey="pk_test_tu_llave_publica">
      <TuRouter />
    </CordProvider>
  );
}
```

### Uso del Componente de Pago (Checkout)

En tu vista de caja, puedes montar el formulario seguro para que el usuario inserte su tarjeta. El componente de React maneja el cifrado PCI DSS automáticamente.

```jsx
import { PaymentForm, useCord } from '@flouviamx/cord-react';

function PantallaDeCobro({ clientSecret }) {
  const cord = useCord();

  const handleSubmit = async () => {
    // Confirma el pago contra la API de Cord
    const { error, paymentIntent } = await cord.confirmPayment({
      clientSecret,
      return_url: 'https://tuapp.com/exito'
    });
    if (error) console.error(error.message);
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentForm />
      <button type="submit">Pagar $5,000</button>
    </form>
  );
}
```
