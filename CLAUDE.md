# Cord — CLAUDE.md

SaaS de cotizaciones B2B standalone de Flouvia. Dominio: **cordhq.app**.
Es la versión independiente de la app de Shopify "Flouvia Cotizaciones B2B"
(repo hermano: `../flouvia/src/data/apps.ts`), dirigida a **cualquier negocio B2B
en México** — no solo Shopify.

> **Repo:** `~/Desktop/flouvia-cord` (carpeta HERMANA de `~/Desktop/flouvia`, NO
> anidada — son dos repos git y dos proyectos Vercel independientes).
> GitHub: `github.com/Flouviamx/flouvia-cord`. Deploy automático en Vercel a
> `cordhq.app` con cada push a `main`.
>
> ⚠️ **Rebrand Trato → Cord (jun 2026):** el código ya está renombrado a Cord. Lo
> que sigue siendo "trato" y debe renombrarse MANUALMENTE fuera del repo: el repo de
> GitHub (`flouvia-trato` → `flouvia-cord`), la carpeta local (`~/Desktop/flouvia-trato`),
> el proyecto en Vercel y el subdominio DNS (`trato.flouvia.com` → `cordhq.app`).
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
2. **Sin etiquetas `<br/>` en strings:** Los títulos y textos no deben contener etiquetas `<br/>` incrustadas; usar espacios y dejar que CSS (e.g. `max-width`, `text-wrap: balance`) maneje los saltos de línea naturales.
3. **Muerte al Grid Genérico:** André odia los layouts encajonados tipo "Bento grid" cerrado (boxes con bordes duros). Usa en su lugar el estilo "Airy Bento" (mucho espacio, divisores hairline) o flujos limpios de una sola columna centrada.
4. **Estética "Apple ✕ Cord" (Light Mode):** El modo claro no debe ser `#ffffff` plano. Usa el gris característico de Apple (`#f5f5f7`) para fondos e inputs. Las tarjetas principales (contenedores flotantes) deben ser blancas puras, con `border-radius` masivo (ej. `40px` simulando squircles) y sombras difusas de múltiples capas. 
5. **Micro-interacciones y UI Táctil:** Los inputs NO llevan bordes por defecto; usan un fondo gris suave (`#f5f5f7`) y revelan un contorno azul profundo (`#0a192f` o `rgba(10, 25, 47, 0.15)`) al recibir foco. Los botones primarios (CTAs) son "píldoras" magnéticas (`border-radius: 999px`) que responden con una ligera reducción/escala (`transform: scale()`) en hover y active.
6. **Ultra-Premium y Minimalista:** Respeta la jerarquía tipográfica. Los títulos deben ser negros absolutos (`#050505`) con *tracking* ajustado (`letter-spacing: -0.04em`) y línea de altura corta (`1.1`). Deja que la interfaz respire con márgenes y paddings muy generosos. Todo debe poder manejarse fluido con el teclado (ej. `Enter` para avanzar).
7. **Mockups Premium (Estándar de IA):** Siempre que se te pida crear o actualizar un "mockup" de UI para la landing page, DEBES leer y seguir estrictamente las reglas definidas en `MOCKUP_STANDARDS.md`. El objetivo es una **calca realista de un screenshot** — tabla densa, datos plausibles, superficie blanca sólida — estilo Stripe/Linear. **Este proyecto NO usa Tailwind.** Los mockups van en CSS vanilla con clases prefijadas: `bm-*` (BlockMockup), `sbm-*` (SolucionBlockMockup), `cmk-*` (kit compartido en `src/styles/mockups.css` para `/soluciones/empresas` y `/soluciones/startups`). El patrón de bleed: `cmk-stage { inset:0 }` llena la celda visual; `cmk-shot { width: max(520px, calc(100%+56px)); bottom: -40px }` sangra por derecha/abajo; el padre `.stripe-fg-card { overflow:hidden }` recorta como imagen cortada. NUNCA cajas encajonadas ni card-dentro-de-card.
8. **Logos de Marcas e Integraciones:** Cuando necesites mostrar un logotipo real de una marca (ej. Stripe, Zapier), utiliza siempre la API de Google Favicon V2 para obtener iconos de alta calidad dinámicamente (`<img src="https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://dominio.com&size=128" />`). NUNCA uses emojis ni SVGs estáticos pesados para marcas.
9. **Iconografía Duotone Premium (SVG):** Para ilustrar conceptos, características o menús, NUNCA utilices SVGs de trazos genéricos. Todos los iconos SVG decorativos deben seguir el estándar "Glass Duotone":
   - **Trazos:** Usa `stroke="currentColor"` con un grosor súper fino y elegante, estrictamente `stroke-width="1.5"` (estilo Apple/Stripe).
   - **Rellenos:** Agrega volumen y profundidad tipo "cristal" usando `fill="currentColor" fill-opacity="0.12"` a `0.15`. Nunca dejes los iconos 100% "huecos".
   - **Figuras y Geometría:** Rechaza abstracciones exageradas o excesivamente intrincadas. Usa geometría perfecta, profesional y minimalista que haga apología directa a la acción (ej. una CPU limpia en lugar de estrellas mágicas para la IA; gráficas de barras definidas). Debe reflejar una estética técnica corporativa ultra-limpia (Quiet Luxury).

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
`cordhq.app/api/stripe/webhook` y Customer Portal configurado en el dashboard.
Los 46 price_ids/meters reales viven en `billing.ts`. El meter de IA está cableado en
`ai-draft`; CFDI/API/usuario también miden uso (ver "Stripe Billing"). ✅ **Clerk Organizations HÍBRIDO
(jun 2026):** código completamente implementado + **config manual COMPLETADA en prod**
(Organizations activado, webhook registrado, migración y backfill corridos — ver sección abajo).


