---
title: "Conectar Cord con Make"
description: "Acepta la invitación de la app de Cord en Make, autoriza el acceso con un clic y crea escenarios que arrancan cuando pasa algo en Cord."
category: "Desarrolladores"
order: 4
---

La app de Cord para Make te deja arrancar un escenario cuando una cotización avanza y crear o actualizar datos en Cord desde cualquier otra app.

### Conectarla

1. En Cord abre **Ajustes › Integraciones › Make** y pulsa **Abrir Cord en Make**. Pulsa **Instalar**, elige tu organización de Make y confirma. Make solo deja instalar apps a quien es Administrador, Propietario o Desarrollador de aplicaciones de esa organización; si no lo eres, pídeselo a quien lo sea.
2. En Make, dentro de un escenario, agrega un módulo de Cord y pulsa **Create a connection** › **Save**.
3. En la pantalla de Cord elige el espacio de trabajo y pulsa **Autorizar**. No hay llaves que crear ni que pegar.

Necesitas acceso a **Ajustes** en ese espacio para autorizar. Para cortar el acceso, abre **Ajustes › Modo desarrollador › API** y revoca la conexión de Make (aparece como **Conexión autorizada**).

### Qué puedes hacer

- **Disparador instantáneo:** Watch Events, con los eventos de Cord que elijas.
- **Acciones:** crear, actualizar y consultar clientes; crear, consultar y enviar cotizaciones; marcarlas pagadas y crear tareas.
- **Búsquedas:** clientes y cotizaciones.
- **Make an API Call:** cualquier otra operación de la API de Cord.

### Sin instalar la app

También puedes conectar Cord con Make usando dos módulos que Make ya trae: **Webhooks** para recibir eventos de Cord y **HTTP** para llamar a la API de Cord.

#### Recibir eventos de Cord

1. En tu escenario de Make agrega el módulo **Webhooks › Custom webhook**, crea un webhook y copia la URL que te da Make.
2. En Cord activa el **Modo desarrollador** (el interruptor al fondo del índice de Ajustes) y abre la pestaña **Webhooks** en el dock de Desarrolladores.
3. Pega la URL de Make, elige los eventos que te interesan (por ejemplo `quote.approved`) y guarda.
4. En Make pulsa **Redetermine data structure** y, en Cord, usa el botón **Probar** del endpoint. Make aprende la forma del evento y ya puedes mapear campos como `data.folio`, `data.total` o `data.cliente`.

Cada evento llega con `id`, `event`, `created_at` y `data`. Usa el `id` para no procesar dos veces el mismo evento si Cord reintenta la entrega.

Make no verifica la firma de Cord por ti. Trata la URL del webhook como un secreto: no la compartas y, si crees que se filtró, borra el endpoint en Cord y crea uno nuevo.

Cada endpoint cuenta dentro del límite de webhooks de tu plan.

#### Crear o actualizar datos en Cord

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

Los campos de cada endpoint están en la [documentación para desarrolladores](https://docs.cordhq.app/docs/desarrolladores/funciones/clientes).
