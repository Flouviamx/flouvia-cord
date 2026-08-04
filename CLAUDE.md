# Cord — CLAUDE.md

SaaS de cotizaciones y operaciones comerciales standalone de Flouvia. Dominio: **cordhq.app**.
Es la versión independiente de la app de Shopify "Flouvia Cotizaciones B2B"
(repo hermano: `../flouvia/src/data/apps.ts`), dirigida a **cualquier empresa
en cualquier país** — no solo Shopify ni limitada a B2B (aunque el timbrado CFDI siga siendo exclusivo de México).

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
10. **Storytelling y Posicionamiento (Regla Estricta - Jul 2026):** Cord YA NO ES "Software B2B" o "Infraestructura B2B". El nuevo posicionamiento es horizontal y universal: **"Plataforma de cierre comercial"** (Commercial Closing Platform). El mensaje principal a usar en copys y meta-tags es: *"De la propuesta al pago. Todo en un solo link."* o *"El ciclo de ventas desde la propuesta hasta el pago"*. ESTÁ PROHIBIDO usar jerga limitante o excluyente como "solo para empresas B2B", "Corporativo" o "ERP" en landing pages, SEO, esquemas JSON-LD, y metadata. Cord es para CUALQUIER negocio, en cualquier parte.

---

## Stack (idéntico a flouvia-web)

| Capa | Tecnología |
|------|-----------|
| Framework | Astro 6.4.8 (`output: 'server'`) + `@astrojs/vercel` |
| Auth | **MIGRACIÓN COMPLETADA (Jul 2026):** Sistema 100% custom en backend. Sesiones stateful en tabla `sessions`, hashes de password con Argon2id. Google OAuth nativo. `clerk` fue removido. La cookie principal es `cord_session` y el workspace activo usa `cord_active_org`. |
| DB | **Neon (PostgreSQL serverless)** — schema en `db/schema.sql`. Decisión jun 2026: Neon en vez de Supabase. Crear vía Vercel Marketplace → integración Neon (auto-provisiona `DATABASE_URL`). |
| Billing | Stripe Billing (freemium) |
| Emails | Resend (transaccionales: cotización vista, aprobada, etc.) |
| CFDI | **Facturapi** (facturapi.io) — timbrado CFDI 4.0 vía `MexicoSatProvider` |
| Animaciones | GSAP 3 — **solo en landing/login**; dentro de la app, CSS animations |
| Analytics | **PostHog** (Product analytics, CDN SDK + Node) + **Vercel Analytics** (`@vercel/analytics`) para web vitals. PostHog inicia con `opt_out_capturing_by_default: true` — no captura nada hasta que el visitante acepta el aviso de cookies (`src/components/CookieConsent.astro`, montado en `Layout.astro` y `AppLayout.astro`); Vercel Analytics no se gatea (no usa cookies, no identifica a nadie). |
| Tipografía | **Inter única** (las serif se ELIMINARON jun 2026 a petición de André) — montos con clase `.editorial` = Inter 600, tracking −0.03em, `tabular-nums` |

✅ **Auth Custom ACTIVO** (jul 2026): Clerk ha sido desinstalado completamente. Autenticación con email/password (hashes Argon2id), SSO de Google nativo (`/api/auth/google`), Passkeys (`/api/auth/passkeys/*`) y Reset de Password custom (`/api/auth/reset-password/*`). Middleware (`src/middleware.ts`) lee `cord_session` para proteger rutas internas y API. Los componentes de UI (`CustomOrgSwitcher`, `CustomUserProfile`) consumen la data nativa vía BD (tabla `users` y `org_members`). La migración invisible corrió mapeando UUIDs viejos de Clerk a la nueva tabla `users`.
✅ **Clerk en PRODUCCIÓN:** se deja el webhook de Stripe operando independiente. ✅ **Stripe Billing CONECTADO + EN PROD
(jun 2026):** suscripciones de 5 planes + medidores de excedente (ver "Stripe Billing"
abajo); llaves `sk_live`, `STRIPE_WEBHOOK_SECRET` seteado, webhook apuntando a
`cordhq.app/api/stripe/webhook` y Customer Portal configurado en el dashboard.
Los 46 price_ids/meters reales viven en `billing.ts`. El meter de IA está cableado en
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
| **`docs/historial-presupuestos.md`** | Historial de Cédulas Presupuestales, Presupuesto vs. Real, wizard de plan completo, herramientas de análisis. **(MÓDULO ELIMINADO en jul 2026, archivo conservado como referencia)** | Tocas `/app/presupuestos`, `cedulas.ts`, `analisis.ts`. |
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
CLERK_WEBHOOK_SECRET=                                           # firma Svix de /api/clerk/webhook
STRIPE_SECRET_KEY=  STRIPE_WEBHOOK_SECRET=  PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_CONNECT_WEBHOOK_SECRET=                                  # 2º webhook: eventos de cuentas Connect conectadas
RESEND_API_KEY=  RESEND_FROM=                                   # recordatorios de cobro + form de contacto
SALES_EMAIL=                                                    # destino de leads de /contacto/ventas (default hola@flouvia.com)
CRON_SECRET=                                                    # protege /api/cron/*
FACTURAPI_API_KEY=                                              # CFDI 4.0 vía Facturapi (sk_test_/sk_live_); sin ella el timbrado es SIMULADO
FACTURAPI_USER_KEY=                                             # llave de CUENTA de Facturapi — habilita que cada org suba SU CSD y timbre bajo su RFC. Pendiente a propósito (jul 2026): André espera tener usuarios antes de contratar el plan; sin ella el CSD de Ajustes›Fiscal no opera, todo timbra con la llave global
# FACTURAPI_URL=                                                # opcional (default https://www.facturapi.io/v2)
ANTHROPIC_API_KEY=                                              # IA "armar cotización desde texto" + cobranza/MCP
AI_MODEL=                                                       # opcional (default claude-haiku-4-5-20251001 — TODA la IA usa Haiku)
INBOUND_EMAIL_SECRET=                                           # respuestas por correo a la cobranza IA (endpoint hoy inalcanzable a propósito, ver docs/historial-infra-hitos.md)
UPSTASH_REDIS_REST_URL=  UPSTASH_REDIS_REST_TOKEN=              # rate-limit DURABLE compartido entre instancias (src/lib/ratelimit.ts) + sesiones del transporte SSE de MCP (src/lib/mcp/session-store.ts, jul 2026); sin ellas ambos caen a un Map en memoria por proceso — funcionan pero no son globales entre instancias. Provisionar vía Vercel Marketplace → Upstash → Storage del proyecto (auto-inyecta ambas)
MCP_SECRET_KEY=                                                 # opcional (jul 2026) — cifra en reposo mcp_servers.auth_token (AES-256-GCM, src/lib/crypto-secret.ts); sin ella el token se guarda en claro. Generar con `openssl rand -base64 32`
PUBLIC_SITE_URL=                                                # opcional (default https://cordhq.app) — origen fijo para links en correos disparados por CRON (nunca derivar de request.url ahí, ver docs/historial-infra-hitos.md)
PUBLIC_POSTHOG_KEY=  PUBLIC_POSTHOG_HOST=                       # Credenciales de PostHog para analíticas de producto
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

