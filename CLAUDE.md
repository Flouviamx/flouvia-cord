# Cord — CLAUDE.md

SaaS de cotizaciones B2B standalone de Flouvia. Dominio: **cord.flouvia.com**.
Es la versión independiente de la app de Shopify "Flouvia Cotizaciones B2B"
(repo hermano: `../flouvia/src/data/apps.ts`), dirigida a **cualquier negocio B2B
en México** — no solo Shopify.

> **Repo:** `~/Desktop/flouvia-cord` (carpeta HERMANA de `~/Desktop/flouvia`, NO
> anidada — son dos repos git y dos proyectos Vercel independientes).
> GitHub: `github.com/Flouviamx/flouvia-cord`. Deploy automático en Vercel a
> `cord.flouvia.com` con cada push a `main`.
>
> ⚠️ **Rebrand Trato → Cord (jun 2026):** el código ya está renombrado a Cord. Lo
> que sigue siendo "trato" y debe renombrarse MANUALMENTE fuera del repo: el repo de
> GitHub (`flouvia-trato` → `flouvia-cord`), la carpeta local (`~/Desktop/flouvia-trato`),
> el proyecto en Vercel y el subdominio DNS (`trato.flouvia.com` → `cord.flouvia.com`).
> Los logos (`public/imgs/logo-cord-{navy,white}.png`) conservan el arte de Trato hasta
> que André pase los nuevos. El paquete npm sigue siendo `@flouviahq/elements` (no
> contiene "trato"), pero el Web Component ahora es `<cord-cotizador>`; re-publicar para
> que el cambio llegue a quien lo consuma.

---

## Comandos

```bash
npm run dev      # localhost:4321
npm run build    # build de producción
npm run preview  # preview del build
```

Node requerido: **>=22.12.0** (ver `.nvmrc` → 24.15.0; alineado a Node 24 LTS, el default de Vercel)

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
en `/login` y `/registro` (SSR, `prerender = false`). App de Clerk: "Cord"
(`app_3Ey07ttoq6VjvVgWmPOnI0U9rW6`), login CLI como flouvia.mx@gmail.com
(`clerk` CLI instalado en `~/.npm-global/bin/clerk`). ✅ **`/app` y las APIs
internas YA están PROTEGIDAS** (`src/middleware.ts`: sin sesión → redirect a
`/login`; APIs internas → 401; públicas `/api/q|stripe|cron|clerk` pasan). El `org_id`
se resuelve por usuario de Clerk en `getActiveOrgId()` — orden: (0) API key M2M,
(0.5) Clerk active org (→ mapeo `clerk_org_id`→`orgs.id`, lazy-create si llega antes
que el webhook), (1) membresía activa en `org_members`, (2) org propia legacy,
(3) primera vez → crear. La org demo `demo-user` solo es fallback sin sesión (cron).
Falta: instancia de PRODUCCIÓN de Clerk + activar Organizations en el Dashboard
(ver sección "Clerk Organizations" abajo). ✅ **Stripe Billing CONECTADO (jun 2026):**
suscripciones de 5 planes + medidores de excedente (ver "Stripe Billing" abajo).
Falta setear `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` en prod, configurar el
Customer Portal en el dashboard de Stripe y cablear los meter events de CFDI/API/
usuario (el de IA ya está cableado en `ai-draft`). ✅ **Clerk Organizations HÍBRIDO
(jun 2026):** código completamente implementado — ver sección abajo. Falta la
config manual en el Dashboard de Clerk y correr la migración.

---

## Estado actual (jun 2026)

✅ **App shell PREMIUM "liquid glass" (jun 2026)** — rediseño del `AppLayout.astro` para sentirse Apple/Linear/Stripe:
   • **Sidebar liquid-glass** — receta del navbar (rim lights en capas + sheen `::before`) e
     **indicador deslizante tipo iOS** (`.sb-indicator`): píldora de vidrio que sigue al hover
     entre los `.sb-item` y regresa al activo. CSS puro manejado por JS mínimo
     (`initSidebarIndicator` setea `top/height/opacity`); delegación `mouseover` cubre los
     "Fijados" inyectados; respeta `prefers-reduced-motion`; reposiciona en resize/colapso.
     Fallback pre-JS: `.sb-nav:not(.sb-ind-ready) .sb-item.active` muestra un realce sutil.
   • **Sidebar colapsado pulido** — los `.sb-group-label` colapsan en alto/padding (antes
     dejaban huecos vacíos); ítems = cuadros uniformes (44×40) centrados; el indicador pasa a
     **cuadrado centrado** (`left:50%`); ancho 76px.
   • **Topbar = pill flotante de vidrio** — ya NO es barra con borde inferior: `margin:1rem`,
     `border-radius:17px`, glass con rim lights + sombra luxe, `position:sticky; top:1rem`
     (el contenido se desliza desenfocado debajo, efecto Apple). En móvil margen menor.
   • **Org switcher de vidrio** (`CustomOrgSwitcher.tsx`) — botón con hover de vidrio, avatar con
     rim/sheen, y dropdown **frosted casi-opaco** (`blur(44px)` + opacidad ~0.97 → se ve el
     vidrio pero NO se transparenta el fondo; mismo fix aplicado al menú "Crear").
✅ **Topbar PRO: botón "Crear" + Cmd+K potente + quick-add tarea (jun 2026)** —
   • Botón **"Crear"** (desktop) en `.tb-right` con menú de vidrio: Cotización · Cliente ·
     Producto · **Tarea** (abre `#qtask`, un modal quick-add → `POST /api/tareas`). El JS
     `initCreateMenu(btnId, menuId)` es genérico (reusado por el menú móvil `sbCreate` y el de
     topbar `tbCreate`). Se eliminaron los `.btn-new` "+ Nueva cotización" sueltos del dashboard
     y de la lista (el botón global los cubre).
   • **Cmd+K** ampliado: rutas de Tesorería/CFO, acciones con `?nuevo=1`, "Nueva tarea" que
     ejecuta callback (soporte `it.run` en `activate`).
