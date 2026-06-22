---
title: "Configurar e inspeccionar Webhooks"
description: "Recibe notificaciones en tiempo real en tu servidor cuando ocurran eventos en Cord."
category: "Desarrolladores"
order: 2
---

Los webhooks son llamadas HTTP (callbacks) que nuestro servidor hace al tuyo cuando ocurre un evento importante de manera asíncrona (ej. un cliente pagó, o una factura se timbró).

### Registro de un Endpoint

Para recibir webhooks, primero necesitas exponer una ruta `POST` en tu servidor (ej. `https://api.tuempresa.com/webhooks/cord`).
1. Ve a **Desarrolladores > Webhooks** en el panel de Cord.
2. Añade tu URL.
3. Selecciona a qué eventos deseas suscribirte. Te recomendamos iniciar con `charge.succeeded` y `invoice.created`.

### Verificación de Firmas

Por seguridad, alguien podría simular ser Cord y enviarte eventos falsos para intentar hackear tu inventario. **Es obligatorio que valides la firma criptográfica** que enviamos en los headers de cada petición.

El header se llama `Cord-Signature` e incluye un timestamp y el hash HMAC SHA-256. Utiliza el *Webhook Secret* que te proporcionamos al crear el endpoint para verificarlo. [Ver fragmentos de código de verificación en Node.js y Python](/soporte/firmas-webhooks).
