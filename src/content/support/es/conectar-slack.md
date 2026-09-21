---
title: "Conectar Slack"
description: "Recibe en tu canal un aviso cada vez que una cotización se envía, se abre, se aprueba o se paga."
category: "Cuenta y Equipo"
order: 21
---

Cord publica tus avisos en el canal de Slack que elijas.

### Conectarlo

1. Ve a **Ajustes › Integraciones › Slack** y pulsa **Añadir a Slack**.
2. En Slack elige el canal donde quieres los avisos y pulsa **Permitir**.
3. De vuelta en Cord, pulsa **Enviar prueba** para confirmar que el mensaje llega.

Slack agrega a tu espacio una app llamada **Cord**, que es la que firma los mensajes. Si tu espacio restringe la instalación de apps, un administrador de Slack tendrá que aprobarla.

### Con un webhook propio

Si prefieres que los mensajes salgan con el nombre de tu propia app de Slack, abre **Usar un webhook propio** en la misma tarjeta, pega una URL de Incoming Webhook (empieza con `https://hooks.slack.com/services/`) y pulsa **Guardar**.

### Qué avisos llegan

Los eventos que elijas en **Ajustes › Notificaciones**. Ahí decides qué se avisa por correo y qué se avisa por Slack.

Además puedes mandar mensajes propios desde un workflow con la acción **Enviar un mensaje a Slack**, con tu texto y los datos de la venta.

### Cambiar de canal o desconectar

Pulsa **Cambiar de canal** para elegir otro en Slack, o **Desconectar** para que Cord deje de publicar.
