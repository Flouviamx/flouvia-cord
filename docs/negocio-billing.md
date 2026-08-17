# Negocio y Billing — Cord

> Modelo de negocio, planes freemium y Stripe Billing. **Este archivo toca dinero
> real: modificar con extremo cuidado.** Para decisiones fechadas consulta
> [`historial-billing-cobros.md`](historial-billing-cobros.md).

---

## Modelo de negocio

Freemium tipo la app de Shopify: gratis hasta 5 cotizaciones activas con
"Powered by Cord" en el link público; planes de pago vía Stripe Billing.
**Matriz maestra de 5 niveles (delimitación ago 2026)** — MXN/mes, IVA incluido,
**Pro = el ancla** (destacado en la landing). Precios base SIN cambios respecto
a jun 2026: el movimiento fue de packaging (qué feature vive en qué plan), no
de precio — los price ID de Stripe LIVE ya tienen suscripciones activas.

| Plan | Precio | Posición | Incluye (resumen) |
|------|--------|----------|-------------------|
| Gratis | $0 | gancho | 5 cotizaciones activas, 5 **enviadas/mes**, 50 prod/cli, 3 IA/mes, "Powered by Cord" |
| Starter | $240 | freelance | 50 cotizaciones, 500 prod/cli, 20 IA + 3 facturas/mes (MX o resto del mundo), tu marca, CSV |
| **Profesional** | **$590** | **DESTACADO** | Ilimitadas, 5 usuarios, 50 IA + 20 facturas/mes, **cobranza + flujo a 90 días**, seguimiento en vivo, analítica |
| Scale | $1,390 | automatización | + 15 usuarios, 500 IA + 100 facturas/mes, aprobaciones, **cobranza autónoma con IA**, SMTP propio, SSO |
| Developer | — | **sin autoservicio** | + usuarios/IA ilimitados, 1,000 facturas + 50,000 API/mes, excedentes al menor costo. Se contrata hablando con ventas (`/contacto/ventas`); `/api/billing/subscribe` rechaza `plan=developer` |

Movimientos de gate respecto a la matriz de jun 2026 (`FEATURE_MIN_PLAN` en
`src/lib/entitlements.ts`): `collections` y `cashflow_90` bajan de Scale a Pro
(van con `cfo_dashboard`, que ya vivía ahí); `international_invoicing` baja de
Scale a Starter para quedar en el mismo peldaño que `cfdi` — mismo carril de
facturación electrónica, distinto solo por país (Regla 10). `collections_ai`
(la cobranza *autónoma*) sigue siendo exclusiva de Scale.

### Qué es "en vivo" en cada plan

El link público del cliente **nunca** se gatea; lo que se cobra es lo que ve el
vendedor. Eso hace que en Gratis el tiempo real sea asimétrico, y conviene tenerlo
explícito porque es fácil leerlo como un bug:

| Señal | Superficie | Gratis / Starter | Pro y superiores |
|---|---|---|---|
| Cambios de contenido (`patch`) | link del cliente | en vivo | en vivo |
| Respuesta del vendedor (chat y por partida) | link del cliente | en vivo | en vivo |
| "El vendedor está en línea" | link del cliente | solo si el vendedor tiene abierto el **link público**; no si está en su página de la app | en vivo en ambos casos |
| Mensajes del cliente | detalle del vendedor | **hay que recargar** | en vivo |
| "Viendo ahora" del cliente | detalle del vendedor | no | en vivo |
| Atención por sección | detalle del vendedor | no | sí |

El vendedor en Gratis no recibe nada en vivo: `/api/cotizaciones/[id]/stream`,
`/presence` y `/atencion` devuelven **402**, y el fallback de polling apunta a
`/presence`, así que también cae. Debe recargar para ver mensajes nuevos.

La fila de "el vendedor está en línea" tiene **dos escritores** y solo uno está
gateado: el stream del vendedor (Pro) mientras tiene el detalle abierto, y el
heartbeat del link público (sin gate) cuando el propio vendedor abre el link en
modo vista previa. De ahí la casilla partida de la tabla.

Esta asimetría es deliberada en su mitad —gatear el carril público dejaría a una org
en Gratis sin poder cobrar por su propio link— pero la otra mitad es una decisión de
packaging abierta: sacar la **entrega de mensajes** del gate y cobrar solo presencia
y atención es un `if` en cada stream. Mientras no se haga, el copy no debe prometer
"chat en tiempo real" en Gratis.

`quote_attention` (ago 2026) nace en Pro, en paridad con `live_presence`: son la
misma promesa comercial —"sabes qué pasa con tu propuesta"— separadas en dos gates
porque una es el estado instantáneo (¿la está viendo ahora?) y la otra el
comportamiento acumulado (¿qué leyó y por cuánto tiempo?). Lo que se cobra es el
**panel del vendedor**, nunca el link del cliente: el carril público
(`/api/q/[token]` y su stream) no lleva `requireEntitlement` por diseño, y
`billing-security-check.mjs` lo verifica — gatearlo dejaría a una org en Gratis sin
poder cobrar por su propio link.

