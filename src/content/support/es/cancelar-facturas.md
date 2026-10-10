---
title: "Anular facturas y consultar cancelaciones"
description: "Cuándo se puede anular una factura, el motivo del SAT y la sustitución en México, y qué hace cada país: nota de crédito donde la autoridad no anula, plazos de cancelación y registros de anulación."
category: "Facturación"
---

## Anular y acreditar son acciones distintas

**Anular** cambia la vigencia de una factura. Una **nota de crédito** es otro documento que reduce el importe acreditable del original. Ninguna de las dos devuelve dinero: un reembolso se hace aparte, desde **Cobros**.

En Cord, abre **Facturas**, entra al documento y usa **Más acciones › Anular**. La opción solo aparece en una factura abierta **sin pagos aplicados**; si ya tiene pagos, usa **Más acciones › Nota de crédito**. Cord también exige resolver las notas de crédito vinculadas antes de anular la factura original, y no anula mientras haya un cobro en camino (por ejemplo, un cargo a cuenta bancaria en proceso). Estas son las reglas del flujo de Cord; no sustituyen la revisión fiscal de cada caso.

## México: motivo, solicitud y confirmación

Al anular un CFDI vigente, Cord te pide el motivo que exige el SAT:

- **02 · Comprobante emitido con errores sin relación:** tiene un error y no vas a emitir otro en su lugar (por ejemplo, lo emitiste dos veces o al cliente equivocado).
- **03 · No se llevó a cabo la operación:** la venta o el servicio no se concretó.
- **04 · Operación nominativa relacionada en una factura global:** solo para una factura global de la que un cliente pidió su factura.
- **01 · Comprobante emitido con errores con relación:** no se elige aquí. Se usa **Sustituir CFDI**.

Pulsa **Solicitar cancelación**. Enviar la solicitud no significa que el CFDI esté cancelado. Cord conserva su estado y solo marca la factura anulada cuando el SAT lo confirma:

- **Pendiente o en verificación:** la factura sigue vigente. Si el receptor tiene que aceptar, tiene hasta tres días hábiles; si no responde, se acepta.
- **Rechazada, expirada o sin confirmación:** la factura no se marca anulada.
- **Aceptada:** la factura pasa a anulada.

Usa **Consultar cancelación** en el detalle para revisar una solicitud. La consulta es manual.

### Sustituir un CFDI

Si la factura tiene un error que hay que corregir con otra, usa **Sustituir CFDI** en su detalle. Cord crea un borrador con los mismos datos para que lo corrijas. Al emitirlo, el nuevo CFDI se relaciona con el original (relación 04), sus cobros y su saldo pasan a la factura nueva y Cord pide la cancelación del original con el motivo 01 y el folio fiscal del sustituto. Si el receptor rechaza la cancelación, los dos CFDI siguen vigentes: reintenta la cancelación o, si el sustituto sobra, cancélalo con el motivo 02.

No se ofrece sustituir una factura con notas de crédito vigentes o con complementos de pago emitidos: el SAT no deja cancelar un CFDI con comprobantes relacionados vigentes. Ver [Cancelar CFDI con documentos relacionados](/soporte/cancelar-cfdi-relacionados).

## Qué pasa en cada país

| País | Al pulsar Anular |
|---|---|
| México | Solicitud de cancelación al SAT con su motivo (arriba). |
| España con Verifactu activo | Se encadena un **registro de anulación** que se envía a la AEAT; el registro original no se borra. |
| Brasil, NFS-e activa | Evento de cancelación ante el Sistema Nacional NFS-e, dentro del plazo y el valor que permite tu municipio. |
| Brasil, NF-e activa | Cancelación ante la SEFAZ, dentro de las 24 horas de la autorización. |
| Argentina (ARCA), Perú (SUNAT), Chile (SII) y Colombia (DIAN) activos | Un comprobante autorizado **no se anula**: Cord te pide una **nota de crédito**. |
| Francia, factura ya transmitida por la plataforma | No se anula ante la plataforma: se corrige con nota de crédito. |
| Resto, y cualquier factura comercial o proforma | La factura se anula en Cord. No se presenta ante ninguna autoridad. |

La anulación local de una factura comercial no acredita que una autoridad fiscal haya recibido o aceptado una cancelación. Los registros ante la autoridad de España, Brasil, Argentina, Perú, Chile, Colombia y Francia están en activación; ver la guía de cada país en [Facturación por país](/soporte/categoria/facturacion-por-pais).

## Problemas comunes

- **No veo Anular.** La factura tiene pagos aplicados, es un borrador o ya está anulada. Con pagos, usa la nota de crédito.
- **"Para el motivo 01, primero sustituye la factura".** El motivo 01 solo se usa con **Sustituir CFDI**.
- **La factura sigue vigente después de solicitar la cancelación.** El SAT o el receptor todavía no la confirman. Pulsa **Consultar cancelación**.

> La disponibilidad de las mejoras de septiembre está en verificación. Consulta [alcance y publicación](https://docs.cordhq.app/docs/pagos/mejoras-confiabilidad); contacta a soporte si una acción descrita todavía no aparece en tu cuenta.
