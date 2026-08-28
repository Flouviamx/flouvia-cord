---
title: "Cancelar una factura con documentos relacionados"
description: "Qué hacer cuando el SAT rechaza la cancelación por una Nota de Crédito u otro documento asociado."
category: "Facturación"
---

Esto aplica solo a organizaciones en **México**, donde Cord timbra CFDI 4.0 ante el SAT. Fuera de México no existe este bloqueo porque no hay comprobante fiscal encadenado que romper.

El SAT es estricto cuando intentas cancelar una factura (Ingreso) que ya tiene un documento relacionado, como una Nota de Crédito (Egreso). Si el documento hijo sigue vigente, el SAT rechaza la cancelación de la factura padre.

### Rompe la cadena de atrás hacia adelante

1. Localiza la Nota de Crédito relacionada. Su propio detalle indica de qué factura viene (verás la etiqueta "Nota de crédito de [folio]"); si no la tienes a la mano, búscala en tu bandeja de **Facturas** por fecha o por cliente.
2. Entra a esa Nota de Crédito y cancélala primero, desde el menú de opciones de su propio detalle.
3. Espera unos minutos a que el SAT registre la cancelación del documento hijo.
4. Ahora sí, regresa a la factura principal y cancélala.

### Qué hace Cord al cancelar

El botón **Cancelar factura** pide una confirmación y cancela el comprobante ante el SAT con el motivo estándar `02 — Comprobantes emitidos con errores sin relación`. Es el motivo correcto cuando vas a rehacer la factura desde cero (por ejemplo, te equivocaste en el RFC del cliente).

<Callout type="info">
El motivo `01 — Comprobantes emitidos con errores con relación` exige declarar ante el SAT cuál es el CFDI que sustituye al que cancelas, y hoy esa vinculación no se arma automáticamente desde la interfaz de Cord. Si necesitas cancelar sustituyendo un CFDI por otro, escríbenos y te ayudamos a resolverlo.
</Callout>
