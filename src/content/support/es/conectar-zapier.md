---
title: "Conectar Cord con Zapier"
description: "Acepta la invitación de la app de Cord en Zapier, pega una llave de API y crea Zaps que arrancan cuando pasa algo en Cord."
category: "Desarrolladores"
order: 5
---

La app de Cord para Zapier te deja arrancar un Zap cuando una cotización avanza y crear o actualizar datos en Cord desde cualquier otra app.

### Conectarla

1. En Cord abre **Ajustes › Integraciones › Zapier** y pulsa **Abrir Cord en Zapier**. Acepta la invitación.
2. Activa el **Modo desarrollador** (el interruptor al fondo del índice de Ajustes), abre la pestaña **API** y crea una **llave secreta** con permiso de escritura.
3. En Zapier crea un Zap, elige Cord y pega la llave cuando te la pida.

### Qué puedes hacer

- **Disparadores:** cotización creada, enviada, abierta, aprobada, rechazada o pagada; pago parcial; factura pagada; cliente nuevo o cualquier evento de Cord.
- **Acciones:** crear y actualizar clientes, crear y enviar cotizaciones, marcarlas pagadas y crear tareas.
- **Búsquedas:** cliente por correo o nombre y cotización por folio.

Cada Zap activo crea su propio webhook en Cord, con un cupo de 100 por organización aparte de los endpoints de tu plan.

Si crees que una llave se filtró, revócala en la pestaña **API** y crea otra; el Zap te pedirá volver a conectar la cuenta.
