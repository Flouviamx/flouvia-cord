# Changelog

## [1.0.0] — sin publicar

Primera versión. Reemplaza a `@flouviahq/elements/server`.

- API v1 completa: cotizaciones (crear, enviar, aprobar, rechazar, marcar pagada, borrar, borrador desde texto), clientes, productos, facturas (crear, emitir, enviar, anular, registrar pago, nota de crédito), cobranza, eventos, tareas, endpoints de webhook y configuración de Elements.
- Autopaginación por offset y por cursor (`listAll()` con `for await`).
- `Idempotency-Key` automática en toda mutación, la misma en cada reintento; reintentos con backoff y `Retry-After`; timeouts; errores con `code`, `requestId` y `docUrl`.
- `constructEvent` con WebCrypto (Node, Bun, Deno, edge). Exige la firma V1 con timestamp; la legacy solo con `allowLegacySignature`.
- `createElementsProxy` para el modo `proxyUrl` de Elements.
- Tipos de los 41 eventos de webhook desde el contrato que usa Cord para emitirlos.
