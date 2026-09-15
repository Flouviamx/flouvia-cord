---
title: "Conectar Slack"
description: "Recibe en tu canal un aviso cada vez que una cotización se envía, se abre, se aprueba o se paga."
category: "Cuenta y Equipo"
order: 21
---

Cord publica en Slack con un **Incoming Webhook**: una URL que Slack te da para un canal específico.

### Crear la URL en Slack

1. Entra a [api.slack.com/apps](https://api.slack.com/apps) y crea una app desde cero para tu espacio de trabajo.
2. Abre **Incoming Webhooks** y actívalos.
3. Pulsa **Add New Webhook to Workspace**, elige el canal donde quieres los avisos y autoriza.
4. Copia la URL que empieza con `https://hooks.slack.com/services/`.

### Pegarla en Cord

1. Ve a **Ajustes › Integraciones › Slack**.
2. Pega la URL y pulsa **Guardar**.
3. Usa **Enviar prueba** para confirmar que el mensaje llega al canal.

Cord solo acepta URLs de `hooks.slack.com`.

### Qué avisos llegan

Los eventos que elijas en **Ajustes › Notificaciones**. Ahí decides qué se avisa por correo y qué se avisa por Slack.

Además puedes mandar mensajes propios desde un workflow con la acción **Enviar un mensaje a Slack**, con tu texto y los datos de la venta.

### Cambiar de canal o desconectar

Para cambiar de canal, crea otro webhook en Slack y pega la URL nueva. Para dejar de recibir avisos, borra la URL y guarda: la conexión queda sin configurar y Cord deja de publicar.
