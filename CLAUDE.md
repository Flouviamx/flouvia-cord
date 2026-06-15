# Trato — CLAUDE.md

SaaS de cotizaciones B2B standalone de Flouvia. Dominio: **trato.flouvia.com**.
Es la versión independiente de la app de Shopify "Flouvia Cotizaciones B2B"
(repo hermano: `../flouvia/src/data/apps.ts`), dirigida a **cualquier negocio B2B
en México** — no solo Shopify.

> **Repo:** `~/Desktop/flouvia-trato` (carpeta HERMANA de `~/Desktop/flouvia`, NO
> anidada — son dos repos git y dos proyectos Vercel independientes).
> GitHub: `github.com/Flouviamx/flouvia-trato`. Deploy automático en Vercel a
> `trato.flouvia.com` con cada push a `main`.

---

## Comandos

```bash
npm run dev      # localhost:4321
npm run build    # build de producción
npm run preview  # preview del build
```

Node requerido: **>=22.12.0** (ver `.nvmrc` → 22.13.0)

---

## Stack (idéntico a flouvia-web)

| Capa | Tecnología |
|------|-----------|
| Framework | Astro 6.1.2 (`output: 'server'`) + `@astrojs/vercel` |
| Auth | Clerk (`@clerk/astro`) — **signup ABIERTO** (no invitation-only como el portal de flouvia) |
| DB | **Neon (PostgreSQL serverless)** — schema en `db/schema.sql`. Decisión jun 2026: Neon en vez de Supabase. Crear vía Vercel Marketplace → integración Neon (auto-provisiona `DATABASE_URL`). |
| Billing | Stripe Billing (freemium) |
| Emails | Resend (transaccionales: cotización vista, aprobada, etc.) |
| CFDI | PAC de timbrado (mismo proveedor que la app de Shopify) |
| Animaciones | GSAP 3 — **solo en landing/login**; dentro de la app, CSS animations |
| Analytics | **Vercel Analytics** (`@vercel/analytics`) — `<Analytics />` en `Layout.astro` y `AppLayout.astro` |
| Tipografía | **Inter única** (las serif se ELIMINARON jun 2026 a petición de André) — montos con clase `.editorial` = Inter 600, tracking −0.03em, `tabular-nums` |

✅ **Clerk YA está ACTIVO** (jun 2026): integración en `astro.config.mjs` con
`localization: esMX` (`@clerk/localizations`), keys de development en `.env`,
middleware en `src/middleware.ts`, componentes `<SignIn/>`/`<SignUp/>` montados
en `/login` y `/registro` (SSR, `prerender = false`). App de Clerk: "Trato"
(`app_3Ey07ttoq6VjvVgWmPOnI0U9rW6`), login CLI como flouvia.mx@gmail.com
(`clerk` CLI instalado en `~/.npm-global/bin/clerk`). ✅ **`/app` y las APIs
internas YA están PROTEGIDAS** (`src/middleware.ts`: sin sesión → redirect a
`/login`; APIs internas → 401; públicas `/api/q|stripe|cron` pasan). El `org_id`
se resuelve por usuario de Clerk en `getActiveOrgId()` (crea la org en el primer
login; la org demo `demo-user` solo es fallback sin sesión, ej. cron). Falta:
instancia de PRODUCCIÓN de Clerk. ✅ **Stripe Billing CONECTADO (jun 2026):**
suscripciones de 5 planes + medidores de excedente (ver "Stripe Billing" abajo).
Falta setear `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` en prod, configurar el
Customer Portal en el dashboard de Stripe y cablear los meter events de CFDI/API/
usuario (el de IA ya está cableado en `ai-draft`).

---

## Estado actual (jun 2026)

✅ Esqueleto Astro + tokens de diseño
✅ **Landing de ventas completa** (estilo Stripe/Linear con ADN Flouvia) — desplegada
✅ **Logos reales** en `public/imgs/`: `logo-trato-navy.png` (fondos claros) y `logo-trato-white.png` (fondos oscuros) — recortados a 780×300
✅ **App demo completa con datos mock** — dashboard, cotizaciones (lista + editor interactivo + detalle), clientes, productos, ajustes, link público `/q/{token}`
✅ **Clerk conectado** — `/login` y `/registro` con componentes reales (es-MX); falta proteger `/app`
✅ **Neon conectado** — la app lee/escribe real (`src/lib/queries.ts`, org demo `demo-user`)
✅ **Páginas de producto** `/producto/*` (5) + `/soluciones` — estilo Stripe, animaciones compartidas en `PageAnims.astro`
✅ **App funcional (jun 2026)** — CRUD de clientes/productos (modales), ajustes que guardan,
   acciones de cotización (enviar/aprobar/rechazar/pago/facturar), aprobar/rechazar REAL
   en `/q/[token]`, PDF imprimible personalizado por cuenta (`/app/cotizaciones/[id]/imprimir`)
✅ **Landing v2 (jun 2026)** — `/precios` dedicada (toggle anual + comparador + ROI + FAQ),
   `/soluciones/[slug]` por industria (espejo de `/producto/[slug]`), home con DEMO
   INTERACTIVO en el hero (control de 5 pasos), bug del navbar arreglado (el megamenú
   ya no baja logo/botones). Precios centralizados en `src/lib/precios.ts`.
✅ **PDF v2 (jun 2026)** — 3 plantillas (clasico/minimal/detallado), logo subible,
   y PREVIEW EN VIVO en `/app/ajustes`. Nueva columna `orgs.pdf_template`.
✅ **Importar por CSV** — productos y clientes (`/api/productos/import`, `/api/clientes/import`)
   con modal de archivo→mapeo→preview en `/app/productos` y `/app/clientes`.
✅ **Analítica** — `/app/analitica` (ventas/conversión, margen cedido, top clientes/productos)
   + KPI "por dar seguimiento" en el dashboard. Consultas en `getAnalytics()`.
✅ **Duplicar cotización** — `/api/cotizaciones/[id]/duplicate` (clona a nuevo borrador).
✅ **Enviar por WhatsApp** — botón en el detalle (wa.me con mensaje + link pre-armado).
✅ **Cobranza** — `/app/cobranza`: cartera, vencido, aging, exposición por cliente,
   marcar cobrada + recordatorio por WhatsApp. getCobranza() en queries.ts.
✅ **Forecast en Analítica** — pronóstico de cartera abierta (pipeline ponderado:
   enviadas 30% + vistas 50%) + comparativo cerrado vs mes anterior.