✅ **Tema claro/oscuro (jun 2026)** — sistema por tokens en `AppLayout.astro`:
   `html[data-theme="dark"]` remapea `--color-bg/bg-soft/text/text-muted/border`, agrega
   `--surface`/`--surface-2` (paneles/modales migrados de `#fff` → `var(--surface)`), y mueve
   `--color-blue-deep` a un azul vivo (era invisible en oscuro; sirve de acento). Toggle sol/luna
   en la topbar + **anti-flash** vía `<script is:inline>` en `<head>` + persistencia en
   `localStorage cord.theme`. El sidebar y el org switcher ya eran navy → no cambian.
   ⚠️ **Pendiente** (follow-up): migrar los `#fff` hardcodeados de Ajustes (`/app/ajustes/*`),
   editores (`cotizaciones/nueva`/`editar`) y checkout; el resto del flujo (dashboard,
   cotizaciones, clientes, productos, analítica, CFO, cobranza) ya es dark-safe.
✅ **Dashboard con analíticas nuevas + páginas sin cards (jun 2026)** —
   • Dashboard (`src/pages/app/index.astro`) cablea `getCFO()`+`getAnalytics()` (Promise.all) y
     agrega 4 widgets HAIRLINE: **Salud del pipeline** (DSO/concentración con semáforo),
     **Flujo esperado · 5 semanas** (mini bar chart CSS), **Necesitan seguimiento** (silenciadas
     accionables), **Mix** (clientes por tasa de aprobación + productos por ingreso).
   • Se quitaron los cards restantes: **Kanban** (`cotizaciones/index`) ahora son filas hairline;
     **detalle** (`cotizaciones/[id]`) con docs fiscales y versiones en hairline + nuevo
     **stepper de estado** (draft→sent→viewed→approved→paid/invoiced) + chips de acción de vidrio.
✅ **Link público 3.0 — "Apple premium" (jun 2026)** — mejoras a `QuoteCard.astro` (reusado por
   `/q` y `/embed`; gated por prop `standalone` para no romper el iframe):
   • **Barra de acción flotante** (`#qSticky`, solo `/q`): pill de vidrio fija abajo con total +
     "Aprobar"; aparece mientras el CTA real no está visible (IntersectionObserver) y solo en
     estado review. Al pulsar hace scroll al área y dispara el flujo de firma.
   • **Señales de confianza**: chip de **vigencia con urgencia** ("Vence en X días", ámbar si
     ≤7d / vencida), strip "● Conectado en tiempo real" + "Cifrado · firma con validez legal",
     y **bloque de contacto del vendedor** (WhatsApp/Correo/Llamar) — nuevos campos en
     `getCotizacionByToken`: `org.emailContacto/telefono/whatsapp` y `quote.diasVigencia`.
   • **Pago pulido**: panel con monto restated + "Pago protegido vía Stripe" + chips de tarjeta.
   • **Micro-lujo**: count-up del total al cargar (`data-countup`) + reveal escalonado de las
     líneas (`.qi-reveal`). Todo respeta `prefers-reduced-motion`.
✅ **Restauración UI (jun 2026)** — Se restauraron los botones de Notificaciones y Ayuda en la topbar que se habían borrado accidentalmente y se corrigió el CSS (`.tb-icon`) para eliminar bordes azules de focus nativos en Safari/macOS.
✅ Esqueleto Astro + tokens de diseño
✅ **Landing de ventas completa** (estilo Stripe/Linear con ADN Flouvia) — desplegada
✅ **Logos reales** en `public/imgs/`: `logo-cord-navy.png` (fondos claros) y `logo-cord-white.png` (fondos oscuros) — recortados a 780×300
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
✅ **CFO Dashboard (jun 2026)** — `/app/cfo`: inteligencia financiera avanzada.
   `getCFO()` en queries.ts cruza historial real por cliente (tasa de cierre =
   aprobadas/total, delay al pago = delta approved_at→evento paid) con el pipeline
   abierto para proyectar ingreso esperado semana a semana (5 cubetas: esta semana,
   próxima, +2, +3, +4 semanas). KPIs: pipeline total, ingreso esperado ponderado,
   DSO con semáforo (verde ≤30d / amarillo ≤60d / rojo >60d) y concentración de
   riesgo por cliente. Alertas automáticas: concentración ≥70% y cotizaciones
   silenciadas (+7 días sin respuesta). Ranking de clientes ponderado (tasa hist.,
   días a cierre, días a cobro, valor esperado). Sidebar grupo "Dinero", Cmd+K,
   atajo `G+F`.
✅ **Link público 2.0** — en `/q/[token]`: contraoferta + chat (comentarios) del cliente;
   el vendedor responde desde el detalle (caja de respuesta → evento `reply`). Sin
   migración (usa `eventos` tipos comment/counter/reply). getCotizacionByToken devuelve
   `conversacion`. Pendiente: aprobación parcial por línea (necesita columnas en items).
✅ **Link público "Quiet Luxury" (jun 2026)** — rediseño completo de `/q/[token]` y
   `QuoteCard.astro`. Fondo `#f3f2ef` con orbes radiales suaves. Card `border-radius:28px`,
   sombra sutil, logo real de la org (o inicial con color de marca). Total hero centrado
   `clamp(2.5rem,8vw,3.4rem)`. **Flujo de aprobación en 3 pasos** (sin modales externos):
   1. Revisar — CTA "Aprobar" + PDF + "Rechazar" discreto.
   2. Firma digital — nombre completo + checkbox de términos; botón deshabilitado hasta
      que ambos estén completos; timestamp + IP registrados en `eventos` como
      `"Firmado digitalmente por \"Nombre\" (IP x.x.x.x)"`.
   3. Confirmado — checkmark animado SVG (circle + check dibujados en CSS) + sello
      `"Firmado por X · fecha"` + botón de pago si aplica.
   Rechazo mejorado: textarea inline (adiós al `prompt()` nativo). `getCotizacionByToken`
   ahora incluye `logo_url` (como `org.logoUrl`) y `portal_bienvenida` (como
   `org.portalBienvenida`, ya presente en la query pero faltaba en el objeto devuelto).
   API `/api/q/[token]` acepta `signed_by` en el action `approve`.
✅ **IA: armar cotización desde texto** — `/api/cotizaciones/ai-draft` (SDK @anthropic-ai/sdk,
   tool_choice forzado; modelo claude-opus-4-8 vía AI_MODEL) + panel "Armar con IA" en el
   editor `/nueva`. Empareja el pedido del cliente con el catálogo. Requiere ANTHROPIC_API_KEY.
