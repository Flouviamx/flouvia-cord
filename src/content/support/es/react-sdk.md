---
title: "Cord Elements para React"
description: "Embebe el cotizador de Cord en tu app de React con @flouviahq/elements."
category: "Desarrolladores"
---

Para frontend, Cord no expone un SDK de formularios de pago sueltos: el cobro con tarjeta se procesa dentro del iframe seguro del link público de la cotización. Lo que sí publicamos es **Cord Elements** (`@flouviahq/elements`), con dos piezas para React: un visor de cotizaciones ya creadas y un builder para crear cotizaciones nuevas desde tu propia UI.

### Instalación

```bash
npm install @flouviahq/elements
```

### `CordProvider`: publishable key o tu propio proxy

Para crear cotizaciones o leer el catálogo desde el navegador, envuelve tu app en `CordProvider`. Es una unión discriminada: pasas `publishableKey` **o** `proxyUrl`, nunca ambos.

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

Con `publishableKey` (`pk_live_...`/`pk_test_...`, generada en Ajustes › Developers), el navegador puede crear cotizaciones y leer el catálogo de productos directamente; **no** puede leer tu directorio de clientes (`useCordClients()` devuelve `CordError` con `code: 'clients_require_proxy'`) ni tocar facturación o cobranza. Si necesitas eso, usa `proxyUrl` apuntando a una ruta de tu backend que llame a Cord con una llave `sk_`.

### Ver, aprobar o pagar una cotización existente

```jsx
import { CordCotizador } from '@flouviahq/elements/react';

function MiPortal({ token }) {
  return (
    <CordCotizador
      token={token}
      onApproved={(e) => console.log('Aprobada, firmada por', e.signed_by)}
      onPay={(e) => window.location.assign(e.url)}
      onRejected={(e) => console.log('Rechazada:', e.comentario)}
    />
  );
}
```

`CordCotizador` monta el mismo cotizador de `/q` dentro de un iframe seguro con auto-altura; funciona sin `CordProvider` si solo necesitas mostrar/aprobar (no crear cotizaciones nuevas ni leer catálogo).

### Crear una cotización nueva

`CordBuilder` trae una UI lista para usar, con clases `.cord-*` estables para sobreescribir con tu propio CSS:

```jsx
import { CordBuilder } from '@flouviahq/elements/react';

function NuevaCotizacion() {
  return <CordBuilder onQuoteCreated={(q) => console.log(q.folio, q.link_publico)} />;
}
```

Si prefieres tu propia interfaz, `useQuoteBuilder()` da el mismo estado (items, cliente, totales, `handleSubmit`) como un hook headless, sin ningún componente visual de por medio.

### Eventos disponibles

`CordCotizador` emite `onReady`, `onViewed`, `onApproved`, `onSigned` (junto con `onApproved`, misma acción), `onRejected`, `onMessage`, `onItemComment` y `onPay`. Úsalos para reaccionar en tu app (redirigir, mostrar un gracias, registrar analítica, etc.).

### Otros frameworks

El mismo paquete trae el Web Component `<cord-cotizador>` (Astro, Vue, Svelte, PHP, cualquier HTML) y wrappers para Vue y Framer. Para sitios sin build (WordPress, Webflow) usa el loader de una línea `embed.js`. Ver la página de [Cord Elements](/elements) para todos los snippets.
