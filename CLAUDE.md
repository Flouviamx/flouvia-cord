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
| DB | Supabase (PostgreSQL) — schema en `supabase/schema.sql` |
| Billing | Stripe Billing (freemium) |
| Emails | Resend (transaccionales: cotización vista, aprobada, etc.) |
| CFDI | PAC de timbrado (mismo proveedor que la app de Shopify) |
| Animaciones | GSAP 3 — **solo en landing/login**; dentro de la app, CSS animations |
| Tipografía | Inter (sans) + Instrument Serif (números/montos) |

⚠️ Clerk está **comentado** en `astro.config.mjs` hasta tener las keys en `.env`
(ver `.env.example`). Descomentar al crear la app de Clerk de Trato. **Aún NO hay
ningún proyecto de Supabase/Clerk/Stripe creado** (estado a jun 2026) — solo el
repo + deploy de la landing.

---

## Estado actual (jun 2026)

✅ Esqueleto Astro + tokens de diseño
✅ **Landing de ventas completa** (estilo Stripe/Linear con ADN Flouvia) — desplegada
⬜ App funcional (Fase 1: auth + dashboard + editor) — bloqueada hasta tener keys

---

## Modelo de negocio

Freemium tipo la app de Shopify: gratis hasta 5 cotizaciones activas con
"Powered by Trato" en el link público; planes de pago vía Stripe Billing.
Precios actuales en la landing (MXN/mes, IVA incluido):

| Plan | Precio | Incluye |
|------|--------|---------|
| Gratis | $0 | 5 cotizaciones activas, catálogo, link público + PDF, marca "Powered by Trato" |
| Profesional | $590 MXN/mes | Cotizaciones ilimitadas, tu marca, seguimiento en vivo, Net 30/60, pago en línea |
| Negocio | $1,190 MXN/mes | + CFDI 4.0 automático, clientes con límite de crédito, analítica, soporte prioritario |

> ⚠️ Precios son placeholders comerciales — André los puede ajustar. Si cambian,
> actualizar `src/components/landing/Pricing.astro`.

Moneda v1 = MXN con IVA 16% configurable. Landing + app en el MISMO subdominio
(estilo linear.app: marketing en `/`, app en `/app`).

---

## Multi-tenant

PK de relación = **`org_id`** (NO `email_cliente` como el portal de flouvia-web).
Cada negocio registrado es una `org`; v1 = 1 usuario Clerk por org
(`orgs.clerk_user_id`; multi-usuario en fase 2 con Clerk Organizations).

**Tablas** (`supabase/schema.sql`):
- `orgs` — el negocio (nombre, logo, datos fiscales/RFC/CSD, `quote_prefix`, plan, Stripe IDs)
- `productos` — catálogo de cada org
- `clientes` — a quién se cotiza (con `terminos_default` y `limite_credito`)
- `cotizaciones` — status `draft|sent|viewed|approved|rejected|expired|paid|invoiced` + `public_token` (para `/q/{token}`)
- `cotizacion_items` — líneas (permite línea libre sin producto; `precio_negociado` opcional)
- `eventos` — timeline + "tu cliente vio la cotización" (**feature estrella**)
- `facturas_cfdi` — timbrado SAT (fase 4)

Patrón RLS: `org_id = current_setting('app.org_id', TRUE)::uuid` — el backend setea
el valor antes de cada query (igual que `app.email_cliente` en flouvia-web).

---

## Mapa de rutas

```
# Landing (prerender:true) — YA CONSTRUIDA
/                → landing de ventas (un solo index.astro que monta los componentes)

# App (Fase 1+ — pendiente)
/login /registro → Clerk, diseño borderless tipo LoginUI de flouvia
/app             → dashboard (pipeline por estado, monto por cerrar, activity feed)
/app/cotizaciones        → tabla con filtros segmented-glass
/app/cotizaciones/nueva  → EL EDITOR (pantalla crítica)
/app/cotizaciones/[id]   → detalle + timeline + acciones
/app/productos /app/clientes → CRUDs con import CSV
/app/ajustes     → marca del PDF, datos fiscales/CSD, plan (Stripe portal)
/q/[token]       → vista PÚBLICA de la cotización para el cliente final
                   (la pantalla mejor diseñada — cada cotización enviada es un demo)

# Legales (pendiente)
/privacidad /terminos
```

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
| `Faq.astro` | FAQ (`#faq`) | Acordeón nativo `<details>` |
| `Footer.astro` | CTA final + footer | Navy, enlaza a flouvia.com |

**Filosofía visual (jun 2026):** referencias = **Stripe + Linear**, alma = **Flouvia**.
Minimalista, lujoso, mucho aire. Secciones con `padding: 9rem` vertical. Tipografía
grande (hero H1 `clamp(2.7rem, 6.2vw, 5rem)`). Gradient mesh sutil monocromático
navy (NO los colores saturados de Stripe). Glows suaves estilo Linear bajo los
mockups. **El mockup del producto es la pieza que vende** — cada uno es HTML/CSS puro
con montos en serif italic (`.editorial`).

