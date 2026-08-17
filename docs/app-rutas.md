# Cómo funciona la app: Multi-tenant y Rutas — Cord

> Modelo multi-tenant (tablas, RLS, org_id), mapa completo de rutas (landing, app,
> API pública/MCP, legales) y AppLayout. Documento de estado actual; los detalles
> cronológicos viven en [`historial.md`](historial.md).

---

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
consulta [`historial-auth-clerk.md`](historial-auth-clerk.md).

**Tablas** (`db/schema.sql`):
- `orgs` — el negocio (nombre, logo, datos fiscales en `fiscal_metadata`, `country_code`, `quote_prefix`, plan, Stripe IDs, `owner_id` → `users.id`, `parent_org_id` → sub-cuentas anidadas). **`sandbox_of uuid`** (jul 2026, índice único parcial): si no es null, esta fila ES la org SANDBOX espejo de otra — ver "Entorno de prueba REAL tipo Stripe" en `historial.md`. `getActiveOrgId()` resuelve la sandbox del padre cuando la cookie `cord_test_mode` está activa (`resolveSandboxOrgId()` en `db.ts`, find-or-create idempotente).
- `users`/`sessions`/`oauth_accounts`/`passkeys`/`password_reset_tokens`/`email_verification_tokens`/`two_factor_challenges` (ago 2026) — núcleo de auth propio. `sessions.id`/`password_reset_tokens.id`/`org_members.token` guardan **sha256(token)**, nunca el valor crudo (que solo vive en la cookie/link, jamás se persiste). `users.suspended_at` bloquea centralmente cualquier método de autenticación y revoca sesiones desde Ops. Ver detalle completo en `historial-auth-clerk.md`.
- `ops_operators`/`ops_auth_challenges`/`ops_sessions`/`ops_audit_log` (ago 2026) — carril de identidad privilegiada exclusivo de `ops.cordhq.app`. Allowlist en código + BD, passkey o contraseña con TOTP, cookie separada, tokens y retos hasheados, expiración corta y bitácora de acceso. Una sesión normal de Cord nunca autoriza Ops.
- `external_usage_events` (ago 2026) — telemetría RLS por organización para proveedores con costo variable. Registra proveedor, categoría, operación, unidades, tokens de entrada/salida y estado; nunca prompts, destinatarios, payloads, respuestas, llaves ni secretos. Complementa `uso_periodo`, `api_requests`, `webhook_deliveries` y `cotizacion_cobros` en `/ops/usage`.
- `productos` — catálogo de cada org
- `clientes` — a quién se cotiza (con `terminos_default` y `limite_credito`)
- `cotizaciones` — status `draft|sent|viewed|approved|rejected|expired|paid|invoiced` + `public_token` + `base_currency` y `fiscal_currency` para coberturas FX. `creado_por` (jul 2026, nullable) = `users.id` de quien la creó/duplicó — alimenta `/app/desempeno`.
- `cotizacion_items` — líneas (permite línea libre sin producto; `precio_negociado` opcional)
- `eventos` — timeline + "tu cliente vio la cotización" (**feature estrella**)
- `documentos_fiscales` — fuente canónica de las emisiones fiscales por país (reemplaza a la tabla legado `facturas_cfdi`). Conserva número, moneda, totales, snapshots inmutables de emisor/receptor/líneas, proveedor y llave de idempotencia. México usa el rail CFDI 4.0 de Facturapi; el resto puede emitir una factura comercial propia de Cord sin afirmar envío a la autoridad local.
- `invoice_sequences` — consecutivo atómico por `org_id + country_code + document_type`; RLS + FORCE evita cruces entre organizaciones y la llave única de `documentos_fiscales` evita duplicar una emisión por cotización.
- `org_members` — equipo multi-usuario (rol, permisos JSON, estado y token de invitación); identidad mediante `user_id → users.id`
- `tareas` — recordatorios CRM del vendedor
- `audit_log` — registro inmutable de acciones (logAudit/reqIp)
- `api_keys` — llaves API públicas (hash SHA-256, mode test|live, scope read|write, **type secret|publishable** jul 2026 — ver "Cord Elements: llaves pk_/sk_" en historial.md)
- `webhooks` — endpoints salientes (HMAC-sha256; salud/auto-desactivación y rotación de secreto con solape — ver `webhook_events` abajo y "Webhooks salientes llevados a nivel Stripe" en `historial-platform-api.md`)
- `webhook_events` (jul 2026) — outbox DURABLE de webhooks: una fila por evento lógico × endpoint suscrito, `payload` inmutable, calendario de reintentos con backoff exponencial (11 intentos en ~3.6 días). RLS con carril de sistema (`app.scope='system'`) para el claim cross-org del sweeper — ver `withSystemTx` en `db.ts`.
- `intereses_moratorios` — cargos mensuales de interés moratorio por cotización (cron día 1; idempotente por cotizacion_id+periodo)
- `promesas_pago` — promesa de pago del cliente para una fecha (cobranza; seguimiento manual, no automatiza). `productos.precios_volumen jsonb` = matriz de precios por volumen `[{min,precio}]`
- `cotizacion_cobros` (jul 2026) — cobros por "rebanadas" de una cotización (`tipo`: total|anticipo|saldo|cuota), cada uno con su propio PaymentIntent de Stripe. RLS por `org_id` O `public_token` + FORCE. Columnas nuevas relacionadas: `cotizaciones.anticipo_pct` (% de anticipo, null = sin anticipo) y `orgs.anticipo_default_pct` (default del negocio). Ver "Cobros por términos de crédito + Anticipo/Saldo + Cuotas" en `negocio-billing.md`. ⚠️ Fechas `date` de la BD se comparan SIEMPRE con `venceDia()` (`src/lib/cobros.ts`), nunca `String(v).slice(0,10)` (Neon devuelve DATE como objeto Date).
- `cotizacion_suscripciones` (jul 2026) — una fila por cotización marcada `cotizaciones.es_recurrente` (iguala/retainer mensual). Guarda `stripe_subscription_id/customer_id/price_id/product_id` (todos en la cuenta CONECTADA del vendedor, no en la de plataforma), `estado` (incomplete|active|past_due|canceled), `current_period_end`. RLS por `org_id` O `public_token` + FORCE. La cotización recurrente **nunca** llega a `status='paid'` — su ingreso mensual se registra como fila `'cuota'` en `cotizacion_cobros` y se refleja aparte en `getCobros()`. Ver "Cobros recurrentes — igualas/retainers vía Stripe Subscriptions" en `negocio-billing.md` e "Historial" para el detalle completo (incluye 2 bugs de auditoría ya corregidos: igualas tratadas como cartera vencida, y condición de carrera al crear la Subscription).

