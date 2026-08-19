# Proyecto Cord

> Documento de estado actual. Para decisiones fechadas o migraciones, consulta
> [`historial.md`](historial.md).

## Identidad y posicionamiento

Cord es la plataforma de cierre comercial standalone de Flouvia. Cubre el ciclo
desde la propuesta hasta el pago y vive en **cordhq.app**.

Nació como la versión independiente de la app de Shopify "Flouvia Cotizaciones
B2B" del repositorio hermano `../flouvia`, pero Cord no depende de Shopify ni se
limita a B2B, a un tamaño de empresa o a un país. El timbrado CFDI continúa siendo
una capacidad exclusiva de México.

Mensajes canónicos de producto:

- "De la propuesta al pago. Todo en un solo link."
- "El ciclo de ventas desde la propuesta hasta el pago."

La regla completa de copy y posicionamiento vive en
[`estandares-ingenieria.md`](estandares-ingenieria.md#10-posicionamiento-horizontal).

## Repositorio y despliegue

- Repositorio local: `~/Desktop/flouvia-cord`.
- Repositorio hermano: `~/Desktop/flouvia`; son repos Git y proyectos Vercel
  independientes, no carpetas anidadas.
- La app original de Shopify se referencia en `../flouvia/src/data/apps.ts`.
- GitHub: `github.com/Flouviamx/flouvia-cord`.
- Producción: `cordhq.app`.
- Cada push a `main` despliega automáticamente el proyecto independiente de Cord
  en Vercel.

### Rebrand Trato a Cord

El código se renombró a Cord en junio de 2026. La lista histórica de tareas
manuales fuera del repositorio fue:

- renombrar el repositorio GitHub de `flouvia-trato` a `flouvia-cord`;
- renombrar la carpeta local `~/Desktop/flouvia-trato`;
- renombrar el proyecto de Vercel;
- mover el DNS de `trato.flouvia.com` a `cordhq.app`;
- sustituir el arte todavía heredado en
  `public/imgs/logo-cord-{navy,white}.png` cuando André entregue los logos nuevos;
- republicar `@flouviahq/elements` para distribuir el Web Component
  `<cord-cotizador>`.

La ruta local, GitHub y el dominio documentados arriba ya usan Cord. Los puntos
restantes viven fuera del repo y deben verificarse en su sistema correspondiente;
esta lista no afirma por sí sola que sigan pendientes.

## Comandos

Requiere Node **>=22.12.0**. `.nvmrc` fija Node 24.15.0, alineado con Node 24 LTS.

```bash
npm run dev       # desarrollo en localhost:4321
npm run build     # build de producción
npm run preview   # servir localmente el build
npm run db:migrate
npm run test:payments
```

Los scripts especializados de seguridad y operación se descubren en
`package.json`; no se duplican aquí para evitar drift.

## Stack actual

| Capa | Tecnología y contrato |
|---|---|
| Framework | Astro 7.2.0 en modo SSR (`output: 'server'`) con `@astrojs/vercel` 11.0.5. |
| Auth | Backend propio: sesiones stateful en `sessions`, Argon2id, Google OAuth nativo, Apple OAuth, passkeys y TOTP. Cookies principales: `cord_session` y `cord_active_org`. Clerk fue removido. |
| Datos | Neon PostgreSQL serverless. Schema canónico en `db/schema.sql`; aislamiento por organización mediante RLS y transacciones con contexto. |
| Billing | Stripe Billing freemium, medidores de excedente y Customer Portal. |
| Cobros | Stripe Connect para pagos directos a las cuentas conectadas. |
| Correo | Resend para correo transaccional y cobranza. |
| Fiscal | Facturapi mediante `MexicoSatProvider` para CFDI 4.0 en México. |
| IA | Anthropic SDK; `AI_MODEL` permite override. El default del código es `claude-haiku-4-5-20251001`. |
| Animación | GSAP 3 únicamente en landing y login; dentro de la aplicación se usa CSS. |
| Analytics | PostHog para producto y Vercel Analytics para Web Vitals. El contrato detallado vive en [`analytics.md`](analytics.md). |
| Tipografía | Inter como única familia. Los montos usan `.editorial`: Inter 600, tracking `-0.03em` y números tabulares. |

### Estado operativo relevante

- Auth propio está activo. `src/middleware.ts` protege rutas internas y API leyendo
  `cord_session`; `users` y `org_members` son las fuentes de identidad y membresía.
- La migración desde Clerk preservó las identidades existentes mapeándolas a UUIDs
  propios en `users`; el detalle y los scripts históricos viven en el historial de auth.
- Stripe Billing está conectado en producción con cinco planes y medidores de
  excedente. Los identificadores reales de precios y meters viven en
  `src/lib/billing.ts`; llaves, webhook y Customer Portal se configuran fuera del
  repositorio.
- Las referencias históricas a Clerk se conservan en
  `historial-auth-clerk.md`, pero no describen una dependencia vigente.
- Internacionalización real (ago 2026): `orgs.idioma` sirve español e inglés en
  toda la app interna, `/q` y los correos transaccionales — el selector de
  Ajustes ya no dice "próximamente". `orgs.zona_horaria` tiene consumidor real
  vía `src/lib/fmt-server.ts`. Los impuestos son por línea y por país
  (`TAX_PRESETS` en `src/lib/countries.ts` siembra ~35 países al crear la
  cuenta) y las cuentas de depósito usan el formato del país
  (`src/lib/payout-fields.ts`: CLABE, IBAN, routing+account, sort code, transit,
  BSB). Detalle en `negocio-billing.md` y reglas 23–25 de
  `estandares-ingenieria.md`.

## Configuración

La fuente única y completa de variables es [`.env.example`](../.env.example).
Está agrupada por capacidad y documenta obligatoriedad, fallbacks y formatos. No
mantengas una segunda lista exhaustiva en archivos Markdown.

Mapa de configuración:

| Capacidad | Variables principales |
|---|---|
| Auth/OAuth | `GOOGLE_*`, `APPLE_*`, `SITE` |
| Base de datos | `DATABASE_URL` con endpoint pooled |
| Rate limit/MCP | `UPSTASH_REDIS_REST_*`; Neon es fallback durable de `strictRateLimit` |
| Cifrado | `ENCRYPTION_KEY*`; `MCP_SECRET_KEY` solo como compatibilidad histórica |
| SSO | `SAML_SP_PRIVATE_KEY`, `SAML_SP_CERT` |
| Stripe | `STRIPE_*`, incluida la firma separada de Connect |
| Correo y cron | `RESEND_*`, `SALES_EMAIL`, `CRON_SECRET`, `INBOUND_EMAIL_SECRET` |
| Fiscal | `FACTURAPI_*`, incluida la llave de la organización Cord |
| IA | `ANTHROPIC_API_KEY`, `AI_MODEL` |
| Analytics | `PUBLIC_POSTHOG_*`, `POSTHOG_DISABLE_CAPTURE` |

`PUBLIC_SITE_URL` todavía se consume en correo y webhooks con fallback a
`https://cordhq.app`, aunque `SITE` es el origen canónico de OAuth y validación de
origen. Si se consolida este contrato, debe hacerse en código y `.env.example` en
el mismo cambio.

Las antiguas variables `PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` y
`CLERK_WEBHOOK_SECRET` pertenecen al sistema removido. Se preservan en el historial
de la migración, no deben reintroducirse en la configuración vigente.

Neon se recomienda provisionar desde Vercel Marketplace para recibir un
`DATABASE_URL` pooled en todos los entornos.

## Contrato de despliegue

- Plataforma: Vercel, proyecto independiente de `flouvia.com`.
- Producción: `cordhq.app`; el DNS apunta a Vercel.
- Subdominios, todos servidos por el MISMO proyecto y ruteados exclusivamente
  desde `SUBDOMAINS` en `src/middleware.ts` (nunca desde `vercel.json`):
  `dev.` (dev-blog), `docs.` (documentación), `ops.` (Cord Ops) y
  `billing.` (facturación de la suscripción, ago 2026). Cada uno necesita darse
  de alta como dominio del proyecto en Vercel y su CNAME en DNS.
- `billing.cordhq.app` no comparte la cookie de sesión con el apex: la recibe por
  traspaso de un solo uso. Ver regla 26 de `estandares-ingenieria.md`.
- Adaptador: SSR.
- La landing y otras páginas explícitas pueden usar `prerender: true`.
- Toda nueva ruta API debe declarar `export const prerender = false`.
