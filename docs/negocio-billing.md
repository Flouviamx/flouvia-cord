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


### Stripe Connect Custom (Cobros B2B directos) — jul 2026, auditado y endurecido jul 2026

Implementación nativa ("Quiet Luxury") para que los clientes cobren sus cotizaciones directamente a su banco, sin salir de la experiencia de la app. Reemplaza el esquema viejo de cuentas Express y Hosted Checkout.

Flujo y Arquitectura:
- **Onboarding In-House (`/app/ajustes/cobros`)**:
  - Usa cuentas de tipo `custom` (`createConnectAccount` en `billing.ts`).
  - La recolección de KYC, identidad bancaria (CLABE) y estructura de la empresa se hace con el componente React `ConnectCustomOnboarding.tsx`, con **reanudación** (retoma en el primer requisito pendiente que reporta Stripe, no desde cero), **validación real de CLABE** (dígito de control, pesos 3-7-1), validación de fecha de nacimiento (mayor de 18) y polling automático (cada 6s) mientras la cuenta está "en revisión" — recarga sola al activarse `charges_enabled`.
  - El escaneo de identificación (INE/Pasaporte) y Selfie se hace *en tiempo real* en el navegador usando la cámara web (`LiveCapture.tsx`), enviando la evidencia como `multipart/form-data` (`stripeUpload`) hacia el endpoint `POST /api/billing/connect/document`. El reverso ya no pisa el frente (bug corregido: ambos se guardaban en `[front]`).
- **Checkout In-House (`/q/[token]/pay`)**:
  - Ya no hay redirección al Hosted Checkout de Stripe. Ahora se incrusta el `<PaymentElement>` (`PaymentIsland.tsx`) tematizado con Appearance API (inputs gris `#f5f5f7` sin borde, anillo navy al foco — mismo lenguaje visual que el resto de la app) y `redirect: 'if_required'` (tarjeta confirma sin salir de la página; SPEI redirige a las instrucciones de Stripe y regresa con `?pagado=1`, que el link público muestra como aviso "pago en camino").
  - La ruta `/api/q/[token]/payment-intent.ts` crea un `PaymentIntent` en el servidor (header `Stripe-Account: acct_...`, fondos directo a la cuenta conectada, cero comisión de Cord) y **lo reutiliza** en visitas repetidas (columna `cotizaciones.stripe_payment_intent_id`) — antes cada recarga creaba un PI + customer nuevos, lo que le daba a SPEI una CLABE distinta cada vez. Si el total cambió (re-versión) actualiza el monto del PI existente en vez de crear otro.
  - Soporta pagos con Tarjeta de crédito/débito y Transferencia Bancaria (SPEI / `customer_balance`); ya NO fuerza `payment_method_data[type]=customer_balance` (ese bug forzaba TODO pago a SPEI aunque tarjeta estuviera activa) — el método lo decide el Payment Element al confirmar.
- **Webhooks y Conciliación (`/api/stripe/webhook`)**:
  - Escucha `payment_intent.succeeded` proveniente del nuevo flujo de Stripe Elements.
  - Extrae el método de pago real vía `latest_charge` (consulta el charge en la cuenta conectada) — el `charges.data[0]` embebido ya no existe en las versiones nuevas de la API, así que el método real (tarjeta vs SPEI) se perdía silenciosamente en producción.
  - Marca la cotización como `paid` en la DB, guarda el `evento` y dispara los webhooks salientes (`dispatchQuoteEvent`) — antes moría con un `ReferenceError` (`after(...)` no existe) justo después del `UPDATE`, así que el evento `quote.paid` nunca se disparaba a integraciones de terceros aunque el pago sí quedara marcado.
- **Gestión de la cuenta**:
  - Al ser Custom, la plataforma es responsable. Endpoints en `/api/billing/connect/*` exponen la creación de cuentas bancarias (external_accounts), representantes (persons), subida de documentos y revisión de estado (status). `create.ts` solo desconecta la cuenta guardada cuando Stripe confirma que ya no existe (antes cualquier error de red la borraba); `status.ts` ya no truena con 400 cuando aún no hay cuenta (el wizard arranca en cero sin error en consola).

⚠️ **Pendiente de configuración manual (no es código):** falta el SEGUNDO endpoint de webhook en el dashboard de Stripe ("eventos en cuentas conectadas", misma URL, evento `payment_intent.succeeded`) con su secreto en `STRIPE_CONNECT_WEBHOOK_SECRET` — sin esto el dinero cae al vendedor pero Cord nunca marca la cotización pagada.

### Cobros recurrentes — igualas/retainers vía Stripe Subscriptions (jul 2026)

Feature de dinero real construido sobre Connect Custom para que las agencias/consultoras
(`casos-de-uso/agencias.astro`) puedan de verdad "cobrar la iguala automáticamente cada mes" —
antes esa era una promesa de copy sin código detrás. Detalle completo del diseño, los bugs
encontrados en auditoría y su fix en `docs/historial.md` → "Cobros recurrentes reales para
igualas/retainers vía Stripe Subscriptions". Resumen rápido:

- `cotizaciones.es_recurrente` (solo con `terminos='contado'`, excluyente con anticipo) +
  tabla nueva **`cotizacion_suscripciones`** (una por cotización) — el cliente autoriza tarjeta
  una vez en `/q`, Stripe cobra el total cada mes directo a la cuenta conectada del vendedor.
- `POST /api/q/[token]/subscription-intent.ts` crea/reutiliza la Subscription con
  Idempotency-Key determinística (anti condición-de-carrera); `POST
  /api/cotizaciones/[id]/subscription.ts` cancela (`requirePerm('cobranza')`).
