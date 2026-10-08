# Cord Ops

> Estado actual de la consola administrativa privada. El historial de seguridad,
> fixes y decisiones vive en [`historial/infra-hitos.md`](../historial/infra-hitos.md).

`ops.cordhq.app` es la consola privada de Cord. Solo
`andrevalleo13@gmail.com` y `hola@flouvia.com` pueden ser operadores: el correo
debe coincidir tanto con la allowlist compilada como con una fila activa en
`ops_operators`.

## Identidad y seguridad

- Producción exige passkey de Ops o contraseña más TOTP. Localhost exige una sesión
  Cord vigente del mismo usuario y contraseña. Una sesión normal nunca autoriza Ops.
- Las passkeys de Ops viven en `ops_passkeys`, con rpID `ops.cordhq.app`. Las de la
  app (`passkeys`, rpID `cordhq.app`) no abren Ops. Una passkey de Ops se registra
  solo desde `/ops/security`, con una sesión Ops de menos de 10 minutos, y cada
  alta avisa por correo.
- El bloqueo por intentos es propio de Ops (`ops_operators`), separado del login de
  la app: contraseña (10 fallos → 15 min, siempre 401 genérico) y TOTP (5 fallos →
  1 h y correo de alerta). Acertar la contraseña no reinicia nada; solo un acceso
  completo limpia los contadores. Cada paso TOTP se acepta una sola vez.
- Eliminar usuarios u organizaciones y gestionar passkeys exige una autenticación
  fuerte de menos de 10 minutos (`requireFreshOpsAuth`); si no, la API responde
  428 y la interfaz ofrece volver a entrar.
- Usa cookie y tablas de sesión separadas, token SHA-256, una sesión por operador,
  30 minutos de inactividad, máximo absoluto de 8 horas, enlace al User-Agent,
  CSRF de origen exacto, CSP propia, `no-store`, `noindex`, cero analytics y
  auditoría privilegiada.
- Cambiar la contraseña, suspender la cuenta, desactivar TOTP o eliminar la passkey
  de Ops exacta que creó la sesión revoca las sesiones afectadas.
- `ops_audit_log` es de solo agregar: un trigger bloquea UPDATE, DELETE y TRUNCATE
  (salvo el `set null` del operador) y `cord_app` no tiene esos permisos.
- Login y API Ops fallan cerrados si no existe un rate limit durable. El orden es
  Upstash, si está configurado; después `rate_limit_counters` en Neon; finalmente
  cerrado. No vuelvas a convertir un solo proveedor en requisito duro de una
  superficie fail-closed: cuando Upstash no se provisionó, Ops, reembolsos,
  disputas, reauth y Connect devolvieron 503 en producción.

## Superficies y acciones

Rutas principales:

- General: `/ops` (resumen) y `/ops/activity` (actividad).
- Negocio: `/ops/organizations`, `/ops/users`, `/ops/invoices`,
  `/ops/workflows` y `/ops/integrations`.
- Plataforma: `/ops/usage`, `/ops/status`, `/ops/security` y `/ops/database`.

Incluyen fichas de usuario, organización y tabla. Las acciones reales permiten
suspender, restaurar o eliminar usuarios no protegidos; revocar sesiones o API
keys; desactivar webhooks; cerrar sesiones de equipos; y eliminar organizaciones
no protegidas. Solo el rol `admin` ve y ejecuta acciones; `read_only` no ve los
botones y la API le responde 403.

- Toda acción sobre una organización exige escribir su nombre.
- Suspender revoca además los permisos OAuth de la persona (con su llave de acceso)
  y las llaves que acuñó `cord login`. Las llaves de API de la organización no se
  tocan: son del negocio.
- Eliminar una organización cancela primero su suscripción (`releaseOrgBilling()`,
  compartido con el borrado desde la app); si no se puede cancelar, no se borra
  nada. Una cuenta Connect viva queda anotada en la bitácora para revisión manual.

Las políticas del carril `ops` son por comando: SELECT donde Ops lee y UPDATE solo
donde revoca (`api_keys`, `webhooks`, `oauth_grants`). Ops no puede insertar filas
dentro de una organización.

`/ops/status` muestra las sondas de disponibilidad y permite redactar en
español e inglés un incidente público real. El formulario acepta el estado
inicial —un incidente que ya terminó se registra directo como `resolved` con su
fin real— y valida en servidor que inicio y fin no estén en el futuro y que el
fin no sea anterior al inicio; cada error nombra el campo que falla y toda falla
de base responde JSON legible, nunca un 500 mudo. Ops lista todos los
incidentes, no solo los que caben en la ventana pública, y permite editarlos.

Datos de negocio (sep 2026):

- `/ops` resume personas, organizaciones, cotizaciones, facturas, pagos,
  workflows e integraciones; grafica 30 días de eventos, personas activas y
  altas; y arma "Requiere atención" con sondas en falla, integraciones con
  error, workflows fallidos, facturas vencidas o con error fiscal, pagos
  fallidos y cobros restringidos por el procesador.
- `/ops/activity` es el registro de `domain_events` de todas las
  organizaciones, filtrable por categoría, organización (`?org=`) y persona
  (`?user=`), con los inicios de sesión recientes.
- `/ops/invoices`, `/ops/workflows` e `/ops/integrations` listan Cord
  Invoicing, las ejecuciones de workflows y las conexiones externas con sus
  fallas recientes. Ops nunca selecciona los tokens cifrados de una integración.
- Todo importe se muestra con su divisa y los totales se agrupan por divisa
  (regla 21): Ops no suma MXN con USD en un mismo número.

