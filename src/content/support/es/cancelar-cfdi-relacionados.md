---
title: "Cancelar CFDI con documentos relacionados"
description: "Revisa pagos, notas y estado antes de anular."
category: "Facturación"
---


## Anular y acreditar son acciones distintas

**Anular** cambia la vigencia de una factura. Una **nota de crédito** es otro
documento que reduce el importe acreditable del original. Ninguna de las dos
acciones devuelve dinero automáticamente.

En Cord, abre **Facturas**, entra al documento y usa **Más acciones > Anular
factura**. La aplicación bloquea la anulación cuando hay pagos aplicados y propone
una nota de crédito. También exige resolver las notas vinculadas antes de anular
la factura original. Estas son las reglas del flujo de Cord; no sustituyen la
revisión fiscal de cada caso.

## México: solicitud y confirmación

Enviar una solicitud no significa que el CFDI esté cancelado. Cord conserva el
estado de la solicitud y solo presenta la anulación cuando se confirma:

- **Pendiente o en verificación:** la factura continúa vigente.
- **Rechazada, expirada o sin confirmación:** la factura no se marca anulada.
- **Aceptada:** se actualiza su estado a anulada.

Usa **Consultar cancelación** en el detalle para revisar una solicitud. La consulta
es manual; no se promete seguimiento automático continuo.

### El motivo del SAT

Al anular un CFDI vigente, Cord te pide el motivo que exige el SAT:

- **02 · Comprobante emitido con errores sin relación:** tiene un error y no vas
  a emitir otro en su lugar (por ejemplo, lo emitiste dos veces o al cliente
  equivocado).
- **03 · No se llevó a cabo la operación:** la venta o el servicio no se concretó.
- **04 · Operación nominativa relacionada en una factura global:** solo para una
  factura global de la que un cliente pidió su factura.
- **01 · Comprobante emitido con errores con relación:** no se elige aquí. Se usa
  **Sustituir CFDI**.

### Sustituir un CFDI

Si la factura tiene un error que hay que corregir con otra, usa **Sustituir
CFDI** en su detalle. Cord crea un borrador con los mismos datos para que lo
corrijas. Al emitirlo, el nuevo CFDI se relaciona con el original (relación
04), sus cobros pasan a la factura nueva y Cord pide la cancelación del original
con el motivo 01 y el folio fiscal del sustituto. Si el receptor tiene que
aceptarla, el detalle muestra el estado; si la rechaza, los dos CFDI siguen
vigentes y puedes reintentar.

Cord no ofrece sustituir una factura con notas de crédito vigentes o con
complementos de pago emitidos: el SAT no deja cancelar un CFDI con comprobantes
relacionados vigentes. No elijas una nota de crédito solo para simular una
cancelación.

## Otros mercados

Cord usa el carril disponible para el país y conserva el historial del documento.
La anulación local de una factura comercial no acredita que una autoridad fiscal
haya recibido o aceptado una cancelación.

> La disponibilidad de las mejoras de septiembre está en verificación. Consulta [alcance y publicación](https://docs.cordhq.app/docs/pagos/mejoras-confiabilidad); contacta a soporte si una acción descrita todavía no aparece en tu cuenta.