- El webhook de Stripe ramifica `invoice.paid`/`invoice.payment_failed`/
  `customer.subscription.*` de cuentas CONECTADAS a handlers de iguala, separados de los
  handlers de suscripción de PLAN de Cord (son dos sistemas de suscripción distintos sobre el
  mismo endpoint).
- ⚠️ Una cotización recurrente **nunca se marca `paid`** (es continua, no tiene evento
  terminal) — por eso `getCobranza()`, el cron de intereses, el cron de recordatorios y el
  agente de cobranza IA **excluyen `es_recurrente`** explícitamente (si no, tratan una iguala
  al corriente como cartera vencida). El ingreso mensual real se ve en `getCobros()` vía una
  unión aparte sobre los cobros `'cuota'` que el webhook registra en `cotizacion_cobros`.
- ⚠️ Pendiente de configuración manual: el mismo webhook de "eventos en cuentas conectadas" de
  arriba necesita suscribirse ADEMÁS a `invoice.paid`, `invoice.payment_failed`,
  `customer.subscription.updated` y `customer.subscription.deleted`.

### Cobros por términos de crédito + Anticipo/Saldo + Cuotas (jul 2026)

Evolución del cobro simple (1 cotización = 1 PaymentIntent) a **cobros por "rebanadas"**.
Fuente única de la lógica de reparto/fechas: **`src/lib/cobros.ts`**.

- **Gating por términos de crédito:** una cotización a crédito (`net30`/`net60`) NO se puede
  pagar en línea hasta su fecha de vencimiento (`coalesce(approved_at, created_at) + días del
  término` — el MISMO cálculo canónico que `getCobranza()`/cron de intereses/recordatorios). A
  crédito el link muestra "Pedido confirmado con crédito Net 30 — vence el [fecha]" en vez del
  botón de pago. `contado` es pagable desde la aprobación. Gateado en 4 capas: `q/[token].astro`,
  `embed/[token].astro`, `pay.astro` (redirect) y `payment-intent.ts` (409 server-side, defensa
  en profundidad).
- **Tabla `cotizacion_cobros`** (`tipo`: `total` | `anticipo` | `saldo` | `cuota`): cada fila es
  una rebanada pagable con su PROPIO PaymentIntent (SPEI: cada cobro conserva su CLABE estable; un
  **customer POR COBRO** a propósito — la CLABE se asigna por customer). El webhook resuelve el
  cobro por `metadata.cobro_id`, NUNCA por la columna legacy `cotizaciones.stripe_payment_intent_id`
  (que queda de solo-lectura). `numero_cuota NOT NULL DEFAULT 0` para que el unique
  `(cotizacion_id, tipo, numero_cuota)` aplique de verdad. RLS: acceso por `org_id` O `public_token`
  (como `cotizacion_items`) + FORCE.
- **Anticipo:** `cotizaciones.anticipo_pct` (1–99, null = sin anticipo) + `orgs.anticipo_default_pct`
  (default del negocio que pre-llena el editor, guardado vía `/api/org`). Al aprobar (cliente en /q
  o vendedor en PATCH) se materializan anticipo (pagable ya) + saldo (vence según términos) en UNA
  transacción (`materializeAnticipoCobros`). Montos por RESTA de centavos (`splitAnticipo`/
  `splitCuotas`) — jamás redondear ambos lados. El link público muestra desde el primer render el
  desglose "total X · hoy pagas Y de anticipo" (QuoteCard lo SINTETIZA desde `anticipo_pct` antes de
  que existan los cobros reales).
- **`payment-intent.ts` cobro-based:** crea la fila `total` de forma perezosa para el pago simple,
  reutiliza el PI POR COBRO, gatea por `vence`, y si el total cambió sin pagos regenera los cobros
  (cancelando ANTES sus PIs en Stripe; si uno no se puede cancelar, ABORTA — mejor desglose viejo
  que pago huérfano).
- **Webhook `markQuotePaid` por-cobro:** marca el cobro pagado (acepta también `cancelado` — un SPEI
  en vuelo puede liquidarse tras un pago manual o un plan que lo reemplazó; el dinero llegó y se
  registra), y hace el flip a `paid` con un UPDATE atómico idempotente (`NOT EXISTS pendiente`). El
  pago PARCIAL ya NO dispara `quote.paid` a las integraciones (evento informativo). Cobro inexistente
  → evento de conciliación + audit, sin flip.
- **Cobranza IA v2** (`cron/cobranza.ts` + `ar-agent.ts`): due-date canónico (antes usaba
  `c.vigencia`, la validez de la cotización), 3 días de gracia, saldo real = total − cobros pagados,
  link de pago determinista en el correo. Escalación a 15+ días: `propose_payment_plan` con
  validación server-side (cuotas 2-3, suma ≈ saldo ±1%, sin plan duplicado) materializa cuotas REALES
  pagables (cancela el saldo pendiente y sus PIs). El agente ahora es un loop de 2 turnos (tool_result
  real). Guards: `ai_cobranza_activa` + `sandbox_of IS NULL` + `demo-user` + CRON_SECRET; sigue SIN
  agendar en vercel.json (disparo manual).

⚠️ **Regla de dinero permanente (jul 2026):** el driver de Neon devuelve columnas `date` como
OBJETO Date. Comparar `String(v).slice(0,10)` da `"Sun Jul 12"` → lexicográficamente SIEMPRE mayor
que un ISO → bloquea todo pago. Usar SIEMPRE el helper **`venceDia()`** de `cobros.ts` (getFullYear/
getMonth/getDate) para comparar/mostrar fechas `date` leídas de la BD.

---
