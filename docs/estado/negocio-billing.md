# Negocio y Billing — Cord

> La suscripción de Cord: modelo de negocio, planes freemium, Stripe Billing,
> medidores de excedente y cortesías internas. **Este archivo toca dinero real:
> modificar con extremo cuidado.**
>
> Lo que el negocio le cobra a SUS clientes (Connect, cobros, facturación,
> impuestos por línea, cartera, KYC) vive en
> [`cobros-facturacion.md`](cobros-facturacion.md). Para decisiones fechadas
> consulta [`../historial/billing-cobros.md`](../historial/billing-cobros.md).

---

## Modelo de negocio

**Configuración operativa verificada (6 sep 2026).** Los 23 Price de Stripe LIVE
(8 base y 15 de consumo) ya incluyen las tarifas USD definidas por Cord. La
consulta de auditoría expande `currency_options` explícitamente; sin ello una
respuesta incompleta no permite verificar monedas. El conjunto completo de
Billing LIVE (precios, medidores, webhook y portal) pasa la revisión.

La base conectada ya tiene las tres columnas de conciliación y
`documento_reembolsos` con ENABLE/FORCE RLS. Se instaló con
`scripts/migrate-invoice-reconciliation.mjs --apply` en una transacción,
tras comprobar tres documentos sin notas activas ni relaciones incompatibles.
No se modificaron pagos ni saldos históricos. El script hace solo lectura sin
`--apply` y está acotado al bloque de conciliación del schema. Este estado no
equivale a desplegar los cambios locales de la app.

**EUR aprobado y configurado en Stripe LIVE.** Starter/Profesional/Scale:
12/30/70 EUR mensuales; 120/300/700 EUR anuales. Se añadieron 17 opciones EUR
sobre los mismos Price (6 base + 11 medidos), sin cambiar MXN/USD ni suscripciones.
Developer continúa por ventas y no tiene tarifa EUR definida. El código local
incluye EUR en precios públicos, checkout, Plan y paywall; requiere publicación.

| Excedente EUR | Starter | Profesional | Scale |
|---|---:|---:|---:|
| Acción extra de IA | 0,20 | 0,175 | 0,15 |
| Factura/timbrado extra | 0,15 | 0,15 | 0,10 |
| Cada 100 solicitudes API | 0,03 | 0,03 | 0,02 |
| Usuario extra al mes | Tope duro | 15 | 15 |

Tarifas canónicas: `src/lib/plan-eur-rates.ts`. Configuración acotada:
`scripts/add-eur-currency-options.mjs` (solo lectura; `--apply` añade faltantes,
rechaza diferencias y preserva las otras monedas). `security:billing-live`
verifica los 23 Price MXN/USD y las 17 opciones EUR, además de medidores,
webhook y portal. API se mide por solicitud y conserva fracciones de céntimo.
Las suscripciones existentes conservan su moneda; una discrepancia con
`expectedCurrency` bloquea el checkout antes de crear una suscripción cobrable.

Freemium tipo la app de Shopify: gratis hasta 5 cotizaciones activas con
"Powered by Cord" en el link público; planes de pago vía Stripe Billing.
**Matriz maestra de 5 niveles (delimitación ago 2026)** — MXN/mes, IVA incluido,
**Pro = el ancla** (destacado en la landing). Precios base SIN cambios respecto
a jun 2026: el movimiento fue de packaging (qué feature vive en qué plan), no
de precio — los price ID de Stripe LIVE ya tienen suscripciones activas.

| Plan | Precio | Posición | Incluye (resumen) |
|------|--------|----------|-------------------|
| Gratis | $0 | gancho | 5 cotizaciones activas, 5 **enviadas/mes**, 50 prod/cli, 3 IA y **3 facturas/mes** (habilitación temporal), "Powered by Cord" |
| Starter | $240 | freelance | 50 cotizaciones, 500 prod/cli, 20 IA + 3 facturas/mes (MX o resto del mundo), tu marca, CSV |
| **Profesional** | **$590** | **DESTACADO** | Ilimitadas, 5 usuarios, 50 IA + 20 facturas/mes, **cobranza + flujo a 90 días**, seguimiento en vivo, analítica |
| Scale | $1,390 | automatización | + 15 usuarios, 500 IA + 100 facturas/mes, aprobaciones, **cobranza autónoma con IA**, SMTP propio, SSO |
| Developer | — | **sin autoservicio** | + usuarios/IA ilimitados, 1,000 facturas + 50,000 API/mes, excedentes al menor costo. Se contrata hablando con ventas (`/contacto/ventas`); `/api/billing/subscribe` rechaza `plan=developer` |

Movimientos de gate respecto a la matriz de jun 2026 (`FEATURE_MIN_PLAN` en
`src/lib/entitlements.ts`): `collections` y `cashflow_90` bajan de Scale a Pro
(van con `cfo_dashboard`, que ya vivía ahí); `international_invoicing` y `cfdi`
quedan temporalmente en Gratis con 3 documentos al mes — mismo carril de
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

