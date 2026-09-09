# Modelo multi-tenant y RLS — Cord

> Modelo de aislamiento por organización: `org_id`, membresías, tablas
> multi-tenant, política RLS y 2FA en APIs de sesión. Documento de estado actual;
> los detalles cronológicos viven en [`../historial/README.md`](../historial/README.md).
>
> El mapa de rutas y superficies (landing, `/app`, API pública/MCP, legales) está
> en [`app-rutas.md`](app-rutas.md). El contrato de carriles de contexto es la
> regla 30 de [`../estandares-ingenieria.md`](../estandares-ingenieria.md); la
> activación del rol `cord_app` vive en `db/RUNBOOK-cord-app.md`.

## Multi-tenant

PK de relación = **`org_id`**; nunca `email_cliente`. Cada negocio registrado es una
`org`; su owner vigente se relaciona mediante `orgs.owner_id → users.id`.

La identidad es 100% propia (`users`, `sessions`) y el switcher usa la cookie
`cord_active_org`. `resolveOrgId()` en `src/lib/db.ts` solo honra esa cookie si el
usuario tiene una membresía activa en `org_members`; si no, la ignora. Después
resuelve la membresía activa más reciente, cae a una organización propia y, en el
primer acceso, crea la organización y siembra la membresía `owner` de forma
idempotente.

`org_members` contiene `org_id`, `user_id`, `email`, `rol`, `permisos`, `estado` y
el token hasheado de invitación. El owner tiene override total. Los permisos por
sección viven en `src/lib/permissions.ts`; `requirePerm(key)` aplica el gate en las
APIs correspondientes. Las invitaciones usan `/unirse/{token}` y se aceptan vía
`/api/equipo/join`. Invitar requiere un plan con equipo habilitado.

Para la migración desde Clerk, Argon2id, TOTP, passkeys, hashing de tokens y SSO,
consulta [`../historial/auth-clerk.md`](../historial/auth-clerk.md).

**Tablas** (`db/schema.sql`):
- `orgs` — el negocio (nombre, logo, datos fiscales en `fiscal_metadata`, `country_code`, `quote_prefix`, plan, Stripe IDs, `owner_id` → `users.id`, `parent_org_id` → sub-cuentas anidadas). **`sandbox_of uuid`** (jul 2026, índice único parcial): si no es null, esta fila ES la org SANDBOX espejo de otra — ver "Entorno de prueba REAL tipo Stripe" en `../historial/README.md`. `getActiveOrgId()` resuelve la sandbox del padre cuando la cookie `cord_test_mode` está activa (`resolveSandboxOrgId()` en `db.ts`, find-or-create idempotente).
- `users`/`sessions`/`oauth_accounts`/`passkeys`/`password_reset_tokens`/`email_verification_tokens`/`two_factor_challenges` (ago 2026) — núcleo de auth propio. `sessions.id`/`password_reset_tokens.id`/`org_members.token` guardan **sha256(token)**, nunca el valor crudo (que solo vive en la cookie/link, jamás se persiste). `users.suspended_at` bloquea centralmente cualquier método de autenticación y revoca sesiones desde Ops. Ver detalle completo en `../historial/auth-clerk.md`.
- `ops_operators`/`ops_auth_challenges`/`ops_sessions`/`ops_audit_log` (ago 2026) — carril de identidad privilegiada exclusivo de `ops.cordhq.app`. Allowlist en código + BD, passkey o contraseña con TOTP, cookie separada, tokens y retos hasheados, expiración corta y bitácora de acceso. Una sesión normal de Cord nunca autoriza Ops.
- `external_usage_events` (ago 2026) — telemetría RLS por organización para proveedores con costo variable. Registra proveedor, categoría, operación, unidades, tokens de entrada/salida y estado; nunca prompts, destinatarios, payloads, respuestas, llaves ni secretos. Complementa `uso_periodo`, `api_requests`, `webhook_deliveries` y `cotizacion_cobros` en `/ops/usage`.
- `health_checks`/`status_incidents` (ago 2026) — telemetría global de disponibilidad, separada de los datos multi-tenant. El cron autenticado registra éxito y latencia de Neon, Stripe y `/q/demo`; los incidentes solo nacen mediante una acción manual y auditada en `/ops/status`. No contienen datos de clientes ni incidentes sembrados.
- `productos` — catálogo de cada org
- `clientes` — a quién se cotiza (con `terminos_default` y `limite_credito`). `country_code`
  (ago 2026, nullable, sin default) = país del CLIENTE; `null` hereda el del emisor, así que
  la migración no reescribe ningún documento ya emitido. `direccion_line1/2`, `ciudad`,
  `region` completan la dirección del receptor que exige la factura (regla 25).
