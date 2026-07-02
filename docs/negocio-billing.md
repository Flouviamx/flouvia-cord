# Negocio y Billing — Cord

> Modelo de negocio (planes freemium) y Stripe Billing (suscripciones + medidores).
> Auto-cargado vía `@import` desde `/CLAUDE.md`.

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

