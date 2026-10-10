---
title: "Cómo facturar en México con Cord"
description: "CFDI 4.0 timbrado con tu CSD desde Starter: requisitos, configuración, complemento de pago automático, factura global, sustitución con motivo 01 y lo que todavía no cubre."
category: "Facturación por país"
order: 1
---

En México Cord timbra **CFDI 4.0** ante el SAT con el **Certificado de Sello Digital (CSD) de tu negocio**, desde el plan **Starter**. En **Gratis** emite **proformas** (serie `PRO`), que sirven para cobrar pero no sustituyen un CFDI.

**En resumen:**

- **Documento:** CFDI 4.0 de ingreso, CFDI de egreso (nota de crédito), complemento de pago (CFDI tipo P) y factura global a PUBLICO EN GENERAL.
- **Qué necesitas:** plan Starter o superior, tu RFC, régimen fiscal y código postal de expedición, y tu CSD (`.cer`, `.key` y su contraseña) cargado en **Ajustes › Facturación › Datos fiscales**.
- **Cuota:** 30 facturas con validez fiscal al mes en Starter, 200 en Profesional, 500 en Scale y 1,000 en Developer. Cada CFDI cuenta una vez, incluidos los complementos de pago y la factura global.
- **Complemento de pago:** automático. Una factura que no está pagada al timbrarse sale PPD con forma 99, y cada pago que registras o que entra en línea emite su complemento.
- **Anular:** **Más acciones › Anular** con el motivo del SAT (02, 03 o 04). Para corregir una factura con otra, **Sustituir CFDI** (motivo 01).
- **No cubre todavía:** IVA a tasa 0 % gravada, IEPS, complemento de Comercio Exterior, Carta Porte, nómina, el procedimiento de anticipos del SAT y el complemento automático de un cobro en otra divisa.

## Qué documento emite Cord

| Situación | Documento |
|---|---|
| Plan Gratis | Proforma con serie `PRO`. No es un CFDI. |
| Starter o superior, con CSD | CFDI 4.0 timbrado bajo tu RFC. En el editor puedes elegir **Proforma** si no quieres timbrar. |
| Nota de crédito de un CFDI | CFDI de egreso (tipo E), relación 01 con el UUID original. |
| Cobro de una factura PPD | Complemento de pago (tipo P), uno por pago. |
| Ventas cobradas sin que el cliente pidiera factura | Factura global a PUBLICO EN GENERAL (XAXX010101000). |

El tipo de documento se fija al emitir: subir de plan no convierte una proforma en CFDI y bajar de plan no convierte un CFDI en proforma.

## Qué necesitas

- **Plan Starter o superior.** La emisión fiscal integrada empieza en Starter.
- **Tu CSD.** Es distinto de la e.firma: el CSD sirve para sellar facturas. Se tramita en el portal del SAT con tu e.firma, y el SAT no cobra por emitirlo. Necesitas el archivo `.cer`, el `.key` y la contraseña de la llave.
- **Datos fiscales de tu negocio:** RFC, razón social tal como aparece en tu constancia, régimen fiscal y código postal de expedición.
- **Datos de tus clientes:** RFC, razón social, régimen fiscal, código postal fiscal y uso de CFDI. Sin ellos Cord usa valores predeterminados que pueden no coincidir con la constancia de tu cliente.

No necesitas comprar timbres por separado: el timbrado está incluido en la cuota de tu plan. Al superarla, cada CFDI adicional se cobra como excedente de tu suscripción (MXN 3.00 en Starter y Profesional, MXN 2.00 en Scale y MXN 1.50 en Developer). Consulta [Tu suscripción a Cord](/soporte/planes-suscripcion).

## Configura tu cuenta

