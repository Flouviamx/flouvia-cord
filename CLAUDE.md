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

## Reglas de Diseño y Estilo

1. **PROHIBIDO EL USO DE EMOJIS (🚫 EMOJIS):** Por petición estricta de diseño de André, está estrictamente prohibido utilizar emojis (👍, 👎, 🚀, etc.) en el código, en el texto, en la UI o en los commits. Todo debe sentirse profesional, serio y corporativo (Enterprise/Quiet Luxury). En su lugar, usa iconos SVG de librerías como Lucide o Feather.

---

## Stack (idéntico a flouvia-web)

| Capa | Tecnología |
|------|-----------|
| Framework | Astro 6.4.8 (`output: 'server'`) + `@astrojs/vercel` |
| Auth | Clerk (`@clerk/astro`) — **signup ABIERTO** (no invitation-only como el portal de flouvia) |
| DB | **Neon (PostgreSQL serverless)** — schema en `db/schema.sql`. Decisión jun 2026: Neon en vez de Supabase. Crear vía Vercel Marketplace → integración Neon (auto-provisiona `DATABASE_URL`). |
| Billing | Stripe Billing (freemium) |
| Emails | Resend (transaccionales: cotización vista, aprobada, etc.) |
| CFDI | **Facturapi** (facturapi.io) — timbrado CFDI 4.0 vía `MexicoSatProvider` |
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
✅ **Clerk en PRODUCCIÓN (jun 2026):** instancia live activa (llaves `pk_live`/`sk_live`),
webhook registrado en `/api/clerk/webhook`. ✅ **Stripe Billing CONECTADO + EN PROD
(jun 2026):** suscripciones de 5 planes + medidores de excedente (ver "Stripe Billing"
abajo); llaves `sk_live`, `STRIPE_WEBHOOK_SECRET` seteado, webhook apuntando a
`cord.flouvia.com/api/stripe/webhook` y Customer Portal configurado en el dashboard.
Los 46 price_ids/meters reales viven en `billing.ts`. El meter de IA está cableado en
`ai-draft`; CFDI/API/usuario también miden uso (ver "Stripe Billing"). ✅ **Clerk Organizations HÍBRIDO
(jun 2026):** código completamente implementado + **config manual COMPLETADA en prod**
(Organizations activado, webhook registrado, migración y backfill corridos — ver sección abajo).

---

## Estado actual (jun 2026)

✅ **Internacionalización del Centro de Ayuda (Support Center) (jun 2026)** — Se añadió soporte bilingüe (`/soporte` y `/en/support`).
   • **Arquitectura y Artículos:** Se crearon wrappers en `src/pages/en/support` que re-utilizan los templates de español pasando la bandera `isEn`. Los 66 artículos base en `src/content/support/en/` fueron **completamente traducidos al inglés B2B profesional** (retirando emojis y ajustando todos los enlaces internos). El build genera 132 rutas estáticas sin error.
   • **Componentes Dinámicos:** Los componentes `SupportHero`, `SupportCards`, `SupportSearch` y `FeedbackWidget` ahora tienen copys estáticos en ambos idiomas y renderizan dinámicamente según la ruta.
   • **Selector de Idioma Transparente:** Se parcheó `utils.ts` para mapear limpiamente `/soporte/categoria/` a `/support/category/`. Además, para resolver la recarga de página al cambiar de idioma en Astro sin romper todos los scripts atados a `DOMContentLoaded` (que ocurriría usando `<ClientRouter />`), se inyectó un parche en `Nav.astro` que utiliza `sessionStorage` para guardar y restaurar la posición exacta del *scroll* al vuelo, logrando una ilusión óptica de cambio instantáneo de idioma sin perder el lugar de lectura.


✅ **Block-mockups de Soluciones reescritos a motion-graphics (jun 2026)** — `SolucionBlockMockup.astro`
   (los 3 mockups por industria que acompañan a los bloques de texto en `/soluciones/[slug]`) estaba muy por
   debajo del nivel de los de producto: cards casi vacías, scrub atado al scroll (deprecado en estas páginas) y
   hasta un emoji `👆` (prohibido). Se reescribió COMPLETO al lenguaje de los mockups de producto/index:
   • **Componente** = base CSS compartida (cards navy con gradiente, floating pills, push notifications estilo
     iOS, cursor falso SVG —NUNCA emoji—, badges, `.editorial` monospace) + 12 mockups con clases prefijadas
     `sbm-<ind>-mN` (`dist`/`const`/`manu`/`serv`). Cada uno cuenta una micro-historia que EXPLICA su copy:
     distribuidoras (cursor negocia precio por línea con count-up y chip −12% · búsqueda de catálogo que teclea
     y agrega SKU · términos Net 30 + barra de crédito + push de pago), construcción (cursor edita cantidad y
     subtotal/IVA/total recalculan con flash verde · barra de crédito que avisa al rebasar límite · push
     "aprobó desde la obra" → timeline → sello CFDI 4.0), manufactura (línea libre que despliega la spec del
     lote · historial del cliente con count-up por corrida · sello de evidencia + CFDI sin recapturar),
     servicios (header que se reviste del color de marca + adiós "Powered by Cord" · push de apertura +
     contador de vistas + estado que avanza · cursor que aprueba → anillo de éxito → anticipo pagado Stripe).
   • **Animación** en el `<script>` de `soluciones/[slug].astro` (reemplazó el bloque de scrub viejo): reveal
     de entrada genérico (`.sbm-card` sube con fade) + 12 timelines GSAP que cuentan la historia con loops
     `repeat:-1` y/o `ScrollTrigger {once:true}` (NUNCA scrub-on-drag), todo bajo guard `!reduced`. El HTML por
     defecto queda en estado FINAL → con `prefers-reduced-motion` se ve completo y correcto.
   • **Regla a futuro:** todo loop-starter usa `ScrollTrigger {once:true}` para no apilar timelines al re-entrar
     en viewport; para teñir una barra con `background: gradient` se anima `background` (gradiente), NO
     `backgroundColor` (el gradiente opaco lo taparía); los overlays transitorios (push/pago) van con
     `opacity:0` por defecto en CSS para que el estado estático de reduced-motion sea limpio.
   El hero mockup de cada industria (inline en `[slug].astro`) NO se tocó (ya animaba con el "settle" de PageAnims).
   • **Paridad estética con producto (follow-up):** tras una revisión se identificaron 4 diferencias CSS vs
     `BlockMockup.astro`: (1) sombra de card — ahora 3 capas (`0 2px 4px` + `0 28px 56px -14px` + `inset 0 1px 0`);
     (2) floating pills — `filter: drop-shadow(0 10px 20px rgba(0,0,0,0.4))` + offsets `top/right: -18px/-14px`
     (se usa offset en vez de `transform: translate()` para que las animaciones GSAP de `y`/`scale` no pisen el
     transform); (3) dots de color — `box-shadow: 0 0 7px rgba(color,0.7)` para glow visible; (4) pills — fondo
     sólido `#0f172a` (no semi-transparente). El glow ambiental (`.sbm-glow`) pasó a núcleo azul
     `rgba(59,130,246,0.12)` + navy para dar profundidad. Resultado: idénticos a los de producto a nivel CSS.

