---
title: "[EN] Cumplimiento PCI-DSS"
description: "Cómo Cord protege la información de tarjetas de crédito."
category: "Security & Privacy"
order: 1
---

El Estándar de Seguridad de Datos para la Industria de Tarjeta de Pago (PCI DSS) protege la información de tarjetas de crédito.

### Delegación de Riesgo a Stripe

Cord **no toca, ni almacena, ni procesa directamente** los números de tarjeta de crédito de tus clientes.

Cuando configuras el cobro en línea en Cord mediante tu `STRIPE_SECRET_KEY`:
1. Al hacer clic en "Pagar", tu cliente es redirigido a una página segura alojada directamente por Stripe (Stripe Checkout).
2. El cliente introduce su tarjeta directamente en los servidores de Stripe.
3. Stripe procesa el cargo y simplemente le avisa a Cord vía webhook que el pago fue exitoso.

Por lo tanto, la inmensa carga de cumplimiento PCI-DSS Nivel 1 recae completamente sobre Stripe. Tu empresa y la plataforma Cord quedan eximidos de auditorías complejas.