✅ **Link público 2.0** — en `/q/[token]`: contraoferta + chat (comentarios) del cliente;
   el vendedor responde desde el detalle (caja de respuesta → evento `reply`). Sin
   migración (usa `eventos` tipos comment/counter/reply). getCotizacionByToken devuelve
   `conversacion`. Pendiente: aprobación parcial por línea (necesita columnas en items).
✅ **IA: armar cotización desde texto** — `/api/cotizaciones/ai-draft` (SDK @anthropic-ai/sdk,
   tool_choice forzado; modelo claude-opus-4-8 vía AI_MODEL) + panel "Armar con IA" en el
   editor `/nueva`. Empareja el pedido del cliente con el catálogo. Requiere ANTHROPIC_API_KEY.
✅ **Topbar v2 + Menú de comandos (Cmd+K)** — AppLayout con buscador + iconos; overlay
   global de comandos (navegación + acciones + búsqueda en vivo vía `/api/search`).
✅ **Presencia en vivo** — el cliente con `/q/[token]` abierto manda heartbeat
   (`POST /api/q/[token]` action `ping` → `cotizaciones.viewer_last_seen`); el vendedor
   ve "lo está viendo ahora" en el detalle (poll `/api/cotizaciones/[id]/presence`).
✅ **Guía de configuración v2 — Widget flotante dinámico (jun 2026)** — tarjeta
   acordeón fijada abajo-derecha (`src/components/app/OnboardingWidget.astro`):
   pasos por `getSetupProgress()` (marca/fiscal/productos/clientes/cotización),
   uno abierto a la vez, check animado al completar. Estado MINIMIZADO → píldora
   "Guía de configuración" con anillo SVG radial en la topbar de `AppLayout`.
   **Estado global persistente** entre páginas (store vanilla en `window.__tratoOnb`
   + `localStorage` clave `trato.onb.v1` — equivalente de Zustand/Context en Astro SSR).
   **Auto-completado por BD**: polling a `/api/onboarding/progress` cada 15 s +
   `visibilitychange`/`focus` — los pasos se marcan solos sin recargar. Al llegar
   a 100% celebra y se auto-descarta. `?guia=1` resetea el estado. La card inline
   del dashboard fue ELIMINADA. `src/lib/onboarding.ts` + `/api/onboarding/seed`
   quedan como código muerto (reutilizable si se quiere "precargar ejemplos").
✅ **Pipeline Kanban + Tareas** — toggle Lista/Tablero en `/app/cotizaciones` (drag&drop
   avanza el pipeline vía PATCH actions); tarjeta de "Tareas y recordatorios" en el
   dashboard (`/api/tareas`, tabla `tareas`, getTareas()).
✅ **Listas de precio por nivel** — clientes con `nivel` (estandar/plata/oro/distribuidor)
   y `descuento_pct`; el editor aplica el descuento del nivel a las líneas al elegir cliente.
✅ **Flujos de aprobación** — umbrales en Ajustes (`orgs.aprob_descuento_max`, `aprob_monto_max`);
   si al enviar se rebasan, la cotización queda `aprob_estado='pendiente'` (no se envía) y
   gerencia aprueba/rechaza desde el detalle (`approve_request`/`reject_request`) o el filtro
   "Por aprobar" de la lista.
✅ **Tesorería predictiva + interés moratorio** — en Cobranza: interés compuesto sobre saldo
   vencido (`orgs.interes_moratorio_pct`) y flujo de caja esperado (retraso de pago promedio
   real del historial). En getCobranza().
✅ **Cron de interés moratorio (jun 2026)** — `/api/cron/intereses` (cron en `vercel.json`,
   día 1 de cada mes a las 6am UTC, protegido por `CRON_SECRET`). Para cada org con
   `interes_moratorio_pct > 0`, aplica `saldo × tasa%` a todas las cotizaciones vencidas
   y registra el cargo en tabla **`intereses_moratorios`** (org_id, cotizacion_id, periodo
   'YYYY-MM', tasa_pct, saldo_base, monto, dias_vencido). Idempotente por
   `UNIQUE(cotizacion_id, periodo)`. NO modifica `cotizaciones.total` (preserva original).
   Manda correo-resumen al owner de la org si hay `RESEND_API_KEY`. Cada cargo queda en
   `audit_log` (acción `interes_moratorio.aplicado`). ⚠️ Correr `npm run db:migrate` (1 tabla nueva).
✅ **Audit log inmutable** — tabla `audit_log` + helper `logAudit()`/`reqIp()` en db.ts;
   instrumentados org/cotizaciones/clientes/productos; vista de solo-lectura en Ajustes.
✅ **Recordatorios de cobro (Resend)** — `/api/cron/recordatorios` (cron en `vercel.json`,
   diario a las 9am UTC) manda correos 3 días antes del vencimiento vía Resend (REST).
✅ **Correo al enviar cotización (Resend)** — helper `src/lib/email.ts` (`notifyQuoteSent`/
   `sendEmail`); al crear-con-envío (`POST /api/cotizaciones`) o acción send/resend
   (`PATCH /api/cotizaciones/[id]`) se manda el link público al correo del cliente y se
   registra evento `email`. **Gated por `RESEND_API_KEY`**: sin la llave NO se manda nada
   (por eso un envío de prueba no llega por correo) — el link se genera igual. Falta:
   verificar dominio en Resend + setear `RESEND_API_KEY`/`RESEND_FROM`.
✅ **Pago en línea (Stripe)** — botón en `/q/[token]` → `/api/q/[token]/checkout` (Stripe
   Checkout vía REST) + `/api/stripe/webhook` marca `paid`. Gated por `STRIPE_SECRET_KEY`.
✅ **Navbar con estado de sesión (jun 2026)** — `Nav.astro` detecta sesión en el cliente
   vía `$authStore` de `@clerk/astro/client` (nanostores). El markup estático (landing
   `prerender:true`) muestra por defecto "Entrar" + "Empezar gratis"; al detectar sesión
   se intercambian a "Ver planes" (`/precios`) + "Ir al Dashboard" (`/app`). Cubre las 3
   zonas: botones derecha desktop, CTA inferior móvil y overlay del menú móvil. Usa
   `data-auth-swap`/`data-in-*`/`data-out-*` como atributos de datos en los nodos del DOM;
   el script se suscribe a `$authStore` y aplica el cambio al resolver. Sin FOUC para el
   visitante anónimo (el caso común de la landing); swap ocurre tras carga de clerk-js.
