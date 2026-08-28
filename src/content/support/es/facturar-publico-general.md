---
title: "Facturación al Público en General"
description: "Cómo emitir un CFDI a Público en General en Cord hoy."
category: "Facturación"
---

Esto aplica solo a organizaciones en **México**. Toda venta que no facturas a un RFC específico —ventas de mostrador, cobros donde el cliente no pidió factura— debe declararse ante el SAT bajo el RFC genérico de Público en General.

### Cómo hacerlo en Cord hoy

1. Al crear la cotización o factura, usa un cliente sin identificador fiscal capturado (o crea uno llamado "Público en general" y déjale el campo de RFC vacío).
2. Al timbrar, Cord detecta que no hay RFC específico y usa automáticamente el RFC genérico **XAXX010101000** con el nombre **PÚBLICO EN GENERAL**, tal como lo exige el SAT.

<Callout type="warning">
Cord no tiene todavía una herramienta que agrupe automáticamente varias ventas del periodo en una sola Factura Global periódica (diaria, semanal o mensual). Hoy, cada venta a público en general se timbra como un CFDI individual con el RFC genérico. Si tu negocio necesita consolidar varias ventas en una sola Factura Global por periodicidad, coordina ese cálculo con tu contador mientras construimos esa automatización.
</Callout>
