---
title: "Automatizar con Cord Workflows"
description: "Crea flujos que reaccionan a lo que pasa en Cord: cuando se aprueba una cotización, crea una tarea, escríbele al cliente, avisa en Slack o manda los datos a otra herramienta."
category: "Cotizaciones"
order: 40
---

Un workflow es una regla: **cuando pase esto, haz esto**. Cord dispara el workflow con lo que ocurre en tu cuenta —una cotización enviada, aprobada o pagada, un cliente nuevo, una promesa de pago incumplida— y ejecuta los pasos que definiste.

### Crear tu primer workflow

1. Abre **Workflows** en el menú lateral y pulsa **Nuevo workflow**.
2. Si es tu primer workflow, Cord te ofrece ideas listas (por ejemplo "Seguimiento si el cliente no abre"). Puedes empezar con una y modificarla.
3. Elige el **disparador**: un evento de Cord, o un **horario fijo** ("cada lunes a las 9", en la zona horaria de tu cuenta). Además de lo que ya pasó, hay tres disparadores que se adelantan a una fecha —**Se acerca el vencimiento de una cotización**, **Se acerca el vencimiento de una factura** y **Una factura lleva días vencida**—: traen los días que faltan o que ya pasaron, y con una condición eliges el día exacto en que quieres actuar.
4. Agrega pasos con **Agregar un paso**:
   - **Acción:** crear una tarea, avisar al equipo por correo, escribirle al cliente con tu marca, caducar una cotización, aprobar una solicitud interna, anular una factura, mandar los datos a una URL (Zapier, Make, n8n o tu servidor), mandar un mensaje a Slack o a Microsoft Teams, o dejar una nota en HubSpot.
   - **Condición:** el flujo sigue por una rama u otra según el dato, por ejemplo si el total es mayor a cierto monto. En los eventos de actualización (cotización reenviada, cliente y producto) también puedes preguntar si un campo **cambió**, no solo cuánto vale.
   - **Espera:** detiene el flujo los días que indiques y después continúa. **Esperar hasta que...** además vigila una condición y sigue en cuanto se cumple, con un plazo máximo.
   - **Consulta:** trae un dato de tu cuenta —cartera vencida, pipeline, lo cobrado, saldo del cliente— para usarlo en el mensaje o en la condición de los pasos siguientes.
5. Pulsa **Probar** para correr el borrador con tu último evento real: ves qué pasos se cumplirían y con qué texto, sin mandar nada.
6. Pulsa **Publicar**. Un workflow en borrador no se ejecuta.

En los textos puedes insertar datos del evento, como `{{cliente}}`, `{{folio}}` o `{{total}}`. Cord solo ofrece los campos que ese disparador tiene. Además, en cualquier workflow tienes los datos de tu negocio: `{{negocio}}`, `{{negocio_correo}}`, `{{negocio_telefono}}`, `{{negocio_moneda}}` y `{{hoy}}`.

### Revisar lo que pasó

Arriba de la lista de workflows verás cómo van tus automatizaciones en los últimos 30 días: ejecuciones, completadas, fallidas y en espera, con las causas más frecuentes de fallo y en qué workflow pasó la última.

La pestaña **Ejecuciones** muestra cada vez que se disparó el workflow: cuándo, qué paso corrió y el resultado. Si un paso falla, ahí aparece el error y Cord lo reintenta.

Un paso que falla por algo pasajero se reintenta solo. Si el problema no se resuelve, la ejecución queda marcada con error para que puedas verla.

### Lo que un workflow nunca hace

- No cobra, no emite facturas ni CFDI y no registra pagos. Esas decisiones siguen siendo de una persona.
- No aprueba ni rechaza una cotización en nombre de tu cliente.
- Cuando le escribe al cliente, lo hace al correo del cliente del documento, nunca a una dirección escrita en el paso; ese correo consume un envío de tu plan.
- No se dispara con sus propios eventos, así que dos workflows no pueden entrar en un ciclo infinito.

### Acciones que necesitan una conexión

- **Mensaje a Slack:** requiere el webhook de Slack en Ajustes › Integraciones.
- **Mensaje a Teams:** requiere el flujo de Power Automate del canal, en Ajustes › Integraciones.
- **Nota en HubSpot:** requiere HubSpot conectado. La nota se deja en el Deal de la cotización o, si no hay Deal, en la Empresa del cliente.
- **Mandar los datos a una URL:** requiere una dirección `https` de un servidor público. Cord manda un POST con el evento en JSON; no lleva firma, así que para verificar el origen usa los webhooks del dock de Desarrolladores.

Si la conexión no existe, la ejecución queda con un error que te dice qué falta.

### Cuántos puedes tener activos

El número de workflows activos depende de tu plan; lo ves arriba de la lista. Puedes tener los borradores que quieras.
