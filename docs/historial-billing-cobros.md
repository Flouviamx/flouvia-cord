# Historial — Billing, Cobros y Facturación

> Suscripciones (Stripe Billing), Stripe Connect (Standard/Express/Custom), cobros por
> anticipo/saldo/cuotas, cobros recurrentes (igualas), CFDI/Facturapi, CSD multi-tenant,
> intereses moratorios y FX. Registro acumulativo: cada entrada conserva su fecha;
> ante conflicto, el estado vigente vive en `negocio-billing.md` y en el código.

---

**Cadencia diaria del reconciliador de Billing (14 ago 2026)** — el despliegue que
introdujo `/api/cron/billing-reconcile` fue rechazado por Vercel porque su expresión
horaria excedía el límite del plan Hobby. La programación pasó a una ejecución diaria
a las 05:15 UTC; los webhooks y la entrega inmediata del outbox permanecen como caminos
rápidos, mientras el cron conserva su papel de recuperación ante fallos.

**Núcleo fiscal internacional propiedad de Cord (14 ago 2026)** — la emisión dejó
de modelarse como “llamar a Facturapi y guardar su respuesta”. Cord ahora conserva el
documento canónico, sus partes emisor/receptor, conceptos, totales, moneda, folio y una
fotografía inmutable de los datos con versión de schema. Facturapi permanece como adapter
del carril CFDI 4.0 de México; para los otros 248 códigos ISO se habilitó una factura
comercial numerada y un PDF servido directamente por Cord. La UI dice expresamente que
esa factura comercial no implica presentación, autorización ni timbrado ante la autoridad
local; los futuros adapters regulatorios se podrán insertar sin migrar el dominio.

* El alta y onboarding aceptan los 249 códigos ISO, muestran el país con bandera y aplican
  defaults operativos de moneda/zona horaria. México inicia con IVA 16%; fuera de México
  inicia en 0 para no inventar una tasa local y el negocio la configura. Ajustes cambia de
  “Facturación y CFDI” a “Facturación” fuera de México y expone razón social, identificación
  fiscal con etiqueta local, domicilio y prefijo de factura en `orgs.fiscal_metadata`. El
  país puede corregirse después en Ajustes › General y los selectores de moneda/zona horaria
  usan los catálogos ICU de Node 24, sin una API externa en runtime.
* `documentos_fiscales` ganó proveedor, id externo, folio propio, importes y snapshots.
  `invoice_sequences` reserva la numeración por organización/país/tipo. Un advisory lock y
  `idempotency_key` única impiden doble documento por doble click o pestañas concurrentes;
  México manda esa misma llave en `idempotency_key` a Facturapi, por lo que un timeout o
  una instancia interrumpida puede reintentar sin crear otro CFDI. Los `pending` viejos se
  reclaman con lease y la misma llave. Un resultado reutilizado, simulado o de test tampoco
  vuelve a consumir el medidor de timbrado ni dispara el evento de primer CFDI real.
* `CommercialInvoiceProvider` reemplazó el stub de Estados Unidos y cubre cualquier país no
  mexicano. La descarga provider-neutral `/api/fiscal/documents/:id/:format` valida la
  organización activa: genera el PDF propio o hace proxy autenticado al PAC para PDF/XML de
  CFDI. La bandeja y el detalle usan la URL persistida, moneda y folio reales.
* Los clientes fuera de México ven la identificación fiscal correspondiente en vez de RFC.
  El evento público `invoice.issued` separa una factura comercial de `invoice.stamped`, que
  conserva el significado preciso de CFDI timbrado.
* Migración requerida: `npm run db:migrate`. Verificación local: `npm run security:fiscal`
  y `npm run build` correctos. `astro check` continúa fallando por cientos de diagnósticos
  preexistentes del repositorio; los diagnósticos nuevos de esta entrega se corrigieron.

**Billing autoritativo y cierre de bypasses de suscripción (13 ago 2026)** — se
auditó el flujo completo de los cinco planes contra Stripe Live y todas las superficies
que consumen capacidades o límites. `orgs.plan` dejó de ser una credencial: la nueva
matriz ejecutable (`entitlements.ts`) y el resolver fail-closed (`org-entitlements.ts` /
`cord_effective_plan`) exigen suscripción `active`, ids reales, periodo vigente y pago
que cubra el periodo base y el nivel solicitado. Una factura inferior ya no puede
autorizar un upgrade pendiente; una superior sí cubre un downgrade. Sandboxes heredan el derecho del padre y los downgrades
preservan datos, pero apagan inmediatamente las capacidades no incluidas.

* Checkout usa una tentativa durable única por org e idempotencia en Customer,
  Subscription y Checkout. Suscripciones incompletas, con deuda o pausadas no pueden
  sustituirse por otra; se recuperan desde Portal. El webhook reconsulta el objeto actual
  para ignorar eventos fuera de orden, obtiene el plan solo del Price y revoca en impago,
  acción requerida, incobrable o invoice anulada.
  También se reparó el cambio de plan que antes siempre chocaba con "ya existe una
  suscripción": upgrades usan pending update + prorrateo confirmado en Payment Element;
  downgrades/cambios de ciclo se programan al fin del periodo. Stripe Checkout no admite
  anual base + meters mensuales, por lo que anual usa exclusivamente la Subscription
  flexible dentro de Cord. El Portal queda deliberadamente para método, invoices y
  cancelación: Stripe no actualiza suscripciones usage-based desde esa superficie.
* Se gatearon en servidor y/o capa de datos: equipo/asientos/roles, multi-org, SSO SAML
  (incluidas URLs públicas conservadas), branding y correos, CFDI vs. facturación
  internacional, presencia en vivo, analítica avanzada/CFO/flujo, aprobaciones,
  cobranza/IA/intereses, audit log, replay de webhooks, MCP saliente, API REST, crons y
  límites de cotizaciones/productos/clientes. API keys y webhooks se crean bajo advisory
  lock; tras downgrade solo opera el subconjunto más antiguo cubierto por el plan.
* La medición pasó a reserva atómica previa a la operación. `usage_reservations` es un
  outbox con `FORCE RLS`, identifier e idempotencia estable; los fallos revierten cuota y
  los éxitos se reintentan hasta llegar a Stripe. Se corrigió un cobro excesivo real: los
  meters Live agregan por `sum`, por lo que ahora se envía solo `meter_value` por encima
  de lo incluido, no el consumo total.
* El reconciliador horario recupera tentativas, consulta la factura pagada del Price base,
  detecta customers con múltiples suscripciones y drena el outbox. Se separó el periodo
  anual base de invoices mensuales de uso para que un excedente no conceda acceso ni
  invalide un año ya pagado.
* Stripe Live quedó auditado con 23 prices, 4 meters, Customer Portal y 11 eventos del
  webhook. Se añadieron los cuatro que faltaban: `invoice.payment_action_required`,
  `invoice.marked_uncollectible`, `invoice.voided` y
  `checkout.session.async_payment_succeeded`. La auditoría exacta de importes detectó
  que el usuario adicional de Scale cobraba MXN 250 aunque el contrato declaraba MXN
  300: se creó el Price correcto, se actualizó `billing.ts`, se archivó el anterior y
  ahora el script valida cada importe base y medido, no solo que sea positivo.
  Neon quedó migrado con dos tablas
  `FORCE RLS` y cuatro triggers de límites; también se corrigió el splitter del migrador
  para respetar bloques PostgreSQL `$$...$$`.
* Verificación final: 55 invariantes adversariales de Billing, suite financiera completa,
  auditorías read-only de Stripe Live y Neon, expansiones reales de la API de Stripe y
  build de producción. `astro check` aún reporta errores preexistentes ajenos a Billing,
  aunque el build termina correctamente.

