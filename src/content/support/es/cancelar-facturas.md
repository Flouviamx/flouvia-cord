---
title: "Cancelar facturas y notas de crédito"
description: "Cómo funciona la cancelación de una factura en Cord y cuándo el SAT exige una Nota de Crédito en su lugar."
category: "Facturación"
order: 4
---

En organizaciones de **México**, Cord cancela un CFDI 4.0 conforme al proceso del SAT. Fuera de México, "cancelar" una factura es una operación local de Cord (no hay comprobante que dar de baja ante una autoridad), y aplican las mismas reglas de negocio de abajo salvo la parte específica del SAT.

### Cómo se cancela en Cord

Desde el detalle de la factura, abre el menú de opciones y elige **Cancelar factura**. Cord te pide confirmar la acción y, si aceptas, cancela el comprobante. En México, la cancelación viaja ante el SAT con el motivo `02 — Comprobante emitido con errores sin relación`, el motivo correcto cuando vas a rehacer la factura desde cero (por ejemplo, el RFC del cliente estaba mal).

Una factura con pagos aplicados **no se puede cancelar**: Cord te lo dice de inmediato y te dirige a emitir una Nota de Crédito en su lugar (ver [Emitir Nota de Crédito](/soporte/nota-de-credito)), porque anular un documento que ya respalda dinero cobrado dejaría ese cobro sin comprobante.

### Motivos del catálogo del SAT

El catálogo oficial tiene cuatro motivos posibles. Para conocer cuándo aplica cada uno:

- **01 (Errores con relación):** te equivocaste en el precio o el concepto y vas a sustituir la factura por una nueva que la reemplaza. Este motivo exige declarar ante el SAT cuál es el CFDI sustituto — hoy Cord no arma esa vinculación desde el botón de cancelar; si lo necesitas, [contáctanos](/contacto/ventas).
- **02 (Errores sin relación):** te equivocaste en el RFC del cliente o en otro dato que no amerita relacionar un sustituto. Cancela y vuelve a hacerla de cero. Es el motivo que usa el botón **Cancelar factura**.
- **03 (No se llevó a cabo la operación):** la venta se cayó y nunca se pagó.
- **04 (Operación nominativa relacionada en global):** exclusivo para facturas de Público en General.

### Cancelaciones con aceptación del cliente

Cuando el monto de la factura supera $1,000 MXN o han pasado más de 24 horas desde su emisión, el SAT no cancela de inmediato: pone la solicitud en un estado de espera y notifica al cliente en su Buzón Tributario, quien tiene 72 horas para aceptar o rechazar. Este proceso corre por completo del lado del SAT y de tu Buzón Tributario. Cord marca la factura como cancelada en cuanto el proveedor de timbrado confirma que aceptó la solicitud de cancelación; hoy Cord no monitorea ni actualiza el estado si tu cliente la rechaza después dentro de esas 72 horas, así que ante un caso de rechazo verifica el estatus directamente en el Buzón Tributario o con tu contador.