✅ **Rediseño Premium B2B del Blog y Microinteracciones (jun 2026)** — Elevando la estética a "Top Top / Quiet Luxury":
   • **TOC Scrollspy Animado (Left Sidebar):** Rediseño ultra-premium del índice flotante. Se usa un track vertical sutil con una píldora indicadora (`toc-indicator`) que navega dinámicamente con transiciones `cubic-bezier`. Los enlaces del índice presentan un elegante micro-desplazamiento lateral (`translateX(4px)`) en hover/activo. Bug crítico solucionado: se removió un `position: relative` en `.toc-container` que rompía el comportamiento global de `position: sticky`.
   • **Botones de Redes Expansivos (Right Sidebar):** La barra de compartir (`.share-pill`) se transformó en botones circulares de `44x44px` que se expanden magnéticamente a `140px` al hacer hover. Se utilizó `position: absolute` para garantizar que el texto interior haga un "fade in" impecable sin moverse físicamente en el DOM. Función de portapapeles en JS con estado de éxito ("¡Copiado!").
   • **Layout Grid Ajustado:** Se forzó un canvas puramente blanco (`#ffffff`) para la vista de artículo, removiendo distracciones. El contenedor principal grid ahora aplica `align-items: flex-start` a las barras laterales para permitirles flotar el 100% de la longitud del contenedor padre (resolviendo colapsos de flex-stretch).
   
✅ **Nuevas páginas de Blog y Planes de Soporte (jun 2026)** — rediseño del landing para mejor conversión B2B:
   • **Blog dedicado (`/blog`):** Se eliminó "Cómo funciona" de la navegación global y se reemplazó por la landing del Blog. Estética ultra-premium con grid de artículos (hero glassmorphism, orbes). Además, **migramos a Astro Content Collections:** los artículos ahora viven como archivos Markdown independientes (`src/content/blog/*.md`) que generan rutas dinámicas (`/blog/[slug]`) con un layout hiper-limpio estilo editorial y un Bento Grid de captura de leads al pie (inspirado en Stripe).
   • **Página de Cómo Funciona Mejorada:** Se reconstruyó `/como-funciona` con un nuevo hero que incluye un mockup flotante interactivo de aprobación de cotizaciones, y un grid de características clave estilo Stripe.
   • **Planes de Soporte (`/planes-soporte`):** Se migró de tarjetas de precio genéricas a una tabla de SLA técnica detallada que refleja mejor la venta de servicios Enterprise.
✅ **Centro de Ayuda de Clase Mundial (jun 2026)** — rediseño y reescritura masiva de `/soporte`:
   • **Reescritura Manual de 61 Artículos:** Eliminamos TODAS las plantillas genéricas. Se escribieron 61 archivos JSON (inyectados a Markdown) con contenido profundo, real, y específico para B2B. Aclaración clave de negocio: **Cord NO cobra comisiones por transacción**, todo el procesamiento se delega a la llave conectada de Stripe (Payouts, Disputas, FX), y Cord factura el SaaS (excedentes de CFDI/IA).
   • **Buscador Instantáneo (Cmd+K):** Endpoint en `/api/support-search.json` (prerendered) expone el índice. Componente `SupportSearch.astro` con Vanilla JS y `fuse.js`-like filtering inyectado en el nav/hero. Filtra por título y descripción instantáneamente sin recargas. Resolvimos el problema de z-index donde los resultados se ocultaban por debajo usando `:global` scoping.
   • **Navegación UX:** Tabla de Contenidos Automática (`[slug].astro` lee H2/H3 con Scrollspy). Breadcrumbs inyectados dinámicamente y grid de "Artículos Relacionados" leyendo el tag o la categoría actual.
   • **Widget de Feedback:** Botones de pulgar arriba/abajo al final de cada artículo con micro-interacciones. Si seleccionas una opción, el color cambia a verde/rojo para afirmar la acción (no se queda en un hover genérico).
✅ **Estética Quiet Luxury global aplicada (jun 2026)** — limpieza severa de UI a petición de André ("editorial, nada genérico, mucho aire"):
   • **Adiós a las cards (cajas redondeadas con borde y fondo):** Eliminadas del soporte y de listas genéricas. Se reemplazaron por el estilo **Hairline** (divisores sutiles de 1px) o layouts de columnas planas (Airy Bento).
   • **"Airy Bento" en Quick Routes:** El grid de soporte ya no tiene bordes entre celdas; usa gaps enormes (`3rem`) y fondos invisibles que revelan su color primario en hover.
   • **Íconos delgados y estéticos:** Se reemplazaron SVG anchos (stroke 2) por trazos elegantes (stroke 1.2 a 1.5), escalando su tamaño de 24 a 32px para sentirse más técnicos e intencionales.
   • **Globalización del FAQ Nativo:** El `<details>` nativo con estilo hairline usado en Soporte fue portado al 100% de la web (Landing y Precios), eliminando el código JS pesado y las cajas con sombras.