✅ **Topbar v3 + App shell PRO (jun 2026)** — rediseño completo del AppLayout:
   • **Topbar slim**: buscador pegado a la izquierda (ancho fijo ~360px), iconos a la derecha.
   • **Page header**: banda con título de sección grande (1.6rem) debajo de la topbar; botones
     de acción a la derecha (slot `topbar-actions` reubicado). Slot `page-tabs` para tabs de
     sección. Helper `.ph-tab` / `.ph-tab.active` para tabs consistentes.
   • **Breadcrumbs**: prop `crumbs=[{label, href?}]` en AppLayout; ya conectado en
     `/app/cotizaciones/[id]` y `/app/cotizaciones/nueva`.
   • **Cmd+K corregido y pulido**: los estilos de items inyectados por JS se movieron al
     bloque `is:global` (Astro scopea por `[data-astro-cid]` y el HTML inyectado no lo lleva —
     era la causa de que se viera feo). Selección sutil estilo Linear (barrita de acento navy,
     no bloque sólido), flecha `↵` en el item activo, atajo `kbd` visible (ej. "C" en Nueva
     cotización). **Recientes** en localStorage (`cord.recent.v1`) cuando el buscador está vacío.
   • **Centro de notificaciones real**: campana en la topbar abre panel con feed de actividad
     real (reusa tabla `eventos`); punto rojo si hay items no vistos (marcados en
     `cord.notif.seen`); nuevo endpoint `GET /api/notificaciones`. Iconos por tipo (enviada/
     vista/aprobada/rechazada/pagada/facturada/chat). "Marcar como leídas".
   • **Fijados en el sidebar**: botón de pin (phPin) en el page-header + sección "Fijados"
     al inicio de la sidebar; estado en localStorage (`cord.pins.v1`); `F` para fijar/quitar;
     tooltip al hover en modo colapsado igual que el resto del nav.
   • **Atajos de teclado globales**: `/` → abrir Cmd+K; `C` → nueva cotización;
     `G+D/C/L/P/B/A/F` → navegar a la sección (F = CFO Dashboard); `F` → fijar/quitar página del menú;
     `?` → overlay de ayuda. Ignorados cuando el foco está en un input/textarea/select.
   • **Barra de progreso de navegación** (estilo Linear/YouTube): barra azul de 2.5px en la
     parte superior que aparece al hacer click en un link y desaparece al cargar.
   • **Toasts globales**: `window.cordToast(msg, 'ok'|'error'|'info', ms?)` — toast centrado
     en la parte inferior con ícono, auto-dismiss y botón X. Flash post-navegación vía
     `sessionStorage 'cord.flash'`. Skeletons reutilizables: `.skeleton` + `.skeleton-line`.
   • **Overlay de ayuda de atajos** (`?`): panel centrado con la tabla de todos los atajos.
   • **Mobile v2 (jun 2026):** topbar en móvil = solo `☰ burger · lupa · campana` (barra de
     búsqueda colapsada a ícono cuadrado; notificaciones visibles; engrane/ayuda/guía ocultos
     de la topbar). **Tab bar inferior eliminada** (`.mobile-tabs` borrada; navegación en el
     drawer). **Drawer con acciones rápidas** (`.sb-mobile-actions`, solo móvil): botón azul
     **"+ Crear"** con mini menú desplegable (Cotización → `/app/cotizaciones/nueva`, Cliente →
     `/app/clientes?nuevo=1`, Producto → `/app/productos?nuevo=1`), **Ayuda** (abre el
     helpDrawer), **Configuración** (→ `/app/ajustes`). Los links `?nuevo=1` auto-abren el
     modal de alta correspondiente y limpian el query (`history.replaceState`). Tablas de
     productos y clientes usan `grid-template-areas` en móvil: fila tipo lista con nombre +
     dato secundario (SKU / contacto) debajo y precio/límite a la derecha. Bug de fecha en
     "Tareas y recordatorios" corregido: campo `.task-date` usa `color: var(--color-text)` y
     el formulario se apila a columna completa en móvil (`min-height: 44px`).
✅ **Presencia en vivo (gated) y Diseño Quiet Luxury** — el cliente con `/q/[token]` abierto manda heartbeat
   (`POST /api/q/[token]` action `ping` → `cotizaciones.viewer_last_seen`); el vendedor
   ve un indicador sutil `● Viendo ahora` en el detalle (poll `/api/cotizaciones/[id]/presence`).
   **Gated por plan**: el polling de UI solo se activa si la org está en plan `pro`, `scale` o `developer`.