## Roadmap & TODOs (Analytics & Growth)

Implementación en PostHog para escalar el análisis de Growth y activación. Ver
`docs/historial-app-features.md` (entrada "PostHog — auditoría completa y
endurecimiento", ago 2026) para el detalle completo de la auditoría/fixes.

- [x] **`quote_sent`:** Rastrear cuando el usuario da click a "Enviar" o copia el link. Clave para medir el TTV (Time-to-Value).
- [x] **`quote_viewed` / `quote_approved`:** Medir la tasa de éxito (conversión) de las cotizaciones.
- [x] **`payment_received`:** Backend tracking (Stripe Webhook → PostHog) para medir ingresos y caída en el checkout.
- [x] **`ai_draft_used`:** Rastrear el uso del botón "Armar con IA" para confirmar si es el *Aha Moment* que correlaciona con upgrades.
- [x] **`sign_up_completed`:** (ago 2026) server-side, atado a cuenta nueva real (verificación de correo / primer OAuth), nunca a cada login.
- [x] **Group Analytics (B2B):** `group('company', org_id, {plan, created_at, ...})` — el `org_id` es el propio de Cord (auth custom, no Clerk). ⚠️ Es un add-on de pago de PostHog — confirmar que esté contratado antes de esperar que los insights por-cuenta poblen datos.
- [x] **Atribución UTM:** verificado (ago 2026) que no hace falta código nuevo — el SDK de PostHog autocaptura `utm_*` en `$pageview` y los persiste en `$initial_utm_*` tras el primer `identify()`; el flujo landing→registro→verificación no pasa por ningún redirect de dominio que resetee el `distinct_id` anónimo.
- [x] **Eventos de activación/expansión (ago 2026):** `subscription_upgraded`/`downgraded`/`canceled`, `payment_failed`, `stripe_connect_activated`, `cfdi_first_timbrado`, `team_member_invited`/`accepted`, `api_key_created`, `cobranza_ia_activated`, `checkout_started`, `kit_used` — ver la entrada de historial para dónde dispara cada uno.
- [x] **Suite de dashboards en PostHog** (ago 2026): construida en vivo vía el MCP de PostHog (proyecto "Cord", id 535370) — 6 dashboards, 17 insights, todos filtrando por default `is_sandbox=false AND is_demo=false` y usando `payment_received` (nunca `quote_marked_paid`) como única fuente de ingreso real. Ver la entrada "Suite de dashboards de PostHog — construida en vivo vía MCP" en `docs/historial-app-features.md` para el detalle completo (queries exactas, decisiones de diseño, y el hallazgo crítico: el proyecto conectado solo tenía 5 eventos `$pageview` totales al momento de construir — cero eventos de negocio reales — así que todo insight quedó verificado como "corre correctamente, sin datos aún" en vez de "con datos reales". Repoblarán solos en cuanto el tráfico real de producción llegue a ese proyecto de PostHog; si no repueblan, sospechar primero de que `PUBLIC_POSTHOG_KEY`/`PUBLIC_POSTHOG_HOST` en Vercel no apunten a ese mismo proyecto).
  - [Growth & Activation](https://us.posthog.com/project/535370/dashboard/1944817) · [Revenue](https://us.posthog.com/project/535370/dashboard/1944818) · [Core Funnel: Cotización → Cobro](https://us.posthog.com/project/535370/dashboard/1944819) · [Account Health & Retention](https://us.posthog.com/project/535370/dashboard/1944820) · [Feature Adoption](https://us.posthog.com/project/535370/dashboard/1944821) · [Acquisition](https://us.posthog.com/project/535370/dashboard/1944822)
- [x] **Aviso de consentimiento de cookies** (ago 2026): banner estilo Apple, responsive
  (bottom-sheet en móvil), gatea la captura de PostHog vía `opt_in_capturing()`/
  `opt_out_capturing()` (decisión en `localStorage['cord_cookie_consent']`, compartida
  entre landing y app). `privacidad.astro` (ES+EN) actualizado: PostHog y Resend
  agregados a la tabla de subencargados, política de cookies separada en 3 categorías
  precisas. Ver la entrada "Aviso de consentimiento de cookies + PostHog/Resend
  agregados al aviso de privacidad" en `docs/historial-app-features.md`.

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