✅ **Navbar móvil — menú premium con acordeones (jun 2026)** — reescritura completa del
   overlay de `Nav.astro` a petición de André ("neta, carbona, estéticamente Cord"):
   • **Antes:** 5 links de texto plano (`Producto · Soluciones · Desarrolladores · Recursos · Precios`).
   • **Ahora:** 4 **acordeones colapsables** (uno abierto a la vez, misma mecánica que el FAQ)
     + 1 link directo para Precios. Cada acordeón expone los sub-items con ícono + título +
     subtítulo — reusando íconos y copys de los megamenús de escritorio → misma profundidad
     de producto en móvil. Expansión `grid-template-rows: 0fr → 1fr` (bulletproof, sin medir alturas).
   • **Fondo:** navy con mesh radial de marca (los mismos orbes `#0a192f/ellipse` de las secciones
     oscuras del sitio) en vez del gris sólido anterior.
   • **Bloque de CTA fijo abajo:** "Entrar" (ghost de vidrio) + "Empezar gratis" (sólido blanco),
     ambos full-width con `data-auth-swap` intacto para el swap Clerk en cliente.
   • Títulos editoriales Inter 700, `letter-spacing: -0.04em`; íconos 38px con borde de vidrio;
     chevron rota 180° al abrir; stagger blur-in en filas y sub-items; `env(safe-area-inset)`
     para notch/home-bar; área de nav scrolleable con pie anclado; estados `:active` táctiles.
   • Respeta `prefers-reduced-motion` (sin clip-path, blur ni transforms). Build verde.

✅ **Mockups de landing pulidos + página "Cobranza con IA" (jun 2026)** — limpieza de
   animaciones de las subpáginas (`/producto/*`, `/soluciones/*`, `/desarrolladores/*`) +
   primera página de las integraciones nuevas:
   • **Animaciones raras ELIMINADAS** (petición de André: "que no se volteen, nada raro"). Se
     quitó el **"exploded view"** del hero (el mockup que rotaba `rotationX:25/rotationY:-15` y
     se reensamblaba con el scroll) en las **3** plantillas → ahora el hero usa el **mismo
     "settle" limpio del index** (lo maneja `PageAnims.astro`: `rotationX:9 → 0` con scrub). Se
     quitaron también: el **tilt-3D-con-cursor** (efecto ya rechazado antes), el **emisor de
     partículas** en `mousemove` (creaba `<div.mk-particle>` huérfanos en `<body>` sin CSS), y la
     **tarjeta flip 180°** de manufactura (la "voltereta") → reemplazada por un mockup de "precio
     por volumen" con reveal escalonado limpio. El **Kanban** que se arrastraba con el scroll
     (scrub) pasó a ser un **loop de motion-graphic** auto-reproducido. **Regla a futuro:** en las
     subpáginas NO reintroducir exploded-view, tilt con cursor, partículas ni flips; los heroes se
     animan SOLO con el settle de `PageAnims`, y los mockups cuentan su historia con loops
     `once`/`repeat:-1` (como el index), respetando `prefers-reduced-motion`.
   • **Heroes de Soluciones ahora son motion graphics** (antes tarjetas estáticas): micro-historia
     por industria dentro del `.pp-mockup` (en el `<script>` de `soluciones/[slug].astro`):
     distribuidoras (precios por cliente que se revelan + chips de descuento con *pop*),
     construcción (materiales + barra de crédito que se llena), manufactura (specs + nota del
     lote), servicios (pulso del botón "Aprobar" + badge "Vista"). Gated por `!reduced`.
   • **Página NUEVA `/producto/cobranza-ia`** ("Cobranza con IA") — vende la cobranza autónoma
     (AR agent) + flujo de caja predictivo, que existían en la app pero no en la landing. Hecha
     sobre la plantilla de `/producto/[slug]`: entrada nueva en `FEATURES` (`src/lib/producto.ts`),
     **hero mockup** `.mk-ar` (el agente negocia un plan de 3 cuotas en vivo: burbujas que entran
     una a una + plan que se revela + "Aprobar" pulsando — JS en el bloque `if(wrap)` de
     `[slug].astro`, hook `#arThread`), y **3 block mockups** en `BlockMockup.astro`
     (`bm-ar-m0/m1/m2`: negociación que cierra, barras de flujo a 90 días, tablero de supervisión
     con estado Negociando→Pagado). Copy fiel a la feature (Scale, hasta 3 cuotas, opt-in, audit
     log) + FAQPage JSON-LD. Cableada en el **megamenú** (`Nav.astro`) y el **footer**
     (`Footer.astro`); aparece sola en los cross-links de las demás páginas de producto.
   • **Pendiente de esta tanda** (mismo patrón, ya probado): páginas de **Multi-divisa FX**,
     **Fiscal internacional (US/MX)** y **Cord Elements** en `/desarrolladores`; actualizar el copy
     de la página MCP a **MCP bidireccional + gobernanza de agentes**.
   • ✅ **npm:** se agregó `"private": true` al `package.json` RAÍZ y se ejecutó `npm unpublish flouvia-cord@0.0.1 --force` para evitar la fuga del código fuente. Pendiente: re-publicar `@flouviahq/elements` a la versión **0.2.0** desde `packages/elements/`.