✅ **Versiones de Cotizaciones (jun 2026)** — Historial inmutable (`cotizacion_versiones`). Al crear se genera V1. Al usar "Modificar y reenviar" en `/app/cotizaciones/[id]/editar` se crea la V2, etc., sin generar un folio nuevo. El detalle `/app/cotizaciones/[id]` muestra el badge de versión actual y un acordeón con el historial completo. El menú de acciones secundarias (PDF, Copiar link, WhatsApp) fue rediseñado a un grid compacto de iconos.
✅ **Editor de Cotizaciones Rediseñado (jun 2026)** — `/app/cotizaciones/nueva` usa un diseño limpio tipo Stripe/Linear (sin tarjetas), se arregló el selector de productos usando `p.id`, incluye botón de línea libre ("+ Agregar línea libre"), e incluye el cálculo del margen bruto porque `getProductos` en `queries.ts` ahora retorna el `costo`.
✅ **Guía de configuración v2 — Widget flotante dinámico (jun 2026)** — tarjeta
   acordeón fijada abajo-derecha (`src/components/app/OnboardingWidget.astro`):
   pasos por `getSetupProgress()` (marca/fiscal/productos/clientes/cotización),
   uno abierto a la vez, check animado al completar. Estado MINIMIZADO → píldora
   "Guía de configuración" con anillo SVG radial en la topbar de `AppLayout`.
   **Estado global persistente** entre páginas (store vanilla en `window.__cordOnb`
   + `localStorage` clave `cord.onb.v1` — equivalente de Zustand/Context en Astro SSR).
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
✅ **Flujos de aprobación + Auditor Silencioso (jun 2026)** — tres umbrales en Ajustes
   (`orgs.aprob_descuento_max`, `aprob_monto_max`, `aprob_margen_min`); si al enviar se rebasa
   cualquiera, la cotización queda `aprob_estado='pendiente'` (no se envía) y gerencia aprueba/
   rechaza desde el detalle. **El Auditor Silencioso** es el tercer umbral: margen bruto mínimo
   (%). Requiere que los productos tengan `costo` configurado; el costo se snapshotea en
   `cotizacion_items.costo_unitario` al cotizar. El editor muestra un badge **Margen** por línea
   en vivo (verde/rojo) que se actualiza al escribir el precio negociado. El motivo de bloqueo
   queda registrado: *"margen bruto 18% está por debajo del mínimo de 25%"*. El campo de costo
   está en el modal de Productos (`/app/productos`) y en la tabla `productos.costo`.
   Filtro "Por aprobar" en la lista de cotizaciones. ⚠️ Correr `npm run db:migrate`.
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
✅ **RLS — Row Level Security en base de datos (jun 2026)** — defensa en profundidad a
   nivel de Neon/PostgreSQL. `ENABLE ROW LEVEL SECURITY` en 18 tablas (SIN `FORCE` por
   ahora: el rol dueño bypasea, lo que permite que `getActiveOrgId()` haga bootstrap sin
   contexto de org establecido). Políticas en `db/schema.sql` al final. Dos helpers en
   `src/lib/db.ts`:
   • `withOrgTx(orgId, ...queries)` — setea `app.org_id` vía `set_config(..., true)`
     (LOCAL a la transacción) y ejecuta todos los queries en **un solo batch HTTP** de
     Neon (`sql.transaction([...])`). Satisface RLS + reduce roundtrips.
   • `withPublicToken(token, ...queries)` — igual pero setea `app.public_token`; usado
     en `/q/[token]` donde no hay org_id de sesión.
   `queries.ts` completamente migrado: funciones multi-tenant usan `withOrgTx`; el link
   público usa `withPublicToken`; tablas sin FORCE (`orgs`, `org_members`) siguen con
   queries directas. Política especial en `cotizaciones`: permite acceso por `org_id` OR
   por `public_token`. Fail-closed: si `app.org_id` no está seteado → ninguna fila
   visible. Pendiente: agregar `FORCE ROW LEVEL SECURITY` cuando los handlers de
   `/api/*` y helpers `logAudit`/`reportUsage` también usen `withOrgTx`.
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
✅ **CORD Elements — cotizador embebible (jun 2026, FASE 1: iframe)** — el cotizador
   `/q` vive ahora dentro del sitio de un tercero vía `<iframe>`. El corazón se extrajo
   a `src/components/q/QuoteCard.astro` (REUTILIZADO por `/q/[token]` y `/embed/[token]`;
   es la semilla del futuro paquete npm `@flouviahq/elements`). El componente emite
   CustomEvents en `window` (`cord:approved`/`rejected`/`message`/`pay`).
   • `/embed/[token]` (`EmbedLayout`, fondo transparente, sin chrome) setea el header
     CSP `frame-ancestors` desde la allowlist `orgs.embed_domains` (anti-clickjacking;
     vacío = abierto, modo demo) y hace de puente: `ResizeObserver` → `postMessage`
     `cord:resize` (auto-altura) + relay de eventos al window padre.
   • `public/embed.js` = loader de "una línea": `<script src=…/embed.js>` + `<div
     data-cord-cotizador data-token="…">` inyecta el iframe, ajusta altura y re-emite
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
     `cord:ready` (adiós a la caja vacía), `MutationObserver` auto-monta embeds inyectados
     después (SPAs/modales), `referrerpolicy`, `data-min-height`, respeta reduced-motion.
     El embed reporta altura del `.embed-wrap` y emite `ready` tras `fonts.ready`.
✅ **CORD Elements — FASE 2: paquete npm `@flouviahq/elements` (jun 2026)** — versión
   framework-native del embed, en `packages/elements/` (monorepo ligero, NO toca la app
   Astro; extraíble a su propio repo — solo habla con el iframe `/embed/*`). Arquitectura
   estilo Stripe: **core agnóstico** (`src/core.ts` = `mountCotizador(el, opts)` → iframe +
   skeleton + postMessage + relay, con `destroy()`), **Web Component** `<cord-cotizador>`
   (`src/element.ts`, auto-registrado al importar; re-emite eventos NATIVOS sin prefijo:
   `approved`/`pay`/… para HTML/Vue/Astro/Svelte), y **wrapper React** (`src/react.tsx`
   → `@flouviahq/elements/react`, `<CordCotizador token onApproved … />`, React peer OPCIONAL).
   Build con **esbuild** (`build.mjs` → ESM+CJS para `.` y `./react`; React externo); tipos
   `.d.ts` escritos A MANO en `types/` (no hay typescript instalado). `package.json` con
   exports map dual. Verificado E2E con Playwright: WC registra, `ready` dispara, auto-altura
   (300→1292px), `q-card` carga, 0 errores. Los tabs de `/elements` ahora muestran el paquete
   (React/Next usan `@flouviahq/elements/react`; Astro/Vue el WC; HTML/WordPress siguen con
   `embed.js`). ✅ **PUBLICADO en npm como `@flouviahq/elements` v0.1.0** (el scope `@cord`
   no estaba disponible → se usó la org `@flouviahq`). Re-publicar: subir `version` en
   `package.json` + `cd packages/elements && npm run build && npm publish`. El nombre del
   Web Component sigue siendo `<cord-cotizador>` (es marca de producto, no del paquete).
✅ **CORD Elements — FASE 3: SDKs Universales (jun 2026)** — Expansión de `@flouviahq/elements`
   para soportar frameworks y plataformas No-Code nativamente. Se agregaron wrappers y scripts:
   • **Vue 3** (`@flouviahq/elements/vue`): componente nativo `<CordCotizador>` con API Composition (`h`, `onMounted`), evitando `compilerOptions.isCustomElement`.
   • **Framer** (`@flouviahq/elements/framer`): componente React inyectado con `addPropertyControls` nativos de Framer para drag-and-drop y sidebar visual de inputs.
   • **Webflow** (`@flouviahq/elements/dist/webflow.js`): script IIFE standalone (`initWebflow()`) que auto-monta iframes buscando atributos `data-cord-token` en el DOM (`MutationObserver` friendly).
   Se actualizaron `exports` en `package.json` y los targets de `build.mjs` con esbuild.
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
   1 retry (300ms backoff), firma HMAC-sha256 en header `X-Cord-Signature: sha256=<hex>`.
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
     Cord" + watermark; gated por plan). PREVIEW en vivo. **Cableado REAL:** `QuoteCard.astro`
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
   paneles API REST · MCP para IA · Cord Elements. PRECIOS movido al final como link simple.
   Orden: PRODUCTO · SOLUCIONES · DESARROLLADORES · RECURSOS · PRECIOS.