1. Abre **Ajustes › Facturación › Datos fiscales**.
2. En **Identificación fiscal**, captura **RFC**, **Razón social**, **Régimen fiscal**, **CP de expedición** y, si quieres, el **Uso de CFDI por default**. Guarda.
3. En **Certificado de Sello Digital (CSD)**, elige tu archivo `.cer`, tu archivo `.key` y escribe la **Contraseña de la llave**. Pulsa **Subir CSD y conectar**. Cuando el estado dice **CSD cargado**, ya timbras bajo tu RFC. La contraseña solo se usa para descifrar la llave al sellar y Cord no la guarda.
4. En **Ajustes › Cotizaciones › Impuestos** revisa tus tasas. Tu cuenta nace con IVA 16 %, IVA 8 % región fronteriza, Exento y cuatro retenciones: IVA 10.6667 %, ISR 1.25 %, IVA 4 % (autotransporte) e IVA 6 % (servicios de personal).
5. En **Productos**, llena la sección **Facturación electrónica (SAT)** de cada producto con su clave de producto o servicio y su clave de unidad. Ver [Claves de producto y unidad del SAT](/soporte/catalogos-sat-claves).
6. En la ficha de cada cliente, completa sus datos fiscales. Si el cliente está en el extranjero, elige su país: Cord emite el CFDI como a un residente en el extranjero. Ver [Facturar a clientes en el extranjero](/soporte/facturas-extranjero).

## Emitir un CFDI

**Desde una cotización aprobada o pagada:** abre la cotización y pulsa **Timbrar CFDI 4.0**. Cord copia conceptos, precios, descuentos, impuestos, retenciones y el tipo de cambio congelado al cotizar.

**Sin cotización:** en **Facturas**, pulsa **Nueva factura**, elige el cliente, agrega conceptos y, en **Tipo de documento**, deja **CFDI 4.0**. En **Datos del CFDI** puedes fijar el **Uso del CFDI** y la **Forma de pago**; si los dejas en automático, el uso sale de la ficha del cliente y la forma de pago de los cobros. Pulsa **Emitir y enviar** o **Emitir sin enviar**.

**PUE o PPD lo decide Cord:** si la factura ya está pagada al timbrarse, sale **PUE** con la forma de pago real (tarjeta 04, transferencia 03, efectivo 01). Si no, sale **PPD** con forma **99**, y cada pago posterior lleva su complemento. Una factura a un cliente con RFC genérico siempre sale PUE.

## El complemento de pago

Cuando registras un pago con **Registrar pago** en una factura PPD, cuando tu cliente paga en línea o cuando un cobro de la cotización pasa a la factura, Cord timbra el complemento de pago de ese cobro y lo anota en la **Actividad** de la factura ("Complemento de pago emitido"). Es idempotente: un pago no recibe dos complementos.

Cord no lo emite solo en dos casos, y lo deja escrito en la actividad de la factura para que lo hagas con tu contador:

- **Cobro en otra divisa:** el complemento necesita el tipo de cambio oficial del día del pago.
- **Anticipo en el sentido del SAT** (el bien, el servicio o su precio no estaban determinados al cobrar): el SAT pide su procedimiento de anticipos, que Cord no emite. Revísalo con tu contador antes de timbrar.

Si un complemento no sale por un error del timbrado, la actividad dice "Complemento de pago pendiente" con el motivo. Escríbenos para reintentarlo. Ver [Facturas PPD y complementos de pago](/soporte/complementos-de-pago).

## Cómo ves el estado ante el SAT

- El detalle de la factura muestra el **Folio fiscal** (UUID) y deja **Descargar PDF** y, en **Más acciones**, **Descargar XML**.
- Una factura marcada **Documento de prueba** no la emitió el SAT: no tiene validez y el link de tu cliente no permite pagarla.
- Si el SAT rechaza el timbrado, la factura sigue en borrador con el aviso "El proveedor fiscal rechazó esta factura" y el botón **Reintentar emisión**.
- Una cancelación muestra su estado (pendiente, en verificación, aceptada o rechazada) con el botón **Consultar cancelación**.

## Anular o corregir

**Anular:** en el detalle, **Más acciones › Anular**. Cord pide el motivo del SAT:

- **02 · Comprobante emitido con errores sin relación:** el CFDI tiene un error y no lo vas a reemplazar con otro.
- **03 · No se llevó a cabo la operación.**
- **04 · Operación nominativa relacionada en una factura global:** solo en la factura global.

Una solicitud no cancela el CFDI hasta que el SAT la confirma. Si el receptor tiene que aceptarla, tiene hasta tres días hábiles; si no responde, se acepta. Mientras tanto la factura sigue vigente. Una factura con pagos aplicados no se anula: Cord propone una nota de crédito.

**Sustituir (motivo 01):** si la factura tiene un error que se corrige emitiendo otra, pulsa **Sustituir CFDI**. Cord crea un borrador con los mismos datos; al emitirlo lo relaciona con el original (relación 04), mueve a él los cobros y el saldo, y pide la cancelación del original con el motivo 01 y el UUID del sustituto. No se ofrece si la factura tiene notas de crédito vigentes o complementos de pago emitidos, porque el SAT no deja cancelar un CFDI con comprobantes relacionados vigentes. Ver [Cancelar CFDI con documentos relacionados](/soporte/cancelar-cfdi-relacionados).

**Nota de crédito:** **Más acciones › Nota de crédito** crea un CFDI de egreso por el total de la factura, relacionado con su UUID. Ver [Emitir una nota de crédito](/soporte/nota-de-credito).

## Factura global

Las ventas que cobraste sin que el cliente pidiera factura se documentan en **Facturas › Factura global**: eliges periodicidad, mes y año, Cord lista las cotizaciones cobradas sin factura propia y emite un solo CFDI a PUBLICO EN GENERAL. Ver [Facturación al Público en General y factura global](/soporte/facturar-publico-general).

## Problemas comunes

- **Mi factura salió como proforma.** Revisa tu plan (Starter o superior), que el CSD diga **CSD cargado** y que en **Tipo de documento** no hayas elegido **Proforma**.
- **Mi cliente dice que su CFDI no le sirve.** Revisa su régimen fiscal, código postal y uso de CFDI en su ficha. Si su RFC, régimen o código postal no coinciden con su constancia, sustituye el CFDI con los datos correctos.
- **El timbrado se niega con el RFC genérico.** Una factura a un cliente sin RFC usa XAXX010101000 y, como domicilio, tu código postal de expedición: captúralo en **Datos fiscales**. El nombre "PUBLICO EN GENERAL" solo se admite en la factura global.
- **Un concepto sale con la clave 01010101.** No tiene clave propia ni producto clasificado. Elige su clave en la línea antes de emitir.
- **No puedo sustituir la factura.** Tiene notas de crédito vigentes o complementos de pago. Anula primero las notas; si tiene complementos, escríbenos.

## Qué no cubre todavía

- **IVA a tasa 0 % gravada.** Un concepto al 0 % se declara **Exento** en el CFDI. Si tu operación necesita tasa 0 % (por ejemplo, exportación de servicios con IVA al 0 %), confírmalo con tu contador y emite ese CFDI fuera de Cord por ahora.
- **IEPS** y otras clasificaciones de impuesto que no sean IVA 16 %, IVA 8 % o exento.
- **Complemento de Comercio Exterior** para exportación definitiva de mercancías.
- **Carta Porte, nómina, recibos de donativos** y otros complementos. Ver [Emitir CFDI de Traslado](/soporte/cfdi-traslado).
- **Complemento automático** de un cobro en otra divisa, y el **procedimiento de anticipos** del SAT (CFDI de anticipo y su aplicación).

## Relacionados

- [Emitir CFDI 4.0 desde una cotización o desde cero](/soporte/emitir-cfdi)
- [Facturas PPD y complementos de pago](/soporte/complementos-de-pago)
- [Anular facturas y consultar cancelaciones](/soporte/cancelar-facturas)
- [Facturación por país en la documentación](https://docs.cordhq.app/docs/pagos/facturacion)
- [Certificado de Sello Digital en la documentación](https://docs.cordhq.app/docs/cuenta/csd)