> Los cambios comerciales requieren aprobación de André. Fuentes:
> - **Importes por divisa y copy ES:** `src/lib/precios.ts` — consumido por `Pricing.astro` (home) y `/precios`.
>   Ahí viven `PLANES`, `COMPARATIVA` (~60 features en 13 grupos) y `FAQ_PRECIOS`.
> - **Copy EN:** `src/lib/precios.en.ts` comparte los importes canónicos.
>   El idioma no determina la moneda del contrato.

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
  bloqueando y se resuelve desde Pago y comprobantes. Se cancela en Stripe ANTES de
  liberar el lock local; si Stripe falla, 503 conservando el bloqueo. Ver historial (16 ago 2026).
- **Gestionar (ago 2026): `billing.cordhq.app`**, superficie propia fuera del
  chrome de la app (`src/pages/billing/`, `BillingLayout.astro`). Tarjetas
  (`/api/billing/methods` + SetupIntent), comprobantes con PDF proxiado
  (`/api/billing/invoices`), datos de facturación (`/api/billing/datos`),
  cancelar/reanudar (`/api/billing/cancelar`), liquidar un cobro vencido
  (`/api/billing/pagar`) y **CFDI del pago de suscripción** (`/api/billing/factura`).
  Ninguna superficie enlaza ya al Customer Portal; `POST /api/billing/portal`
  sobrevive sin UI como escape de soporte.
  El guard común —incluido el check de pertenencia al customer de la org, que es
  lo que evita leer la factura de otro negocio— vive en `src/lib/billing-surface.ts`.
- **Sesión en el subdominio:** `cord_session` es host-only y NO viaja a
  `billing.cordhq.app`. El apex emite un token de un solo uso
  (`GET /api/billing/handoff`, tabla `billing_handoff_tokens`, 90 s) y
  `/billing/entrar` lo canjea por una sesión **propia** de ese host. Ampliar la
  cookie a `.cordhq.app` la habría mandado también a ops./docs./dev.; el
  aislamiento de Ops es deliberado.
- **CFDI de la suscripción (solo México):** `emitSubscriptionInvoice()` en
  `src/lib/fiscal/emit.ts`, gemelo de `emitPlatformInvoice()` — mismo emisor, mismo
  CSD de Cord (`FACTURAPI_CORD_ORG_KEY`). El precio de Cord se publica con impuesto
  incluido, así que el subtotal se **desagrega** del total, no se le suma IVA
  encima. Doble timbrado imposible por el índice único
  `suscripcion_facturas.stripe_invoice_id`: cancelar un CFDI ante el SAT exige
  aprobación del receptor. Fuera de México no se ofrece — el comprobante del cobro
  ya es el documento (regla 24).
- **Cambiar plan/ciclo:** el mismo `POST /api/billing/subscribe` detecta la suscripción
  activa. Un upgrade crea un pending update, factura el prorrateo y conserva el plan
  anterior hasta confirmar ese pago; un downgrade o cambio lateral se programa con
  Subscription Schedule para el cierre del periodo. Los cambios de plan medidos pasan
  siempre por este flujo: Stripe no permite modificar una suscripción medida desde el
  Customer Portal.
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


### Cortesías internas: `set-plan.mjs --comp` — ago 2026

`orgs.plan` es una proyección (Regla 17), así que `set-plan.mjs --plan=...` **no
desbloquea nada**: deja la org con `plan='developer'` y el resto de columnas de
billing en NULL, y `cord_effective_plan()` responde `free`. Es el
comportamiento correcto y es la confusión que motivó esta sección.

Una suscripción creada **a mano en el dashboard de Stripe** tampoco se liga
sola: no trae `metadata.org_id`, y `cord_resolve_org_for_billing()` solo
encuentra la org por un `stripe_customer_id`/`stripe_subscription_id` **ya
guardado**. El webhook llega y no sabe a quién aplicarla.

```bash
node scripts/set-plan.mjs --comp --org=<uuid> --sub=sub_...
```

Lee la suscripción real de Stripe, exige `status = 'active'`, resuelve el plan
desde el price contra `PLAN_PRICES` (parseado de `billing.ts`, no copiado) y
sella las seis columnas que exige `hasPaidBillingEvidence()`:
`stripe_subscription_id`, `stripe_customer_id`, `subscription_status`,
`current_period_end`, `billing_paid_through` y `billing_paid_plan`. A partir de
ahí el webhook la mantiene sincronizada sola.

Rechaza sandboxes (heredan el estado de su padre), suscripciones no activas,
periodos vencidos y precios fuera del catálogo — el caso típico de cruzar
test/live.

**Lo que deliberadamente NO hace: relajar la evidencia de pago.**
`syncPaidBillingInvoice` sigue exigiendo `amount_paid > 0` para todas las orgs.
Una factura de Stripe con `status='paid'` pero importe cero (cortesía, cupón del
100%) **no** escribe `billing_paid_through`: manda alerta a Ops y se detiene. Las
cortesías se conceden por este carril explícito y auditable, no aflojando la
regla que autoriza a los clientes de verdad.