✅ **Auditoría completa de `docs.cordhq.app` para Cord Pagos (ago 2026)** — André pidió
   revisar que toda la documentación pública de pagos explicara "cada paso" con precisión.
   Todas las páginas de `/docs/pagos/*` databan de antes de que Cord Pagos existiera (jul
   23) y la afirmación central — **"Cord no cobra ninguna comisión"** — seguía apareciendo
   en 4 páginas distintas, incluida la que se llama literalmente "Tarifas y ventajas".
   • **Reescritas por completo (ES+EN):** `condiciones.mdx` (tabla real: Tarjeta 4%+$3+IVA,
     SPEI 1%+$7+IVA con tope $588.12, Igualas al mismo rate que tarjeta; cómo se acepta la
     tabla — onboarding paso 8 o Ajustes›Cobros —; la herencia legacy a 0%; qué pasa con la
     comisión en reembolsos/disputas), `resumen.mdx`/`metodos.mdx`/`aceptar.mdx` (marca
     "Cord Pagos", selector explícito de método en vez de Stripe Elements auto-seleccionando,
     pantalla SPEI 100% nativa), `onboarding.mdx` (el wizard real de 8 pasos — Tipo de
     entidad/Datos del negocio/Dirección fiscal/Identidad/Dueños/Verificación/Cuenta
     bancaria/Términos —, antes describía 3 pasos genéricos), `dashboard.mdx` (los 12
     widgets reales del dashboard de `/app/cobros`, antes documentaba 3 KPIs de la versión
     vieja).
   • **2 páginas nuevas (ES+EN):** `reembolsos.mdx` y `disputas.mdx` — no existía ninguna
     documentación de estas dos features (reembolso total/parcial con reautenticación,
     diferencia tarjeta-automático vs. SPEI-manual; evidencia de disputa con autocompletado
     desde los propios datos de Cord, guardar-borrador vs. enviar-irreversible).
   • **Editadas:** `anticipos.mdx`/`igualas.mdx` (cross-link a la tarifa real por cobro).
     3 páginas huérfanas reconectadas a la navegación: `facturacion.mdx` (quitado el
     mention de Stripe + sección nueva del CFDI de la comisión de Cord, emitido en lotes),
     `cobranza-ia.mdx`, y `tesoreria-fx.mdx` — esta última corregía una confusión real:
     atribuía el pronóstico de flujo de caja a `/app/cobros`, cuando desde la
     "Consolidación de Informes" (ver `historial-app-features.md`) ese pronóstico vive en
     `/app/informes`; los intereses moratorios también se recolocaron a su ubicación real
     (Ajustes › Aprobaciones).
   • **`DocsLayout.astro`:** sidebar con 2 grupos nuevos ("Gestión de cobros" ampliado con
     Reembolsos/Disputas/Facturación, y "Cobranza y tesorería" nuevo con los 2 huérfanos).
   • **`scripts/whitelabel-lint.mjs`** ahora cubre `src/content/docs` (antes solo
     `src/content/support`) — al activarlo encontró y se corrigieron 4 fugas más de
     "Stripe" en páginas ajenas a pagos: `cotizacion/envio.mdx`, `cotizacion/opciones.mdx`,
     `desarrolladores/herramientas/elements/eventos.mdx`, `gestion/dashboard.mdx` (ES+EN).
   • Verificado: `npm run build` limpio, `node scripts/whitelabel-lint.mjs` en cero
     hallazgos, las 22 rutas ES+EN de `/docs/pagos/*` responden 200 contra el dev server, y
     el número `$588.12` que aparece en `condiciones.mdx` se confirmó como el que calcula
     de verdad `src/lib/fees.ts` (no una cifra escrita a mano).

**Cord Pagos white-label, comisión transaccional y defensa en profundidad (ago 2026)**:
se implementó el flujo de cobro dentro de Cord con tarjeta o SPEI, cálculo autoritativo
de comisión en servidor, conciliación contable, reembolsos y disputas. El comprador ya
no recibe objetos internos del procesador ni sale a un checkout alojado; tarjeta usa
campos seguros embebidos y SPEI devuelve únicamente instrucciones saneadas que pueden
copiarse, imprimirse, guardarse como PDF o enviarse al correo de la cotización.

* Seguridad de borde: la política CSRF compara orígenes exactos y mantiene una lista
  mínima de rutas cookie-blind; el webhook valida firmas con tolerancia de cinco minutos,
  múltiples firmas y comparación de tiempo constante. Los eventos se reclaman antes de
  ejecutar, admiten recuperación de claims estancados y solo se confirman después de una
  ejecución exitosa. Se agregaron heartbeat, alertas operativas y limpieza de capturas.
* Secretos y autorización: datos bancarios, TOTP, CSD, claves fiscales y secretos de
  webhooks usan cifrado versionado con rotación y backfill por lotes. Las operaciones
  sensibles tienen rate limit estricto, auditoría, listas de campos permitidos y step-up
  de autenticación. Los tokens de captura y nonces de reembolso se guardan únicamente
  como hash.
* Dinero: tarjeta aplica una tarifa combinada de 4% + MXN 3, más IVA. Las igualas con
  tarjeta muestran esa misma tarifa total, aunque la comisión de aplicación de Cord sea
  solo 0.4% más IVA. SPEI aplica 1% + MXN 7, más IVA, con tope de MXN 588.12 por cobro.
  El margen mínimo, el tope y los snapshots por cobro se verifican en servidor. La versión
  `cord-pagos-2026-08-11` exige aceptación expresa antes de aplicar el esquema.
* Ledger: cada cobro concilia cargo, costo del procesador, comisión de Cord, impuestos,
  neto, balance transaction y application fee. El cierre mensual crea un lote borrador y
  alerta a Ops para revisión fiscal; no timbra automáticamente. Los reportes, métricas de
  cliente y desempeño de vendedores descuentan reembolsos sin reabrir la cotización.
* Postventa: los reembolsos de tarjeta se solicitan desde Cobros con permiso dedicado,
  nonce de diez minutos, idempotencia y autenticación reciente. SPEI genera una tarea
  manual y nunca simula una transferencia saliente. Las disputas se sincronizan en Cord,
  alertan de inmediato y permiten guardar evidencia como borrador. Cord genera PDFs de
  recibo y comunicación como archivos válidos del proveedor; el envío definitivo siempre
  requiere confirmación y autenticación reciente.
* White-label y veracidad: se añadió un lint que impide volver a mostrar el nombre del
  proveedor en superficies de comprador o vendedor. Soporte dejó de prometer checkout
  alojado, OXXO, MSI o REP automático y ahora documenta los flujos reales de Cord.
* Protección contractual y privacidad: Términos asigna al vendedor la responsabilidad
  económica de contracargos, cuotas de disputa y saldos negativos, además de autorizar
  recuperación, compensación y pausa operativa. El Aviso de Privacidad declara la CLABE
  cifrada, KYC, selfie, evidencia de disputas y los subencargados Vercel, Upstash y Slack.
  El último paso de Connect exige consentimiento electrónico y registra versión, fecha e IP;
  las fotos de identidad siguen viajando directo a Stripe sin persistencia en Cord.
* Dashboard de Cobros: los 12 widgets se reorganizaron en tres zonas de jerarquía clara:
  balance operativo, KPIs y conciliación densa. Se conservaron todos los identificadores
  `data-widget` y las preferencias guardadas de visibilidad, tamaño y orden relativo. La
  serie principal ahora domina visualmente al comparativo, el método de pago usa una dona
  compacta y el KPI de cobro reutiliza la serie diaria como sparkline.
* RLS: se añadió el rol `cord_app` sin BYPASSRLS y una auditoría automática de tablas
  financieras. La activación en Neon queda deliberadamente separada del cambio de código:
  crear y probar el rol, cambiar `DATABASE_URL`, observar y solo después habilitar FORCE
  en las tablas legacy restantes.