✅ **Footer v2 (jun 2026)** — expandido de 3 a 5 columnas: /01 Producto · /02 Soluciones ·
   /03 Desarrolladores · /04 Recursos · /05 Empresa. Trust chips en el bloque de marca
   (🇲🇽 Hecho en México · CFDI 4.0 · Datos cifrados). Grid responsive (≤1020px → 3 cols,
   ≤620px → 2 cols).
✅ **Vercel Analytics (jun 2026)** — `@vercel/analytics` instalado; componente `<Analytics />`
   montado en `Layout.astro` (landing) y `AppLayout.astro` (app). Page views y eventos se
   recopilan automáticamente en el dashboard de Vercel sin configuración adicional.
✅ **Páginas legales (jun 2026)** — `/privacidad` (Aviso de Privacidad Integral LFPDPPP+DPA,
   14 secciones: responsable/encargado, sub-processors, transferencias internacionales, ARCO,
   portabilidad, brechas) y `/terminos` (17 cláusulas: PI, metered billing, autorización débito,
   actividades prohibidas EFOS/lavado, SLA, límite de responsabilidad, API, uso de marca,
   cancelaciones sin reembolso, ley aplicable México/CDMX). Ambas `prerender:true`, grid
   TOC sidebar sticky con scrollspy `IntersectionObserver`, animaciones `PageAnims`
   (`masked-title` en H1, `reveal` en grid), microinteracciones CSS puras (subrayado expansivo
   en links, `translateX` activo en TOC, bullet `scale`, hover rows tabla).
✅ **Clerk Organizations — modo híbrido (jun 2026)** — Clerk = fuente de verdad de
   identidad (org switcher, email invitations, SSO/SAML, multi-org); Neon = fuente de
   verdad de datos de negocio (RLS, billing, 8 permisos granulares). Puente: columna
   `orgs.clerk_org_id` (text unique). Archivos modificados:
   • `db/schema.sql` — `alter table orgs add column if not exists clerk_org_id text unique;`
     + `clerk_user_id` ahora nullable (orgs de Clerk no tienen dueño único en el schema).
   • `src/lib/context.ts` — campo `clerkOrgId` en `ReqCtx` + `currentClerkOrgId()`.
   • `src/middleware.ts` — inyecta `auth().orgId` → `clerkOrgId`; `/api/clerk/` en `PUBLIC_API_PREFIXES`.
   • `src/lib/db.ts` — `getActiveOrgId()` resuelve por `clerk_org_id` primero (paso 0.5),
     con lazy-upsert si el webhook aún no llegó; todo el carril legacy se conserva.
   • `src/pages/api/clerk/webhook.ts` — sincroniza `organization.*` y
     `organizationMembership.*` → upsert en `orgs`/`org_members`; role mapping
     `org:admin`→preset `admin`, `org:member`→preset `vendedor`; no pisa permisos finos.
   • `src/layouts/AppLayout.astro` — `<OrganizationSwitcher>` en el sidebar
     (cambiar/crear orgs; `hidePersonal`, dark theme).
   • `src/pages/api/equipo.ts` — POST usa `createOrganizationInvitation` vía BAPI
     (Clerk manda el email); fallback a token/link si la org no tiene `clerk_org_id`.
     DELETE también llama `deleteOrganizationMembership` para mantener Clerk en sync.
   • `src/pages/app/ajustes/equipo.astro` — UI muestra "invitación enviada por correo"
     cuando `d.emailed === true`.
   • `scripts/backfill-clerk-orgs.mjs` — script de migración único (`npm run clerk:backfill-orgs`):
     crea Organization en Clerk por cada org Neon sin `clerk_org_id`, guarda el mapeo
     y agrega miembros activos. Re-ejecutable.
   ⚠️ **Pasos manuales pendientes** (config, no código):
     1. `clerk enable orgs` (o Dashboard → Organizations settings). Membership = **`optional`**.
     2. Crear webhook en Clerk Dashboard → `https://cord.flouvia.com/api/clerk/webhook`
        con los 8 eventos: `user.created/deleted` + `organization.created/updated/deleted`
        + `organizationMembership.created/updated/deleted`. Copiar signing secret a `CLERK_WEBHOOK_SECRET`.
     3. `npm run db:migrate` (agrega `orgs.clerk_org_id`).
     4. `npm run clerk:backfill-orgs` (migra orgs existentes a Clerk).
     5. Después del backfill: cambiar Membership a `required` si se quiere B2B-only.
✅ **MCP Bidireccional y Gobernanza de Agentes (jun 2026)** — CORD funciona ahora como Servidor Inbound (HTTP/SSE en `/api/mcp/sse` y `/api/mcp/message`) y como Cliente Outbound (`McpClientManager` en `src/lib/mcp/client-manager.ts`). La Base de Datos incluye tablas de gobernanza (`mcp_servers`, `agentes_ia`, `agentes_permisos`) permitiendo que la IA interna de CORD acceda a CRMs corporativos bajo un control estricto (RLS). El endpoint `/api/cotizaciones/ai-draft` implementa un 'Agent Loop' que consulta dinámicamente las herramientas remotas MCP habilitadas para ese agente antes de generar la cotización.
✅ **Rediseño UI/UX de Desarrolladores (Stripe-like) (jun 2026)** — La página de Configuración de API y Webhooks (`/app/ajustes/api.astro`) fue reconstruida usando una estética premium estilo Stripe (Vanilla CSS: `DeveloperUI.css`). Incorpora layout de tarjetas limpios, insignias semánticas, tipografía monoespaciada, toggles segmentados y un bloque "Terminal Oscura" con micro-interacciones para la conexión de servidores MCP y webhooks.
✅ **Internacionalización B2B (Abstracción Fiscal Global) (jun 2026)** — Desacoplamiento del SAT. La tabla `orgs` ahora soporta `country_code` y los documentos se centralizan en la tabla abstracta `documentos_fiscales`. Implementación del patrón Adapter (`src/lib/fiscal`) con `FiscalFactory` que enruta a proveedores locales como `MexicoSatProvider` (CFDI) o `USInvoiceProvider` (Commercial Invoices).
✅ **Multi-divisa con Cobertura Cambiaria (jun 2026)** — La tabla `cotizaciones` ahora soporta divisa de cotización (`base_currency`) independiente a la de facturación (`fiscal_currency`). Implementación de `FXService.ts` para obtener tasas *spot*, aplicar un *buffer%* de cobertura para proteger los márgenes, y congelar la tasa (FX lock) por 30 días para cotizaciones B2B.
⚠️ **EXACTITUD (doc drift, corregido jun 2026):** la app **NO usa los componentes
   nativos `<SignIn/>`/`<SignUp/>` de Clerk** para los flujos de auth — usa **islas React
   propias** basadas en nanostores (`CustomSignIn`, `CustomSignUp`, `CustomOrgSwitcher`,
   `ForgotPassword`, `VerifyEmail`, `CreateWorkspace`) que escuchan la instancia global
   `$clerkStore`/`$userStore` inyectada por `@clerk/astro`. Sí se usan nativos para
   `<OrganizationProfile/>` (Ajustes › Equipo) y `<UserProfile/>` (Ajustes › Cuenta). Las
   entradas de abajo que dicen "componentes nativos/oficiales de Clerk" reflejan un intento
   que se revirtió a los `Custom*`. **El "Entorno de prueba" (`testMode.ts` / `cord_test_mode`)
   es COSMÉTICO**: solo cambia el prefijo de API key mostrado en Ajustes › Developers; NO
   aísla datos de test (no hay sandbox real). ⚠️ Auth en re-trabajo activo (André): hay
   componentes nuevos sin commitear en `src/components/auth/` (`SignInForm.tsx`, etc.).