Tope nuevo de Gratis: **envíos mensuales** (`INCLUDED.envios`, `uso_periodo.envios`),
distinto de "cotizaciones activas" — activas es un stock reciclable (cerrar un
trato libera cupo), envíos se reinicia cada mes sin importar cuántas cierres. Sin
meter de Stripe: nunca se cobra, solo bloquea (`reserveUsage(orgId, 'envios', 1)`
en el `action: 'send'` de `/api/cotizaciones/[id].ts`).

Cada plan de pago trae cuota mensual (IA/facturas/API/usuarios); el **excedente se
cobra por uso** vía Stripe Billing Meters. Gratis tiene topes duros; Starter cobra
excedente de IA/facturas/API pero conserva un asiento duro; Pro y Scale cobran los
cuatro medidores; Developer mantiene usuarios e IA ilimitados según la matriz pública,
pero sin camino de autoservicio para entrar a ese plan.
Código de plan almacenado: `free|starter|pro|scale|developer`.
Cuotas incluidas y mapping de price_id/meter en **`src/lib/billing.ts`**.

> ⚠️ Precios son placeholders comerciales — André los puede ajustar. Si cambian:
> - **ES (MXN):** `src/lib/precios.ts` — consumido por `Pricing.astro` (home) y `/precios`.
>   Ahí viven `PLANES`, `COMPARATIVA` (~60 features en 13 grupos) y `FAQ_PRECIOS`.
> - **EN (USD):** `src/lib/precios.en.ts` — misma estructura, precios en USD
>   (Starter $12 · Pro $30 · Scale $70 · Developer $150). Labels "USD" en `src/i18n/ui.ts`
>   (`pr.sub`, `pr.cycle.m`) y en `precios.astro` (meta, lead, tarjeta, ROI).

Cada organización nace con país, moneda y zona horaria. México inicia en MXN con IVA
16% configurable; fuera de México la tasa inicia en 0 para que Cord no invente un impuesto
local y el negocio la configura. Landing + app en el MISMO subdominio
(estilo linear.app: marketing en `/`, app en `/app`).

### Stripe Billing (suscripciones + medidores de uso) — jun 2026

REST puro (sin SDK), igual que el resto de la integración Stripe. Config CENTRAL
en **`src/lib/billing.ts`**: `PLAN_PRICES` (price_id base × ciclo mensual/anual),
`METER_PRICES` (price_id medido por plan × dimensión), `METERS` (mtr_ ids),
`INCLUDED` (cuota mensual por plan), `PRICE_TO_PLAN` (reverse, para el webhook),
y helpers `stripe()`, `getOrCreateCustomer()`, `reserveUsage()`, `cancelUsage()` y
`flushUsageReservation()`.

**Regla autoritativa (ago 2026):** el texto de `orgs.plan` no concede acceso. El
contrato ejecutable vive en `src/lib/entitlements.ts`; `src/lib/org-entitlements.ts`
y la función SQL `cord_effective_plan(uuid)` exigen status `active`, customer y
subscription reales, periodo vigente y una factura pagada que cubra el periodo base
con un nivel igual o superior al solicitado (`billing_paid_plan`).
Una inconsistencia baja el plan efectivo a Gratis; un fallo de BD/verificación bloquea
la operación premium. Las sandboxes heredan esta evidencia de su org padre.

Flujo:
- **Alta/cambio de plan:** `POST /api/billing/subscribe {plan, cycle}` (INTERNA,
  exige permiso de ajustes) → Payment Element o Checkout `mode=subscription` con
  precio base + items medidos. `billing_checkout_attempts` y el índice parcial
  `uq_billing_checkout_open_org` admiten una sola tentativa concurrente por org;
  customer, Subscription y Checkout usan Idempotency-Key estable.
  **Sin periodo de prueba** (eliminado jun 2026): Stripe exige tarjeta en el
  checkout y cobra desde el alta. El CTA de los planes dice "Empezar ahora".
  El lock de tentativa **no** es un castigo por cambiar de opinión: un intento que
  demostrablemente no cobró nada (`creating` sin id de Stripe, suscripción terminal, o
  `incomplete` de otro plan/ciclo) se abandona y libera; uno `active`/`past_due` sigue
  bloqueando y se resuelve en el Portal. Se cancela en Stripe ANTES de liberar el lock
  local; si Stripe falla, 503 conservando el bloqueo. Ver historial (16 ago 2026).
