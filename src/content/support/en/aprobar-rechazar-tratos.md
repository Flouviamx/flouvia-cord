---
title: "[EN] Aprobar y rechazar tratos (Flujo de clientes)"
description: "Cómo funciona la aprobación de cotizaciones desde la perspectiva del cliente final."
category: "Quotes"
order: 2
---

Cord permite configurar un flujo de aprobación interno para evitar que los vendedores envíen cotizaciones con descuentos excesivos sin supervisión.

### Configurar Reglas de Aprobación

1. Ve a **Ajustes > Ventas y Cotizaciones**.
2. Busca la sección de **Flujos de Aprobación Internos**.
3. Añade una regla, por ejemplo: *"Si el Descuento Total supera el 15%, requiere aprobación de un Gerente"*.

### Experiencia del Vendedor
Cuando un vendedor intente enviar una cotización que rompa esta regla, el botón de "Enviar al cliente" cambiará a **"Solicitar Aprobación"**. El administrador o gerente recibirá una notificación (correo y dentro de la app).

Una vez que el gerente revisa y hace clic en **Aprobar Trato**, el vendedor recibe luz verde y la URL pública de la cotización se activa. Si es rechazada, la URL arrojará un error 404 al cliente final hasta que se corrijan las condiciones.