- `kits` / `kit_items` (jul 2026) — Kits de cotización: paquetes pre-armados de renglones que se insertan de un clic en el editor (`/app/cotizaciones/nueva`, botón "+ Insertar kit"). Se gestionan en `/app/productos/kits` (sub-pestaña de Productos, NO Ajustes). `kit_items.producto_id` nullable = línea libre dentro del kit; `org_id` denormalizado en ambas para RLS sin JOIN. RLS directa por `org_id` + FORCE, sin `public_token` (no hay vista pública de un kit). `kits.precio_combo` (nullable) = precio TOTAL fijo para una unidad del kit; al insertar, el editor prorratea ese total entre las líneas de catálogo (`ratio = precioCombo / sumaListaDeUnKit`, sobreescribe `negociado` con `negoTouched:true`) — las líneas libres no participan. Al insertarse, un kit se vuelve `cotizacion_items` normales sin ninguna referencia de vuelta hacia el kit. Ver "Kits de cotización + precio de combo" en `historial-app-features.md`.
- `mcp_idempotency` (jul 2026) — idempotencia de la tool `crear_cotizacion_borrador` del servidor MCP (`src/lib/mcp.ts`): un cliente MCP puede mandar un `idempotency_key` propio; un reintento con la MISMA llave (única por `key_id + idempotency_key`) devuelve la respuesta YA guardada en vez de crear un segundo borrador. RLS por `org_id` + FORCE. Ver "MCP — calidad de las tools" en `historial-platform-api.md`.

Patrón RLS: `org_id = current_setting('app.org_id', TRUE)::uuid` — activo a nivel de
base de datos (jun 2026). El backend usa `withOrgTx(orgId, ...queries)` en `db.ts`
para setear `app.org_id` LOCAL dentro de una transacción Neon antes de cada query.
Las tablas `orgs` y `org_members` tienen `ENABLE` sin `FORCE` (el rol dueño bypasea)
para que `getActiveOrgId()` pueda hacer bootstrap. El link público usa
`withPublicToken(token, ...)` que setea `app.public_token` en su lugar.

---

## Mapa de rutas