- **Gestionar:** `POST /api/billing/portal` → Customer Portal de Stripe.
- **Cambiar plan/ciclo:** el mismo `POST /api/billing/subscribe` detecta la suscripción
  activa. Un upgrade crea un pending update, factura el prorrateo y conserva el plan
  anterior hasta confirmar ese pago; un downgrade o cambio lateral se programa con
  Subscription Schedule para el cierre del periodo. El Portal se limita a método de pago,
  historial y cancelación porque Stripe no permite modificar ahí suscripciones medidas.
- **Webhook** `POST /api/stripe/webhook` (PÚBLICO, firma HMAC, idempotente vía
  tabla `stripe_events`): `customer.subscription.created/updated` sincroniza
  la proyección local desde el Price real, nunca desde metadata; `.deleted` → free;
  `invoice.paid|payment_failed|payment_action_required|marked_uncollectible|voided`
  sincroniza o revoca la evidencia de pago;
  `checkout.session.completed` liga la suscripción (subscription) o marca la
  cotización `paid` (payment, flujo del link público — sin cambios).
- **Excedente (overage):** `reserveUsage()` toma un advisory lock, incrementa
  `uso_periodo` y crea `usage_reservations` antes de IA/CFDI/API/alta de usuario.
  La reserva se cancela si el proveedor no produjo resultado; si sí, el outbox se
  entrega a Stripe con reintentos. `meter_value` contiene solo la porción que rebasa
  lo incluido: nunca se factura nuevamente la cuota incluida.
- **Reconciliación:** `/api/cron/billing-reconcile` corre una vez al día por el límite
  operativo de Vercel Hobby. Recupera checkouts,
  consulta la suscripción actual y la factura pagada del Price base, corrige eventos
  perdidos, alerta suscripciones duplicadas y drena el outbox. En anual, conserva la
  evidencia anual aunque existan invoices mensuales separadas de medidores.
- **Intervalos mixtos:** anual base + medidores mensuales requiere `billing_mode=flexible`
  y se crea mediante Subscriptions/Payment Element. Stripe Checkout no soporta esa mezcla;
  el fallback alojado rechaza anual explícitamente en vez de crear una suscripción parcial.
- **UI:** `/app/ajustes/plan` usa `getBillingUsage()` (medidores IA/CFDI/API del
  periodo) + botones reales de subir de plan / portal.
- Persistencia: `uso_periodo`, `stripe_events`, `billing_checkout_attempts` y
  `usage_reservations` (las dos últimas con `FORCE RLS`), más evidencia de invoice en
`orgs`. Triggers serializados protegen cotizaciones, productos, clientes y asientos.
- Los price_id/meter_id NO son secretos (viven en `billing.ts`); el secreto es
  `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (env).
- Verificación: `npm run test:payments`, `npm run security:billing-live`,
  `npm run security:billing-db` y `npm run build`.

### Facturación internacional — ago 2026

- México: CFDI 4.0 mediante `MexicoSatProvider` y Facturapi como PAC intercambiable.
  La llave canónica de Cord también se manda como `idempotency_key` de Facturapi; los
  reintentos de red conservan esa llave y los documentos simulados/test no consumen el
  medidor de CFDI.
- Resto de códigos ISO: factura comercial propia de Cord, con folio por organización,
  snapshots inmutables y PDF interno. No equivale a clearance o presentación ante la
  autoridad tributaria local.
- El feature de plan `international_invoicing` habilita la emisión fuera de México y
  requiere **Starter** (bajó de Scale en la delimitación ago 2026, para quedar en el
  mismo peldaño que `cfdi` — mismo carril de facturación electrónica, distinto solo
  por país). `cfdi` conserva su propio gate (también Starter) y el medidor de
  timbrado mexicano; ninguno de los dos consume la cuota del otro
  (`scripts/billing-security-check.mjs` lo verifica sobre el ternario
  `isMexico ? 'cfdi' : 'international_invoicing'` en `/api/cotizaciones/[id].ts`).
- Persistencia: `documentos_fiscales`, `invoice_sequences` y `orgs.fiscal_metadata`, todas
  aisladas por organización; las dos primeras usan RLS y la secuencia usa `FORCE RLS`.
- Los adapters regulatorios futuros deben implementar `FiscalProvider` y registrarse antes
  de `CommercialInvoiceProvider`; no deben sustituir el documento canónico de Cord.


### Stripe Connect Custom (Cobros B2B directos) — jul 2026, auditado y endurecido jul 2026

Implementación nativa ("Quiet Luxury") para que los clientes cobren sus cotizaciones directamente a su banco, sin salir de la experiencia de la app. Reemplaza el esquema viejo de cuentas Express y Hosted Checkout.

Flujo y Arquitectura:
- **Onboarding In-House (`/app/ajustes/cobros`)**:
  - Usa cuentas de tipo `custom` (`createConnectAccount` en `billing.ts`).
  - La recolección de KYC, identidad bancaria (CLABE) y estructura de la empresa se hace con el componente React `ConnectCustomOnboarding.tsx`, con **reanudación** (retoma en el primer requisito pendiente que reporta Stripe, no desde cero), **validación real de CLABE** (dígito de control, pesos 3-7-1), validación de fecha de nacimiento (mayor de 18) y polling automático (cada 6s) mientras la cuenta está "en revisión" — recarga sola al activarse `charges_enabled`.
  - El escaneo de identificación (INE/Pasaporte) y Selfie se hace *en tiempo real* en el navegador usando la cámara web (`LiveCapture.tsx`), enviando la evidencia como `multipart/form-data` (`stripeUpload`) hacia el endpoint `POST /api/billing/connect/document`. El reverso ya no pisa el frente (bug corregido: ambos se guardaban en `[front]`).
- **Checkout In-House (`/q/[token]/pay`)**:
  - Ya no hay redirección al Hosted Checkout de Stripe. Ahora se incrusta el `<PaymentElement>` (`PaymentIsland.tsx`) tematizado con Appearance API (inputs gris `#f5f5f7` sin borde, anillo navy al foco — mismo lenguaje visual que el resto de la app) y `redirect: 'if_required'` (tarjeta confirma sin salir de la página; SPEI redirige a las instrucciones de Stripe y regresa con `?pagado=1`, que el link público muestra como aviso "pago en camino").
  - La ruta `/api/q/[token]/payment-intent.ts` crea un `PaymentIntent` de método único en el servidor (header `Stripe-Account: acct_...`, fondos directo a la cuenta conectada), calcula la tarifa vigente únicamente del lado servidor y **lo reutiliza** en visitas repetidas. La comisión se aplica mediante `application_fee_amount`; las organizaciones legacy conservan tarifa cero hasta aceptar términos. Cambiar monto o método actualiza también la comisión o crea un PI nuevo según corresponda.
  - Soporta pagos con Tarjeta de crédito/débito y Transferencia Bancaria (SPEI / `customer_balance`); ya NO fuerza `payment_method_data[type]=customer_balance` (ese bug forzaba TODO pago a SPEI aunque tarjeta estuviera activa) — el método lo decide el Payment Element al confirmar.
