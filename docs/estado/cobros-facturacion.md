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

## Factura electrónica europea (Factur-X, XRechnung, Peppol) y Facturae — oct 2026

- **Qué es:** la MISMA factura que el PDF, escrita para una máquina según
  EN 16931-1. Tres formatos, para emisores establecidos en la UE:
  **Factur-X** perfil EN 16931 (PDF/A-3b con `factur-x.xml` CII incrustado como
  `Alternative`; también es ZUGFeRD 2.x EN 16931), **XRechnung 3.0** (UBL por
  defecto, CII opcional; `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0`)
  y **Peppol BIS Billing 3.0** (UBL). Código en `src/lib/fiscal/einvoice/`:
  `model.ts` arma el modelo semántico y dice qué falta, `cii.ts`/`ubl.ts`
  serializan, `facturx.ts` + `src/lib/pdf/pdfa.ts` hacen el PDF/A, `server.ts`
  lo lee de la base.
- **Sin transmisión, salvo Francia.** Cord genera, deja descargar y adjunta al
  correo. No envía por la red Peppol: decisión de producto. En Francia sí
  transmite por una plataforma autorizada cuando el negocio completa su alta
  (sección "Francia: emisión por plataforma autorizada"; apagado hasta que
  Flouvia lo active). Ajustes y el detalle de la factura lo dicen; ninguna
  pantalla ofrece un envío que no existe (regla 15).
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
- **Categorías (UNTDID 5305):** tasa > 0 → S; emisor en Canarias → L (IGIC) y
  en Ceuta o Melilla → M (IPSI) a cualquier tipo, también el 0 % (ver "IGIC e
  IPSI" abajo). Al 0 % manda la causa del
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
  **retenciones** (ver "IRPF" abajo), una causa de exención en IGIC o IPSI
  (BR-AF-10, BR-AG-10), un Leitweg-ID que no pasa su dígito de control, divisa
  con tres decimales, totales o líneas que no cuadran, O mezclada, faltantes de
  identidad. Cada formato pide además lo suyo
  (`formatProblems`): XRechnung la referencia del comprador (BR-DE-15), contacto
  con nombre, teléfono y correo (BR-DE-2/5/6/7), ciudad y CP del cliente y el
  IBAN en una factura; Peppol la referencia u orden de compra (R003), las dos
  direcciones electrónicas sin `EM` (R010/R020) y, entre empresas alemanas, el
  IBAN; Factur-X y XRechnung CII, que el IGIC no esté al 0 % (`igic_zero_cii`).
- **Datos nuevos:** Ajustes › Perfil fiscal (solo UE) guarda en
  `orgs.fiscal_metadata` `contact_name`, `contact_phone`, `einvoice_address`
  ("esquema EAS:id", validado contra la lista de BR-CL-25), `legal_registration_id`,
  `bic`, `einvoice_email` (`off`, `facturx`, `xrechnung` o, solo en España,
  `facturae`) y `facturae_firma` (solo España); en Francia `fr_regime_tva`,
  `fr_tva_debits` y `fr_nature_defaut` (sección de Francia). El cliente: `clientes.einvoice_address` y
  `buyer_reference` (la que toman sus facturas por defecto). La factura:
  `documentos_fiscales.buyer_reference`/`purchase_order` (editor, POST
  /api/facturas, update_draft, /api/v1/facturas) y `payee_account` (IBAN
  CIFRADO, terminación, BIC y titular vigentes al emitir; nunca en el snapshot,
  que la API y la página pública exponen). La unidad (BT-130) sale del producto
  en todos los países (`resolveLineUnitKey`). Despliegue:
  `db/deploy/2026-10-08-einvoice.sql`.
- **Superficies:** `/api/fiscal/documents/[id]/{facturx,xrechnung,xrechnung-cii,peppol,facturae}`
  y el mismo `[format]` en `/api/i/[token]/documents/` (409 con lo que falta).
  El detalle de la factura lista los formatos disponibles y lo que falta para
  los demás; la página pública solo enlaza los disponibles. Correo
  (`buildInvoiceAttachments`): `facturx` sustituye el PDF por el Factur-X;
  `xrechnung` agrega el XML al PDF; `facturae` agrega la Facturae (`.xsig`
  firmada o `.xml` sin firmar); `off` deja solo el PDF. Por defecto Francia
  → `facturx`, Alemania → `xrechnung`, resto → `off`: España incluida, porque
  la obligación entre empresarios (Ley 18/2022, art. 12; RD 238/2026) no es
  exigible hasta el 6-10-2027 o el 6-10-2028, viajará por la solución pública
  de la AEAT y no por correo (sección "Factura electrónica entre empresarios"),
  y el cliente no espera un XML que no pidió. Si la factura no admite
  el formato, sale el PDF de siempre: el correo nunca falla por esto.
- **PDF/A-3b:** el Factur-X es el PDF de siempre dibujado igual y ensamblado
  aparte (`createInvoicePdf({ assemble })`; sin `assemble` sale byte a byte el
  PDF anterior). Fuentes Liberation 2.1.4 (OFL, métricamente compatibles con
  Helvetica/Times) incrustadas en subconjunto con cmap (3,1) y `/Widths` del
  programa de fuente, perfil sRGB como OutputIntent, XMP con `pdfaid` y la
  extensión de Factur-X, fecha de metadatos = fecha de expedición (determinista).
  Las tablas de anchos de `writer.ts` son las de Helvetica real (regular y
  negrita por separado); `test/einvoice.test.ts` las recorre contra Liberation
  en todo WinAnsi salvo ¯ ± µ · ÷, donde Liberation copia los anchos de Arial y
  Times New Roman.
- **Verificación:** `test/einvoice.test.ts` (rápido) y
  `npm run security:einvoice` (`scripts/einvoice-check.mjs`, en CI con
  `.github/workflows/einvoice.yml`): dieciocho muestras EN 16931
  (`test/helpers/einvoice-samples.ts`, con IGIC 7 % + 3 %, IGIC con un 0 % e
  IPSI 4/10/0 %) en cada formato que admiten contra XSD UBL 2.1/CII
  D16B/Factur-X, schematron CEN 1.3.16, KoSIT 1.6.3 + XRechnung 3.0.2
  (configuración 2026-08-31), Peppol BIS 3.0.21 (reglas propias y su copia de
  CEN, vía phive-rules-peppol 4.6.3), schematron Factur-X 1.09 y veraPDF
  (Mustang 2.26); siete Facturae, sin firmar y firmadas, contra el XSD oficial
  con XMLDSig y XAdES, y la firma verificada por `javax.xml.crypto` del JDK
  (`scripts/lib/XmlDsigVerify.java`). Trece controles negativos que cada
  validador debe rechazar, entre ellos un IGIC con causa de exención (CEN y
  Peppol), un IGIC al 0 % en CII (CEN y KoSIT), un TaxTypeCode fuera de la
  lista (XSD), un importe y una hora de firma alterados después de firmar
  (XMLDSig) y un elemento XAdES inventado (XSD). Las cuatro muestras de la
  reforma francesa (`fr-ctc-*`) pasan además por el schematron BR-FR del
  flujo 2 de FNFE-MPE v1.4.0.04 con su XSD y su Factur-X 1.09.2, con cuatro
  controles negativos propios (diecisiete en total). Artefactos con URL y SHA-256 fijos en `.cache/einvoice/` o
  `EINVOICE_TOOLS_DIR`; sin Java/xmllint/red se omite con aviso salvo con
  `EINVOICE_VALIDATION_REQUIRED=1`. Avisos aceptados, no errores:
  PEPPOL-EN16931-R008 del schematron Factur-X (`ApplicableHeaderTradeDelivery`
  vacío: el XSD lo exige aunque no haya entrega), BR-DE-TMP-32 de XRechnung
  (recomienda fecha de prestación cuando el emisor no es alemán y no la
  capturó) y el aviso aritmético de Mustang en la muestra de redondeo (recalcula
  el IVA por tasa en vez de sumar el redondeado por línea; dentro de BR-CO-17).
- **Pendiente:** transmisión por Peppol Access Point y FACe (la plataforma
  autorizada francesa tiene su sección: construida y apagada), los
  códigos DIR3 de la Facturae para la administración pública española
  (`AdministrativeCentres`), Order-X y el perfil EXTENDED. El envío por la
  solución pública de la AEAT tiene su sección: construido y apagado hasta que
  la AEAT publique su servicio.

### IGIC e IPSI (Canarias, Ceuta y Melilla)

- **Categorías propias de EN 16931:** L (IGIC) y M (IPSI), con sus reglas
  BR-AF-* y BR-AG-* del schematron CEN 1.3.16. Se agrupan por tipo como S
  (BR-AF-08, BR-AG-08), con la misma tolerancia de redondeo (BR-AF-09,
  BR-AG-09), y no admiten causa de exención (BR-AF-10, BR-AG-10): un concepto
  con causa falla cerrado (`igic_exemption`, `ipsi_exemption`). El territorio
  lo decide la provincia del emisor (`spainTaxTerritory`: 35 y 38 → IGIC, 51 y
  52 → IPSI). Peppol las admite: su lista UNCL5305 es `AE E S Z G O K L M B`.
- **El NIF no es NIF-IVA.** Canarias, Ceuta y Melilla están fuera del
  territorio del IVA de la UE (Directiva 2006/112/CE, art. 6): el NIF del
  emisor va como registro fiscal (BT-32, `TaxScheme` FC en UBL, `FC` en CII) y
  como identificador legal; nunca con prefijo ES como BT-31. Por lo mismo el
  PDF no imprime la mención de operación intracomunitaria desde esos
  territorios, y rotula el impuesto como IGIC o IPSI (`taxLabelFor`).
- **IGIC al 0 %: solo UBL.** La sintaxis UBL del schematron CEN 1.3.16 pide
  `Percent >= 0` (BR-AF-05), pero la CII exige `RateApplicablePercent > 0`
  (BR-AF-05/06/07) y el schematron de Factur-X 1.09 también. Una factura con un
  concepto de IGIC al 0 % se genera como XRechnung UBL y Peppol, y para
  Factur-X y XRechnung CII falla cerrado con el motivo (`igic_zero_cii`). El
  IPSI al 0 % pasa en las dos sintaxis.

### IRPF: Facturae sí, EN 16931 no

- **EN 16931 no tiene dónde declarar una retención.** UBL la desaconseja
  (UBL-CR-513: "A UBL invoice should not include the WithholdingTaxTotal"), CII
  no la modela y BR-CO-16 fija el importe a pagar como total con impuestos
  menos anticipos. Representarla como descuento o como anticipo (BT-113)
  falsearía la base o el importe a pagar, así que Factur-X, XRechnung y Peppol
  siguen fallando cerrado con retenciones (`withholding`), y el texto dice que
  en España la Facturae sí las declara.
- **La ley española admite Facturae.** El RD 238/2026 (BOE-A-2026-7295), que
  desarrolla el art. 12 de la Ley 18/2022, acepta en su art. 7.1 las sintaxis
  UBL, CII, EDIFACT y Facturae, sin CIUS española. La Orden HAC/1028/2026
  (BOE-A-2026-20587), Anexo I, define una extensión nacional para UBL con la
  retención en `cac:WithholdingTaxTotal` (grupo BG-ES-4 "Retención aplicada",
  esquema WTH, lista L5, BT-ES-16 a 21) y el grupo RETENCIONES en
  `cac:CollectionInvoiceLine` (código RETE). Lo que no está publicado es cómo
  viajan BT-179 y BT-180 en esa línea ni su efecto en el total a pagar (la
  correspondencia UBL de la EN 16931:2026, CEN/TS 16931-3-2:2026), ni el
  schematron de la AEAT: la factura de la solución pública falla cerrado con
  retenciones (`spfe_retenciones`) y dice "descárgala como Facturae". No se
  inventa.
- **Facturae 3.2.2** (`src/lib/fiscal/einvoice/facturae.ts`), solo emisores en
  España y en euros, del mismo snapshot que el PDF: IVA (01), IPSI (02), IGIC
  (03) con su `TaxTypeCode`; el IRPF en `TaxesWithheld` (04); una retención que
  no sea de IRPF falla cerrado (`facturae_withholding_type`). Exenta y no
  sujeta como `SpecialTaxableEvent` (01 y 02) con la mención de su causa;
  inversión del sujeto pasivo con su literal legal y los dos NIF con prefijo de
  país en la operación intracomunitaria; exportación (E2) y servicio a un
  cliente de fuera de la UE como no sujeta; persona física (`Individual`) o
  jurídica (`LegalEntity`) según el NIF. Rectificativa: `InvoiceClass` OR,
  `Corrective` con la factura original, método 02 "Rectificación por
  diferencias" e importes negativos, igual que el registro R1 por diferencias
  de Verifactu. Los totales se comprueban al céntimo antes de entregarla:
  `InvoiceTotal` = base + impuestos repercutidos − retenciones, contra los del
  documento (`totals_mismatch`).
- **Firma XAdES-EPES** (`xades.ts`) según la política de firma de Facturae
  v3.1 (identificador y huellas publicados por la administración en
  facturae.gob.es): tres referencias (documento enveloped, `SignedProperties`
  y `KeyInfo`), RSA-SHA256, C14N inclusiva, `SigningTime`,
  `SigningCertificate`, `SignaturePolicyIdentifier` y rol "emisor". Solo hace
  falta para presentarla en FACe, que Cord no hace. Usa el certificado que el
  negocio subió para Verifactu, y solo si activa "Firmar la Facturae" en
  Ajustes › Perfil fiscal (`fiscal_metadata.facturae_firma`): es una firma en
  su nombre. Sin la opción o sin certificado vigente se descarga `.xml` sin
  firmar, y el detalle de la factura lo dice ("para presentarla en FACe hay
  que firmarla"). FACe además exige los códigos DIR3 del organismo, que Cord
  todavía no captura.

### Leitweg-ID

- **Dígito de control** según la Formatspezifikation Leitweg-ID v2.0.2 (KoSIT,
  28.07.2021), cap. 2: Grobadressierung de 2 a 12 dígitos que empieza por el
  Land (01–16) o el Bund (99), Feinadressierung opcional de hasta 30 letras o
  dígitos, y Prüfziffer ISO/IEC 7064 MOD 97-10 (letras A = 10 … Z = 35). El
  ejemplo de la especificación, 04011000-1234512345-06, es vector de prueba
  junto con sus pasos intermedios (`checkLeitwegId` en
  `src/lib/fiscal/einvoice/codes.ts`).
- **Dónde se comprueba:** solo donde Cord sabe que es un Leitweg-ID: una
  dirección electrónica con esquema 0204 (Ajustes y ficha del cliente) y la
  referencia del comprador de un cliente con dirección 0204 (ficha del
  cliente, editor, POST /api/facturas, update_draft y /api/v1/facturas, que
  responde 400 con el motivo en es/en). En la factura electrónica un
  Leitweg-ID inválido falla cerrado (`seller_leitweg`, `buyer_leitweg`,
  `buyer_reference_leitweg`). Un valor guardado antes que ya no pase no se
  reescribe: la ficha del cliente lo marca y pide corregirlo.

## Factura electrónica entre empresarios (solución pública de la AEAT) — oct 2026

Factura electrónica obligatoria entre empresarios y profesionales de España,
enviada por la **solución pública de facturación electrónica (SPFE)** de la
AEAT, que es gratuita (RD 238/2026, art. 11.10). Código en
`src/lib/fiscal/spfe/`. **Estado: construido y apagado.** La AEAT no ha
publicado la especificación técnica del servicio, así que el riel dice
"Próximamente" y no envía nada, aunque se encienda el interruptor.

### Norma y plazos (verificado en el BOE el 9-10-2026)

- **Ley 56/2007, art. 2 bis** (redacción del art. 12 de la Ley 18/2022):
  emitir, remitir y recibir factura electrónica entre empresarios, e informar
  de sus estados. **Ley 18/2022, disp. final octava:** efectos un año después
  del desarrollo reglamentario para quien factura más de 8 M€ y dos años
  después para el resto.
- **RD 238/2026** (BOE-A-2026-7295, BOE núm. 79 de 31-03-2026). Art. 3: aplica
  cuando el destinatario es un empresario o profesional establecido en España.
  Art. 4: no aplica a las facturas simplificadas, salvo las cualificadas.
  Art. 6.2: quien no emite por la SPFE remite una **copia fiel** en UBL.
  Art. 7.1: las sintaxis admitidas son UBL, CII, EDIFACT y Facturae. Art. 11.2:
  la SPFE solo admite UBL. Art. 12: el **destinatario** comunica el pago
  efectivo completo o el rechazo, en cuatro días naturales sin sábados,
  domingos ni festivos nacionales; el **emisor** puede comunicar el cobro o el
  impago (12.4). Disp. final cuarta: los plazos se cuentan desde la entrada en
  vigor de la Orden.
- **Orden HAC/1028/2026** (BOE-A-2026-20587, BOE núm. 247 de 5-10-2026; en
  vigor el **6-10-2026**). El Anexo I define la factura y la copia fiel en UBL
  sobre la EN 16931:2026. El Anexo II define los mensajes de estado
  (ApplicationResponse).
- **Fechas** (confirmadas también en la sede de la AEAT, noticia de 7-10-2026):
  - **6-10-2027:** volumen de operaciones superior a 8 M€. Ese año, además, la
    factura va acompañada de un PDF salvo que el cliente acepte el formato
    original (RD, disp. transitoria segunda; el PDF no va a la SPFE).
  - **6-10-2028:** el resto.
  - **6-10-2029:** los estados de las personas físicas y entidades en
    atribución de rentas de hasta 8 M€. Hasta entonces son voluntarios (disp.
    transitoria tercera).
  - **6-10-2027:** las obligaciones de las plataformas privadas (disp. final
    cuarta 2).

Las constantes, con su artículo, viven en `src/lib/fiscal/spfe/normativa.ts`.

### Qué está publicado y qué no (a 9-10-2026)

**Publicado:**

- El BOE: [Orden HAC/1028/2026](https://www.boe.es/buscar/act.php?id=BOE-A-2026-20587)
  con sus anexos, el [RD 238/2026](https://www.boe.es/buscar/act.php?id=BOE-A-2026-7295)
  y la [Ley 56/2007 consolidada](https://www.boe.es/buscar/act.php?id=BOE-A-2007-22440).
- La [página de la SPFE en la sede](https://sede.agenciatributaria.gob.es/Sede/iva/factura-electronica.html).
  Solo tiene "Cuestiones generales" y "Calendario de implantación"; no hay
  apartado de información técnica, a diferencia de Verifactu.
- Los seminarios técnicos de la AEAT en el Portal de Entidades
  Desarrolladoras: el de 19-05-2026 (`Seminario_19_05_2026_DIT.pdf`) y el de
  10-09-2026 (`DIT_FE_Seminario_10_septiembre.pdf`, bajo
  `/static_files/AEAT_Desarrolladores/EEDD/Reuniones/2026/`). El de septiembre
  describe servicios web SOAP **síncronos** con un sobre ebXML y adjuntos MTOM,
  con este catálogo: `SendInvoiceSOAP`, `CancelInvoiceSOAP`,
  `GetInvoicesSOAP`, `GetRegisteredInvoiceSOAP`, `DownloadInvoicesByIDSOAP`,
  `DownloadInvoicesByLOCSOAP`, `CustomerInvoiceEventsSOAP` y
  `SupplierInvoiceEventsSOAP`. Usa UBL 2.5 (Invoice, ApplicationResponse y
  DocumentStatus). Admite de 1 a 100 facturas por remesa, hasta 5.120 kB por
  factura y ningún adjunto binario. El emisor solo comunica SETTLEMENT,
  CANCELSETTLEMENT, DEFAULT y CANCELDEFAULT, **sin parciales**. Se puede actuar
  en nombre propio, con apoderamiento o como colaborador social; este último
  solo para remitir facturas y cambiar estados. No es una especificación: son
  diapositivas.
- [OASIS UBL 2.5](https://docs.oasis-open.org/ubl/os-UBL-2.5/), OASIS Standard
  de 12-08-2026, con el SHA-256 de cada archivo en su manifiesto.

**No publicado:** el WSDL, el sobre ebXML, las direcciones de los entornos, el
XSD de las extensiones de la AEAT, el schematron (EN 16931:2026 y reglas de la
AEAT), los ejemplos, el catálogo de errores y el entorno de pruebas. El
Portal de Entidades Desarrolladoras no tiene sección SPFE; las novedades de
octubre son el modelo 232 y los servicios comunes, y la reunión del
19-10-2026 trata las declaraciones informativas. El seminario de septiembre
dice que todo eso se publicará **antes** del entorno de pruebas, con
"fecha de referencia: octubre de 2026". La EN 16931-1:2026 y la CEN/TS
16931-3-2:2026 son normas de pago (UNE), no publicaciones abiertas.

Lo que falta está enumerado en `PENDIENTES_AEAT` (`normativa.ts`):
`transporte`, `validacion`, `calificadores`, `retenciones`,
`cabecera_mensajes` y `entorno_pruebas`. Mientras la lista no esté vacía,
`transporteDisponible()` es falso.

### Cómo envía Cord

- **Interconexión, no copia fiel.** Cord envía la factura **original**
  (`CopyIndicator` false) por la SPFE. La factura queda a disposición del
  cliente y de la Administración (Orden, arts. 3.4 y 5.2; RD, art. 11.9). Si
  el cliente eligió una plataforma privada, esa plataforma la recupera de la
  SPFE (RD, art. 8.2; Orden, art. 9). Como no hay copia fiel, tampoco hay que
  remitirla "simultáneamente".
- **En nombre propio.** El remitente se identifica con un certificado
  electrónico (Orden, art. 11.1). Cord usa el que el negocio sube para
  Verifactu (`orgs.verifactu_cert_enc`), como en Verifactu. No actúa como
  colaborador social ni como apoderado: Flouvia necesitaría para ello NIF
  español y convenio o estar inscrita en el registro de apoderamientos. Si el
  certificado es de un representante, ese representante necesita
  apoderamiento del negocio.
- **Qué facturas.** Las de emisores en España dirigidas a un cliente
  establecido en España con NIF válido, emitidas desde que el riel se activó
  para la organización (`spfe_envio_estado.activado_at`, para no enviar el
  histórico de golpe). Falla cerrado, con texto es/en, en estos casos:
  - cliente extranjero (`spfe_fuera_de_ambito`, no aplica);
  - cliente sin NIF o con domicilio incompleto (municipio, código postal y
    provincia son obligatorios en España);
  - País Vasco y Navarra (`spfe_foral`): dependen de los acuerdos con las
    Haciendas Forales (RD, disp. adicional tercera), sin publicar;
  - rectificativa de una simplificada (`spfe_simplificada`);
  - entrega intracomunitaria: K no está en la lista L4;
  - otra divisa sin el euro como divisa contable (BT-6 y BT-111);
  - **retenciones** (`spfe_retenciones`).
- **La factura (Anexo I)** sale de `assessSpfe` (`factura.ts`). Usa el mismo
  modelo EN 16931 que Factur-X, XRechnung y Peppol (`einvoice/model.ts`), del
  snapshot congelado y con los totales comprobados al céntimo. Añade:
  - BT-23 y BT-24 literales;
  - el NIF como BT-32 (TaxScheme `LOC`, `schemeID="FC"`) con BT-30, y además
    BT-31 (`ES`+NIF) en el territorio del IVA;
  - el NIF del cliente como BT-47 con la misma ruta;
  - la clave de régimen por línea (BG-32 `REGI`: 01, o 02 en exportación) con
    el impuesto en `cbc:ValueQualifier` (`IVA`, `IGIC` o `IPSI`, BT-ES-24);
  - el QR de VERI*FACTU como BG-24 `QR`, si la factura lo tiene;
  - la nota de crédito como **384** con `RECT:TIPO` (el tipo de su registro de
    Verifactu, R1 si no lo hay) y `RECT:MODALIDAD` `I`, en negativo y con la
    factura rectificada;
  - **BT-ES-2** (`cac:PrepaidPayment/cbc:PaidDate`), con `PrepaidAmount` y
    total a pagar cero, si la factura ya estaba pagada al expedirse y el pago no
    es anterior a la operación. Así el cliente no tiene que comunicar el pago
    (Orden, art. 7.4).
- **Retenciones (IRPF).** El Anexo I las define: grupo RETENCIONES con código
  RETE y BG-ES-4 en `cac:WithholdingTaxTotal`, esquema WTH y lista L5. Pero
  no fija cómo viajan BT-179 y BT-180 en `cac:CollectionInvoiceLine` ni cómo
  afectan al total a pagar. Eso depende de la correspondencia UBL de la EN
  16931:2026, que no está en abierto. Una factura con IRPF no se envía y la
  pantalla dice "descárgala como Facturae" (sintaxis admitida, RD art. 7.1).
- **Estados del emisor** (`estados.ts`). El cobro se deriva de los pagos reales
  ya conciliados por `reconcileInvoice`:
  - factura `paid` con dinero cobrado → **SETTLEMENT**, con la fecha del último
    pago y el vencimiento;
  - si se reembolsa → **CANCELSETTLEMENT**;
  - si se marca incobrable con vencimiento → **DEFAULT** con ese vencimiento;
  - si luego se cobra → **CANCELDEFAULT** y SETTLEMENT;
  - una fecha distinta → primero cancela y luego vuelve a comunicar.
  - **Sin pago parcial**: el Anexo II solo tiene el pago completo, la AEAT
    confirmó "sin parciales", y el pago parcial del RD (art. 10.2.b) es un
    estado opcional entre plataformas que no aplica a la SPFE (art. 10.7).
  Ninguna nota de crédito lleva estado de cobro. Lo que la factura ya declaró
  con BT-ES-2 no se vuelve a comunicar.
- **Baja** (CANCELINVOICE, Orden, art. 3.5). Anular en Cord una factura que la
  SPFE ya admitió la da de baja. Si nunca salió, el mensaje se descarta. Las
  rutas UBL que el Anexo I da para este mensaje
  (`cac:Response/cac:DocumentReference` y
  `cac:PartyTaxScheme/cac:PartyLegalEntity`) **no existen en UBL 2.5**,
  comprobado contra el XSD: Cord usa la forma del Anexo II, que sí es válida.
  `security:spfe` lo prueba con un control negativo.
- **Estados del cliente.** La consulta devuelve el pago o el rechazo (motivo
  L1: 01 comercial, 02 consumo particular). Se guardan, sin duplicar, en
  `spfe_estados_destinatario`, y se ven en el detalle de la factura y en
  Ajustes.

### La cola (`cola.ts`, `/api/cron/spfe`)

- **Tablas** (sección al final de `db/schema.sql`, despliegue
  `db/deploy/2026-10-09-spfe.sql`), las tres con RLS forzada:
  - `spfe_mensajes`: cada mensaje con su XML y su SHA-256, en estado
    `pendiente → admitido | rechazado | incierto | descartado`, e
    `incierto → admitido | descartado` solo consultando. Un trigger la hace
    inmutable: la identidad y el XML no cambian, los estados finales no
    vuelven y un mensaje admitido no se borra a mano;
  - `spfe_estados_destinatario`;
  - `spfe_envio_estado`: lease, pausa, próxima consulta y `activado_at`, por
    organización y entorno.
- **Idempotencia sin advisory locks.** `unique (documento_id, entorno, orden)`
  serializa los mensajes de cada factura. Un índice único parcial impide dos
  altas vivas. Se encola solo si la factura no tiene nada en vuelo.
- **Consulta antes que reenvío.** `enviado_at` se marca ANTES de enviar.
  - Si no hay respuesta, el mensaje pasa a `incierto`; también si la SPFE dice
    "duplicada" o el proceso muere tras marcar.
  - Pasados dos minutos se consulta por código único. Si la SPFE lo tiene, el
    mensaje queda `admitido`. Si no, `descartado`, y SOLO entonces se escribe
    un mensaje nuevo y se envía en la misma pasada.
  - Si la SPFE rechaza la petición entera (certificado, representación,
    servicio caído), nada se procesó: el mensaje vuelve a `pendiente` y la
    organización se pausa quince minutos.
  - Un mensaje que la SPFE rechazó no se repite solo.
- **Cron.** Cada hora desde `cord-crons.yml` y diario en `vercel.json` como
  respaldo (regla del plan Hobby, `confiabilidad.md`). El barrido entre
  organizaciones es `withSystemTx` solo sobre `orgs` (españolas con
  certificado). Todo lo demás va en `withOrgTx` (regla 30). Hoy responde
  `omitido: transporte_no_publicado` sin tocar la base ni descifrar el
  certificado.
- **Transporte** (`transporte.ts`). Es un puerto INTERNO, derivado de lo que
  la Orden describe (remitir, anular, comunicar estados, consultar), no el
  contrato de la AEAT. `transporteAeat()` devuelve null. La constante
  `TRANSPORTE_REAL_IMPLEMENTADO` se pone en true en el mismo cambio que
  implementa el adaptador contra el WSDL publicado.

### Pantallas

- **Detalle de la factura** (`SpfeEstadoFactura.astro`, emisor en España).
  Con el riel en "Próximamente" muestra las fechas y si la factura ya tiene
  lo que pide la AEAT o qué le falta, calculado en vivo sin escribir nada.
  Activo, muestra el estado del envío y su CSV, el último cobro o impago
  comunicado y lo que informó el cliente.
- **Ajustes › Datos fiscales** (`SpfeSettings.astro`, solo España).
  - El estado del riel y las fechas de la obligación.
  - Si el certificado está subido.
  - Que el IRPF va como Facturae mientras tanto.
  - Las facturas que necesitan atención: rechazos de la SPFE o del cliente.
  No tiene controles: la obligación no es una preferencia (regla 15).

### Verificación

- `test/spfe.test.ts`: piezas puras (Anexo I, fuera de ámbito, transiciones
  de estado, interruptor).
- `test/spfe-db.test.ts`: PGlite con el esquema real y una AEAT simulada que
  implementa el puerto. Cubre:
  - activación y envío idempotente;
  - respuesta perdida resuelta por consulta, y caída antes de procesar
    (consultar y luego reenviar);
  - un proceso muerto tras marcar;
  - pausa y rechazo;
  - cobro, reembolso, impago y pagada al expedirse;
  - baja, estados del cliente, lease, inmutabilidad y RLS.
- `npm run security:spfe` (`scripts/spfe-check.mjs`, en `test:payments`, sin
  red). Comprueba:
  - los 18 XSD runtime de UBL 2.5 vendorizados en `scripts/fixtures/ubl25/`
    con el SHA-256 del manifiesto de OASIS;
  - cada muestra contra `UBL-Invoice-2.5.xsd` y los cinco mensajes contra
    `UBL-ApplicationResponse-2.5.xsd`;
  - lo literal del Anexo I y la honestidad del riel;
  - cuatro controles negativos: orden, elemento inventado, mensaje sin
    remitente y la ruta del Anexo I para la baja.
  Sin `xmllint` se omite con aviso, salvo con `SPFE_XSD_REQUIRED=1`.
- **No verificable sin la AEAT ni un certificado real:** la semántica
  (schematron EN 16931:2026 y reglas de la AEAT), el XSD de las extensiones,
  el sobre ebXML y el WSDL, y cualquier envío real.

### Activación paso a paso

1. **Esperar la publicación.** Vigilar el Portal de Entidades Desarrolladoras
   (sección "Novedades") y la página de la SPFE en la sede. Falta el WSDL, los
   XSD de las extensiones, el schematron, los ejemplos y el catálogo de
   errores.
2. **Resolver `PENDIENTES_AEAT`** contra esos archivos, no contra los
   seminarios:
   - escribir `transporteAeat()` (sobre ebXML, MTOM, endpoints por entorno,
     clasificación de errores en `SpfeSinRespuestaError` /
     `SpfePeticionRechazadaError`);
   - ubicar los calificadores L7/L8/L10;
   - completar las retenciones y quitar `spfe_retenciones`;
   - fijar la cabecera del ApplicationResponse;
   - vendorizar el XSD y el schematron de la AEAT en `security:spfe`, con sus
     ejemplos como vectores.
   Vaciar la lista y poner `TRANSPORTE_REAL_IMPLEMENTADO` en true en el mismo
   cambio.
3. **Entorno de pruebas** de la AEAT. Hace falta un certificado cualificado de
   un contribuyente español: su NIF es el emisor de la prueba, y la AEAT pide
   NIF reales o de prueba. Probarlo en un Preview con `SPFE_ENABLED=true` y
   `SPFE_ENTORNO=pruebas`: emitir a un cliente español con NIF, registrar un
   pago completo, anular otra factura y comprobar que llegan el CSV, el cobro y
   la baja.
4. **Producción.** `npm run db:migrate` (o el despliegue, que aplica
   `db/deploy/2026-10-09-spfe.sql`), después `SPFE_ENTORNO=produccion` y
   `SPFE_ENABLED=true` en Production, y redesplegar, antes del 6-10-2027 para
   los clientes de más de 8 M€.

## Francia: emisión por plataforma autorizada — oct 2026

Cord **emite** por una plataforma autorizada (PA) las facturas entre empresas
establecidas en Francia, **declara** (e-reporting) las ventas a particulares y
con empresas extranjeras, y **comunica los cobros** cuando la TVA es exigible
al cobro. Construido y **apagado** (`IOPOLE_ENABLED`): la pantalla dice
"Próximamente" hasta que Flouvia complete los pasos de abajo. La plataforma es
**Iopole**; el proveedor es intercambiable (`src/lib/fiscal/transmision/`).

### Norma y calendario

- CGI art. 289 bis (factura electrónica entre empresas) y 290 A (datos de
  transacción y de pago). Fuente técnica: DGFiP, *Spécifications externes*
  v3.2 (30/04/2026): Dossier général, Annexe 1 (formato del flujo 1),
  Annexe 2 (ciclo de vida), Annexe 6 (e-reporting) y Annexe 7 v1.9 (reglas
  de gestión). Reglas de la factura: norma AFNOR XP Z12-012 v1.4,
  implementada por el schematron BR-FR del flujo 2 de FNFE-MPE v1.4.0.04
  (04/09/2026). FAQ "Tout savoir sur la facturation électronique" (ago 2026).
- Desde el **1/9/2026** toda empresa establecida en Francia debe poder
  **recibir** facturas electrónicas; grandes empresas y ETI además emiten y
  declaran. PYME y microempresas emiten y declaran desde el **1/9/2027**.
  Adelantarse es válido.

### Qué hace Cord y qué no

- **Solo emisión.** El alta en la plataforma se pide con
  `registrationStrategy: 'NONE'` (no registra ninguna dirección de recepción
  en el annuaire) y `operatorRelation.direction: 'OUTBOUND'`. Recibir exige
  mostrar las facturas recibidas y Cord no las muestra; registrar una
  dirección además la movería desde la plataforma de recepción que el negocio
  ya tenga. Ajustes lo dice: el negocio necesita su plataforma de recepción.
- **B2B** (emisor y cliente franceses, cliente con SIREN): el Factur-X
  EN 16931 de la factura se transmite (flujo 2). Sus cobros, si la TVA es
  exigible al cobro, como estado **212 "Encaissée"** (flujo 6).
- **B2BINT** (cliente establecido fuera de Francia con identificador fiscal):
  bloque **10.1** del e-reporting, uno por factura; sus cobros en el **10.2**.
- **B2C** (particular, francés o no): agregado **10.3** por día cerrado,
  divisa y categoría (TLB1 bienes, TPS1 servicios, TNT1 fuera del ámbito de la
  TVA francesa); lo cobrado del día en el **10.4**.
- **Cobros:** solo servicios, sin la opción por los débitos, ni
  autoliquidación ni fuera de ámbito (nota 119 del Dossier général). Un pago se
  reparte por tasa en proporción al importe con impuesto de cada grupo de
  servicios (G7.45); en una factura mixta solo viaja la parte de servicios.
  Una **devolución** va como 212 en negativo con motivo (P1.17 del Annexe 2);
  en el e-reporting de pagos la API no admite negativos
  (`collectedAmount: ^\d+(\.\d{1,2})?$`): la devolución queda bloqueada con su
  motivo para regularizarla en la consola de la plataforma. El 10.2 y el 10.4
  van en euros: con la `fx_rate` congelada del documento o bloqueados.

### Menciones de la factura (todas las facturas francesas, con o sin plataforma)

`src/lib/fiscal/einvoice/fr-ctc.ts` + `model.ts`, sacadas del snapshot:

- **Categoría de la operación** (BT-23, B1/S1/M1, BR-FR-08) de la naturaleza
  de cada línea: `productos.naturaleza` (`goods`/`services`, el tipo del
  producto en su modal; suscripción o licencia = servicio) o, sin producto,
  `fiscal_metadata.fr_nature_defaut`. Se congela en `line_items_snapshot`
  (`nature`). Sin ella, la factura se escribe como antes de la reforma y no se
  puede transmitir (`fr_operation_category`).
- **Opción por los débitos** (`fiscal_metadata.fr_tva_debits`, congelada como
  `issuer_snapshot.vatOnDebits`): BT-8 con código 5 en CII y 3 en UBL, solo
  con servicios (G1.43); el PDF imprime "Option pour le paiement de la taxe
  d'après les débits".
- **SIREN del cliente**: un SIRET va como identificador (BT-46, 0009) y su
  SIREN como registro legal (BT-47, 0002); la dirección electrónica del
  cliente es la de su SIREN en el annuaire (0225, BR-FR-12/21) si la capturada
  no lo es. La del emisor, la suya 0225.
- **Dirección de entrega** si difiere de la del cliente y no es solo de
  servicios (G6.16): `documentos_fiscales.delivery_address`, en el editor de
  facturas (solo Francia).
- Además: nota BAR "B2B" (BR-FR-20, fuera de la nota única de Peppol), precio
  bruto (BT-148) y neto a seis decimales. `frCtcProblems()` dice lo que impide
  transmitir: SIREN del emisor, número de factura (35 caracteres de
  `A-Za-z0-9+-_/`), tasa francesa, cuatro decimales en la cantidad, TVA en
  euros, nota de crédito que cita la factura y su fecha.

### Régimen de TVA y plazos del e-reporting

`fiscal_metadata.fr_regime_tva` (`reel_mensuel`, `reel_trimestriel`,
`simplifie`; la franquicia sale de `vat_regime`). Viaja en el alta
(`vatRegime`) y fija los plazos (`periodos.ts`, Tableau 13 del Dossier
général, columna "date limite de transmission … à la plateforme agréée"):

| Régimen | Transacciones | Pagos |
|---|---|---|
| Réel normal mensuel | décadas: 1-10 → día 20; 11-20 → último día del mes; 21-fin → día 10 siguiente | mes → día 10 siguiente |
| Réel normal trimestriel | mes → día 10 siguiente | mes → día 10 siguiente |
| Simplifié | mes → último día del mes siguiente | ídem |
| Franchise | bimestre civil → último día del mes siguiente | ídem |

Cord manda cada día en cuanto cierra (la plataforma agrupa en el expediente
del periodo); `pa_envios.periodo`/`fecha_limite` dicen el plazo y Ajustes
cuenta lo vencido.

### Proveedor de transmisión e Iopole

- **Puerto** (`proveedor.ts`): alta, consulta del alta y de la entidad, envío
  de la factura, búsqueda y su historial, cobro, y los cuatro bloques de
  e-reporting, en vocabulario de Cord. La cola, el alta y los eventos solo
  hablan con él; otra plataforma es otro adaptador (`activo.ts`).
- **Iopole** (`transmision/iopole/`): OAuth 2.0 `client_credentials` del
  realm `iopole` (token de una hora). Hosts: preproducción
  `api.ppd.iopole.fr` / `auth.preprod.iopole.fr`; producción `api.iopole.com`
  / `auth.iopole.com`. Rutas y cuerpos en `cuerpos.ts`, contra la OpenAPI del
  operador fijada en `scripts/fixtures/iopole/` (preproducción, 09/10/2026;
  la de producción solo difiere en la URL del token).
- **Errores:** red, 5xx o respuesta ilegible → incierto (se consulta); 401,
  403, 429 → nada se procesó, vuelve a la cola y la organización se pausa
  15 min; otro 4xx → rechazado, final y a la vista. El mensaje del proveedor
  queda en el log y en `respuesta`; la pantalla dice qué pasó (regla 14). El
  nombre de la plataforma solo aparece en el botón donde el negocio firma su
  mandato.
- **Webhook** `/api/fiscal/iopole/webhook` (público, exento de CSRF, GET de
  sonda): HMAC-SHA256 de `X-Timestamp\nMÉTODO\nruta?consulta\nsha256(cuerpo)`
  con `IOPOLE_WEBHOOK_SECRET`, `X-Checksum` opcional, ventana de diez
  minutos. Tres URL (`?tipo=status|onboarding|events`) registradas con
  `npm run iopole:webhook`: estados de lo EMITIDO (`filterStreamDirection:
  'OUTBOUND'`), etapas del alta y los eventos `OUTBOUND_INVOICE_NOT_DELIVERED`,
  `OUTBOUND_STATUS_INVALID/NOT_ALLOWED` y `EREPORTING_*`. La organización se
  resuelve con `cord_pa_org_de_alta`, `cord_pa_envio_de_proveedor` y
  `cord_pa_factura_por_numero` (`security definer`); responde JSON vacío y 500
  ante un fallo para que Iopole reintente. Los avisos son "al menos una vez":
  `pa_estados` es único por id de estado y una etapa vieja no retrocede el alta.

### Alta del negocio

Ajustes › Datos fiscales › Factura electrónica en Francia → "Darme de alta en
la plataforma" (`/api/fiscal/plataforma`: permiso de Ajustes, sesión reciente,
plan con facturación fiscal). Toma SIREN, régimen, correo y dirección del
perfil y, opcional, el representante legal; devuelve el enlace donde el
negocio verifica su identidad y firma el mandato. `pa_altas` guarda una viva
por organización y entorno con su etapa. La creación no es idempotente en la
API (cada POST crea otra): la fila se escribe antes, una respuesta perdida se
resuelve consultando el alta en curso por SIREN y, sin rastro en dos horas,
queda descartada; nunca se repite sola. El aviso `COMPLETED` la completa; la
cola consulta cada hora como respaldo y guarda el id de la entidad.

### La cola (`cola.ts`, `/api/cron/fiscal-plataforma`)

Horaria en `cord-crons.yml`, diaria de respaldo en `vercel.json`. Por
organización de Francia con alta completada, con lease en `pa_cola`:

1. **Descubre** sin red lo emitido desde `completada_at`. Cada envío se
   escribe antes de salir en `pa_envios` con su `clave` (un intento vivo por
   clave: `factura:<doc>`, `cobro:p:<pago>`, `tx:<día>:<divisa>:<n>`…) y su
   contenido inmutable (el PDF del Factur-X en `archivo` con su SHA-256, o el
   cuerpo neutro en `datos`). Lo que no se puede transmitir se escribe como
   **rechazado sin salir**, con su motivo: se ve una vez y no se reevalúa.
2. **Envía**, marcando `enviado_at` antes.
3. **Resuelve por consulta**: una factura incierta se busca por emisor y
   número (`/v1.1/invoice/search`); un cobro, en el historial de la factura
   (un 212 posterior al envío). Encontrado → aceptado; sin rastro en 24 h →
   descartado y la siguiente pasada escribe uno nuevo (la plataforma además
   rechaza una factura duplicada). El primer estado que llega por webhook
   también resuelve una factura incierta. El e-reporting no tiene consulta por
   envío: un incierto queda a la vista y no se repite.

Estados de `pa_envios` (trigger `cord_pa_envio_inmutable`): pendiente →
aceptado | rechazado | incierto | descartado; incierto → aceptado |
descartado; aceptado → rechazado (rechazo asíncrono del e-reporting).

### Estados de la factura y rechazos

`pa_estados` guarda cada estado (200 a 213 y 501) con su motivo, y deja un
renglón `plataforma` en la historia de la factura ("Estado 213 · Rechazada por
una plataforma: motivo", traducido al pintar). Un **210** (rechazada por el
cliente) o **213** (rechazada por una plataforma) se muestra con lo que toca:
el Dossier général pide una **anulación contable sin flujo** — Cord no
transmite la nota de crédito de una factura rechazada — y una factura nueva
con los datos correctos. Nada se corrige solo.

### Pantallas

- **Ajustes › Datos fiscales** (Francia): régimen, opción por los débitos y
  naturaleza por defecto (se guardan con el resto del perfil y alimentan las
  menciones aunque el riel esté apagado); `FrPaSettings.astro` con el alta, el
  enlace del mandato, el aviso de recepción, la cola (en cola, sin
  confirmación, vencidos, pausa) y lo que necesita atención.
- **Detalle de la factura** (`FrPaEstadoFactura.astro`): cómo la trata la
  reforma, su envío, cada estado con fecha y motivo, los cobros comunicados y,
  antes de enviarse, si tiene lo que exige la reforma o qué le falta.

### Verificación

- `npm run security:einvoice`: las cuatro muestras francesas
  (`fr-ctc-*`) contra el XSD Factur-X 1.09.2, el schematron BR-FR del flujo 2
  (todas sus reglas fatales) y el Factur-X 1.09.2 del paquete FNFE v1.4.0.04,
  con cuatro controles negativos (sin cadre, sin PMT, tasa inexistente,
  dirección del cliente fuera del annuaire). Siguen pasando KoSIT, CEN, Peppol
  y veraPDF.
- `npm run security:fr-pa` (`scripts/fr-pa-check.mjs`, en `test:payments`,
  sin red): SHA-256 de la OpenAPI fijada, URL del token, cada ruta usada en la
  especificación, cada cuerpo armado desde las muestras contra el esquema de su
  operación, cada campo leído en el esquema de su respuesta, los códigos
  interpretados en sus listas, firma del webhook y superficie (CSRF, ruta
  pública, cron). Controles negativos que el validador debe rechazar.
- `test/fr-pa-db.test.ts`: PGlite con el esquema real y una Iopole simulada a
  nivel HTTP que solo atiende las rutas de la OpenAPI fijada y valida cuerpos
  y respuestas. `test/fr-pa.test.ts`: periodos, estados, reparto, agregados,
  firma. `test/einvoice.test.ts`: las menciones.
- **Verificado contra la especificación publicada:** autenticación y hosts,
  rutas, esquemas de petición y respuesta, etapas del alta, códigos de estado,
  eventos, firma HMAC, formato de los avisos documentados.
- **No verificable sin credenciales:** el token real, un alta y su KYC, un
  envío y sus estados reales, la sintaxis de búsqueda con `seller.siren` y
  `createdDate` (campos de los ejemplos oficiales), la forma exacta de los
  eventos `OUTBOUND_*` (no publicada), la cabecera de idempotencia del
  webhook (no publicada; Cord deduplica por id), y si producción admite
  `registrationStrategy: 'NONE'` en el contrato de Flouvia.

### Activación paso a paso

**Flouvia (una vez):**

1. Crear la cuenta de operador de pruebas en **Iopole Labs**
   (https://labs.iopole.io, "create your own sandbox environment") y obtener
   `clientId`/`clientSecret` de preproducción. Confirmar con Iopole que el
   operador tiene el módulo de alta (onboarding) y que admite altas solo de
   emisión (`registrationStrategy: 'NONE'`).
2. En un Preview: `IOPOLE_ENABLED=true`, `IOPOLE_ENTORNO=preproduccion`,
   `IOPOLE_CLIENT_ID`, `IOPOLE_CLIENT_SECRET`, `IOPOLE_WEBHOOK_SECRET`
   (`openssl rand -hex 32`) y `SITE`. Registrar el webhook con
   `npm run iopole:webhook -- --dry-run` y luego sin `--dry-run`.
3. Probar de punta a punta con una organización francesa de prueba: alta y
   mandato, una factura B2B (estados 200/202…), una venta a particular (el
   día siguiente, 10.3), un cobro de servicios (212 o 10.4) y una factura a
   una empresa de otro país (10.1).
4. **Contrato de producción** con Iopole (operador, tarifas, mandato). Con las
   credenciales de producción: las mismas variables con
   `IOPOLE_ENTORNO=produccion` en Production, `npm run iopole:webhook` contra
   producción y redesplegar. La migración (`db/deploy/2026-10-09-fr-pa.sql`)
   la aplica el despliegue.

**Cada negocio:**

1. Datos fiscales: SIREN (o su TVA, que lo contiene), dirección, correo,
   **régimen de TVA**, la **opción por los débitos** si la tiene y la
   naturaleza por defecto de los conceptos sin producto; en el catálogo, el
   tipo de cada producto (bien o servicio).
2. "Darme de alta en la plataforma" y, en la página de Iopole, verificar su
   identidad y firmar el mandato.
3. Mantener su **plataforma de recepción**: Cord no recibe facturas.

### Pendiente

- La API de Iopole no tiene modificación ni borrado de e-reporting ("under
  construction"): un dato declarado no se corrige desde Cord.
- Anulación de una factura ya transmitida: Cord no la anula ante la
  plataforma; la corrección es una nota de crédito transmitida.
- Facturas con IRPF, autofacturación, multivendedor, anticipos (B2/S2/M2…) y
  el margen (TMA1): no se emiten por la plataforma.
- `/api/v1` todavía no recibe `delivery_address`.
- Recepción de facturas de proveedores: fuera de alcance a propósito.

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
(sin PAC ni intermediario), igual que Verifactu. Rieles: **ARCA
(Argentina)**, **NFS-e de Padrão Nacional (Brasil)**, **SUNAT (Perú)**, **SII
(Chile)** y **DIAN (Colombia)**: los cinco países de LatAm del set ofrecido. Un
riel nuevo se monta encima del marco sin tocar la emisión.

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
| Impresión | `representacion.ts` | `provider_data.latam.representacion`: título, letra, código, filas, QR, leyendas y pie; opcionales el recuadro del tipo de documento, el timbre 2D (módulos ya calculados) y la copia cedible. `invoice-pdf.ts` la dibuja sin saber de qué país es. |
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

### NFS-e de Padrão Nacional (Brasil)

Emisión directa ante la **Sefin Nacional** (Sistema Nacional NFS-e, API del
emisor público nacional), sin agregador. Proveedor:
`providers/BrazilNfseProvider.ts`; riel: `latam/nfse/`. Solo **servicios**: la
NF-e de productos la autoriza la SEFAZ de cada estado y Cord no la emite (la
pantalla lo dice).

- **Transporte**: mTLS con el certificado ICP-Brasil A1 del contribuyente
  (e-CNPJ o e-CPF), JSON, y los XML en GZip + base64. `POST /nfse` genera la
  NFS-e de forma síncrona; `GET /dps/{id}` devuelve la chave de la NFS-e que
  generó una DPS; `GET /nfse/{chave}`; `POST /nfse/{chave}/eventos` para la
  cancelación (`sefin.ts`, contrato del Swagger vendorizado).
- **Titular del certificado**: la extensión otherName de la ICP-Brasil
  (2.16.76.1.3.3 CNPJ, 2.16.76.1.3.1 CPF). Un e-CNPJ de la matriz firma por sus
  filiales (mismo CNPJ raíz). Al subirlo, Cord prueba el mTLS con
  `HEAD /dps/{id}` (sin efectos).
- **DPS** (`dps.ts`, leiaute 1.01): Id = `DPS` + municipio IBGE + tipo de
  inscripción + CNPJ/CPF + serie + número. La **serie** la configura el negocio
  (1 a 49999, el rango de los sistemas propios) y el **número** lo elige Cord:
  el mayor usado en esa serie (en cualquier estado) + 1, o el número inicial
  configurado. El prestador emisor no informa nombre ni dirección (E0121); la
  inscripción municipal va solo si el negocio la configuró.
- **Un servicio por NFS-e**: todos los conceptos con el código de la lista
  nacional configurado (`servicos.ts`, generado del ANEXO_I), y la descripción
  los enumera con cantidad y precio. Solo códigos con incidencia en el
  establecimiento del prestador y sin grupo de obra o evento: el lugar de
  prestación es el municipio del negocio. Los que tributan donde se prestan se
  rechazan en Ajustes y al emitir.
- **ISS**: va por dentro del precio; un concepto con impuesto agregado no se
  envía. La alícuota la pone el municipio desde su parametrización; Cord solo
  informa `pAliq` cuando la regla lo exige y tiene el dato real (ME/EPP con todo
  por el Simples e ISS retenido: la tasa de la retención).
- **Retención**: solo el ISS retenido por el tomador, cuando el documento lleva
  el perfil de retención (Ajustes › Impuestos) que el negocio marcó como ISS en
  la sección de la NFS-e. Retenciones federales (IRRF, CSLL, PIS/COFINS, INSS)
  todavía no: se rechazan antes de enviar. Si la alícuota que aplicó el
  municipio no es la del perfil, la NFS-e queda generada y la factura muestra el
  aviso de la diferencia del valor líquido.
- **Descuento de documento**: desconto incondicionado. `vServ` es el bruto
  (subtotal neto + descuento repartido por el motor de Cord) y `vDescIncond` el
  descuento; la base del ISSQN es el subtotal de Cord.
- **Simples Nacional**: situación (no optante, MEI, ME/EPP), régimen de
  apuración del ME/EPP y su porcentaje aproximado de tributos (`pTotTribSN`,
  obligatorio para ME/EPP: E0712). Los demás declaran `indTotTrib = 0`.
- **Reforma tributaria (IBS/CBS)**: el grupo `IBSCBS` de la DPS es facultativo
  en 2026 (NT 004 v2 §1.1: la regla de obligatoriedad está suspendida en
  producción y producción restringida) y Cord no lo envía, porque exige
  clasificar cada operación (cIndOp, CST, cClassTrib) con datos que no tiene.
  `security:nfse` falla el día que un esquema vendorizado lo vuelva
  obligatorio.
- **Recuperación**: sin respuesta legible (red, 500, NFS-e ilegible) el intento
  queda `incierto` y se CONSULTA `GET /dps/{id}` + `GET /nfse/{chave}`: si la
  NFS-e encapsula la DPS enviada, es nuestra; si encapsula otra, la serie la usó
  otro sistema (se descarta y se emite con el número siguiente); si no existe y
  pasaron 10 minutos, se descarta. E0014 (la DPS ya generó una NFS-e) es la
  misma consulta. Nunca se reenvía.
- **Cancelación**: evento e101101 (`anulable: true`), idempotente: antes de
  pedirlo se consulta `GET /nfse/{chave}/eventos/101101/1`. Fuera del plazo o
  del valor que el municipio permite (E0822, E0823), la anulación se rechaza con
  el motivo y la factura sigue vigente.
- **Sin nota de crédito**: la NFS-e no la tiene; una nota de crédito de una
  factura `nfse_invoice` se rechaza antes de hablar con la Sefin y el mensaje
  pide anular y emitir de nuevo.
- **Impresión**: la NT 008 v1.02 fija el DANFSe (modelo propio, solo datos del
  XML). El PDF de Cord no lo imita: es el documento comercial que acompaña a la
  NFS-e e imprime número, competencia, emisión, DPS, servicio, incidencia, base,
  alícuota e ISSQN de la Sefin, la chave completa, el QR de la consulta pública
  (`https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=`) con su leyenda
  oficial y, en homologación, "NFS-e SEM VALIDADE JURÍDICA". El XML de la NFS-e
  queda guardado en `fiscal_rail_comprobantes.respuesta`.
- **Homologación**: producción restringida; número `H-NFSE-…`, `simulado: true`,
  `livemode: false`.

**No cubierto (se rechaza antes de enviar):** exportación (tomador del
exterior) y moneda extranjera, servicios con incidencia en el lugar de
prestación o en el tomador, obras y eventos, deducciones/reducciones de base,
beneficios municipales, imunidade/não incidência, retenciones federales,
intermediario, sustitución de NFS-e (cancelar y emitir de nuevo), el grupo
IBSCBS y la NF-e de productos. Tampoco se consultan los parámetros municipales
(alícuotas, convenio): un municipio no adherido o sin convenio activo lo dice
la Sefin (E0037–E0039, E0619/E0640) y Cord lo traduce.

**Verificación:** `npm run security:nfse` (en `test:payments`) reproduce las
tablas oficiales (5570 municipios del ANEXO_A, 337 servicios del ANEXO_I),
coteja el contrato del Swagger, valida con xmllint cada DPS, el pedido de
cancelación y una NFS-e simulada contra los XSD de **producción** y de
**producción restringida** y la firma contra el xmldsig restringido 1.00,
recalcula la forma canónica con lxml y verifica la firma con openssl. El XSD de
producción 20260209 tiene un defecto conocido (`TSSerieDPS` con `^…$`, que en
XSD son literales y rechazan toda serie): el check lo parchea y avisa si el
oficial cambia. `test/nfse-db.test.ts` (PGlite + Sefin simulada) cubre emisión,
rechazo, ISS retenido, certificado rechazado, respuesta perdida, E0014, cron,
cancelación, concurrencia y RLS; `test/nfse-dps.test.ts`, las piezas puras.

### Activación de la NFS-e, paso a paso

1. El despliegue aplica `db/deploy/2026-10-08-latam-arca.sql` (las tablas
   `fiscal_rail_*` son las del marco; la NFS-e no agrega esquema).
2. **Homologación (producción restringida).** Con el e-CNPJ A1 de un
   contribuyente de un municipio adherido al emisor nacional:
   `NFSE_PRUEBA_PASSWORD='…' npm run nfse:prueba -- --p12 empresa.pfx --municipio <IBGE> --serie 900 --servico 010101 --op-simples 1 --emitir --cancelar`
   (sin certificado solo comprueba red y TLS). Prueba el mTLS, emite una NFS-e
   de R$ 1,00, la consulta por el Id de la DPS y por la chave, y la cancela.
   Nunca toca producción ni la base.
3. **De punta a punta en un Preview** con `NFSE_ENABLED=true` y
   `NFSE_ENTORNO=homologacion`: una org brasileña de prueba con plan Starter
   carga su CNPJ, sube el certificado, completa municipio, serie, Simples
   Nacional y servicio, emite una factura (con y sin descuento, y con ISS
   retenido) y la anula.
4. **Producción.** `NFSE_ENTORNO=produccion` y `NFSE_ENABLED=true` en
   Production. Cada negocio sube el certificado del entorno nuevo (se guardan
   por separado).

**Lo que no se pudo verificar sin un certificado ICP-Brasil real** (la Sefin
responde 403 a todo pedido sin certificado de cliente, incluso a su
documentación): la generación real de una NFS-e, la aceptación de la firma
RSA-SHA1 en el leiaute 1.01 (los esquemas 1.01 no fijan el algoritmo; el
xmldsig restringido 1.00 publicado fija RSA-SHA1 y es el que sigue Cord), el
formato exacto de `codigo` en `erros[]` (Cord acepta `E0014` y `0014`), el
dígito verificador de la chave (Cord no lo recalcula: la recibe) y los
mensajes vivos de cada municipio. El Swagger que fija los nombres de los campos
JSON es una captura publicada de la página de producción restringida.

### SUNAT (Perú)

SEE - Del Contribuyente: el negocio envía cada comprobante DIRECTAMENTE a
SUNAT (sin OSE ni PSE), firmado con su propio certificado digital, por
`billService/sendBill` (SOAP 1.1, WS-Security con RUC + usuario SOL
secundario). La respuesta es la CDR (constancia de recepción). Proveedor:
`providers/PeruSunatProvider.ts`; riel: `latam/sunat/`. Cobertura:

- **Comprobantes**: factura electrónica (01) y nota de crédito (07) en UBL 2.1
  (anexos 9-A de la RS 123-2022 y 9 de la RS 340-2017), serie `F###` propia
  del negocio y correlativo de Cord con `conSecuencia`. El primer número
  continúa al último emitido fuera de Cord (`ultimoNumeroFactura` /
  `ultimoNumeroNotaCredito` en Ajustes). La nota de crédito comparte la serie
  de facturas con su propia secuencia.
- **Boleta de venta (03)**: NO se emite. Exige el resumen diario y su ticket
  asíncrono; un cliente peruano sin RUC se rechaza antes de enviar con un
  mensaje que lo dice ("se le emite una boleta de venta, que Cord todavía no
  emite").
- **Receptor**: RUC con dígito verificador (catálogo 06, tipo 6). Un cliente
  del exterior es exportación: tipo 0 con su identificación tributaria,
  operación 0200 (bienes) o 0201 (servicios, con país de uso), afectación 40.
- **IGV** por concepto (catálogo 07): 18 % gravado; 0 % se declara exonerado
  (20) o inafecto (30) según lo que el negocio indica en Ajustes, nunca se
  adivina. Régimen MYPE de restaurantes y hoteles (Leyes 31556 y 32219) solo
  con el régimen declarado: 10,5 % en 2026 y 15 % en 2027; sin tasa publicada
  para el año no se acepta. Una sola tasa de IGV por factura (SUNAT 3462).
- **Descuento por concepto** (`discount`): cargo/descuento del ítem, código 00
  del catálogo 53, con factor y base; el valor unitario va bruto.
- **Monto en letras** (leyenda 1000) y **forma de pago** (RS 193-2020): contado,
  o crédito con el monto neto pendiente y la cuota con su vencimiento
  (`due_date`), descontando lo ya cobrado (`documento_pagos` y el cobro de la
  cotización).
- **Retención del IGV**: no la practica el emisor, la practica el cliente
  agente de retención. El negocio lista en Ajustes los RUC de sus clientes
  agentes (o se declara excluido): en una venta gravada al crédito por encima
  de S/ 700 la factura lleva el cargo 62 (3 % del total) y el neto pendiente
  lo descuenta. En otra moneda hace falta el tipo de cambio a soles congelado
  del documento o no se envía. Un `retencionTotal` restado del total se
  rechaza.
- **Detracciones (SPOT) y percepciones**: no se modelan. Marcarlas en Ajustes
  deja el riel sin activar (`faltantes`), así que no se emite a medias.
- **Firma**: XMLDSig enveloped, C14N inclusiva, RSA-SHA256 con el certificado
  del negocio (cifrado por org, riel y entorno). El valor resumen (DigestValue)
  va al QR y a la representación impresa. El usuario SOL y su clave viajan
  cifrados en `secretos_enc` de la misma credencial; el certificado debe estar a
  nombre del RUC del negocio.
- **Resultado**: CDR con código 0 o con observaciones (4000+) → autorizado; CDR
  o `soap:Fault` de rechazo (2000–3999) → número usado
  (`respuesta.numero_consumido`), el siguiente intento toma otro; excepción
  (0100–1999) → no informado, el número se reutiliza (en producción, un código
  ≥ 1000 se consulta antes: 1033 con el número ocupado desde otro sistema lo
  marca usado y se toma el siguiente). Los mensajes los escribe Cord
  (`sunat/errores.ts`); solo se traducen los códigos cuya respuesta real se
  capturó del servicio beta, el resto por su rango del manual.
- **Recuperación**: respuesta perdida → consulta inmediata (`getStatus` +
  `getStatusCdr` de `billConsultService`) y, si no alcanza, el cron. Nunca se
  reenvía en producción. Beta no guarda estado ni tiene consulta: ahí lo
  incierto se resuelve presentando OTRA VEZ el mismo XML firmado.
- **Baja**: `anulable: false`. La comunicación de baja solo procede para una
  factura que no se entregó al cliente, y Cord la entrega al emitirla; se
  compensa con nota de crédito: tipo 01 (anulación) si la acredita completa, 09
  (disminución en el valor) si acredita una parte.
- **Impresión y XML**: título, RUC, serie-número, adquirente, operaciones por
  afectación, IGV, total, forma de pago y cuotas, retención, constancia,
  "SON: …", valor resumen y la leyenda de representación impresa. QR al pie con
  nivel de corrección Q (RS 113-2018, anexo 6) y contenido
  `RUC|TIPO|SERIE|NUMERO|IGV|TOTAL|FECHA|TIPODOC|NUMDOC|VALOR RESUMEN`. El XML
  aceptado (exactamente el enviado) se descarga desde la factura en la app y en
  el link público (`latam/sunat/descarga.ts`).
- **Homologación**: servicio beta, usuario `<RUC>MODDATOS` si el negocio no
  cargó uno, número con prefijo `H-`, `simulado: true`, `livemode: false`.

**No cubierto:** boleta y resumen diario, comunicación de baja, nota de
débito, detracciones, percepciones, anticipos, operaciones gratuitas, ISC,
ICBPER, IVAP, varias cuotas por factura y la guía de remisión. Los cambios de
la RS 000048-2026 se postergaron al 1 de enero de 2027 (RS 000143-2026) y
están pendientes.

**Verificación:** `npm run security:sunat` (en `test:payments`) coteja las
constantes con los catálogos, el manual y los WSDL vendorizados
(`scripts/fixtures/sunat/fuentes.json`, con URL, versión y sha256 de cada
fuente), valida cada comprobante contra los XSD de UBL 2.1 de OASIS y los
sobres SOAP contra el XSD del WSDL (xmllint), compara la canonicalización
propia con la de libxml2, verifica la firma con lxml/cryptography cuando están
disponibles (también la de los XML que el servicio beta aceptó), y lee
respuestas REALES del servicio beta: aceptadas y rechazos 2335, 3280, 3462 y
3267. `test/sunat-db.test.ts` (PGlite + SUNAT simulado) cubre aceptación,
observaciones, rechazos, excepciones, número ajeno, respuesta perdida, cron,
beta, nota de crédito, concurrencia, descarga y RLS;
`test/sunat-comprobante.test.ts` las piezas puras. No se obtuvieron las
reglas de validación de SUNAT (Excel/XSL de cpe.sunat.gob.pe, detrás de un
bloqueo de Cloudflare): lo que dicen se cubrió con el validador real del
servicio beta.

### Activación de SUNAT paso a paso

1. Sin migración: SUNAT usa las tablas del marco.
2. **Beta.** `npm run sunat:prueba` firma con un certificado desechable y el
   usuario de pruebas que SUNAT publica, envía una factura y su nota de crédito
   y muestra cada CDR (comprueba red, TLS y el validador). Con el certificado y
   el usuario SOL del negocio:
   `SUNAT_PRUEBA_PASSWORD='…' SUNAT_PRUEBA_CLAVE_SOL='…' npm run sunat:prueba -- --p12 cert.p12 --ruc <RUC> --usuario <USUARIO>`.
   El entorno está fijado a beta: nunca toca producción ni la base.
3. **De punta a punta en un Preview** con `SUNAT_ENABLED=true` y
   `SUNAT_ENTORNO=homologacion`: una org peruana de prueba con plan Starter
   carga RUC y razón social, sube un certificado a nombre de su RUC, completa
   serie, concepto y afectación sin IGV, y emite una factura, una al crédito y
   una nota de crédito.
4. **Producción.** Cada negocio, en SUNAT Operaciones en Línea: se afilia como
   emisor electrónico desde sus sistemas (SEE - Del Contribuyente), registra su
   certificado digital, crea un usuario SOL secundario con el perfil de envío de
   comprobantes y reserva una serie `F###` para Cord (o indica el último número
   emitido en ella). En Cord sube el certificado de producción y el usuario SOL
   (se prueba con una consulta sin efectos). Después `SUNAT_ENTORNO=produccion`
   y `SUNAT_ENABLED=true` en Production.

**Lo que no se pudo verificar sin un emisor real:** el envío a producción, la
consulta `billConsultService` (no existe en beta; su contrato se tomó del WSDL
y del anexo del manual) y el rechazo por certificado no registrado en SOL
(beta no valida la cadena del certificado ni el usuario SOL).

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
  documento = round(neto × 19 %), una sola vez (Formato DTE v2.2, campos 107,
  111 y 112; sin tolerancia publicada). Chile calcula así en TODO Cord, no solo
  en el DTE: `taxRounding: 'document'` en su perfil (ver "IVA redondeado por
  documento" abajo), y el DTE lleva el IVA del documento tal cual. La
  comprobación contra round(neto × 19 %) queda como red de seguridad: solo
  salta con un documento guardado con otra regla, y entonces no se envía (el SII
  no lo rechazaría, pero obligaría a corregirlo con nota de crédito). Descuento de documento como `DescuentoMonto`
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

**Decisiones abiertas:** `fiscalId` = `<RUT>/T<tipo>/F<folio>`; los plazos de
2 h y 24 h; la vigencia de 60 min del token.

### IVA redondeado por documento (Chile) — oct 2026

Fuente primaria: Formato DTE v2.2 del SII (2019-07-10). Campo 107 MntNeto:
"Suma de valores total de ítems afectos - descuentos globales + recargos
globales" (con montos brutos, "se debe dividir por (1 + tasa de IVA)"); campo
111 TasaIVA "En Porcentaje"; campo 112 IVA: "Valor num.= a Monto neto *tasa
IVA"; los montos son `MontoType` (`nonNegativeInteger`, SiiTypes_v10.xsd). No
hay tolerancia publicada, y §2.2 dice que el SII no rechaza un IVA distinto de
neto × tasa, sino que obliga a corregirlo con nota de crédito o de débito.

Con el IVA redondeado por línea, una factura de varias líneas en pesos
descuadraba seguido (medido con importes al azar: 26 % con dos líneas, 35 % con
tres, 47 % con cinco) y el riel no la enviaba. Ahora:

- **Motor** (`packages/elements/src/engine.ts`, regla 23, sigue siendo ÚNICO):
  opción `taxRounding: 'line' | 'document'` junto a `roundLines`. `'line'` es el
  default y no cambia nada. `'document'`: por tasa, impuesto = round(Σ bases ×
  tasa). Por LÍNEA el impuesto de cada tasa se reparte por mayor residuo
  (unidades mínimas, empate por orden de línea): la suma por línea es
  exactamente el impuesto del documento y cada línea queda a lo más a un peso de
  round(base × tasa). Con precio con IVA incluido, la base de cada tasa es
  round(Σ importes con IVA ÷ 1,19) —el "Monto neto" con montos brutos del campo
  107— repartida igual, y el IVA es esa base × 19 % redondeado; el total puede
  quedar a un peso de la suma capturada, igual que ya pasaba por línea.
- **Fuente única por país**: `taxRounding` del perfil (`src/lib/countries.ts`,
  `taxRoundingFor`); solo Chile tiene `'document'`. `npm run security:tax`
  falla si una llamada al motor con `roundLines` no declara `taxRounding`.
- **Llamadores**: la cotización (crear y editar en `cotizaciones.ts` y
  `actions/quotes.ts`, que también sirven a la API v1 y al MCP), los tres
  editores (cotización nueva, versión y factura nueva), la factura
  (`fiscal/invoices.ts › buildLines`, también desde la API v1 y el MCP) y la nota de crédito
  (`fiscal/credit-note.ts`, que ahora calcula el impuesto con el motor), la
  factura desde una cotización (`fiscal/emit.ts`), la factura global de México
  (regla de México), el link público `/q` (SSR, vista previa del cliente en
  `QuoteCard`, aprobación parcial en `/api/q/[token]` y el stream en vivo de
  `getLiveSnapshot`) y el PDF de la cotización (`lib/quote.ts`). `/i`, el PDF de
  la factura y el DTE leen lo guardado, que ya sale de esa regla.
- **El snapshot manda.** Una cotización guarda la regla con sus totales
  (`cotizaciones.tax_rounding`, `db/deploy/2026-10-09-redondeo-impuesto.sql`;
  nulo = por línea, lo anterior) y todo recálculo —link público, aprobación
  parcial, factura desde la cotización— usa la guardada: lo que el cliente vio y
  pagó no cambia por debajo. Editar la cotización la recalcula con la regla
  vigente. Una factura emitida no se recalcula: PDF, `/i` y DTE usan su
  snapshot; una nota de crédito usa la regla del país salvo que la factura
  original no se pueda reproducir con ella (un documento anterior), en cuyo caso
  usa la de la factura.
- **Fuera de alcance, a propósito**: el Quote Builder headless de Elements
  (`createQuoteBuilder`) no pasa `roundLines` ni conoce el país —su total es una
  vista previa y el servidor devuelve el autoritativo al crear—, y los scripts de
  contrato de ARCA, NFS-e y DIAN prueban sus propios rieles con la regla por
  línea de esos países.

Verificación: `test/iva-documento.test.ts` (motor, fuente por país, 600
facturas al azar que con IVA por línea no se podían enviar, descuento, nota de
crédito parcial y documentos ya emitidos), `test/sii-db.test.ts` (emisión de
punta a punta de esos casos) y `npm run security:sii`.

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

### DIAN (Colombia)

Factura electrónica de venta con **validación previa**, Anexo Técnico 1.9
(Resolución DIAN 000165 de 2023), directo con el web service de la DIAN
(`WcfDianCustomerServices`, SOAP 1.2) como **software propio** de cada
facturador: Cord no es proveedor tecnológico ni usa uno. Proveedor:
`providers/ColombiaDianProvider.ts`; riel: `latam/dian/`. Fuentes oficiales
vendorizadas en `scripts/fixtures/dian/` (XSD UBL 2.1 + `DIAN_UBL_Structures`,
WSDL de habilitación y producción, tablas de la Caja de herramientas, política
de firma v2, dos ejemplos oficiales y respuestas del Anexo).

- **Documentos**: factura (`Invoice`, tipo 01, operación 10), nota crédito
  (`CreditNote` 91, operación 20, concepto 2 "anulación" si acredita el total y
  3 "rebaja" si no) y nota débito (92, operación 30; solo la usa el set de
  pruebas). Una factura validada no se anula (`anulable: false`): se ajusta con
  nota crédito, que lleva el adquiriente, la moneda y la tasa de la factura.
- **Numeración**: la asigna Cord dentro de la resolución configurada (prefijo,
  rango, vigencia): el siguiente es el mayor entre los intentos vivos y el
  último usado, + 1, bajo el lease de `fiscal_rail_secuencias`. Un rechazo
  libera su número. Fuera del rango o de la vigencia no se envía; Ajustes avisa
  al quedar menos de 50 números (o del 5 %) o menos de 30 días. Las notas usan
  un prefijo propio. El consecutivo de los nombres de archivo (`fv`/`nc`/`nd` +
  NIT + `000` + año + 8 hexadecimales, Anexo 6.5.7) es el número del documento
  en hexadecimal: el ejemplo del Anexo lo muestra en decimal, pero un número de
  9 cifras no cabe en 8 dígitos decimales.
- **CUFE/CUDE y QR**: SHA-384 con la clave técnica del rango (factura) o el PIN
  del software (notas); `SoftwareSecurityCode` = SHA-384(software + PIN +
  número). QR con el texto del numeral 11.7 y la URL de consulta por CUFE.
- **Firma**: XAdES-EPES enveloped en `UBLExtensions`, C14N inclusiva,
  RSA-SHA256, tres referencias (documento, KeyInfo, SignedProperties),
  `SigningCertificate` con la cadena completa (titular, subordinada y raíz:
  reglas DC25 y siguientes), política v2 con su hash y rol `supplier`. El XML
  se escribe directamente en forma canónica (`dian/xml.ts`) y se firma sin
  reparsear. El certificado se sube como .p12 o .crt + .key, con la cadena en el
  propio archivo o aparte; se reconstruye verificando cada eslabón y se exige
  firma digital + no repudio.
- **Web service**: sobre SOAP 1.2 con WS-Addressing y WS-Security según la
  WS-Policy del WSDL (`HttpsToken RequireClientCertificate="false"`,
  `Basic256Sha256Rsa15`, Timestamp, `BinarySecurityToken` y firma de
  `wsu:Timestamp` y `wsa:To` con C14N exclusiva). `SendBillSync` valida en la
  misma llamada; `GetStatus(CUFE)` resuelve lo incierto; `SendTestSetAsync` +
  `GetStatusZip` para el set de pruebas; `GetNumberingRange` trae los rangos de
  producción y guarda cifrada la clave técnica del rango configurado.
- **Recuperación**: respuesta perdida o fault que no es de seguridad →
  `incierto` y consulta inmediata por CUFE; "Regla 90, documento procesado
  anteriormente" → consulta (es el mismo CUFE, luego el mismo documento); 66/90
  en la consulta y envío viejo → descartado y número libre. Un fault de
  seguridad del remitente o el `s:Client` sin motivo con que habilitación
  responde a un certificado no avalado (fixture real del 2026-10-09) →
  rechazado, sin quedar incierto, y la pantalla lo dice.
- **Emisor**: NIT con DV, razón social y dirección salen de Identidad de
  facturación; tipo de persona, responsabilidades (casilla 53 del RUT),
  tributo, municipio DIVIPOLA (tablas 13.4.2 y 13.4.3, generadas por
  `scripts/dian-tablas.mjs`), nombre comercial, matrícula y correo de
  recepción, de la sección DIAN. El correo del emisor solo se informa si se
  configuró (regla FAJ71).
- **Adquiriente** (`clientes.dian`, ficha en el modal del cliente): sin
  identificación y del país, **consumidor final** (222222222222, R-99-PN, ZZ);
  NIT con DV correcto; cédula y otros documentos de persona (persona natural,
  tributo "No aplica"); exterior como NIT de otro país (50). Lo que no se puede
  deducir (persona natural o jurídica, responsable de IVA) se pide en la ficha;
  sin ello no se envía.
- **Impuestos**: IVA por línea con las tarifas de la tabla 13.3.11 (19, 5, 16 y
  0). Las líneas al 0 % son **exentas** (IVA 0.00) o **excluidas** (sin
  `TaxTotal`) según elige el negocio en Ajustes; sin esa decisión una factura
  con líneas al 0 % no se envía. Cualquier otra tarifa (INC, ICUI, ICA) se
  rechaza antes de enviar: Cord todavía no la informa.
- **Retenciones**: las del catálogo se informan en `WithholdingTaxTotal` solo
  cuando el tributo es inequívoco: la que se calcula sobre el IVA es ReteIVA
  (05) y la de tipo ISR es ReteRenta (06). Una retención sobre el subtotal de
  otro tipo (que podría ser ReteICA o ReteFuente) no se informa, se lista en
  `retenciones_no_informadas` y sigue restando en Cord. No entran en
  `LegalMonetaryTotal` [AT 11.9.1]: el `PayableAmount` de la DIAN es bruto +
  IVA y el total de Cord es ese importe menos las retenciones.
- **Descuentos**: el descuento de documento de Cord llega repartido por línea y
  viaja como `AllowanceCharge` de la línea (precio bruto, porcentaje, importe y
  base); `PriceAmount × cantidad − descuento = LineExtensionAmount` (FAV06) y el
  total se cuadra contra el documento de Cord al centavo.
- **Moneda**: fuera de COP se informa `PaymentExchangeRate` con la tasa a COP
  congelada del documento y la fecha en que se guardó (regla 22); si la divisa
  contable no es COP o no hay tasa, falla cerrado.
- **Conservación y entrega**: el XML firmado se guarda ANTES de enviarse
  (`dian_documentos`, inmutable por trigger) y se le une el
  ApplicationResponse al validarse. El contenedor (`AttachedDocument`, firmado
  por el emisor, con ambos en CDATA) se descarga como el XML de la factura y
  viaja en el correo como un único .zip con el PDF (AT 9.1).
- **Impresión**: título, número, fechas de generación y validación, NIT y
  responsabilidades, adquiriente, autorización de numeración (resolución,
  prefijo, rango y vigencia), forma de pago, factura ajustada y concepto, tasa a
  COP; CUFE/CUDE en el pie de todas las páginas y el QR en la primera y, a 2 cm,
  en el pie de las siguientes (`qrCadaPagina`, AT 11.7).
- **Habilitación**: número del rango de pruebas, `simulado: true` y
  `livemode: false`, leyenda "sin validez fiscal".

**No cubierto (se rechaza o se dice antes de enviar):** factura de exportación
(02), contingencia (03/04), INC, ICUI, ICA e impuestos saludables, ReteICA
informado, AIU, mandatos, propinas y cargos de documento, documento soporte,
nómina electrónica, eventos RADIAN (acuse, aceptación) y el formato del asunto
del correo de recepción (AT 9.1: `NIT;Nombre;Número;Tipo;Nombre comercial`).

**Verificación:** `npm run security:dian` (en `test:payments`) reproduce los
CUFE/CUDE de los ejemplos del Anexo (11.2, 11.4.1, 11.4.3; de la nota débito,
11.4.5, la composición: su hash impreso es una errata), coteja cada código con
las tablas oficiales, recalcula el hash de la política, comprueba endpoints,
acciones y WS-Policy de los WSDL, arma y firma factura, nota crédito, nota
débito, consumidor final, excluida, en USD y el contenedor, los valida con
xmllint contra los XSD oficiales (la única diferencia tolerada es la
enumeración de `ProviderID/@schemeID` del XSD, que contradice al Anexo y que
el ejemplo oficial `Generica.xml` también incumple), confirma con
`xmllint --c14n` que el serializador escribe la forma canónica y verifica cada
firma —y la del sobre SOAP— con el validador XMLDSig del JDK, con controles
negativos. `test/dian-db.test.ts` (PGlite + DIAN simulada que recalcula el
CUFE) cubre validación, rechazo, recuperación, cron, "procesado
anteriormente", fault de certificado, nota crédito, concurrencia, rango
agotado, contenedor, set de pruebas, trigger y RLS;
`test/dian-comprobante.test.ts` las piezas puras.

### Activación de la DIAN paso a paso

1. `npm run db:migrate` (o el despliegue, que aplica
   `db/deploy/2026-10-09-dian.sql`).
2. **Habilitación (cada facturador).** En el portal de la DIAN, "Registro y
   habilitación" › "Documentos electrónicos" › "Factura electrónica": modo de
   operación **Software propio**, con el nombre del software y un **PIN** de 5
   dígitos. La DIAN asigna el **identificador del software** y un **set de
   pruebas** (TestSetId, rango de pruebas con su prefijo, resolución, vigencia
   y clave técnica).
3. **En Cord**, con `DIAN_ENABLED=true` y `DIAN_ENTORNO=homologacion`: el
   negocio completa Identidad de facturación (NIT con DV, razón social,
   domicilio) y la sección DIAN (tipo de persona, responsabilidades, tributo,
   municipio, software, PIN, rango de pruebas con su clave técnica, prefijo de
   notas, exento/excluido, TestSetId), sube su certificado de firma con la
   cadena y pulsa "Enviar set de pruebas" con las cantidades que pide el detalle
   del set; "Ver resultado" consulta cada envío. En local, con el certificado:
   `DIAN_PRUEBA_PASSWORD=… DIAN_PRUEBA_PIN=… DIAN_PRUEBA_CLAVE_TECNICA=… npm run dian:prueba -- --p12 … --nit … --software-id … --test-set-id … --resolucion … --prefijo … --desde … --hasta … --vigente-desde … --vigente-hasta … [--enviar]`
   (sin `--enviar` solo arma y firma; sin certificado, solo sondea el servicio).
   Nunca toca producción ni la base.
4. **Producción.** Superado el set, el facturador sincroniza a producción desde
   el portal, solicita su resolución de numeración en MUISCA y la **asocia al
   software**. En Production: `DIAN_ENTORNO=produccion` y `DIAN_ENABLED=true`.
   Cada negocio sube su certificado para producción, registra la resolución
   real y pulsa "Traer de la DIAN" (`GetNumberingRange`) para guardar la clave
   técnica del rango. Los certificados y la numeración se guardan por entorno.

**Lo que no se pudo verificar sin un certificado real avalado por la ONAC:** que
la DIAN acepte la firma WS-Security del sobre y la XAdES del documento (el
ambiente de habilitación responde `s:Client` sin motivo a cualquier
certificado no avalado, con firma buena o alterada: no llega a evaluarla), la
validación real de un documento y su ApplicationResponse, el formato real de
`GetNumberingRange` en producción y la forma exacta en que la DIAN informa el
NIT del titular del certificado (regla ZE03; Cord rechaza solo un NIT distinto
declarado en el `serialNumber` del sujeto). Sí se verificó: los CUFE/CUDE
oficiales, los XSD, la forma canónica con libxml2, las firmas con el JDK, los
endpoints y el TLS de habilitación.

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
sería peor que dejarla vacía. La tasa COMBINADA por dirección del cliente
(estado + condado + ciudad + distritos) es una preferencia aparte: ver "Sales
tax de EE. UU. por dirección del cliente" abajo.

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
  Chile redondea el impuesto por documento (`taxRounding`, oct 2026; ver "IVA
  redondeado por documento (Chile)").
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

## Sales tax de EE. UU. por dirección del cliente — oct 2026

El catálogo de arranque de EE. UU. siembra solo la tasa ESTATAL mínima
(`usStateTaxPresets()`): un negocio en Los Ángeles cobraba 7.25 % donde la tasa
combinada de estado + condado + ciudad + distritos especiales es ~9.5 %. Con la
preferencia **Calcular el sales tax por la dirección del cliente** (Ajustes ›
Impuestos, `orgs.us_tax_auto`, nace apagada), la tasa de cada línea de una
cotización o factura para un cliente en EE. UU. sale de un cálculo real por su
dirección, hecho con la Tax Calculation API de Stripe **en la cuenta conectada
del negocio** (`Stripe-Account`). El negocio es quien está registrado ante cada
estado, quien recauda y quien declara: el cálculo usa SUS registros, no los de
Cord. Código: `src/lib/us-tax/` (`core.ts` puro, `stripe.ts` la única puerta a
`/v1/tax/*`, `calculo.ts` cálculo/transacciones/barrido, `config.ts` Ajustes,
`editor.ts` arranque de los editores) y `src/lib/us-tax-client.ts` (vista previa
en el navegador).

### Qué cuesta y quién lo paga

Fuente primaria (verificada el 2026-10-09):

- [stripe.com/tax/pricing](https://stripe.com/tax/pricing), integración por
  API (plan Tax Basic, pago por uso): **USD 0.50 por transacción** registrada
  "where you're registered to collect taxes", con **10 cálculos incluidos por
  transacción** y **USD 0.05 por cálculo** adicional.
- [support.stripe.com/questions/understanding-stripe-tax-pricing](https://support.stripe.com/questions/understanding-stripe-tax-pricing):
  Transaction API USD 0.50 por llamada, Calculation API USD 0.05 por llamada,
  cobro **diario** de todos los cálculos desde el saldo y reembolso a fin de
  mes de los cálculos cubiertos por transacciones (no se acumulan entre meses).
  El cálculo se cobra aunque no termine en transacción.
- [docs.stripe.com/connect/direct-charges-fee-payer-behavior](https://docs.stripe.com/connect/direct-charges-fee-payer-behavior),
  tabla "List of fee behaviors for payer values": fila **Stripe Tax** →
  `application_custom` = **Platform**. Las cuentas de Cord Payments se crean con
  `type: 'custom'` (`createConnectAccount`, `src/lib/billing.ts`), así que
  `controller.fees.payer = application_custom`: **lo paga Cord**, no el negocio.

Decisión: no se le cobra por uso al negocio (eso exigiría precios y medidores
nuevos en Stripe Billing). La capacidad es un **feature gate** desde **Starter**
(`FEATURE_MIN_PLAN.us_sales_tax`, regla 18), con el mismo criterio que la
emisión fiscal integrada; la UI lo dice como "Incluido en tu plan: no se te
cobra por cálculo". Para acotar lo que paga Cord: `strictRateLimit` por
organización en el punto donde se gasta (30/min y 300/h, `calcularYGuardar`),
otro por persona e IP en la vista previa, y el **reuso** del cálculo de la
vista previa al guardar (huella idéntica en las últimas 24 h): una cotización
típica cuesta 1–3 cálculos y una transacción. Con un plan que ya no la incluye
(downgrade) la preferencia se conserva pero queda inoperante: los documentos
usan el catálogo manual (regla 17).

### Configuración (Ajustes › Impuestos)

`PUT /api/impuestos/us-config` (`saveUsTaxConfig`): domicilio completo del
negocio (`orgs.us_tax_origen`, calle + ciudad + estado + ZIP), qué vende
(`orgs.us_tax_codigo`, lista cerrada de cuatro product tax codes generales:
`txcd_20030000` servicios, `txcd_99999999` bienes físicos, `txcd_10103001` SaaS
empresarial, `txcd_10000000` servicios digitales) y los estados donde recauda
(`us_tax_registros`). Se sincroniza con la Tax Settings API (`head_office`,
`defaults[tax_code]`) y la Registrations API (`state_sales_tax`, `active_from:
now`), todo con `Stripe-Account`:

- Un registro creado allá y no anotado aquí (caída a medio guardado) se
  **adopta** al siguiente guardado (se listan los activos) en vez de
  duplicarse; un alta lleva `Idempotency-Key = us-tax-reg:<fila local>`.
- Un estado que se quita se da de **baja** (`baja_at`) y se **vence** allá
  (`expires_at=now`): los registros no se borran, ni en Cord ni en Stripe.
- La preferencia solo queda encendida con plan, cuenta de cobros, domicilio
  completo, al menos un estado y `status = active` en la cuenta
  (`us_tax_estado`). Si falta algo responde qué y la apaga (regla 15).
- Requiere la cuenta de Cord Payments (`orgs.stripe_account_id`): sin ella el
  cálculo no tiene dónde vivir y se dice "actívala en Ajustes › Cobros".

### El documento

1. `prepareUsTaxForDocument()` saca las bases de cada línea con el motor único
   (tasa 0, ya con el descuento de documento repartido, en la divisa de venta)
   y arma la **huella** (sha256 de divisa, destino, exención, impuesto
   incluido, clasificación e importes). Reusa un cálculo LIBRE (la vista
   previa) o de ESTA misma venta con esa huella en las últimas 24 h; si no,
   calcula (`expand[]=line_items.data.tax_breakdown`, `reference = L<i>`, una
   línea en 0 no se manda) y guarda la fila en `us_tax_calculos`.
2. El llamador pasa el id a `taxCatalogFor(orgId, { usTaxCalculoId })`, que lee
   la fila **de la organización y vigente** (`expires_at > now()`) y da a cada
   línea su tasa y su desglose: la `tax_rate` que mande el navegador se ignora.
   Un id de otra organización, vencido o que no corresponde al documento es
   `calculo_vencido`. Lo usan `createCotizacion`, `update_draft`/`send`/`resend`
   (`actions/quotes.ts`) y los borradores de factura (`createInvoiceDraft`,
   `updateInvoiceDraft`); la factura que sale de una cotización (`emit.ts`)
   hereda su cálculo y su desglose porque es la MISMA venta.
3. La línea congela la **tasa efectiva** (`cotizacion_items.tax_rate` /
   `taxRate` del snapshot, fracción con precisión completa = impuesto ÷ base
   del cálculo) y el desglose por jurisdicción
   (`cotizacion_items.tax_breakdown` / `taxBreakdown` del snapshot:
   `{ estado, estadoNombre, motivo, componentes: [{ nombre, nivel, tasa,
   impuesto }], certificado? }`).
4. El PDF, `/q`, `/i`, la impresión, las vistas del vendedor y los dos
   editores imprimen un renglón por jurisdicción ("California 6%", "Los Angeles
   County 0.25%"…) con `taxJurisdictionRows()` / `taxBreakdownRows({ lineas })`
   / `taxDisplayRows()` (`src/lib/tax-components.ts`, constructor único), la
   columna de la línea dice la tasa legal combinada (`lineTaxPct`) y
   `taxNotes()` imprime el 0 % legítimo: "Sin obligación de recaudar sales tax
   en Texas", "Cliente exento de sales tax (certificado de exención …)".

**Conciliación con el motor único.** El proveedor redondea el impuesto POR
JURISDICCIÓN (6 % + 0.25 % + 3.25 % de 70.00 = 4.20 + 0.18 + 2.28 = 6.66, no
el 6.65 del 9.5 % sobre la suma). La línea no guarda el 9.5 % legal sino la
tasa efectiva 6.66 / 70.00: con ella `calculateDocumentTotals()` —el mismo
motor, el mismo redondeo por línea (`taxRounding = 'line'` en EE. UU.)—
reproduce **al centavo** el impuesto del cálculo, también con precio con
impuesto incluido (tasa = impuesto ÷ (bruto − impuesto)). El total que el
documento cobra y el que se reporta son el mismo número, sin un segundo motor.
Si después el documento cambia (aprobación parcial, descuento por monto), el
total legal es el que el documento cobra: al registrar la venta se recalcula
con lo cobrado y solo se registra si el impuesto coincide al centavo; si no,
queda `no_concilia` para revisión y nunca se reporta una cifra distinta.

**Fallo cerrado** (`UsTaxError`, regla 22; mensajes en es/en sin nombrar al
proveedor, regla 14): sin cuenta de cobros, domicilio incompleto, sin estados,
configuración pendiente, cliente sin estado o ZIP de 5 dígitos (calle y ciudad
se mandan si están y mejoran la precisión), dirección que no se ubica
(`customer_tax_location_invalid`), cliente exento sin certificado o con el
certificado vencido, más de 100 conceptos, proveedor caído o límite de uso. La
cotización o factura **no se guarda** y responde el motivo
(`code: us_tax_<motivo>`); el editor lo muestra en el resumen antes de
guardar. Un estado donde el negocio NO está registrado no es error: el
proveedor responde `not_collecting`, la línea lleva 0 % con `motivo:
'sin_registro'`. Si el negocio SÍ dice recaudar en ese estado y el proveedor
responde `not_collecting`, la configuración está desincronizada y se falla
(`registro_desincronizado`). Un borrador SIN cliente usa el catálogo; enviarlo
exige cliente.

**Cliente exento.** `clientes.tax_exempt` + `clientes.tax_exempt_cert`
(`{ numero, estado, vence }`), en la ficha del cliente (sección "Exención de
sales tax", solo para negocios de EE. UU.). Sin número de certificado no se
guarda la exención; con el certificado vencido el documento falla cerrado. Al
calcular viaja como `customer_details[taxability_override]=customer_exempt` y
el documento cita el certificado.

### La venta registrada (Tax Transactions)

`recordUsTaxTransaction()` crea la transacción con
`/v1/tax/transactions/create_from_calculation` (los cálculos vencen a los 90
días), **una vez por cálculo**: `transaccion_ref = cord:<id del cálculo>` es
único (índice parcial) y se reserva ANTES de llamar; la clave de idempotencia
es la misma referencia y el proveedor rechaza una `reference` repetida. Se
dispara al emitir la factura (`finalizeReservedInvoice`, también la que viene
de una cotización) y el cron `/api/cron/us-tax` (cada hora en
`cord-crons.yml`, diario en `vercel.json`) recoge las cotizaciones cobradas por
cualquier riel y los reintentos. `us_tax_calculos.venta` dice qué venta
reclamó el cálculo: una cotización y su factura comparten cálculo y
transacción; dos documentos idénticos del mismo día que compartieron la vista
previa son dos ventas y el segundo se registra con un cálculo propio. Anular
una factura revierte la venta completa (`create_reversal`, `mode=full`,
referencia `cord:<id>:anulada`), salvo que su cálculo respalde una cotización
ya cobrada.

Los reportes para declarar viven en la cuenta del negocio; como es Custom (sin
Dashboard), la plataforma los descarga con la Report API
(`connected_account_tax.transactions.itemized.2`). Cord todavía no los expone.

### Verificación

`test/us-tax-core.test.ts` (tasa efectiva vs motor con miles de importes,
desglose, notas, errores) y `test/us-tax-db.test.ts` (PGlite + proveedor
simulado: reuso, aislamiento por organización, fallo cerrado, exención,
transacción única, conciliación, dos ventas, barrido, reverso y la
sincronización de Ajustes). `npm run security:us-tax`
(`scripts/us-tax-check.mjs`, encadenado en `test:payments`): una sola puerta a
`/v1/tax/*`, idempotencia en cada creación, límite antes del cálculo, plan
efectivo, `taxCatalogFor` acotado a la organización y vigente, rate limit y
sin mensajes crudos en las rutas, la UI sin el nombre del proveedor, RLS
forzada y grants en esquema y migración, el cron registrado y la aritmética.
Esquema: sección final de `db/schema.sql` (`-- END us-tax`) con su espejo
`db/deploy/2026-10-09-us-tax.sql`.

### Pendiente

- **Sin llaves reales no se probó contra Stripe**: la forma de las llamadas y
  respuestas sale de la referencia de la API (docs.stripe.com, 2026-10-09) y
  está cubierta con un proveedor simulado. Antes de anunciarlo: probar en modo
  test con una cuenta Custom de EE. UU. (registro en CA, una dirección de Los
  Ángeles, un cliente en TX y uno exento) y confirmar que la cuenta de la
  plataforma tiene Stripe Tax habilitado para cuentas conectadas.
- Notas de crédito de una factura con sales tax por dirección: copian el
  desglose para imprimirlo, pero no crean el reverso PARCIAL de la
  transacción.
- Clasificación por producto (tax code por concepto): hoy una por negocio.
- `/api/v1` y el MCP no exponen la exención del cliente ni el desglose por
  jurisdicción (los documentos que crean sí calculan por dirección).
- Exponer los reportes de transacciones al negocio (Report API).

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