Las lecturas viven en `src/lib/ops-insights.ts` y viajan en `withOpsTx`. Las
tablas que Ops lee y que no admitían `app.scope='ops'` (facturas, pagos,
workflows, integraciones, eventos, consumo) tienen una política `ops_<tabla>`
solo `for select` en `db/migrations/2026-09-30-ops-lectura.sql`: sin ella esas
pantallas quedarían vacías al activar `cord_app`.

Disponibilidad (sep 2026): `src/lib/platform-health.ts` mide nueve componentes
reales —app (render de `/sign-in`), API pública (401 tipado de `/api/v1/me`),
link público (`/q/demo`), núcleo de datos, Stripe, confirmación de pagos
(con cobros pendientes y sin webhook reciente, se pregunta a Stripe si alguno ya
se cobró sin que Cord lo registrara), timbrado fiscal,
correo e IA— y los guarda en `health_checks`. Fiscal, correo e IA se omiten si
el entorno no tiene su llave: nunca se registra un fallo inventado. El muestreo
es horario vía `.github/workflows/status-probe.yml` (requiere el secret
`CRON_SECRET` en GitHub, mismo valor que en Vercel); el cron diario de
`vercel.json` queda de respaldo. `status.cordhq.app` pinta 90 días por
componente: un día sin muestras es gris, nunca verde. Crear, editar o cambiar su estado
exige rol `admin`, no permite borrarlo desde la interfaz y escribe
`ops_audit_log` en la misma transacción.

Toda mutación sensible exige confirmación y escribe `ops_audit_log` en la misma
transacción.

El explorador de base es solo para `admin`, lee en `withOpsTx` y audita cada vista
en la misma transacción. Redacta por nombre (hashes, `*_enc`, contraseñas, TOTP,
tokens, llaves, certificados, CLABE, URLs de webhook, códigos OAuth y de CLI) y por
tipo: todo `jsonb`/`bytea` se oculta salvo una lista corta de configuración. Esos
campos tampoco pueden buscarse. `test/ops-database.test.ts` lee las columnas
reales del schema para que una columna nueva no nazca visible.

El contrato completo lo verifica `npm run security:ops`.

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

La interfaz es Apple/Cord, con CSS vanilla y microinteracciones breves. Toda
animación respeta `prefers-reduced-motion`; los avatares usan centrado geométrico.

- Todo color sale de un token `--ops-*` en `src/styles/ops.css`. Hay modo oscuro:
  sigue al sistema o a la cookie `cord_ops_theme`, que el layout lee en servidor
  (la CSP de Ops no admite un script inline en `<head>`). Un hex suelto en un
  componente rompe el modo oscuro. `--ops-ghost` no es para texto: no pasa AA.
- La barra superior muestra migas, el tiempo restante del tope de 8 h y el
  selector de tema. Bajo 880 px la navegación es un cajón táctil (regla 16).
- Los iconos salen del registro (`iconInner`). Ops no carga imágenes de terceros:
  las integraciones usan monogramas (`opsProviderMark`).
- Las gráficas son SVG propio (`OpsBars`, `OpsSpark`): comparan contra el periodo
  anterior, y el detalle de cada día se abre con puntero, toque o teclado. El
  periodo viaja en `?range=7d|30d|90d` (`src/lib/ops-range.ts`).
- `/ops/status` dibuja 90 días por componente; un día sin muestras es gris.

## Herramientas de operador

- **Búsqueda global (⌘K o `/`).** `OpsCommand.astro` navega, ejecuta acciones y
  consulta `/api/ops/search`. Esa ruta busca organizaciones, personas, folios de
  cotización y números de factura (prefijo, con índices `text_pattern_ops`), y
  resuelve exacto un UUID pegado. Va en `withOpsTx`, con 5 resultados por grupo
  y sin tokens ni datos de pago. Los resultados se pintan con `textContent`:
  un nombre de organización lo escribe su dueño.
- **Atajos (solo escritorio, regla 16).** `g` + letra navega (`r` Resumen,
  `a` Actividad, `o` Organizaciones, `u` Usuarios, `f` Facturas, `w` Workflows,
  `i` Integraciones, `c` Uso y costos, `d` Disponibilidad, `s` Seguridad,
  `b` Base de datos), `j`/`k` recorren las filas de una tabla marcada con
  `data-ops-rows` y `?` muestra la ayuda. Bajo 880 px no hay atajos ni `<kbd>`;
  la paleta se abre con el botón de la barra superior.
- **Filtros.** Organizaciones (plan, país, suscripción, cobros en línea, orden)
  y usuarios (estado, MFA, orden). `src/lib/ops-filters.ts` es el parser único:
  todo valor sale de una lista cerrada y viaja como parámetro. Las métricas de
  la cabecera son del filtro completo, no de la página visible.
- **Vistas guardadas.** Combinaciones de filtros con nombre, por operador y por
  navegador (`localStorage`). Son una comodidad personal: no se comparten y la
  barra funciona igual si el almacenamiento no está disponible.
- **Exportar CSV.** `/api/ops/export` usa el mismo parser que la pantalla, es
  solo para `admin`, tiene tope de 10,000 filas y escribe `ops.list_exported` en
  la misma transacción que la lectura. `src/lib/ops-csv.ts` neutraliza fórmulas
  (`= + - @`, tab y CR) y agrega BOM para Excel.

Objetivo: operar con más de 10,000 usuarios y organizaciones sin cargar colecciones
completas.

- Usuarios, organizaciones, consumo y auditoría son páginas SSR de 50 filas con
  filtros GET compartibles. Los totales de cabecera se calculan con el filtro en
  una consulta aparte, sin `count(*) over()` por fila.
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
