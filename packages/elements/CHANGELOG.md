# Changelog

Todos los cambios notables de `@flouviahq/elements` se documentan aquí.

## [1.0.0] — sin publicar

Reescritura mayor para llevar el SDK al nivel de Stripe Elements / Clerk Elements.
Motivada por una auditoría real (integración en un cliente externo, "El Zarco") que
encontró: 3 `@ts-ignore` por tipos incompletos, un componente reescrito a mano (286
líneas) porque los estilos inline no se podían sobreescribir, un botón "Abrir en pestaña
nueva" porque el iframe perdía la marca sin `<CordProvider>`, datos de cliente perdidos en
silencio, y una respuesta de API cuyo campo `folio`/`token` siempre llegaba `undefined`.

**Ninguno de estos cambios requiere un paquete nuevo ni un scope nuevo** — sigue siendo
`@flouviahq/elements`, mismo nombre en npm, mismos entrypoints.

### ⚠️ Breaking changes — tabla de migración

| Antes | Ahora | Qué hacer |
|---|---|---|
| `types/*.d.ts` escritos a mano (10 de 11 exports de `./react` sin tipos) | Tipos **generados** desde `src/` vía `tsc` | Nada — si tenías `@ts-ignore` por esto, bórralos. |
| `CordAppearance.rules` (tipado, pero el servidor lo descartaba) | Campo eliminado | Si lo usabas, no tenía efecto — no hay migración real. |
| `CordCotizadorProps.onEvent?: (type: string, detail) => void` | `onEvent?: (event: CordEvent) => void` | `onEvent={(type, detail) => ...}` → `onEvent={(event) => { const { type, detail } = event; ... }}` |
| Inline styles en `<CordBuilder>` y sus slots | Clases estables `.cord-*` (en `@layer cord`) | Si dependías del look exacto anterior, pásalo vía `appearance.variables`/`appearance.elements`. |
| `useCordClients()` intentaba fetch en modo publishable (y recibía 403 en silencio) | Falla ruidoso y tipado (`CordError` con `code: 'clients_require_proxy'`), sin red | Pasa `clients` como prop, o usa `proxyUrl`. |
| `CordProviderProps` aceptaba `publishableKey` y `proxyUrl` a la vez | Unión discriminada — pasar ambos es error de compilación | Elige uno. Si tenías los dos "por si acaso" (como El Zarco), quita el que no usas de verdad. |
| `result.folio`/`result.token` de `useCreateQuote()`/`CordAPI.quotes.create()` | Desenvuelven `{ data }` — ya no son `undefined` | Si tenías un workaround leyendo `result.data.folio`, quítalo. |
| `CreateQuoteResponse.link_publico` relativo (`/q/abc`) | Absoluto (`https://cordhq.app/q/abc`) | Si concatenabas tu propio dominio, ya no hace falta. |
| `CordWebhooks#constructEvent` devolvía `{ type, data, created }` (mentira — `evt.type`/`evt.created` SIEMPRE `undefined`) | `{ event, created_at, data }` (la forma real) | `evt.type` → `evt.event`; `evt.created` → `evt.created_at`. |
| Un solo `X-Cord-Signature` sin timestamp (sin protección anti-replay) | Doble firma: `X-Cord-Signature` (intacta) + `X-Cord-Signature-V1` (con timestamp) | Nada si usas `constructEvent` del SDK. Si verificabas a mano, sigue funcionando con la legacy — considera migrar a V1. |
| `data-cord-cotizador` + `data-token` en `embed.js` | `data-cord-token` (mismo vocabulario que Webflow) | El par legacy sigue funcionando (embeds ya publicados no se rompen). |

### Added

- **Tipos generados, no escritos** (`tsc --emitDeclarationOnly`) + anti-deriva:
  `scripts/check-exports.mjs` compara los exports reales del bundle contra un snapshot
  committeado (`api-report.json`) — falla si divergen.
- `configureCord({ baseUrl, appearance, publishableKey })` — configuración global estilo
  `loadStripe`, para Vue/Web Component/vanilla sin `<CordProvider>`.
- `CordProviderProps.ivaPct` — configura el % de IVA una vez, en el Provider, en vez de
  por instancia del Builder (evita que el total del Builder diverja del real).
- `theme: 'dark' | 'auto'` funciona de verdad, tanto en el iframe (`CordCotizador`) como
  en los componentes nativos (`CordBuilder`), con paleta oscura default y reacción en vivo
  a `prefers-color-scheme` cuando es `'auto'`.
- `appearance.baseTheme: 'none'` — headless real: cero CSS de Cord, clases `.cord-*` intactas.
- `appearance.elements` (`CordElements`) — override por elemento interno, estilo
  `appearance.elements` de Clerk. Ver README.
- `useQuoteBuilder()` — el estado completo del Builder como hook standalone (sin
  `<CordBuilder>` de por medio). `<CordBuilder>` ahora es un consumidor delgado de este hook.
- Eventos tipados como unión discriminada (`CordEvent`) + callbacks nuevos: `onViewed`,
  `onSigned`, `onItemComment`.
- `CreateQuoteInput.cliente` — cotizar a un cliente NUEVO (find-or-create acotado: solo
  crea, nunca actualiza uno existente; queda marcado `origen: 'embed'` para tu revisión).
