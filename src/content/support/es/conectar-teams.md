---
title: "Conectar Microsoft Teams"
description: "Recibe en tu canal de Teams una tarjeta cada vez que una cotización se abre, se aprueba o se paga, y publica desde tus workflows."
category: "Cuenta y Equipo"
order: 22
---

Cord publica en Teams a través de un **flujo de Power Automate**. Los conectores antiguos de Teams (los "Incoming Webhook" de Office 365) están retirados por Microsoft, así que la URL que necesitas la da el flujo, no el canal.

### Crear el flujo en Teams

1. Abre en Teams el canal donde quieres los avisos.
2. En el menú de los tres puntos del canal, entra a **Workflows**.
3. Busca la plantilla **"Post to a channel when a webhook request is received"** y ábrela.
4. Confirma la cuenta, elige el equipo y el canal, y termina el asistente.
5. Copia la **URL del flujo**. Empieza por `https://prod-…logic.azure.com`.

La URL es una credencial: cualquiera que la tenga puede publicar en ese canal. Si se filtra, borra el flujo y crea otro.

### Pegar la URL en Cord

1. En Cord, entra a **Ajustes › Integraciones › Microsoft Teams**.
2. Pega la URL y pulsa **Guardar**.
3. Pulsa **Enviar prueba**: debe aparecer una tarjeta de ejemplo en el canal.

### Elegir qué se publica

En **Ajustes › Notificaciones** marca la columna **Teams** en los eventos que quieras: cotización vista, aprobada, rechazada, pagada, por vencer y pago vencido. Cada canal se marca por separado, así que puedes mandar unos eventos a Teams y otros a Slack o al correo.

### Usar Teams en un workflow

En **Workflows**, la acción **Enviar un mensaje a Teams** publica el texto que tú escribas, con los datos del evento (`{{cliente}}`, `{{folio}}`, `{{total}}`). Es independiente de la matriz de notificaciones: el workflow publica aunque esos avisos estén apagados.

### Si algo falla

- **"La URL de Teams debe ser la del flujo de Power Automate del canal"**: pegaste otra dirección. Revisa que empiece por `https://` y termine en un dominio de `logic.azure.com`.
- **"Teams no aceptó la tarjeta"**: el flujo se apagó o se borró en Teams. Ábrelo en Workflows y actívalo, o crea otro y pega la URL nueva.
