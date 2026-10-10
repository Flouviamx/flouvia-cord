---
title: "Emitir una nota de crédito"
description: "Acredita una factura ya emitida: cómo se crea desde el detalle, por qué nace por el total, qué documento sale en cada país y su efecto en el saldo."
category: "Facturación"
---

Una **nota de crédito** acredita una factura ya emitida sin cancelarla: por ejemplo, un descuento posterior a la venta, una devolución o un error de importe. Reduce lo que tu cliente te debe; **no devuelve dinero** por sí sola.

**En resumen:**

- **Dónde:** en el detalle de una factura **emitida**, **Más acciones › Nota de crédito**.
- **Por el total:** desde la app la nota nace por el **total** de la factura, con sus mismos conceptos, tasas y retenciones. Para acreditar solo una parte, hoy se hace por la API con el monto parcial.
- **Se emite desde su detalle:** Cord te lleva al borrador de la nota y la emites con **Emitir nota de crédito**. No se envía sola al cliente.
- **Efecto en el saldo:** solo una nota emitida y no anulada reduce el saldo. Si la factura ya estaba pagada, queda un importe por devolver, que se hace aparte.
- **Cada país emite su documento:** CFDI de egreso en México, rectificativa en España con Verifactu, nota de crédito con su autorización en los rieles de LatAm y nota de crédito comercial en el resto.

## Emitir una nota de crédito

1. Abre **Facturas** y entra a la factura original. Solo una factura **emitida** admite nota de crédito.
2. Pulsa **Más acciones › Nota de crédito**.
3. Cord crea la nota como **borrador** por el total de la factura y te lleva a su detalle.
4. Revísala y pulsa **Emitir nota de crédito**.
5. Envíala a tu cliente con **Enviar al cliente** desde su detalle.

La nota conserva el desglose de la factura original: no se edita en el editor de facturas. Para un importe distinto, la API acepta el monto que quieres acreditar; un importe parcial que no cuadra al redondear se rechaza. La suma de las notas vigentes no puede superar el total de la factura.

## Qué documento sale en cada país

| País | Nota de crédito |
|---|---|
| México | CFDI de egreso (tipo E), uso G02 (S01 a un extranjero), relación 01 con el UUID original. |
| España con Verifactu activo | Factura rectificativa por diferencias, con su propio registro encadenado. |
| Argentina (ARCA) | Nota de crédito de la misma clase, receptor, condición y moneda, con la factura como comprobante asociado. |
| Perú (SUNAT) | Nota de crédito tipo 01 (anulación) si acredita el total, o 09 (disminución) si acredita una parte. |
| Chile (SII) | Nota de crédito (61) que anula el total o corrige montos. |
| Colombia (DIAN) | Nota crédito con concepto de anulación (total) o de rebaja (parcial). |
| Brasil (NFS-e o NF-e) | No existe: la NFS-e se anula y se emite otra; la devolución de mercancía es otra NF-e que Cord todavía no emite. |
| Resto, y facturas comerciales | Nota de crédito comercial con prefijo `NCC`, ligada a la factura. |

Los registros ante la autoridad de España y de LatAm están en activación; mientras tanto, la nota es comercial. Ver [Facturación por país](/soporte/categoria/facturacion-por-pais).

## Efecto en el saldo

Solo una nota emitida y no anulada reduce el saldo; el borrador no lo cambia. La nota nace con saldo cobrable cero: no es una deuda nueva y no se puede cobrar. Si la factura ya estaba pagada, el detalle muestra el importe por devolver; emitir la nota **no** ejecuta ese reembolso. Consulta [cómo se calcula el saldo](/soporte/saldo-pagos-creditos).

## Anular una nota de crédito

Una nota de crédito emitida se anula desde su propio detalle con **Más acciones › Anular**, igual que una factura. Antes de anular la factura original tienes que resolver sus notas vigentes.

> La disponibilidad de las mejoras de septiembre está en verificación. Consulta [alcance y publicación](https://docs.cordhq.app/docs/pagos/mejoras-confiabilidad); contacta a soporte si una acción descrita todavía no aparece en tu cuenta.