---

## Documentación del proyecto (índice)

CLAUDE.md se dividió (jul 2026) para mejor organización. **No se perdió nada** —
los bloques grandes viven ahora en `docs/` y se **auto-cargan** vía los `@import`
del final de este archivo (el contexto que recibe el agente es idéntico al de antes).

| Archivo | Qué contiene | Léelo cuando… |
|---------|--------------|---------------|
| **`CLAUDE.md`** (este) | Comandos, las 9 Reglas de Diseño core, Stack, Variables de entorno, Deployment, este índice. | Siempre — lo esencial que aplica a TODO. |
| **`docs/historial.md`** | **ÍNDICE** del changelog (jul 2026: se segmentó — ya no es un archivo monolítico). Apunta a los 7 archivos de tema de abajo. | Punto de entrada para saber en qué archivo de historial buscar. |
| **`docs/historial-billing-cobros.md`** | Historial de dinero: Stripe Billing, Connect (Standard/Express/Custom), cobros por anticipo/saldo/cuotas, cobros recurrentes, CFDI/Facturapi, CSD, intereses moratorios, FX. | Tocas planes, cobros, facturación, Connect. |
| **`docs/historial-presupuestos.md`** | Historial de Cédulas Presupuestales, Presupuesto vs. Real, wizard de plan completo, herramientas de análisis (VPN/TIR/EOQ), desempeño por vendedor. | Tocas `/app/presupuestos`, `cedulas.ts`, `analisis.ts`. |
| **`docs/historial-landing-marketing.md`** | Historial de la landing pública completa (home/precios/producto/soluciones/casos de uso/blog/soporte/roadmap/legales), mockups, shaders GLSL/WebGL, SEO/AI-SEO. | Tocas cualquier página pública fuera de `/app`. |
| **`docs/historial-app-features.md`** | Historial de la app interna (`/app/**`): shell, editor de cotizaciones, link público `/q`, dashboard, onboarding, dark mode, entorno de prueba, tiempo real. El más grande — la mayoría del producto vive aquí. | Tocas la app interna. |
| **`docs/historial-auth-clerk.md`** | Historial de auth custom, Clerk Organizations, SSO, org switcher, equipo/roles. | Tocas auth, Clerk, org switcher, equipo. |
| **`docs/historial-platform-api.md`** | Historial de la API REST v1, MCP, webhooks salientes, y el SDK `@flouviahq/elements`. | Tocas `/api/v1`, MCP, webhooks, el paquete npm. |
| **`docs/historial-infra-hitos.md`** | Historial de migración de dominio, fixes de schema/RLS, auditorías de seguridad/escala, hitos fundacionales. | Tocas infraestructura, deploy, o quieres el panorama fundacional. |
| **`docs/app-rutas.md`** | Cómo funciona la app: multi-tenant (tablas/RLS/`org_id`), mapa completo de rutas (landing, app, API pública/MCP, legales), AppLayout. | Tareas de backend, datos, rutas, endpoints, permisos. |
| **`docs/negocio-billing.md`** | Modelo de negocio (planes freemium) y Stripe Billing (suscripciones + medidores de uso). | Tareas de planes, precios, cobros, límites, Stripe. |
| **`docs/landing.md`** | Estructura de la landing (componentes, navbar, animaciones GSAP), fases de construcción y Support Hub. | Tareas en la landing pública, navbar, `/soporte`. |
| **`docs/sistema-de-diseno.md`** | Tokens de diseño (`:root`), sistema visual Flouvia detallado, navbar/animaciones y componentes de UI de la app. | Cualquier tarea visual/UI. |
| **`MOCKUP_STANDARDS.md`** | Estándar obligatorio para crear/editar mockups (ver Regla 7). | Antes de crear/editar cualquier mockup. |

