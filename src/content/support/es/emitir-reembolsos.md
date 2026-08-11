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
4. En transferencias SPEI, Cord crea una tarea manual con el monto y la referencia. La devolución debe completarse desde tu banco; Cord no simula una transferencia saliente.

Solo el propietario o un miembro con permiso de reembolsos puede confirmar la operación. Por seguridad, Cord puede solicitar una verificación reciente de contraseña o segundo factor.

La comisión de procesamiento mostrada antes de confirmar no se devuelve de forma predeterminada. Un reembolso tampoco reabre ni cancela automáticamente la cotización.

### Paso 2: Corrección Fiscal en Cord (Nota de Crédito)
Emitir un reembolso no cancela la factura ante el SAT.
1. Ve a Cord en **Contabilidad > Facturas** y localiza la factura original.
2. En el menú de opciones (tres puntos), selecciona **Generar Nota de Crédito** (Egreso).
3. Cord vinculará automáticamente el UUID de la factura padre usando el tipo de relación `01`.
4. Haz clic en **Timbrar Egreso**. Esto deducirá contablemente el ingreso y le entregará a tu cliente su XML de comprobación.
