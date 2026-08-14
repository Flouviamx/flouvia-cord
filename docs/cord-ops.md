# Cord Ops

> Estado actual de la consola administrativa privada. El historial de seguridad,
> fixes y decisiones vive en [`historial-infra-hitos.md`](historial-infra-hitos.md).

`ops.cordhq.app` es la consola privada de Cord. Solo
`andrevalleo13@gmail.com` y `hola@flouvia.com` pueden ser operadores: el correo
debe coincidir tanto con la allowlist compilada como con una fila activa en
`ops_operators`.

## Identidad y seguridad

- Producción exige passkey o contraseña más TOTP. Localhost exige una sesión Cord
  vigente del mismo usuario y contraseña. Una sesión normal nunca autoriza Ops.
- Usa cookie y tablas de sesión separadas, token SHA-256, una sesión por operador,
  30 minutos de inactividad, máximo absoluto de 8 horas, enlace al User-Agent,
  CSRF de origen exacto, CSP propia, `no-store`, `noindex`, cero analytics y
  auditoría privilegiada.
- Cambiar la contraseña, suspender la cuenta, desactivar TOTP o eliminar la passkey
  exacta que creó la sesión revoca las sesiones afectadas.
- Login y API Ops fallan cerrados si no existe un rate limit durable. El orden es
  Upstash, si está configurado; después `rate_limit_counters` en Neon; finalmente
  cerrado. No vuelvas a convertir un solo proveedor en requisito duro de una
  superficie fail-closed: cuando Upstash no se provisionó, Ops, reembolsos,
  disputas, reauth y Connect devolvieron 503 en producción.

## Superficies y acciones

Rutas principales:

- `/ops`
- `/ops/users`
- `/ops/organizations`
- `/ops/usage`
- `/ops/database`
- `/ops/security`

Incluyen fichas de usuario, organización y tabla. Las acciones reales permiten
suspender, restaurar o eliminar usuarios no protegidos; revocar sesiones o API
keys; desactivar webhooks; cerrar sesiones de equipos; y eliminar organizaciones
no protegidas.

Toda mutación sensible exige confirmación y escribe `ops_audit_log` en la misma
transacción.

El explorador de base redacta hashes, contraseñas, TOTP, tokens, llaves,
certificados, CLABE y cuerpos sensibles. Esos campos tampoco pueden buscarse.

## Consumo y cuotas

`/ops/usage` vigila superficies con costo:

- cuotas de IA, API y CFDI;
- tokens Anthropic y correos Resend;
- errores API y reintentos de webhooks;
- volumen Stripe y tamaño de Neon.

Alerta al 80% y al 100% de cuota. `external_usage_events` usa RLS por organización
y nunca guarda prompts, destinatarios, payloads, respuestas ni secretos. Los
importes finales siempre se verifican en el dashboard del proveedor.

REST v1 y MCP comparten el control de API: rate limit por llave, cuota mensual con
`checkQuota()` y medidor con `reportUsage()`. Free corta al alcanzar la cuota; los
planes con excedente cortan en un techo de seguridad de diez veces lo incluido.

## UI y escala

La interfaz es Apple/Cord clara, con CSS vanilla y microinteracciones breves. Toda
animación respeta `prefers-reduced-motion`; los avatares usan centrado geométrico.

Objetivo: operar con más de 10,000 usuarios y organizaciones sin cargar colecciones
completas.

- Usuarios, organizaciones, consumo y auditoría son páginas SSR de 50 filas con
  filtros GET compartibles.
- `ops-list-queries.ts` agrega estadísticas solo para los ids visibles.
- `/ops/usage` calcula totales globales por separado, busca organizaciones en
  servidor y limita el inbox a las 50 cuentas de mayor riesgo.
- No renderices un `<select>` con todas las organizaciones ni uses subconsultas
  correlacionadas por fila.
- El explorador usa cursor `created_at/id` y estimaciones de `pg_class`; no
  reintroduzcas `OFFSET` profundo ni `COUNT(*)` por página.
- La búsqueda de usuarios y organizaciones depende de `pg_trgm` y de los índices
  declarados en `db/schema.sql`.

## Limpieza pre-lanzamiento

`scripts/cleanup-non-ops-data.mjs` hace dry-run por defecto y solo muta con
`--execute` explícito. No debe volver a ejecutarse cuando existan usuarios reales
sin una revisión manual previa.

