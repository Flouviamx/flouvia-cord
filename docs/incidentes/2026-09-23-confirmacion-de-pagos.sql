-- Incidente público de la página de estado (/desarrolladores/status).
-- Correr una vez en Neon (SQL editor). Es idempotente: no duplica si ya existe.
-- Texto y contexto en 2026-09-23-confirmacion-de-pagos.md.
insert into status_incidents
  (status, severity, title_es, title_en, summary_es, summary_en, started_at, resolved_at)
select 'resolved', 'minor',
  'Revisamos la alerta de confirmación de pagos',
  'We reviewed the payment confirmation alert',
  'Desde el 23 de septiembre, esta página mostraba con falla la "confirmación de pagos". Revisamos qué la encendía: la alerta se activaba cuando había cobros esperando pago y pasaban más de 26 horas sin que el procesador de pagos nos avisara de un pago nuevo. Eso pasa con normalidad cuando un cliente abre su link de pago y todavía no paga, así que la alerta no distinguía entre "el cliente aún no ha pagado" y "un pago se hizo y no nos enteramos".

Cambiamos la revisión. Ahora le preguntamos directamente al procesador de pagos por cada cobro pendiente reciente, y solo marcaremos falla si encontramos un pago ya cobrado que Cord no haya registrado. Si eso llegara a pasar, lo publicaremos aquí con los detalles.

También revisamos con el procesador de pagos los avisos de estos días: todos se entregaron sin errores y ningún pago quedó sin registrar. El procesador respondió con normalidad en cada revisión y el resto de los servicios operó sin problemas.',
  'Since September 23, this page showed "payment confirmation" as failing. We looked into what triggered it: the alert fired whenever there were charges waiting to be paid and more than 26 hours passed without the payment processor notifying us of a new payment. That is normal when a customer opens their payment link and hasn''t paid yet, so the alert couldn''t tell "the customer hasn''t paid yet" apart from "a payment went through and we missed it".

We changed the check. We now ask the payment processor directly about each recent pending charge, and we will only report a failure if we find a payment that was already collected but not recorded in Cord. If that ever happens, we will post the details here.

We also reviewed this period''s notifications with the payment processor: all were delivered without errors and no payment went unrecorded. The processor responded normally at every check and all other services operated without issues.',
  '2026-09-23T11:25:00Z', '2026-09-30T16:30:00Z'
where not exists (
  select 1 from status_incidents where title_es = 'Revisamos la alerta de confirmación de pagos' and started_at = '2026-09-23T11:25:00Z'
);