- `cotizaciones` — status `draft|sent|viewed|approved|rejected|expired|paid|invoiced` + `public_token` + `base_currency` y `fiscal_currency` para coberturas FX. `creado_por` (jul 2026, nullable) = `users.id` de quien la creó/duplicó — alimenta `/app/desempeno`. `retencion_total`/`retenciones_snapshot` (ago 2026) — retenciones congeladas al crear el documento, ver regla 23.
- `cotizacion_items` — líneas (permite línea libre sin producto; `precio_negociado` opcional). `tax_rate` (ago 2026, nullable, fracción 0–1) = tasa de ESA línea, snapshot al capturar; `null` = anterior al impuesto por línea (cae a la tasa de la org), `0` = exenta a propósito. Ver regla 23.
- `impuestos` — catálogo de tasas por organización. `kind` (`consumo|retencion|exento`, ago 2026) es la clasificación NEUTRA que decide la aritmética; `tipo` es el subcódigo local que solo México usa para el CFDI. `TAX_PRESETS` en `src/lib/countries.ts` siembra las tasas estándar del país al crear la cuenta (BR sin preset nacional a propósito; US tampoco tiene preset nacional pero `usStateTaxPresets()` siembra por estado en cuanto la cuenta declara `fiscal_metadata.region`). `retencion_base` (`'subtotal'|'impuesto'`, ago 2026) declara sobre qué se calcula cada retención — la ReteIVA de Colombia es 15% del IVA, no del subtotal. Constructor único de opciones en `src/lib/impuestos.ts` (`buildTaxOptions`); resolutor/validador de servidor en `src/lib/impuestos-db.ts` (`taxCatalogFor`, falla cerrado ante error de BD). Ver regla 23.
- `eventos` — timeline + "tu cliente vio la cotización" (**feature estrella**). `documento_id` (ago 2026, nullable) — mismo timeline para facturas independientes; ver `src/lib/fiscal/timeline.ts`. Regla 19: la vista se registra solo con actor `client` y solo la primera vez.
- `documentos_fiscales` — fuente canónica de las emisiones fiscales por país (reemplaza a la tabla legado `facturas_cfdi`). Conserva número, moneda, totales, snapshots inmutables de emisor/receptor/líneas, proveedor y llave de idempotencia. México usa el rail CFDI 4.0 de Facturapi; el resto puede emitir una factura comercial propia de Cord sin afirmar envío a la autoridad local. `retencion_total`/`retenciones_snapshot` y `recurrencia_id` (ago 2026, ver `documento_recurrencias` abajo).
- `invoice_sequences` — consecutivo atómico por `org_id + country_code + document_type`; RLS + FORCE evita cruces entre organizaciones y la llave única de `documentos_fiscales` evita duplicar una emisión por cotización.
- `documento_recordatorios` (ago 2026) — escalera de cobranza de una factura. Unicidad `(documento_id, etapa)`: cada etapa (`orgs.recordatorio_etapas`, default `-7,-1,3,7,14,30`) se manda UNA vez sin importar cuántas veces corra el cron. Se registra ANTES de mandar y se libera si el envío falla — al revés, un fallo entre el envío y la escritura repite el cobro.
- `documento_recurrencias` (ago 2026) — facturas recurrentes: guarda QUÉ se factura (`lineas_snapshot`, cadencia, día del mes topado en 28, días de crédito, `next_run_at`). Cada emisión congela sus propios importes; cambiar un precio del catálogo no reescribe lo ya emitido. Motor en `src/lib/fiscal/recurrencias.ts`, cron diario `/api/cron/recurrencias`. `next_run_at` avanza ANTES de emitir. Gate `recurring_invoices` en Pro.
- `cuentas_por_cobrar` (vista, ago 2026) — une cotizaciones y facturas con una forma común (`origen`, `saldo`, `vence`, `dias_vencido`) para que el agente de cobranza IA, el cron de intereses y el estado de cuenta del cliente consulten un solo lugar. Una cotización con factura abierta aparece solo como factura. Ver regla 25.
- `org_members` — equipo multi-usuario (rol, permisos JSON, estado y token de invitación); identidad mediante `user_id → users.id`
- `tareas` — recordatorios CRM del vendedor
- `audit_log` — registro inmutable de acciones (logAudit/reqIp)
- `api_keys` — llaves API públicas (hash SHA-256, mode test|live, scope read|write, **type secret|publishable** jul 2026 — ver "Cord Elements: llaves pk_/sk_" en `../historial/README.md`)
- `webhooks` — endpoints salientes (HMAC-sha256; salud/auto-desactivación y rotación de secreto con solape — ver `webhook_events` abajo y "Webhooks salientes llevados a nivel Stripe" en `../historial/platform-api.md`)
- `webhook_events` (jul 2026) — outbox DURABLE de webhooks: una fila por evento lógico × endpoint suscrito, `payload` inmutable, calendario de reintentos con backoff exponencial (11 intentos en ~3.6 días). RLS con carril de sistema (`app.scope='system'`) para el claim cross-org del sweeper — ver `withSystemTx` en `db.ts`.
- `intereses_moratorios` — cargos mensuales de interés moratorio sobre los DOS rieles (ago 2026, vía `cuentas_por_cobrar`; antes solo cotizaciones). `documento_id` nullable junto a `cotizacion_id`, unicidad por riel. Se calcula sobre el SALDO, no sobre el total — un cliente con 80% abonado no paga interés sobre el 100%. Cron día 1.
- `promesas_pago` — promesa de pago del cliente para una fecha (cobranza; seguimiento manual, no automatiza). `documento_id` nullable (ago 2026) junto a `cotizacion_id`. `productos.precios_volumen jsonb` = matriz de precios por volumen `[{min,precio}]`
- `cotizacion_cobros` (jul 2026) — cobros por "rebanadas" de una cotización (`tipo`: total|anticipo|saldo|cuota), cada uno con su propio PaymentIntent de Stripe. RLS por `org_id` O `public_token` + FORCE. Columnas nuevas relacionadas: `cotizaciones.anticipo_pct` (% de anticipo, null = sin anticipo) y `orgs.anticipo_default_pct` (default del negocio). Ver "Cobros por términos de crédito + Anticipo/Saldo + Cuotas" en [`cobros-facturacion.md`](cobros-facturacion.md). ⚠️ Fechas `date` de la BD se comparan SIEMPRE con `venceDia()` (`src/lib/cobros.ts`), nunca `String(v).slice(0,10)` (Neon devuelve DATE como objeto Date).
- `cotizacion_suscripciones` (jul 2026) — una fila por cotización marcada `cotizaciones.es_recurrente` (iguala/retainer mensual). Guarda `stripe_subscription_id/customer_id/price_id/product_id` (todos en la cuenta CONECTADA del vendedor, no en la de plataforma), `estado` (incomplete|active|past_due|canceled), `current_period_end`. RLS por `org_id` O `public_token` + FORCE. La cotización recurrente **nunca** llega a `status='paid'` — su ingreso mensual se registra como fila `'cuota'` en `cotizacion_cobros` y se refleja aparte en `getCobros()`. Ver "Cobros recurrentes — igualas/retainers vía Stripe Subscriptions" en [`cobros-facturacion.md`](cobros-facturacion.md) y el historial para el detalle completo (incluye 2 bugs de auditoría ya corregidos: igualas tratadas como cartera vencida, y condición de carrera al crear la Subscription).

