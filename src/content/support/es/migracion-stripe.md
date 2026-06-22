---
title: "Guía de Migración: De Stripe a Cord"
description: "Paso a paso para exportar tus clientes, suscripciones y catálogos desde Stripe e importarlos a la plataforma B2B de Cord."
category: "Desarrolladores"
order: 5
---

Si actualmente procesas pagos o suscripciones con Stripe, migrar a Cord te otorgará beneficios adicionales clave para el mercado latinoamericano (como timbrado CFDI 4.0 automático, recepción de transferencias bancarias y emisión de REPs).

La arquitectura de Cord fue diseñada con una filosofía similar a Stripe, por lo que la curva de aprendizaje para tu equipo de ingeniería será mínima.

## Diferencias Conceptuales Clave

Antes de iniciar la exportación de datos, es importante alinear los conceptos:

| Objeto en Stripe | Objeto equivalente en Cord | Diferencia |
| :--- | :--- | :--- |
| `Customer` | `Cliente` | En Cord, un Cliente requiere el `RFC` y `Razón Social` para temas de facturación B2B. |
| `Product` | `Producto` | En Cord los productos pueden llevar asignadas Claves de Producto/Servicio del SAT. |
| `Price` | `Precio` | - |
| `Subscription` | `Suscripción` | Cord puede automatizar la factura PPD mensual para suscripciones pagadas vía SPEI. |
| `Invoice` | `Cotización` / `Factura` | Una "Invoice" de Stripe se mapea como una Cotización que, al pagarse, genera un CFDI. |

## Paso 1: Exportación segura de Tarjetas (Data Migration)

Debido al cumplimiento PCI-DSS, tú no puedes exportar los números de tarjeta crudos (`PAN`) desde el dashboard de Stripe.

Para migrar la bóveda de tarjetas de tus clientes hacia Cord sin pedirles que vuelvan a ingresar sus datos, necesitas solicitar una **migración de datos PCI**:

1. Contacta al soporte de Stripe y solicita una exportación segura de datos de tarjetas hacia un procesador nivel 1 PCI-DSS.
2. Stripe te pedirá la llave PGP pública de Cord. Contacta a nuestro equipo de soporte (`soporte@flouvia.com`) para proporcionarte este archivo.
3. Stripe nos enviará directamente la bóveda encriptada. Nosotros la descifraremos e inyectaremos las tarjetas (como `Métodos de Pago` tokenizados) directamente a los perfiles de tus clientes en Cord.

*Este proceso técnico puede demorar entre 5 y 10 días hábiles por las regulaciones de Stripe.*

## Paso 2: Importar tu Catálogo de Clientes

Si no vas a migrar tarjetas de crédito (por ejemplo, si tus clientes pagan exclusivamente vía transferencia bancaria), puedes hacerlo en minutos:

1. Ve a tu Dashboard de Stripe > Clientes > **Exportar**.
2. Obtendrás un archivo `.csv`.
3. Ve a tu Dashboard de Cord > Clientes > **Importar**.
4. Selecciona el mapeo de columnas (Asegúrate de mapear `email`, `name`, y si tienes metadata con el `RFC`, asígnalo).

## Paso 3: Migración de Suscripciones (Recurrencia)

Para evitar dobles cobros durante la transición de motor de facturación:

1. Importa tus clientes y catálogo de productos a Cord.
2. Identifica el próximo ciclo de cobro de tus clientes (Ej. Día 15 del mes).
3. Escribe un script utilizando nuestra [API de Suscripciones](/desarrolladores/api) que cree las suscripciones en Cord con el parámetro `trial_end` o `billing_cycle_anchor` seteado a la fecha exacta del siguiente cobro.
4. Pausa o cancela las suscripciones activas en Stripe.

### Ejemplo de creación con ciclo diferido (Node.js)

```javascript
const cord = require('cord-node')('sk_test_tu_llave');

// Crear la suscripción programada para cobrar en la fecha futura
const subscription = await cord.subscriptions.create({
  customer: 'cus_12345',
  items: [{ price: 'price_98765' }],
  billing_cycle_anchor: 1718968200 // Unix timestamp del siguiente cobro
});
```

## Paso 4: Cambiar las URLs de los Webhooks

Finalmente, deberás apuntar la lógica de negocio de tu backend hacia Cord.

1. Ve a **Ajustes > Webhooks** en Cord.
2. Añade tu URL receptora (Ej. `https://tu-api.com/webhooks/cord`).
3. Modifica tus controladores. Si antes escuchabas el evento `invoice.paid` de Stripe, ahora escucharás el evento `invoice.payment_succeeded` de Cord.
4. Haz pruebas enviando eventos desde el **Sandbox** de Cord antes de apagar la integración productiva de Stripe.