```
# Landing (prerender:true) — CONSTRUIDA
/                → landing de ventas (un solo index.astro que monta los componentes)
/producto/[slug] → páginas de producto (jun 2026, estilo Stripe): editor,
                   link-publico, seguimiento, cfdi, clientes-credito, cobranza-ia. Contenido en
                   src/lib/producto.ts; mockup por feature en [slug].astro (hero) +
                   components/producto/BlockMockup.astro (bloques);
                   animaciones compartidas en components/landing/PageAnims.astro
                   (masked titles via clase .masked-title, hero .pp-hero). Heroes con "settle"
                   estilo index — SIN exploded-view/tilt/partículas/flip (ver Estado actual).
                   Debajo del bento grid (jul 2026): components/producto/FeatureShowcase.astro
                   — sección tabbed estilo ElevenLabs "Flows" (mockup grande + 3 tabs debajo con
                   indicador deslizante + autoplay). Ver detalle en "Estado actual".
/precios         → página dedicada (jun 2026): toggle mensual/anual (2 meses gratis),
                   comparador completo, calculadora de valor (ROI) y FAQ.
                   Datos en src/lib/precios.ts (FUENTE ÚNICA de planes/comparativa/FAQ).
/soluciones      → HUB por industria (anclas + cada bloque enlaza a su detalle).
/soluciones/[slug] → página rica por industria (jun 2026, espejo de /producto/[slug]):
                   distribuidoras, construccion, manufactura, servicios. Contenido en
                   src/lib/solucion.ts; mockup propio por industria en [slug].astro.
/elements        → CORD Elements (jun 2026, estilo Stripe Checkout): el cotizador
                   embebible. Hero con <iframe> EN VIVO de /embed/demo en un mockup de
                   browser; snippet, pasos, features (lista), eventos dev. Enlazada en
                   el megamenú Producto.
/embed/[token]   → cotizador embebible (CORD Elements) para <iframe> de terceros.
                   Reutiliza components/q/QuoteCard.astro (mismo corazón que /q) con
                   EmbedLayout (sin chrome). Setea CSP frame-ancestors desde
                   orgs.embed_domains; postMessage resize + relay de eventos. Loader:
                   public/embed.js. export const prerender = false.

# Dev Blog (Subdominio dev.cordhq.app)
/dev-blog/*      → El ecosistema técnico para desarrolladores. Vercel.json gestiona un
                   rewrite para que las visitas a `dev.cordhq.app` carguen esta ruta 
                   invisiblemente, y redirects para que accesos a `cordhq.app/dev-blog`
                   redirijan forzosamente a `dev.cordhq.app`. Los artículos viven en
                   `src/content/dev-blog/` (Astro Content Collections) y las vistas en
                   `src/pages/dev-blog/` (`index.astro`, `blog.astro`, `[slug].astro`).
                   Usa el layout 100% independiente `DevBlogLayout.astro` con estética
                   pixel/dark-mode.

# App — CONECTADA a Neon (src/lib/queries.ts); usa AppLayout.astro
/login /registro → formularios propios de acceso y alta; email/password + OAuth nativo
/app             → dashboard: KPIs (incl. "por dar seguimiento"), pipeline, recientes, feed
/app/informes    → INFORMES (ago 2026) — la única casa de la analítica. Reemplaza a
                   /app/cfo, /app/analitica y /app/tesoreria/flujo (los 3 borrados; el
                   middleware 302-redirige desde ellos vía LEGACY_ROUTES de informes.ts).
                   Una sola ruta con desplegable de informes (?r=resumen|comercial|
                   finanzas|flujo|cobranza|clientes|productos) + un solo selector de
                   fechas (?rango=30 o ?desde=&hasta=). Registro en src/lib/informes.ts
                   (cada informe declara scope 'rango'|'snapshot', perm y grupo); carga
                   de datos en src/lib/informes-data.ts; markup en
                   src/components/app/informes/*Report.astro (un componente por informe,
                   ~42 widgets). Widgets personalizables con clave por informe
                   (cord.report.<id>.v1). Gate: memberCan('analitica') + ReportDef.perm.
                   Los informes 'snapshot' NO renderizan el selector de fechas — muestran
                   un chip "Al día de hoy" (así no hay control que ignorar).
/app/desempeno   → desempeño del equipo (jul 2026; hoy 2ª pestaña junto a Informes):
                   ranking por vendedor (cotizaciones creadas/enviadas/cerradas, tasa de
                   cierre, monto cerrado, cobrado, ticket promedio, días a cierre) vía
                   getDesempeno() en queries.ts. Atribución por cotizaciones.creado_por
                   (`users.id`); gateado por el permiso `analitica`.
/app/cobranza    → cuentas por cobrar (jun 2026): cartera total, vencido, aging por
                   antigüedad, exposición por cliente (saldo vs límite) y tabla con
                   "marcar cobrada" + recordatorio por WhatsApp. getCobranza() en
                   queries.ts (por cobrar = status approved|invoiced; vence según términos).

/app/cotizaciones        → tabla con filtros por estado (client-side)
/app/cotizaciones/nueva  → EL EDITOR — POST /api/cotizaciones (real)
/app/cotizaciones/[id]   → detalle + timeline + ACCIONES REALES (enviar, aprobar,
                           rechazar, pago, facturar, copiar link, eliminar borrador,
                           DUPLICAR → POST /api/cotizaciones/[id]/duplicate,
                           ENVIAR POR WHATSAPP → wa.me con mensaje + link pre-armado)
                           via PATCH/DELETE /api/cotizaciones/[id]. (paid acepta desde
                           'approved' o 'invoiced'). Presencia ("viendo ahora") + aviso de
                           mensajes nuevos EN VIVO (jul 2026, SSE) via GET
                           /api/cotizaciones/[id]/stream — reemplazó el polling de 8s a
                           /presence; ver "API Pública" abajo.
/app/cotizaciones/[id]/imprimir → PDF imprimible (window.print) personalizado con
                           la marca de la org: PLANTILLA (clasico|minimal|detallado vía
                           data-template en .sheet), LOGO real (ORG.logoUrl) o inicial,
                           color, contacto, mensaje, condiciones. print-color-adjust:exact.
/app/clientes /app/productos → CRUD real con modal <dialog> (POST/PATCH/DELETE
                           /api/clientes y /api/productos). Productos también con
                           IMPORTACIÓN CSV (botón → modal archivo/mapeo/preview →
                           POST /api/productos/import [dedupe por SKU] y
                           /api/clientes/import [dedupe por RFC/empresa]).
/app/productos/kits       → (jul 2026) sub-pestaña de Productos (page-tabs
                           Catálogo|Kits, NO Ajustes): Kits de cotización — paquetes
                           pre-armados de renglones para insertar de un clic en el
                           editor. CRUD vía /api/kits (+/api/kits/[id]), incluye
                           precio de combo opcional (precio total fijo prorrateado
                           al insertar). Ver tabla `kits`/`kit_items` arriba.
/app/ajustes     → ÍNDICE (estilo Stripe): LISTA de CATEGORÍAS (no tarjetas, no
                   rail). Ajustes YA NO va en el sidebar — se entra por el engrane de
                   la topbar. Modelo en `src/lib/settings.ts`: **CATEGORÍAS → pestañas**
                   (`SETTINGS_CATEGORIES`, `categoryOfTab()`). Cada categoría abre su
                   primera pestaña; dentro, las sub-páginas son **PESTAÑAS horizontales**
                   (NO rail lateral, jun 2026 — André lo pidió). El `SettingsShell.astro`
                   recibe `tab="x"` (deriva la categoría), pinta breadcrumb + título +
                   tabs + slot + barra de guardar opcional. Guardado GENÉRICO: junta los
                   `[data-field]` → PATCH /api/org. La categoría de facturación se
                   adapta al país de la organización: México muestra RFC, régimen,
                   CSD y CFDI 4.0; los demás países muestran perfil fiscal y factura
                   comercial, indicando cuando aún no existe conexión con la autoridad.
                   El país se puede corregir en General; al cambiarlo se reconfigura
                   la experiencia fiscal en la siguiente navegación.
                   Categorías:
                   • Empresa: general · marca · facturación · plan
                   • Cotizaciones: cotizaciones (folio/IVA/retenciones/defaults/legal) · pdf · aprobaciones
                   • Equipo y roles: equipo
                   • Avanzado: integraciones · auditoria
                   • Tu cuenta: **cuenta** → monta `CustomUserProfile` propio (perfil,
                     sesiones, 2FA, passkeys y cuentas conectadas — identidad del
                     usuario, distinta de los datos del negocio).
/q/[token]       → vista PÚBLICA — aprobar/rechazar REALES via POST /api/q/[token]
                   (token = secreto, sin auth); muestra estado si ya se decidió;
                   "Descargar PDF" = window.print con @media print; color de marca
                   de la org. Token demo: /q/demo.
                   DOCUMENTO VIVO (ago 2026): el SSE empuja `patch` y el card aplica
                   los cambios del vendedor al DOM sin recargar (importes con
                   count-up, flash en la línea que cambió, rótulo "antes $X").
                   Solo un estado TERMINAL (paid/rejected/expired/invoiced) recarga.
                   Presencia mutua: el cliente ve "Ana está en línea".
                   ACTOR (Regla 19): el SSR ya NO marca la vista. La marca el
                   heartbeat (POST action:'ping'), que exige JS + pestaña visible.
                   src/lib/public-viewer.ts resuelve seller | bot | client; el
                   vendedor ve un banner de vista previa y no genera señal.
                   Cookie `cord_q_visitor` (httpOnly, 1 año) = personas y aperturas.
/embed/[token]   → mismo QuoteCard dentro de un iframe de terceros (Cord Elements).
                   Mismo tratamiento de actor. Ojo: la cookie es SameSite=Lax, así
                   que en un iframe cross-site no viaja y el actor cae al
                   identificador derivado de IP+org — suficiente para no contar al
                   equipo como cliente, insuficiente para distinguir dispositivos.
/desarrolladores/[slug] → páginas de desarrolladores (jun 2026, prerender, mismo
                   sistema que /producto/*): api (terminal curl + JSON response) y
                   mcp (chat UI con tool call). Contenido en src/lib/desarrolladores.ts.
                   Enlazadas en el megamenú DESARROLLADORES del navbar.

# Auth propio (ago 2026)
/api/auth/{register,login,logout,login/2fa} → núcleo de sesión. PÚBLICOS (se
                   auto-autentican) — ver PUBLIC_API_PREFIXES en middleware.ts.
/api/auth/{google,apple}/{index,callback}   → OAuth con PKCE (Google) y JWKS
                   real (Apple — verifyAppleIdToken en auth-apple.ts).
/api/auth/passkeys/{register-options,register,auth-options,verify} → WebAuthn
                   (@simplewebauthn/server v13).
/api/auth/reset-password/{request,confirm}  → reset con token sha256, 15 min.
/api/auth/verify-email/{request,confirm}    → verificación de correo BLOQUEANTE
                   (register.ts ya no crea sesión hasta confirmar).
/api/account/**  → INTERNOS (heredan el gate de sesión del middleware, a
                   diferencia de /api/auth/). profile · password ·
                   sessions (listar/revocar) · 2fa/{start,verify,disable,
                   backup-codes} · passkeys (listar/[id] DELETE) ·
                   connections/[provider] DELETE. Ver CustomUserProfile.tsx.
/ops             → Centro de operaciones interno, aislado del layout y analytics
                   públicos. Solo los dos operadores de la allowlist doble;
                   passkey o password+TOTP en producción.
/ops/users/[id]  → ficha de identidad: perfil, membresías, sesiones, passkeys,
                   OAuth, suspensión/restauración y auditoría.
/ops/organizations/[id] → ficha del workspace: equipo, cotizaciones, clientes,
                   productos, pagos, API keys, webhooks y SSO.
/ops/usage        → centro de consumo y riesgo por organización: cuotas de IA,
                   API y CFDI; tokens Anthropic; correos Resend; errores API;
                   fallos de webhooks; volumen Stripe y tamaño de Neon. Alertas
                   preventivas al 80% y críticas al 100% de la cuota. La tabla usa
                   búsqueda server-side y páginas SSR de 50; los totales/alertas se
                   calculan aparte y nunca se envía el catálogo completo de orgs.
/ops/database/[table] → explorador paginado de todas las tablas públicas. Los
                   campos criptográficos, secretos, tokens y datos financieros
                   sensibles permanecen redactados y no son buscables. La navegación
                   es keyset por cursor `created_at/id`, sin `OFFSET` profundo ni
                   `COUNT(*)`; el total sin filtro es una estimación de `pg_class`.
/ops/security    → sesiones Ops, señales de identidad y bitácora privilegiada. La
                   auditoría se pagina a 50 filas y las señales muestran el inbox
                   acotado de las 50 identidades más recientes que requieren atención.
/api/ops/users/[id] → PATCH administrativo: revocar sesiones, desbloquear o
                   eliminar una identidad no protegida. Rol Ops admin y auditoría
                   atómica obligatorios.
/api/ops/organizations/[id] → PATCH administrativo: revocar llaves API,
                   desactivar webhooks, cerrar sesiones del equipo o eliminar una
                   organización no protegida. Confirmación escrita para acciones
                   destructivas y auditoría en la misma transacción.
/api/orgs        → POST crea una org (el servidor genera el id — reemplaza a
                   /api/orgs/provision, que tenía un IDOR cross-tenant real).
/api/fiscal/documents/[id]/{pdf,xml} → descarga autenticada y acotada al `org_id`.
                   CFDI se proxifica desde Facturapi; las facturas comerciales se
                   renderizan desde los snapshots canónicos de Cord. XML solo existe
                   cuando el rail regulatorio realmente lo produce.
/api/equipo/resend → POST regenera el link de una invitación pendiente (rota
                   el token; el crudo original no es recuperable, solo su hash).

# API Pública (REST + MCP)
/api/notificaciones  → GET feed de actividad reciente (reusa tabla eventos; último ts para punto rojo)
/api/q/[token]   → acciones del CLIENTE (sin auth). approve | reject | comment |
                   counter | item_comment | ping | hito.
                   `ping` es el latido del documento vivo: marca la vista (una sola
                   vez, solo si el actor es cliente), escribe presencia CON ACTOR y
                   acumula atención por sección. `hito` cuenta abrir el PDF o
                   expandir una línea. `approve` acepta `rev` y responde 409
                   {stale:true} si la propuesta cambió mientras el cliente la leía —
                   la firma nunca cae sobre un total que el cliente no vio.
                   El payload del latido NO es de confianza: claves de vocabulario
                   cerrado y techo de 60s por clave/tick (src/lib/atencion.ts).
/api/q/[token]/stream        → SSE público (jul 2026, sin auth — token = secreto).
                   event: ready | patch | presence | message | line_message | status | ping.
                   `line_message {item_id, contenido}` entrega la respuesta del
                   vendedor en el hilo de UNA partida (cotizacion_comentarios, tabla
                   distinta de eventos). Antes no viajaba por ningún stream: el
                   vendedor respondía en una línea y el cliente con la página abierta
                   no se enteraba nunca (Regla 20). Filtra autor_tipo='usuario' — los
                   del propio cliente ya los pintó su envío optimista.
                   Sigue siendo polling a Neon DENTRO de la conexión larga, sin infra
                   nueva. Lo barato lo hace `cotizaciones.rev`: el ciclo normal lee un
                   entero y solo paga el snapshot completo (getLiveSnapshot) cuando ese
                   entero avanza. Cadencia adaptativa 1s (vendedor y cliente juntos) /
                   2.5s (solo cliente) / 5s (reposo); el cliente CIERRA la conexión al
                   ocultar la pestaña. `lastRev` avanza DESPUÉS del snapshot: adelantarlo
                   convertía un fallo transitorio de BD en un parche perdido para siempre.
/api/cotizaciones/[id]/stream → SSE con sesión (jul 2026). Empuja presencia
                   (event:presence {online,convCount,seccion,escribiendo}), mensajes
                   nuevos del cliente (event:message) y sus comentarios por partida
                   (event:line_message, filtrando autor_tipo='cliente') al detalle
                   del vendedor — reemplaza
                   el polling de 8s a /api/cotizaciones/[id]/presence (endpoint que sigue
                   vivo como fallback si el navegador no abre SSE).
                   También ESCRIBE la presencia del vendedor mientras la conexión vive:
                   es lo que hace que el cliente lo vea en línea en /q/[token]. Al cerrar,
                   retrocede su last_seen para apagarse sin esperar la ventana de 30s.
/api/cotizaciones/[id]/atencion → resumen de atención del cliente (ago 2026). Personas,
                   aperturas, primera/última vez y segundos por sección. Gated con
                   requireEntitlement(orgId,'quote_attention') EN EL ENDPOINT — ocultar
                   el bloque no es autorización (Regla 17). Excluye a propósito las
                   visitas del propio equipo: mezclarlas vuelve ruido el panel.
/api/v1/me           → whoami (scope any)
/api/v1/cotizaciones → GET list (filtros status/limit/offset) + POST crear
/api/v1/cotizaciones/[id] → GET detalle (items + eventos)
/api/v1/clientes     → GET list + POST crear
/api/v1/productos    → GET list + POST crear
/api/v1/cobranza     → GET cartera
/api/mcp             → MCP JSON-RPC 2.0 (transporte moderno, sin sesión):
                   initialize/ping/tools/list/tools/call. Motor compartido en
                   src/lib/mcp/rpc.ts (jul 2026 — antes vivía inline aquí).
/api/mcp/sse + /api/mcp/message → transporte MCP legacy (HTTP+SSE), mismo
                   motor rpc.ts. Sesión (orgId/scope/keyId) en
                   src/lib/mcp/session-store.ts (Redis vía Upstash si está
                   configurado, si no Map en memoria — mismo patrón que
                   ratelimit.ts); message.ts exige Authorization: Bearer
                   ADEMÁS del sessionId y valida que la llave sea de la
                   MISMA org que abrió la sesión.
/api/webhooks        → CRUD webhooks salientes + POST action:test|redeliver|rotate
                   (rotate = ventana de solape 1h/24h/72h, devuelve secret nuevo 1 vez)
/api/cron/webhooks   → sweeper del outbox (cada minuto) — reclama trabajo vencido
                   (invocaciones muertas, reintentos programados) vía withSystemTx.
/api/cron/webhooks-limpieza → retención diaria (webhook_deliveries >30d + tope 500/
                   endpoint; webhook_events resueltos >30d, failed >90d). Borrado en
                   lotes acotados, nunca un DELETE gigante.
/api/cron/expirar-cotizaciones → diario (jul 2026): mueve a status='expired' toda
                   cotización sent/viewed cuya vigencia ya pasó (antes ningún código
                   path escribía ese status); registra evento interno + audit log +
                   dispara el webhook quote.expired.

# Entorno de PRUEBA (jul 2026 — ver "Entorno de prueba REAL tipo Stripe" en historial.md)
/api/test-mode/reset → POST "Vaciar datos de prueba" (interna, requiere sesión). Solo opera si
                   getActiveOrgId() resuelve a una org SANDBOX (guard `sandbox_of is not null`
                   antes de cualquier DELETE — nunca toca una org real); borra la sandbox entera
                   (cascade limpia cotizaciones/clientes/productos/etc.) y se recrea fresca +
                   reseed la próxima vez que se resuelva en modo prueba.

# Legales
/privacidad      → Aviso de Privacidad Integral (LFPDPPP + DPA estándares internacionales):
                   responsable/encargado, datos recabados, finalidades, datos anonimizados,
                   cookies y analytics, tabla de subencargados (Stripe/Neon/Anthropic/
                   Resend/PostHog/PAC), transferencias internacionales, M&A, seguridad
                   (TLS+AES-256), brechas (72h), portabilidad/eliminación, menores, ARCO
                   (legal@flouvia.com). `prerender:true`, scrollspy IntersectionObserver,
                   TOC sticky con 14 secciones.
/terminos        → Términos y Condiciones (17 cláusulas): descripción del software, PI y
                   Feedback, planes + metered billing, autorización de débito (Stripe),
                   actividades prohibidas (EFOS/lavado), Fair Use, terceros, responsabilidad
                   fiscal, confidencialidad, indemnización, SLA + Fuerza Mayor, límite de
                   responsabilidad (12 meses pagados), API pública, uso de marca, cancelaciones
                   (sin reembolsos), ley aplicable (México / CDMX) y cambios. `prerender:true`,
                   scrollspy IntersectionObserver, TOC sticky con 17 secciones.
```

