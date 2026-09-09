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

## Verifactu (España) — ago 2026

Sistema de facturación certificado que exige el RD 1007/2023 (Orden HAC/1177/2024):
cada factura genera un registro de "alta" encadenado por hash SHA-256 al registro
ANTERIOR de la misma org, y ese registro se remite en tiempo real a la AEAT — no es
una integración discrecional, es la obligación legal misma.

- **Encadenamiento síncrono, envío asíncrono.** `SpainVerifactuProvider` (registrado
  en `FiscalFactory` ANTES de `CommercialInvoiceProvider`, el orden decide qué
  provider gana) genera y persiste el registro al emitir — sin red, sin depender de
  la disponibilidad de la AEAT. El ENVÍO real corre en `/api/cron/verifactu-submit`
  (diario — el plan de Vercel de Cord no permite crons más frecuentes; VERI*FACTU
  exige remisión inmediata por ley, así que hay que subir la frecuencia en
  `vercel.json` en cuanto el plan lo permita), como el outbox de consumo de
  Stripe: una caída de la AEAT nunca bloquea la emisión de una factura.
- **Cadena append-only de verdad.** `verifactu_registros` tiene `force row level
  security` MÁS un trigger que bloquea `UPDATE`/`DELETE` sobre `huella`,
  `huella_anterior`, `payload`, `seq` y `tipo` — ni siquiera el rol de aplicación
  puede editar un registro ya firmado. La serialización de `seq` es por
  `unique(org_id, seq)` + reintento, no por advisory lock: el driver HTTP de Neon
  (`neon()`, sin sesiones interactivas) no sostendría un lock entre dos llamadas.
- **Fallo cerrado real.** Sin `orgs.rfc` (NIF) o sin la identidad del propio SIF de
  Cord (`VERIFACTU_SIF_NIF`/`VERIFACTU_SIF_NOMBRE`/`VERIFACTU_SIF_ID`, variables de
  entorno — Cord es el DESARROLLADOR del software ante la AEAT, no el titular de
  cada factura), `issueDocument()` lanza y la factura NO se marca emitida. Encadenar
  un registro con ese bloque inventado sería peor que no encadenarlo: la cadena es
  append-only para siempre.
- **Certificado por org, en Ajustes › Fiscal (solo España).** Sube un `.p12`/`.pfx`,
  parseado con `node-forge` (puro JS — el runtime de Vercel no garantiza un binario
  `openssl`) para validar la contraseña y extraer la caducidad real antes de
  aceptarlo. Se cifra con el mismo `encryptRequiredSecret()` que el CSD de
  Facturapi. Subir un certificado válido es lo ÚNICO que enciende
  `orgs.verifactu_modo='verifactu'`; mientras esté apagado, `SpainVerifactuProvider`
  degrada al mismo contrato honesto que `CommercialInvoiceProvider`
  (`regulatory_status: 'commercial_only'`).
- **Huella, QR y estructura del SOAP verificados contra fuente primaria**, no una
  reconstrucción de memoria: los 3 ejemplos oficiales de "Detalle de las
  especificaciones técnicas para la generación de la huella" (AEAT v0.1.2) coinciden
  SHA-256 byte a byte; el endpoint, namespaces y el XML de
  `RegFactuSistemaFacturacion` salen del WSDL/XSD reales descargados de la AEAT
  (`SistemaFacturacion.wsdl`, `SuministroInformacion.xsd`, `SuministroLR.xsd`,
  `RespuestaSuministro.xsd`) y del ejemplo completo §9.1.1.1 de "Descripción de los
  servicios web" (v1.0.3). Lo que NO se pudo verificar en esta sesión: el
  comportamiento real del servicio de la AEAT ante un envío real — no había
  certificado de una empresa española disponible. Confirmar contra preproducción
  (`VERIFACTU_AEAT_SANDBOX=true`) antes de depender de esto en producción.
- **Retenciones (IRPF)** viajan por el mismo motor que México (`calculateDocumentTotals`,
  ver "Impuestos por línea" abajo) y se restan en el desglose del registro AEAT.

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
  dibuja el QR de cotejo de la AEAT como una cuadrícula de rectángulos vectoriales
  (`QRCode.create()`, síncrono y puro — coherente con que todo el documento sea
  vectorial, sin incrustar un PNG), la leyenda "VERI*FACTU" y la huella completa,
  antes del bloque de "Cómo pagar". Un documento sin registro (`commercial_only`)
  no dibuja nada de esto — no hay nada que enseñar.

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
comprobante real. El motivo 01 requiere un flujo de sustitución todavía no
implementado aquí. No hay sincronización automática por webhook en este flujo.

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
`impuestos.retencion_base` (`'subtotal' | 'impuesto'`) lo declara por perfil —
la mayoría de retenciones son sobre subtotal, pero la ReteIVA de Colombia es
15% **del IVA**, no del subtotal (calcularla sobre subtotal sobrefacturaba la
retención ~5.26×). `RetencionApplied.baseTipo` viaja en el snapshot para que
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
