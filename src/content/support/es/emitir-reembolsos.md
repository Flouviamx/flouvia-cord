---
title: "Emitir reembolsos a clientes"
description: "Cómo reembolsar un pago de una cotización o de una factura, total o parcialmente, y cómo corregir el documento fiscal después."
category: "Pagos y Depósitos"
order: 4
---


Cord permite iniciar un reembolso total o parcial desde donde ves el pago, sin abandonar la plataforma. La corrección fiscal sigue siendo un paso separado cuando el pago ya tiene CFDI.

### Paso 1: Reembolsar el pago en Cord

**El cobro de una cotización** (pago total, anticipo, saldo, cuotas o iguala):

1. Ve a **Cobros** y localiza el pago exitoso.
2. Selecciona **Reembolsar**, indica el monto y confirma la operación.
3. En pagos con tarjeta, Cord solicita la devolución al banco emisor y actualiza el importe neto cuando recibe el resultado.
4. En transferencias SPEI (solo cobros en pesos mexicanos), Cord crea en **Tareas** una tarea con prioridad alta, el monto y la referencia, a cargo de quien solicitó el reembolso. La devolución debe completarse desde tu banco; Cord no simula una transferencia saliente.

**El pago de una factura** (desde su link, el portal del cliente o el cobro automático), con tarjeta, débito SEPA, débito ACH o Mercado Pago:

1. Ve a **Facturas**, abre la factura y, en **Pagos**, pulsa **Reembolsar** junto al pago.
2. El diálogo te dice antes de confirmar cuánto puedes devolver y, si no se puede, por qué: un débito ACH solo se devuelve completo, un débito SEPA o ACH solo dentro de 180 días, y un débito todavía en proceso no se puede devolver hasta que se confirme.
3. Si el pago cubrió varias facturas, elige **Solo esta factura** (hasta lo que el cobro le aplicó) o **Todo el cobro**.
4. Indica el monto, marca la casilla de la tarifa y confirma. La factura vuelve a quedar con saldo por lo devuelto en cuanto el reembolso se confirma.

Esta función es nueva y puede no estar habilitada todavía en tu cuenta. Si no la ves, escríbenos. Un pago de factura registrado a mano no tiene botón: Cord no movió ese dinero. El cobro de una cotización hecho con Mercado Pago se reembolsa desde tu cuenta de Mercado Pago, y Cord lo registra solo.

Solo el propietario o un miembro con permiso de reembolsos puede confirmar la operación. Por seguridad, Cord puede solicitar una verificación reciente de contraseña o segundo factor.

La comisión de procesamiento mostrada antes de confirmar no se devuelve de forma predeterminada. Un reembolso tampoco reabre ni cancela automáticamente la cotización.

### Paso 2: Corrección fiscal (Nota de Crédito)

Emitir un reembolso no cancela por sí solo el documento fiscal original. Cord no emite la corrección solo, porque no todo reembolso es una devolución de la venta (devolver un cobro duplicado, por ejemplo, no cambia lo que se facturó).

**En México**, no cancela la factura ante el SAT, y si el pago tenía complemento de pago, tampoco lo cancela. Mientras haya dinero reembolsado sin una nota de crédito que lo cubra, el detalle de la factura te lo recuerda. Para emitirla:

1. Ve a **Facturas** y abre la factura original.
2. Pulsa **Más acciones › Nota de crédito**. Cord crea el borrador de un CFDI de egreso relacionado con el UUID de la factura (relación 01).
3. En el borrador, pulsa **Emitir nota de crédito**. Tu cliente recibe su XML cuando se la envías desde el detalle.

**En el resto de los países**, la corrección es una nota de crédito ligada a la factura original: comercial mientras el registro del país ante la autoridad esté en activación, o el documento que pida cada autoridad cuando esté activo. En **España con Verifactu activo**, la nota de crédito es una factura rectificativa con su propio registro encadenado: nunca se edita el registro ya firmado. Ver [Emitir una nota de crédito](/soporte/nota-de-credito).

Una devolución con **cargo a cuenta bancaria (ACH)** solo puede ser por el importe completo.

## Efecto en una factura vinculada

Cord distingue un reembolso solicitado de uno confirmado. Solo el confirmado se
incorpora al dinero devuelto de la factura; un evento repetido no debe restarlo
otra vez. Puede llegar antes que el registro del pago y quedar pendiente de esa
vinculación. La nota de crédito reduce el importe del documento y el reembolso
devuelve dinero: son acciones separadas. Revisa [el cálculo de saldo](https://docs.cordhq.app/docs/pagos/facturas-emitidas).

> La disponibilidad de las mejoras de septiembre está en verificación. Consulta [alcance y publicación](https://docs.cordhq.app/docs/pagos/mejoras-confiabilidad); contacta a soporte si una acción descrita todavía no aparece en tu cuenta.
