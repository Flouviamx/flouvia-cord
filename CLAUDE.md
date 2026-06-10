# Trato — CLAUDE.md

SaaS de cotizaciones B2B standalone de Flouvia. Dominio: **trato.flouvia.com**.
Es la versión independiente de la app de Shopify "Flouvia Cotizaciones B2B"
(repo hermano: `../flouvia/src/data/apps.ts`), dirigida a **cualquier negocio B2B
en México** — no solo Shopify.

## Comandos

```bash
npm run dev      # localhost:4321
npm run build    # build de producción
npm run preview  # preview del build
```

Node requerido: **>=22.12.0** (ver `.nvmrc`)

## Stack (idéntico a flouvia-web)

| Capa | Tecnología |
|------|-----------|
| Framework | Astro 6 (`output: 'server'`) + `@astrojs/vercel` |
| Auth | Clerk (`@clerk/astro`) — **signup ABIERTO** (no invitation-only como el portal de flouvia) |
| DB | Supabase (PostgreSQL) — schema en `supabase/schema.sql` |
| Billing | Stripe Billing (freemium: free / $29 / $59 USD/mes) |
| Animaciones | GSAP 3 — **solo en landing/login**; dentro de la app, CSS animations |
| Tipografía | Inter (sans) + Instrument Serif (números/montos) |

⚠️ Clerk está **comentado** en `astro.config.mjs` hasta tener las keys en `.env`
(ver `.env.example`). Descomentar al crear la app de Clerk de Trato.

## Modelo de negocio

Freemium tipo la app de Shopify: gratis hasta X cotizaciones activas con
"Powered by Trato" en el link público; planes de pago vía Stripe Billing.
Moneda v1 = MXN con IVA 16% configurable. Landing + app en el MISMO subdominio
(estilo linear.app).

## Multi-tenant

PK de relación = **`org_id`** (NO `email_cliente` como el portal de flouvia-web).
Cada negocio registrado es una `org`; v1 = 1 usuario Clerk por org
(`orgs.clerk_user_id`). Tablas: `orgs`, `productos`, `clientes`, `cotizaciones`
(status `draft|sent|viewed|approved|rejected|expired|paid|invoiced` +
`public_token` para `/q/{token}`), `cotizacion_items`, `eventos` (timeline +
"tu cliente vio la cotización" — feature estrella), `facturas_cfdi`.
Patrón RLS: `org_id = current_setting('app.org_id', TRUE)::uuid`.

## Mapa de rutas (plan)

```
/                → landing marketing (prerender, estética flouvia completa)
/precios         → pricing 3 columnas
/login /registro → Clerk, diseño borderless tipo LoginUI de flouvia
/app             → dashboard (pipeline por estado, monto por cerrar, activity feed)
/app/cotizaciones        → tabla con filtros segmented-glass
/app/cotizaciones/nueva  → EL EDITOR (pantalla crítica)
/app/cotizaciones/[id]   → detalle + timeline + acciones
/app/productos /app/clientes → CRUDs con import CSV
/app/ajustes     → marca del PDF, datos fiscales/CSD, plan (Stripe portal)
/q/[token]       → vista PÚBLICA de la cotización para el cliente final
                   (la pantalla mejor diseñada — cada cotización enviada es un demo)
```

## Fases de construcción

1. **Núcleo** — Clerk + schema + CRUDs + editor de cotizaciones + dashboard
2. **Loop completo** — link público `/q/{token}` + tracking `viewed` + PDF + emails (Resend)
3. **Dinero** — Stripe Billing (límites del free) + pago en línea de cotizaciones
4. **CFDI + landing** — timbrado (mismo PAC que la app de Shopify), landing real,
   listar Trato en `apps.ts` y footer de flouvia.com

## Diseño — sistema Flouvia adaptado a producto

Regla de oro: **misma alma, distinto cuerpo**. Tokens en `src/layouts/Layout.astro`.

- Navy `#0a192f`, blanco, hairlines `rgba(0,0,0,0.08)`. Estados: verde `#10b981`
  (aprobada/pagada), ámbar `#f59e0b` (pendiente), rojo `#ef4444` (vencida/rechazada).
- **Headings 100% Inter bold** — sin palabra-acento serif (regla mayo 2026 de flouvia).
- **Montos y números SIEMPRE en Instrument Serif italic** (clase `.editorial`) —
  es la firma visual del producto. Nunca números en sans bold.
- Eyebrows: `0.65rem`, weight 800, letter-spacing 3px, uppercase, color `#888`.
- Watermarks serif italic gigantes (`rgba(0,0,0,0.025)`) **solo en landing/login** —
  dentro de la app no (es herramienta, no editorial).
- Liquid Glass (blur + rim light + specular) en topbar de la app y segmented
  controls de filtros — copiar el patrón del navbar/blog de flouvia-web.
- Wordmark: "**trato**" en Inter bold lowercase + "by Flouvia" en eyebrow.
- Animación: GSAP `power2.out`, fade + y:14, stagger 0.09, gate `.js-anim`
  (script is:inline en el head del Layout) — SOLO landing/login. En la app:
  CSS animations simples (patrón del portal de flouvia-web). Sin blur, sin
  scale, sin SplitText, sin magnetic, sin back.out.
- Hovers: `translateY(-3px)` + sombra, transiciones 0.4–0.6s, `--ease-spring`.
- Cards: border-radius 24px, sombras luxe `0 30px 80px -30px rgba(10,25,47,0.08)`.
  NO borders blancos en fondo oscuro — box-shadow profundo.

Los bugs conocidos y sus fixes (anti-FOUC, anti-parpadeo de reveals, clearProps,
overflow:clip para sticky, estilos de DOM inyectado en `<style is:global>`) están
documentados en el CLAUDE.md de flouvia-web — aplican igual aquí.

## Variables de entorno

Ver `.env.example`. El proyecto de Supabase y la app de Clerk son NUEVOS y
separados de los de flouvia.com.
