---
title: "Cumplimiento PCI-DSS"
description: "Cómo Cord protege la información de tarjetas de crédito."
category: "Seguridad y Privacidad"
order: 1
---

El Estándar de Seguridad de Datos para la Industria de Tarjeta de Pago (PCI DSS) protege la información de tarjetas de crédito.

### Datos de tarjeta aislados

Cord **no toca, ni almacena, ni procesa directamente** los números de tarjeta de crédito de tus clientes.

1. El formulario seguro se incrusta dentro del link de Cord, pero los campos sensibles se aíslan y tokenizan directamente con el procesador certificado detrás de Cord Payments — nunca dentro de un servidor de Cord.
2. Los servidores de Cord reciben un identificador de pago, nunca el PAN completo ni el CVC.
3. Cord valida la firma criptográfica del evento antes de registrar el resultado del cobro, para descartar notificaciones falsificadas.

Este diseño reduce el alcance de cumplimiento de tu negocio —porque nunca tocas ni almacenas el dato de la tarjeta, tu autoevaluación PCI-DSS (SAQ) suele calificar en el nivel más bajo, aunque el nivel exacto depende de tu operación completa, no solo de Cord—, pero no sustituye tus obligaciones de seguridad ni te certifica automáticamente. No solicites números de tarjeta por correo, chat, notas de cotización ni campos personalizados.
