---
title: "[EN] Emitir reembolsos a clientes"
description: "Cómo reembolsar un pago de forma parcial o total directo a la tarjeta del comprador."
category: "Payments & Deposits"
order: 4
---

El proceso de reembolsos (Refunds) involucra dos áreas: la pasarela de pagos (donde está el dinero) y Cord (donde está tu contabilidad y CFDI).

### Paso 1: Devolver el Dinero (Stripe)
Cord no puede mover el dinero de vuelta a la tarjeta del cliente.
1. Entra a tu [Dashboard de Stripe](https://dashboard.stripe.com/).
2. Localiza el cargo exitoso y haz clic en **Reembolsar** (Refund).
3. Stripe solicitará al banco emisor que devuelva el dinero.

### Paso 2: Corrección Fiscal en Cord (Nota de Crédito)
Emitir el reembolso en Stripe NO cancela la factura ante el SAT.
1. Ve a Cord en **Contabilidad > Facturas** y localiza la factura original.
2. En el menú de opciones (tres puntos), selecciona **Generar Nota de Crédito** (Egreso).
3. Cord vinculará automáticamente el UUID de la factura padre usando el tipo de relación `01`.
4. Haz clic en **Timbrar Egreso**. Esto deducirá contablemente el ingreso y le entregará a tu cliente su XML de comprobación.