✅ **Sidebar themed + Developers separado + onboarding ampliado (jun 2026)** — iteración de UI a
   petición de André:
   • **Sidebar = espejo de la topbar (vidrio BLANCO en claro, navy en oscuro)** — antes era
     siempre navy. Se introdujo un set de variables **`--sb-*`** en `:root` y su contraparte en
     `html[data-theme="dark"]` (`AppLayout.astro`); TODA la sidebar (nav, group-labels, badges,
     indicador, footer, toggle, acciones móviles, pins inyectados por JS) y el `CustomOrgSwitcher`
     leen esas variables → cambia de tema sin duplicar reglas. El **logo del footer** ahora son dos
     `<img>` (`.sb-foot-logo-navy`/`.sb-foot-logo-white`) que se intercambian por tema. Los
     dropdowns de cuenta y "Crear" usan **frosted casi-opaco** vía `--sb-menu-*` (mismo look del
     menú "Crear" de la topbar). Patrón a seguir para cualquier color nuevo en la sidebar: usar
     `var(--sb-*)`, NO `rgba(255,255,255,…)` hardcodeado.
   • **Colapsado pulido** — íconos 46px cuadrados centrados (ícono 21px), rail 74px sin huecos,
     badge = punto con aro `var(--surface)`, avatar de cuenta alineado con la columna de íconos.
   • **El contenido gana ancho al colapsar** — variable **`--content-max`** (1240px → **1440px**
     en `.sb-collapsed`, con transición) aplicada a `.app-content`/`.ph-inner`/`.ph-tabs-row`. Ya
     no solo se recorre.
   • **Developers SEPARADO en pestañas** — la antigua página combinada "API y webhooks" se partió
     (`settings.ts`): **API · Webhooks · MCP · Integraciones · Agentes IA · Cotizador embebible**.
     CSS compartido extraído a **`src/styles/developers.css`** (importado por las 3 páginas nuevas;
     antes vivía scopeado en `api.astro`). `api.astro` rediseñada **estilo Stripe** (tabla "Claves
     de API": Nombre · Token · Permisos · Último uso · Creación — clases `.key-table/.key-trow`);
     **`webhooks.astro`** (log de entregas + replay + prueba) y **`mcp.astro`** (connect + tools +
     probador) son páginas nuevas. Los 4 `init*()` JS originales se repartieron por página.
   • **Onboarding 5 → 9 pasos + RE-MONTADO** — `getSetupProgress()` ahora enseña el flujo completo:
     marca → fiscal → catálogo → clientes → crear → **enviar 1ª** → **PDF/portal** → **cobrar y
     facturar** → **invitar equipo** (cada uno con detección real en BD). ⚠️ El widget estaba
     **huérfano** (sus vars `setup`/`pillDash` y su CSS `.onb-pill` seguían en `AppLayout` pero el
     componente y la píldora ya no se renderizaban): se RE-MONTÓ `<OnboardingWidget>` + la píldora
     en `.tb-right`, ambos gated por `!setup.complete`.
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
   `localStorage cord.theme`. ⚠️ **Actualizado (jun 2026):** el sidebar y el org switcher YA NO son
   navy fijo — ahora son blancos en claro / navy en oscuro vía las variables `--sb-*` (ver la
   entrada "Sidebar themed" arriba).
   ✅ **Completado:** se migraron todos los `#fff` hardcodeados de Ajustes (`/app/ajustes/*`),
   editores (`cotizaciones/nueva`/`editar`) y checkout a la variable `var(--surface)`. Ahora todo el flujo es 100% dark-safe.
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
✅ **Tabla comparativa exhaustiva + precios en USD (jun 2026)** — La tabla de comparación de
   planes (`COMPARATIVA` / `COMPARATIVA_EN`) se expandió de ~20 filas a ~60 features en
   **13 grupos** cubriendo TODAS las funcionalidades de la app: límites del sistema, consumo
   mensual, cotizaciones y editor, experiencia del cliente (link público), inteligencia
   artificial, fiscal y multi-divisa, CRM/analítica, riesgo y tesorería, identidad y marca,
   notificaciones e integraciones, equipo/roles/seguridad, desarrolladores e infraestructura,
   excedentes. La versión en inglés (`src/lib/precios.en.ts`) ahora muestra precios en **USD**
   (Starter $12, Pro $30, Scale $70, Developer $150; excedentes en USD también), y todos los
   labels de moneda en la landing inglesa (`precios.astro`, `ui.ts`) dicen "USD" en lugar de
   "MXN". La calculadora ROI en inglés usa valores y constante PRO en USD. ⚠️ Se eliminó un
   **bloque duplicado** que existía en `precios.astro` (líneas 518-1014: segunda copia
   ES-only pegada por error que hacía que `/precios` renderizara todo dos veces). Ahora hay
   un solo `<Layout>` con `isEn` para las dos variantes. Fuentes: `src/lib/precios.ts` (ES),
   `src/lib/precios.en.ts` (EN), `src/i18n/ui.ts` (labels `pr.cycle.m` / `pr.sub`).
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
   — el link se genera igual. ✅ **En prod (jun 2026):** dominio verificado en Resend y
   `RESEND_API_KEY`/`RESEND_FROM` seteados en Vercel; los correos transaccionales ya salen.
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
   sistema visual que `/producto/*`): `/desarrolladores/api` (terminal con curl + JSON response),
   `/desarrolladores/mcp` (chat UI con tool call `cartera_vencida`), y **`/desarrolladores/status`** 
   (página de estado y monitoreo "Quiet Luxury" con switch de componentes, historial a 90 días, leyendas, 
   tooltips customizados en CSS puro con micro-interacciones, mostrando fechas exactas y porcentajes reales).
   Contenido en `src/lib/desarrolladores.ts`. Animaciones `PageAnims`, masked-titles, count-ups, reveals.
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
   ✅ **Config manual COMPLETADA en prod (jun 2026):** Organizations activado en el
     Dashboard, webhook en `https://cord.flouvia.com/api/clerk/webhook` con los 8 eventos
     (`user.*` + `organization.*` + `organizationMembership.*`) y `CLERK_WEBHOOK_SECRET`
     seteado; migración + `clerk:backfill-orgs` corridos. (Si se quiere B2B-only: cambiar
     Membership de `optional` a `required` en el Dashboard.)