✅ **Clerk Premium UI & Nativos (jun 2026)** — Retorno a los componentes oficiales de Clerk (`<SignIn />`, `<SignUp />`, `<OrganizationSwitcher />`, `<OrganizationProfile />`) estilizados globalmente vía `appearance` con un diseño oscuro premium estilo Stripe/Linear (`src/lib/clerk-theme.ts`), eliminando código React manual redundante.
   • **Flujos de Autenticación**: Las rutas `/sign-in` y `/sign-up` montan los componentes nativos de `@clerk/astro` con redirecciones server-side desde `/login` y `/registro` en `astro.config.mjs`.
   • **Motor B2B (Organizations)**: Todo el control de equipo (invitaciones, roles, accesos) se centralizó en `<OrganizationProfile />` (en `/app/ajustes/equipo`), eliminando componentes y pestañas de invitaciones sueltos.
   • **Componentes B2B**: El selector de espacios de trabajo se reemplazó por el `<OrganizationSwitcher />` nativo en el sidebar de `AppLayout.astro`. El onboarding usa `<CreateOrganization />`.
✅ **Colaboración en Tiempo Real y Firmas Nativas (jun 2026)** —
   • **Hilos de negociación embebidos**: Comentarios interactivos por cada línea de la cotización (`cotizacion_comentarios`). Los clientes pueden debatir partidas específicas y llegar a un acuerdo granular en la misma vista pública de la cotización (`QuoteCard.astro` y `/api/q/[token].ts`).
   • **Firmas Legales Inmutables**: Nuevo flujo legal (`cotizacion_firmas`) donde se captura Nombre, Correo, IP, User Agent y un hash criptográfico SHA-256 generado a partir del *snapshot* del estado de los ítems cotizados. La cotización exhibe el sello de auditoría tras ser aprobada, actuando como un contrato digital legal y verificable.
✅ **Pulido visual y micro-interacciones (jun 2026)** — Mejoras premium de diseño "Quiet Luxury":
   • **Desarrolladores**: Ajuste de colores (azul `#93c5fd` en lugar de morado) en la UI de herramientas MCP para mayor coherencia visual.
   • **Link Público de Cotización**: Micro-interacciones TOP en los botones principales (`.ql-cta`, `.ql-ghost`), incorporando efectos dinámicos de escala, control de *brightness* y expansión fluida de sombras.
   • **Historial de versiones**: Transformado de una lista básica a un componente moderno y elegante estilo acordeón, con transiciones suaves, elevación al hover y micro-ajustes de posición (`translateX`).
✅ **AI Agent Workflows — Cuentas por Cobrar y Flujo de Caja (jun 2026)** —
   • **Agentes de Cobranza Autónomos (AI AR)**: Nueva tabla `cobranza_conversaciones` y `planes_pago_negociados` para gestionar interacciones. Cron job (`/api/cron/cobranza`) y webhook (`/api/webhooks/inbound-email`) que alimentan al LLM (`ar-agent.ts`) permitiéndole negociar hasta 3 cuotas mensuales con deudores. Dashboard de supervisión en `/app/tesoreria/cobranza`.
   • **Predicción de Flujo de Caja**: Algoritmo predictivo en `cashflow.ts` que cruza el delay promedio de pago histórico con el valor ponderado del pipeline actual para estimar los ingresos a 90 días. Dashboard avanzado en `/app/tesoreria/flujo` con "AI CFO Insight" y escenarios de probabilidad.
✅ **Arquitectura Isomórfica de Auth (jun 2026)** — Solución al "Blank Screen" de Clerk en islas React
   dentro de Astro. Los componentes de React lanzaban error por falta de `<ClerkProvider>` en su contexto.
   Se reescribió `CustomSignIn.tsx`, `CustomSignUp.tsx`, `VerifyEmail.tsx`, `ForgotPassword.tsx` y
   `CreateWorkspace.tsx` para usar **nanostores** (`@nanostores/react` + `@clerk/astro/client`). Ahora
   las "islas" React escuchan la instancia global de Clerk inyectada por Astro (`$clerkStore`, `$userStore`)
   eliminando la dependencia de wrappers de Context.
✅ **Identidad Visual "Cord Navy" y Micro-Interacciones (jun 2026)** — Rediseño total de los flujos de
   autenticación (`/sign-in`, `/sign-up`, `/verify-email`, `/forgot-password`, `/onboarding/workspace`).
   Se eliminó el gradiente mesh multicolor heredado y se reemplazó por un fondo blanco inmaculado con una
   sutil cuadrícula punteada (radial-gradient mesh) en `#0a192f`. Se reemplazó el texto por logotipos reales.
   Los inputs y botones (`.btn-primary`) adoptan el Cord Navy puro (`#0a192f`), con sombras escalonadas y
   levantamientos `translateY(-1px)`.
