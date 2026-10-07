# Changelog

## [1.1.0] — sin publicar

- `quotes.listAll()`, `clients.listAll()` y `products.listAll()` recorren por cursor: no saltan ni repiten registros aunque haya escrituras mientras paginas.
- `list()` de cotizaciones, clientes y productos acepta `cursor`, y `meta` trae `next_cursor` (con cursor, `offset` llega `null`). Pedir por `offset` sigue funcionando igual.
- `clients.list()` acepta `q` y `email`.

## [1.0.0] — 2026-10-05

Primera versión. Reemplaza a `@flouviahq/elements/server`.

- API v1 completa: cotizaciones (crear, enviar, aprobar, rechazar, marcar pagada, borrar, borrador desde texto), clientes, productos, facturas (crear, emitir, enviar, anular, registrar pago, nota de crédito), cobranza, eventos, tareas, endpoints de webhook y configuración de Elements.
- Autopaginación por offset y por cursor (`listAll()` con `for await`).
- `Idempotency-Key` automática en toda mutación, la misma en cada reintento; reintentos con backoff y `Retry-After`; timeouts; errores con `code`, `requestId` y `docUrl`.
- `constructEvent` con WebCrypto (Node, Bun, Deno, edge). Exige la firma V1 con timestamp; la legacy solo con `allowLegacySignature`.
- `createElementsProxy` para el modo `proxyUrl` de Elements, incluido el streaming de IA.
- Acepta llaves restringidas (`rk_live_`, `rk_test_`); los errores `insufficient_permissions`, `ip_not_allowed` y `key_expired` llegan como `CordError` con su `code`.
- `testHelpers` (solo `sk_test_`): resultado forzado de la próxima emisión fiscal, cliente abriendo el link, vencimiento y disparo de cualquier webhook.
- Manda `Cord-Version` (default `CORD_API_VERSION`, configurable con `apiVersion`).
- Tipos de los 41 eventos de webhook desde el contrato que usa Cord para emitirlos.
