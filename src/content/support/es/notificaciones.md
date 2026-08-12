---
title: "Notificaciones por correo y Slack"
description: "Entérate por correo o Slack cuando tu cliente ve, aprueba, rechaza o paga una cotización."
category: "Cuenta y Equipo"
order: 5
---

En **Ajustes › Notificaciones** eliges qué eventos te avisan y por dónde: correo (siempre a la cuenta del dueño del negocio) y Slack (si conectas un canal en Ajustes › Integraciones).

### Eventos disponibles

- Cotización vista
- Cotización aprobada
- Cotización rechazada
- Pago recibido
- Cotización por vencer (3 días antes)
- Pago vencido
- Alguien se unió al equipo

Marca la casilla de correo y/o Slack para cada evento; se guarda al instante.

<Callout type="info">
Si nunca has tocado esta pantalla, Cord ya te avisa por correo cuando una cotización se aprueba, se rechaza o se paga — son los tres eventos de mayor valor y vienen encendidos por default. En cuanto guardas la pantalla una vez, tu propia selección manda sobre ese default.
</Callout>

### Slack

Necesitas un **Incoming Webhook** de tu workspace de Slack (Apps → Incoming Webhooks → Add to Slack). Pega la URL en la misma pantalla de Notificaciones y usa el botón "Enviar prueba" para confirmar que llega. El aviso "Alguien se unió al equipo" solo tiene versión de correo — no tiene folio ni monto que mostrar en un canal de Slack.
