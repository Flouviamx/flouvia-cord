---
title: "Conectar WhatsApp Business"
description: "Manda recordatorios y avisos por WhatsApp desde tus workflows, con tu plantilla aprobada por Meta."
category: "Cuenta y Equipo"
order: 23
---

Cord manda WhatsApp con la **Cloud API de Meta** y con **tu** cuenta: los mensajes salen de tu número y el costo por conversación lo cobra Meta a tu cuenta, no Cord.

### Antes de empezar

Meta no permite iniciar una conversación con texto libre: solo con una **plantilla aprobada**. Por eso Cord te pide el nombre de tu plantilla y rellena sus variables; no hay un campo de texto libre, porque el mensaje sería rechazado.

### Los pasos

1. En [Meta for Developers](https://developers.facebook.com), crea una app de **WhatsApp Business** y agrega tu número emisor.
2. En el **Administrador de WhatsApp**, crea una plantilla de mensaje y mándala a aprobar. Ejemplo: `Hola {{1}}, tu cotización {{2}} vence el {{3}}. Puedes verla aquí: {{4}}`.
3. Copia el **identificador del número** (solo dígitos) y genera un **token de acceso permanente**.
4. En Cord, entra a **Ajustes › Integraciones › WhatsApp Business**, pega los dos datos, escribe el nombre de la plantilla y su idioma (por ejemplo `es_MX`).
5. Pulsa **Guardar** y luego **Mandar prueba** con tu propio número, con lada de país.

El token se guarda cifrado y no se vuelve a mostrar. Para cambiar la plantilla no hace falta repegarlo: deja el campo vacío.

### Usarlo en un workflow

En **Workflows**, la acción **Mandarle un WhatsApp al cliente** manda tu plantilla al teléfono del cliente del documento. Cada variable del paso rellena `{{1}}`, `{{2}}`… en orden, y acepta datos del evento: `{{cliente}}`, `{{folio}}`, `{{total}}`, `{{vence}}`.

El teléfono sale del cliente, nunca de un campo del paso, y tiene que estar **con lada de país** (`+52 55 1234 5678`). Un número sin lada no se manda: Cord no adivina el país, porque el mismo número existe en varios.

### Si algo falla

- **"El cliente no tiene un teléfono con lada de país registrado"**: edita el cliente y guarda el número con `+` y su lada.
- **"WhatsApp no aceptó tu plantilla"**: revisa que esté aprobada, que el nombre coincida y que el número de variables del workflow sea el mismo que el de la plantilla.
- **"WhatsApp no aceptó el mensaje"**: normalmente es el token vencido o el número emisor desactivado en Meta.

### Límites

Los workflows mandan hasta 60 WhatsApp por hora por cuenta, y la prueba de Ajustes hasta 5 por hora. El costo por conversación es de Meta y depende del país.
