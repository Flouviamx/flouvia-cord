---
title: "Cobro en múltiples divisas"
description: "Cómo cobrar en USD y liquidar en MXN."
category: "Pagos y Depósitos"
---

Cord soporta nativamente la emisión de propuestas comerciales en más de 100 divisas (Multi-moneda).

### Crear una cotización en USD o EUR

Al momento de redactar la cotización, en la sección de **Configuración Global** (panel derecho), verás un selector de Moneda.
1. Cambia de `MXN` a `USD` o `EUR`.
2. Los precios de tus conceptos ingresados se leerán bajo esa nueva divisa.

### Pagos vía Stripe
Si tienes configurado Stripe Checkout en Cord, el cliente pagará en esa divisa. Stripe se encargará de hacer la conversión cambiaria (FX) si tu cuenta bancaria destino está en pesos mexicanos, cobrando su respectiva tarifa de conversión transfronteriza.

### Facturación y Tipo de Cambio (CFDI 4.0)
Al facturar esta operación, Cord emitirá el CFDI indicando `Moneda: USD`. El sistema calculará los impuestos en base al requerimiento del SAT, para lo cual es indispensable que, al registrar el pago, se determine el `TipoCambio` correspondiente al día de la liquidación.