✅ **MCP Bidireccional y Gobernanza de Agentes (jun 2026)** — CORD funciona ahora como Servidor Inbound (HTTP/SSE en `/api/mcp/sse` y `/api/mcp/message`) y como Cliente Outbound (`McpClientManager` en `src/lib/mcp/client-manager.ts`). La Base de Datos incluye tablas de gobernanza (`mcp_servers`, `agentes_ia`, `agentes_permisos`) permitiendo que la IA interna de CORD acceda a CRMs corporativos bajo un control estricto (RLS). El endpoint `/api/cotizaciones/ai-draft` implementa un 'Agent Loop' que consulta dinámicamente las herramientas remotas MCP habilitadas para ese agente antes de generar la cotización.
✅ **Rediseño UI/UX de Desarrolladores (Premium)** — La página de Configuración de API y Webhooks (`/app/ajustes/api.astro`) fue reconstruida usando una estética premium (Vanilla CSS: `DeveloperUI.css`). Incorpora layout de tarjetas limpios, insignias semánticas, tipografía monoespaciada, toggles segmentados y un bloque "Terminal Oscura" con micro-interacciones para la conexión de servidores MCP y webhooks.
✅ **Internacionalización B2B (Abstracción Fiscal Global) (jun 2026)** — Desacoplamiento del SAT. La tabla `orgs` ahora soporta `country_code` y los documentos se centralizan en la tabla abstracta `documentos_fiscales`. Implementación del patrón Adapter (`src/lib/fiscal`) con `FiscalFactory` que enruta a proveedores locales como `MexicoSatProvider` (CFDI) o `USInvoiceProvider` (Commercial Invoices).
✅ **Multi-divisa con Cobertura Cambiaria (jun 2026)** — La tabla `cotizaciones` ahora soporta divisa de cotización (`base_currency`) independiente a la de facturación (`fiscal_currency`). Implementación de `FXService.ts` para obtener tasas *spot*, aplicar un *buffer%* de cobertura para proteger los márgenes, y congelar la tasa (FX lock) por 30 días para cotizaciones B2B.
✅ **Footer Stripe/Linear (jun 2026)** — rediseño premium estilo Stripe/Linear sin badges, sin prefijos numéricos, con tipografía sutil, enlaces gris técnico que hacen fade a blanco y enlace directo a soporte. Grid asimétrico (2fr 6fr). Se añadieron íconos sociales (Instagram, TikTok, X) usando SVG nativo en la base del footer, y se actualizaron los enlaces de la columna Recursos (`/blog`, `/precios`, `/planes-soporte`).
⚠️ **EXACTITUD (doc drift, corregido jun 2026):** la app **NO usa los componentes
   nativos `<SignIn/>`/`<SignUp/>` de Clerk** para los flujos de auth — usa **islas React
   propias** basadas en nanostores (`CustomSignIn`, `CustomSignUp`, `CustomOrgSwitcher`,
   `ForgotPassword`, `VerifyEmail`, `CreateWorkspace`) que escuchan la instancia global
   `$clerkStore`/`$userStore` inyectada por `@clerk/astro`. Sí se usa el nativo para
   `<UserProfile/>` (Ajustes › Cuenta). Las
   entradas de abajo que dicen "componentes nativos/oficiales de Clerk" reflejan un intento
   que se revirtió a los `Custom*`. **El "Entorno de prueba" (`testMode.ts` / `cord_test_mode`)
   es COSMÉTICO**: solo cambia el prefijo de API key mostrado en Ajustes › Developers; NO
   aísla datos de test (no hay sandbox real). ⚠️ Auth en re-trabajo activo (André): hay
   componentes nuevos sin commitear en `src/components/auth/` (`SignInForm.tsx`, etc.).
✅ **Clerk Premium UI & Nativos (jun 2026)** — Retorno a los componentes oficiales de Clerk (`<SignIn />`, `<SignUp />`, `<OrganizationSwitcher />`, `<OrganizationProfile />`) estilizados globalmente vía `appearance` con un diseño oscuro premium estilo Stripe/Linear (`src/lib/clerk-theme.ts`), eliminando código React manual redundante.
   • **Flujos de Autenticación**: Las rutas `/sign-in` y `/sign-up` montan los componentes nativos de `@clerk/astro` con redirecciones server-side desde `/login` y `/registro` en `astro.config.mjs`.
   • **Motor B2B (Organizations)**: El control de equipo (invitaciones, roles, accesos) opera mediante una **interfaz 100% custom y nativa estilo Stripe** (en `/app/ajustes/equipo`) que consume nuestros webhooks (`/api/equipo`), reemplazando definitivamente a `<OrganizationProfile />` por razones de diseño y control UX "Quiet Luxury".
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
✅ **Auth pages — minimalista tipo Linear (jun 2026)** — `/sign-in` y `/sign-up` rediseñadas a petición
   de André ("minimalista tipo Linear pero esencia Cord, fondo blanco"). Se descartó tanto la card centrada
   original (lucía plana: sombras/bordes a opacidad 0.05 = invisibles) como un intento de layout split de
   dos columnas. Diseño final:
   • **Fondo blanco limpio, todo centrado en columna** (sin panel lateral, sin card chrome — `.auth-card`
     es `transparent`, sin borde ni sombra). El formulario flota sobre el blanco al estilo Linear, pero en
     claro y con navy Cord. Estructura: logo Cord navy → formulario (Custom*) → footer "Hecho en México ·
     Datos cifrados".
   • **Estética Cord:** título navy `#0a192f` peso 600 tracking −0.025em, inputs border 1px sutil + focus
     ring navy `rgba(10,25,47,0.08)`, botón primario navy sólido full-width con hover `translateY(-1px)`,
     sociales blancos con border sutil. Inter, mucho aire (`gap: 2.25rem`), fade-in suave.
   • **CSS compartido idéntico en cada página** (mismo bloque `<style is:global>`; clases consumidas por
     `CustomSignIn`/`CustomSignUp`). `body:has(.auth-page)` oculta nav/footer de la landing.
   • **`client:only="react"`** en ambas páginas (corregido de `client:load`; Clerk requiere contexto de
     cliente — ver bug documentado más abajo sobre pantalla blanca).
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
✅ **Reescritura Custom de Equipo y Roles (jun 2026)** — Se removió el componente "enlatado" `<OrganizationProfile>` de Clerk en favor de una vista `equipo.astro` 100% nativa. El nuevo diseño (inspirado en Stripe) introduce filtros estilo "píldora" fluidos, botones primarios con efectos glassmorphism/gradient, y modales nativos para invitar, editar roles y revocar accesos (conectados a `/api/equipo`), garantizando fidelidad total al "Dark Mode" del SaaS.
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
     ahora timbra REAL vía **Facturapi** si `FACTURAPI_API_KEY` está seteada (sk_test_/
     sk_live_); si no, devuelve respuesta marcada `provider_data.simulado=true` (honesto).
     El PDF/XML se sirven por el proxy `/api/cotizaciones/[id]/cfdi?type=pdf|xml` (Facturapi
     no da URLs públicas). UI de documentos fiscales en el detalle (`getDocumentosFiscales`).
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
   `npm run db:migrate` (columna `cotizacion_items.aprobado`). **La facturación SÍ respeta
   la aprobación parcial:** `emit.ts` emite solo las líneas `aprobado=true` y recalcula
   subtotal/IVA/total desde las aceptadas (marca `aprobacion_parcial` en `provider_data`).
✅ **FIX crítico de schema (jun 2026)** — varias columnas vivían SOLO en su `CREATE TABLE`
   y nunca se aplicaban en bases ya existentes (el `migrate` ignora "already exists"). Se
   re-declararon como `ALTER ... IF NOT EXISTS`: `cotizaciones.base_currency/fiscal_currency/
   fx_rate/fx_rate_source/fx_locked_until` (sin ellas `createCotizacion` tronaba) y
   `orgs.country_code` (sin ella `emit.ts`/facturar tronaba). **Regla a futuro:** toda
   columna nueva sobre una tabla existente va como `alter table … add column if not exists`,
   NUNCA editando el `create table`.