### Navbar (`Nav.astro`) — replica el sistema de flouvia-web

Es el mismo patrón que `../flouvia/src/components/Navbar.astro`, adaptado:
- **Top-bar** oscuro editorial: "PLATAFORMA DE COTIZACIONES B2B · UN PRODUCTO DE FLOUVIA · HECHO EN MÉXICO".
- **Glass pill** (izquierda) Liquid Glass con los nav-links + **indicador deslizante**
  (`#nav-indicator`, cápsula de vidrio que GSAP desliza al link en hover, estilo
  segmented control iOS).
- **Wordmark central** "trato" (texto Inter 800, no SVG) que **desaparece al hacer
  scroll** y reaparece como `pill-logo` dentro de la glass pill (misma mecánica que
  el logo de flouvia).
- **Derecha:** "Entrar" + botón navy "Empezar gratis".
- **Estado `.scrolled`** (>50px): la glass pill pasa a versión navy translúcida; los
  links y wordmark cambian a blanco. Transición por-propiedad `0.7s var(--ease-spring)`.
- **Mobile:** píldora glass con hamburguesa + wordmark + CTA; overlay con `clip-path:
  circle()` que abre desde la esquina superior derecha; links en serif italic con
  stagger blur.
- **Anti-flash:** gate `.js-anim #navbar { opacity:0 }` (is:global) + entrada GSAP que
  oculta las piezas, revela el contenedor y las entra con stagger. `clearProps` al
  terminar para que `.scrolled`/`:hover` gobiernen.
- Diferencias vs flouvia: SIN lang switch (v1 solo español), SIN login-icon pill
  (usa "Entrar" en texto), wordmark de texto en vez de logos SVG.

### Animaciones de la landing (`index.astro`)

Estándar único heredado de flouvia (ver sección Diseño). El `<script>` de `index.astro`:
- Gate global `.js-anim .reveal, .js-anim .reveal-mockup { opacity:0 }`.
- **Hero** (sobre el fold): revela en carga con stagger `power2.out`; el mockup entra
  con `y:40, scale:0.98 → 1` un poco después.
- **Resto** (`.reveal` fuera del hero): patrón anti-parpadeo — `gsap.set` oculta +
  `ScrollTrigger {once:true, onEnter: gsap.to}`. NUNCA `gsap.from`+`immediateRender`.
- **Mockups fuera del hero** (`.reveal-mockup`, ej. ClientView): entrada con escala.
- Smooth scroll para anchors `#`. `ScrollTrigger.refresh()` tras `fonts.ready`+`load`.
- `prefers-reduced-motion` → todo visible, return temprano.
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
--font-sans: 'Inter';  --font-serif: 'Instrument Serif';
--ease-ios / --ease-spring / --ease-smooth   /* mismos que flouvia */
```

**Reglas tipográficas:**
- **Headings 100% Inter bold** — sin palabra-acento serif (regla mayo 2026 de flouvia).
- **Montos y números SIEMPRE en Instrument Serif italic** → clase `.editorial`
  (definida global en Layout). Es la **firma visual del producto**. Nunca números en
  sans bold. Aplica a: totales, precios, folios en hero, watermarks.
- Eyebrows: `0.65rem`, weight 800, letter-spacing 3px, uppercase, color `#888`.
- Wordmark: "**trato**" en Inter bold lowercase. "by Flouvia" en eyebrow.

**Layout / componentes:**
- Secciones de la landing: `padding: 9rem` vertical (mucho aire, estilo Stripe/Linear).
- Watermarks serif italic gigantes (`rgba(0,0,0,0.025)` claro / `rgba(255,255,255,0.025)`
  oscuro) **solo en landing/login** — dentro de la app NO (es herramienta, no editorial).
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

Ver `.env.example`. Los proyectos de Supabase, Clerk y Stripe son NUEVOS y separados
de los de flouvia.com:

```
SUPABASE_URL=  SUPABASE_ANON_KEY=  SUPABASE_SERVICE_ROLE_KEY=   # SSR only
PUBLIC_CLERK_PUBLISHABLE_KEY=  CLERK_SECRET_KEY=                # signup ABIERTO
STRIPE_SECRET_KEY=  STRIPE_WEBHOOK_SECRET=  PUBLIC_STRIPE_PUBLISHABLE_KEY=
RESEND_API_KEY=
PAC_API_KEY=                                                    # timbrado CFDI
```

---

## Deployment

- **Plataforma:** Vercel (proyecto independiente del de flouvia.com).
- **Dominio:** `trato.flouvia.com` (movido al proyecto de Trato en Vercel; DNS ya
  apunta a Vercel).
- **Modo:** SSR (`output: 'server'`). La landing es `prerender: true`.
- Todas las API routes futuras necesitan `export const prerender = false`.