Verificación local: matriz CSRF, firmas, rotación de cifrado, invariantes de comisión,
seguridad de disputas, lint white-label, `git diff --check` y build de producción. La
prueba contra una cuenta conectada real y la activación gradual del rol de base de datos
siguen siendo pasos operativos de despliegue.

✅ **Observabilidad de consumo externo y topes de IA en Cord Ops (ago 2026)** —
   se agregó `/ops/usage` como centro interno para detectar abuso o gasto variable
   antes de recibir la factura del proveedor. Reúne los medidores existentes de
   `uso_periodo` (IA, API, CFDI y usuarios), actividad de `api_requests`, salud de
   `webhook_deliveries`, cobros de `cotizacion_cobros`, tamaño de Neon y la nueva
   telemetría `external_usage_events` para Anthropic y Resend. La tabla nueva está
   aislada por RLS y solo guarda metadatos técnicos agregables, nunca prompts,
   destinatarios, cuerpos, respuestas, API keys ni secretos.
   • El armado de cotizaciones registra tokens de entrada/salida por turno de
     Anthropic. El agente de cobranza ahora también pasa por `checkQuota()`, reporta
     una acción de IA mediante `reportUsage()` y registra ambos turnos cuando usa
     herramientas; antes ese agente consumía Anthropic fuera del medidor mensual.
   • Los correos comerciales enviados con Resend registran éxito, fallo o envío
     omitido cuando existe una organización atribuible. API y CFDI siguen usando sus
     medidores existentes, y Ops calcula alertas al 80%/100% más tasas anormales de
     errores y reintentos.
   • Se cerró un hueco de control en la API pública: REST y MCP ya compartían rate
     limit por minuto y medidor mensual, pero no llamaban `checkQuota()` antes de
     ejecutar. `checkApiKeyRateLimit()` ahora aplica también la cuota mensual a toda
     llave live: free se detiene al llegar al incluido y los planes con overage se
     detienen en el techo de emergencia de 10 veces la cuota.
   • No se inventan estimaciones monetarias: los precios y descuentos de proveedor
     pueden cambiar. Ops muestra unidades, velocidad y riesgo; Anthropic, Resend,
     Stripe, Facturapi, Vercel y Neon conservan la factura autoritativa.

✅ **Cobros recurrentes reales para igualas/retainers vía Stripe Subscriptions (jul 2026)** —
   auditoría de "promesas que el código hace pero no cumple": `casos-de-uso/agencias.astro`
   prometía "cargo automático cada mes" para igualas de agencias/consultoras, pero el sistema
   real solo generaba un link de pago manual + recordatorios — una FAQ de la misma página ya
   lo admitía honestamente, contradiciendo al resto del copy. Se construyó el feature real
   sobre **Stripe Subscriptions + Stripe Connect Custom**: el cliente autoriza su tarjeta UNA
   sola vez desde el link público y Stripe cobra el total automáticamente cada mes, **directo
   a la cuenta bancaria del vendedor** (mismo patrón `Stripe-Account: acct_...` que los cobros
   directos, cero comisión de Cord).
   • **Tabla nueva `cotizacion_suscripciones`** (una por cotización, `unique(cotizacion_id)`):
     `stripe_subscription_id/customer_id/price_id/product_id` (todos en la cuenta CONECTADA),
     `monto`, `moneda`, `intervalo`, `estado` (incomplete|active|past_due|canceled),
     `current_period_end`, `cancel_at_period_end`. RLS por `org_id` O `public_token` (mismo
     patrón que `cotizacion_cobros`) + FORCE. Columna nueva `cotizaciones.es_recurrente`
     (solo con `terminos='contado'`, mutuamente excluyente con anticipo — forzado server-side
     en `createCotizacion` y en el PATCH de `update_draft`, no solo en el cliente).
   • **`POST /api/q/[token]/subscription-intent.ts`** (nuevo, espejo de `payment-intent.ts`):
     crea/reutiliza **perezosamente** (no en el momento de aprobación, para no dejar
     suscripciones huérfanas si el cliente nunca autoriza) Product+Price(mensual)+Customer+
     Subscription (`payment_behavior=default_incomplete`, solo `card` — `customer_balance`/SPEI
     no puede auto-cobrar, obligaría a fondear el balance cada mes, así que una iguala
     "automática" no puede correr sobre SPEI) en la cuenta conectada, devuelve el
     `client_secret` de la primera factura. Protegido con **Idempotency-Key determinística**
     (derivada del `cotizacion_id`) contra condiciones de carrera (doble clic/doble pestaña/
     retry de red no crean una segunda Subscription en Stripe).
   • **`POST /api/cotizaciones/[id]/subscription.ts`** (nuevo): el vendedor cancela con
     `cancel_at_period_end: true`, gated por `requirePerm('cobranza')`.
   • **Webhook (`stripe/webhook.ts`) ramificado por `event.account`:** los eventos de
     suscripción/factura de una cuenta CONECTADA (`invoice.paid`/`invoice.payment_failed`/
     `customer.subscription.updated`/`.deleted`) van a handlers nuevos de IGUALA
     (`recurringInvoicePaid`/`recurringInvoiceFailed`/`syncQuoteSubscription`/
     `cancelQuoteSubscription`), completamente separados de los handlers de SUSCRIPCIÓN DE
     PLAN de Cord (`syncSubscription`/`downgradeToFree` — el billing SaaS de la plataforma).
     Son dos sistemas de suscripción distintos compartiendo el mismo endpoint; `findQuoteSub()`
     valida que `stripe_account_id` de la fila coincida con `event.account` (defensa
     multi-tenant). Cada cobro mensual pagado se registra como fila `'cuota'` en
     `cotizacion_cobros` (para que el historial de pagos del vendedor lo muestre) — la
     cotización recurrente **nunca** se marca `paid` (una iguala nunca está "totalmente
     pagada", es continua).
   • **UI:** toggle "Cobro recurrente mensual (iguala)" en el editor (`nueva.astro`, solo con
     términos=contado, oculta/anula anticipo); nota + botón "Autorizar cobro mensual" en el
     link público (`QuoteCard.astro`/`pay.astro`, `PaymentIsland.tsx` en modo `subscription`);
     tarjeta de estado + botón "Cancelar iguala" (`cordConfirm` danger) en el detalle del
     vendedor (`cotizaciones/[id].astro`).
   • **2 bugs reales encontrados y corregidos por una auditoría de correctness antes de dar el
     feature por bueno:** (1) **igualas activas tratadas como deuda vencida** en 4 sitios que
     ya asumían "`status='approved'` desde hace mucho = cartera sin cobrar" y nunca excluían
     `es_recurrente` — `getCobranza()` (aging sin tope), el cron de intereses moratorios
     (cargaba interés mensual sobre una cuenta que se cobraba puntual), el cron de
     recordatorios (avisaba "tu pago vence" a clientes al corriente), y el agente de cobranza
     con IA (le reclamaba a un cliente una deuda que no existía, porque `saldo = total −
     cotizacion_cobros pagados` siempre daba el total completo). Los 4 ahora excluyen
     `es_recurrente is not true`. Además el ingreso real de las igualas era invisible en
     `getCobros()` (dashboard "Mi dinero", filtraba por `status='paid'`, que una iguala nunca
     alcanza) — se agregó una unión aparte que suma los cobros `'cuota'` de cotizaciones
     recurrentes, sin doble conteo (los dos universos son disjuntos). Se auditó también
     `getCFO()`/`getAnalytics()` por el mismo patrón — **no aplica**: `getCFO()` solo cuenta
     como "pipeline abierto" `status in ('sent','viewed')` (nunca `approved`), y
     `getAnalytics()`/`getDashboard()` tratan `approved` como "cerrado/ganado" (semántica
     correcta para una iguala aprobada, no es lo mismo que "dinero pendiente de cobrar"). (2)
     **condición de carrera** en `subscription-intent.ts` que podía crear DOS Subscriptions
     activas en Stripe (huérfana + no cancelable desde Cord) si dos requests llegaban
     concurrentes — corregido con Idempotency-Key determinística.
   • **Copy de `agencias.astro` corregido** (FAQ, tarjeta "Retainers Mensuales Automáticos",
     "Seguimiento en tiempo real") para describir el flujo real: autorización única de tarjeta
     → cobro automático mensual directo a la cuenta del vendedor, requiere cobros con tarjeta
     conectados. No existe `/en/casos-de-uso` (solo ES), así que no hubo versión EN que tocar.
   ⚠️ **Pendiente de configuración manual en Stripe (no es código):** el webhook de "eventos en
     cuentas conectadas" (el mismo segundo endpoint que ya deben tener los cobros directos, con
     `STRIPE_CONNECT_WEBHOOK_SECRET`) necesita suscribirse ADEMÁS a `invoice.paid`,
     `invoice.payment_failed`, `customer.subscription.updated` y `customer.subscription.deleted`
     — sin esos eventos las igualas se autorizan y cobran bien en Stripe, pero Cord no
     reflejaría los cobros mensuales ni el estado de la suscripción. No se requiere un tercer
     endpoint ni env vars nuevas.
   ⚠️ **Limitación conocida (no es bug de dinero):** si el vendedor marca una cotización como
     recurrente sin tener los cobros con tarjeta conectados, el cliente ve la nota de la iguala
     pero no aparece el botón de autorizar (`subscription-intent` responde 403). Sin pérdida de
     dinero, solo un callejón suave — falta un aviso proactivo en el editor.
   • Verificado: `npm run db:migrate` corrido contra Neon (tabla + columna aditivas), 2 pasadas
     de `npm run build` limpias (antes y después de las correcciones de la auditoría).

