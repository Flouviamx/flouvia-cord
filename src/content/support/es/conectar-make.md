---
title: "Conectar Cord con Make"
description: "Recibe eventos de Cord en un escenario de Make y crea o actualiza datos de Cord desde Make."
category: "Desarrolladores"
order: 4
---

Puedes conectar Cord con Make usando dos módulos que Make ya trae: **Webhooks** para recibir eventos de Cord y **HTTP** para llamar a la API de Cord.

### Recibir eventos de Cord

1. En tu escenario de Make agrega el módulo **Webhooks › Custom webhook**, crea un webhook y copia la URL que te da Make.
2. En Cord activa el **Modo desarrollador** (el interruptor al fondo del índice de Ajustes) y abre la pestaña **Webhooks** en el dock de Desarrolladores.
3. Pega la URL de Make, elige los eventos que te interesan (por ejemplo `quote.approved`) y guarda.
4. En Make pulsa **Redetermine data structure** y, en Cord, usa el botón **Probar** del endpoint. Make aprende la forma del evento y ya puedes mapear campos como `data.folio`, `data.total` o `data.cliente`.

Cada evento llega con `id`, `event`, `created_at` y `data`. Usa el `id` para no procesar dos veces el mismo evento si Cord reintenta la entrega.

Make no verifica la firma de Cord por ti. Trata la URL del webhook como un secreto: no la compartas y, si crees que se filtró, borra el endpoint en Cord y crea uno nuevo.

Cada endpoint cuenta dentro del límite de webhooks de tu plan.

### Crear o actualizar datos en Cord

1. Crea en Cord una **llave secreta** con permiso de escritura desde la pestaña **API** del dock de Desarrolladores.
2. En Make agrega el módulo **HTTP › Make a request**.
3. Configúralo así:
   - **URL**: el endpoint que necesites, por ejemplo `https://cordhq.app/api/v1/clientes`.
   - **Method**: `POST` para crear, `PATCH` para actualizar.
   - **Headers**: `Authorization` con el valor `Bearer sk_live_...` y `Content-Type` con `application/json`.
   - **Body type**: `Raw`, contenido JSON, con los campos del recurso.
4. Si el escenario puede reintentar, agrega el header `Idempotency-Key` con un valor fijo por operación, por ejemplo el `id` del evento que la originó. Así un reintento no crea el registro dos veces.

Lo que puedes hacer desde Make:

- Crear un cliente con `POST /api/v1/clientes` o actualizarlo con `PATCH /api/v1/clientes/{id}`.
- Buscar un cliente por correo con `GET /api/v1/clientes?email=...`.
- Crear una cotización con `POST /api/v1/cotizaciones`.
- Enviarla o marcarla pagada con `POST /api/v1/cotizaciones/{id}` y `action`.
- Crear una tarea con `POST /api/v1/tareas`.

Los campos de cada endpoint están en la [documentación para desarrolladores](/docs/desarrolladores/funciones/clientes).
