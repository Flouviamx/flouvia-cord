---
title: "Migrar tus cobros a Cord"
description: "Cómo activar Cord Payments y traer clientes, productos y procesos actuales."
category: "Desarrolladores"
order: 5
---

Cord Payments integra la propuesta, la aceptación y el pago en un solo link. Los fondos llegan a tu cuenta de pagos conectada; Cord no conserva saldos ni actúa como banco.

La migración consiste en activar cobros, importar tus datos comerciales y mover gradualmente tus nuevos flujos a Cord. Las tarjetas guardadas en otro sistema no se copian: cada cliente autoriza su método de pago dentro del nuevo flujo seguro.

### Equivalencias de conceptos

| Objeto actual | En Cord | Nota |
| :--- | :--- | :--- |
| Cliente | Cliente | Conserva contacto, razón social, términos comerciales y datos fiscales. |
| Producto o precio | Producto | Incluye precio, costo, impuestos y claves fiscales cuando aplican. |
| Factura o link de cobro | Cotización | Reúne propuesta, aprobación, calendario de cobro y CFDI. |

Las igualas mensuales pueden configurarse como cotizaciones recurrentes. El cliente autoriza su tarjeta una vez y Cord registra cada cobro mensual en el historial de la cuenta.

### Paso 1: Activa Cord Payments

Ve a **Ajustes › Cobros** y completa el onboarding embebido para conectar tu cuenta de pagos. Sin una cuenta activa, el link público de tus cotizaciones sigue funcionando, pero no permitirá el cobro en línea.

### Paso 2: Importa tu catálogo

No necesitas API para esto:

1. Desde tu sistema actual, exporta tus clientes a CSV.
2. En Cord ve a **Clientes > Importar** y mapea las columnas (`empresa`, `email`, `RFC`…). También puedes importar **Productos** por CSV.

Si prefieres hacerlo por código, usa la API REST: ver [API: Gestionar clientes](/soporte/api-clientes) y [API: Crear cotizaciones](/soporte/api-cotizaciones).

### Paso 3: Apunta tus webhooks

Si reaccionas a eventos desde tu backend, agrega tu URL en la pestaña **Webhooks** del dock de Desarrolladores (actívalo en Ajustes > Empresa). Cord emite eventos propios: `quote.sent`, `quote.viewed`, `quote.approved`, `quote.rejected`, `quote.paid` y `quote.invoiced`. Pruébalos con el botón "Probar" antes de depender de ellos.
