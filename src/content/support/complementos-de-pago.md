---
title: "Complementos de pago (REP)"
description: "Guía sobre la generación automática de Recibos Electrónicos de Pago para facturas PPD."
category: "Facturación y CFDI"
order: 3
---

Cuando emites una factura bajo el método de pago PPD (Pago en Parcialidades o Diferido), el SAT exige que generes un "Complemento de Recepción de Pagos" (REP) cada vez que el cliente te envíe un abono.

### Automatización Mágica en Cord

Si utilizas las facturas y links de pago de Cord en conjunto, **tú no tienes que hacer absolutamente nada**.
1. Cotizas y facturas en PPD (ej. a 30 días de crédito).
2. El cliente te paga el día 25 usando el link de la factura.
3. En el milisegundo en que el banco aprueba la tarjeta o recibimos el SPEI, Cord emite el Complemento de Pago (REP) ante el SAT, lo relaciona con el UUID de la factura PPD, y se lo envía por correo al cliente.

### Complemento Manual (Pago externo)
Si el cliente te hizo una transferencia a una cuenta de banco externa que no controlamos:
1. Entra a la Factura en Cord.
2. Haz clic en **Registrar Pago**.
3. Indica la fecha, el monto y la cuenta receptora.
4. Cord timbrará el REP basándose en esos datos y liquidará el balance de la factura.