> Todos estos archivos se **auto-cargan** vía los `@import` del final (el contexto que
> recibe el agente es idéntico al de antes de dividir; solo está mejor organizado).
> La columna "Léelo cuando…" es una guía de navegación para saber DÓNDE está cada cosa.

> ⚠️ **Regla de mantenimiento:** al agregar features nuevas, la entrada de changelog va
> en el archivo `docs/historial-<tema>.md` correspondiente (ver tabla de `docs/historial.md`),
> NO en `docs/historial.md` (que es solo el índice) ni en este archivo. Si una sesión toca
> varios temas, la entrada completa va en el archivo del tema DOMINANTE — no la partas a
> mano entre archivos. Las reglas de diseño nuevas y permanentes sí van en la sección
> "Reglas de Diseño y Estilo" de este archivo. Cada tema en su archivo (rutas→app-rutas,
> billing→negocio-billing, landing→landing, UI→sistema-de-diseno) para que CLAUDE.md no
> vuelva a crecer a 2000 líneas, y cada historial-*.md se mantenga en un tamaño manejable
> (si uno vuelve a pasar de ~1500 líneas, vale la pena segmentarlo otra vez).

---

## Variables de entorno

Ver `.env.example`. Los proyectos de Neon, Clerk y Stripe son NUEVOS y separados
de los de flouvia.com:

```
DATABASE_URL=                                                   # Neon (PostgreSQL)
PUBLIC_CLERK_PUBLISHABLE_KEY=  CLERK_SECRET_KEY=                # signup ABIERTO
STRIPE_SECRET_KEY=  STRIPE_WEBHOOK_SECRET=  PUBLIC_STRIPE_PUBLISHABLE_KEY=
RESEND_API_KEY=  RESEND_FROM=                                   # recordatorios de cobro + form de contacto
SALES_EMAIL=                                                    # destino de leads de /contacto/ventas (default hola@flouvia.com)
CRON_SECRET=                                                    # protege /api/cron/recordatorios
FACTURAPI_API_KEY=                                              # CFDI 4.0 vía Facturapi (sk_test_/sk_live_); sin ella el timbrado es SIMULADO
# FACTURAPI_URL=                                                # opcional (default https://www.facturapi.io/v2)
ANTHROPIC_API_KEY=                                              # IA "armar cotización desde texto" + cobranza/MCP
AI_MODEL=                                                       # opcional (default claude-haiku-4-5-20251001 — TODA la IA usa Haiku)
```

Neon se recomienda provisionar vía **Vercel Marketplace → Neon** desde el proyecto
de Vercel de Cord (auto-inyecta `DATABASE_URL` en todos los environments).

---

## Deployment

- **Plataforma:** Vercel (proyecto independiente del de flouvia.com).
- **Dominio:** `cordhq.app` (movido al proyecto de Cord en Vercel; DNS ya
  apunta a Vercel).
- **Modo:** SSR (`output: 'server'`). La landing es `prerender: true`.
- Todas las API routes futuras necesitan `export const prerender = false`.

---

## Documentación extendida (auto-cargada)

Los siguientes archivos se importan automáticamente y forman parte de estas
instrucciones. Léelos como si estuvieran aquí:

@docs/historial.md
@docs/historial-billing-cobros.md
@docs/historial-presupuestos.md
@docs/historial-landing-marketing.md
@docs/historial-app-features.md
@docs/historial-auth-clerk.md
@docs/historial-platform-api.md
@docs/historial-infra-hitos.md
@docs/app-rutas.md
@docs/negocio-billing.md
@docs/landing.md
@docs/sistema-de-diseno.md
@MOCKUP_STANDARDS.md
