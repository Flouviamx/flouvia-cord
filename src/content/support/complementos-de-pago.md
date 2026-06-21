---
title: "Complementos de pago (REP)"
description: "Guía sobre la generación automática de Recibos Electrónicos de Pago para facturas PPD."
category: "Facturación y CFDI"
order: 3
---

# Complementos de pago (REP)

Si emites facturas con método de pago PPD (Pago en Parcialidades o Diferido), es obligatorio por ley emitir un Complemento de Recepción de Pagos (REP) cuando recibas los fondos.

## Automatización con Cord
Cord maneja los REPs sin intervención manual:
1. Al aceptar una cotización con términos de crédito (Net 30), Cord emite una factura **PPD**.
2. Cuando el cliente paga la deuda total o parcial usando la liga de pago de Cord, el sistema detecta el abono.
3. Cord genera inmediatamente el **REP (Complemento de Pago)**, lo timbra, y se lo envía al cliente por correo electrónico, enlazándolo al UUID de la factura original.
