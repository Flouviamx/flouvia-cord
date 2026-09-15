---
title: "Automatizar con Cord Workflows"
description: "Crea flujos que reaccionan a lo que pasa en Cord: cuando se aprueba una cotización, crea una tarea, avisa en Slack o deja una nota en HubSpot."
category: "Cotizaciones"
order: 40
---

Un workflow es una regla: **cuando pase esto, haz esto**. Cord dispara el workflow con lo que ocurre en tu cuenta —una cotización enviada, aprobada o pagada, un cliente nuevo, una promesa de pago incumplida— y ejecuta los pasos que definiste.

### Crear tu primer workflow

1. Abre **Workflows** en el menú lateral y pulsa **Nuevo workflow**.
2. Si es tu primer workflow, Cord te ofrece ideas listas (por ejemplo "Seguimiento si el cliente no abre"). Puedes empezar con una y modificarla.
3. Elige el **disparador**: el evento de Cord que arranca el flujo.
4. Agrega pasos con **Agregar un paso**:
   - **Acción:** crear una tarea, avisar al equipo por correo, mandar un mensaje a Slack o dejar una nota en HubSpot.
   - **Condición:** el flujo sigue por una rama u otra según el dato, por ejemplo si el total es mayor a cierto monto.
   - **Espera:** detiene el flujo los días que indiques y después continúa.
5. Pulsa **Publicar**. Un workflow en borrador no se ejecuta.

En los textos puedes insertar datos del evento, como `{{cliente}}`, `{{folio}}` o `{{total}}`. Cord solo ofrece los campos que ese disparador tiene.

### Revisar lo que pasó

La pestaña **Ejecuciones** muestra cada vez que se disparó el workflow: cuándo, qué paso corrió y el resultado. Si un paso falla, ahí aparece el error y Cord lo reintenta.

Un paso que falla por algo pasajero se reintenta solo. Si el problema no se resuelve, la ejecución queda marcada con error para que puedas verla.

### Lo que un workflow nunca hace

- No le escribe al cliente: el correo va a tu equipo.
- No cobra ni emite facturas. Esas decisiones siguen siendo de una persona.
- No se dispara con sus propios eventos, así que dos workflows no pueden entrar en un ciclo infinito.

### Acciones que necesitan una conexión

- **Mensaje a Slack:** requiere el webhook de Slack en Ajustes › Integraciones.
- **Nota en HubSpot:** requiere HubSpot conectado. La nota se deja en el Deal de la cotización o, si no hay Deal, en la Empresa del cliente.

Si la conexión no existe, la ejecución queda con un error que te dice qué falta.

### Cuántos puedes tener activos

El número de workflows activos depende de tu plan; lo ves arriba de la lista. Puedes tener los borradores que quieras.