✅ **TRATO Elements — cotizador embebible (jun 2026, FASE 1: iframe)** — el cotizador
   `/q` vive ahora dentro del sitio de un tercero vía `<iframe>`. El corazón se extrajo
   a `src/components/q/QuoteCard.astro` (REUTILIZADO por `/q/[token]` y `/embed/[token]`;
   es la semilla del futuro paquete npm `@flouviahq/elements`). El componente emite
   CustomEvents en `window` (`trato:approved`/`rejected`/`message`/`pay`).
   • `/embed/[token]` (`EmbedLayout`, fondo transparente, sin chrome) setea el header
     CSP `frame-ancestors` desde la allowlist `orgs.embed_domains` (anti-clickjacking;
     vacío = abierto, modo demo) y hace de puente: `ResizeObserver` → `postMessage`
     `trato:resize` (auto-altura) + relay de eventos al window padre.
   • `public/embed.js` = loader de "una línea": `<script src=…/embed.js>` + `<div
     data-trato-cotizador data-token="…">` inyecta el iframe, ajusta altura y re-emite
     los eventos como CustomEvents sobre el div anfitrión.
   • Ajustes › Developers › **Cotizador embebible** (`/app/ajustes/elements`): copia el
     snippet (con token real reciente) + gestiona dominios autorizados (`embed_domains`
     vía save genérico → `/api/org`). Nueva columna `orgs.embed_domains`.
   • **Landing `/elements`** (prerender, estilo Stripe Checkout): hero con un `<iframe>`
     EN VIVO de `/embed/demo` dentro de un mockup de browser ("portal.tucliente.com") —
     la página se demuestra a sí misma. Snippet, 3 pasos, features en LISTA (hairline,
     no tarjetas), sección de eventos para devs y CTA. Enlazada en el megamenú Producto
     del navbar. Usa `PageAnims` (masked-titles/reveals).
   • **Mejoras al loader (`embed.js`)**: skeleton con shimmer mientras carga + fade-in al
     `trato:ready` (adiós a la caja vacía), `MutationObserver` auto-monta embeds inyectados
     después (SPAs/modales), `referrerpolicy`, `data-min-height`, respeta reduced-motion.
     El embed reporta altura del `.embed-wrap` y emite `ready` tras `fonts.ready`.
✅ **TRATO Elements — FASE 2: paquete npm `@flouviahq/elements` (jun 2026)** — versión
   framework-native del embed, en `packages/elements/` (monorepo ligero, NO toca la app
   Astro; extraíble a su propio repo — solo habla con el iframe `/embed/*`). Arquitectura
   estilo Stripe: **core agnóstico** (`src/core.ts` = `mountCotizador(el, opts)` → iframe +
   skeleton + postMessage + relay, con `destroy()`), **Web Component** `<trato-cotizador>`
   (`src/element.ts`, auto-registrado al importar; re-emite eventos NATIVOS sin prefijo:
   `approved`/`pay`/… para HTML/Vue/Astro/Svelte), y **wrapper React** (`src/react.tsx`
   → `@flouviahq/elements/react`, `<TratoCotizador token onApproved … />`, React peer OPCIONAL).
   Build con **esbuild** (`build.mjs` → ESM+CJS para `.` y `./react`; React externo); tipos
   `.d.ts` escritos A MANO en `types/` (no hay typescript instalado). `package.json` con
   exports map dual. Verificado E2E con Playwright: WC registra, `ready` dispara, auto-altura
   (300→1292px), `q-card` carga, 0 errores. Los tabs de `/elements` ahora muestran el paquete
   (React/Next usan `@flouviahq/elements/react`; Astro/Vue el WC; HTML/WordPress siguen con
   `embed.js`). ✅ **PUBLICADO en npm como `@flouviahq/elements` v0.1.0** (el scope `@trato`
   no estaba disponible → se usó la org `@flouviahq`). Re-publicar: subir `version` en
   `package.json` + `cd packages/elements && npm run build && npm publish`. El nombre del
   Web Component sigue siendo `<trato-cotizador>` (es marca de producto, no del paquete).
✅ **API Pública (jun 2026)** — infraestructura de llaves API (`api_keys`, hashes SHA-256,
   nunca en claro) + auth Bearer en `src/lib/apikey.ts` (`authApiKey`, `withApiAuth`).
   Endpoints REST en `/api/v1/*`: `GET /me`, `GET|POST /cotizaciones`, `GET /cotizaciones/[id]`,
   `GET|POST /clientes`, `GET|POST /productos`, `GET /cobranza`. Llaves test (`sk_test_`) /
   live (`sk_live_`): las test no requieren plan; las live requieren plan Negocio. Scopes:
   `read` / `write`. Tenancy M2M via `reqContext.run({userId:null, orgId})` (override en
   `src/lib/context.ts`; `getActiveOrgId()` lo checa primero). Serializers sin exponer tokens
   internos en `src/lib/apiv1.ts`. Lógica única de creación de cotización extraída a
   `src/lib/cotizaciones.ts` (usada por `/api/cotizaciones` y `/api/v1/cotizaciones`).
✅ **MCP — servidor JSON-RPC 2.0 (jun 2026)** — en `/api/mcp` (`src/pages/api/mcp.ts`);
   auth Bearer mismo `authApiKey`. Métodos: `initialize`, `ping`, `tools/list`, `tools/call`.
   7 herramientas definidas en `src/lib/mcp.ts`: `listar_cotizaciones`, `detalle_cotizacion`,
   `cartera_vencida`, `resumen_negocio`, `buscar_cliente`, `listar_productos`,
   `crear_cotizacion_borrador`. Herramientas write comprueban scope; errores de negocio
   devuelven `isError: true` (no protocol error). Stateless (sin sesiones persistentes).
✅ **Webhooks salientes (jun 2026)** — tabla `webhooks` (url, eventos jsonb, secret en claro
   para firma, activo, last_status/last_error). Motor en `src/lib/webhooks.ts`:
   `dispatchQuoteEvent(orgId, cotizacionId, evento)` — best-effort (NUNCA lanza), 5s timeout,
   1 retry (300ms backoff), firma HMAC-sha256 en header `X-Trato-Signature: sha256=<hex>`.
   Payload: `{ event, created_at, data: { id, folio, status, total, cliente, link_publico } }`.
   Enganchado en los 6 eventos: `quote.sent`, `quote.viewed`, `quote.approved`,
   `quote.rejected`, `quote.paid`, `quote.invoiced` (5 archivos). CRUD en `/api/webhooks`
   (requiere permiso `ajustes` + plan API). Secret mostrado UNA vez al crear, luego enmascarado.
   UI funcional en Ajustes › Developers (lista, toggle activo/inactivo, eliminar, modal crear).
