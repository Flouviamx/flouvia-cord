# Ejemplo — Next.js App Router

Referencia de integración de `@flouviahq/elements`, modelada sobre una integración real
(un cliente de Cord, "El Zarco") **quitando cada uno de los workarounds** que tuvo que
escribir contra el SDK viejo. No es una app ejecutable con su propio `package.json` —
son archivos de referencia para copiar/adaptar.

| Archivo | Qué demuestra |
|---|---|
| `app/layout.tsx` | `<CordProvider>` en el layout raíz — fuente única de config (modo, appearance, ivaPct). |
| `app/api/cord/cotizaciones/route.ts` | El proxy server-side (modo `proxy`, `sk_...` nunca expuesta al navegador). |
| `app/cotizaciones/nueva/page.tsx` | Server Component — trae `catalog`/`clients` de tu backend. |
| `app/cotizaciones/nueva/QuoteBuilderClient.tsx` | `<CordBuilder>` styled, con `catalog`/`clients` recibidos como prop (sin fetch redundante). |
| `app/cotizaciones/nueva/HeadlessBuilder.tsx` | La MISMA pantalla, pero con `useQuoteBuilder()` + tu propia UI (el patrón que la integración real tuvo que reconstruir a mano en 286 líneas — aquí es de primera clase). |
| `app/cotizaciones/[token]/page.tsx` | `<CordCotizador>` heredando appearance del Provider (sin el botón "Abrir en pestaña nueva" — nunca hizo falta). |
| `app/api/webhooks/cord/route.ts` | Verificación de webhooks con `constructEvent` + `req.headers` real. |

`@flouviahq/elements/react` trae su propia directiva `'use client'` (ver
`src/react.tsx`) — no hace falta agregarla tú mismo solo para usar
`CordProvider`/`CordBuilder`/`CordCotizador`. Sí la necesitas en tus PROPIOS
archivos si usan hooks de Next.js como `useRouter()` (ver `QuoteBuilderClient.tsx`).

## Lo que YA NO hace falta (vs. la integración real que motivó el rediseño)

- Cero `@ts-ignore` — los tipos de `./react` cubren `CordProvider`, `CordBuilder`,
  `useBuilderContext`, `useQuoteBuilder` y los hooks, no solo `CordCotizador`.
- Cero reescritura de `CordBuilder.Items` — el estilo se ajusta con `appearance.elements`
  y clases normales (Tailwind aquí), no reescribiendo el componente entero.
- `proxyUrl` y `publishableKey` nunca conviven — la unión discriminada de
  `CordProviderProps` lo hace un error de compilación si lo intentas.
- `result.folio`/`result.token` llegan definidos — el servidor los devuelve desenvueltos
  del sobre `{ data }`, y `link_publico` ya viene absoluto.
- `<CordCotizador>` en `app/cotizaciones/[token]/page.tsx` hereda la `appearance` del
  Provider — no hace falta un botón de escape "ábrelo en Cord directamente".
