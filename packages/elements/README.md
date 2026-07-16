# @flouviahq/elements

SDK oficial de [Cord](https://cord.flouvia.com) para integrar cotizaciones interactivas B2B
en cualquier aplicación: Web Component nativo, wrappers de React/Vue/Framer/Webflow, hooks
headless, y un Server SDK para verificar webhooks.

## Instalación

```bash
npm install @flouviahq/elements
```

## Dos formas de usarlo

1. **Iframe viewer (`CordCotizador`)** — muestra una cotización YA CREADA para que el
   cliente la vea/apruebe/pague. Es un `<iframe>` a `/embed/{token}` con tu marca.
2. **Builder headless (`useQuoteBuilder` / `<CordBuilder>`)** — arma y crea una cotización
   nueva desde tu propia UI (o la que trae el SDK por defecto).

Ambos requieren decidir CÓMO tu app habla con la API de Cord: **publishable key** (directo
desde el navegador) o **tu propio proxy** (tu backend llama a Cord con una `sk_`). Ver
[Seguridad y modos](#seguridad-y-modos) — es una unión discriminada, pasar los dos a la vez
es un error de compilación.

---

## Quickstart (React)

```tsx
// app/layout.tsx (o donde envuelvas tu app)
import { CordProvider } from '@flouviahq/elements/react';

export default function Layout({ children }) {
  return (
    <CordProvider publishableKey={process.env.NEXT_PUBLIC_CORD_PUBLISHABLE_KEY!}>
      {children}
    </CordProvider>
  );
}
```

```tsx
// Ver/aprobar una cotización existente
import { CordCotizador } from '@flouviahq/elements/react';

function QuotePage({ token }: { token: string }) {
  return (
    <CordCotizador
      token={token}
      onApproved={(d) => console.log('Aprobada, firmada por', d.signed_by)}
      onPay={(d) => window.location.assign(d.url)}
    />
  );
}
```

```tsx
// Armar una cotización nueva (usa el Builder por defecto)
import { CordBuilder } from '@flouviahq/elements/react';

function NewQuote() {
  return (
    <CordBuilder
      onQuoteCreated={(q) => console.log('Creada:', q.folio, q.link_publico)}
    />
  );
}
```

---

## Seguridad y modos

`CordProviderProps` es una **unión discriminada**: pasas `publishableKey` **o** `proxyUrl`,
nunca los dos. Esto existe porque pasar ambos a la vez por error (una `pk_` de prueba junto
a un proxy real) es exactamente el bug que se volvió imposible de cometer al compilar.

### Modo `publishable` — directo desde el navegador

```tsx
<CordProvider publishableKey="pk_live_..."> {/* o pk_test_... */}
```

Una publishable key (`pk_live_...`/`pk_test_...`, la generas en Ajustes › Developers) puede,
por diseño:
- **Crear cotizaciones** (`POST /api/v1/cotizaciones`).
- **Leer el catálogo de productos** (`GET /api/v1/productos` — el servidor oculta `costo`/margen).

Y **nunca** puede:
- **Leer tu CRM de clientes.** `useCordClients()` en modo publishable no intenta la red — devuelve
  un `CordError` con `code: 'clients_require_proxy'` de inmediato. No es un bug, es la política:
  una `pk_` vive en el código fuente de tu página; leer el directorio de clientes filtraría
  email/RFC/límite de crédito a quien vea ese código fuente. Pasa `clients` como prop en su lugar.
- Nada de facturación, cobranza ni ajustes.

Con dominios restringidos en Ajustes › Developers, la key además exige el header `Origin`/`Referer`
y lo valida contra esa allowlist.

### Modo `proxy` — tu propio backend

```tsx
<CordProvider proxyUrl="/api/cord/create">
```

Tu backend recibe el POST, llama a Cord con una `sk_...` (nunca expuesta al navegador), y
devuelve la respuesta. Usa este modo si necesitas escribir en el CRM, leer clientes, o simplemente
prefieres no exponer ninguna llave al cliente. `useCordClients()` SÍ intenta `${proxyUrl}/clientes`
en este modo — si tu proxy es una sola ruta de acción (como `/api/cord/create`, sin una
sub-ruta `/clientes`), pasa `clients` como prop en vez de depender del fetch automático.

### Ninguno — solo visor

`<CordCotizador>` funciona **sin** `<CordProvider>` en absoluto (uso suelto: solo necesitas
mostrar/aprobar una cotización, no crear ninguna ni leer catálogo/clientes):

```tsx
<CordCotizador token={token} appearance={{ theme: 'dark' }} />
```

### Self-host / staging

```ts
import { configureCord } from '@flouviahq/elements/react'; // o '@flouviahq/elements'

configureCord({ baseUrl: 'https://staging.tudominio.com' });
```

Precedencia en todo el SDK: **prop del componente > `<CordProvider>` > `configureCord()` >
`https://cord.flouvia.com`**.

---

## Headless UI — `useQuoteBuilder`

El estado completo del builder como un hook standalone — la misma coexistencia headless/styled
de Clerk (`useSignIn()` + `<SignIn/>`). Requiere `<CordProvider>` (no requiere `<CordBuilder>`).

```tsx
import { useQuoteBuilder } from '@flouviahq/elements/react';

function MiPropioBuilder() {
  const {
    items, updateItem, removeItem, subtotal, iva, total,
    cliente, setCliente, notas, setNotas,
    handleSubmit, isLoading, submitError,
  } = useQuoteBuilder({
    catalog: misProductos,   // opcional — si lo pasas, NO se hace fetch
    clients: misClientes,    // opcional — si lo pasas, NO se hace fetch
    ivaPct: 0.16,            // opcional — mejor configúralo en el Provider (ver abajo)
    onQuoteCreated: (q) => router.push(q.link_publico),
  });

  return <form onSubmit={handleSubmit}>{/* tu propia UI, con tus propias clases */}</form>;
}
```

`ivaPct` — configúralo en el `<CordProvider ivaPct={0.16}>` (no por instancia): así el total
que ve el usuario en el Builder coincide con el que termina calculando el servidor para tu org.

## Componente `<CordBuilder>` — compound pattern con estilos

Si no necesitas tu propia UI, `<CordBuilder>` trae una por default, con clases estables
`.cord-*` (nunca inline styles) para que puedas sobreescribirlas con CSS normal — Tailwind,
CSS Modules, lo que uses:

```tsx
import { CordBuilder } from '@flouviahq/elements/react';

// Uso simple (layout por defecto)
<CordBuilder onQuoteCreated={(q) => console.log(q.folio)} />

// Compound — reordena/omite piezas
<CordBuilder onQuoteCreated={handleCreated}>
  <CordBuilder.Header />
  <CordBuilder.Items className="mi-clase-tailwind" />
  <CordBuilder.Summary />
  <CordBuilder.SubmitButton className="btn btn-primary" />
</CordBuilder>
```

### Estilizar: `appearance.elements`

Cada nodo interno tiene una clase base `.cord-<key>` que **nunca se reemplaza** — un override
solo agrega encima:

```tsx
<CordProvider
  publishableKey="pk_test_..."
  appearance={{
    variables: { colorPrimary: '#111827', borderRadius: '10px' },
    elements: {
      submitButton: 'my-tailwind-btn-class',
      formFieldInput: { borderColor: '#e5e7eb' },
      itemRow: { className: 'my-row', style: { background: '#fafafa' } },
    },
  }}
>
```

Los defaults del SDK se inyectan dentro de `@layer cord` y se `prepend()`-ean al `<head>` —
tu CSS (Tailwind u otro) siempre gana, sin necesitar un solo `!important`.

### Headless real (`baseTheme: 'none'`)

```tsx
<CordProvider publishableKey="pk_test_..." appearance={{ baseTheme: 'none' }}>
```

El SDK deja de inyectar CUALQUIER CSS — las clases `.cord-*` se siguen emitiendo en el markup
para que tú las estilices por completo, sin ningún estilo de Cord de por medio.

---

## Appearance API completa

```ts
interface CordAppearance {
  theme?: 'light' | 'dark' | 'auto';        // afecta al iframe Y a los componentes nativos
  baseTheme?: 'default' | 'none';           // 'none' = headless real (solo nativos)
  variables?: {
    colorPrimary?: string; colorText?: string; colorBackground?: string;
    fontFamily?: string; borderRadius?: string; [key: string]: string | undefined;
  };
  elements?: CordElements;                  // solo nativos — ver arriba
  fonts?: Array<{ cssSrc: string }>;        // Google Fonts / Bunny Fonts (allowlist)
}
```

`theme: 'dark'`/`'auto'` funciona tanto en `<CordCotizador>` (el iframe) como en `<CordBuilder>`
(componentes nativos, vía `data-cord-theme` + `prefers-color-scheme`). El default oscuro es
sobrio (`#e5e7eb`/`#111827`); tus propias `variables` siempre ganan sobre ese default.

---

## Iframe viewer — eventos tipados

```tsx
<CordCotizador
  token={token}
  onReady={() => {}}
  onViewed={(d) => {}}                    // { token? }
  onApproved={(d) => {}}                  // { signed_by, hash }
  onSigned={(d) => {}}                    // dispara JUNTO con onApproved (misma acción)
  onRejected={(d) => {}}                  // { comentario }
  onMessage={(d) => {}}                   // { action, mensaje, propuesta? }
  onItemComment={(d) => {}}               // { item_id, mensaje }
  onPay={(d) => {}}                       // { url }
  onEvent={(event) => {                   // catch-all tipado — switch exhaustivo sobre event.type
    switch (event.type) {
      case 'cord:approved': /* event.detail: CordApprovedDetail */ break;
      // …
    }
  }}
/>
```

⚠️ `onApproved`/`onSigned` se disparan **ambos** por una sola acción del cliente (aprobar =
firmar) — no los cuentes como dos eventos de negocio distintos si agregas métricas.

---

## Vue

```vue
<script setup>
import { CordCotizador } from '@flouviahq/elements/vue';
</script>

<template>
  <CordCotizador
    :token="token"
    @approved="onApproved"
    @signed="onSigned"
    @item-comment="onItemComment"
    @pay="onPay"
  />
</template>
```

## Web Component (HTML, PHP, Laravel, Rails, cualquier stack)

```html
<script type="module" src="https://unpkg.com/@flouviahq/elements/dist/index.mjs"></script>

<div style="height: 800px;">
  <cord-cotizador token="TU_TOKEN" base-url="https://cord.flouvia.com" min-height="500"></cord-cotizador>
</div>

<script>
  const cotizador = document.querySelector('cord-cotizador');
  cotizador.addEventListener('approved', (e) => console.log('Folio:', e.detail.folio));
</script>
```

Atributos: `token` (requerido), `base-url`, `min-height`. Los eventos llegan SIN el prefijo
`cord:` (`cord:approved` → `approved`).

## Loader de una línea (`embed.js`) — sitios sin bundler

```html
<script src="https://cord.flouvia.com/embed.js" async></script>
<div data-cord-token="TU_TOKEN"></div>
```

Atributos: `data-cord-token` (requerido), `data-cord-base-url`, `data-cord-min-height`. Mismo
vocabulario que Webflow (`src/webflow.ts`, atributos `data-cord-token`/`data-cord-base-url`/
`data-cord-min-height` en cualquier bloque). El par legacy `data-cord-cotizador` + `data-token`
sigue funcionando (embeds ya publicados), pero usa el nuevo vocabulario en integraciones nuevas.

## Framer

```tsx
import { FramerCordCotizador } from '@flouviahq/elements/framer';
```
Agrégalo como Code Component; `token` y `baseUrl` quedan expuestos en el panel de propiedades.

---

## Server SDK (`@flouviahq/elements/server`)

Para verificar webhooks salientes de Cord (`quote.sent`, `quote.viewed`, `quote.approved`,
`quote.rejected`, `quote.paid`, `invoice.stamped`) y para llamar a la API desde tu backend.

```ts
import { CordAPI } from '@flouviahq/elements/server';

const cord = new CordAPI(process.env.CORD_SECRET_KEY); // sk_live_.../sk_test_...

// Next.js Route Handler — app/api/webhooks/cord/route.ts
export async function POST(req: Request) {
  const body = await req.text();
  try {
    const event = cord.webhooks.constructEvent(body, req.headers, process.env.CORD_WEBHOOK_SECRET!);
    // event: { event: 'quote.paid', created_at: '...', data: { id, folio, status, total, cliente, link_publico } }
    if (event.event === 'quote.paid') { /* ... */ }
    return new Response('ok');
  } catch (err) {
    return new Response('Firma inválida', { status: 400 });
  }
}
```

`constructEvent(payload, headers, secret, opts?)`:
- `headers` acepta un `Headers` real (`req.headers` en Next.js), un `Record<string,string>`, o
  (retrocompatible una versión) el valor crudo del header `X-Cord-Signature` como string.
- Verifica PRIMERO `X-Cord-Signature-V1` (con timestamp — protección anti-replay real, respeta
  `opts.tolerance`, default 300s). Si el endpoint solo tiene la legacy `X-Cord-Signature` (sin
  timestamp), cae a esa — nunca lanza solo por faltar V1, a menos que pases
  `{ requireTimestamp: true }`.
- El payload real es `{ event, created_at, data }` — **no** `{ type, created }` (una versión
  anterior de este SDK declaraba mal el tipo de retorno; si tu código leía `evt.type`, cámbialo
  a `evt.event`).

`constructEventAsync(...)` — misma firma, verifica con WebCrypto (`crypto.subtle`) en vez de
`node:crypto`, para runtimes edge/workers. Nota: el módulo entero sigue importando `node:crypto`
a nivel de archivo (lo usa `constructEvent`), así que en un runtime que no lo exponga en
absoluto el `import` puede fallar antes de llegar a `constructEventAsync` — funciona en Node y
en Cloudflare Workers con `nodejs_compat`.

### API REST directa

```ts
const quote = await cord.quotes.create({ items: [{ descripcion: 'Consultoría', cantidad: 1, precio_unitario: 5000 }] });
console.log(quote.folio, quote.token, quote.link_publico); // link_publico ya viene absoluto
```

---

## Errores tipados (`CordError`)

Todos los hooks y `CordAPI` lanzan/exponen `CordError` (nunca un `Error` genérico):

```ts
import { CordError } from '@flouviahq/elements/react'; // o '@flouviahq/elements'

try {
  await cord.quotes.create(data);
} catch (err) {
  if (err instanceof CordError) {
    console.log(err.status, err.code, err.message);
    // err.code: 'invalid_request' | 'missing_key' | 'invalid_key' | 'insufficient_scope'
    //         | 'missing_origin' | 'unauthorized_origin' | 'invalid_origin' | 'rate_limited'
    //         | 'clients_require_proxy' | 'network_error' | 'server_error' | 'unknown'
  }
}
```

---

## Motor de cálculo (`engine`)

El mismo motor que usa el backend de Cord para subtotal/IVA/total — úsalo si construyes tu
propia UI y necesitas paridad exacta con lo que el servidor va a calcular.

```ts
import { calculateTotals, roundMoney } from '@flouviahq/elements';

const { subtotal, iva, total } = calculateTotals(
  [{ cantidad: 2, precio_unitario: 100 }],
  0.16,   // ivaPct — debe estar en [0, 1] o lanza RangeError (nunca cae a un default silencioso)
  false,  // ivaIncluido
);

roundMoney(total, 2); // solo para MOSTRAR — nunca se aplica dentro de calculateTotals
```

---

## TypeScript

Los tipos se **generan** desde el código fuente (`tsc --emitDeclarationOnly`) — no se escriben
a mano, así que nunca quedan desincronizados de lo que el paquete realmente exporta. Funciona
en ESM y CJS (`node16`/`nodenext`/`bundler`) y con la resolución `node10` de TypeScript
clásico.

## Changelog

Ver [CHANGELOG.md](./CHANGELOG.md) — incluye la tabla de migración a 1.0.0.
