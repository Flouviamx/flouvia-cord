---
title: "Cancelar CFDI con documentos relacionados"
description: "Qué revisar antes de cancelar o sustituir un CFDI que tiene notas de crédito, complementos de pago, un sustituto en curso o que forma parte de una factura global."
category: "Facturación"
---

Esto aplica a organizaciones en **México**. El SAT **no deja cancelar un CFDI que tiene comprobantes relacionados vigentes**: si lo intentas, lo marca "No cancelable". Antes de anular o sustituir una factura, revisa qué documentos dependen de ella.

**En resumen:**

| La factura tiene… | Qué hacer |
|---|---|
| Notas de crédito vigentes | Anula primero las notas de crédito; después la factura. Cord no anula ni sustituye la factura mientras existan. |
| Complementos de pago emitidos | No se puede **Sustituir CFDI** desde la app: escríbenos a soporte@flouvia.com para sustituirla. |
| Pagos aplicados | No se anula: usa **Más acciones › Nota de crédito**. Los pagos se conservan en la factura. |
| Un sustituto en curso | Continúa en él con **Continuar la sustitución**; no se crea otro. |
| Ventas en una factura global | Cancela la global con el motivo 04 y emítela de nuevo sin esa venta. |

## Notas de crédito

Una nota de crédito emitida es un CFDI de egreso relacionado con el UUID de la factura. Mientras esté vigente:

- **Anular** la factura se rechaza hasta resolver la nota.
- **Sustituir CFDI** no se ofrece: el detalle dice "Para sustituirla, primero anula sus notas de crédito".

Anula la nota de crédito desde su propio detalle (**Más acciones › Anular**) y, cuando el SAT confirme su cancelación, vuelve a la factura.

## Complementos de pago

Cada cobro de una factura PPD lleva un complemento de pago relacionado con ella. Para cancelar o sustituir esa factura habría que cancelar antes sus complementos, y Cord todavía no lo hace desde la app. El detalle de la factura lo dice: "Tiene complementos de pago emitidos… Escríbenos a soporte@flouvia.com para sustituirla". Ver [Facturas PPD y complementos de pago](/soporte/complementos-de-pago).

## Pagos aplicados

Una factura con pagos no se anula, porque el dinero ya entró. Si hay que corregir el importe, emite una **nota de crédito**; si además hay que devolver dinero, haz el reembolso aparte desde **Cobros**.

## Sustitución en curso

Cuando pulsas **Sustituir CFDI**, Cord crea un borrador ligado al original. Solo puede haber un sustituto vivo por factura: si ya existe, el detalle ofrece **Continuar la sustitución**. Mientras la cancelación del original espera la aceptación del receptor, los dos CFDI siguen vigentes; si el receptor la rechaza, reintenta la cancelación o, si el sustituto sobra, cancélalo con el motivo 02. Anular un sustituto sin pagos devuelve el saldo al original.

## Factura global

Una venta incluida en una factura global vigente no puede facturarse aparte. Si un cliente pide su factura:

1. Abre la factura global y usa **Más acciones › Anular** con el motivo **04 · Operación nominativa relacionada en una factura global**.
2. Al confirmarse la cancelación, sus ventas quedan libres. Pulsa **Emitir de nuevo la global del periodo** y desmarca la venta del cliente.
3. Emite la factura del cliente desde su cotización.

La factura global no se sustituye: se corrige cancelándola. Ver [Facturación al Público en General y factura global](/soporte/facturar-publico-general).

## Relacionados

- [Anular facturas y consultar cancelaciones](/soporte/cancelar-facturas)
- [Emitir una nota de crédito](/soporte/nota-de-credito)
- [Cómo facturar en México con Cord](/soporte/facturar-en-mexico)

> La disponibilidad de las mejoras de septiembre está en verificación. Consulta [alcance y publicación](https://docs.cordhq.app/docs/pagos/mejoras-confiabilidad); contacta a soporte si una acción descrita todavía no aparece en tu cuenta.