✅ **Developers PRO (jun 2026)** — observabilidad estilo Stripe/GitHub en Ajustes › Developers
   (`/app/ajustes/api`). **Log de entregas de webhooks + replay:** tabla nueva
   `webhook_deliveries` (cada intento con evento/status/error/intento/duración/`request_body`
   para re-enviar exacto + `response_body`); `deliver()` en `webhooks.ts` registra CADA intento
   y guarda el resumen; `sendTestEvent()` (evento `ping` de prueba) y `redeliver()` (replay).
   En `/api/webhooks`: `GET ?deliveries=<id>`, POST `{action:'test'}` y `{action:'redeliver'}`.
   UI: cada endpoint se DESPLIEGA → log con dot ok/err + status + latencia + botón "Reintentar"
   por entrega, y botón "Probar" por endpoint. **Log de requests del API:** tabla nueva
   `api_requests`; `withApiAuth` (apikey.ts) loguea cada llamada (método/ruta/status/ms/ip,
   best-effort) → sección "Actividad del API" con stats 24h (total/errores/latencia) + lista,
   refrescable vía `GET /api/dev/activity`. **MCP pro:** connect card con config Claude
   Desktop/Cursor/URL (copy) + catálogo de las 7 tools (desde `MCP_TOOLS`, con scope) +
   **probador en vivo** (`POST /api/mcp/playground`, sesión, solo tools de lectura, corre el
   handler real y muestra el JSON). **API keys:** modal de creación con selector de scope
   (lectura/escritura) en vez de `prompt()`. `getWebhookDeliveries`/`getApiActivity` en queries.ts.
   ⚠️ Correr `npm run db:migrate` (2 tablas nuevas).