✅ **Auditoría de conexiones custom + go-live listo (jul 2026)** — André pidió verificar que TODO
   lo custom (Stripe Billing mensual/anual/excedentes, Stripe Connect Custom, Clerk custom) conecte
   sin errores y un mapa de qué faltaba para operar con usuarios reales. Resultado de la auditoría
   (read-only sobre billing.ts, subscribe/portal, webhook de Stripe, connect/*, payment-intent,
   cobros, middleware, clerk/webhook, resolución de org + build limpio):
   • **Todo verificado OK:** suscripciones (Payment Element custom + Checkout fallback → webhook
     `syncSubscription` otorga plan solo en `active`), excedentes por uso cableados en las 4
     dimensiones (ia/timbrado/api/usuario, con `checkQuota` + `reportUsage` + techo anti-runaway
     10×), Connect Custom (PI por cobro, CLABE SPEI estable, conciliación por `cobro_id`, flip
     atómico idempotente, defensa multi-tenant por `event.account`), Clerk (middleware, webhook de
     sync sin degradar owner, `getActiveOrgId` con carriles API-key/Clerk-org/membresía/sandbox).
   • **1 bug real corregido — `current_period_end`:** `subscribe.ts` fija la API `2025-06-30.basil`,
     versión en la que Stripe MOVIÓ `current_period_end`/`current_period_start` del objeto
     Subscription raíz a cada ITEM. El webhook `syncSubscription` lo leía del nivel raíz → llegaba
     `undefined` → la fecha de renovación del plan se guardaba `null` (el plan sí se otorgaba bien;
     solo la fecha en Ajustes › Plan salía en blanco). Fix: `sub.current_period_end ??
     sub.items.data[0].current_period_end`. ⚠️ Regla a futuro: al pinnear una versión nueva de la
     API de Stripe en las llamadas salientes, considerar que los eventos del webhook pueden llegar
     con OTRA versión (la default del endpoint en el dashboard) — leer campos que se movieron entre
     versiones de forma defensiva.
   • **Config de go-live COMPLETADA por André** (era todo config manual, no código): 2º webhook de
     Stripe "eventos en cuentas conectadas" + `STRIPE_CONNECT_WEBHOOK_SECRET` (sin él el dinero de
     Connect caía al vendedor pero Cord no marcaba el cobro pagado — era EL gap crítico), llaves
     live de Stripe/Clerk en Vercel, Customer Portal, Resend/CRON_SECRET/Facturapi/Anthropic, y el
     **`DATABASE_URL` de Vercel apuntando al endpoint POOLED de Neon** (`-pooler` en el host —
     necesario para no agotar conexiones con usuarios concurrentes). Pendiente de producto (no
     bloquea MX): `USInvoiceProvider` sigue stub (facturación US no real); activación LIVE de la
     plataforma Connect Custom depende de aprobación de Stripe.

✅ **Cobros por términos de crédito + Anticipo/Saldo + Cobranza IA con link de pago (jul 2026)** —
   feature de 3 piezas pedido por André ("pagar solo tiene sentido al contado… que la cotización
   pueda cobrar el anticipo y luego el otro %… y al vencer el crédito el agente de cobranza mande
   el link de pago"). Diseño validado por el agente billing-fiscal-specialist antes de codificar.
   • **Gating por términos:** una cotización Net 30/60 aprobada YA NO muestra el botón de pago —
     el cliente ve "Pedido confirmado con crédito Net 30 — vence el [fecha]" y el pago se habilita
     al llegar la fecha (cálculo canónico `coalesce(approved_at, created_at) + días del término`,
     el mismo de getCobranza/intereses/recordatorios). Gateado en 4 capas: `q/[token].astro`,
     `embed/[token].astro`, `pay.astro` (redirect) y `payment-intent.ts` (409 server-side).
     `getCotizacionByToken` expone `pagoDisponible`/`saldoVence`/`cobros`/`anticipoPct`.
   • **Tabla nueva `cotizacion_cobros`** (anticipo | saldo | cuota | total): cada cotización se
     cobra en "rebanadas", cada una con su PROPIO PaymentIntent (SPEI conserva su CLABE estable
     por cobro; un customer POR COBRO a propósito — la CLABE se asigna por customer). RLS con
     acceso por `org_id` O `public_token` (como `cotizacion_items`) + FORCE. `numero_cuota NOT
     NULL DEFAULT 0` para que el unique `(cotizacion_id, tipo, numero_cuota)` aplique de verdad
     (NULLs serían distintos entre sí). Columnas nuevas: `cotizaciones.anticipo_pct`,
     `orgs.anticipo_default_pct`. La columna legacy `cotizaciones.stripe_payment_intent_id` queda
     de solo-lectura (el webhook resuelve por `metadata.cobro_id`, NUNCA por esa columna).
   • **Anticipo:** campo "% de anticipo" en el editor (preview en vivo "tu cliente paga $X al
     aprobar y $Y según términos") + default en Ajustes › Cotizaciones (`anticipo_default_pct`,
     agregado a PATCH /api/org por la regla de guardado). Al aprobar (ambas rutas: cliente en /q
     y vendedor en PATCH) se materializan anticipo (pagable ya) + saldo (vence según términos) en
     UNA transacción (dos inserts sueltos podían dejar solo el anticipo → flip prematuro a paid).
     Montos por RESTA de centavos (`splitAnticipo`/`splitCuotas` en `src/lib/cobros.ts`) — jamás
     redondear ambos lados. `payment-intent.ts` reescrito cobro-based: fila 'total' perezosa para
     el pago simple, PI reutilizable POR COBRO, gate por `vence`, regeneración si el total cambió
     sin pagos (cancelando ANTES los PIs en Stripe; si uno no se puede cancelar se ABORTA — mejor
     desglose viejo que pago huérfano).
   • **Webhook (`markQuotePaid`) por-cobro:** marca el cobro pagado (acepta también 'cancelado' —
     un SPEI en vuelo puede liquidarse tras un pago manual o un plan que lo reemplazó; el dinero
     llegó y SE REGISTRA, incluso si la cotización ya está 'paid'), cancela pendientes si lo
     pagado cubre el total, y hace el flip a 'paid' con un UPDATE atómico idempotente (`NOT
     EXISTS pendiente`) — el pago PARCIAL ya NO dispara `quote.paid` a las integraciones (sería
     mentirles); dispara evento informativo. Cobro inexistente → evento de conciliación + audit,
     sin flip. El pago manual del vendedor y el plan de cuotas cancelan sus PIs en Stripe
     (best-effort) para que una pestaña de checkout abierta no sobre-cobre.
   • **Cobranza IA v2:** el cron usaba `c.vigencia` (validez de la cotización, NO la fecha de
     pago) → corregido al cálculo canónico; status ampliado a `approved+invoiced` con 3 días de
     gracia; saldo REAL = total − cobros pagados; TODO correo lleva el link de pago determinista
     (botón "Pagar $X en línea" con el monto del cobro exigible, no del saldo total; sin cobro
     online activo el botón dice "Ver cotización y opciones de pago" → /q). Escalación a los 15+
     días: `propose_payment_plan` con validación SERVER-SIDE (cuotas 2-3, suma ≈ saldo ±1%, sin
     plan duplicado) materializa cuotas REALES pagables (cancela el saldo pendiente y sus PIs);
     `ar-agent.ts` ahora es un loop de 2 turnos (tool_result real de vuelta al modelo — adiós al
     "[Sistema:…]" sintético). Cliente al corriente de su plan NO recibe cobranza. Guards
     intactos: `ai_cobranza_activa` + `sandbox_of IS NULL` + `demo-user` + CRON_SECRET; sigue
     SIN agendar en vercel.json (disparo manual, decisión de André).
   • **3 bugs reportados por André en su prueba real, corregidos y verificados:** (1) ⚠️ REGLA
     NUEVA — el driver de Neon devuelve columnas `date` como OBJETO Date; `String(v).slice(0,10)`
     da "Sun Jul 12" que comparado lexicográficamente contra un ISO siempre es mayor → TODO pago
     quedaba "no disponible" (409) y /pay caía en redirect-loop ("solo recargaba la página").
     Helper `venceDia()` en `cobros.ts` (getFullYear/getMonth/getDate — NO toISOString, que puede
     correrse un día según TZ) usado en payment-intent/pay/queries. SIEMPRE usar `venceDia` para
     comparar fechas `date` leídas de la BD. (2) El sello de firma salía SIN formato al aprobar
     en vivo hasta recargar: el JS inyectaba innerHTML sin `data-astro-cid` → los estilos scoped
     no aplicaban (regla conocida). El JS ahora inyecta el MISMO markup `.ql-audit-stamp` del
     server (con escape XSS) y sus estilos viven en `<style is:global>` prefijados `.q-card`.
     (3) Con anticipo, el link mostraba el TOTAL como "a pagar" hasta recargar (los cobros se
     materializan al aprobar, DESPUÉS del render): QuoteCard ahora SINTETIZA el preview
     anticipo+saldo desde `anticipo_pct` (mismo `splitAnticipo`, mismo `q.total` de BD) → desde
     el primer render se ve la píldora bajo el total ("Hoy pagas $X de anticipo (N%) · Saldo: $Y
     — vence el [fecha]"), el desglose "Plan de pago" y el botón con el monto del anticipo,
     también inmediatamente tras la aprobación EN VIVO sin recargar.
   • Verificado: migración corrida en Neon, `npm run build` limpio, lógica de gating replicada
     contra las filas reales de la BD (Date objects), Playwright contra dev server (sello
     inyectado recibe estilos; /pay renderiza "Anticipo a pagar $506.50 · del total de $1,013.00";
     net30 redirige a /q; captura visual del link completo). Auditoría de correctness
     (code-correctness-reviewer) encontró 4 bugs de dinero pre-release (pagos huérfanos,
     materialización no atómica, botón muerto con cuotas futuras, monto equivocado en el correo)
     — todos corregidos antes de entregar.
   ⚠️ Sigue pendiente (config manual, ya documentado): el 2º endpoint de webhook de Stripe
     ("eventos en cuentas conectadas") con `STRIPE_CONNECT_WEBHOOK_SECRET` — sin él el dinero
     cae al vendedor pero Cord no marca los cobros pagados.

✅ **Auditoría de Stripe Connect Custom + checkout in-house + Clerk `/sso-callback` faltante (jul 2026)** —
   André pidió que "todo lo relacionado con Stripe Connect esté bien" (formulario de cobros, el
   checkout del link público) y reportó que alguien SIN cuenta que le da a "Entrar" en vez de
   "Crear cuenta" veía un error en lugar de que lo mandara a registrarse. Auditoría completa +
   rediseño "Apple" del formulario de cobros y del checkout, y fix del bug de Clerk.
   • **Bug de dinero — SPEI se generaba con una CLABE distinta en cada recarga:**
     `payment-intent.ts` creaba un `PaymentIntent` + `customer` NUEVOS en cada visita a
     `/q/[token]/pay`. Columna nueva `cotizaciones.stripe_payment_intent_id`: el endpoint ahora
     reutiliza el PI existente (y actualiza el monto si la cotización se re-versionó) en vez de
     duplicar — corrige tanto la CLABE inestable como el riesgo de PaymentIntents huérfanos.
   • **Bug de dinero — tarjeta se forzaba a SPEI:** el endpoint mandaba
     `payment_method_data[type]=customer_balance` en la creación del PI, lo que forzaba TODO pago
     (incluso con tarjeta activa) al flujo de transferencia. Quitado: el método lo decide el
     Payment Element al confirmar (`payment_method_types` sigue reflejando lo que el vendedor
     activó en Ajustes).
   • **Bug crítico — el webhook de pago tronaba después de marcar `paid`:** `webhook.ts` llamaba a
     `after(dispatchQuoteEvent(...))`, una función que **no existe** en el archivo — el handler
     lanzaba `ReferenceError` justo después del `UPDATE`, así que el pago sí quedaba marcado en BD
     pero el webhook saliente `quote.paid` (integraciones de terceros, Slack) nunca se disparaba.
     Corregido a fire-and-forget sin `after`.
   • **Bug de datos — el método de pago (tarjeta vs SPEI) se perdía en producción:** el webhook
     leía `sessionOrIntent.charges.data[0].payment_method_details.type`, campo que las versiones
     nuevas de la API de Stripe ya NO incluyen embebido en el PaymentIntent (solo `latest_charge`
     como id). Se agregó un fetch del charge en la cuenta conectada para resolver el método real.
   • **Bug — subir el reverso de la INE pisaba el frente:** `document.ts` escribía SIEMPRE en
     `[verification][document][front]` sin importar el `side` recibido. Corregido a usar el side
     real (aplica al doc a nivel cuenta de persona física; el de personas ya estaba bien).
   • **Hardening de `create.ts`/`status.ts`:** una cuenta guardada solo se desconecta cuando
     Stripe CONFIRMA que ya no existe (antes cualquier error transitorio de red la borraba);
     `status.ts` ya no responde 400 cuando aún no hay cuenta creada (el wizard arrancaba con un
     error en consola en vez de simplemente mostrar el paso 0).
   • **`ConnectCustomOnboarding.tsx` reescrito** — reanudación real (retoma en el primer requisito
     `currently_due` que reporta Stripe en vez de forzar los 8 pasos desde cero cada vez que se
     recarga la página), actualiza el representante existente en vez de duplicarlo si ya se había
     creado antes, valida la CLABE con el dígito de control real (pesos 3-7-1, no solo longitud),
     valida la fecha de nacimiento (mayor de 18), exige que se marque el checkbox de dueños
     beneficiarios antes de continuar, y hace polling cada 6s mientras la cuenta está "en
     revisión" (se recarga sola al activarse `charges_enabled`, sin que el usuario tenga que
     refrescar a mano). Rediseño visual: barra de progreso hairline animada, "Paso X de 8" con
     título dinámico, transiciones de entrada por paso, spinners en botones, preview de documento
     con palomita verde, panel de dueños/TOS recesado, estado activo con banco + terminación de
     CLABE + botón "Cambiar".
   • **Checkout in-house (`/q/[token]/pay` + `PaymentIsland.tsx`) rediseñado estilo Apple:**
     lienzo `#f5f5f7`, tarjeta blanca flotante `border-radius:28px` con sombras compuestas
     multicapa (mismo lenguaje visual que el resto del sitio), marca del vendedor (logo real o
     avatar con su color), total en `.editorial`, estados server-side correctos (cotización ya
     pagada → confirmación con palomita en vez de intentar cobrar de nuevo; no pagable → redirect
     al link público en vez de un formulario roto). `PaymentIsland` usa la Appearance API de Stripe
     (inputs gris `#f5f5f7` sin borde, anillo navy al foco, tabs tipo segmented control, locale
     `es-419`) y `redirect: 'if_required'` (tarjeta confirma sin salir de la página; SPEI redirige
     a las instrucciones con la CLABE y regresa a `/q/[token]?pagado=1`, donde el link público
     muestra un aviso verde de "pago en camino" mientras el webhook confirma).
   • **Bug de Clerk — `/sso-callback` no existía:** los botones "Google" de `CustomSignIn.tsx`/
     `CustomSignUp.tsx` (`authenticateWithRedirect({ redirectUrl: '/sso-callback' })`) apuntaban a
     una ruta que nunca se creó → 404 tras volver de Google. Página nueva
     `src/pages/sso-callback.astro` + `SsoCallback.tsx` (`clerk.handleRedirectCallback({
     transferable: true, ... })`) — con `transferable: true`, si alguien SIN cuenta entra por
     "Iniciar sesión con Google" Clerk convierte el intento en un registro automáticamente (y
     viceversa) en vez de fallar.
   • **Fix del bug reportado — login con correo inexistente ya no da error genérico:**
     `CustomSignIn.tsx` detecta el código `form_identifier_not_found` de Clerk y redirige a
     `/sign-up?email=...&desde=login` con el correo precargado y un aviso ("No encontramos una
     cuenta con ese correo. Créala aquí"); en sentido inverso, `CustomSignUp.tsx` detecta
     `form_identifier_exists` y redirige a `/sign-in?email=...&desde=registro`. Se agregó un
     diccionario `ERROR_ES` en ambos componentes para traducir los códigos de error más comunes de
     Clerk (contraseña incorrecta, contraseña filtrada, demasiados intentos, etc.) — antes se
     mostraba el `message` crudo de Clerk (en inglés, poco accionable).
   ⚠️ Correr `npm run db:migrate` (columna `cotizaciones.stripe_payment_intent_id`) — **ya corrida
     contra la BD local en esta sesión.**
   ⚠️ **Pendiente de configuración manual (no es código, ya documentado antes):** el SEGUNDO
     endpoint de webhook de Stripe para "eventos en cuentas conectadas" con
     `STRIPE_CONNECT_WEBHOOK_SECRET` — sin esto el dinero cae al vendedor pero Cord no marca la
     cotización pagada.

✅ **Cobros v3 — Stripe Connect CUSTOM + Stripe Elements In-House (jul 2026)** —
   evolución definitiva del feature de cobros. Reemplaza por completo el approach OAuth Standard/Express y también el intento de Embedded Components (v2).
   Contexto: Aunque inicialmente se pensó que Custom exigía volumen alto, André solicitó la implementación Custom para lograr el nivel de integración "Quiet Luxury" y marca blanca al 100%. Todo el flujo ahora ocurre 100% in-house.
   • **Migración a Cuentas Custom:** se eliminó todo el flujo OAuth y Embedded (`ConnectOnboarding.tsx`).
     Ahora se utiliza la API nativa de Stripe (`createConnectAccount` con `type: 'custom'`). La recolección de datos (KYC, empresa, personas, banco) se hace mediante el nuevo componente `ConnectCustomOnboarding.tsx` totalmente nativo.
   • **LiveCapture (Verificación de Identidad In-House):** En lugar de subir un archivo mediante un input básico, o usar el onboarding externo, se construyó `LiveCapture.tsx`. Esto pide acceso a la cámara del navegador y toma fotos de la INE/Pasaporte y selfie en tiempo real. Se envía a Stripe vía la API `Files` (`stripeUpload` multipart/form-data) asociado al `person_id`.
   • **Checkout In-House (Stripe Elements):** Se eliminó la redirección al Hosted Checkout. Ahora el link público tiene un flujo interno en `/q/[token]/pay.astro`. Este carga un PaymentIntent (`/api/q/[token]/payment-intent.ts`) que rutea fondos a la cuenta conectada (`Stripe-Account` header) y muestra la UI in-house con `@stripe/react-stripe-js` (`PaymentIsland.tsx`).
   • **Tematización Dinámica:** El `<PaymentElement>` se instanció usando la Appearance API para heredar exactamente el color primario (`--theme-color`) del merchant, removiendo todo rastro estético de Stripe.
   • **Webhooks Mejorados (`/api/stripe/webhook`):** Ahora escucha `payment_intent.succeeded` generado por el Payment Element. Se agregó lógica matemática para leer `charges.data[0].payment_method_details.type` y distinguir pagos con `tarjeta` versus `customer_balance` (SPEI), sin depender de `payment_method_types` genéricos.
   • **Gestión In-House:** Endpoints completos en `/api/billing/connect/*` para manejar `external-account`, `persons`, `document`, y `status`. Se cuenta con un botón para **Desconectar** la cuenta desde `/app/ajustes/cobros` (ideal para limpiar cuentas viejas Express durante el desarrollo).
   • **Dashboard `/app/cobros` (NUEVO, sidebar "Mi dinero"):** página separada de Ajustes que muestra el
     DINERO QUE ENTRA (Ajustes › Cobros sigue siendo la CONFIGURACIÓN). `getCobros()` en `queries.ts`
     agrega total cobrado, desglose por método (tarjeta/spei/otro), serie mensual y cobros recientes —
     filtrando por `status='paid' OR paid_at IS NOT NULL` (NUNCA `status='invoiced'` solo, que puede
     estar sin pagar). Incluye sección de **Depósitos** (balance disponible/pendiente + payouts recientes
     vía `getBalance()`/`listPayouts()` de `billing.ts`). Gated por permiso `cobranza`
     (`memberCan(ME,'cobranza')`).
   • **Nueva columna `cotizaciones.payment_method`** + `paid_at` ahora SÍ se escribe (antes existía la
     columna pero nunca se llenaba). Se setea en `markQuotePaid` (webhook) y en el PATCH manual de pago.
   • **Paso nuevo en el onboarding de Cord:** "Activa los cobros en línea" en `getSetupProgress()`
     (`id: 'online_cobros'`, `done: !!stripe_charges_enabled`) — aparece en el `OnboardingWidget` de todo
     usuario nuevo o existente que no haya conectado cobros.
   • **Rediseño borderless "nivel Apple" completo:** se eliminaron TODAS las cards del flujo Connect
     (`.cobros-hero` navy con glow, `.connect-frame` con borde/sombra, `.cobros-celebration`,
     `.pay-preview`) → todo hairline/plano, consistente con el resto de Ajustes. El wizard
     (`ConnectCustomOnboarding.tsx`) pasó de tiles `.co-card-radio` con borde a filas hairline tipo iOS;
     `.co-requirements` de panel encajonado a lista hairline.
   • **Formulario nivel Stripe:** catálogo MCC ampliado (`stripe-catalogs.ts`, ~67 giros) con buscador
     (`<input list>` + `<datalist>`); validación de RFC con regex oficial MX ANTES de enviar a Stripe
     (bloquea el submit con mensaje claro en vez de esperar el error de la API); autorrelleno completo
     desde `getOrg()` (razón social, RFC, CP, dirección, teléfono, CLABE).
   • **El paso final del wizard distingue estado real:** si `charges_enabled` → "Todo listo, tu cuenta
     está activa" + botón para editar CLABE; si no → requisitos pendientes o "en revisión" — antes SIEMPRE
     mostraba "en revisión" aunque la cuenta ya estuviera 100% activa (bug de UX confuso).
   • **6 bugs reales encontrados y corregidos en auditoría (antes de dar por bueno el flujo):**
     (1) `pay.astro` importaba un layout inexistente (`QuoteLayout.astro`) — rompía el build entero;
     corregido a `Layout.astro` (el mismo que usa `/q/[token]`). (2) `pay.astro` seleccionaba
     `o.color_brand` (columna que no existe) en vez de `o.color_marca` — habría tronado en runtime con
     un 500 al abrir la página de pago. (3) La interpolación `style="...--theme-color: {color}"` no
     funciona en Astro (necesita `style={\`...${color}\`}`) — el color de marca nunca llegaba al CSS.
     (4) `payment-intent.ts` leía la variable de entorno `PUBLIC_STRIPE_KEY` (no existe) en vez de
     `PUBLIC_STRIPE_PUBLISHABLE_KEY` — Stripe.js nunca cargaba, la página de pago quedaba en blanco.
     (5) Los toggles de tarjeta/SPEI se mostraban ENCENDIDOS aunque la cuenta no tuviera Stripe conectado
     (`checked={ORG.aceptaTarjeta}` sin considerar `puedeCobrar`) — corregido a
     `checked={puedeCobrar && ORG.aceptaTarjeta}`. (6) `getCobros()` inicialmente contaba
     `status IN ('paid','invoiced')` como "cobrado" — INCORRECTO en ambos sentidos: una cotización puede
     facturarse (`invoiced`) SIN estar pagada, y una ya pagada puede facturarse después
     (`paid→invoiced`, perdiendo el filtro). Corregido a `status='paid' OR paid_at IS NOT NULL`.
   ⚠️ **Reglas reforzadas esta sesión:** (a) CSS que estilice DOM inyectado por JS (mensajes, Cmd+K,
     toasts) SIEMPRE va en `<style is:global>` — Astro scopea con `[data-astro-cid]` y el DOM dinámico no
     lo lleva. (b) El bloque de pago del link público se gatea por CONFIG de pago del negocio, no por el
     status de la cotización (vive oculto en el paso aprobado). (c) Los `.s-toggle` requieren la estructura
     `<input>` + `.s-toggle-track` (con `.s-toggle-thumb`) + `.s-toggle-text` — sin ella el switch no se ve.
     (d) "Cobrado" ≠ `status IN (...)` con `invoiced` — siempre filtrar por `paid_at IS NOT NULL` o
     `status='paid'` explícito para montos de dinero real. (e) El `sql` de neon-serverless NO compone
     fragmentos (`sql\`...${otroFragmentoSql}...\``) — inlinear la condición completa en cada query.

✅ **Cobros directos a la cuenta del dueño — Stripe Connect + transferencia + SPEI dinámico (jul 2026)** —
   hasta ahora, cuando un cliente pagaba una cotización desde `/q/[token]`, el cargo se creaba con la
   llave de PLATAFORMA de Cord (`STRIPE_SECRET_KEY`) → el dinero caía a Flouvia, no al negocio. Esto
   contradecía lo que YA prometían 2 artículos de soporte (`comisiones-tarifas.md`/`migracion-stripe.md`:
   "tu propia cuenta de Stripe, Cord nunca toca los fondos"). Se implementó Stripe Connect de verdad:
   ⚠️ **SUPERADO (jul 2026):** el flujo OAuth Standard/Express detallado aquí abajo se MIGRÓ definitivamente a **Stripe Connect Custom + Stripe Elements In-House** (ver entrada "Cobros v3" arriba).
   Lo de OAuth (`connect/{start,callback,status}.ts`, `getConnectOAuthUrl`, el nonce anti-CSRF, `STRIPE_CONNECT_CLIENT_ID`)
   YA NO EXISTE. Lo que SÍ sigue vigente de esta entrada: el modelo de charge directa con header
   `Stripe-Account` (cero comisión), las columnas de `orgs`, el SPEI dinámico, y los fixes de dinero.
   • **Connect Standard + Express** (`src/pages/api/billing/connect/{start,callback,status,disconnect}.ts`)
     — el dueño conecta SU Stripe existente (OAuth, `state`=nonce aleatorio en cookie httpOnly anti-CSRF,
     verificado en el callback — NUNCA el orgId, que sería adivinable) o crea una cuenta ligera vía
     Express (`account_link` hosted onboarding). Columnas nuevas en `orgs`: `stripe_account_id`,
     `stripe_account_type`, `stripe_charges_enabled`, más `acepta_tarjeta`/`acepta_transferencia`/
     `cobro_spei_auto`/`banco_nombre`/`banco_clabe`/`banco_beneficiario`. Página nueva
     `/app/ajustes/cobros` (toggles gated a `charges_enabled`).
   • **Charge directa, CERO comisión de Cord:** `checkout.ts` ahora agrega el header `Stripe-Account:
     acct_...` a la Checkout Session (sin `application_fee`/`transfer_data` — el comerciante de
     registro es el dueño). Rechaza el cobro con 403 si la org no tiene Connect activo o no acepta
     pagos en línea; sigue bloqueado en sandbox (409).
   • **SPEI dinámico (CLABE única por cotización) vía `customer_balance`/`mx_bank_transfer` de Stripe**
     — la misma cuenta conectada, sin que Cord retenga fondos (evita terreno regulado tipo Ley
     Fintech/IFPE). El webhook escucha también `checkout.session.async_payment_succeeded` (evento de
     liquidación diferida).
   • **3 bugs de dinero reales encontrados y corregidos en la misma pasada (auditoría antes de dar por
     bueno el flujo):** (1) `markQuotePaid` marcaba `paid` con solo `checkout.session.completed`, pero
     para SPEI ese evento llega con `payment_status:'unpaid'` en cuanto el cliente ve la CLABE — **antes
     de transferir**; ahora exige `payment_status === 'paid'` (el evento real de liquidación SPEI es
     `async_payment_succeeded`). (2) El checkout de SPEI no creaba ningún `customer`, que
     `customer_balance` exige para asignar la CLABE — Stripe rechazaba la sesión; ahora se crea un
     customer en la CUENTA CONECTADA (mismo header `Stripe-Account`) antes de armar la sesión. (3) El
     link público mostraba la CLABE ESTÁTICA de transferencia manual con la leyenda "se marcará pagada
     automáticamente" — falso, esa CLABE fija no se concilia sola; se separó el copy (transferencia
     manual = "envía tu comprobante", SPEI-auto = botón de pago en línea que genera la CLABE dinámica
     de Stripe) y el botón de pago ahora también aparece cuando solo hay SPEI (antes exigía tarjeta).
   • **Hardening adicional:** `markQuotePaid` valida `event.account` contra el `stripe_account_id` de
     la org dueña de la cotización — defensa en profundidad para que un merchant conectado no pueda
     marcar pagada una cotización ajena.
   • **Bug de nombre de variable de entorno encontrado y corregido:** `.env.example` declaraba
     `CONNECT_CLIENT_ID`/`CONNECT_WEBHOOK_SECRET` pero el código (`billing.ts`, `webhook.ts`,
     `connect/disconnect.ts`) lee `STRIPE_CONNECT_CLIENT_ID`/`STRIPE_CONNECT_WEBHOOK_SECRET` — con los
     nombres viejos configurados en Vercel, el código NUNCA las habría leído (OAuth Standard tronaría
     con "STRIPE_CONNECT_CLIENT_ID no configurada" y la firma de eventos Connect jamás verificaría).
     `.env.example` ya corregido a los nombres reales que usa el código.
   • **El webhook verifica DOS secretos** (`webhook.ts`): `WH_SECRET` (plataforma) y `CONNECT_WH_SECRET`
     (endpoint de eventos de cuentas conectadas) — la firma es válida si CUALQUIERA de los dos matchea,
     porque Stripe firma los eventos de Connect con el secreto de SU PROPIO endpoint (uno nuevo, no el
     de plataforma).
   ⚠️ **Pendiente de configuración manual en el dashboard de Stripe (no es código):** (1) crear un
     SEGUNDO endpoint de webhook (misma URL, "eventos en cuentas conectadas") y setear su secreto en
     `STRIPE_CONNECT_WEBHOOK_SECRET` — sin esto el dinero cae al dueño pero Cord nunca marca la
     cotización pagada; (2) confirmar que SPEI/bank-transfer esté habilitado para cuentas conectadas
     MX; (3) `STRIPE_CONNECT_CLIENT_ID` (Settings → Connect → OAuth settings). ⚠️ Correr
     `npm run db:migrate` (7 columnas nuevas en `orgs`).

✅ **Cobranza** — `/app/cobranza`: cartera, vencido, aging, exposición por cliente,
   marcar cobrada + recordatorio por WhatsApp. getCobranza() en queries.ts.

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

✅ **Pago en línea (Stripe)** — botón en `/q/[token]` → `/api/q/[token]/checkout` (Stripe
   Checkout vía REST) + `/api/stripe/webhook` marca `paid`. Gated por `STRIPE_SECRET_KEY`.

✅ **Internacionalización B2B (Abstracción Fiscal Global) (jun 2026)** — Desacoplamiento del SAT. La tabla `orgs` ahora soporta `country_code` y los documentos se centralizan en la tabla abstracta `documentos_fiscales`. Implementación del patrón Adapter (`src/lib/fiscal`) con `FiscalFactory` que enruta a proveedores locales como `MexicoSatProvider` (CFDI) o `USInvoiceProvider` (Commercial Invoices).

✅ **Multi-divisa con Cobertura Cambiaria (jun 2026)** — La tabla `cotizaciones` ahora soporta divisa de cotización (`base_currency`) independiente a la de facturación (`fiscal_currency`). Implementación de `FXService.ts` para obtener tasas *spot*, aplicar un *buffer%* de cobertura para proteger los márgenes, y congelar la tasa (FX lock) por 30 días para cotizaciones B2B.

✅ **AI Agent Workflows — Cuentas por Cobrar y Flujo de Caja (jun 2026)** —
   • **Agentes de Cobranza Autónomos (AI AR)**: Nueva tabla `cobranza_conversaciones` y `planes_pago_negociados` para gestionar interacciones. Cron job (`/api/cron/cobranza`) y webhook (`/api/webhooks/inbound-email`) que alimentan al LLM (`ar-agent.ts`) permitiéndole negociar hasta 3 cuotas mensuales con deudores. Dashboard de supervisión en `/app/tesoreria/cobranza`.
   • **Predicción de Flujo de Caja**: Algoritmo predictivo en `cashflow.ts` que cruza el delay promedio de pago histórico con el valor ponderado del pipeline actual para estimar los ingresos a 90 días. Dashboard avanzado en `/app/tesoreria/flujo` con "AI CFO Insight" y escenarios de probabilidad.

✅ **CFDI 4.0 vía Facturapi (jun 2026)** — `MexicoSatProvider` crea la factura real en
   Facturapi (auth Basic con la API key), devuelve el UUID del SAT y los PDF/XML se sirven
   por `/api/cotizaciones/[id]/cfdi?type=pdf|xml`. **Key de TEST ya configurada**
   (`FACTURAPI_API_KEY`). ⚠️ **Gap del modelo:** Cord captura el RFC del cliente pero NO su
   régimen fiscal ni CP (domicilio) — `emit.ts` usa defaults (público en general / CP del
   emisor / uso G03). Para CFDI válido a un RFC específico hay que capturar régimen + CP +
   uso CFDI POR CLIENTE (agregar al alta de clientes). Para subir a producción: cambiar a
   `sk_live_` en `FACTURAPI_API_KEY` (Vercel).

✅ **Datos fiscales del receptor POR CLIENTE (jun 2026)** — CFDI nominativo cableado de
   punta a punta. Columnas nuevas en `clientes`: `regimen_fiscal` (c_RegimenFiscal),
   `uso_cfdi` (c_UsoCFDI) y `cp_fiscal` (CP del domicilio fiscal del receptor). El alta/edición
   de clientes (`/app/ajustes` → modal de `/app/clientes`) tiene una sección colapsable "Datos
   fiscales para CFDI (opcional)" con selects de los catálogos SAT (`src/lib/sat.ts`). `getClientes`
   devuelve `regimenFiscal/usoCfdi/cpFiscal`; `/api/clientes` los persiste (POST/PATCH). **`emit.ts`
   ya los usa**: pasa `tax_system`/`zip`/`cfdi_use` del cliente al `MexicoSatProvider` (que ya los
   aceptaba), con fallback al CP/uso del emisor; si el RFC es genérico degrada a público en general.
   ⚠️ Correr `npm run db:migrate` (3 columnas nuevas en `clientes`).

✅ **COMPLETADO — Connect migrado a Embedded Components (jul 2026)** — lo que aquí estaba planeado YA se
   implementó; ver la entrada "Cobros v2 — Stripe Connect EMBEDDED" al inicio del archivo para el detalle
   final (endpoint `account-session`, island `ConnectOnboarding.tsx`, theming, webhook `account.updated`,
   OAuth `start/callback/status` eliminados).
   ⚠️ **SUPERADO otra vez (jul 2026) — ver "Cobros v3 — Stripe Connect CUSTOM" al inicio del archivo:** esta
   nota originalmente decía que Custom quedaba descartado porque exige **$250K USD de volumen en 12 meses
   + plataforma activada**, y Cord (fase inicial) no calificaba. André pidió construirlo de todos modos
   para llegar al white-label 100% ("Quiet Luxury" sin ninguna marca de Stripe visible) — se implementó
   Custom completo (KYC in-house, `LiveCapture` con cámara, Stripe Elements para el checkout). El código
   funciona en TEST mode sin problema; el requisito de volumen solo bloquea activar cuentas Custom en
   **LIVE** — eso sigue pendiente de que Stripe apruebe la plataforma. ⚠️ El `git stash connect-custom-wip`
   mencionado abajo NO contiene ningún trabajo de Custom real (se verificó: solo tenía un cambio ajeno de
   27 líneas en `cotizaciones/index.astro`) — el Custom real que quedó en producción se construyó desde
   cero directo en el código, no vino de ese stash. Seguro hacer `git stash drop` de ese stash si estorba.
   Sigue pendiente la confirmación legal Ley Fintech/IFPE y la **activación de la plataforma en live por
   parte de Stripe** (estaba en "submitted").
