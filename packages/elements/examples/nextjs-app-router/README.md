# Ejemplo — Next.js App Router (Elements 2.0)

Archivos de referencia para copiar y adaptar. CI los compila contra el código real de
`@flouviahq/elements` y `@flouviahq/node` (`tsconfig.json` de esta carpeta), así que no se
quedan atrás del SDK.

| Archivo | Qué demuestra |
|---|---|
| `app/layout.tsx` | `<CordProvider proxyUrl="/api/cord">` con appearance y la barra de depuración en desarrollo. |
| `app/api/cord/[...path]/route.ts` | El proxy con `createElementsProxy`: la `sk_` nunca llega al navegador y el CRM solo se expone con tu sesión. |
| `app/api/webhooks/cord/route.ts` | Verificación con `constructEvent` y el tipo exacto de `data` por evento. |
| `app/cotizaciones/nueva/QuoteBuilderClient.tsx` | `<CordBuilder fiscal ai>`: datos fiscales del cliente y partidas con IA desde un pedido, foto o PDF. |
| `app/cotizaciones/nueva/HeadlessBuilder.tsx` | La misma pantalla con tu propia UI sobre `useQuoteBuilder()`: impuesto por línea, totales del motor de Cord y validación. |
| `app/cotizaciones/[token]/page.tsx` | `<CordCotizador>` con estado en vivo (`onStateChange`). |

`shims/` solo existe para el typecheck: reemplaza `@/lib/tu-propio-crm` y `@/lib/tu-propia-sesion`
por tu código real.

Para probar de punta a punta sin desplegar: `cord listen --forward-to http://localhost:3000/api/webhooks/cord`
y `cord trigger quote.paid`.
