---
title: "Configurar e inspeccionar Webhooks"
description: "Recibe notificaciones en tiempo real en tu servidor cuando ocurran eventos en Cord."
category: "Desarrolladores"
order: 2
---

# Configurar e inspeccionar Webhooks

Los Webhooks te permiten reaccionar programáticamente a eventos asíncronos (como el pago exitoso de una cotización o la emisión de una factura).

## Configurar un Endpoint
Ve a **Desarrolladores > Webhooks** y añade la URL de tu servidor (`https://mi-app.com/webhooks/cord`).

Eventos comunes a los que puedes suscribirte:
- `payment.succeeded`
- `quote.accepted`
- `invoice.generated`

## Verificación de Firmas
Cada petición que Cord haga a tu servidor incluirá un header `Cord-Signature`. Debes validar esta firma usando tu *Webhook Secret* para asegurarte de que el evento es legítimo y no un ataque.