✅ **FASE 3 — nuevas secciones de configuración (jun 2026)** — 4 secciones nuevas en Ajustes,
   todas con backend REAL. ⚠️ Correr `npm run db:migrate`.
   • **Portal del cliente** (`/app/ajustes/portal`, pestaña bajo *Branding*) — personaliza la
     página pública `/q`: `portal_banner`, `portal_bienvenida` (ya existía), toggles
     `portal_mostrar_chat` (oculta chat/contraoferta) y `portal_powered` (quita "enviado vía
     Trato" + watermark; gated por plan). PREVIEW en vivo. **Cableado REAL:** `QuoteCard.astro`
     pinta banner/bienvenida y oculta `.q-chat`; `/q/[token].astro` oculta watermark + loop
     viral; `getCotizacionByToken` devuelve los campos portal_*.
   • **Correo** (`/app/ajustes/correo`, pestaña bajo *Notificaciones*) — remitente y plantilla
     del correo transaccional: `email_from_name` (nombre visible), `email_reply_to`,
     `email_intro`, `email_firma` con variables `{cliente}{folio}{total}{negocio}`. PREVIEW de
     email. **Cableado REAL:** `email.ts` `sendEmail` acepta `fromName`/`replyTo` (dominio fijo
     al verificado en Resend, nombre libre); `notifyQuoteSent` usa intro/firma/remitente custom.
   • **Impuestos** (`/app/ajustes/impuestos`, pestaña bajo *Cotizaciones*) — tabla nueva
     `impuestos` (nombre, tipo iva|ieps|ret_iva|ret_isr|exento, tasa, es_default). CRUD en
     `/api/impuestos`. **Cableado REAL:** el perfil `es_default` de tipo iva/ret_iva/ret_isr
     SINCRONIZA `orgs.iva_pct`/`retencion_*` (vía `syncOrg`), así el editor lo usa sin refactor.
   • **Integraciones reales — Slack** (`/app/ajustes/integraciones`) — `slack_webhook_url` ya
     existía (solo guardaba); ahora **postea de verdad**: `src/lib/slack.ts` (`postToSlack`,
     best-effort, nunca lanza) enganchado en `dispatchQuoteEvent` (1 punto → los 6 eventos).
     UI: bloque Slack con input de Incoming Webhook + guardar (`/api/org/prefs`) + "Enviar
     prueba" (`/api/integraciones/slack-test`). Nuevas cols `orgs`: portal_*/email_* (7).
✅ **Páginas de desarrolladores (jun 2026)** — `/desarrolladores/[slug]` (prerender, mismo
   sistema visual que `/producto/*`): `/desarrolladores/api` (terminal con curl + JSON response)
   y `/desarrolladores/mcp` (chat UI con tool call `cartera_vencida`). Contenido en
   `src/lib/desarrolladores.ts`. Animaciones `PageAnims`, masked-titles, count-ups, reveals.
✅ **Navbar v3 (jun 2026)** — nuevo megamenú DESARROLLADORES entre SOLUCIONES y RECURSOS:
   paneles API REST · MCP para IA · Trato Elements. PRECIOS movido al final como link simple.
   Orden: PRODUCTO · SOLUCIONES · DESARROLLADORES · RECURSOS · PRECIOS.
✅ **Footer v2 (jun 2026)** — expandido de 3 a 5 columnas: /01 Producto · /02 Soluciones ·
   /03 Desarrolladores · /04 Recursos · /05 Empresa. Trust chips en el bloque de marca
   (🇲🇽 Hecho en México · CFDI 4.0 · Datos cifrados). Grid responsive (≤1020px → 3 cols,
   ≤620px → 2 cols).
✅ **Vercel Analytics (jun 2026)** — `@vercel/analytics` instalado; componente `<Analytics />`
   montado en `Layout.astro` (landing) y `AppLayout.astro` (app). Page views y eventos se
   recopilan automáticamente en el dashboard de Vercel sin configuración adicional.
⬜ Pendiente: aprobación parcial por línea, versiones de cotización, multi-usuario con Clerk
   (proteger `/app`), Stripe Billing de suscripciones (planes).

---

## Modelo de negocio

Freemium tipo la app de Shopify: gratis hasta 5 cotizaciones activas con
"Powered by Trato" en el link público; planes de pago vía Stripe Billing.
**Matriz maestra de 5 niveles (jun 2026)** — MXN/mes, IVA incluido, **Pro = el
ancla** (destacado en la landing):

| Plan | Precio | Posición | Incluye (resumen) |
|------|--------|----------|-------------------|
| Gratis | $0 | gancho | 5 cotizaciones, 50 prod/cli, 3 IA/mes, "Powered by Trato" |
| Starter | $240 | freelance | 50 cotizaciones, 500 prod/cli, 20 IA + 3 CFDI/mes, tu marca, CSV |
| **Profesional** | **$590** | **DESTACADO** | Ilimitadas, 5 usuarios, 50 IA + 20 CFDI/mes, seguimiento en vivo, analítica, audit log |
| Scale | $1,390 | corp | + 15 usuarios, 500 IA + 100 CFDI/mes, aprobaciones, cobranza, SMTP propio |
| Developer | $2,990 | infra | + usuarios/IA ilimitados, 1,000 CFDI + 50,000 API/mes, excedentes más baratos |

Cada plan de pago trae cuota mensual (IA/CFDI/API/usuarios); el **excedente se
cobra por uso** vía Stripe Billing Meters (de Pro en adelante; Free/Starter =
topes duros). Código de plan en `orgs.plan`: `free|starter|pro|scale|developer`.
Cuotas incluidas y mapping de price_id/meter en **`src/lib/billing.ts`**.

> ⚠️ Precios son placeholders comerciales — André los puede ajustar. Si cambian,
> actualizar **`src/lib/precios.ts`** (FUENTE ÚNICA desde jun 2026): la consumen
> tanto la sección del home (`Pricing.astro`) como la página `/precios`. Ahí también
> viven la comparativa (`COMPARATIVA`) y el FAQ de precios (`FAQ_PRECIOS`).

Moneda v1 = MXN con IVA 16% configurable. Landing + app en el MISMO subdominio
(estilo linear.app: marketing en `/`, app en `/app`).

### Stripe Billing (suscripciones + medidores de uso) — jun 2026

REST puro (sin SDK), igual que el resto de la integración Stripe. Config CENTRAL
en **`src/lib/billing.ts`**: `PLAN_PRICES` (price_id base × ciclo mensual/anual),
`METER_PRICES` (price_id medido por plan × dimensión), `METERS` (mtr_ ids),
`INCLUDED` (cuota mensual por plan), `PRICE_TO_PLAN` (reverse, para el webhook),
y helpers `stripe()`, `getOrCreateCustomer()`, `reportUsage(orgId, dim, n)`.

Flujo:
- **Alta/cambio de plan:** `POST /api/billing/subscribe {plan, cycle}` (INTERNA,
  exige sesión) → Checkout `mode=subscription` con precio base + items medidos.
  **Sin periodo de prueba** (eliminado jun 2026): Stripe exige tarjeta en el
  checkout y cobra desde el alta. El CTA de los planes dice "Empezar ahora".
- **Gestionar:** `POST /api/billing/portal` → Customer Portal de Stripe.
- **Webhook** `POST /api/stripe/webhook` (PÚBLICO, firma HMAC, idempotente vía
  tabla `stripe_events`): `customer.subscription.created/updated` sincroniza
  `orgs.plan/subscription_status/billing_cycle/current_period_end` (**cambio de
  plan en vivo**); `.deleted` → free; `invoice.paid|payment_failed` → estado;
  `checkout.session.completed` liga la suscripción (subscription) o marca la
  cotización `paid` (payment, flujo del link público — sin cambios).
- **Excedente (overage):** `reportUsage()` incrementa `uso_periodo` en Neon (UI en
  vivo) **y** manda un meter event a Stripe (cobro al cierre). Los 4 dims ya
  están cableados (jun 2026): `ia` (`ai-draft`), `timbrado` (`cotizaciones/[id]`
  al facturar), `api` (`apikey.ts` en cada llamada live) y `usuario`
  (`equipo/join` al aceptar invitación).
- **UI:** `/app/ajustes/plan` usa `getBillingUsage()` (medidores IA/CFDI/API del
  periodo) + botones reales de subir de plan / portal.
- Tablas nuevas: `uso_periodo` (org+periodo, contadores) y `stripe_events`
  (idempotencia). Columnas nuevas en `orgs`: `subscription_status`,
  `billing_cycle`, `current_period_end`. **Correr `npm run db:migrate` tras pull.**
- Los price_id/meter_id NO son secretos (viven en `billing.ts`); el secreto es
  `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (env).

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
Pendiente: ocultar controles en el FRONT por permiso (hoy el gate es backend; un
vendedor ve el botón pero recibe 403), org switcher (un usuario activo = 1 org),
y migrar a Clerk Organizations nativo si se quiere SSO/switch nativo. NOTA: el
"approach Clerk Organizations" elegido se implementó como **membresía propia** porque
habilitar Organizations es config del dashboard de Clerk (no codeable aquí); la
identidad sigue siendo Clerk (userId), solo la membresía/permiso es nuestra.

**Tablas** (`db/schema.sql`):
- `orgs` — el negocio (nombre, logo, datos fiscales/RFC/CSD, `quote_prefix`, plan, Stripe IDs)
- `productos` — catálogo de cada org
- `clientes` — a quién se cotiza (con `terminos_default` y `limite_credito`)
- `cotizaciones` — status `draft|sent|viewed|approved|rejected|expired|paid|invoiced` + `public_token` (para `/q/{token}`)
- `cotizacion_items` — líneas (permite línea libre sin producto; `precio_negociado` opcional)
- `eventos` — timeline + "tu cliente vio la cotización" (**feature estrella**)
- `facturas_cfdi` — timbrado SAT (fase 4)
- `org_members` — equipo multi-usuario (rol, permisos jsonb, estado, token invitación)
- `tareas` — recordatorios CRM del vendedor
- `audit_log` — registro inmutable de acciones (logAudit/reqIp)
- `api_keys` — llaves API públicas (hash SHA-256, mode test|live, scope read|write)
- `webhooks` — endpoints salientes (HMAC-sha256, best-effort, 1 retry)
- `intereses_moratorios` — cargos mensuales de interés moratorio por cotización (cron día 1; idempotente por cotizacion_id+periodo)

Patrón RLS: `org_id = current_setting('app.org_id', TRUE)::uuid` — el backend setea
el valor antes de cada query (igual que `app.email_cliente` en flouvia-web).

---

## Mapa de rutas

```
# Landing (prerender:true) — CONSTRUIDA
/                → landing de ventas (un solo index.astro que monta los componentes)
/producto/[slug] → páginas de producto (jun 2026, estilo Stripe): editor,
                   link-publico, seguimiento, cfdi, clientes-credito. Contenido en
                   src/lib/producto.ts; mockup por feature en [slug].astro;
                   animaciones compartidas en components/landing/PageAnims.astro
                   (masked titles via clase .masked-title, hero .pp-hero)
/precios         → página dedicada (jun 2026): toggle mensual/anual (2 meses gratis),
                   comparador completo, calculadora de valor (ROI) y FAQ.
                   Datos en src/lib/precios.ts (FUENTE ÚNICA de planes/comparativa/FAQ).
/soluciones      → HUB por industria (anclas + cada bloque enlaza a su detalle).
/soluciones/[slug] → página rica por industria (jun 2026, espejo de /producto/[slug]):
                   distribuidoras, construccion, manufactura, servicios. Contenido en
                   src/lib/solucion.ts; mockup propio por industria en [slug].astro.
/elements        → TRATO Elements (jun 2026, estilo Stripe Checkout): el cotizador
                   embebible. Hero con <iframe> EN VIVO de /embed/demo en un mockup de
                   browser; snippet, pasos, features (lista), eventos dev. Enlazada en
                   el megamenú Producto.
/embed/[token]   → cotizador embebible (TRATO Elements) para <iframe> de terceros.
                   Reutiliza components/q/QuoteCard.astro (mismo corazón que /q) con
                   EmbedLayout (sin chrome). Setea CSP frame-ancestors desde
                   orgs.embed_domains; postMessage resize + relay de eventos. Loader:
                   public/embed.js. export const prerender = false.

# App — CONECTADA a Neon (src/lib/queries.ts); usa AppLayout.astro
/login /registro → Clerk SignIn/SignUp (es-MX)
/app             → dashboard: KPIs (incl. "por dar seguimiento"), pipeline, recientes, feed
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
/api/v1/me           → whoami (scope any)
/api/v1/cotizaciones → GET list (filtros status/limit/offset) + POST crear
/api/v1/cotizaciones/[id] → GET detalle (items + eventos)
/api/v1/clientes     → GET list + POST crear
/api/v1/productos    → GET list + POST crear
/api/v1/cobranza     → GET cartera
/api/mcp             → MCP JSON-RPC 2.0: initialize/ping/tools/list/tools/call
/api/webhooks        → CRUD webhooks salientes (POST crea y devuelve secret 1 vez)

# Legales (pendiente)
/privacidad /terminos
```

**Columnas de personalización en `orgs`** (jun 2026, al final de `db/schema.sql`
como `alter table … if not exists`): `color_marca`, `email_contacto`, `telefono`,
`direccion`, `pdf_mensaje`, `pdf_condiciones`, `pdf_mostrar_lista`, **`pdf_template`**
(clasico|minimal|detallado, agregada jun 2026). `logo_url` (en la tabla base) ahora
guarda también data URLs de logos subidos en Ajustes. **Jun 2026 además:**
`cotizaciones.viewer_last_seen` (presencia), tabla **`tareas`** (CRM), y la **fase
enterprise**: `clientes.nivel`/`descuento_pct` (price tiers), `orgs.aprob_descuento_max`/
`aprob_monto_max`/`interes_moratorio_pct` + `cotizaciones.aprob_estado`/`aprob_motivo`
(aprobaciones), y la tabla **`audit_log`**. **Superpoderes de config (jun 2026):**
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

**AppLayout (`src/layouts/AppLayout.astro`):** sidebar navy sticky (logo blanco,
nav con íconos, card de org abajo), topbar con título + badge "DEMO" + slot
`topbar-actions`, content max-width 1240px. Entradas con CSS `app-fadein`
escalonado (NO GSAP — la app no carga GSAP). Mobile: sidebar → tab bar inferior
fija. Clases globales reutilizables: `.card`, `.status-pill`, `.editorial`.

---

## Landing — estructura (YA CONSTRUIDA)

`src/pages/index.astro` monta los componentes de `src/components/landing/` y maneja
las animaciones GSAP globales. Orden de secciones:

| Componente | Sección | Notas |
|-----------|---------|-------|
| `Nav.astro` | Navbar | Replica el sistema de flouvia (ver abajo) |
| `Hero.astro` | Hero | Gradient mesh + mockup de la app + trust strip |
| `Features.astro` | Producto (`#producto`) | Bento grid con mini-mockups |
| `Steps.astro` | Cómo funciona (`#como`) | 3 pasos sobre fondo navy |
| `ClientView.astro` | Experiencia del cliente | Mockup de teléfono del link público `/q/` |
| `Pricing.astro` | Precios (`#precios`) | 3 planes, el de en medio destacado en navy |
| `Faq.astro` | FAQ (`#faq`) | Acordeón animado (botones + grid 0fr→1fr; uno abierto a la vez) |
| `Footer.astro` | CTA final + footer | Navy, enlaza a flouvia.com. Acepta props `ctaTitle`/`ctaSub` (las subpáginas personalizan el CTA) |

**Filosofía visual (jun 2026):** referencias = **Stripe + Linear**, alma = **Flouvia**.
Minimalista, lujoso, mucho aire. Secciones con `padding: 9rem` vertical. Tipografía
grande (hero H1 `clamp(2.7rem, 6.2vw, 5rem)`). Gradient mesh sutil monocromático
navy (NO los colores saturados de Stripe). Glows suaves estilo Linear bajo los
mockups. **El mockup del producto es la pieza que vende** — cada uno es HTML/CSS puro
con montos en `.editorial` (Inter 600 tabular). El mockup del hero AUTO-REPRODUCE
la historia del producto en loop (ver "Hero story" abajo).

### Navbar (`Nav.astro`) — replica el sistema de flouvia-web

Es el mismo patrón que `../flouvia/src/components/Navbar.astro`, adaptado:
- **Top-bar** oscuro editorial: "PLATAFORMA DE COTIZACIONES B2B · UN PRODUCTO DE FLOUVIA · HECHO EN MÉXICO".
- **Glass pill** (izquierda) Liquid Glass con los nav-links + **indicador deslizante**
  (`#nav-indicator`, cápsula de vidrio que GSAP desliza al link en hover, estilo
  segmented control iOS).
- **Megamenús (jun 2026):** estructura = PRODUCTO · SOLUCIONES · PRECIOS · RECURSOS.
  Tres triggers `data-mega` (producto/soluciones/recursos), cada uno con su panel
  `.pill-mega[data-panel=…]`; la píldora se expande EN VERTICAL y revela el panel
  activo. Cerrado colapsa `width:0; height:0`; GSAP anima width/height midiendo
  `offsetWidth` antes/después; cambiar de trigger con otro abierto colapsa el
  anterior al instante y abre el nuevo. Items con stagger fade+blur,
  `border-radius 100px → 24px` vía `.mega-open`; caret rota con `.mega-active`
  en el trigger (no con `.mega-open` global). Abre con hover/click, cierra con
  mouseleave, links sin mega, scroll y Escape. Variantes `.scrolled` (navy).
  Links del nav usan rutas absolutas (`/#precios`) para funcionar desde subpáginas.
- **Logo central** `logo-trato-navy.png` (30px alto) que **desaparece al hacer
  scroll** y reaparece como `pill-logo` (`logo-trato-white.png`, 17px) dentro de la
  glass pill navy (misma mecánica que el logo de flouvia). En mobile: dos `<img>`
  apiladas (navy/white) que se intercambian por opacity con `.scrolled`.
- **Derecha:** píldora glass "Entrar" con ícono de usuario (`.nav-login-pill`,
  estilo flouvia.com; versión navy en `.scrolled`) + botón navy "Empezar gratis".
- **Estado `.scrolled`** (>50px): la glass pill pasa a versión navy translúcida; los
  links y wordmark cambian a blanco. Transición por-propiedad `0.7s var(--ease-spring)`.
- **Mobile:** píldora glass con hamburguesa + wordmark + CTA; overlay con `clip-path:
  circle()` que abre desde la esquina superior derecha; links en Inter 700 con
  stagger blur (sin megamenú en mobile).
- **Anti-flash:** gate `.js-anim #navbar { opacity:0 }` (is:global) + entrada GSAP que
  oculta las piezas, revela el contenedor y las entra con stagger. `clearProps` al
  terminar para que `.scrolled`/`:hover` gobiernen.
- Diferencias vs flouvia: SIN lang switch (v1 solo español); wordmark de texto en
  vez de logos SVG. El login-icon pill SÍ existe desde jun 2026 (André lo pidió).

### Animaciones de la landing (`index.astro`) — refinadas jun 2026 (Stripe/Linear)

> El usuario RECHAZÓ: botones magnéticos, ripple de click y tilt 3D con el cursor
> ("lo típico"). No reintroducirlos. El lenguaje actual es sutil y craft:

- **Masked line reveals (Linear):** los títulos (`.hero-title, .ft-title,
  .steps-title, .cv-title, .pr-title, .faq-title, .fc-title`) se parten por `<br>`
  en líneas envueltas en `.m-line` (overflow hidden) + `.m-line-in`; cada línea sube
  con `yPercent: 115 → 0`, `power3.out`, stagger 0.09–0.11. El util `wrapLines` los
  procesa al cargar; esos títulos quedan EXCLUIDOS del reveal genérico (`maskedSet`).
- **Mockup settle (Stripe):** el mockup del hero entra con `rotationX: 9` y
  perspectiva, y se APLANA con scrub conforme baja el scroll (`top 88%` → `top 32%`).
- **Hero story (jun 2026):** el mockup del hero narra el loop del producto:
  badge `#mkStatus` cicla Enviada (azul) → Vista (ámbar) → Aprobada (verde) con
  pop, el toast `#mkToast` aparece en "Vista", los eventos `[data-story]` del
  timeline se encienden en orden y el chip `#mkChip` (CFDI timbrado) entra al
  aprobar; loop infinito con fade de cierre. El HTML por defecto es el estado
  FINAL (Aprobada) → sin JS/reduced-motion queda estático y completo.
- **Micro-demos bento (jun 2026):** en `.ev-edit` el precio baja en vivo
  (191.48 → 168.50) con flash verde y el chip −12% hace pop; el check del CFDI
  entra con pop. ScrollTrigger `once:true`.
- **Demo del teléfono (ClientView):** auto-reproducible al entrar en viewport —
  count-up del monto, items en stagger, cursor SVG que se desliza y "clickea"
  Aprobar (anillo verde de pulso), checkmark que se dibuja (strokeDashoffset),
  overlay de éxito; loop con repeatDelay 3.4s.
- **Count-up** de números (`[data-countup]` + `data-decimals`) al entrar en
  viewport — formato `Intl.NumberFormat('es-MX')`.
- **Parallax scrub** en hero-mesh. (Los watermarks de steps/footer se ELIMINARON
  jun 2026 a petición de André — ver regla de watermarks abajo.)
- **Reveals genéricos** (`.reveal`): patrón anti-parpadeo — `gsap.set` oculta +
  `ScrollTrigger {once:true, onEnter: gsap.to}` con `clearProps: 'transform'`
  (NUNCA limpiar opacity — el gate lo volvería a ocultar; bug conocido).
- Gate global `.js-anim .reveal/.reveal-mockup { opacity:0 }`; estilos `.m-line`
  en `<style is:global>`.
- `prefers-reduced-motion` → return temprano, todo visible y estático.
- El navbar maneja su PROPIA entrada (no la toca `index.astro`).

---

## Fases de construcción

1. **Núcleo** — Clerk + schema + CRUDs + editor de cotizaciones + dashboard
2. **Loop completo** — link público `/q/{token}` + tracking `viewed` + PDF + emails (Resend)
3. **Dinero** — Stripe Billing (límites del free) + pago en línea de cotizaciones
4. **CFDI + cierre** — timbrado (mismo PAC que la app de Shopify), pulir landing,
   listar Trato en `apps.ts` y footer de flouvia.com

---

## Diseño — sistema Flouvia adaptado a producto

Regla de oro: **misma alma, distinto cuerpo**. Tokens en `src/layouts/Layout.astro`
(`:root` global). Referencias visuales: **Stripe, Linear, Apple, Aesop**.

**Tokens disponibles:**
```css
--color-bg: #ffffff;  --color-bg-soft: #fcfcfc;  --color-blue-deep: #0a192f;
--color-text: #050505;  --color-text-muted: #555556;  --color-border: rgba(0,0,0,0.08);
--color-ok: #10b981;     /* aprobada / pagada */
--color-warn: #f59e0b;   /* pendiente / por vencer */
--color-danger: #ef4444; /* vencida / rechazada */
--font-sans: 'Inter';   /* --font-serif ELIMINADO jun 2026 — Inter única */
--ease-ios / --ease-spring / --ease-smooth   /* mismos que flouvia */
```

**Reglas tipográficas:**
- **Landing/login en Inter; la APP usa tipografía de SISTEMA (jun 2026, petición
  de André: "tipo Apple")** — AppLayout define `--font-sans: -apple-system,
  BlinkMacSystemFont, 'SF Pro Text', …` y NO carga Google Fonts. La landing
  (Layout.astro) sigue cargando solo Inter (weights 400–900).
- Sin serif — André pidió ELIMINARLAS (jun 2026). NO reintroducir Instrument Serif
  ni itálicas decorativas.
- **Montos y números** → clase `.editorial` (definida global en ambos layouts):
  Inter weight 600, `letter-spacing: -0.03em`, `font-variant-numeric: tabular-nums`.
  Es la firma "fintech" del producto (estilo Stripe). Nunca serif, nunca italic.
- **Headings 100% Inter bold** — sin palabra-acento.
- Eyebrows: `0.65rem`, weight 800, letter-spacing 3px, uppercase, color `#888`.
- **Logos oficiales** (`public/imgs/`): `logo-trato-navy.png` para fondos claros,
  `logo-trato-white.png` para fondos oscuros (sidebar de la app, footer, pill
  scrolled, mockups). Recortados a 780×300. NO recrear el wordmark con texto.

**Layout / componentes:**
- ⛔ **NADA de rejillas de tarjetas/cards como patrón de UI nueva (jun 2026, regla
  de André: "las cards no me gustan").** No construir hubs, índices, listados de
  features/integraciones ni settings con grids de tiles con borde+sombra. Preferir
  el estilo **Stripe/Linear de LISTAS**: filas con hairline (`border-bottom`),
  ícono + título + descripción en línea, tablas, secciones con eyebrow + hairline
  y mucho aire. Ejemplo canónico = índice de Ajustes (`/app/ajustes`) e
  integraciones (filas, NO tarjetas). Las `.card` ya existentes del dashboard/
  analítica pueden quedarse, pero NO usar card-grids para cosas nuevas.
- Secciones de la landing: `padding: 9rem` vertical (mucho aire, estilo Stripe/Linear).
- **Watermarks gigantes: ELIMINADOS del index (jun 2026, petición de André) — NO
  reintroducirlos en la landing.** Solo sobreviven en login/registro y en /q
  (fondo "Trato"). Si se usan ahí: Inter 800, letter-spacing −0.06em (`rgba(0,0,0,0.025)`
  claro / `rgba(255,255,255,0.025)` oscuro) **solo en landing/login** — dentro de la
  app NO (es herramienta, no editorial).
- Liquid Glass (blur + rim light + specular) en: navbar, topbar de la app y segmented
  controls de filtros. Patrón exacto en `Nav.astro` y en el navbar de flouvia-web.
- Sección oscura: `radial-gradient(ellipse at 20% 50%, #112240 0%, #0a192f 65%, #050b14 100%)`.
- Cards: border-radius 22–24px, sombras luxe. NO borders blancos en fondo oscuro —
  usar box-shadow profundo + `inset 0 0 0 0.5px rgba(255,255,255,0.06)`.
- Mockups: navy `#0a192f`, sombras muy profundas (`0 50px 100px -36px`), glow radial
  debajo (`.mockup-glow` / `.cv-glow`).

**Hovers:** `translateY(-2 a -4px)` + sombra, transiciones 0.4–0.6s, `--ease-spring`.
Sin scale dramático (max 1.03). Sin magnetic, sin back.out, sin elastic.

**Animación:** estándar único — `power2.out`, fade + `y:14–18`, stagger 0.08, gate
`.js-anim`. `expo.out`/`power3.out` solo para scrub o la entrada del navbar. SOLO en
landing/login. Dentro de la app: CSS animations simples (patrón portal de flouvia).
Sin SplitText, sin blur/scale en reveals de contenido.

**Bugs conocidos (heredados de flouvia, aplican igual):**
- Anti-FOUC: gate `.js-anim` (script is:inline en `<head>` del Layout, ya puesto).
- Anti-parpadeo de reveals: `gsap.set` oculta + `ScrollTrigger{once,onEnter:gsap.to}` —
  nunca `gsap.from`+`immediateRender:false`.
- `clearProps:'transform,opacity'` tras el reveal para liberar hovers.
- `overflow: clip` (no `hidden`) para no romper `position: sticky`.
- Estilos de DOM inyectado en runtime (Clerk, librerías) → `<style is:global>` porque
  Astro scopea con `[data-astro-cid]` y el DOM inyectado no lo lleva.
- `Clerk.signOut(cb)` necesita callback para no auto-navegar.

---

## Variables de entorno

Ver `.env.example`. Los proyectos de Neon, Clerk y Stripe son NUEVOS y separados
de los de flouvia.com:

```
DATABASE_URL=                                                   # Neon (PostgreSQL)
PUBLIC_CLERK_PUBLISHABLE_KEY=  CLERK_SECRET_KEY=                # signup ABIERTO
STRIPE_SECRET_KEY=  STRIPE_WEBHOOK_SECRET=  PUBLIC_STRIPE_PUBLISHABLE_KEY=
RESEND_API_KEY=  RESEND_FROM=                                   # recordatorios de cobro
CRON_SECRET=                                                    # protege /api/cron/recordatorios
PAC_API_KEY=                                                    # timbrado CFDI
ANTHROPIC_API_KEY=                                              # IA "armar cotización desde texto"
AI_MODEL=                                                       # opcional (default claude-opus-4-8)
```

Neon se recomienda provisionar vía **Vercel Marketplace → Neon** desde el proyecto
de Vercel de trato (auto-inyecta `DATABASE_URL` en todos los environments).

---

## Deployment

- **Plataforma:** Vercel (proyecto independiente del de flouvia.com).
- **Dominio:** `trato.flouvia.com` (movido al proyecto de Trato en Vercel; DNS ya
  apunta a Vercel).
- **Modo:** SSR (`output: 'server'`). La landing es `prerender: true`.
- Todas las API routes futuras necesitan `export const prerender = false`.