✅ **OrgSwitcher "Linear-Style" (jun 2026)** — El `CustomOrgSwitcher.tsx` se rediseñó para operar en
   **Modo Oscuro Nativo** y acoplarse perfectamente al sidebar navy (`#0a192f`). El botón base es transparente
   con texto blanco semi-translúcido, y el menú desplegable flota con fondo `#0a192f` y bordes finos de alto
   contraste, evitando el efecto de "mezcla sucia" sobre el fondo blanco del dashboard.
✅ **Micro-interacciones Topbar y Sidebar (jun 2026)** — Elevación de la calidad de UI a nivel premium:
   • **Botón Sidebar:** Se actualizaron los íconos (flechas apuntando hacia el flujo de expansión/colapso). Animación sutil de desplazamiento del ícono (`translateX`) al hacer hover y un efecto de hundimiento (`scale(0.92)`) en estado activo.
   • **Topbar (Ajustes, Ayuda, Notificaciones):** Íconos reacondicionados con animaciones fluidas usando curvas CSS `spring` puras (engrane rotando 60°, efecto "wiggle" en Ayuda, y "bell-ring" en notificaciones). Levantamiento (`translateY(-1px)`) global para `tb-icon`.
✅ **Entorno de Prueba Global y Rediseño API (jun 2026)** — Centralización del estado de entorno:
   • **Nanostore de Test Mode:** Se introdujo `testMode.ts` (estado global sincronizado con `localStorage` como `cord_test_mode`) y se acopló al interruptor "Entorno de prueba" en el `CustomOrgSwitcher.tsx`.
   • **Rediseño "Quiet Luxury" en Desarrolladores:** Se eliminó la dependencia de `DeveloperUI.css` (estilo Stripe morado/blanco) en `/app/ajustes/api.astro`. La interfaz ahora usa clases nativas de Cord (`.api-btn-solid`, `.api-btn-ghost`) asegurando un Modo Oscuro perfecto.
   • **Org Switcher UI Fix:** Corrección de contraste de texto y recortes `text-overflow` (`min-width: 0` + `ellipsis`) para nombres de usuario/emails largos.
✅ **Integración Visual Nivel App (Clerk) (jun 2026)** — El componente `<OrganizationProfile>` (Ajustes de Equipo) ahora se integra de forma transparente en el layout claro de la App (`equipo.astro`) mediante un nuevo `clerkAppAppearance` definido en `clerk-theme.ts`, eliminando el choque visual del modo oscuro forzado.
✅ **Cableado real de features "andamiaje" (jun 2026)** — auditoría que conectó al
   flujo real varias features que existían como tablas+clases pero NO se invocaban:
   • **Fix de dependencia (zod):** `@modelcontextprotocol/sdk` rompía en runtime por
     `zod@4.1.11` con la carpeta de compat `/v3/` ESM incompleta (faltaba `util.js`).
     Solución: `"overrides": { "zod": "4.4.3" }` en `package.json` + `vite.ssr.noExternal:
     ['@modelcontextprotocol/sdk']` en `astro.config.mjs`. ⚠️ El **build de prod no se
     afecta**, pero `npm ci` desde el lockfile puede romper el DEV de Vite (error
     "reading 'call'" en todos los `.astro`/`.ts`); la instalación que funciona en dev es
     `npm install` (regenera lockfile). Si truena: `rm -rf node_modules package-lock.json
     node_modules/.vite .astro && npm install`.
   • **Abstracción fiscal CABLEADA:** `src/lib/fiscal/emit.ts` junta datos (org/cliente/
     items/totales/país), enruta por `FiscalFactory` y registra en `documentos_fiscales`.
     Enganchado en la acción `invoiced` de `/api/cotizaciones/[id]`. `MexicoSatProvider`
     ahora timbra REAL si `PAC_API_URL`+`PAC_API_KEY` están seteadas; si no, devuelve
     respuesta marcada `provider_data.simulado=true` (honesto, ya no finge UUID).
     UI de documentos fiscales en el detalle de cotización (`getDocumentosFiscales`).
   • **FX REAL + multi-divisa cableada:** `FXService` hace fetch a Frankfurter (BCE, sin
     key) con fallback a mock; conectado a `createCotizacion` (puebla `base_currency`/
     `fiscal_currency`/`fx_rate`/`fx_locked_until`). Endpoint `/api/fx/quote` (preview) +
     selector de divisa/buffer/preview en vivo en el editor `/nueva`.
   • **MCP entrante SEGURO:** `/api/mcp/sse` valida la API key con `authApiKey` (antes
     `Bearer x` daba acceso total) y guarda el `orgId` en la sesión; `/api/mcp/message`
     ejecuta las tools dentro de `reqContext.run({orgId})` (tenancy real por RLS).
   • **MCP saliente FUNCIONAL:** `ai-draft` pasa el `agenteId` del agente por defecto
     (`getDefaultAgentId` en `src/lib/agents/governance.ts`) — antes se instanciaba sin
     agente y nunca cargaba servidores; `client-manager` inyecta el `auth_token`, mapea el
     nombre REAL de la tool (`toolMap`) y cierra conexiones (`disconnectAll`).
   • **Gobernanza de agentes (UI):** `/app/ajustes/agentes` (Developers › "Agentes IA y
     MCP") — CRUD de `mcp_servers`, toggle "Permitir IA" por servidor (`agentes_permisos`,
     herramientas `["*"]`) y toggle de cobranza autónoma. API `/api/agentes`.
   • **Cobranza IA con opt-in:** columna `orgs.ai_cobranza_activa` (default false); el cron
     `/api/cron/cobranza` solo procesa orgs con el flag, está protegido por `CRON_SECRET`,
     **manda el correo de verdad** vía Resend y ya está agendado en `vercel.json` (diario
     16:00 UTC). Botón "Forzar ejecución" (acción `run_cobranza`). El AR agent (`ar-agent.ts`)
     usa `AI_MODEL || claude-opus-4-8` (antes modelo hardcodeado).
   • **Tesorería en el menú:** `/app/tesoreria/flujo` y `/app/tesoreria/cobranza` se
     reescribieron con el sistema de diseño de Cord (usaban clases TAILWIND inexistentes →
     se veían rotas) y se enlazaron en el sidebar (grupo "Tesorería IA"; CFO restaurado al
     grupo "Dinero").
   • **Conversación en vivo:** el endpoint de presencia devuelve `convCount`; el detalle
     muestra un banner "Hay mensajes nuevos · actualizar" cuando el cliente comenta (sin
     recargar solo). Sigue siendo polling (8s), no SSE.
   ⚠️ Correr `npm run db:migrate` (columna `orgs.ai_cobranza_activa`). Nueva env opcional:
   `PAC_API_URL` (endpoint del PAC; el timbrado es simulado sin ella).
