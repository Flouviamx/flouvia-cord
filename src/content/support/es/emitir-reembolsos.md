---
title: "Emitir reembolsos a clientes"
description: "Cómo reembolsar un pago de forma parcial o total directo a la tarjeta del comprador."
category: "Pagos y Depósitos"
order: 4
---


Cord permite iniciar un reembolso total o parcial desde el mismo historial del cobro, sin abandonar la plataforma. La corrección fiscal sigue siendo un paso separado cuando el pago ya tiene CFDI.

### Paso 1: Reembolsar el cobro en Cord

1. Ve a **Cobros** y localiza el pago exitoso.
2. Selecciona **Reembolsar**, indica el monto y confirma la operación.
3. En pagos con tarjeta, Cord solicita la devolución al banco emisor y actualiza el importe neto cuando recibe el resultado.
4. En transferencias SPEI (solo cobros en pesos mexicanos), Cord crea en **Tareas** una tarea con prioridad alta, el monto y la referencia, a cargo de quien solicitó el reembolso. La devolución debe completarse desde tu banco; Cord no simula una transferencia saliente.

Solo el propietario o un miembro con permiso de reembolsos puede confirmar la operación. Por seguridad, Cord puede solicitar una verificación reciente de contraseña o segundo factor.

La comisión de procesamiento mostrada antes de confirmar no se devuelve de forma predeterminada. Un reembolso tampoco reabre ni cancela automáticamente la cotización.

### Paso 2: Corrección fiscal (Nota de Crédito)

Emitir un reembolso no cancela por sí solo el documento fiscal original.

**En México**, no cancela la factura ante el SAT:
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
