---
title: "Emitir una Nota de Crédito"
description: "Aplica devoluciones y bonificaciones sobre una factura ya emitida."
category: "Facturación"
---

# Emitir una Nota de Crédito


Una Nota de Crédito es el mecanismo para acreditar el saldo de una factura ya emitida sin cancelarla por completo — por ejemplo, cuando le haces un descuento post-venta a un cliente, o necesitas devolverle parte de lo cobrado. En México se emite como CFDI de tipo Egreso, vinculado por su UUID a la factura original.

### Emitir una Nota de Crédito en Cord

1. Localiza la factura original en tu bandeja de **Facturas**. Solo una factura **emitida** admite Nota de Crédito.
2. Abre su menú de opciones y elige **Generar Nota de Crédito**.
3. Cord crea una Nota de Crédito nueva como borrador, por el **monto total** de la factura original, y te lleva directo a su detalle.
4. Desde ahí, edítala como cualquier borrador: ajusta el monto si necesitas acreditar solo una parte y añade un concepto que explique el motivo. Cuando esté lista, emítela desde el mismo editor de borradores que usas para cualquier factura nueva.

<Callout type="info">
Al usar el botón desde la app, la Nota de Crédito nace por el monto total de la factura original — hoy no hay un paso intermedio en la interfaz para indicar un monto parcial antes de crearla. Si facturas por la API, puedes enviar directamente el monto parcial que quieres acreditar.
</Callout>

Cord **no envía automáticamente** un correo al cliente al crear la Nota de Crédito: se genera como borrador para que la revises, y la mandas tú mismo con el botón de enviar de su detalle una vez que la hayas emitido — igual que con cualquier otra factura.

## Efecto en el saldo

Solo una nota emitida y no anulada reduce el saldo; el borrador no lo cambia. En México se emite como CFDI de egreso relacionado con el UUID original. Si la factura ya estaba pagada, puede quedar un importe por devolver. Emitir la nota no ejecuta ese reembolso. Consulta [cómo se calcula el saldo](/soporte/saldo-pagos-creditos).

> La disponibilidad de las mejoras de septiembre está en verificación. Consulta [alcance y publicación](https://docs.cordhq.app/pagos/mejoras-confiabilidad); contacta a soporte si una acción descrita todavía no aparece en tu cuenta.
