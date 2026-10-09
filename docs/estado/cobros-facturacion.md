# Cobros y facturación — Cord

> Lo que el negocio le cobra a sus clientes: Stripe Connect Custom, cobros por
> anticipo/saldo/cuotas/crédito, igualas recurrentes, la factura como objeto de
> primera clase, facturación internacional y Verifactu, multi-divisa y FX, y el
> contrato de impuestos por línea / cartera / recordatorios / KYC / depósitos.
> **Este archivo toca dinero real: modificar con extremo cuidado.**
>
> La suscripción de Cord (planes, Stripe Billing, medidores, cortesías) está en
> [`negocio-billing.md`](negocio-billing.md). Para decisiones fechadas consulta
> [`../historial/billing-cobros.md`](../historial/billing-cobros.md). Reglas
> permanentes: 21–29 y 32–34 de [`../estandares-ingenieria.md`](../estandares-ingenieria.md).

## Riel de cobro: Stripe Connect y Mercado Pago

Cord Payments corre sobre Stripe Connect, que no abre cuentas conectadas en
Colombia, Argentina, Chile ni Perú. Desde sep 2026 hay un SEGUNDO riel,
Mercado Pago, para esos cuatro países más México y Brasil, donde convive con
Connect y el negocio elige.

- `supportsOnlinePayments()` sigue significando **Connect** —es lo que consultan
  el alta y el KYC—; `supportsMercadoPago()` y `hasOnlinePaymentRail()` viven a
  su lado en `src/lib/countries.ts`.
- Credenciales del vendedor en `orgs.mp_*`, CIFRADAS, con renovación por refresh
  token. Si la renovación falla, `mp_charges_enabled` pasa a false: el vendedor
  lo ve en Ajustes en vez de descubrirlo por un cobro que no abre.
- El cobro público (`/api/q/[token]/mp-preference`) cumple las cuatro garantías
  de la regla 33 y `scripts/payments-contract-check.mjs` ahora reconoce el riel
  —sin eso, una ruta de dinero nueva quedaba fuera del universo que el linter
  dice derivar del árbol.
- El webhook lee el pago EN el proveedor: no se fía del cuerpo que recibe, y su
  idempotencia es el índice único `uq_cobros_mp_payment`, no un `if`.
- La liquidación vive en `src/lib/cobros-settle.ts`. El riel de Stripe conserva
  su propia copia dentro de su webhook: unificarla exige cubrir antes ese camino
  con pruebas, y tocar dinero vivo sin ellas es peor que dos copias declaradas.