**Columnas de personalización en `orgs`** (jun 2026, al final de `db/schema.sql`
como `alter table … if not exists`): `color_marca`, `email_contacto`, `telefono`,
`direccion`, `pdf_mensaje`, `pdf_condiciones`, `pdf_mostrar_lista`, **`pdf_template`**
(clasico|minimal|detallado, agregada jun 2026). `logo_url` (en la tabla base) ahora
guarda también data URLs de logos subidos en Ajustes. **Jun 2026 además:**
`cotizaciones.viewer_last_seen` (presencia), tabla **`tareas`** (CRM), y la **fase
enterprise**: `clientes.nivel`/`descuento_pct` (price tiers), `orgs.aprob_descuento_max`/`aprob_monto_max`/`aprob_margen_min`/`interes_moratorio_pct` +
`cotizaciones.aprob_estado`/`aprob_motivo` + `productos.costo` + `cotizacion_items.costo_unitario`
(Auditor Silencioso de márgenes), y la tabla **`audit_log`**. **Superpoderes de config (jun 2026):**
`orgs.vigencia_default_dias`/`terminos_default` (defaults que el editor `/nueva` SÍ
usa), `retencion_isr_pct`/`retencion_iva_pct`/`texto_legal`, `sitio_web`/`whatsapp`,
y fiscales SAT `regimen_fiscal`/`uso_cfdi`/`cp_fiscal`/`serie_folio` (catálogos en
`src/lib/sat.ts`). ⚠️ **El IVA ahora se respeta de verdad**: el editor y
`POST /api/cotizaciones` calculan con `orgs.iva_pct` (antes estaba hardcodeado 16%).
Medidor de uso real del plan en `getPlanUsage()`. **Jun 2026 (API/Webhooks):** tabla
`api_keys` (`org_id`, `key_hash` SHA-256, `mode` test|live, `scope` read|write, `label`,
`last_used_at`, `revoked`); tabla `webhooks` (`org_id`, `url`, `eventos` jsonb, `secret`
en claro para firma, `activo`, `last_status`, `last_error`, `last_delivery_at`);
columna `orgs.embed_domains` (allowlist CSP para Elements). **Jul 2026 (salud + rotación):**
`webhooks` ganó `fallos_consecutivos`, `deshabilitado_at`/`deshabilitado_motivo`,
`aviso_fallos_at`, `secret_prev`/`secret_prev_expira`/`secret_rotado_at`; `webhook_deliveries`
ganó `message_id`/`event_id` (liga al outbox); tabla nueva `webhook_events` (ver arriba). ⚠️
Correr `npm run db:migrate` tras pull.

