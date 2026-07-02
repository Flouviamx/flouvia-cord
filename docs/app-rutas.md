# Cómo funciona la app: Multi-tenant y Rutas — Cord

> Modelo multi-tenant (tablas, RLS, org_id), mapa completo de rutas (landing, app,
> API pública/MCP, legales) y AppLayout. Auto-cargado vía `@import` desde `/CLAUDE.md`.

---

## Multi-tenant

PK de relación = **`org_id`** (NO `email_cliente` como el portal de flouvia-web).
Cada negocio registrado es una `org`. El owner sigue en `orgs.clerk_user_id`.

✅ **Equipo y roles MULTI-USUARIO (jun 2026):** tabla **`org_members`**
(`org_id`, `clerk_user_id`, `email`, `rol`, `permisos jsonb`, `estado`, `token`).
`getActiveOrgId()` (db.ts) ahora resuelve la org por **membresía activa** (membresía
más reciente primero), con fallback a la org propia + auto-siembra de la membresía
`owner` (backward-compatible; resiliente si la tabla no existe). **Permisos por
sección custom** en `src/lib/permissions.ts` (PERMISOS: cotizar/aprobar/cobranza/
clientes/productos/analitica/ajustes/equipo; PRESETS admin/vendedor/lectura; el
owner = override total). Helpers en queries.ts: `getMembers`, `getMyMembership`,
**`requirePerm(key)`** (devuelve Response 403). Enforcement REAL en `/api/org`
(ajustes), `/api/equipo` (equipo), `/api/cotizaciones`(+[id], cotizar/aprobar),
`/api/clientes`, `/api/productos`. **Invitación por LINK** (token): owner invita en
`/app/ajustes/equipo` → comparte `/unirse/{token}` → la persona inicia sesión
(login/registro honran `?redirect_url=`) y acepta vía `/api/equipo/join`. **Gating:
invitar requiere plan Negocio** (`planTieneEquipo`, hoy `['pro','business','negocio']`).
Pendiente: org switcher (un usuario activo = 1 org),
y migrar a Clerk Organizations nativo si se quiere SSO/switch nativo. (✅ Se completó ocultar los controles en el FRONT para no mostrar botones a usuarios sin el permiso adecuado). NOTA: el
"approach Clerk Organizations" elegido se implementó como **membresía propia** porque
habilitar Organizations es config del dashboard de Clerk (no codeable aquí); la
identidad sigue siendo Clerk (userId), solo la membresía/permiso es nuestra.

**Tablas** (`db/schema.sql`):
- `orgs` — el negocio (nombre, logo, datos fiscales en `fiscal_metadata`, `country_code`, `quote_prefix`, plan, Stripe IDs, `clerk_org_id`)
- `productos` — catálogo de cada org
- `clientes` — a quién se cotiza (con `terminos_default` y `limite_credito`)
- `cotizaciones` — status `draft|sent|viewed|approved|rejected|expired|paid|invoiced` + `public_token` + `base_currency` y `fiscal_currency` para coberturas FX.
- `cotizacion_items` — líneas (permite línea libre sin producto; `precio_negociado` opcional)
- `eventos` — timeline + "tu cliente vio la cotización" (**feature estrella**)
- `documentos_fiscales` — registro global de emisiones fiscales por país (reemplaza a la tabla legado `facturas_cfdi`)
- `org_members` — equipo multi-usuario (rol, permisos jsonb, estado, token invitación); sincronizado desde Clerk vía webhook
- `tareas` — recordatorios CRM del vendedor
- `audit_log` — registro inmutable de acciones (logAudit/reqIp)
- `api_keys` — llaves API públicas (hash SHA-256, mode test|live, scope read|write)
- `webhooks` — endpoints salientes (HMAC-sha256, best-effort, 1 retry)
- `intereses_moratorios` — cargos mensuales de interés moratorio por cotización (cron día 1; idempotente por cotizacion_id+periodo)
- `promesas_pago` — promesa de pago del cliente para una fecha (cobranza; seguimiento manual, no automatiza). `productos.precios_volumen jsonb` = matriz de precios por volumen `[{min,precio}]`

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

# App — CONECTADA a Neon (src/lib/queries.ts); usa AppLayout.astro
/login /registro → Clerk SignIn/SignUp (es-MX)
/app             → dashboard: KPIs (incl. "por dar seguimiento"), pipeline, recientes, feed
/app/cfo         → CFO Dashboard (jun 2026): proyección de flujo de caja semanal,
                   KPIs financieros (DSO, concentración de riesgo), alertas de
                   silenciadas y ranking de clientes ponderado. getCFO() en queries.ts.
/app/analitica   → analítica (jun 2026): KPIs (cerrado/tasa/ticket/días a cierre),
                   gráfica cotizado vs cerrado por mes, embudo de conversión, margen
                   cedido (lista vs negociado), top clientes y top productos. Charts en
                   CSS puro; datos de getAnalytics() en queries.ts.
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
                           'approved' o 'invoiced')