- Errores tipados (`CordError` con `.status`/`.code`/`.payload`, `CordErrorCode`) en todos
  los hooks y en `CordAPI`.
- `roundMoney()` en el motor de cálculo — redondeo SOLO para mostrar, nunca afecta
  `calculateTotals` (que sigue exacto a lo que guarda el servidor).
- Validación de prefijo: `<CordProvider>` lanza si `publishableKey` no empieza con `pk_`
  (atrapa el error más caro posible: pegar una `sk_` en el navegador).
- `CordWebhooks#constructEventAsync` — verifica con WebCrypto para runtimes edge/workers.
- `constructEvent`/`constructEventAsync` aceptan un `Headers` real o `Record<string,string>`
  (mejor DX que solo el string crudo del header).
- `.github/workflows/elements.yml` — CI: `tsc` → build → `check-exports` → `attw` → `publint`.
- Shims de compatibilidad `node10` (resolución clásica de TypeScript) para `./react`,
  `./vue`, `./framer`, `./webflow`, `./server`.

### Fixed

- **El sobre de respuesta nunca se abría**: toda ruta `/api/v1/*` envuelve en `{ data }`,
  pero `useCreateQuote`/`CordAPI.fetch` no lo desenvolvían — `result.folio` era SIEMPRE
  `undefined`, en el hook y en el Server SDK.
- `<CordCotizador>` sin `<CordProvider>` en el árbol **truena** (`useCordTranslations()`
  llamaba `useCordContext()`, que lanza sin Provider) — ahora funciona standalone de verdad.
- Appearance rancia: `<CordCotizador>` no reaccionaba a cambios de `appearance` después del
  primer render (las deps del `useEffect` no la incluían).
- `<CordProvider appearance>` no tenía `baseUrl` en sus props — imposible apuntar a
  self-host/staging desde el Provider (línea muerta: `props.baseUrl || (context?.proxyUrl ?
  undefined : undefined)` siempre daba `undefined`).
- 5 `baseUrl` hardcodeados a `https://cordhq.app` en distintos archivos — unificados
  en `resolveOrigin()`/`resolveApiBase()` (`config.ts`).
- `CordProduct.categoria` — referencia a un campo que el backend nunca devuelve (dead code
  en el dropdown de productos, eliminado).
- `class CordCotizadorElement extends HTMLElement` a nivel de módulo tronaba con
  `ReferenceError` al importar el paquete desde Node/SSR (sin DOM) — incluso sin instanciar
  nada. Afectaba el entrypoint `.` completo.
- `webflow.ts` ejecutaba `initWebflow()` (toca `document`) a nivel de módulo — mismo tipo de
  crash en SSR, ahora guardado por `typeof document !== 'undefined'`.
- `engine.ts`: `ivaPct` fuera de `[0,1]` (o `NaN`) ahora lanza `RangeError` en vez de
  producir un total silenciosamente incorrecto — este motor lo importa el servidor
  directamente para calcular dinero real.
- `postMessage(..., '*')` en `/embed/[token]` — ahora usa el `parentOrigin` real cuando
  coincide con la allowlist de `orgs.embed_domains` (mismo gate que ya protege
  `frame-ancestors`); sin allowlist o sin match, sigue en `'*'` (sin regresión).
- `.endsWith('/create')` para adivinar los endpoints de catálogo/clientes desde el proxy de
  creación — reemplazado por una política explícita: catálogo vía publishable key (endpoint
  público real), clientes vía `proxyUrl` como base o prop explícita.
- `cord:item_comment` se emitía en `QuoteCard` pero el relay del iframe no lo reenviaba —
  se perdía en silencio antes de llegar a ningún SDK.
- `X-Cord-Signature-V1`: anti-replay real con timestamp (antes el parámetro `tolerance` de
  `constructEvent` existía pero la validación estaba comentada — cualquier firma vieja capturada
  se podía re-enviar para siempre).

## [0.6.3] — 2026-07-06

### Fixed
- `CordBuilder`: reemplazado `alert()` nativo por un estado de error inline; ícono SVG en
  vez de emoji en el botón de eliminar línea.
- `useCordCatalog`/`useCordClients`: primer intento de golpear `/productos`/`/clientes` de
  forma más robusta (aún con el `.endsWith('/create')` frágil, corregido del todo en 1.0.0).
- `CordWebhooks`: parseo correcto del formato `sha256=<hmac>`; comparación de firma en
  tiempo constante vía `crypto.timingSafeEqual`.

## [0.5.0] y anteriores

Evolución del SDK desde un wrapper de iframe simple hasta una infraestructura con:
Web Component nativo + wrappers de React/Vue/Framer/Webflow, patrón compound (`CordBuilder`
con slots), hooks headless (`useCordCatalog`/`useCordClients`/`useCreateQuote`), llaves
publishable/secret (`pk_`/`sk_`), motor de cálculo compartido con el backend (`engine.ts`),
y Server SDK con verificación de webhooks. El detalle línea-por-línea de este tramo no se
reconstruyó aquí con precisión de commit — ver `docs/historial.md` del repo `flouvia-cord`
para el registro narrativo completo de esa etapa.