- `kits` / `kit_items` (jul 2026) — Kits de cotización: paquetes pre-armados de renglones que se insertan de un clic en el editor (`/app/cotizaciones/nueva`, botón "+ Insertar kit"). Se gestionan en `/app/productos/kits` (sub-pestaña de Productos, NO Ajustes). `kit_items.producto_id` nullable = línea libre dentro del kit; `org_id` denormalizado en ambas para RLS sin JOIN. RLS directa por `org_id` + FORCE, sin `public_token` (no hay vista pública de un kit). `kits.precio_combo` (nullable) = precio TOTAL fijo para una unidad del kit; al insertar, el editor prorratea ese total entre las líneas de catálogo (`ratio = precioCombo / sumaListaDeUnKit`, sobreescribe `negociado` con `negoTouched:true`) — las líneas libres no participan. Al insertarse, un kit se vuelve `cotizacion_items` normales sin ninguna referencia de vuelta hacia el kit. Ver "Kits de cotización + precio de combo" en `../historial/app-features.md`.
- `mcp_idempotency` (jul 2026) — idempotencia de la tool `crear_cotizacion_borrador` del servidor MCP (`src/lib/mcp.ts`): un cliente MCP puede mandar un `idempotency_key` propio; un reintento con la MISMA llave (única por `key_id + idempotency_key`) devuelve la respuesta YA guardada en vez de crear un segundo borrador. RLS por `org_id` + FORCE. Ver "MCP — calidad de las tools" en `../historial/platform-api.md`.

