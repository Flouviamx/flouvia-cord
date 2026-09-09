---
title: "Entender el saldo de una factura"
description: "Pagos parciales, créditos y dinero devuelto."
category: "Facturación"
---

# Entender el saldo de una factura


## Pagos, créditos y reembolsos no son lo mismo

Cord conserva por separado lo pagado, las notas de crédito emitidas y los
reembolsos confirmados. Así evita contar dos veces un mismo movimiento y permite
explicar por qué cambió el saldo.

**Saldo pendiente = total − créditos emitidos − pagos registrados + reembolsos
confirmados**, con un mínimo de cero. Una nota en borrador no reduce el saldo.
Un reembolso pendiente o fallido tampoco cuenta como dinero devuelto.

| Ejemplo en MXN | Resultado |
| --- | --- |
| Factura de 1.000; pago de 400 | Quedan 600 por cobrar |
| Factura de 1.000; crédito emitido de 200; pago de 800 | Saldo cero |
| Factura de 1.000 pagada; crédito emitido de 200 | Saldo cero y 200 por devolver |
| Mismo caso, con reembolso confirmado de 200 | Saldo cero y nada por devolver |
| Factura de 1.000 pagada; reembolso de 200 sin crédito | Vuelven a quedar 200 por cobrar |

El último caso requiere revisar el acuerdo con el cliente. Devolver dinero no
reduce por sí solo el importe del documento. Emitir un crédito tampoco envía dinero.

## Cobros parciales y confirmación

Después de aplicar un pago parcial, un nuevo cobro se prepara por el saldo vigente.
Un intento todavía en proceso debe aclararse antes de abrir otro. Repetir la
notificación de un mismo pago no debe volver a sumar ese importe.

Al volver de la pantalla de pago, usa **Actualizar saldo**. El regreso al enlace
no equivale a una confirmación: el estado depende del registro del pago. Si el
banco muestra el cargo pero el saldo no cambia, contacta al negocio antes de pagar
otra vez.

## Qué revisar si no coincide

Abre el detalle de la factura y compara pagos, créditos emitidos, reembolsos
confirmados y actividad. Comprueba la moneda y el documento correspondiente. Si
hay un movimiento pendiente, espera la confirmación o pide revisión; no registres
un segundo pago manual para forzar el saldo a cero.

Estas mejoras no recalculan silenciosamente todos los documentos históricos.
Los casos anteriores que no coincidan requieren revisión individual.

> La disponibilidad de las mejoras de septiembre está en verificación. Consulta [alcance y publicación](https://docs.cordhq.app/pagos/mejoras-confiabilidad); contacta a soporte si una acción descrita todavía no aparece en tu cuenta.