- **Webhooks y Conciliación (`/api/stripe/webhook`)**:
  - Escucha `payment_intent.succeeded` proveniente del nuevo flujo de Stripe Elements.
  - Extrae el método de pago real vía `latest_charge` (consulta el charge en la cuenta conectada) — el `charges.data[0]` embebido ya no existe en las versiones nuevas de la API, así que el método real (tarjeta vs SPEI) se perdía silenciosamente en producción.
  - Marca la cotización como `paid` en la DB, guarda el `evento` y dispara los webhooks salientes (`dispatchQuoteEvent`) — antes moría con un `ReferenceError` (`after(...)` no existe) justo después del `UPDATE`, así que el evento `quote.paid` nunca se disparaba a integraciones de terceros aunque el pago sí quedara marcado.
- **Gestión de la cuenta**:
  - Al ser Custom, la plataforma es responsable. Endpoints en `/api/billing/connect/*` exponen la creación de cuentas bancarias (external_accounts), representantes (persons), subida de documentos y revisión de estado (status). `create.ts` solo desconecta la cuenta guardada cuando Stripe confirma que ya no existe (antes cualquier error de red la borraba); `status.ts` ya no truena con 400 cuando aún no hay cuenta (el wizard arranca en cero sin error en consola).

**Contrato de producción:** Stripe mantiene un segundo endpoint para eventos de
cuentas conectadas, apuntado a la misma ruta y firmado con
`STRIPE_CONNECT_WEBHOOK_SECRET`. En agosto de 2026 se verificó que existe en Live.
Debe conservar al menos `payment_intent.succeeded`; si se elimina o su secreto
diverge, el dinero puede llegar al vendedor sin que Cord marque la cotización pagada.

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
- Una cotización recurrente **nunca se marca `paid`** (es continua, no tiene evento
  terminal) — por eso `getCobranza()`, el cron de intereses, el cron de recordatorios y el
  agente de cobranza IA **excluyen `es_recurrente`** explícitamente (si no, tratan una iguala
  al corriente como cartera vencida). El ingreso mensual real se ve en `getCobros()` vía una
  unión aparte sobre los cobros `'cuota'` que el webhook registra en `cotizacion_cobros`.
- El webhook de cuentas conectadas también debe conservar `invoice.paid`,
  `invoice.payment_failed`, `customer.subscription.updated` y
  `customer.subscription.deleted`. Estos eventos se verificaron en Live en agosto
  de 2026; cualquier cambio en Dashboard debe revalidar la lista y la firma.

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