✅ **Gating de API/Webhooks → LÍMITES por plan + CSD multi-tenant + Slack robusto (jun 2026)** —
   sesión "hazlo funcionar" (André reportó webhooks/integraciones/CSD rotos):
   • **Dropdown del sidebar 100% opaco:** `--sb-menu-bg` (claro/oscuro) y `.tb-create-menu`
     pasaron de alpha 0.96–0.98 a SÓLIDO; `CustomOrgSwitcher.org-dropdown` usa
     `background-color: var(--surface)` + `background-image: var(--sb-menu-bg)` (a prueba de
     fallos). Bonus: el componente usaba `:global(.sb-collapsed)` (CSS inválido en un `<style>`
     plano de React → el navegador lo descartaba); corregido a `.sb-collapsed` plano, así el
     org switcher por fin se ajusta al sidebar colapsado.
   • **Gating → límites (no bloqueo):** decisión de André — la API y los webhooks YA NO se
     bloquean por plan; TODOS los planes (incl. `free`) los tienen, LIMITADOS por cantidad.
     `permissions.ts`: `webhookLimit` (free 1 · starter 3 · pro 10 · scale 25 · developer 100)
     y `apiKeyLimit` (free 2 · starter 5 · pro 20 · scale 50 · developer 200) + `planLabel`.
     `/api/webhooks` y `/api/keys` cuentan los existentes vs el límite (403 con mensaje claro);
     `apikey.ts` ya NO bloquea llaves live por plan (el consumo se mide por uso). UI: `api.astro`
     y `webhooks.astro` muestran `X/Límite` y deshabilitan el botón al tope (adiós upsell
     "plan Negocio"); el botón "Vivo" se desbloqueó. `planTieneApi` sigue existiendo
     (lo usa `portal.astro` para quitar marca).
   • **Slack robusto:** `/api/org/prefs` antes IGNORABA en silencio una URL de Slack inválida
     (guardar no hacía nada → parecía roto). Ahora: vacío = desconectar, válida = guardar,
     inválida = **error 400 claro**.
   • **CSD REAL multi-tenant (Facturapi Organizations):** la sección CSD de `/app/ajustes/fiscal`
     estaba 100% deshabilitada (maqueta). Ahora cada org de Cord = una organización en Facturapi
     con SU CSD, y timbra bajo SU RFC. Nuevo `src/lib/fiscal/facturapi.ts` (gestión vía la llave
     de CUENTA `FACTURAPI_USER_KEY`: create org → `POST /organizations`, legal → `PUT …/legal`,
     CSD → `PUT …/certificate` multipart cer/key/password, llave live → **`PUT …/apikeys/live`**
     que RENUEVA y devuelve el secreto — el GET solo lista enmascarado). Endpoint nuevo
     `/api/fiscal/csd` (POST multipart / DELETE). `MexicoSatProvider` acepta `providerApiKey`
     (la llave LIVE de la org); `emit.ts` y el proxy `/cfdi` la usan cuando existe, con fallback
     a la global. Cols nuevas `orgs.facturapi_org_id`/`facturapi_live_key`. UI de fiscal
     habilitada (subir/quitar CSD, estado en vivo, badge PAC). ⚠️ **Requiere `FACTURAPI_USER_KEY`
     en el entorno** (sin ella el endpoint responde 503 honesto y el timbrado cae a la global).
   • **Scripts:** `scripts/set-plan.mjs` (cambia plan de una org: `--list` / `--plan=… --org=…`
     / `--all`). Las 2 orgs "Flouvia" de André se subieron a `developer`. ⚠️ `npm run db:migrate`
     (2 cols nuevas en orgs).
✅ **Fix crítico: firma en link público (jun 2026)** — `src/pages/api/q/[token].ts` usaba
   `sql.begin(async tx => …)` en la acción `approve`, pero el driver HTTP de Neon
   (`@neondatabase/serverless`) no expone ese método — solo `sql.transaction([...])`. La
   función crasheaba silenciosamente y la respuesta llegaba vacía → el cliente recibía
   "Unexpected end of JSON input" al intentar `res.json()`. Corregido: se arma un array de
   queries (`txQueries`) y se ejecuta con `(sql as any).transaction(txQueries)`. Mismo
   patrón que `withOrgTx`/`withPublicToken` en `db.ts`. **Regla a futuro:** NUNCA usar
   `sql.begin()` — siempre `sql.transaction([...])` (o los helpers `withOrgTx`/`withPublicToken`).
✅ **LISTO PARA PRODUCCIÓN (jun 2026)** — operativa verificada: DB de prod migrada; env vars
   en Vercel (`ANTHROPIC_API_KEY`, `RESEND_API_KEY`/`RESEND_FROM`, `CRON_SECRET`, DATABASE_URL,
   Clerk/Stripe live); webhooks de Stripe (`/api/stripe/webhook` + Customer Portal) y Clerk
   (`/api/clerk/webhook`) registrados; dominio de Resend verificado. Build y rutas sanas.
✅ **CFDI 4.0 vía Facturapi (jun 2026)** — `MexicoSatProvider` crea la factura real en
   Facturapi (auth Basic con la API key), devuelve el UUID del SAT y los PDF/XML se sirven
   por `/api/cotizaciones/[id]/cfdi?type=pdf|xml`. **Key de TEST ya configurada**
   (`FACTURAPI_API_KEY`). ⚠️ **Gap del modelo:** Cord captura el RFC del cliente pero NO su
   régimen fiscal ni CP (domicilio) — `emit.ts` usa defaults (público en general / CP del
   emisor / uso G03). Para CFDI válido a un RFC específico hay que capturar régimen + CP +
   uso CFDI POR CLIENTE (agregar al alta de clientes). Para subir a producción: cambiar a
   `sk_live_` en `FACTURAPI_API_KEY` (Vercel).
