---
title: "Facturar anticipos"
description: "Emite el CFDI de anticipo y su remanente."
category: "Facturación y CFDI"
---

Facturar proyectos grandes donde cobras un porcentaje por adelantado y el resto a la entrega requiere un manejo especial ante el SAT.

### Regla Fiscal para Anticipos

Según la guía de llenado del SAT, un anticipo solo existe cuando **no se conoce o no se ha determinado el bien o servicio, o su precio final**. Si ya enviaste una cotización detallada de $100,000 MXN y pides el 50% de entrada, contablemente **no es un anticipo**, es un pago en parcialidades.

### Cómo cobrar en parcialidades en Cord

1. Crea tu Cotización por el monto total ($100,000).
2. En la sección *Pagos y Anticipos*, selecciona **Requerir pago inicial parcial**.
3. Define el porcentaje (ej. 50%).
4. Cuando el cliente acepta y paga esos $50,000 con tarjeta, Cord emitirá una Factura por el monto total en método `PPD` (Pago en Parcialidades).
5. En ese mismo instante, Cord timbrará automáticamente un **Complemento de Recepción de Pagos (REP)** amparando el depósito de los $50,000 iniciales.

Cuando llegue la entrega final, solo tienes que entrar a la factura y generar un link de cobro por el saldo restante. Al pagarse, Cord emitirá el segundo y último REP.
