---
title: "Tareas y recordatorios del equipo"
description: "Crea pendientes con responsable, fecha y prioridad, organízalos por urgencia y recibe cada mañana un correo con lo que vence hoy y lo vencido."
category: "Cotizaciones"
order: 5
---

Las tareas son los pendientes de tu equipo: la llamada de seguimiento, el envío que falta, el contracargo que hay que responder. Cada una tiene **responsable**, **fecha límite** y **prioridad**, y Cord le avisa por correo a quien le toca.

### Dónde están

- **Inicio:** el widget **Tareas y recordatorios** muestra las más urgentes y un capturador para agregar una nueva.
- **Tareas**, en el menú lateral (atajo `G` y luego `T`): todas las tareas, con filtros **Mías**, **Todas** y **Sin asignar**, y la pestaña **Completadas**.
- **Crear › Tarea** en la barra superior (o la tecla `T`), desde cualquier pantalla. También con **Nueva tarea** en el buscador `⌘ K` (`Ctrl K` en Windows).

### Crear una tarea

1. Escribe la tarea, por ejemplo "Llamar a Luis para preguntar si ya revisó la cotización".
2. Elige la fecha con **Hoy**, **Mañana** o **Lunes**, o con el calendario. Puedes dejarla sin fecha.
3. Si es urgente, marca **Prioridad alta**.
4. Si tu cuenta tiene más de una persona, elige el **responsable**. Si no eliges, la tarea es de quien la escribe.
5. Pulsa **Agregar** o `Enter`.

### Organizar el día

- Las tareas se agrupan en **Vencidas**, **Hoy**, **Mañana**, **Esta semana**, **Más adelante** y **Sin fecha**, según el día en la zona horaria de tu negocio.
- Marca el círculo para completarla. Durante unos segundos puedes pulsar **Deshacer**.
- El menú **···** de cada tarea permite **Editar** (título, notas, fecha, prioridad y responsable), **Posponer** a mañana, al lunes o una semana, **Asignármela** y **Eliminar**.
- Si la tarea viene de una cotización o factura, su folio y el cliente aparecen como enlace al documento.
- En el menú lateral, **Tareas** lleva un contador con las tuyas o sin responsable que vencen hoy o ya vencieron. Es gris, y se vuelve naranja cuando alguna ya está vencida.

### El recordatorio por correo

Cada mañana, a partir de las 8:00 de la zona horaria de tu negocio, cada responsable recibe **un solo correo** con sus tareas de hoy y las vencidas.

- Una tarea sin responsable le llega a quien la creó; si la agregó un workflow, la API o Cord mismo (por ejemplo, un contracargo), le llega al dueño de la cuenta.
- Si pospones una tarea, vuelve a avisar en su nueva fecha.
- Una tarea vencida aparece en el correo de cada día hasta que la completes o la pospongas.
- Para apagarlo en toda la organización, desmarca **Recordatorio de tareas** en **Ajustes › Notificaciones**.

<Callout type="info">
Cord también crea tareas por ti, con prioridad alta: **Responder contracargo** cuando un cliente disputa un cargo con tarjeta, con el plazo para enviar evidencia como fecha límite, y **Transferir reembolso SPEI** cuando solicitas el reembolso de un cobro por transferencia.
</Callout>

### Preguntas frecuentes

**¿Quién puede crear o editar tareas?** Cualquier persona con permiso de Cotizaciones, Cobranza o Clientes. Sin ninguno de los tres, ves las tareas pero no puedes cambiarlas.

**No me llegó el recordatorio.** Solo llega si tienes tareas que vencen hoy o vencidas. Revisa que **Recordatorio de tareas** siga activo en Ajustes › Notificaciones y tu carpeta de spam.

**¿Puedo crear tareas automáticamente?** Sí: con la acción **Crear una tarea** de [Cord Workflows](/soporte/automatizar-con-workflows), con la API (`POST /api/v1/tareas`) o desde un asistente de IA conectado por MCP.

Guía completa: [Tareas y seguimiento](/docs/gestion/tareas).
