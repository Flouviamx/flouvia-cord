---
title: "Complementos de pago (REP)"
description: "Guía sobre la generación automática de Recibos Electrónicos de Pago para facturas PPD."
category: "Facturación y CFDI"
order: 3
---

Cuando emites una factura bajo el método de pago PPD (Pago en Parcialidades o Diferido), el SAT exige que generes un "Complemento de Recepción de Pagos" (REP) cada vez que el cliente te envíe un abono.

### Generación Manual

Dado que los clientes B2B suelen pagar grandes montos vía transferencia SPEI directo a tu banco:
1. Entra a la Factura en Cord.
2. Haz clic en **Registrar Pago**.
3. Indica la fecha en que cayó el dinero en tu banco, el monto y la cuenta receptora.
4. Cord timbrará el REP basándose en esos datos y liquidará el balance de la factura.

### Automatización vía Webhooks (Stripe)
Si el cliente paga la cotización o factura PPD utilizando el botón de pago con tarjeta (Stripe Checkout), Cord escuchará el webhook `checkout.session.completed` de tu cuenta de Stripe. Al recibirlo, Cord marcará la factura como cobrada y emitirá el REP automáticamente ante el SAT sin que tú hagas nada.
