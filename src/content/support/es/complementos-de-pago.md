---
title: "Facturas PPD y complementos de pago (REP)"
description: "Cómo decide Cord entre PUE y PPD, cuándo emite solo el complemento de pago de cada cobro, los casos que deja para tu contador y cómo ver su estado."
category: "Facturación"
order: 3
---

Esto aplica a organizaciones en **México**. Cuando un CFDI se emite con método **PPD** (pago en parcialidades o diferido), el SAT exige un **complemento de pago** (CFDI tipo P, también llamado REP o recibo electrónico de pago) por cada cobro que recibas después, a más tardar el día 5 del mes siguiente. **Cord lo emite solo** al registrar cada pago.

**En resumen:**

- **PUE o PPD lo decide Cord al timbrar:** si la factura ya está pagada, sale **PUE** con la forma de pago real; si no, sale **PPD** con forma **99**. Una factura con RFC genérico (XAXX010101000) siempre sale PUE.
- **Complemento automático:** cada pago que se aplica a una factura PPD (con **Registrar pago**, un pago en línea, un cobro de la cotización que pasa a la factura o un pago desde el portal) emite su complemento.
- **Una vez por pago:** un mismo pago nunca recibe dos complementos, aunque el aviso llegue dos veces.
- **Consume cuota:** cada complemento cuenta como una factura con validez fiscal de tu plan.
- **Casos que no son automáticos:** un cobro en otra divisa, que Cord deja escrito en la actividad de la factura, y el procedimiento de anticipos del SAT, que Cord no emite.

## Cómo decide Cord entre PUE y PPD

Al timbrar, Cord suma lo que ya se cobró de esa venta (en la cotización y en la factura):

- **Pagada por completo:** CFDI **PUE**, con la forma de pago del cobro de mayor importe (tarjeta 04, transferencia 03, efectivo 01). Si fijaste una **Forma de pago** en **Datos del CFDI** del editor, se usa esa.
- **Sin pagar o pagada en parte:** CFDI **PPD** con forma de pago **99** (por definir). Cada cobro posterior lleva su complemento.

No tienes que elegir el método a mano.

## Cuándo se emite el complemento

En cuanto un pago se aplica a una factura PPD timbrada:

1. **Registrar pago** en el detalle de la factura (transferencia, efectivo, cheque u otro).
2. Un **pago en línea** desde el link de la factura o desde el portal del cliente.
3. Un **cobro de la cotización** (anticipo, saldo o cuota) que se traslada a la factura.

Cord timbra el complemento con el importe, la fecha y la forma de pago de ese cobro, relacionado con el UUID de la factura, y lo anota en la **Actividad** de la factura: "Complemento de pago emitido" con su folio fiscal.

## Casos que Cord deja para tu contador

- **Cobro en otra divisa:** el complemento necesita el tipo de cambio oficial del día del pago, que Cord no tiene.
- **Anticipo en el sentido del SAT:** si recibiste el pago cuando el bien, el servicio o su precio no estaban determinados, el SAT pide su procedimiento de anticipos (un CFDI del anticipo y su aplicación), que Cord no emite. Revísalo con tu contador **antes** de timbrar: lo cobrado en la cotización pasa a la factura y, si sale PPD, recibe su complemento como cualquier otro cobro.

Cuando Cord no emite un complemento, la actividad de la factura dice "Complemento de pago no automático" y el motivo.

## Si un complemento no sale

Si el timbrado del complemento falla, el pago **sí queda registrado** y la actividad dice "Complemento de pago pendiente" con el motivo. Escríbenos y lo reintentamos: el reintento usa la misma operación, así que el SAT nunca recibe dos complementos del mismo pago.

## Sustituir o cancelar una factura con complementos

El SAT no deja cancelar un CFDI con comprobantes relacionados vigentes. Una factura con complementos de pago emitidos no se puede **Sustituir CFDI** desde la app: escríbenos para hacerlo. Ver [Cancelar CFDI con documentos relacionados](/soporte/cancelar-cfdi-relacionados).

## Relacionados

- [Cómo facturar en México con Cord](/soporte/facturar-en-mexico)
- [Facturar anticipos](/soporte/facturacion-anticipos)
- [Saldo, pagos y créditos](/soporte/saldo-pagos-creditos)
