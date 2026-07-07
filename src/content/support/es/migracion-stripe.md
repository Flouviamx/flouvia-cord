---
title: "Cord junto a tu Stripe"
description: "Cómo encaja Cord con tu cuenta de Stripe actual y cómo traer tus datos."
category: "Desarrolladores"
order: 5
---

Una aclaración importante: **Cord no reemplaza a Stripe — lo usa.** Los cobros en línea de tus cotizaciones los procesa **tu propia cuenta de Stripe** vía Stripe Connect (Cord nunca toca los fondos). Lo que Cord agrega encima es lo que Stripe no hace en México: cotizaciones B2B interactivas, listas de precios, crédito, cobranza y timbrado CFDI 4.0.

Por eso no hay una "migración" en el sentido de mover tarjetas o suscripciones. Lo que haces es **conectar tu Stripe y traer tu catálogo**.

### Equivalencias de conceptos

| Objeto en Stripe | En Cord | Nota |
| :--- | :--- | :--- |
| `Customer` | Cliente | En Cord un cliente lleva RFC, razón social, términos de crédito y datos fiscales para CFDI. |
| `Product` / `Price` | Producto | Los productos de Cord pueden llevar costo (para margen) y, a futuro, clave SAT. |
| `Invoice` / `Checkout` | Cotización | Una cotización aprobada se cobra con Stripe y, al facturarse, genera el CFDI 4.0. |

> Cord no tiene un motor de suscripciones recurrentes para los clientes de tu negocio. Si vendes suscripciones, eso sigue viviendo en Stripe Billing; Cord cubre el lado de cotización y facturación CFDI.

### Paso 1: Conecta tu Stripe

Ve a **Ajustes › Cobros** y completa el onboarding embebido para conectar tu cuenta. Sin Stripe conectado, el link público de tus cotizaciones sigue funcionando, pero no permitirá el cobro en línea.

### Paso 2: Importa tu catálogo

No necesitas API para esto:

1. En Stripe exporta tus clientes a CSV (Clientes > Exportar).
2. En Cord ve a **Clientes > Importar** y mapea las columnas (`empresa`, `email`, `RFC`…). También puedes importar **Productos** por CSV.

Si prefieres hacerlo por código, usa la API REST: ver [API: Gestionar clientes](/soporte/api-clientes) y [API: Crear cotizaciones](/soporte/api-cotizaciones).

### Paso 3: Apunta tus webhooks

Si reaccionas a eventos desde tu backend, agrega tu URL en **Ajustes > Developers > Webhooks**. Cord emite eventos propios: `quote.sent`, `quote.viewed`, `quote.approved`, `quote.rejected`, `quote.paid` y `quote.invoiced`. Pruébalos con el botón "Probar" antes de depender de ellos.