/app/cotizaciones/[id]/imprimir → PDF imprimible (window.print) personalizado con
                           la marca de la org: PLANTILLA (clasico|minimal|detallado vía
                           data-template en .sheet), LOGO real (ORG.logoUrl) o inicial,
                           color, contacto, mensaje, condiciones. print-color-adjust:exact.
/app/clientes /app/productos → CRUD real con modal <dialog> (POST/PATCH/DELETE
                           /api/clientes y /api/productos). Productos también con
                           IMPORTACIÓN CSV (botón → modal archivo/mapeo/preview →
                           POST /api/productos/import [dedupe por SKU] y
                           /api/clientes/import [dedupe por RFC/empresa]).
/app/ajustes     → ÍNDICE (estilo Stripe): LISTA de CATEGORÍAS (no tarjetas, no
                   rail). Ajustes YA NO va en el sidebar — se entra por el engrane de
                   la topbar. Modelo en `src/lib/settings.ts`: **CATEGORÍAS → pestañas**
                   (`SETTINGS_CATEGORIES`, `categoryOfTab()`). Cada categoría abre su
                   primera pestaña; dentro, las sub-páginas son **PESTAÑAS horizontales**
                   (NO rail lateral, jun 2026 — André lo pidió). El `SettingsShell.astro`
                   recibe `tab="x"` (deriva la categoría), pinta breadcrumb + título +
                   tabs + slot + barra de guardar opcional. Guardado GENÉRICO: junta los
                   `[data-field]` → PATCH /api/org. Categorías:
                   • Empresa: marca · fiscal · plan
                   • Cotizaciones: cotizaciones (folio/IVA/retenciones/defaults/legal) · pdf · aprobaciones
                   • Equipo y roles: equipo
                   • Avanzado: integraciones · auditoria
                   • Tu cuenta: **cuenta** → monta `<UserProfile>` de Clerk (perfil,
                     SESIONES, 2FA, passkeys, cuentas conectadas — nivel "datos de
                     usuario", distinto de los datos del negocio).
/q/[token]       → vista PÚBLICA — aprobar/rechazar REALES via POST /api/q/[token]
                   (token = secreto, sin auth); muestra estado si ya se decidió;
                   "Descargar PDF" = window.print con @media print; color de marca
                   de la org. Token demo: /q/demo
/desarrolladores/[slug] → páginas de desarrolladores (jun 2026, prerender, mismo
                   sistema que /producto/*): api (terminal curl + JSON response) y
                   mcp (chat UI con tool call). Contenido en src/lib/desarrolladores.ts.
                   Enlazadas en el megamenú DESARROLLADORES del navbar.

# API Pública (REST + MCP)
/api/notificaciones  → GET feed de actividad reciente (reusa tabla eventos; último ts para punto rojo)
/api/v1/me           → whoami (scope any)
/api/v1/cotizaciones → GET list (filtros status/limit/offset) + POST crear
/api/v1/cotizaciones/[id] → GET detalle (items + eventos)
/api/v1/clientes     → GET list + POST crear
/api/v1/productos    → GET list + POST crear
/api/v1/cobranza     → GET cartera
/api/mcp             → MCP JSON-RPC 2.0: initialize/ping/tools/list/tools/call
/api/webhooks        → CRUD webhooks salientes (POST crea y devuelve secret 1 vez)

# Legales
/privacidad      → Aviso de Privacidad Integral (LFPDPPP + DPA estándares internacionales):
                   responsable/encargado, datos recabados, finalidades, datos anonimizados,
                   cookies (Clerk + Vercel Analytics), tabla de sub-processors (Stripe/Clerk/
                   Neon/Anthropic/PAC), transferencias internacionales, M&A, seguridad
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
columna `orgs.embed_domains` (allowlist CSP para Elements). ⚠️ Correr `npm run db:migrate` tras pull.

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
`.skeleton-line`, `.ph-tab`. API JS global: `window.cordToast(msg, type, ms)`.
`sessionStorage 'cord.flash'` para flash post-navegación. Entradas con CSS `app-fadein`
escalonado (NO GSAP). Mobile: sidebar → drawer (ocupa 80vw, tab bar inferior ELIMINADA jun 2026).
En móvil la topbar muestra burger + crear (círculo) + lupa (ícono) + campana. Ayuda y config
viven en la sección `.sb-mobile-actions` dentro del drawer (oculta en desktop).
⚠️ Estilos de contenido inyectado por JS (Cmd+K items, notif panel, toasts, pins)
DEBEN vivir en `<style is:global>` — Astro scopea por `[data-astro-cid]` y el HTML
dinámico no lleva ese atributo. NO moverlos al bloque `<style>` scopeado.

---

