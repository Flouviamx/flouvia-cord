---
title: "Configurar e inspeccionar Webhooks"
description: "Recibe notificaciones en tiempo real en tu servidor cuando ocurran eventos en Cord."
category: "Desarrolladores"
order: 2
---

Los webhooks son llamadas HTTP (callbacks) que nuestro servidor hace al tuyo cuando ocurre un evento importante de manera asíncrona (ej. una cotización se aprobó o se pagó).

### Registrar un endpoint

Para recibir webhooks, expón una ruta `POST` en tu servidor (ej. `https://api.tuempresa.com/webhooks/cord`).

1. Activa el **Modo desarrollador** (el interruptor al fondo del índice de Ajustes) y abre la pestaña **Webhooks** en el dock de Desarrolladores, al fondo de la pantalla.
2. Añade tu URL y guarda. El **secreto de firma** se muestra una sola vez: guárdalo.
3. Selecciona a qué eventos suscribirte.

### Eventos disponibles

Cord emite eventos del ciclo de vida de la cotización y, por separado, de la factura como objeto propio (ver [Facturación y la API](/soporte/api-facturas)):

- `quote.sent` — se envió al cliente.
- `quote.viewed` — el cliente la abrió.
- `quote.approved` — el cliente la aprobó.
- `quote.rejected` — el cliente la rechazó.
- `quote.updated` — se modificó y reenvió.
- `quote.expired` — venció sin respuesta.
- `quote.deleted` — se eliminó un borrador.
- `quote.paid` — se pagó por completo.
- `payment.partial` — se recibió un anticipo, saldo o cuota sin cubrir el total.
- `payment.failed` — falló un cobro recurrente.
- `invoice.finalized`, `invoice.sent`, `invoice.paid`, `invoice.payment_failed`, `invoice.voided`, `invoice.marked_uncollectible`, `invoice.overdue` — ciclo de vida de una factura creada como recurso propio vía `/api/v1/facturas`.

El cuerpo es JSON: `{ "id": "evt_...", "event": "quote.paid", "created_at": "...", "data": { "id", "folio", "status", "total", "cliente", "link_publico" } }`. El `id` del evento es estable a través de reintentos y de un reenvío manual desde el panel — úsalo para deduplicar del lado de tu servidor.

### Verificación de firma

Valida siempre la firma para asegurar que el evento viene de Cord. Cada entrega incluye `X-Cord-Signature-V1` (con timestamp, protección anti-repetición) y, por compatibilidad, la firma heredada `X-Cord-Signature` (sin timestamp). El nombre del evento viaja en `X-Cord-Event` y su id estable en `X-Cord-Event-Id`/`Idempotency-Key`. Si usas Node, el paquete `@flouviahq/elements/server` valida ambas formas por ti (`CordWebhooks.constructEvent`); si prefieres verificarlo a mano en cualquier lenguaje, [ve el código de verificación](/soporte/firmas-webhooks).

### Reintentos e inspección

Cada endpoint guarda un **log de entregas** (estado, latencia y respuesta de cada intento). Si una entrega falla, puedes **reenviarla** desde el panel, y usar el botón **Probar** para mandar un evento de prueba.
