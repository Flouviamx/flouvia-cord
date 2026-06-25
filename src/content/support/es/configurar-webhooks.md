---
title: "Configurar e inspeccionar Webhooks"
description: "Recibe notificaciones en tiempo real en tu servidor cuando ocurran eventos en Cord."
category: "Desarrolladores"
order: 2
---

Los webhooks son llamadas HTTP (callbacks) que nuestro servidor hace al tuyo cuando ocurre un evento importante de manera asíncrona (ej. una cotización se aprobó o se pagó).

### Registrar un endpoint

Para recibir webhooks, expón una ruta `POST` en tu servidor (ej. `https://api.tuempresa.com/webhooks/cord`).

1. Ve a **Ajustes > Developers > Webhooks** en el panel de Cord.
2. Añade tu URL y guarda. El **secreto de firma** se muestra una sola vez: guárdalo.
3. Selecciona a qué eventos suscribirte.

### Eventos disponibles

Cord emite estos eventos del ciclo de vida de una cotización:

- `quote.sent` — se envió al cliente.
- `quote.viewed` — el cliente la abrió.
- `quote.approved` — el cliente la aprobó.
- `quote.rejected` — el cliente la rechazó.
- `quote.paid` — se pagó.
- `quote.invoiced` — se timbró el CFDI.

El cuerpo es JSON: `{ "event": "quote.paid", "created_at": "...", "data": { "id", "folio", "status", "total", "cliente", "link_publico" } }`.

### Verificación de firma

Valida siempre la firma para asegurar que el evento viene de Cord. Cada petición incluye dos headers: `X-Cord-Event` (el nombre del evento) y `X-Cord-Signature` con el formato `sha256=<hash>`, donde el hash es el HMAC-SHA256 del **cuerpo en bruto** usando tu secreto de firma. [Ver el código de verificación](/soporte/firmas-webhooks).

### Reintentos e inspección

Cada endpoint guarda un **log de entregas** (estado, latencia y respuesta de cada intento). Si una entrega falla, puedes **reenviarla** desde el panel, y usar el botón **Probar** para mandar un evento de prueba.