✅ **Aprobación parcial por línea (jun 2026)** — el cliente puede aprobar solo un
   subconjunto de líneas desde `/q`. Columna `cotizacion_items.aprobado` (default true).
   En `QuoteCard` cada línea tiene checkbox (solo si la cotización está viva) con total a
   aprobar EN VIVO; el botón se deshabilita si no hay líneas seleccionadas. `/api/q/[token]`
   acción `approve` acepta `accepted_items[]`: marca cada línea, y **la firma legal SHA-256
   cubre SOLO las líneas aceptadas** (el snapshot hashea `firmadas`, no todas). El evento
   registra "aprobó N de M líneas ($X de $Y)". El detalle del vendedor muestra las líneas
   excluidas tachadas con badge "No incluida" + nota de aprobación parcial. ⚠️ Correr
   `npm run db:migrate` (columna `cotizacion_items.aprobado`).
⬜ Pendiente: `USInvoiceProvider` real (US), "tiempo real" full vía SSE/WebSocket, producción
   de Clerk (instancia real), Stripe Billing en prod (price_ids + webhook secret). NOTA: la
   facturación/CFDI sigue timbrando sobre el total original — si se factura una aprobación
   PARCIAL, conviene emitir solo las líneas con `aprobado=true` (pendiente de cablear en
   `emit.ts`). Deuda: doc drift (la app usa componentes `Custom*` de Clerk, no los nativos
   `<SignIn/>`), el "Entorno de prueba" es cosmético (solo cambia el prefijo de API key), y
   5 vulnerabilidades de `npm audit`.

---

## Modelo de negocio

Freemium tipo la app de Shopify: gratis hasta 5 cotizaciones activas con
"Powered by Cord" en el link público; planes de pago vía Stripe Billing.
**Matriz maestra de 5 niveles (jun 2026)** — MXN/mes, IVA incluido, **Pro = el
ancla** (destacado en la landing):

| Plan | Precio | Posición | Incluye (resumen) |
|------|--------|----------|-------------------|
| Gratis | $0 | gancho | 5 cotizaciones, 50 prod/cli, 3 IA/mes, "Powered by Cord" |
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

**AppLayout (`src/layouts/AppLayout.astro`):** sidebar navy sticky (logo blanco,
nav con íconos, org-switcher arriba, "Fijados" antes de los grupos nav, footer con logo).
Props: `title`, `page`, `heading?`, `crumbs?` (breadcrumbs). Slots: `topbar-actions`
(botones del page-header, derecha), `page-sub` (subtítulo opcional bajo el título),
`page-tabs` (tabs de sección, bajo el título — usar clase `.ph-tab`), slot default (contenido).
Topbar: buscador izquierda → tb-right (onb-pill, campana/notificaciones, ajustes).
Page-head: breadcrumbs → `h1.ph-title` + botón pin → ph-actions → ph-tabs-row.
Clases globales reutilizables: `.card`, `.status-pill`, `.editorial`, `.skeleton`,
`.skeleton-line`, `.ph-tab`. API JS global: `window.cordToast(msg, type, ms)`.
`sessionStorage 'cord.flash'` para flash post-navegación. Entradas con CSS `app-fadein`
escalonado (NO GSAP). Mobile: sidebar → drawer (tab bar inferior ELIMINADA jun 2026).
En móvil la topbar muestra solo burger + lupa (ícono) + campana. Ayuda, config y el botón
`+ Crear` viven en la sección `.sb-mobile-actions` dentro del drawer (oculta en desktop).
⚠️ Estilos de contenido inyectado por JS (Cmd+K items, notif panel, toasts, pins)
DEBEN vivir en `<style is:global>` — Astro scopea por `[data-astro-cid]` y el HTML
dinámico no lleva ese atributo. NO moverlos al bloque `<style>` scopeado.

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
- **Logo central** `logo-cord-navy.png` (30px alto) que **desaparece al hacer
  scroll** y reaparece como `pill-logo` (`logo-cord-white.png`, 17px) dentro de la
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
   listar Cord en `apps.ts` y footer de flouvia.com

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
- **Logos oficiales** (`public/imgs/`): `logo-cord-navy.png` para fondos claros,
  `logo-cord-white.png` para fondos oscuros (sidebar de la app, footer, pill
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
  (fondo "Cord"). Si se usan ahí: Inter 800, letter-spacing −0.06em (`rgba(0,0,0,0.025)`
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
- **Error 500 / TypeError de Clerk en SSR (Pantalla Blanca):** Al usar componentes de React de Clerk (como `<WorkspaceSwitcher />`, `<SignInForm />`, etc.) dentro de `.astro`, **siempre** usar `client:only="react"`, NUNCA `client:load`. Clerk depende de `<ClerkProvider>`, el cual no existe en el SSR de Astro. Usar `client:load` causa que Astro intente pre-renderizarlo en servidor, provocando un crasheo interno en Vite ("TypeError: Cannot read properties of undefined") y dejando la pantalla blanca.
- **Corrupción de caché de Vite (tsconfig.json):** Mantén la configuración de TypeScript nativa de Astro. Forzar `"jsx": "react-jsx"` en `compilerOptions` corrompe el servidor de desarrollo (`npm run dev`) tirando TypeErrors fantasmas durante la transformación de dependencias. Si esto ocurre, borrar `.vite`, `.astro`, `node_modules` y hacer un `npm install` limpio.

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
PAC_API_URL=                                                    # endpoint del PAC (sin ella el timbrado es SIMULADO)
ANTHROPIC_API_KEY=                                              # IA "armar cotización desde texto" + cobranza/MCP
AI_MODEL=                                                       # opcional (default claude-opus-4-8)
```

Neon se recomienda provisionar vía **Vercel Marketplace → Neon** desde el proyecto
de Vercel de Cord (auto-inyecta `DATABASE_URL` en todos los environments).

---

## Deployment

- **Plataforma:** Vercel (proyecto independiente del de flouvia.com).
- **Dominio:** `cord.flouvia.com` (movido al proyecto de Cord en Vercel; DNS ya
  apunta a Vercel).
- **Modo:** SSR (`output: 'server'`). La landing es `prerender: true`.
- Todas las API routes futuras necesitan `export const prerender = false`.