**Mock data:** `src/lib/mock.ts` exporta `ORG`, `PRODUCTOS`, `CLIENTES`,
`COTIZACIONES` (con items + eventos), `STATUS_META` (label/color/bg por estado),
helpers de dinero (`money`, `quoteTotal`…) y `findQuote`/`findQuoteByToken`.
La org demo es "Materiales del Valle" (construcción) — coherente con el mockup
del hero (COT-0148 → El Zarco). Al conectar Neon: reemplazar imports por queries.

**AppLayout (`src/layouts/AppLayout.astro`):** sidebar de vidrio sticky **temada con `--sb-*`**
(blanca en claro / navy en oscuro; logo navy↔blanco según tema, nav con íconos, org-switcher
arriba, "Fijados" antes de los grupos nav, footer con logo). El `<OnboardingWidget>` y su píldora
(`#onbPill` en `.tb-right`) se montan aquí, gated por `!setup.complete`.
Props: `title`, `page`, `heading?`, `crumbs?` (breadcrumbs). Slots: `topbar-actions`
(botones del page-header, derecha), `page-sub` (subtítulo opcional bajo el título),
`page-tabs` (tabs de sección, bajo el título — usar clase `.ph-tab`), slot default (contenido).
Topbar: buscador izquierda → tb-right (onb-pill, campana/notificaciones, ajustes).
Page-head: breadcrumbs → `h1.ph-title` + botón pin → ph-actions → ph-tabs-row.
Clases globales reutilizables: `.card`, `.status-pill`, `.editorial`, `.skeleton`,
`.skeleton-line`, `.ph-tab`. API JS global: `window.cordToast(msg, type, ms)` y
**`window.cordConfirm(opts): Promise<boolean>`** (jul 2026 — modal de confirmación,
reemplaza `confirm()` nativo en toda la app; ver detalle en `sistema-de-diseno.md`
→ "Modal de confirmación global"). `sessionStorage 'cord.flash'` para flash post-navegación.
Banner sticky de **entorno de prueba** (`#testEnvExit`/`#testEnvReset`) montado aquí,
gated por la cookie `cord_test_mode` (ver historial.md). Entradas con CSS `app-fadein`
escalonado (NO GSAP). Mobile: sidebar → drawer (ocupa 80vw, tab bar inferior ELIMINADA jun 2026).
En móvil la topbar muestra burger + crear (círculo) + lupa (ícono) + campana. Ayuda y config
viven en la sección `.sb-mobile-actions` dentro del drawer (oculta en desktop).
⚠️ Estilos de contenido inyectado por JS (Cmd+K items, notif panel, toasts, pins)
DEBEN vivir en `<style is:global>` — Astro scopea por `[data-astro-cid]` y el HTML
dinámico no lleva ese atributo. NO moverlos al bloque `<style>` scopeado.

---