- **Prioridad de riel** (`src/lib/payment-rail.ts`, fuente única): donde conviven
  ambos (MX, BR) Cord Payments es el principal y Mercado Pago la alternativa;
  donde solo hay Mercado Pago, Ajustes › Cobros lo dice ("Cord Payments no está
  disponible por el momento") y muestra Mercado Pago primero. `availableRails()`
  decide qué rieles ve el pagador; `canCollectOnline()` alimenta el link público,
  el embed y la tarjeta; `onlinePaymentsSetup()` alimenta el onboarding (el paso
  "Activar cobros en línea" habla de Mercado Pago solo en los países que no
  tienen Connect, para no pedirles algo imposible).
- **Doble cobro entre rieles**: si una cotización se paga por Cord Payments y
  por Mercado Pago a la vez, el webhook lo distingue de un reenvío (mismo
  `mp_payment_id`) y avisa a Ops y al historial en vez de tragárselo.
- El `init_point` que devuelve Mercado Pago se valida (`isMpCheckoutUrl`, solo
  https y dominios de Mercado Pago) antes de mandar al cliente ahí.
- **Los dos documentos.** La cotización cobra "rebanadas" (anticipo, saldo,
  cuotas) y la factura hospedada (`/i/[token]`) cobra el saldo del documento,
  con abono parcial. Son dos ledgers y el webhook los distingue por el prefijo
  `fac:` de `external_reference` (`MP_INVOICE_REF`): sin él, el dinero de una
  factura se aplicaría al cobro de una cotización con el mismo id. La
  idempotencia de la factura es `documento_pagos.mp_payment_id`, índice único,
  no un `if`; el webhook encuentra a la organización dueña por
  `documentos_fiscales.mp_preference_at`.
- **Reembolsos leídos, no inventados.** Un reembolso hecho en Mercado Pago llega
  como una notificación más del mismo pago; se registra ANTES de mirar el estado,
  porque un pago devuelto por completo deja de estar `approved` y saldría sin que
  nadie lo anotara. Cotización → `cobro_reembolsos.mp_refund_id`; factura →
  `documento_reembolsos` con su par `mp_refund_id`/`mp_payment_id`, que
  `invoiceBalanceQuery` liga al pago por el id del riel que cobró. Solo un
  reembolso `approved` baja el saldo: uno en proceso todavía puede caerse.

La forma de la autorización, `/oauth/token`, `/checkout/preferences` y la firma
`x-signature` se verificó el 2026-09-21 contra el SDK oficial (`mercadopago`
3.6.1). La firma omite el tramo `request-id` cuando no llega y no tiene ventana de
tiempo, igual que el validador oficial: los reintentos llegan con la firma original.

Activado el 2026-09-21: app "Cord" (`7210198958457914`, MLM, Checkout Pro) en la
cuenta de empresa de Flouvia, creada con el MCP oficial de Mercado Pago; webhook
de `payment` a `/api/mercadopago/webhook`; las tres variables en Vercel. El
webhook es CSRF-exento (su credencial es la firma) y se probó en producción con
firma real: sin firma 401, con firma 200. La búsqueda por preferencia usa
`cotizacion_cobros.mp_preference_at` (la tabla no tiene `updated_at`).
Primer pago real de punta a punta confirmado el 2026-09-21 ($10 MXN con tarjeta,
marcado pagado por el webhook). La app de México (MLM) conecta vendedores de otro
país: se confirmó el mismo día con un vendedor de prueba de Colombia (MCO), así que
no hace falta una app por país.

## Portal del cliente, cobro agrupado, cobro automático y domiciliación — oct 2026

Código en `src/lib/cobros/`; esquema en la sección "PORTAL DEL CLIENTE…" de
`db/schema.sql`, espejo de `db/deploy/2026-10-08-cobros-portal.sql`.

- **Portal** (`/portal/[token]`, `src/lib/cobros/portal.ts`): un link POR CLIENTE
  con sus facturas emitidas, el saldo por divisa (nunca sumado entre divisas), el
  pago de varias a la vez y el cobro automático. El token (32 bytes) es la
  credencial: `cord_resolve_portal` lo traduce y la consulta vuelve a `withOrgTx`.
  La ruta va sin referrer, sin caché, sin indexar y SIN analítica; vive en
  `cordhq.app` y nunca en el dominio propio del negocio (ese solo sirve `/q` e
  `/i`). El negocio lo crea, rota, apaga o envía desde la ficha del cliente
  (`/api/clientes/portal`, con auditoría). Solo aparecen las facturas con
  `cliente_id`.
- **Cobro agrupado** (`agrupados.ts`): un PaymentIntent paga varias facturas. El
  reparto se decide al crear el cobro con el saldo REAL de cada factura (el
  navegador solo elige cuáles) y queda en `pago_agrupado_documentos`; el webhook
  lo aplica con `applyPayment` por factura, idempotente por el mismo índice
  `(documento_id, stripe_payment_intent_id)`. El intento NO lleva `documento_id`:
  si lo llevara, `settleInvoiceFromIntent` le aplicaría el cobro completo a una
  sola factura. Una comisión por cobro (la llave de `comisiones` es el PI).
- **Reembolsos repartidos** (`allocateInvoiceRefund` en `reconciliation.ts`):
  devolver parte de un cobro que pagó varias facturas se asigna de la última
  aplicada a la primera, completo o nada; sin reparto, un reembolso solo cuenta
  si su cobro pagó una sola factura (todo lo anterior a oct 2026).
- **Domiciliación** (`metodos.ts`): SEPA Direct Debit en EUR para ES/DE/FR y ACH
  en USD para EE. UU. La enciende el negocio en Ajustes › Cobros
  (`/api/billing/connect/domiciliacion`), que pide la capacidad
  (`sepa_debit_payments` / `us_bank_account_ach_payments`) a la cuenta conectada;
  `orgs.stripe_capacidades` guarda su estado desde `account.updated`, y solo una
  capacidad `active` se ofrece. Donde Cord cobra comisión (hoy MXN) solo se
  ofrece tarjeta: la comisión es de tarjeta y no hay tarifa aprobada para débito.
  Un débito queda días en `processing`: `documentos_fiscales.pago_en_proceso_pi`
  bloquea cobrar otra vez y anular, y `/i` y el portal lo dicen. Stripe manda al
  titular el aviso de cada cargo SEPA y la confirmación del mandato ACH (por eso
  el Customer lleva el correo del cliente). ACH no admite reembolsos parciales.
- **Cobro automático** (`automatico.ts`, cron `/api/cron/cobro-automatico`
  diario 14:15 UTC): lo ACTIVA el cliente en su portal con un SetupIntent (o al
  pagar, marcando "guardar"). El consentimiento lo registra el servidor (fecha,
  IP, navegador) como PENDIENTE con el id del intento, y solo se activa cuando el
  proveedor confirma ESE método de ESE Customer. Se cobran, en UN cargo por
  cliente y divisa, las facturas vencidas desde el día de la autorización y
  emitidas al menos un día antes; el método tiene que cubrir la divisa. El
  correo de la factura le avisa al cliente fecha y método del cargo. El negocio
  solo puede apagarlo (por cliente en su ficha, o para todos en Ajustes).
- **Reintentos** (`reintentos.ts`, pura y probada): un rechazo duro (robada,
  fraude, mandato revocado) apaga el método y no se reintenta; datos vencidos o
  inválidos piden otro método; autenticación requerida pide pagar desde el
  portal; fondos insuficientes esperan al siguiente 1 o 16 del mes; el resto en
  2, 4 y 7 días; máximo 4 intentos con tarjeta. Un débito solo se reintenta por
  fondos, 2 veces y dentro de 30 (SEPA) o 40 (ACH) días, los mismos topes que
  aplica el proveedor. Un rechazo cuenta una vez aunque lleguen el error síncrono
  y el webhook. Al cliente le llega un correo con su portal; al negocio, una
  tarea cuando el cobro se detiene.
- **Respuesta incierta**: sin respuesta del proveedor el cobro queda `creado` sin
  intento (el índice `uq_pagos_agrupados_automatico_vivo` impide abrir otro) y
  la siguiente corrida reintenta con la MISMA clave de idempotencia; después de
  20 horas se cancela (si el cargo hubiera salido, su webhook ya lo habría
  ligado). El cron también concilia cobros sin webhook o con un débito de más de
  3 días en proceso.
- **Eventos del webhook** que este carril necesita en el scope de cuentas
  conectadas: `payment_intent.processing`, `payment_intent.canceled`,
  `setup_intent.succeeded` y `mandate.updated` (ver
  `pendientes-integraciones.md`).

## Términos de pago, claves SAT y CFDI a extranjeros — oct 2026

- **Términos de pago:** `contado` o `net<N>` = N días naturales. Se ofrecen `net7`,
  `net15`, `net30`, `net45`, `net60` y `net90`. Fuente única: `src/lib/payment-terms.ts`
  (`TERM_CODES`, `termDays`, `normalizeTerm`, `parseTermText` para CSV). En Postgres la
  misma regla es `cord_term_days(text)` (db/schema.sql): la usan la vista
  `cuentas_por_cobrar`, la cobranza IA, el correo entrante y los informes. Un plazo nuevo
  se agrega SOLO a `TERM_CODES` (y a la lista espejo `CORD_TERMINOS` de Elements, que un
  test compara). La UI usa `<TermPicker>` + `wireTermPicker()`: nunca se lee
  `.chip.active` a mano. Un código guardado que ya no se ofrece sigue venciendo en su
  fecha (`termDays('net120') = 120`) pero no se acepta como nuevo.
- **Claves SAT por producto y por línea:** `productos.clave_sat` (c_ClaveProdServ, 8
  dígitos) y `productos.clave_unidad_sat` (c_ClaveUnidad); desde oct 2026 también por
  LÍNEA: `cotizacion_items.clave_sat/clave_unidad_sat` y `productKey/unitKey` del
  `DraftLineInput` de la factura (HTTP: `clave_sat`/`clave_unidad_sat` por concepto en el
  editor y en `/api/v1`). Precedencia campo por campo (`effectiveLineSatKeys`,
  `src/lib/fiscal/sat-claves.ts`): la clave explícita de la línea gana, luego la del
  producto (sin clave de unidad se deduce de `productos.unidad`, `satUnitForUnit`) y, sin
  nada, el CFDI usa 01010101 / H87. Formato inválido se rechaza al GUARDAR con el concepto
  nombrado (`lineSatKeyError`), solo en México. Cotización → CFDI: `emit.ts` lee la de la
  línea y la del producto con un `left join`. Factura directa: `invoices.ts` las resuelve
  al guardar el borrador. En ambos rieles quedan congeladas en `line_items_snapshot`;
  duplicar una factura las copia como claves propias de la línea. Los tres editores (MX)
  pintan una sub-fila por concepto con la clave efectiva, el aviso cuando caería en
  01010101 y un selector que reutiliza la búsqueda del catálogo
  (`src/lib/sat-line-picker.ts`); el de facturas cuenta las genéricas antes de emitir. El
  CSV de productos importa/exporta `clave_sat` y `clave_unidad_sat` (solo MX).
  `mexico-items.ts` rechaza una clave con forma inválida antes del PAC. Búsqueda del
  catálogo: `GET /api/fiscal/catalogo-sat` (permiso `productos` o `cotizar`; proxy de
  `/v2/catalogs/products|units` de Facturapi con la llave del negocio o la de plataforma;
  sin llave responde `disponible: false` y se escribe a mano).
- **CFDI a receptor extranjero:** cliente con `country_code` ≠ MX → `customer` sin
  `tax_system`, `address.country` en ISO alfa-3 (`toAlpha3`, `countries.ts`), `tax_id` =
  su identificador fiscal extranjero (NumRegIdTrib, opcional) y uso S01 (también en
  notas de crédito). Facturapi pone XEXX010101000 cuando el país no es "MEX" (documentado
  en su guía de clientes). `provider_data.receptor_extranjero` guarda el país. Exportación
  queda en "01"; el complemento de Comercio Exterior (A1) no se emite.
- **Receptor con RFC genérico (XAXX010101000):** régimen 616 forzado y, como
  DomicilioFiscalReceptor, el código postal del EMISOR (LugarExpedicion), como pide el
  Anexo 20; sin código postal fiscal del negocio el timbrado se niega antes del PAC. El
  nombre es el del cliente: "PUBLICO EN GENERAL" con el RFC genérico obliga al nodo
  InformacionGlobal, así que `facturapiCustomer` lo rechaza fuera de la factura global.
- **Despliegue:** `scripts/migrate-catalogo-fiscal.mjs` corre en el `buildCommand` de
  Vercel antes del build (columnas de `db/catalogo-fiscal.sql` + función y vista extraídas
  de `db/schema.sql`). Si falla, el despliegue se detiene.

## Factura global, sustitución y motivos del SAT — oct 2026

Fuentes: Anexo 20 (CFDI 4.0, nodo InformacionGlobal y receptor genérico), "Guía de
llenado del CFDI global" 4.0, RMF 2.7.1.21, "Preguntas frecuentes y escenarios de
cancelación 2026" y "Esquema de cancelación de CFDI" del SAT; referencia de Facturapi
para `global`, `related_documents` y `DELETE /invoices/{id}?motive&substitution`.
Catálogos puros en `src/lib/fiscal/cfdi-catalogos.ts`.

- **Factura global** (`/app/facturas/global`, `GET|POST /api/facturas/global`,
  `src/lib/fiscal/factura-global.ts`): periodicidad (c_Periodicidad 01–05; 05 solo con
  régimen 621), meses (01–12, o 13–18 con 05) y año (el de emisión o el anterior);
  diaria/semanal/quincenal eligen además el tramo de días dentro del mes. Lista las
  cotizaciones COBRADAS (`paid_at` en el calendario del negocio) sin factura vigente y sin
  otra global viva, y dice por qué excluye las demás (otra divisa, retenciones, cliente
  extranjero, tasa fuera de 0/8/16 %). Un concepto por venta y por tasa: 01010101, ACT,
  `sku` (NoIdentificacion) = folio, ValorUnitario = base. Con descuento de documento
  (`cotizaciones.descuento_def`) el motor lo reparte igual que en la factura
  individual y cada concepto lleva su parte en `discount` (Concepto@Descuento); la base
  neta y el descuento suman lo que se cobró, y una venta que el descuento deja en cero
  se excluye (`sin_importe`). Receptor PUBLICO EN GENERAL /
  XAXX010101000 / 616 / S01 / código postal del emisor, PUE y la forma de pago de la venta
  de mayor importe (editable). El documento vive en `documentos_fiscales` con
  `document_type = 'cfdi_40'`, sin cliente ni cotización y con `informacion_global`
  (jsonb); por eso `chk_documentos_fiscales_origen` admite ese tercer caso. Nace
  `paid` con saldo 0, sin `public_token`, y queda fuera de `invoiceBalanceQuery` y de
  `applyPayment`: las ventas ya están cobradas en su cotización.
- **Doble facturación:** `factura_global_ventas` liga cada venta a su global con
  `uq_factura_global_ventas_viva` (único por cotización mientras `liberada_at` es nulo).
  La global y `emit.ts` toman el mismo advisory lock por cotización; `emit.ts` se niega
  si la venta está en una global viva (409 con el folio y la instrucción del motivo 04),
  y la global excluye ventas con factura. Anular la global (motivo 04 si un cliente pidió
  la suya) marca `liberada_at` en la misma transacción que la anula, y el detalle ofrece
  emitirla de nuevo para el mismo periodo.
- **Sustitución** (`src/lib/fiscal/sustitucion.ts`, acción `substitute` de
  `PATCH /api/facturas/[id]`, permiso de cobranza): crea un borrador con los datos del
  original y `sustituye_a` (`uq_documentos_sustituye_a`: un sustituto vivo por
  original). El borrador copia los conceptos a su precio bruto y hereda el descuento
  de documento tal cual (`descuentoHeredado`: con su cupón, sin revalidarlo). Al
  emitirlo, `finalizeInvoice` corre `substitutionPreflight` (el original sigue siendo
  sustituible; cierra sus cobros en vuelo, también los agrupados), timbra con
  `related_documents` relación 04 y, en la MISMA transacción que lo marca emitido y con
  los dos locks de saldo, mueve `documento_pagos` y el reparto de reembolsos
  (`documento_reembolso_asignaciones`) del original al sustituto, pasa la redención
  del cupón si es el mismo (no se redime dos veces) y fija `sustituida_por`. Un
  reintento del webhook de un cobro ya movido sobre el original es un duplicado (sigue
  la cadena `sustituida_por`), no un pago tardío. Un
  original sustituido concilia con saldo 0 (`paid`; `refund_due` = pagado − reembolsado)
  y rechaza pagos manuales; uno tardío del proveedor queda registrado con aviso. Después
  se pide la cancelación del original con motivo 01 y el UUID del sustituto: `pending`,
  `verifying` y `rejected` se guardan como cualquier cancelación y el detalle ofrece
  reintentarla. Bloquean: notas de crédito vigentes y complementos de pago emitidos o en
  proceso (el SAT marca "No cancelable" un CFDI con relacionados vigentes), una
  cancelación en curso y la factura global (se corrige cancelándola). Anular un sustituto
  sin pagos devuelve el saldo al original.
- **Cobro agrupado y cobro automático:** un CFDI sustituido, uno con un sustituto en
  curso y la factura global no entran en `crearPagoAgrupado` ni en el cron de cobro
  automático; el portal no lista el sustituido (lo reemplaza su sustituto).
- **Motivo de cancelación:** el detalle pide la clave (02, 03; 04 solo en la global; 01
  deshabilitado con "usa Sustituir CFDI") y la ruta responde 400 sin ella en un CFDI
  vigente. `void_reason` guarda "0N · descripción del SAT". API v1, MCP y workflows con
  texto libre siguen cayendo al 02.
- **Uso y forma de pago fijados en el documento:** `documentos_fiscales.cfdi_uso` y
  `cfdi_forma_pago` (null = automáticos). El editor de facturas los ofrece en México; el
  sustituto los hereda del original. La forma solo aplica a un CFDI PUE.
## Descuentos de documento y cupones — oct 2026

- **Qué es:** una rebaja sobre la venta completa (`porcentaje` de 0 a 100 o
  `monto` en la divisa del documento), ANTES de impuestos. La aplica el motor
  (`calculateDocumentTotals`, opción `descuento`) y la reparte entre las líneas
  en proporción a su importe bruto; con `roundLines` el reparto es en unidades
  mínimas por mayor residuo (la suma por línea es exactamente el descuento y
  ninguna línea queda negativa). Un monto se topa en el bruto. Con precios que
  incluyen impuesto, el monto rebaja lo que paga el cliente y la base se
  desagrega después. Las retenciones se calculan sobre las bases descontadas.
- **Contrato de datos:** el navegador y la API mandan la DEFINICIÓN
  (`descuento: {tipo, valor}`) o un código (`cupon`), nunca un importe; el cupón
  manda sobre el manual (`src/lib/descuentos.ts`, `leerDescuentoBody`). Sin
  ninguna de las dos llaves, una edición conserva el descuento guardado.
  Cotización: `cotizaciones.descuento` = importe antes de impuestos (la hoja lo
  exporta y su `subtotal` es el bruto) y `descuento_def` = definición. Factura:
  `documentos_fiscales.descuento_total` y `descuento` (definición, con
  `cupon_id`); cada concepto del snapshot lleva `discount` y su `subtotal` sigue
  siendo la base NETA (`unitPrice` también es neto). `cotizacion_items.descuento_pct`
  no se usa: Shopify y la contabilidad lo aplican por línea.
- **Cupones** (`cupones`, Ajustes › Descuentos › Cupones, permiso `ajustes`):
  código `[A-Z0-9_-]{3,32}` único por organización, vigencia en la zona horaria
  del negocio, divisa obligatoria para un monto, tope global y por cliente.
  Código, tipo, valor y divisa no se editan; un cupón usado no se borra, se
  desactiva. El editor valida con `POST /api/cupones/validar` (permiso `cotizar`).
- **Ciclo de vida** (`src/lib/cupones.ts`): vigencia y `activo` se revisan al
  APLICAR; un cupón ya aplicado a un documento se conserva al editarlo. El uso se
  registra cuando el documento se vuelve vinculante, con `cord_cupon_redimir`
  (bloquea la fila del cupón): la factura al emitirse —ANTES de reservar folio—
  y la cotización al aprobarse, en la misma transacción que la aprobación. Si los
  usos se agotaron, no se emite ni se aprueba (el vendedor lo ve en el historial).
  La factura de una cotización reusa su redención. Anular la factura, borrar el
  borrador o rechazar la cotización la libera (`cord_cupon_liberar`). Un
  descuento manual cuenta para el tope de aprobación; un cupón no.
- **Rieles:** CFDI con `items[].discount` y ValorUnitario bruto (Facturapi:
  "monto total de descuento aplicado a este concepto"; Anexo 20: Importe −
  Descuento = base, y la base de un traslado debe ser mayor que cero, por eso un
  concepto que el descuento deja en cero se rechaza antes del PAC). Verifactu
  declara la base neta. La nota de crédito prorratea el `discount`. El PDF
  muestra el importe bruto por concepto y "Descuento (CÓDIGO)" en los totales.
- **Copias:** duplicar o repetir una factura copia el precio BRUTO y el
  descuento aparte; una recurrencia lleva solo un descuento manual
  (`documento_recurrencias.descuento`). Aprobación parcial y factura de una
  cotización vuelven a aplicar la definición sobre lo aprobado.
- **Despliegue:** `db/deploy/2026-10-08-descuentos.sql`. Lo verifican
  `test/engine-descuento.test.ts`, `test/cupones-db.test.ts` y
  `test/descuento-fiscal.test.ts`.

## Factura electrónica europea (Factur-X, XRechnung, Peppol) — oct 2026

- **Qué es:** la MISMA factura que el PDF, escrita para una máquina según
  EN 16931-1. Tres formatos, para emisores establecidos en la UE:
  **Factur-X** perfil EN 16931 (PDF/A-3b con `factur-x.xml` CII incrustado como
  `Alternative`; también es ZUGFeRD 2.x EN 16931), **XRechnung 3.0** (UBL por
  defecto, CII opcional; `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0`)
  y **Peppol BIS Billing 3.0** (UBL). Código en `src/lib/fiscal/einvoice/`:
  `model.ts` arma el modelo semántico y dice qué falta, `cii.ts`/`ubl.ts`
  serializan, `facturx.ts` + `src/lib/pdf/pdfa.ts` hacen el PDF/A, `server.ts`
  lo lee de la base.
- **Sin transmisión.** Cord genera, deja descargar y adjunta al correo. No envía
  por la red Peppol ni por una plataforma de facturación electrónica francesa
  (PA/PDP): decisión de producto. Ajustes y el detalle de la factura lo dicen;
  ninguna pantalla ofrece un envío que no existe (regla 15).
- **Fuente única: el snapshot.** El modelo se arma SOLO con lo congelado al
  emitir (`issuer_snapshot`, `recipient_snapshot`, `line_items_snapshot`,
  totales, `buyer_reference`, `purchase_order`, `payee_account`). Los importes
  no se recalculan: se toman y se comprueba que cuadren al céntimo
  (BR-CO-10/13/14/15, BR-S-08). Un documento que no cuadra (anterior al
  redondeo por línea) no se genera: serían dos facturas distintas con el mismo
  número. El IVA de cada tasa es la suma de los impuestos YA redondeados por
  línea, lo que dice el PDF; EN 16931 lo admite mientras difiera menos de una
  unidad de base × tasa (BR-CO-17, tolerancia del schematron CEN 1.3.16) y, si
  no, es el problema `vat_rounding`.
- **Categorías (UNTDID 5305):** tasa > 0 → S. Al 0 % manda la causa del
  concepto: España traduce su causa de Verifactu (E2→G, E5→K, S2→AE, N1→O,
  N2→AE con empresario de la UE u O fuera, resto E con su mención); el resto de
  la UE usa la clasificación VATEX que el negocio elige en su perfil exento
  (Ajustes › Impuestos; lista en `EU_EXEMPTION_INFO` de `exemption.ts`,
  restricción `chk_impuestos_exemption_reason`). Sin causa se deriva:
  franquicia (FR art. 293 B → VATEX-FR-FRANCHISE; DE § 19 UStG) → E; cliente
  de otro Estado miembro con NIF-IVA en ambos lados → AE; cliente fuera de la
  UE → G (no O: O obliga a quitar el NIF-IVA del vendedor, BR-O-02, y prohíbe
  cualquier otra categoría en el documento, BR-O-11..14); nacional → E. El PDF
  cita el precepto de una exención VATEX (Directiva 2006/112/CE, art. 226.11),
  el mismo texto que viaja como BT-120.
- **Descuento de documento:** la línea lleva su importe BRUTO (BT-131 =
  `subtotal + discount`, como la tabla del PDF) y el descuento va como
  AllowanceCharge de documento (BG-20, motivo 95) **uno por categoría y tasa**,
  así cada grupo del desglose cuadra: BT-116 = Σ BT-131 − Σ BT-92 del grupo y
  BT-109 = BT-106 − BT-107 = el `subtotal` de Cord. Lo prueban dos muestras que
  pasan por el motor real (10 % y un cupón de 50 € sobre precios con IVA en tres
  categorías) contra KoSIT, CEN y Peppol.
- **Otras decisiones con fuente:** fecha de expedición en la zona del emisor
  (la del PDF). Alemania sin fecha de prestación → BT-72 = fecha de factura (§ 14
  Abs. 4 Nr. 6 UStG, lo mismo que dice el PDF). Entrega intracomunitaria →
  BT-72 y la dirección completa del cliente como BG-15 (BR-IC-11/12; XRechnung
  pide ciudad y CP, BR-DE-10/11). Divisa contable distinta → BT-6 y BT-111 con
  la `fx_rate` congelada (art. 230 de la Directiva). Pago: IBAN de
  `payee_account` → 58 (SEPA, EUR) o 30; nota de crédito → `1` (instrumento no
  definido): XRechnung (BR-DE-1) y Peppol entre empresas alemanas (DE-R-001)
  exigen el grupo también en un 381 y Cord no tiene la cuenta del comprador.
  Francia entre profesionales → notas PMD, PMT y AAB (art. L441-9/10 C. com.;
  BR-FR-05). El identificador fiscal se re-deriva con `checkTaxId`: TVA/SIREN/
  SIRET (TVA calculada del SIREN), USt-IdNr o Steuernummer (BT-32), NIF español
  con prefijo ES.
- **Falla cerrado** (`assessEInvoice`, lista con texto es/en y dónde se corrige):
  borrador, anulada, documento de prueba, proforma, emisor fuera de la UE,
  IGIC/IPSI, **retenciones** (EN 16931 no las tiene: BT-115 menor que el total
  rompería BR-CO-16), divisa con tres decimales, totales o líneas que no
  cuadran, O mezclada, faltantes de identidad. Cada formato pide además lo suyo
  (`formatProblems`): XRechnung la referencia del comprador (BR-DE-15), contacto
  con nombre, teléfono y correo (BR-DE-2/5/6/7), ciudad y CP del cliente y el
  IBAN en una factura; Peppol la referencia u orden de compra (R003), las dos
  direcciones electrónicas sin `EM` (R010/R020) y, entre empresas alemanas, el IBAN.
- **Datos nuevos:** Ajustes › Perfil fiscal (solo UE) guarda en
  `orgs.fiscal_metadata` `contact_name`, `contact_phone`, `einvoice_address`
  ("esquema EAS:id", validado contra la lista de BR-CL-25), `legal_registration_id`,
  `bic` y `einvoice_email`. El cliente: `clientes.einvoice_address` y
  `buyer_reference` (la que toman sus facturas por defecto). La factura:
  `documentos_fiscales.buyer_reference`/`purchase_order` (editor, POST
  /api/facturas, update_draft, /api/v1/facturas) y `payee_account` (IBAN
  CIFRADO, terminación, BIC y titular vigentes al emitir; nunca en el snapshot,
  que la API y la página pública exponen). La unidad (BT-130) sale del producto
  en todos los países (`resolveLineUnitKey`). Despliegue:
  `db/deploy/2026-10-08-einvoice.sql`.
- **Superficies:** `/api/fiscal/documents/[id]/{facturx,xrechnung,xrechnung-cii,peppol}`
  y el mismo `[format]` en `/api/i/[token]/documents/` (409 con lo que falta).
  El detalle de la factura lista los formatos disponibles y lo que falta para
  los demás; la página pública solo enlaza los disponibles. Correo
  (`buildInvoiceAttachments`): `facturx` sustituye el PDF por el Factur-X;
  `xrechnung` agrega el XML al PDF; `off` deja solo el PDF. Por defecto Francia
  → `facturx`, Alemania → `xrechnung`, resto → `off`. Si la factura no admite
  el formato, sale el PDF de siempre: el correo nunca falla por esto.
- **PDF/A-3b:** el Factur-X es el PDF de siempre dibujado igual y ensamblado
  aparte (`createInvoicePdf({ assemble })`; sin `assemble` sale byte a byte el
  PDF anterior). Fuentes Liberation 2.1.4 (OFL, métricamente compatibles con
  Helvetica/Times) incrustadas en subconjunto con cmap (3,1) y `/Widths` del
  programa de fuente, perfil sRGB como OutputIntent, XMP con `pdfaid` y la
  extensión de Factur-X, fecha de metadatos = fecha de expedición (determinista).
  Las tablas AFM de `writer.ts` difieren de Helvetica real en pocos glifos de
  Latin-1 (ß, í en regular; €, «, », ß en negrita): desplazan medio punto un
  texto alineado a la derecha que los contenga, en los dos PDF; no se corrigen
  porque cambiarían el PDF de siempre.
- **Verificación:** `test/einvoice.test.ts` (rápido) y
  `npm run security:einvoice` (`scripts/einvoice-check.mjs`): once muestras
  (`test/helpers/einvoice-samples.ts`) en cada formato contra XSD UBL 2.1/CII
  D16B/Factur-X, schematron CEN 1.3.16, KoSIT 1.6.3 + XRechnung 3.0.2
  (configuración 2026-08-31), Peppol BIS 3.0.21 (reglas propias y su copia de
  CEN, vía phive-rules-peppol 4.6.3), schematron Factur-X 1.09 y veraPDF
  (Mustang 2.26), más siete controles negativos que cada validador debe
  rechazar. Artefactos con URL y SHA-256 fijos en `.cache/einvoice/` o
  `EINVOICE_TOOLS_DIR`; sin Java/xmllint/red se omite con aviso salvo con
  `EINVOICE_VALIDATION_REQUIRED=1`. Avisos aceptados, no errores:
  PEPPOL-EN16931-R008 del schematron Factur-X (`ApplicableHeaderTradeDelivery`
  vacío: el XSD lo exige aunque no haya entrega), BR-DE-TMP-32 de XRechnung
  (recomienda fecha de prestación cuando el emisor no es alemán y no la
  capturó) y el aviso aritmético de Mustang en la muestra de redondeo (recalcula
  el IVA por tasa en vez de sumar el redondeado por línea; dentro de BR-CO-17).
- **Pendiente:** transmisión (Peppol Access Point, PA francesa), XRechnung para
  la administración con Leitweg-ID validado (hoy texto libre), retenciones,
  IGIC/IPSI, Order-X, perfil EXTENDED, y correr `security:einvoice` en CI.

## Facturación internacional — ago 2026

- México: CFDI 4.0 mediante `MexicoSatProvider` y Facturapi como PAC intercambiable.
  La llave canónica de Cord también se manda como `idempotency_key` de Facturapi; los
  reintentos de red conservan esa llave y los documentos simulados/test no consumen el
  medidor de CFDI.
- Resto de códigos ISO: factura comercial propia de Cord, con folio por organización,
  snapshots inmutables y PDF interno. No equivale a clearance o presentación ante la
  autoridad tributaria local — **excepto España con Verifactu activado**, ver abajo.
- El feature de plan `international_invoicing` habilita la emisión fuera de México y
  queda temporalmente disponible en **Gratis**, en el mismo peldaño que `cfdi` —
  mismo carril de facturación electrónica, distinto solo por país. Ambos comparten
  el hard cap de 3 documentos mensuales en Gratis; `cfdi` conserva el medidor de
  timbrado mexicano y ninguno de los dos consume la cuota del otro
  (`scripts/billing-security-check.mjs` lo verifica sobre el ternario
  `isMexico ? 'cfdi' : 'international_invoicing'` en `/api/cotizaciones/[id].ts`).
- Persistencia: `documentos_fiscales`, `invoice_sequences` y `orgs.fiscal_metadata`, todas
  aisladas por organización; las dos primeras usan RLS y la secuencia usa `FORCE RLS`.
- Los adapters regulatorios futuros deben implementar `FiscalProvider` y registrarse antes
  de `CommercialInvoiceProvider`; no deben sustituir el documento canónico de Cord.

## Verifactu (España) — ago 2026, reescrito oct 2026

Sistema de facturación certificado que exige el RD 1007/2023 (Orden HAC/1177/2024):
cada factura genera un registro de "alta" encadenado por hash SHA-256 al registro
ANTERIOR de la misma org, y ese registro se remite a la AEAT. Obligatorio desde el
1 de enero de 2027 para contribuyentes del Impuesto sobre Sociedades y desde el 1 de
julio de 2027 para el resto (RD-ley 15/2025); a la fecha no hay otra prórroga en el
BOE.

- **Un solo interruptor.** `verifactuEnvioConfig()` (`src/lib/fiscal/verifactu/sif.ts`)
  decide a la vez si se encadena, a qué entorno se envía y a qué host apunta el QR
  (`VERIFACTU_AEAT_ENABLED`, `VERIFACTU_AEAT_SANDBOX`; pruebas por defecto). Con el
  envío apagado NO se encadena nada: el documento sale `commercial_only`, sin QR ni
  leyenda, y un tipo `verifactu_*` se rechaza con un motivo. Antes se encadenaban
  registros con el envío apagado y se imprimía un QR que la AEAT nunca iba a
  conocer. `document-kind.ts` usa el mismo interruptor para ofrecer el tipo fiscal.
- **Encadenamiento síncrono, envío asíncrono.** `SpainVerifactuProvider` (registrado
  en `FiscalFactory` ANTES de `CommercialInvoiceProvider`) genera y persiste el
  registro al emitir, sin red. El envío corre en `/api/cron/verifactu-submit`, cada
  hora desde el workflow de crons de GitHub (dos pasadas; `vercel.json` queda
  diario como respaldo) y además se programa inmediatamente después de emitir o
  anular. Cada envío toma un **lease por organización**, respeta el tiempo de
  espera que devuelve la AEAT y agrupa hasta 1,000 registros por mismo NIF y
  entorno.
- **Estados de envío.** `pendiente`, `aceptado`, `aceptado_con_errores`,
  `rechazado` y `bloqueado`. Un registro sin línea de respuesta sigue `pendiente`;
  uno que rompe el esquema se aparca como `bloqueado` sin enviarse; un rechazo del
  mensaje completo parte el lote a la mitad hasta aislar al culpable. Un fallo de
  cabecera o de certificado nunca aparca registros. 3000 (duplicado) toma el estado
  que la AEAT ya tiene; 3001 en una anulación cuenta como aceptado.
- **Cadena append-only de verdad.** `force row level security` más un trigger que
  bloquea `UPDATE`/`DELETE` de lo firmado. Una corrección es un registro NUEVO:
  `subsana_de`, `subsanacion`, `rechazo_previo`, `sin_registro_previo`; la
  unicidad por factura es un índice parcial sobre los registros originales y cada
  registro admite una corrección directa. `crearSubsanacionVerifactu()`
  (`correcciones.ts`) elige la subsanación correcta según el anexo de la AEAT.
  La pantalla vive en el detalle de la factura (`incidencias.ts`): estado del
  último registro con el código y el motivo de la AEAT, y "Corregir y reenviar"
  (acción `verifactu_correct` de `/api/facturas/[id]`, permiso `cotizar`), que
  admite fijar la causa de exención de los conceptos al 0 % — el snapshot se
  actualiza solo DESPUÉS de que la subsanación se encadena, y los importes nunca
  cambian. Ajustes › Datos fiscales lista las facturas por corregir (último
  registro rechazado, aparcado o aceptado con errores). La serialización de `seq` es `on conflict do nothing` + reintento,
  no un advisory lock (el driver HTTP de Neon no lo sostendría).
- **Qué se registra.** `ImporteTotal` = bases + cuotas del desglose (sin restar
  IRPF; el QR usa el mismo valor). Nota de crédito: R1 por diferencias (`I`), con
  `FacturasRectificadas` del registro original (R5 si el original fue F2). Cliente
  sin identificador: F2 con `FacturaSinIdentifDestinatarioArt61d`. Línea al 0 %:
  cliente empresarial de la UE con NIF-IVA → N2; fuera de la UE → N2; cliente
  español o consumidor de la UE → E6; una causa explícita en la línea siempre gana.
  Factura en otra divisa: se convierte línea a línea con el tipo de cambio del
  documento solo si la divisa contable es EUR; si no, falla con un motivo. IGIC,
  IPSI y recargo de equivalencia se rechazan al emitir.
- **Validación antes de encadenar.** NIF español normalizado y validado, NIF-IVA de
  la UE por país (Grecia usa `EL`), `IDOtro` contra la lista del XSD, longitudes y
  caracteres del número de serie. `scripts/verifactu-check.mjs` valida cada
  variante de registro contra los XSD oficiales (`scripts/fixtures/aeat/`) con
  `xmllint`, con control negativo.
- **Identidad del software (`SistemaInformatico`).** `VERIFACTU_SIF_*`. Cord puede
  identificarse sin NIF español vía `VERIFACTU_SIF_ID_OTRO_PAIS/_TIPO/_ID` (p. ej.
  MX + RFC). `VERIFACTU_SIF_ID` son exactamente 2 caracteres `[A-Z0-9]`. El número
  de instalación es por organización (prefijo `VERIFACTU_SIF_INSTALACION`) y una org
  con registros conserva el suyo. Sin identidad configurada, emitir y subir
  certificado fallan cerrados con un mensaje que no nombra variables.
- **Certificado por org (Ajustes › Fiscal).** `.p12`/`.pfx` validado con el TLS real
  de Node (los exportados RC2 antiguos caen a PEM en memoria), exige el plan con
  `cfdi` y la identidad del software. Si el titular no coincide con el NIF del
  negocio se acepta con un `aviso` (puede ser un representante). Con el envío
  apagado, la pantalla dice "Certificado guardado, registro aún no activo", no
  "activo". Desconectar responde 409 mientras haya registros sin enviar o del
  ejercicio en curso.
- **Anulación.** `voidInvoice` valida la anulación (`prepararAnulacionVerifactu`)
  ANTES de soltar los cobros en vuelo; si llega un pago entre la anulación
  encadenada y la local, `reactivarAltaVerifactu` vuelve a dar de alta la factura.
  Un alta que nunca llegó a la AEAT se anula "sin registro previo".
- **Conservación.** Un trigger `before delete` en `orgs` impide borrar una
  organización con registros; `deleteOrgCascade`, la baja de cuenta y Ops lo
  comprueban ANTES de cancelar la suscripción y responden 409.
- **Fuente primaria.** Huella contra los 3 vectores oficiales; SOAP y XML contra el
  WSDL/XSD descargados de la AEAT. NO verificado: un envío real (no había
  certificado). Confirmar contra el portal de pruebas antes de producción.

- **Declaración responsable (Orden HAC/1177/2024, art. 15).** `declaracion.ts`
  arma los apartados 1.a–1.l y el anexo con los textos del modelo de la AEAT
  (incluida la variante del 1.i para un productor sin NIF español) desde la MISMA
  identidad que viaja en cada registro, y la página pública
  `/verifactu/declaracion-responsable` la muestra (imprimible como PDF). Ajustes ›
  Fiscal la enlaza. Sin dirección, fecha y lugar de la declaración,
  `requireSifIdentity()` falla cerrado: el sistema no registra facturas sin
  declaración.

### Activación paso a paso

Ningún paso requiere NIF español. Para que Cord enviara **en nombre** de sus
clientes con un certificado propio haría falta NIF español y el convenio de
colaboración social; con el certificado de cada negocio (el modelo actual) no.

1. **Identidad del software** (Vercel › Settings › Environment Variables, en
   Production y Preview; los mismos valores en un `.env` local para el paso 3):
   - `VERIFACTU_SIF_NOMBRE`: razón social de Flouvia tal como consta en su RFC.
   - `VERIFACTU_SIF_ID_OTRO_PAIS=MX`, `VERIFACTU_SIF_ID_OTRO_TIPO=04`
     (documento oficial del país de residencia), `VERIFACTU_SIF_ID_OTRO_ID=<RFC>`.
   - `VERIFACTU_SIF_ID`: 2 caracteres `[A-Z0-9]`, para siempre (p. ej. `CD`).
   - `VERIFACTU_SIF_VERSION=1.0`.
   - `VERIFACTU_SIF_DIRECCION`: domicilio de Flouvia, líneas separadas por `|`.
   - `VERIFACTU_DECLARACION_FECHA` (aaaa-mm-dd) y `VERIFACTU_DECLARACION_LUGAR`.
   - `VERIFACTU_AEAT_ENABLED` se queda en `false` hasta el paso 4.
   Comprobación: `npm run verifactu:prueba -- --solo-xml` valida la identidad y el
   envío contra los XSD oficiales sin certificado ni red.
2. **Declaración responsable.** Tras desplegar, revisar el texto en
   `cordhq.app/verifactu/declaracion-responsable` (conviene que lo lea el asesor
   fiscal), imprimirlo como PDF, firmarlo y archivarlo. Una versión nueva del
   sistema exige subir `VERIFACTU_SIF_VERSION` y suscribir otra (fecha nueva).
3. **Portal de pruebas de la AEAT.** Hace falta un certificado cualificado (FNMT
   de persona física, o de representante de una sociedad) de un contribuyente
   español dispuesto a probar: su NIF es el obligado de la prueba. En local:
   `VERIFACTU_PRUEBA_PASSWORD='…' npm run verifactu:prueba -- --p12 cert.p12 --nombre "Nombre como consta en la AEAT"`
   (`--cliente-nif`/`--cliente-nombre` añaden una factura completa F1). Envía dos
   altas encadenadas y una anulación SOLO al entorno de pruebas, imprime la
   respuesta línea a línea y las URL del QR para cotejarlas en la sede de pruebas.
   Los datos del portal de pruebas no tienen efectos fiscales. Un certificado no
   reconocido responde "403 de identificación" (comprobado contra el portal: la
   AEAT redirige a una página HTML; el cliente lo trata como fallo de cabecera).
   Después, de punta a punta en un Preview con `VERIFACTU_AEAT_ENABLED=true` y
   `VERIFACTU_AEAT_SANDBOX=true`: una org española de prueba sube el certificado
   en Ajustes › Fiscal, emite una factura y la anula.
4. **Producción.** `npm run db:migrate`, después `VERIFACTU_AEAT_SANDBOX=false` y
   `VERIFACTU_AEAT_ENABLED=true` en Production, y redesplegar.

**Despliegue:** `npm run db:migrate` ANTES de desplegar. Los registros encadenados
con el código anterior que rompan el esquema (NIF con prefijo `ES`, R1 viejos, F1
sin cliente, `ImporteTotal` con IRPF restado) se aparcarán o necesitarán
subsanación.

## Rieles fiscales de LatAm — oct 2026

Factura electrónica autorizada por la autoridad de cada país, con motor propio
(sin PAC ni intermediario), igual que Verifactu. Hoy hay un riel: **ARCA
(Argentina)**. El marco está hecho para que NFS-e Nacional (Brasil), DIAN
(Colombia), SUNAT (Perú) y SII (Chile) se monten encima sin tocar la emisión.

### El marco (`src/lib/fiscal/latam/`)

| Pieza | Archivo | Contrato |
|---|---|---|
| Registro de rieles | `rieles.ts` | `RIELES[id]`: país, autoridad, tipos de documento (`<rail>_invoice`/`<rail>_credit_note`), prefijo de variables, si lo autorizado se puede anular y si la autoridad numera. `document-kind.ts`, `invoices.ts` y `FiscalFactory` leen de aquí; ningún `if (country === 'AR')` fuera del riel. |
| Interruptor | `config.ts` | `<PREFIJO>_ENABLED` (`true` o apagado) y `<PREFIJO>_ENTORNO` (`homologacion` por defecto, `produccion`). Nace apagado; un entorno desconocido apaga el riel. |
| Credenciales | `certificado.ts`, `credenciales.ts` | Certificado + llave por organización, riel y **entorno** (`fiscal_rail_credenciales`), cifrados con `encryptRequiredSecret`. Al navegador solo vuelve el resumen (vigencia, titular, huella). PEM/DER, PKCS#1/#8 cifrada o PKCS#12; RSA ≥ 2048. |
| Ajustes | `credenciales.ts` | `fiscal_rail_ajustes.ajustes` (jsonb) por riel, independiente del entorno. |
| Accesos | `accesos.ts` | Ticket de la autoridad cacheado por org/riel/entorno/servicio, cifrado, renovado por UNA instancia (lease) y con `bloqueado_hasta` cuando la autoridad pide esperar. |
| Comprobantes | `comprobantes.ts` | `fiscal_rail_comprobantes`: un intento por pedido, `pendiente → autorizado \| rechazado \| incierto → autorizado \| descartado`. Índices únicos parciales (número y documento, entre los vivos) y trigger: lo autorizado no se edita ni se borra, rechazado/descartado son finales, un incierto solo se resuelve consultando. |
| Numeración | `comprobantes.ts` (`conSecuencia`) | Lease por secuencia (`fiscal_rail_secuencias`) + índice único: un solo pedido en vuelo por punto de venta y tipo, sin advisory locks (el driver HTTP de Neon no sostiene una sesión entre llamadas). |
| Outbox | `resolucion.ts` + `/api/cron/fiscal-latam` | Cada hora (`cord-crons.yml`) resuelve por CONSULTA lo que quedó `pendiente`/`incierto` hace más de 2 min. Nunca reenvía. Barrido con `cord_fiscal_rail_orgs_por_resolver()` (security definer, solo `app.scope = 'system'`); el trabajo de cada org vuelve a `withOrgTx`. |
| Errores | `errores.ts` | `RailDatosError` (corregible), `RailNoDisponibleError` (credencial/ajustes), `RailTransitorioError` (reintentar): mensaje apto para el dueño del negocio, nunca el texto crudo de la autoridad (regla 14). |
| Impresión | `representacion.ts` | `provider_data.latam.representacion`: título, letra, código, filas, QR, leyendas y pie. `invoice-pdf.ts` la dibuja sin saber de qué país es. |
| Estado | `estado.ts` | `railListo(org, rail)`: lo consulta `document-kind.ts` para decidir si nace `<rail>_invoice`, proforma o factura comercial. |

`FiscalDocumentResponse` ganó `invoiceNumber` (el número legal que asigna la
autoridad reemplaza al folio interno) e `issuedAt`. `voidInvoice` lee
`anulable` del registro: donde la autoridad no anula, pide nota de crédito.

**Montar un riel nuevo:** agregar su entrada en `RIELES`; su carpeta
`latam/<rail>/` con el armado del comprobante (puro, con extensiones `.ts`
para cargarse en Node plano), el cliente del web service y su `estado.ts`; el
caso en `latam/estado.ts` y `latam/resolucion.ts`; un `FiscalProvider` en
`providers/` registrado antes de `CommercialInvoiceProvider`; su sección en
Ajustes › Datos fiscales; fixtures oficiales y un `scripts/<rail>-check.mjs`
encadenado en `test:payments`. Las tablas no cambian.

### ARCA (Argentina)

Web services WSAA (autenticación con CMS firmado) y WSFEv1 (CAE), directo con
ARCA. Proveedor: `providers/ArgentinaArcaProvider.ts`; riel:
`latam/arca/`. Cobertura:

- **Clase A/B/C** según la condición frente al IVA del emisor (Ajustes) y del
  receptor (campo nuevo `clientes.condicion_iva`, solo para clientes
  argentinos, tabla de la RG 5616/2024). Monotributo y exento emiten C, sin
  IVA discriminado.
- **Receptor**: CUIT (80), DNI (96) o consumidor final sin identificar (99/0)
  solo en B y C y por debajo de $ 10.000.000 (RG 5700/2025). Sin condición
  capturada se infiere consumidor final solo si no tiene CUIT; con CUIT se pide.
- **Importes**: IVA por alícuota en `AlicIva` (0 % se informa como exento en
  `ImpOpEx`), cuadres del manual (10048, 10023, 10061, 10051) verificados antes
  de enviar.
- **Descuento de documento (bonificación)**: WSFEv1 no tiene conceptos ni campo
  de bonificación; `ImpNeto` es el neto gravado. Cada concepto llega con su
  base ya neta y su parte del descuento (`discount`, motor de Cord), así que el
  neto, las bases de `AlicIva` y el IVA van netos y cuadran con el documento. La
  suma de los descuentos debe coincidir con el `discountTotal` del documento o
  no se envía; la bonificación se guarda en la solicitud y se imprime en el
  bloque de ARCA (el PDF ya muestra el importe bruto por concepto y el renglón
  de descuento). Un concepto que el descuento dejó en cero no informa alícuota.
- **Servicios** (concepto 2/3): período desde `service_date`/`service_date_end`
  y vencimiento desde `due_date` (nunca anterior a la fecha del comprobante).
- **Moneda**: `MonId` de la tabla de ARCA; la cotización es la congelada del
  documento si su divisa contable es ARS (regla 22), si no la oficial de ARCA
  (`FEParamGetCotizacion`); sin ella falla cerrado. `CanMisMonExt` no se envía.
- **Nota de crédito**: misma clase, receptor, condición, concepto y moneda que
  la factura autorizada que ajusta, con `CbtesAsoc`. Un comprobante con CAE no
  se anula: la UI y `voidInvoice` piden nota de crédito.
- **Recuperación**: respuesta perdida → consulta inmediata
  (`FECompUltimoAutorizado` + `FECompConsultar`) y, si no alcanza, el cron.
  Errores 500–502 de ARCA → incierto. Token rechazado (600/601) → ticket nuevo
  y el MISMO número. 10016 (numeración cambiada) → una vuelta con el número
  nuevo. Un número que ARCA tiene con otros datos se descarta.
- **Impresión**: título y letra, `COD. nn`, punto de venta y número, CUIT,
  condición, receptor, CAE y su vencimiento, comprobante asociado, QR
  (RG 4892/2020, URL `https://www.arca.gob.ar/fe/qr/`) y leyendas: "A
  CONSUMIDOR FINAL", transparencia fiscal en B (Ley 27.743, RG 5614/2024) y
  crédito fiscal del monotributista en A.
- **Homologación**: número con prefijo `H-`, `simulado: true` y
  `livemode: false` (no cobra medidor ni se presenta como factura real), leyenda
  "sin validez fiscal".

**No cubierto (se rechaza con un mensaje antes de pedir el CAE):** Factura E de
exportación (cliente fuera de Argentina), Factura de Crédito Electrónica
MiPyME, receptor "No categorizado" (exige percepción), retenciones,
tributos/percepciones (`ImpTrib`), CAEA y comprobantes M.

**Verificación:** `npm run security:arca` (en `test:payments`) valida cada
pedido contra el esquema de los WSDL oficiales y el TRA contra su XSD
(`scripts/fixtures/arca/`), reproduce el QR del ejemplo oficial, verifica el
CMS con openssl y lee respuestas reales de homologación. `test/arca-db.test.ts`
(PGlite + ARCA simulado) cubre autorización, rechazo, recuperación, tickets,
nota de crédito, concurrencia, trigger y RLS; `test/arca-comprobante.test.ts`
las piezas puras.

### Activación paso a paso

1. `npm run db:migrate` (o el despliegue, que aplica
   `db/deploy/2026-10-08-latam-arca.sql`).
2. **Homologación.** Un certificado de prueba se genera en WSASS ("Autogestión
   certificados Homologación", con clave fiscal) y se le asocia el servicio
   `wsfe`. En local: `ARCA_PRUEBA_PASSWORD='…' npm run arca:prueba -- --cert c.crt --key c.key --cuit <CUIT> --pto-vta <n> --parametros --emitir`
   (sin certificado, solo comprueba los servidores). Nunca toca producción ni
   la base. `--parametros` coteja las tablas vivas de ARCA con las constantes.
3. **De punta a punta en un Preview** con `ARCA_ENABLED=true` y
   `ARCA_ENTORNO=homologacion`: una org argentina de prueba con plan Starter
   carga CUIT, sube el certificado, completa punto de venta, condición y
   concepto, emite una factura A, una B a consumidor final y una nota de
   crédito.
4. **Producción.** Cada negocio crea en ARCA un punto de venta "Factura
   electrónica - Web services", genera su certificado de producción y lo
   asocia a `wsfe`. Después `ARCA_ENTORNO=produccion` y `ARCA_ENABLED=true` en
   Production. Cambiar de entorno exige que cada negocio suba el certificado del
   entorno nuevo (se guardan por separado).

**Lo que no se pudo verificar sin un certificado real de homologación** (el
WSAA de homologación rechaza un certificado autofirmado con
`cms.cert.untrusted`/`cms.cert.blacklist`): la emisión real de un CAE, las
listas vivas de `FEParamGetTiposIva`/`TiposMonedas`/`CondicionIvaReceptor`
(`arca:prueba --parametros` lo hace), los valores de `EmisionTipo` de los puntos
de venta y el comportamiento de producción. Sí se verificó contra ARCA real:
que el CMS es legible (el WSAA llegó a evaluar el certificado), que los pedidos
de Cord se deserializan en WSFEv1 (respuesta 600 por token y no `soap:Client`)
y el TLS de los cuatro endpoints.

### SII (Chile)

Documento Tributario Electrónico enviado DIRECTO al SII, sin proveedor
intermediario: Cord toma el folio, timbra, firma, sube y consulta el
veredicto. Proveedor: `providers/ChileSiiProvider.ts`; riel: `latam/sii/`.
Cobertura:

- **Tipos**: factura electrónica (33), factura no afecta o exenta (34, cuando
  todos los conceptos son exentos) y nota de crédito (61). La boleta (39/41), la
  factura de exportación (110–112), la nota de débito (56), la guía de despacho
  (52) y la boleta de honorarios no se emiten: se dice en Ajustes y, si el
  documento lo requiere (cliente sin RUT, cliente extranjero sin RUT,
  retención), se rechaza ANTES de tomar folio.
- **Folios (CAF)**: el negocio descarga del SII el archivo de folios por tipo y
  lo sube en Ajustes › Datos fiscales (`/api/fiscal/sii-folios`). Se valida que
  sea del RUT del negocio, de un tipo que Cord emite y que la llave privada
  (RSASK) sea la pareja de la pública (RSAPK); se guarda entero y cifrado en
  `fiscal_sii_cafs` y nunca vuelve al navegador. `folio_siguiente` avanza con un
  UPDATE atómico dentro del lease de la secuencia (`serie` = RUT emisor, `tipo`
  = tipo de DTE) y **un folio usado no vuelve nunca**: un rechazo o un descarte
  libera el documento, no el folio. El trigger de la tabla impide solapar
  rangos, retroceder el folio, cambiar la identidad de un CAF o borrar uno con
  folios usados. Vigencia de seis meses desde la autorización para 33 y 61
  (Res. Ex. SII 58/2017; la 61 por prudencia), aviso cuando quedan
  max(20, 10 %) o menos. La firma del SII sobre el CAF (`FRMA`) no se verifica:
  el SII no publica sus llaves por `IDK`.
- **Timbre electrónico**: `DD` aplanado en ISO-8859-1 y firmado SHA1withRSA con
  la llave del CAF (`ted.ts`); PDF417 propio (`pdf417.ts`: compactación de
  bytes, corrección de errores nivel 5, X ≥ 6,7 mils, fila 3X, entre 2 × 5 y
  4 × 9 cm), impreso a 2 cm o más del borde izquierdo con "Timbre Electrónico
  SII" y "Res. N de AAAA - Verifique documento: www.sii.cl".
- **Firma**: XMLDSig RSA-SHA1, C14N inclusivo 20010315. El DTE se firma SUELTO,
  sin declaración de espacio de nombres, y se inserta tal cual en el sobre; el
  `SetDTE` se firma en el contexto del `EnvioDTE` (xmlns + xmlns:xsi). Es la
  convención del SII: el DigestValue del ejemplo oficial F60T33 solo se
  reproduce así (un verificador estándar que canonicaliza el DTE dentro del
  sobre no lo valida, tampoco el del ejemplo oficial). Archivo en ISO-8859-1
  con el schemaLocation en la segunda línea y saltos de línea tras cada
  etiqueta.
- **Autenticación**: semilla (`CrSeed`) firmada → token (`GetTokenFromSeed`),
  cacheado 60 min en `fiscal_rail_accesos` (el manual no fija su vigencia) y
  renovado ante los estados 001–003 de las consultas o el STATUS 5 del upload.
  El certificado es de una PERSONA (el usuario autorizado ante el SII): su RUT
  sale del `subjectAltName` (OID 1.3.6.1.4.1.8321.1) o se pide escrito, y va
  como `RutEnvia`.
- **Envío y veredicto**: `DTEUpload` devuelve un número de envío (trackid) y el
  SII valida después. `QueryEstUp` "EPR" con aceptados o reparos → emitido
  (`autorizacion` = trackid; los reparos quedan como observación); "EPR" con
  rechazados o RSC/RFR/RCT → rechazado, con mensaje propio. Cord espera el
  veredicto en línea hasta 12 s; si no llega, responde `delivery_uncertain` con
  el trackid y lo terminan el cron `fiscal-latam` o el siguiente reintento, que
  CONSULTAN. Sin respuesta legible del upload el intento queda `incierto` y se
  resuelve con `QueryEstDte` por los datos del documento (DOK y similares →
  emitido, `autorizacion` = `SII-<estado>`; FAN/FNA → descartado; sin registro
  pasadas 2 h → descartado). Solo se reenvía el MISMO archivo cuando el SII dijo
  que no lo recibió (STATUS 2, 3, 9, o 5 con token nuevo). Con trackid y sin
  registro del DTE a las 24 h → rechazado.
- **Montos**: pesos chilenos enteros (otra divisa sería exportación). IVA del
  documento = round(neto × 19 %); Cord lo calcula por concepto y, si la suma
  difiere, el documento NO se envía y el mensaje dice cuánto (el SII obligaría a
  corregirlo con nota de crédito). Descuento de documento como `DescuentoMonto`
  por línea con `MontoItem` neto; precio y cantidad solo se informan si
  round(cantidad × precio) = monto + descuento. Retenciones: rechazadas (la de
  honorarios es de la boleta de honorarios).
- **Receptor**: RUT, razón social, giro, dirección y comuna, obligatorios en 33
  y 34. `clientes.giro` y `clientes.comuna` son nuevos y el modal de cliente
  los pide solo a clientes chilenos de una cuenta con el riel encendido.
- **Emisor**: RUT y razón social de Identidad de facturación; en los ajustes
  del riel: giro, actividades económicas (1 a 4), dirección (si difiere),
  comuna, ciudad, sucursal y su código del SII, unidad del SII que imprime el
  recuadro, y número y fecha de la resolución por entorno (0 en certificación).
- **Nota de crédito**: `TpoDocRef`/`FolioRef`/`FchRef` de la factura aceptada,
  `CodRef` 1 si anula el total y 3 si corrige montos, con el receptor de la
  factura. Un DTE aceptado no se anula (`anulable: false`).
- **Impresión** (`provider_data.latam.representacion`, campos `recuadro`,
  `timbre` y `cedible`): recuadro rojo arriba a la derecha (RUT, tipo, N° de
  folio) con "S.I.I. - <unidad>" debajo, filas de fecha, giros, comuna, forma de
  pago, vencimiento, período, referencia y totalizadores, el timbre, y la copia
  cedible de 33 y 34 (`/api/fiscal/documents/<id>/cedible`) con el acuse de
  recibo de la Ley 19.983 y "CEDIBLE".
- **XML al cliente**: la descarga `xml` (app y link público) entrega el DTE tal
  como lo aceptó el SII dentro de un `EnvioDTE` dirigido al RUT del cliente,
  firmado con el certificado vigente; sin certificado, el DTE firmado suelto.
- **Certificación** (`SII_ENTORNO=homologacion`, maullin): número `C-FE-…`,
  `simulado: true`, `livemode: false` y leyenda "sin validez tributaria".

**Decisiones abiertas:** el IVA por concepto frente al del documento (hoy se
rechaza la diferencia en vez de ajustar; la salida limpia es que el motor
calcule el IVA chileno por documento); `fiscalId` = `<RUT>/T<tipo>/F<folio>`;
los plazos de 2 h y 24 h; la vigencia de 60 min del token.

**Verificación:** `npm run security:sii` (en `test:payments`) reproduce el
timbre y los DigestValue del ejemplo oficial F60T33, valida los sobres 33, 34,
61 y el de intercambio contra `EnvioDTE_v10.xsd`/`DTE_v10.xsd` (actualización
06/02/2026, con controles negativos), verifica cada firma con la verificación
propia y con la JDK (`scripts/sii-firmas.java`, si hay `java`), comprueba los
síndromes y las medidas del PDF417, coteja endpoints y parámetros con los WSDL
de maullin y palena y lee respuestas reales del SII (`scripts/fixtures/sii/`).
`test/sii-db.test.ts` (PGlite + SII simulado) cubre aceptación, reparos,
rechazo, validación diferida, respuesta perdida, STATUS 3 y 5, cron, nota de
crédito, folios (concurrencia, agotamiento, trigger), XML para el cliente y
RLS; `test/sii-comprobante.test.ts` las piezas puras.

### Activación del SII paso a paso

1. `npm run db:migrate` (o el despliegue, que aplica `db/deploy/2026-10-09-sii.sql`).
2. **Certificado y postulación.** El representante del negocio obtiene un
   certificado digital de una entidad acreditada y lo registra en el SII; luego
   postula como emisor electrónico con sistema de mercado en el sitio del SII
   (ambiente de certificación). La fecha que asigna el SII es la `FchResol` de
   certificación; el número es 0.
3. **Prueba técnica.** `npm run sii:prueba` comprueba red y TLS hasta maullin;
   `SII_PRUEBA_PASSWORD='…' npm run sii:prueba -- --p12 cert.pfx` prueba la
   autenticación (10 = certificado no registrado en el SII, 11 = firma
   rechazada) y `--emitir --caf caf33.xml --folio N …` sube una factura de
   prueba y consulta su estado. Fijado a certificación; nunca toca la base.
4. **Certificación ante el SII** con `SII_ENABLED=true` y
   `SII_ENTORNO=homologacion` en un Preview: el negocio pide folios de
   certificación, los sube con su certificado y sus datos, y recorre las etapas
   del SII — set de pruebas, simulación, intercambio de información y muestras
   impresas (el PDF con timbre y la copia cedible) — y firma la declaración de
   cumplimiento. **Pendiente para completarla:** el set de pruebas exige una
   referencia "SET / CASO n" en cada documento y casos de tipos que Cord no
   emite (nota de débito 56 y, según el set, guías y libros), y la etapa de
   intercambio exige RECIBIR DTE y responder acuses (`RespuestaDTE`,
   `EnvioRecibos`), que Cord no hace. Tampoco está verificado si Flouvia puede
   registrarse ante el SII como proveedor de software certificado para
   simplificar este trámite a sus clientes.
5. **Producción.** Con la resolución del SII, cada negocio sube su certificado
   y sus folios de producción (palena) y carga el número y la fecha de la
   resolución; después `SII_ENTORNO=produccion` y `SII_ENABLED=true` en
   Production. Certificados y folios se guardan por entorno.

**Lo que no se pudo verificar sin un certificado registrado en el SII y un
CAF real:** la obtención de un token, el upload con trackid, la aceptación de
un DTE, los estados vivos de `QueryEstUp`/`QueryEstDte` más allá del token y
la firma `FRMA` de un CAF real. Sí se verificó contra el SII real: la semilla
de maullin, que GetTokenFromSeed evalúa la firma de Cord (10 con firma válida de
un certificado no registrado frente a 11 con la firma alterada), las respuestas
sin token de las dos consultas, el upload sin autenticar (STATUS 5) y el TLS.

## Documento de factura — ago 2026

Fuera de México, el PDF que genera Cord **es** la factura que ve el comprador, así
que se trata como pieza de marca del negocio emisor, no como un volcado de datos.

- Se dibuja con `src/lib/pdf/writer.ts`, un escritor PDF vectorial propio y sin
  dependencias: rectángulos, líneas, color, imágenes y medición real de texto con
  las métricas de Helvetica.
- **Codificación WinAnsi**, no ASCII. El generador anterior (`simple-pdf.ts`)
  normalizaba todo: "España" se imprimía "Espana" y un guion largo salía como
  `?`. `simple-pdf.ts` sigue vivo solo para evidencia interna de disputas.
- Toma del negocio su **logo** (PNG con alfa o JPEG, incrustado de verdad) y su
  **color de marca**; sin logo, el nombre legal funciona como wordmark y se
  encoge para caber entero antes de recortarse. La tinta sobre el color se
  decide por luminancia: una marca clara nunca lleva texto blanco.
- Incluye lo que una factura necesita y antes no estaba: vencimiento derivado de
  los términos de crédito, condiciones, referencia, **desglose de impuestos por
  tasa** (base imponible de cada tipo), cómo pagar con el link público, notas, y
  numeración `n / total` en todas las páginas.
- Multipágina con encabezado de tabla repetido; los totales nunca se parten.
- El pie legal se conserva palabra por palabra y cambia según el país: en México
  aclara que la validez la determina el CFDI timbrado y su XML; fuera, que es un
  documento comercial no presentado ante ninguna autoridad (reglas 10 y 14).
- Cuando el documento SÍ tiene registro Verifactu (`provider_data.verifactu`), el PDF
  dibuja el QR de cotejo de la AEAT como una cuadrícula vectorial
  (`QRCode.create()`) **al principio de la primera página**: 32 mm de código
  (la norma pide 30–40 mm), 6 mm de blanco alrededor, "QR tributario:" encima y
  la leyenda debajo a 9 pt. Antes medía ≈ 23 mm y vivía junto a los totales. Con
  retenciones, "Importe total factura" (el del QR) y "Total a pagar" van por
  separado. Un documento sin registro no dibuja nada de esto.
- Menciones legales que el PDF imprime solo: autoliquidación intracomunitaria,
  condiciones B2B de Francia, **franquicia de IVA** (FR art. 293 B CGI y DE § 19
  UStG, desde `fiscal_metadata.vat_regime` congelado en el emisor, y solo si el
  documento no cobra impuesto) y, en divisa extranjera de un emisor de la UE, la
  cuota también en la moneda nacional (Directiva de IVA, art. 230). Si no caben,
  siguen en otra página: antes se cortaban.
- Imprime las notas de la factura (en una nota de crédito, como "Motivo"); las
  condiciones del negocio van aparte. Una factura anulada lleva el aviso arriba y
  ni ella ni una nota de crédito llevan link de pago.

Marca y condiciones se leen **en vivo** al descargar; los importes y las partes
salen del snapshot inmutable de `documentos_fiscales`. Cambiar el logo actualiza
descargas futuras sin reescribir un documento ya emitido.

## La factura como objeto de primera clase — ago 2026

Hasta esta entrega, una factura era un subproducto de la cotización:
`documentos_fiscales.cotizacion_id` era `NOT NULL` y el único disparador de
emisión en todo el repo era `PATCH /api/cotizaciones/[id] { to: 'invoiced' }`.
No había ciclo de vida, la factura no sabía si estaba pagada, y el cliente
nunca la recibía.

**Dos ejes, deliberadamente separados.** `status` describe el rail fiscal
(`pending | issued | cancelled | error`); `lifecycle` describe el estado
comercial (`draft | open | paid | void | uncollectible`). "Timbrada ante el
SAT" y "pagada por el cliente" son hechos distintos que cambian por causas
distintas, y colapsarlos en una columna es cómo se cobra dos veces.

- **Borrador** (`createInvoiceDraft`, `src/lib/fiscal/invoices.ts`): se arma sin
  tocar al proveedor y **sin consumir el medidor `timbrado`**. El folio se
  reserva al emitir, no al crear: un borrador descartado no deja hueco en la
  numeración fiscal.
- **Emitir** (`finalizeInvoice`): mismo `pg_advisory_xact_lock` que el carril de
  cotización, asigna folio desde `invoice_sequences`, llama al provider y solo
  entonces pasa a `open`. Si el proveedor falla, el documento **sigue siendo
  borrador** — no entra al aging ni a cobranza.
- **Cobrar** (`src/lib/fiscal/payments.ts` + `documento_pagos`): el saldo nunca
  se incrementa, se **recalcula desde la suma del ledger**. Idempotente por
  `stripe_payment_intent_id`, porque Stripe reintenta sus webhooks por diseño.
- **Anular** (`voidInvoice`): por fin llama a `provider.cancelDocument()`, que
  llevaba meses implementada sin un solo llamador. Falla cerrada: si el SAT no
  confirma, la factura NO se pinta como anulada. Con pagos aplicados no se
  anula — devuelve `requiresCreditNote`.
- **Nota de crédito** (`createCreditNote`): conserva conceptos, tasas y retenciones
  originales; un importe parcial que no cuadra al redondear se rechaza. Se emite
  desde su detalle, sin pasar por el editor de ingresos. En MX envía `type=E`,
  uso G02 para RFC no genérico y relación 01 con el UUID original leído bajo la
  misma organización. Nace con saldo cobrable cero y los endpoints de pagos
  rechazan notas de crédito, incluidos documentos heredados con saldo positivo.
  Los borradores reservan importe bajo lock de la factura original; la suma
  de notas no anuladas no puede superar su total. La emisión y la cancelación
  de la nota recalculan el saldo original en la misma transacción local.
  El crédito aplicado no crea un pago ni envía dinero automáticamente.

**Conciliación del saldo.** `reconciliation.ts` calcula
`saldo = max(total − notas emitidas − cobros + reembolsos efectivos, 0)`.
`amount_paid` conserva cobros brutos; `amount_credited` y `amount_refunded`
separan los otros movimientos. `refund_due` muestra el exceso de dinero neto
que debe devolverse al cliente. El estado técnico `paid` incluye saldos
liquidados con crédito; el detalle y el link muestran «Saldada» en ese caso.
Los importes aparecen desglosados en ambas superficies.

`documento_reembolsos` guarda cada devolución por organización e id de refund,
con PI, divisa, monto y estado; tiene ENABLE/FORCE RLS. Solo `succeeded`
reduce dinero recibido; `pending`/`failed` no cuentan como devolución efectiva.
El webhook consulta el estado vigente en la cuenta conectada y conserva la
fecha del evento para no sobrescribir con eventos antiguos. Se guarda incluso
si el pago aún no llegó: ambos flujos comparten lock por PI y luego recalculan
bajo lock del documento. Los reintentos no duplican pagos ni créditos.

Los pagos manuales no pueden superar el saldo vigente. Los pagos externos
ya recibidos se registran aunque produzcan exceso, que aparece como importe
por devolver. Un fallo al aplicar el pago no confirma su webhook. La cancelación
de una factura con notas activas se rechaza hasta resolver esas notas.

Estos campos y la tabla nueva requieren aplicar el bloque de conciliación de
`db/schema.sql` antes de desplegar. No se ha aplicado a bases externas ni se han
recalculado documentos históricos; primero hay que revisar sus notas, monedas,
folios fiscales y cualquier exceso reservado. La conciliación consume estados
de reembolsos existentes: no agrega una acción automática para enviar dinero.

**Impuestos del CFDI.** `mexico-items.ts` envía impuestos explícitos por concepto:
IVA 16%, 8% y exento (la semántica actual de tasa 0 en el catálogo). Traduce
`ret_iva`/`ret_isr` a impuestos retenidos y conserva la base `subtotal` o
`impuesto` del snapshot. Recupera hasta seis decimales del precio unitario a
partir de la base guardada y valida el desglose antes de enviar. IEPS, IVA a tasa
cero gravada y otras clasificaciones necesitan metadatos propios; el adaptador
no los infiere de un porcentaje.

**Estado de cancelación MX.** Se guarda en `provider_data.cancelacion.status`.
`accepted` requiere además que el proveedor devuelva `status=canceled`; solo
entonces se anula localmente y se publica `invoice.voided`. `pending` y
`verifying` responden 202, y `rejected`, `expired` o `unknown` conservan el
estado comercial. El detalle ofrece «Consultar cancelación» (`PATCH` con
`action=cancellation_status`), que consulta sin iniciar otro DELETE. También
se consulta antes de solicitar una cancelación para recuperar respuestas
perdidas y evitar repetir solicitudes pendientes. Se respeta el
`credential_scope` original; una llave ausente no simula la cancelación de un
comprobante real. El motivo lo elige el negocio (02, 03 o 04; el 01 solo con
sustitución, ver "Factura global, sustitución y motivos del SAT"). No hay
sincronización automática por webhook en este flujo.

**Corrección multi-tenant en la cancelación.** `MexicoSatProvider.cancelDocument`
usaba la llave GLOBAL de Facturapi. Un CFDI timbrado bajo el CSD del cliente no
existe en esa cuenta: la cancelación devolvía 404 y el comprobante seguía vivo
en el SAT mientras Cord lo mostraba cancelado. El contrato `FiscalProvider`
ahora recibe `providerApiKey` y devuelve `FiscalCancelResponse` en vez de un
booleano.

**Superficies nuevas.** `/app/facturas` (bandeja con filtros, keyset y acciones;
la de Ajustes queda como 301), `/i/[token]` (hosted invoice page con saldo,
historial de pagos y cobro con tarjeta del saldo vía Connect),
`notifyInvoiceIssued`/`notifyInvoiceReminder` en `src/lib/email.ts`,
`/api/v1/facturas` y las tools MCP `listar_facturas`, `detalle_factura` y
`crear_factura_borrador` (escritura acotada a borrador a propósito).

**Flujo profesional de emisión (20 ago 2026).** La bandeja ya no usa la palabra
"Borrador" como si fuera el folio: muestra **Sin folio** y una referencia visual
`BOR-xxxxxx`; el número oficial se asigna únicamente en `finalizeInvoice`. El
editor concentra la intención principal en **Emitir y enviar**, con revisión final
de cliente, total, vencimiento y correo. `PATCH /api/facturas/[id]` expone
`finalize_and_send`, que orquesta emisión y entrega sin afirmar una transacción
imposible: si timbrar termina y el correo falla, responde `issued: true, sent:
false`, conserva el folio y deja el reenvío como siguiente paso idempotente.

El detalle muestra saldo, vencimiento y entrega juntos; permite reintentar una
emisión fiscal en error, duplicar a un borrador nuevo (sin copiar folio ni fecha
vencida), reenviar, cobrar parcial o totalmente, anular o acreditar. La bandeja
marca error fiscal y vencimiento como estados operativos, mantiene el envío masivo
como acción secundaria y exporta la vista filtrada a CSV mediante
`GET /api/facturas/export` (techo defensivo de 10,000 filas).

**Entrega y documentos de prueba.** La selección masiva incluye únicamente
facturas emitidas que todavía no tienen `sent_at`; una factura ya entregada se
reenvía desde su detalle, junto al destinatario y la bitácora. `simulado` no es un
estado comercial: indica que ningún proveedor fiscal emitió el documento. La UI
lo presenta como **Documento de prueba** y explica que no es válido ante la
autoridad; el link público también lo advierte y bloquea el pago en línea. El
endpoint de PaymentIntent repite esa guarda en servidor. Una emisión histórica
simulada no se convierte en timbrada por cambiar configuración.

`MexicoSatProvider` lee `FACTURAPI_*` tanto de `import.meta.env` como de
`process.env`. En Astro desarrollo carga `.env` en el primer carril; consultar
solo el segundo hacía que una llave disponible se ignorara y degradara la emisión
a simulación local. Una llave `sk_test_` produce `testMode`, no un CFDI real.

La documentación pública canónica del flujo vive en
`src/content/docs/{es,en}/pagos/facturas-emitidas.mdx`, publicada en
`docs.cordhq.app`.

**Regla 19 en la hosted page.** La vista NO se marca en el SSR: la registra el
heartbeat de `/api/i/[token]` con la pestaña visible y solo cuando
`resolveViewer` resuelve `client`. El mismo GET lo hace el vendedor revisando su
link y el bot de WhatsApp armando la preview.

**Recurrencias y orientación del comprador.** El cron reclama cada periodo con
una actualización condicionada a su fecha, estado activo y versión de edición
(timestamp conservado como texto, incluidos microsegundos). Solo el ganador
emite; una pausa o edición posterior al barrido invalida la reclamación. La
fecha avanza antes de emitir, incluso si falla, conforme a la regla 25. Las
fechas imposibles se rechazan, los DATE se normalizan con `venceDia()` y el
cálculo de los siguientes meses usa UTC con día máximo 28. El cliente pertenece
a la organización; convertir una factura en recurrencia exige ingreso emitido.
En México se reserva consumo antes del timbrado y se libera si falla o no es
facturable. La última emisión se registra después del éxito; un fallo de entrega
conserva un aviso para reenviar desde el detalle. No se añadió cobro automático.

El link de factura explica el siguiente paso según estado, ofrece contacto por
correo/teléfono configurado en la empresa y permite actualizar el saldo.
`GET /api/i/[token]` consulta exclusivamente saldos y confirmación del abono en
el ledger de ese documento y organización, revalida token y excluye borradores.
No registra aperturas ni consulta al proveedor de pagos. `?pagado=1` inicia una
espera acotada de aproximadamente 30 segundos: no significa pago recibido.
Un abono se confirma por su PaymentIntent en `documento_pagos`, incluso si queda
saldo. Se elimina el secreto de retorno del historial del navegador y se evita
cachear o enviar como referrer las rutas de factura pública. Si la consulta falla
o termina la espera, el cliente puede actualizar, contactar o revisar opciones;
el endpoint de cobro conserva sus guardas contra intentos simultáneos. Los
errores de cobro son visibles también antes de montar el formulario de pago.
Las notas muestran su importe y estado de emisión, sin presentarse como deuda;
los documentos cancelados no ofrecen descargas que el servidor rechaza.

**Abonos y descarga pública (5 sep 2026).** Un PaymentIntent exitoso identifica
un abono, no la liquidación del documento. `/api/i/[token]/payment-intent` espera
que ese pago exista en `documento_pagos` antes de abrir el siguiente y usa una
clave de idempotencia por intento predecesor; dos abonos iguales consecutivos
son operaciones distintas. Un fallo al consultar el intento anterior o un importe
distinto durante un pago en proceso no autoriza a crear otro. La escritura del
nuevo id exige que no haya cambiado el saldo ni su predecesor.

PDF/XML del comprador se sirven en `/api/i/[token]/documents/[format]`: el token
resuelve solo ese documento y la lectura por organización vuelve a comprobarlo.
Una factura en borrador/anulada o un token revocado no descarga. La ruta interna
`/api/fiscal/documents/[id]/[format]` conserva autenticación de sesión. Ambas
comparten el render/proxy en `src/lib/fiscal/invoice-download.ts`.

`refund.updated` tiene un único despacho: conserva la sincronización de Build y
procesa el reembolso de Cord Payments en su cuenta conectada. Un fallo conserva
la posibilidad de reintentar el webhook; no se reparan eventos históricos desde
este cambio.

**Webhooks propios de factura.** `invoice.finalized`, `.sent`, `.paid`,
`.payment_failed`, `.voided`, `.marked_uncollectible`, `.overdue`, con payload
de factura vía `dispatchInvoiceEvent`. Los viejos `invoice.issued`/`.stamped` se
conservan por compatibilidad y siguen llevando payload de cotización — que era
justamente el defecto: un consumidor de facturas recibía la cotización.

## Multi-divisa y tipo de cambio — ago 2026

Cord opera en cualquier país (regla 10), y desde agosto de 2026 el dinero también:
la divisa dejó de ser un default `MXN` repartido por el código y pasó a ser un dato
que viaja con cada importe. La regla permanente es la 21; aquí vive el contrato
operativo.

**Las tres divisas, y por qué no se mezclan**

| Divisa | Dónde vive | Qué gobierna |
|---|---|---|
| De venta | `cotizaciones.base_currency` (default `orgs.moneda`) | Captura de precios, link público, correo al cliente, cobro en Stripe y divisa del documento fiscal. |
| Contable | `cotizaciones.fiscal_currency` (default `orgs.moneda`) | Los libros del negocio. Si difiere de la de venta, la factura declara el tipo de cambio y `documentos_fiscales.ledger_total` guarda el total convertido. |
| De la plataforma | `src/lib/plan-currency.ts` | Los planes de Cord. **MXN en México; EUR en ES/DE/FR; USD en los demás mercados soportados.** No hereda la divisa de la organización (`orgs.moneda` es editable libre y no puede decidir en qué cobra Cord). `orgs.billing_currency` —evidencia de una factura real— gana sobre el país, porque Cord conserva la moneda del contrato existente. Los importes por divisa viven en `src/lib/precios.ts`; en Stripe son `currency_options` sobre los MISMOS Price (scripts de opciones USD/EUR), no precios paralelos. Formato: `src/lib/plan-money.ts`, único formateador. |

**Resolución en runtime**

- Servidor: `money()`/`moneyFull()` leen la divisa del request. La fija el
  middleware desde `orgs.moneda` (dentro de `getAppGates`, sin query extra) y la
  sobrescribe el link público con la de la cotización (`getCotizacionByToken`).
- Navegador: `src/lib/money-client.ts` sobre `<body data-currency>` que publica
  `AppLayout`. El editor de cotizaciones usa la divisa del selector, no la de la
  organización: los precios se capturan en la divisa de venta.
- Stripe: `toMinorUnits()` de `src/lib/currency.ts`. JPY, CLP, KRW, VND y compañía
  no llevan decimales; KWD/BHD llevan tres y exigen último dígito 0.

**Cobros por país**

- `createConnectAccount` usa `orgs.country_code` y `orgs.moneda`. Stripe fija ambos
  al crear la cuenta y **no se pueden cambiar después**.
- La capacidad `mx_bank_transfer_payments` (SPEI) solo se solicita en México.
- SPEI se ofrece únicamente en cobros MXN; con otra divisa el vendedor cobra con
  tarjeta aunque tenga SPEI activado.
- El alta de cuenta bancaria (`connect/external-account`) sigue siendo CLABE, es
  decir México. Fuera de México responde 409 con un mensaje claro en vez de mandar
  18 dígitos a un banco que no los usa. Generalizar payouts (IBAN, routing+account,
  sort code) es trabajo pendiente, no una promesa de la UI.
- La tarifa de `src/lib/fees.ts` es la tabla publicada de México y solo aplica a
  cobros en MXN; fuera de esa divisa Cord no cobra comisión de transacción.

**Tipo de cambio**

`FXService` consulta la tasa real en cadena y **falla cerrado**: sin tasa
demostrable lanza `FXUnavailableError`, la creación de cotización responde 503 y
`/api/fx/quote` también. Las fuentes van en orden de autoridad — BCE vía
Frankfurter primero, porque es la referencia que después declara el CFDI; luego
`open.er-api.com` y `currency-api`, que sí cubren COP, CLP, PEN, ARS y el resto de
las divisas fuera del BCE. Todas publican fecha (`asOf`) y ninguna pide API key. La tasa se congela 30 días al cotizar
(`cotizaciones.fx_rate`) y tiene consumidores reales:

- el CFDI la manda como `exchange` (TipoCambio) junto con `currency`;
- `documentos_fiscales` guarda `currency`, `ledger_currency`, `fx_rate` y
  `ledger_total`;
- el PDF de la factura imprime la línea de tipo de cambio y el total convertido.

Facturar una cotización multi-divisa sin tasa utilizable no procede: devuelve un
error pidiendo recalcularla, en vez de inventar el importe contable.

Verificación: `npm run security:currency` (dentro de `npm run test:payments`).

## Stripe Connect Custom (Cobros B2B directos) — jul 2026, auditado y endurecido jul 2026

Implementación nativa ("Quiet Luxury") para que los clientes cobren sus cotizaciones directamente a su banco, sin salir de la experiencia de la app. Reemplaza el esquema viejo de cuentas Express y Hosted Checkout.

Flujo y Arquitectura:
- **Onboarding In-House (`/app/ajustes/cobros`)**:
  - Usa cuentas de tipo `custom` (`createConnectAccount` en `billing.ts`).
  - La recolección de KYC, identidad bancaria (CLABE) y estructura de la empresa se hace con el componente React `ConnectCustomOnboarding.tsx`, con **reanudación** (retoma en el primer requisito pendiente que reporta Stripe, no desde cero), **validación real de CLABE** (dígito de control, pesos 3-7-1), validación de fecha de nacimiento (mayor de 18) y polling automático (cada 6s) mientras la cuenta está "en revisión" — recarga sola al activarse `charges_enabled`.
  - El escaneo de identificación (INE/Pasaporte) y Selfie se hace *en tiempo real* en el navegador usando la cámara web (`LiveCapture.tsx`), enviando la evidencia como `multipart/form-data` (`stripeUpload`) hacia el endpoint `POST /api/billing/connect/document`. El reverso ya no pisa el frente (bug corregido: ambos se guardaban en `[front]`).
- **Checkout In-House (`/q/[token]/pay`)**:
  - Ya no hay redirección al Hosted Checkout de Stripe. Ahora se incrusta el `<PaymentElement>` (`PaymentIsland.tsx`) tematizado con Appearance API (inputs gris `#f5f5f7` sin borde, anillo navy al foco — mismo lenguaje visual que el resto de la app) y `redirect: 'if_required'` (tarjeta confirma sin salir de la página; SPEI redirige a las instrucciones de Stripe y regresa con `?pagado=1`, que el link público muestra como aviso "pago en camino").
  - La ruta `/api/q/[token]/payment-intent.ts` crea un `PaymentIntent` de método único en el servidor (header `Stripe-Account: acct_...`, fondos directo a la cuenta conectada), calcula la tarifa vigente únicamente del lado servidor y **lo reutiliza** en visitas repetidas. La comisión se aplica mediante `application_fee_amount`; las organizaciones legacy conservan tarifa cero hasta aceptar términos. La reutilización y sustitución siguen el contrato de exclusión durable descrito abajo.
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

### Exclusión durable y cambio SPEI/tarjeta

`/api/q/[token]/payment-intent.ts` usa `quote-payment-attempts.ts` y
`cotizacion_pago_intentos` para reservar una creación por organización, cobro e
intento anterior. La clave Stripe depende del UUID persistido; el hash conserva
el contrato de la petición sin guardar secretos del cliente. Dos solicitudes
con distinto método no pueden reservar esa misma generación.

- Un intento reutilizable exige coincidencia de método, importe, moneda y
  comisión, además de comprobar en SQL que el cobro sigue pendiente y vigente.
- Reemplazarlo exige verificar su cancelación con el proveedor. Un estado
  `processing`, `succeeded`, `requires_capture` o un SPEI parcialmente financiado
  bloquea el cambio. Una consulta fallida, incluido un 404, no autoriza otro pago.
- Un resultado incierto se reintenta con la misma clave; si no hay ID conocido
  después de 23 horas se exige revisión. No se genera otra clave para saltarlo.
- El ID remoto queda registrado antes de presentar el pago. SPEI se confirma
  después de vincularlo al cobro; se conserva el customer al pasar por tarjeta.
- Un desglose que dejó de coincidir con el total de una cotización sin pagos
  devuelve conflicto y requiere revisión del vendedor. La visita pública ya no
  elimina las filas de cobro para regenerarlas.
- La tabla tiene ENABLE/FORCE RLS y relación compuesta `(org_id, cobro_id)`.
  El runner `scripts/migrate-quote-payment-attempts.mjs` consulta por defecto;
  `--apply` instala solo esta migración con límites de espera y permisos
  condicionales para `cord_app`. No habilita ese rol globalmente.

La migración se aplicó con autorización a la base conectada al entorno local.
Esto no demuestra que el código esté publicado ni que esa conexión coincida con
la de producción. Las pruebas cubren fallos de red simulados, estados del pago y
SQL real en PGlite con rol restringido; falta una aceptación integrada en Stripe
TEST y comprobar el despliegue.

Límites: el Checkout alojado legacy sigue siendo un carril separado; este cambio
no unifica su concurrencia. Tampoco implementa devolución automática de fondos
transferidos tarde a una CLABE anterior ni recuperación automática de intentos
inciertos vencidos. La conciliación de comisiones de facturas directas, el rol
real de conexión, sesiones, recuperación de eventos y restauración de respaldos
siguen dentro de los pendientes de confiabilidad.

## Cobros recurrentes — igualas/retainers vía Stripe Subscriptions (jul 2026)

Feature de dinero real construido sobre Connect Custom para que las agencias/consultoras
(`casos-de-uso/agencias.astro`) puedan de verdad "cobrar la iguala automáticamente cada mes" —
antes esa era una promesa de copy sin código detrás. Detalle completo del diseño, los bugs
encontrados en auditoría y su fix en `docs/historial/billing-cobros.md` → "Cobros recurrentes reales para
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

## Cobros por términos de crédito + Anticipo/Saldo + Cuotas (jul 2026)

Evolución del cobro simple (1 cotización = 1 PaymentIntent) a **cobros por "rebanadas"**.
Fuente única de la lógica de reparto/fechas: **`src/lib/cobros.ts`**.

- **Gating por términos de crédito:** una cotización a crédito (`net<N>`, ver "Términos de pago" abajo) NO se puede
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

## Impuestos, cartera y recurrencia (ago 2026)

### Impuestos por línea

La tasa viaja con **cada concepto**, no con el documento. El catálogo por
organización (`impuestos`) declara qué cobra ese negocio; `kind`
(`consumo | retencion | exento`) es la clasificación neutra que decide la
aritmética y `tipo` es el subcódigo local que solo México usa para el CFDI.

`cotizacion_items.tax_rate` es un **snapshot al capturar** y es NULLABLE a
propósito: `null` = línea anterior al impuesto por línea (cae a la tasa de la
organización), `0` = exenta por decisión del vendedor.

Las retenciones se **restan** del total y salen de los perfiles predeterminados
del catálogo. La base sobre la que se calculan **no es siempre el subtotal**:
`impuestos.retencion_base` (`'subtotal' | 'impuesto' | 'gravado'`) lo declara por
perfil — la mayoría de retenciones son sobre subtotal, pero la ReteIVA de Colombia
es 15% **del IVA** (calcularla sobre subtotal sobrefacturaba la retención ~5.26×),
y la Retención de IVA de México es sobre lo **gravado**: un concepto exento no
traslada IVA y no entra en la base (LIVA art. 1-A). La tasa sembrada es 10.6667 %
(2/3 del 16 %), no 10.667. `RetencionApplied.baseTipo` viaja en el snapshot para que
reconstruir el cálculo después no pierda esa base. Se persisten en
`cotizaciones.retencion_total` / `retenciones_snapshot` y sus equivalentes en
`documentos_fiscales`.

Motor único: `calculateDocumentTotals()`. `calculateTotals()` queda como camino
heredado y **no se toca** — escribió los totales que hoy viven en producción.

`TAX_PRESETS` (`src/lib/countries.ts`) siembra las tasas estándar al crear la
cuenta. Brasil nace sin preset nacional (no hay tasa que sugerir). Estados
Unidos tampoco tiene preset NACIONAL, pero deja de estar vacío en cuanto la
cuenta declara su estado (`fiscal_metadata.region`): `usStateTaxPresets()`
siembra `Sales tax <ST> <n>%` + `Exempt/Resale` a partir de `US_STATE_TAX` (las
50 + DC). Un estado nuevo sin sales tax estatal (Oregon, por ejemplo) no ofrece
el preset de consumo, solo el exento — inventar una tasa 0% de "consumo" ahí
sería peor que dejarla vacía.

### Cartera: un solo lugar para los dos rieles

La vista `cuentas_por_cobrar` une cotizaciones y facturas con una forma común
(`origen`, `ref_id`, `saldo`, `vence`, `dias_vencido`). La consultan el agente de
cobranza IA, el cron de intereses y el estado de cuenta del cliente.

Una cotización con factura **abierta** aparece solo como factura: el documento
fiscal lleva el saldo real y contarla dos veces duplicaría la cartera.

El interés moratorio se calcula sobre el **saldo**, no sobre el total.

### Escalera de recordatorios

Cadencia configurable por organización (`orgs.recordatorio_etapas`, por defecto
`-7, -1, +3, +7, +14, +30`). La deduplicación vive en `documento_recordatorios`
con unicidad `(documento_id, etapa)`: se registra **antes** de mandar y se libera
si el envío falla.

### Facturas recurrentes

`documento_recurrencias` guarda qué se factura; cada emisión congela sus propios
importes, impuestos y folio. `next_run_at` avanza **antes** de emitir y el día del
mes se topa en 28.

Gate: `recurring_invoices` en **Pro**, con espejo obligatorio en
`scripts/billing-security-check.mjs`. Pausar se permite siempre, incluso sin
plan — dejar a alguien sin poder detener una emisión automática porque bajó de
plan es un cobro que no puede parar.

### Rieles de cobro por país

`src/lib/payout-fields.ts` define el formato de la cuenta de depósito por país
(CLABE, IBAN, routing+account, sort code, transit, BSB) y verifica sus dígitos de
control **en Cord, no en Stripe** — un error de Stripe no le dice nada al
vendedor (regla 14). CLABE (mod-97 propio), IBAN (mod-97) y ABA/routing number
de EE.UU. (mod-10, pesos 3-7-1) tienen checksum real; Brasil no usa IBAN pese a
haber estado alguna vez en esa lista — ninguna cuenta brasileña habría pasado el
mod-97. SPEI solo se ofrece en México y solo liquida MXN.

### Verificación

Además de `npm run test:payments`, este dominio corre `npm run security:tax`
(impuesto por línea, retenciones — incluida la base `subtotal` vs `impuesto` —,
presets por país, rieles de cobro y que la zona horaria tenga consumidor),
`npm run security:currency` (unidades mínimas por divisa, fail-closed de FX,
reparto en divisas de 0/3 decimales), `npm run security:fiscal` (los 12
mercados, orden de providers en `FiscalFactory`, NIF/NIE/CIF español, checksum
ABA) y `npm run security:verifactu` (huella y QR contra los 3 vectores
oficiales de la AEAT, estructura del SOAP contra el WSDL/XSD real).

### KYC multi-persona y depósitos — auditoría de Cord Payments (ago 2026)

Auditoría completa del carril de cobros, de la forma de alta hasta el depósito.
Lo que se encontró no era deuda menor: había un carril de dinero muerto en
producción y un modelo de KYC que no cabía en la ley de la mitad de los mercados
ofrecidos.

**El carril muerto.** `/api/i/` nunca se agregó a `PUBLIC_API_PREFIXES`, así que
el middleware respondía 401 a todo cliente sin sesión. Los dos endpoints de la
factura hospedada existían y eran correctos: no se podía pagar una factura ni se
registraba su vista. Es el caso que originó el corolario de la regla 33.

**El KYC.** Se creaba UNA sola `Person`, marcada a la fuerza como
`representative + owner + director` con 100 % de participación, y el paso
"Dueños" era un checkbox. Consecuencias: una S.L. española con tres socios al
30 % no podía completar el alta, y la atestación `owners_provided` que Cord
enviaba era factualmente falsa. Además el asistente exigía `person.id_number` en
los ocho países —verificado contra la API de requisitos del proveedor, España,
Alemania y Reino Unido **no lo piden**—, no existía camino para el documento
constitutivo (se subía con el `purpose` equivocado), y la selfie iba al campo de
comprobante de domicilio.

Hoy: `connect_personas` (proyección reconstruible; el proveedor sigue siendo la
fuente de verdad y el gate de cobros sigue leyendo `charges_enabled`), lista real
con alta/edición/baja, roles preguntados, verificación y **motivo de rechazo
traducido** por persona, documentos de empresa por las dos rutas que el proveedor
ofrece, y qué campos se piden derivado de `requirements`. Contrato en la regla 32.

**Depósitos.** Sólo existían como una línea en `audit_log`: sin tabla, sin
historial, sin conciliación y sin control de frecuencia — el artículo de soporte
decía literalmente "escríbenos". Hoy la tabla `payouts` se puebla desde el ciclo
completo de webhooks `payout.*` (created/updated/paid/failed/canceled, con un
estado terminal que no se degrada por un evento que llegó tarde),
`/app/cobros` la lee en SSR, y `payout-schedule.ts` expone frecuencia y días de
retraso con step-up.

**Tarifas por divisa.** `computeFee()` tenía escondido un `if (moneda !== 'MXN')
return 0`, así que España, Europa, Canadá, Estados Unidos y Brasil procesaban sin
comisión de plataforma como efecto colateral de un `if`. Ahora es una tabla
`FEE_SCHEDULES` por divisa con las de fuera de MXN declaradas y **apagadas**: el
hueco es visible, la UI y los docs lo dicen, y `assertFeeMargin()` impide activar
una divisa sin su costo real y su impuesto local (el 16 % es el IVA mexicano, no
una constante universal). Activar un mercado es llenar una entrada, no volver a
razonar la aritmética.

**País inmutable.** `PATCH /api/org` dejaba cambiar `country_code` con cobros
activos, aunque el país de una cuenta conectada no se puede cambiar nunca: la
organización quedaba pidiendo un IBAN para una cuenta registrada en México. Ahora
se bloquea con explicación, en el endpoint y en el selector.

Verificación: `npm run test:payments` (incluye el nuevo `security:payments`) y
`test/connect-requirements.test.ts` con fixtures reales de MX, US, ES, GB, DE y
el programa europeo `eu-2025`.

### Endurecimiento de la captura de identidad (ago 2026)

Segunda pasada sobre el mismo carril, esta vez sobre la foto. La decisión de
partida acota todo lo demás: **Stripe Identity no está disponible para
plataformas con cuenta en México** — verificado en `docs.stripe.com/identity/
use-cases`, disponibilidad general en GB/JP/US y beta en 31 países, MX en
ninguna de las dos listas. Se decidió no contratar un proveedor IDV externo ni
usar el onboarding embebido, y endurecer el carril propio.

Consecuencia que el diseño asume de frente: **Cord no hace autenticidad
documental ni prueba de vida certificada** — eso no se escribe con canvas. Lo que
sí hace el proveedor sobre lo que Cord le sube (por eso devuelve
`document_manipulated`, `document_fraudulent`, `document_photo_mismatch`). El
trabajo del carril propio es todo lo demás.

**Cuatro fallas que impedían que el flujo funcionara.**

- `Permissions-Policy: camera=()` se fijaba para toda ruta sin excepción. Es una
  allowlist vacía: deshabilita `getUserMedia` también para el documento de nivel
  superior, así que en Chromium la captura fallaba **antes** del prompt de
  permiso. El flujo del QR no podía funcionar.
- El frente cerraba la sesión y el 409 posterior hacía **inalcanzable el
  reverso** — regresión introducida al quitar la selfie. Lo necesitan INE, DNI,
  CNH, Personalausweis, CNI y las licencias de EE.UU. y Canadá: siete de los ocho
  mercados. Hoy `min_cubierto` y `cerrada` son estados distintos.
- El cron de limpieza consultaba `completed_at`, columna inexistente. Postgres
  evalúa el `WHERE` completo, así que reventaba a diario y la rama de
  `expires_at` tampoco corría: **ninguna sesión se borró jamás**.
- La cámara seguía encendida tras "Cancelar" (el cleanup capturaba el `stream`
  del primer render, todavía `null`).

**El token dejó de filtrarse.** Viaja en el path y la página no pasaba
`analyticsDisabled`, así que PostHog registraba la credencial viva en
`$current_url` y Vercel Analytics en el pathname. Hoy la ruta va con
`no-referrer`, `no-store`, `X-Robots-Tag` y sin analítica.

**Compuertas de calidad** (`capture-quality.ts`, módulo puro sin DOM para poder
probarlo): una sola pasada sobre la ROI del marco re-muestreada a 800 px —la
varianza del laplaciano depende de la escala, sin normalizar ningún umbral
significa nada entre dispositivos— que acumula luminancia, laplaciano,
histograma y croma. Aconseja casi siempre; sólo bloquea blanco y negro y
resolución bajo el piso, que son rechazo garantizado del proveedor. Ver regla 34.

**Servidor** (`upload-guard.ts`): lectura de cabeceras JPEG/PNG sin dependencias
—`sharp` traería un binario nativo y re-codificar degradaría la imagen justo
antes de que el proveedor la lea—, rangos de dimensiones (un JPEG de 1×1 pasaba),
strip de EXIF por segmentos con reinyección de un APP1 mínimo para conservar la
orientación sin el GPS, truncado anti-polyglot tras `FFD9`, y SHA-256 para el
dedupe. La prueba del EXIF cazó un off-by-two real: el valor de una entrada IFD
va en `entrada+8`, y escribirlo dos bytes antes pisa el campo `count`.

**Anti-abuso del enlace**: binding al primer dispositivo por cookie propia —atada
en el primer POST y no en el GET, porque el QR se escanea desde el navegador
embebido de WhatsApp y el usuario luego abre en Safari, otro contenedor—, tope
acumulado de intentos incrementado antes de llamar al proveedor, ventana
deslizante (30 min absolutos, 15 desde el primer uso) y `created_by` como actor
real de la auditoría, que cierra la cadena "quién pidió el enlace / quién subió".

**Evidencia** (`connect_kyc_evidencia`): un registro por documento enviado que
sobrevive al borrado de la sesión efímera y del espejo de personas. Guarda la
forma técnica y las **métricas medidas en el cliente**; el webhook escribe
después el veredicto del proveedor en la misma fila. Ese par es el único dataset
con el que los umbrales de captura se pueden calibrar con evidencia. Retención de
5 años (`RETENCION_ANIOS`), purgada por el cron ya corregido. Nunca guarda la
imagen, el `file_…`, el número del documento ni un hash perceptual.

**Guía por país** (`identity-documents.ts`): catálogo de los ocho mercados con el
nombre local del documento, si lleva reverso, y la regla transfronteriza
verificada literal (si la residencia difiere del país de la cuenta, sólo
pasaporte). El marco de la cámara pasó de 1.23:1 —que no corresponde a ningún
documento— a 1.586:1 para ID-1 y 1.42:1 para pasaporte.

**No verificable desde aquí, y anotado como tal:** el listado exacto de
documentos que el proveedor acepta por país (esa página construye el desplegable
en el cliente), el soporte real de `ImageCapture.takePhoto()` en Safari iOS y los
WebView de WhatsApp, y **todos los umbrales numéricos** — no hay dataset, por eso
sólo avisan y por eso existe la tabla de evidencia.

Verificación: `test/upload-guard.test.ts`, `test/capture-quality.test.ts`,
`test/identity-documents.test.ts` y el recorrido a mano del QR en un teléfono
real, que es lo único que decide si la cámara arranca.

## Auditoría de facturación e impuestos por país — oct 2026

Contratos que quedaron vigentes tras auditar Cord Invoicing en los 12 mercados.

- **Vocabulario del país.** Toda palabra fiscal sale del perfil del país de la
  organización (`getCountryProfile`, `taxKindLabel`, `taxIdLabel`): una cuenta en
  Francia lee TVA y SIREN / N° TVA, nunca IVA, RFC ni CFDI. El PDF se escribe en la
  lengua del emisor (es/en/fr/de/pt) y en su zona horaria.
- **Catálogo de arranque por país y territorio.** Exentas con su nombre local;
  España por territorio (Canarias siembra IGIC, Ceuta y Melilla solo exentas);
  tasas estatales de EE.UU. corregidas. Cambiar país o región resiembra un catálogo
  intacto y archiva los datos SAT al salir de México.
- **Identificador fiscal validado** con su dígito verificador en los 12 países
  (`validateTaxId`, en `@flouviahq/elements`): organización, clientes, importación,
  API, MCP, configuración asistida y cliente nuevo desde una cotización.
- **Redondeo por línea** en la divisa del documento (`roundLines`): los totales son
  la suma de importes ya redondeados, que es lo que el CFDI y Verifactu validan.
- **México.** PUE con la forma real cuando la factura nace pagada, PPD/99 si no; el
  complemento de pago (CFDI tipo P) se emite solo al registrar cada pago, con su
  estado en `provider_data.reps` y reintento desde la factura. Una emisión cuyo
  resultado no se supo queda reintentable en vez de atorada.
- **Cobros entre cotización y factura.** Lo cobrado en la cotización se traslada a
  la factura (`carryQuotePayments`, idempotente por cobro) y la cartera no cuenta
  dos veces una cotización con factura viva.
- **Anular con un cobro en vuelo** cancela el PaymentIntent y expira la preferencia
  de Mercado Pago antes de anular; si hay dinero en camino, no anula.
- **Duplicar** una cotización pasa por `createCotizacion` (conserva tasa por línea,
  divisa, precio con impuesto e anticipo; respeta permiso y tope del plan) y una
  factura usa la tasa congelada del concepto. El folio de cotización se calcula
  dentro del insert con un candado por organización.
- **Entradas inválidas se rechazan, no se corrigen en silencio:** líneas con
  cantidad o precio negativo, fechas que no existen (2026-02-31), tasas fuera de
  0–100, subtipos del SAT fuera de México.
- **Una serie por emisor.** Dos organizaciones con el mismo identificador fiscal
  (fuera de México) no pueden numerar con la misma serie: Verifactu y la autoridad
  identifican la factura por emisor + número, así que las dos `F2026-000001`
  serían la misma. `cord_serie_en_uso()` (security definer, solo devuelve un
  booleano) lo comprueba al guardar los datos fiscales (409
  `invoice_series_in_use`) y otra vez antes de reservar el folio.
- **Fecha de prestación** (`documentos_fiscales.service_date` y
  `service_date_end`; `service_date` / `service_date_end` en `/api/v1`). Una fecha
  o un periodo; el PDF la imprime como "Leistungsdatum" / "Leistungszeitraum" en
  alemán. En Alemania es mención obligatoria (§ 14 Abs. 4 Nr. 6 UStG): si queda
  vacía, el PDF dice "entspricht dem Rechnungsdatum", que es la forma admitida.
- **Canadá: impuestos compuestos.** QST (QC), PST (BC, SK) y RST (MB) se cobran
  JUNTO al 5% de GST, no en su lugar. La línea conserva UNA tasa combinada
  (14.975%, 12%, 11%) —motor, redondeo y rieles sin cambios— y el desglose la
  separa en sus impuestos en el PDF, `/i`, `/q` (también su parche en vivo), la
  impresión y el detalle de la cotización, el detalle de la factura y los tres
  editores (`src/lib/tax-components.ts`: `splitTaxBucket`, `taxBreakdownRows`,
  `taxDisplayRows`). El federal se calcula sobre la base y el provincial se queda
  con el resto, así que la suma es exactamente lo cobrado. El 7% provincial se
  llama RST si el emisor está en Manitoba y PST en el resto; en francés, TPS,
  TVQ, TVH. El catálogo se siembra por provincia (`canadaTaxPresets`, tasas de la
  CRA desde el 1 de abril de 2025): la combinada de la provincia como
  predeterminada, más el GST solo y las HST de las armonizadas para vender hacia
  ellas. La provincia es un selector (código de 2 letras; `caProvinceCode`
  reconoce el texto libre anterior) y un catálogo nacional intacto se resiembra
  al elegirla. El número de QST del emisor (`fiscal_metadata.qst_number`,
  10 dígitos + TQ + 4) se imprime junto al de GST/HST. Una tasa provincial
  SUELTA congelada antes (QST 9.975 %, PST/RST 7 %, PST 6 %) se lee como la
  combinada (`canonicalTaxRate`), en servidor y en los editores: un borrador o
  una recurrencia vieja no cae en silencio al GST solo.
- **Causa de exención por concepto (España).** El perfil exento del catálogo
  lleva su causa (`impuestos.exemption_reason`: E1–E6, N1, N2, S2) y el concepto
  la CONGELA al elegirlo, como la tasa (`cotizacion_items.exemption_reason`;
  `exemptionReason` en `line_items_snapshot`). Viaja de la cotización a la
  factura (`emit.ts`), en borradores, recurrencias, duplicados y `/api/v1`
  (`items[].exemption_reason`). `desglose.ts` la declara a la AEAT y el PDF cita
  el precepto (RD 1619/2012, art. 6.1.j). Solo se conserva en España y en una
  línea al 0 % (`exemptionReasonFor`); sin causa, el registro la deriva del
  cliente como antes. Los selectores de los editores eligen por índice
  (`taxOptionIndex`): dos perfiles al 0 % comparten tasa y solo la causa los
  distingue. Las cuentas españolas con IVA reciben Exportación (E2), Entrega
  intracomunitaria (E5), Exenta art. 20 (E1) e Inversión del sujeto pasivo (S2),
  una sola vez (`migraciones_datos`): lo que el negocio borre no vuelve.
- **Migración de despliegue** (`scripts/migrate-facturacion.mjs`, en el
  `buildCommand` antes del build): espejo de los archivos de `db/deploy/` (uno por cambio, en orden de nombre) más
  la sección de Verifactu extraída de `db/schema.sql`. Salta lo que ya existe
  —columna, restricción con la misma definición, política, trigger, RLS— para
  no tomar candados en cada despliegue. Lo verifica
  `test/migrate-facturacion.test.ts`.
- **Columnas `date` en pantalla:** `fmtCalendarDate()` (`fmt-server.ts`), nunca
  `fmtDate()`. El driver entrega un `date` como medianoche del servidor y
  `fmtDate` lo convierte a la zona del negocio: en México el detalle de la
  factura decía que vencía un día antes. Para comparar o serializar, `venceDia()`.

## Seguimiento de confiabilidad

El inventario transversal, evidencia y criterios de cierre de fase 1 viven en
[confiabilidad.md](confiabilidad.md). Distingue cambios locales, migraciones
autorizadas, precios configurados y aceptación pendiente.

### Comisiones de facturas sin cotización — implementación local

`invoice-payment-fees.ts` registra la comisión del pago directo en `comisiones`
con `cobro_id = null`, ligado por `documento_pagos`. Preserva el desglose del
intento y consulta costos/neto del cargo en su cuenta. Datos inciertos quedan en
revisión; no entran al borrador mensual. No requiere migración ni cambia tarifas.
Aceptación integrada y recuperación pendientes: [confiabilidad](confiabilidad.md).

## Tipos documentales y cuota por plan — implementación local

El contrato vigente preparado está en [Negocio y Billing](negocio-billing.md#contrato-documental-implementado-localmente).
Free permite cinco documentos comerciales al mes; Starter habilita la integración
fiscal donde esté configurada. El tipo se guarda en `documentos_fiscales` y manda
sobre el país o plan actual en emisión, descarga y anulación. Los documentos
comerciales MX/ES son proformas; sus notas son `commercial_credit_note`, no CFDI E.
La emisión desde cotizaciones delega en `finalizeInvoice` para compartir el mismo
control concurrente y contador. La recuperación de intentos inciertos requiere
revisión; no se vuelven a emitir automáticamente al pasar dos minutos.