✅ **UX intuitiva en flujos core de la app (jun 2026)** — pasada de claridad y estética en las 5 pantallas más usadas, para que cualquier usuario (no técnico) entienda las funcionalidades al primer vistazo:
   • **Editor de cotización (`/app/cotizaciones/nueva`):** pasos numerados explícitos ("1 ¿A quién le cotizas?" / "2 ¿Qué le vas a cotizar?") con guía de texto debajo de cada encabezado. **Panel de divisas rediseñado de jerga a humano:** al elegir USD/EUR aparece un stepper visual "Tipo de cambio hoy → Tu tasa protegida" con tres presets de colchón **Poco / Normal / Cauto** (+1% / +2% / +5%) en lugar de un campo "buffer %" vacío; preview live "Tu cliente verá ≈ US$X · tú facturas $Y MXN". Resumen de sidebar enriquecido con conteo de líneas/piezas y línea "Le descontaste −$X" cuando el precio negociado baja del lista. Moneda con banderas (🇲🇽/🇺🇸/🇪🇺) — **NOTA: las banderas son excepciones aprobadas por el contexto de selección de país/divisa**, no emojis decorativos.
   • **Clientes (`/app/clientes`):** el par confuso "dropdown de nivel + campo numérico de descuento" reemplazado por **chips de nivel** (Estándar / Plata / Oro / Distribuidor) que al tocarse auto-sugieren un descuento típico y muestran una preview live en pesos ($1,000 → $900). Estado vacío con ícono, titular y botones "Nuevo cliente" / "Importar CSV".
   • **Productos (`/app/productos`):** etiquetas humanizadas ("¿Cuánto te cuesta?"). **Medidor de margen en vivo** dentro del modal: barra de color (verde ≥30% / ámbar 15-30% / rojo <15%) + texto "Ganas $X por unidad · margen Y%" — o "Pierdes $X" si el costo supera el precio. Estado vacío con ícono y CTA.
   • **Importar CSV (clientes y productos):** **indicador de pasos** en la cabecera del modal (1 Archivo · 2 Columnas · 3 Revisar) con dot activo/completado para que el usuario nunca pierda el hilo.
   • **Lista de cotizaciones (`/app/cotizaciones`):** **barra de resumen** al tope (valor en pipeline + aprobado por cobrar + pendientes de aprobación). **Conteos en los filtros** ("Abiertas 5", "Aprobadas 3"…). Estado vacío real cuando no hay cotizaciones. **Pista de arrastre** en la vista Kanban ("Arrastra las tarjetas para avanzar cada cotización en su pipeline").
   • Archivos modificados: `src/pages/app/cotizaciones/nueva.astro`, `src/pages/app/clientes.astro`, `src/pages/app/productos.astro`, `src/pages/app/cotizaciones/index.astro`.
    • **Ajustes y Modales (Quiet Luxury):** rediseño "borderless" nivel Stripe/Apple en las pantallas de configuración (`/app/ajustes/equipo` y `/app/ajustes/cuenta`). Se eliminó por completo la dependencia de los componentes embebidos nativos de Clerk (`<UserProfile />`) reemplazándolos con "Islas de React" 100% custom conectadas a los Nanostores (`@clerk/astro/client`). Esto eliminó el choque visual (CORS/iframe-feel) permitiendo implementar inputs "floating", avatares dinámicos y sombras ultra tenues con los hooks `user.update()`, `user.updatePassword()` y `session.revoke()`.
✅ **Responsive Mobile-First en Ajustes y Modales (jun 2026)** — Se refactorizó la estructura base de `/app/ajustes` (`SettingsShell.astro` e `index.astro`) para ser "mobile-first", ocultando la descripción y reordenando el grid en pantallas móviles. Se corrigió el menú "Crear" de la topbar (`AppLayout.astro`) para evitar desbordamiento anclándolo a la derecha. Además, se adaptaron los modales de Developers (`developers.css`) y Agentes (`agentes.astro`) para que las acciones se apilen al 100% de ancho en pantallas pequeñas y las claves de API no rompan el contenedor.
⬜ Pendiente (no bloquea lanzamiento): capturar datos fiscales del receptor por cliente
   (régimen/CP/uso CFDI) para CFDI nominativo; `FACTURAPI_API_KEY` live en prod;
   `USInvoiceProvider` real (US); publicar `@flouviahq/elements` v0.2.0 (`npm login && npm
   publish`); "tiempo real" full vía SSE/WebSocket. Deuda menor: el "Entorno de prueba" es
   cosmético (solo cambia el prefijo de API key mostrado), y 5 vulnerabilidades de `npm audit`
   de bajo riesgo (esbuild dev-Windows / path-to-regexp build-time) cuyo fix exige downgrade
   breaking de `@astrojs/vercel`.

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

> ⚠️ Precios son placeholders comerciales — André los puede ajustar. Si cambian:
> - **ES (MXN):** `src/lib/precios.ts` — consumido por `Pricing.astro` (home) y `/precios`.
>   Ahí viven `PLANES`, `COMPARATIVA` (~60 features en 13 grupos) y `FAQ_PRECIOS`.
> - **EN (USD):** `src/lib/precios.en.ts` — misma estructura, precios en USD
>   (Starter $12 · Pro $30 · Scale $70 · Developer $150). Labels "USD" en `src/i18n/ui.ts`
>   (`pr.sub`, `pr.cycle.m`) y en `precios.astro` (meta, lead, tarjeta, ROI).

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
  integraciones (filas, NO tarjetas), al igual que **todas las FAQs y la página de Soporte**.
- **Airy Bento:** Cuando se requiera un layout de cuadrícula para navegación rápida (como las Quick Routes), no se deben poner líneas ni fondos divisorios por defecto. Usar `gap` generoso, fondos transparentes, iconos SVG delgados (stroke 1.2 - 1.5) y aplicar efectos de fondo únicamente durante el `:hover`.
- **Sidebar Ultra-Compacta (Premium Linear-style)**: El sidebar colapsado ahora tiene 56px de ancho absoluto (bypass de Astro optimizer en `AppLayout.astro`) para mantener el "soul" Linear. Los íconos no se centran, sino que mantienen `padding-left` con microinteracciones táctiles de `scale(0.94)` al click (`:active`). El z-index de la sidebar se elevó globalmente a 800 para prevenir overlapping del contenido principal.
- **Org Switcher Sólido**: El `<CustomOrgSwitcher />` y la cuenta tienen z-index masivo global (9999) y un background blanco/navy absoluto (inyectado via `<style is:inline>`) con sombras agresivas para separarlo físicamente del efecto Liquid Glass de la sidebar. Esto previene ilusiones de translucidez o superposición del dashboard tanto en modo expandido como colapsado.
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
FACTURAPI_API_KEY=                                              # CFDI 4.0 vía Facturapi (sk_test_/sk_live_); sin ella el timbrado es SIMULADO
# FACTURAPI_URL=                                                # opcional (default https://www.facturapi.io/v2)
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

