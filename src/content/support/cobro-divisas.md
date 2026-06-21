---
title: "Cobro en múltiples divisas"
description: "Cómo cobrar en USD y liquidar en MXN."
category: "Pagos y Depósitos"
---

Cord te permite enviar cotizaciones en monedas extranjeras (ej. USD o EUR) mientras mantienes tu contabilidad y depósitos en México.

### ¿Cómo funciona el tipo de cambio?

1. Si creas una cotización en `USD`, tu cliente verá el monto en dólares.
2. Al momento en que el cliente decide pagar mediante el portal de Cord, nuestro procesador tomará el tipo de cambio FIX interbancario del momento.
3. Al cliente se le hará el cargo equivalente en su tarjeta, y a ti **se te depositarán Pesos Mexicanos (MXN)** en tu cuenta CLABE.

### Facturación en Moneda Extranjera
Si el cliente requiere factura (CFDI) y la operación fue en dólares, Cord emitirá la factura indicando `Moneda: USD` e incluirá automáticamente el nodo de `TipoCambio` oficial del Diario Oficial de la Federación (DOF) del día del cobro. Esto asegura que el SAT reciba el valor correcto de los impuestos trasladados convertidos a pesos para tu declaración mensual.
