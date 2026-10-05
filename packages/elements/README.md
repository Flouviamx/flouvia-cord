# @flouviahq/elements

SDK de [Cord](https://cordhq.app) para el navegador: el cotizador embebible en Shadow DOM,
un Builder headless que dibuja lo que tu organización tiene configurado en Cord (divisas,
impuestos por línea, retenciones, términos) y un Fiscal Element que valida RFC, NIF/CIF y
EIN igual que el servidor. Web Components + React, Vue, Framer y Webflow sobre un mismo
núcleo sin framework (`@flouviahq/elements/headless`).

Para tu servidor (API v1, webhooks, proxy) usa [`@flouviahq/node`](https://www.npmjs.com/package/@flouviahq/node).

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
      onPay={(d) => console.log('Pago abierto en', d.url)}
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

Una `pk_live_` solo funciona con dominios permitidos configurados en Ajustes › Elements: la
key exige el header `Origin`/`Referer` y lo valida contra esa lista (`origin_allowlist_required`
si está vacía). Las `pk_test_` funcionan desde cualquier origen, incluido `localhost`. Una
cotización creada con `pk_` queda como borrador para que la revises: no puede enviarse por
correo ni fijar costos o precios negociados.

### Modo `proxy` — tu propio backend

```tsx
<CordProvider proxyUrl="/api/cord">
```

`proxyUrl` es una **base** con la misma forma que `/api/v1`: el SDK pide
`{proxyUrl}/elements/config`, `{proxyUrl}/productos`, `POST {proxyUrl}/cotizaciones` y, si
tu servidor lo autoriza, `{proxyUrl}/clientes`. No lo escribas a mano: monta
`createElementsProxy()` de `@flouviahq/node`, que solo atiende esas rutas, solo desde tu
origen, y sanea la cotización igual que una llave publicable.

```ts
// app/api/cord/[...path]/route.ts
import { createElementsProxy } from '@flouviahq/node';
const proxy = createElementsProxy({ secretKey: process.env.CORD_SECRET_KEY!, authorizeClients: (req) => isLoggedIn(req) });
export const GET = proxy;
export const POST = proxy;
```

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
`https://cordhq.app`**.

---

## Headless: el núcleo sin framework

Todo el estado vive en `@flouviahq/elements/headless`, sin React, sin Vue y sin tocar el DOM
al importarse. Los componentes de este paquete son consumidores de ese núcleo; tú también.

```ts
import { createCordClient, createQuoteBuilder } from '@flouviahq/elements/headless';

const builder = createQuoteBuilder({ client: createCordClient({ publishableKey: 'pk_test_…' }) });
builder.subscribe((s) => render(s));          // s.config, s.items, s.totals, s.issues, s.status
builder.addProduct(builder.get().products[0], 2);
builder.updateItem(key, { tax_rate: 0 });     // solo tasas de s.config.impuestos.opciones
await builder.submit();                       // un doble clic nunca crea dos cotizaciones
```

- La configuración (divisas ofrecidas, impuestos por línea, retenciones, términos, nombre
  del impuesto) llega de `GET /api/v1/elements/config` con ETag. Cambias algo en Ajustes y
  tu sitio lo refleja sin republicar.
- Los totales salen de `calculateDocumentTotals`, el mismo motor con el que Cord guarda.
- `submit()` usa una sola `Idempotency-Key` por intento: reintentos y doble clic no duplican.

### En React — `useQuoteBuilder`

```tsx
import { useQuoteBuilder } from '@flouviahq/elements/react';

function MiBuilder() {
  const { items, totals, config, builder, formatMoney, issueFor, status } = useQuoteBuilder({
    onQuoteCreated: (q) => router.push(q.link_publico),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); builder.submit(); }}>
      {items.map((it) => (
        <select key={it.key} value={String(it.tax_rate)} onChange={(e) => builder.updateItem(it.key, { tax_rate: Number(e.target.value) })}>
          {config?.impuestos.opciones.map((o) => <option key={o.label} value={String(o.rate)}>{o.label}</option>)}
        </select>
      ))}
      <strong>{formatMoney(totals.total)}</strong>
    </form>
  );
}
```

En Vue: `useCordQuoteBuilder(clientOptions)` devuelve `{ state, builder }`.

## Fiscal Element

Captura los datos fiscales del cliente con la misma validación que aplica Cord al guardar:
RFC con dígito verificador del SAT, régimen y uso de CFDI filtrados por persona física o
moral, 616/S01 para público en general y aviso cuando el nombre trae "S.A. de C.V."; NIF,
NIE o CIF en España; EIN en Estados Unidos.

```html
<form>
  <cord-fiscal-form name="fiscal" country="MX" lang="es"></cord-fiscal-form>
  <button>Guardar</button>
</form>
```

Es un elemento asociado a formularios: aporta su valor (JSON del receptor normalizado) bajo
`name` y bloquea el envío mientras haya errores, como un `<input required>`. Eventos
`fiscalchange` y `fiscalvalid`; partes `::part(field|label|input|error|warning)`.

En React: `<CordFiscalForm country="MX" onValid={(r) => …} />` o `<CordBuilder fiscal />`
para que el receptor viaje con la cotización. Headless: `createFiscalForm()`.

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
  onPay={(d) => {}}                       // { url } absoluta; Cord ya abre el pago en su ventana
  onUpdated={(d) => {}}                   // { subtotal, total, moneda } el vendedor cambió la propuesta
  onStatusChanged={(d) => {}}             // { status } paid | rejected | expired | invoiced
  onStateChange={(s) => {}}               // estado en vivo: ready, status, total, approved, paid
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
<script type="module" src="https://unpkg.com/@flouviahq/elements@2/dist/index.mjs"></script>

<cord-quote token="TU_TOKEN" appearance='{"theme":"auto","variables":{"colorPrimary":"#0a192f"}}'></cord-quote>

<script>
  const quote = document.querySelector('cord-quote');
  quote.addEventListener('approved', (e) => console.log('Firmó', e.detail.signed_by));
  quote.addEventListener('statechange', (e) => console.log(e.detail.status, e.detail.total));
</script>
```

Vive en Shadow DOM: tus estilos no lo rompen y los suyos no tocan tu página. Personaliza con
`cord-quote::part(frame)`, `::part(skeleton)` y las variables `--cord-*`. La sombra aísla
estilos; firmar y pagar siguen dentro del iframe de Cord, que es la frontera de seguridad.

Atributos: `token` (requerido), `base-url`, `min-height`, `appearance` (JSON; también como
propiedad). Propiedad `state` con el estado en vivo. Los eventos llegan sin el prefijo
`cord:`. `<cord-cotizador>` sigue funcionando como alias.

`<cord-invoice token="…">` monta la factura de `/i/{token}` con los mismos atributos y emite
además `paid`. El pago se abre en una ventana de Cord, nunca dentro del iframe. En React y Vue,
`<CordInvoice>`; en `embed.js`, `data-cord-document="invoice"`.

## Loader de una línea (`embed.js`) — sitios sin bundler

```html
<script src="https://cordhq.app/embed.js" async></script>
<div data-cord-token="TU_TOKEN"></div>
```

Atributos: `data-cord-token` (requerido), `data-cord-base-url`, `data-cord-min-height`,
`data-cord-appearance`. Monta también los bloques que se agregan después (SPAs, modales) y
re-emite los eventos `cord:*` sobre el div. `public/embed.js` se genera desde el mismo
código que `@flouviahq/elements/webflow`; el par legacy `data-cord-cotizador` + `data-token`
sigue funcionando.

## Framer

```tsx
import { FramerCordCotizador } from '@flouviahq/elements/framer';
```
Agrégalo como Code Component; `token` y `baseUrl` quedan expuestos en el panel de propiedades.

---

## Depuración

```tsx
<CordProvider publishableKey="pk_test_…" debug>
```

Aparece una barra flotante con cada evento del iframe, cada petición con su `request_id` y
los avisos de configuración (por ejemplo, un appearance descartado o una llave de prueba en
un dominio público). Vive en un Shadow DOM y no se dibuja con una `pk_live_`. En
`<cord-quote>` es el atributo `debug`; en `embed.js`, `data-cord-debug` (sin llave, solo en
`localhost` o con `?cord_debug=1`).

## Servidor

`@flouviahq/elements/server` está deprecado y se conserva por compatibilidad. Usa
[`@flouviahq/node`](https://www.npmjs.com/package/@flouviahq/node): API v1 completa con idempotencia y autopaginación,
`constructEvent` con WebCrypto que exige la firma V1 con timestamp, y el proxy para el modo
`proxyUrl`.

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