---

## Support Hub Architecture (Astro Content Collections)

El Centro de Ayuda (`/soporte`) es un sistema de documentación *Stripe-level* impulsado por **Astro Content Collections** (Astro 6.0).

- **Estructura de Datos:** Los artículos viven en `src/content/support/*.md`. Contamos con ~61 artículos enriquecidos y estructurados con Markdown alerts (`> [!NOTE]`).
- **Ruteo Dinámico (`prerender = true`):** 
  - `src/pages/soporte/[slug].astro`: Plantilla de lectura con Sidebar dinámico izquierdo (artículos relacionados), Breadcrumbs y Paginación Siguiente/Anterior.
  - `src/pages/soporte/categoria/[categoria].astro`: Índice de categoría en formato de lista minimalista (diseño cardless corporativo).
- **Buscador Client-Side:** El autocompletado en `SupportHero.astro` consulta `/api/support-search.json.ts` y filtra en el cliente para latencia cero.
- **Diseño sin Emojis:** Todos los íconos de soporte utilizan SVGs estilo Lucide en lugar de emojis de texto. Todo el estilo "tarjeta" pesado fue removido en favor de fondos transparentes, divisores sutiles y estética corporativa.
- **Rutas Rápidas (Quick Links):** Se eliminó el diseño "Bento grid" asimétrico, reemplazándolo por una lista vertical minimalista (Simple Hairline List) que ocupa el 100% del ancho, alineada visualmente con las FAQs y el bloque editorial.

---

## UI Components & Aesthetics

### Sidebar Navigation (AppLayout)
El componente `Sidebar.astro` es el menú principal de la app y presenta un diseño "Linear-style" / "macOS Dock".
- **Acordeones de Grupo:** Las cabeceras de los grupos (ej. "Principal", "Dinero") utilizan `grid-template-rows: 0fr/1fr` para lograr un colapso ultra-fluido impulsado puramente por CSS.
- **Dock Mode (Collapsed):** El modo colapsado funciona como una "isla flotante" o "Dock de iPad". Los iconos se escalan a cuadrados de 42x42px perfectamente centrados.
- **Normal Mode (Expanded):** Sigue la misma filosofía limpia que el modo Dock. Utiliza hover elástico sutil (sin físicas excesivas) y textos sólidos. El indicador de ítem activo es un cuadro de cristal líquido (`backdrop-filter`) idéntico en ambos modos, asegurando cohesión visual.
- **Microinteracciones:** Las tooltips en modo colapsado utilizan `transform-origin: left center` para brotar elásticamente desde el ícono. El indicador de ítem activo es una "pastilla de cristal" calculada matemáticamente en JS mediante `getBoundingClientRect()` para evitar bugs de offsetTop en anidamientos CSS.
- **Sombra Premium:** `--sb-shadow` iguala de forma idéntica la sombra doble de la `topbar` (`0 12px 36px -8px rgba(10,25,47,0.14)`) para asegurar que la sidebar no luzca plana frente al resto de los paneles, creando un volumen 3D ultra-premium.

### Blog Aesthetics (Stripe/Flouvia Pattern)
El blog público (`/blog`) emplea un diseño sin imágenes (image-less) fuertemente inspirado en Stripe, adaptado a los colores corporativos de Flouvia (Cord).
- **Portadas CSS:** En lugar de fotografías genéricas, los posts utilizan portadas dinámicas generadas 100% con HTML y CSS (`.stripe-cover` con abstract shapes y glassmorphism).
- **Flouvia Gradients:** Se usa una paleta tech/B2B estricta (navy, cyan, teal, silver glass) a través de clases `.gradient-1` a `.gradient-5`.
- **Íconos Vectoriales Abstractos:** Las portadas inyectan SVG minimalistas translúcidos mapeados dinámicamente a la categoría del artículo (Finanzas, Ventas B2B, Fiscal, Tecnología, etc.), flotando sobre los gradientes con sombra (`drop-shadow`).
- **Avatares Minimalistas:** Los avatares de autor utilizan un componente de inicial estilizada (`.fc-author-initial`) en lugar de fotografías reales. Es un círculo con gradiente azul corporativo y texto en blanco, garantizando un aspecto "Quiet Luxury" y limpio sin importar qué autor publique.

### Navbar & Mobile UX
- **Mobile Navbar Refinements:** Se corrigieron los estilos del language switcher (ES/EN) en la vista móvil (Glassmorphism + dark text en selección). Se ajustó la posición para no saturar la cabecera y se reubicó arriba del footer.
- **Autenticación (CTAs):** Se invirtieron las acciones primarias en la navegación móvil con sesión activa. Ahora el Dashboard es la acción principal a la izquierda, logrando más fluidez para los usuarios recurrentes.

### Roadmap Aesthetics
El roadmap público (`/roadmap` y `/en/roadmap`) fue rediseñado para alcanzar un estándar estético ultra sobrio, corporativo y nivel "Cord Premium".
- **Glassmorphism y Sombras:** Los filtros de navegación en la barra lateral ahora residen dentro de una tarjeta (`.rd-sidebar-card`) con una leve sombra flotante plana y bordes refinados.
- **Filtros tipo Píldoras:** Los filtros select (`.rd-select`) pasaron de tener diseños web tradicionales a lucir como píldoras suaves semi-transparentes que armonizan con el glassmorphism del proyecto.
- **Microinteracciones en filas:** Las filas de productos (rows) desecharon el fondo estilo "tarjeta tradicional". Al hacer hover, una leve opacidad de fondo (`var(--color-bg-soft)`) acompañada de un sutil `scale(0.995)` recrea una física de presión profunda, evitando estilos brillantes o saturados.
- **Toggles "Estilo Apple":** Los interruptores de filtrado utilizan dimensiones, comportamiento y colores fieles a iOS (`#D1D1D6` inactivo en modo claro, `#39393D` en modo oscuro, `#34c759` al encender).
- **Control Segmentado (Tabs):** Se eliminó el "control de tarjetas anidadas" en favor de etiquetas simples y sobrias con pesos gruesos (`font-weight: 800`), logrando que el layout de lectura prime sobre los adornos excesivos. Las páginas de producto individual (doc) también eliminaron los "badges" estilo píldora a favor de simple texto de color corporativo.
