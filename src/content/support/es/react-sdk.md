---
title: "Cord Elements para React"
description: "Embebe el cotizador de Cord en tu app de React con @flouviahq/elements."
category: "Desarrolladores"
---

Para frontend, Cord no expone un SDK de "formularios de pago": el cobro con tarjeta lo procesa **tu propia cuenta de Stripe** a través del link público de la cotización. Lo que sí publicamos es **Cord Elements**, el cotizador embebible, disponible como Web Component y con un wrapper de React.

### Instalación

```bash
npm install @flouviahq/elements
```

### Uso en React / Next.js

Importa el componente desde `@flouviahq/elements/react` y pásale el `token` público de una cotización. El componente monta el cotializador (el mismo de `/q`) dentro de un iframe seguro con auto-altura.

```jsx
import { CordCotizador } from '@flouviahq/elements/react';

function MiPortal() {
  return (
    <CordCotizador
      token="token_publico_de_la_cotizacion"
      onApproved={(e) => console.log('Aprobada', e)}
      onPay={(e) => console.log('Pago iniciado', e)}
    />
  );
}
```

### Eventos disponibles

El componente emite los eventos del cotizador: `onApproved`, `onRejected`, `onMessage` y `onPay`. Úsalos para reaccionar en tu app (redirigir, mostrar un gracias, registrar analítica, etc.).

### Otros frameworks

El mismo paquete trae el Web Component `<cord-cotizador>` (Astro, Vue, Svelte, HTML) y wrappers para Vue y Framer. Para sitios sin build (WordPress, Webflow) usa el loader de una línea `embed.js`. Ver la página de [Cord Elements](/elements) para todos los snippets.