Patrón RLS: `org_id = current_setting('app.org_id', TRUE)::uuid` — activo a nivel de
base de datos (jun 2026). El backend usa `withOrgTx(orgId, ...queries)` en `db.ts`
para setear `app.org_id` LOCAL dentro de una transacción Neon antes de cada query.
Las tablas `orgs` y `org_members` tienen `ENABLE` sin `FORCE` (el rol dueño bypasea)
para que `getActiveOrgId()` pueda hacer bootstrap. El link público usa
`withPublicToken(token, ...)` que setea `app.public_token` en su lugar.

Los cinco carriles de contexto (`withOrgTx` / `withUserTx` / `withSystemTx` /
`withOpsTx` / `withCaptureToken`) y su contrato ejecutable
(`scripts/tenancy-lint.mjs`, `npm run security:tenancy`) son la **regla 30** de
[`../estandares-ingenieria.md`](../estandares-ingenieria.md).

---

### 2FA en APIs de sesión

Las APIs internas de negocio también exigen completar el 2FA obligatorio de la
organización; no basta con restringir la navegación a `/app`. El middleware
responde `403 two_factor_required` y falla con 503 si no puede verificar la
política (`getAppGates(..., { strictSecurity: true })`). Las excepciones son POST
exactos a inicio/verificación de 2FA, reautenticación y logout; no abren todo
`/api/account/*` ni permiten editar `/api/org` antes de completar 2FA.
Los carriles de token público, API key, cron y Ops conservan su autorización propia.

## Inactividad de sesión — refuerzo preparado

La lectura inicial de cookie ya no renueva `last_used_at`. El middleware resuelve
la política de la organización activa con `strictSecurity` y llama a
`authorizeSessionActivity` antes del handler protegido. La función comprueba
la sesión bajo lock y actualiza actividad o elimina la sesión vencida en una
sentencia. También cubre API interna, billing y registro de passkeys. Las páginas
públicas y recuperación de 2FA no renuevan la actividad. Las sesiones por API key
y Ops conservan su carril independiente.

El plazo mide requests autenticados, incluido polling, no actividad física del
usuario. La escritura de actividad es por request protegido; expiración/cookie
conservan throttle. Pruebas y aceptación pendiente en [confiabilidad](confiabilidad.md).
