# Incidente público: indicador de confirmación de pagos

Texto listo para publicar en Cord Ops (`ops.cordhq.app` → Estado → Incidentes).
Los campos corresponden a la tabla `status_incidents`.

- **Estado:** `monitoring` al publicar. Pasa a `resolved` cuando la sonda nueva
  lleve 24 h en verde con la migración `2026-09-30-pending-payment-intents.sql`
  aplicada.
- **Severidad:** `minor`
- **Inicio (`started_at`):** `2026-09-23T11:25:00Z`. Es la primera muestra en
  falla en los registros del workflow *Status probe*; la del 22 a las 18:47 UTC
  estaba en verde.
- **Fin (`resolved_at`):** vacío hasta resolverlo.

## Español

**Título (`title_es`)**

Revisamos la alerta de confirmación de pagos

**Resumen (`summary_es`)**

Desde el 23 de septiembre, esta página mostraba con falla la "confirmación de pagos". Revisamos qué la encendía: la alerta se activaba cuando había cobros esperando pago y pasaban más de 26 horas sin que el procesador de pagos nos avisara de un pago nuevo. Eso pasa con normalidad cuando un cliente abre su link de pago y todavía no paga, así que la alerta no distinguía entre "el cliente aún no ha pagado" y "un pago se hizo y no nos enteramos".

Cambiamos la revisión. Ahora le preguntamos directamente al procesador de pagos por cada cobro pendiente reciente, y solo marcaremos falla si encontramos un pago ya cobrado que Cord no haya registrado. Si eso llegara a pasar, lo publicaremos aquí con los detalles.

El procesador de pagos respondió con normalidad en cada revisión de estos días, y el resto de los servicios operó sin problemas. Seguiremos observando la nueva revisión antes de cerrar este aviso.

## English

**Title (`title_en`)**

We reviewed the payment confirmation alert

**Summary (`summary_en`)**

Since September 23, this page showed "payment confirmation" as failing. We looked into what triggered it: the alert fired whenever there were charges waiting to be paid and more than 26 hours passed without the payment processor notifying us of a new payment. That is normal when a customer opens their payment link and hasn't paid yet, so the alert couldn't tell "the customer hasn't paid yet" apart from "a payment went through and we missed it".

We changed the check. We now ask the payment processor directly about each recent pending charge, and we will only report a failure if we find a payment that was already collected but not recorded in Cord. If that ever happens, we will post the details here.

The payment processor responded normally at every check during these days, and all other services operated without issues. We will keep watching the new check before closing this notice.
