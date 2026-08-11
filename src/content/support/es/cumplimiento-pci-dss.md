---
title: "Cumplimiento PCI-DSS"
description: "Cómo Cord protege la información de tarjetas de crédito."
category: "Seguridad y Privacidad"
order: 1
---

El Estándar de Seguridad de Datos para la Industria de Tarjeta de Pago (PCI DSS) protege la información de tarjetas de crédito.

### Datos de tarjeta aislados

Cord **no toca, ni almacena, ni procesa directamente** los números de tarjeta de crédito de tus clientes.

1. El formulario seguro se incrusta dentro del link de Cord, pero los campos sensibles se aíslan y tokenizan directamente con el procesador certificado.
2. Los servidores de Cord reciben un identificador de pago, nunca el PAN completo ni el CVC.
3. Cord valida la firma del evento antes de registrar el resultado del cobro.

Este diseño reduce el alcance de cumplimiento, pero no sustituye las obligaciones de seguridad de tu empresa. No solicites números de tarjeta por correo, chat, notas de cotización ni campos personalizados.
