---
title: "Conectar Cord con Zapier"
description: "Acepta la invitación de la app de Cord en Zapier, autoriza el acceso con un clic y crea Zaps que arrancan cuando pasa algo en Cord."
category: "Desarrolladores"
order: 5
---

La app de Cord para Zapier te deja arrancar un Zap cuando una cotización avanza y crear o actualizar datos en Cord desde cualquier otra app.

### Conectarla

1. En Cord abre **Ajustes › Integraciones › Zapier** y pulsa **Abrir Cord en Zapier**. Acepta la invitación.
2. En Zapier crea un Zap, elige Cord y pulsa **Conectar**.
3. En la pantalla de Cord elige el espacio de trabajo y pulsa **Autorizar**. No hay llaves que crear ni que pegar.

Necesitas acceso a **Ajustes** en ese espacio para autorizar.

### Qué puedes hacer

- **Disparadores:** cotización creada, enviada, abierta, aprobada, rechazada o pagada; pago parcial; factura pagada; cliente nuevo o cualquier evento de Cord.
- **Acciones:** crear y actualizar clientes, crear y enviar cotizaciones, marcarlas pagadas y crear tareas.
- **Búsquedas:** cliente por correo o nombre y cotización por folio.

Cada Zap activo crea su propio webhook en Cord, con un cupo de 100 por organización aparte de los endpoints de tu plan.

Para cortar el acceso, abre **Ajustes › Modo desarrollador › API** y revoca la conexión de Zapier (aparece como **Conexión autorizada**). Los Zaps te pedirán volver a conectar la cuenta.
