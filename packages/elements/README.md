# @flouviahq/elements

Embebe el cotizador B2B de **[Cord](https://cord.flouvia.com)** en cualquier
sitio — con tu marca, aprobación, contraoferta y pago en línea, sin que tus
clientes salgan de su portal.

**NUEVO en v0.6.0 (God-Level SDK)**: Elements ha evolucionado a una infraestructura financiera completa para B2B. Ahora incluye un **Server SDK** fuertemente tipado con validación criptográfica de Webhooks, **Componentes de React Componibles (Slots)**, **Internalización Nativa (i18n)** y soporte completo para autocompletado de **Catálogo de Productos y Clientes del CRM**.

```bash
npm install @flouviahq/elements
```

---

## ⚡ React (Native SDK)

Nuestra SDK de React te permite construir interfaces 100% nativas sin depender de iframes.

### 1. Provider, Localización (i18n) & Telemetría

El `<CordProvider>` maneja la configuración global, la inyección de estilos (`appearance`), el idioma y la emisión de eventos de analíticas.

```tsx
import { CordProvider } from '@flouviahq/elements/react';

export default function App({ children }) {
  return (
    <CordProvider 
      // URL de tu proxy backend que inyecta el CORD_API_KEY
      proxyUrl="/api/cord" 
      publishableKey="pk_test_12345" // Usa llaves de prueba para entornos aislados (Sandboxed)
      locale="en" // Soporta 'es' (default) o 'en' para traducir toda la interfaz mágicamente
      appearance={{
        variables: {
          colorPrimary: '#A81200',
          colorText: '#0A2240',
          borderRadius: '16px',
        }
      }}
      onAnalyticsEvent={(event, payload) => {
        // Conecta con tu herramienta de analíticas (PostHog, Datadog)
        console.log(`[Cord] ${event}`, payload);
      }}
    >
      {children}
    </CordProvider>
  );
}
```

### 2. UI Componible (`<CordBuilder />` Compound Pattern)

En lugar de darte una caja negra, `<CordBuilder>` ahora usa componentes compuestos (slots). Tienes control total del layout y diseño HTML. 
**Incluye autocompletado automático de tu catálogo de Productos y CRM de Clientes**.

```tsx
import { CordBuilder } from '@flouviahq/elements/react';
import { useRouter } from 'next/navigation';

export default function NuevaCotizacion() {
  const router = useRouter();

  return (
    <CordBuilder onQuoteCreated={(q) => router.push(`/${q.token}`)}>
      <div className="tu-clase-de-tailwind flex gap-4">
        {/* Inyecta el encabezado original de Cord o tu propio componente */}
        <CordBuilder.Header className="bg-slate-50 p-6 rounded" />
        <TuLogoPersonalizado />
      </div>
      
      <CordBuilder.Config />
      <CordBuilder.Items />
      <CordBuilder.Notes />
      <CordBuilder.Summary />
      
      <div className="flex justify-end mt-4">
        <CordBuilder.SubmitButton className="bg-red-500 text-white p-2" />
      </div>
    </CordBuilder>
  );
}
```

### 3. Headless UI Hooks

Si quieres construir tu propia interfaz desde cero, puedes extraer la lógica pura:
- `useCreateQuote()`: Maneja el estado de carga y expone `createQuote`.
- `useCordCatalog()`: Se conecta a tu proxy para traer los productos de Cord y manejarlos en estado de React.
- `useCordClients()`: Trae tu CRM de clientes guardados en Cord para usarlos en autocompletado.
- `useCord(token)`: Accede al estado de la cotización actual.
- `useCordTranslations()`: Extrae las cadenas de texto del idioma actual (`locale`).

---

## 💻 Server SDK (Node.js) & Webhooks

Si necesitas comunicarte con Cord desde tu backend (ej. Route Handlers en Next.js, Express, etc.), puedes importar el Server SDK fuertemente tipado:

```typescript
import { CordAPI } from '@flouviahq/elements/server';

// Si la llave empieza con 'sk_test_', la SDK entra en Test Mode automáticamente (Sandbox)
const cord = new CordAPI('sk_test_12345...'); 

export async function POST(req) {
  const data = await req.json();
  
  // Petición fuertemente tipada con autocompletado en tu IDE
  const quote = await cord.quotes.create({
    cliente_id: data.cliente_id,
    items: data.items,
  });

  return Response.json(quote);
}
```

### 🔐 Verificación Criptográfica de Webhooks

Asegura tus rutas de webhooks validando la firma HMAC SHA-256 de Cord para prevenir ataques de suplantación o *Replay Attacks*.

```typescript
import { CordAPI } from '@flouviahq/elements/server';
const cord = new CordAPI();

export async function POST(req) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('cord-signature');
    
    // Si la firma es inválida o expiró, lanzará un error y detendrá la ejecución
    const event = cord.webhooks.constructEvent(
        rawBody, 
        signature, 
        process.env.CORD_WEBHOOK_SECRET
    );

    if (event.type === 'quote.approved') {
        console.log("¡Cotización pagada/aprobada y verificada exitosamente!", event.data);
    }
    
    return new Response('OK');
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }
}
```

---

## 🪟 Visor Iframe (Web Component, Vue, Framer, Webflow)

Si solo quieres *mostrar* una cotización existente usando nuestro visor alojado, puedes usar el Web Component clásico. Por debajo usa un `<iframe>` seguro a `cord.flouvia.com/embed/{token}` (auto-altura vía `postMessage`).

### HTML Vanilla (Web Component)

```js
import '@flouviahq/elements';
```

```html
<cord-cotizador token="abc123"></cord-cotizador>
```

### React (Visor Iframe)

```tsx
import { CordCotizador } from '@flouviahq/elements/react';

<CordCotizador token="abc123" onApproved={(d) => console.log('Aprobada', d.folio)} />
```

### Vue 3

```vue
<script setup>
import { CordCotizador } from '@flouviahq/elements/vue';
</script>

<template>
  <CordCotizador token="abc123" @approved="(e) => console.log(e.folio)" />
</template>
```

### Framer (No-Code)

Crea un **Code Component** en Framer, pega este código y arrástralo al canvas:

```tsx
import { FramerCordCotizador } from '@flouviahq/elements/framer';
export default FramerCordCotizador;
```

---

## Seguridad

El cotizador (Iframe) solo se puede embeber en los **dominios autorizados** de tu cuenta (Ajustes › Developers › Cotizador embebible). Cord lo aplica con el header CSP `frame-ancestors` — anti-clickjacking. 

> Para solicitudes API Server-to-Server, **nunca expongas tu Secret Key (`sk_live_...`) en el frontend**. Pasa las solicitudes a través de un proxy en tu backend y añade tu API Key ahí, o usa la Public Key (`pk_live_...`) para operaciones autorizadas del lado del cliente.

---

Hecho por [Flouvia](https://flouvia.com) · México 🇲🇽
