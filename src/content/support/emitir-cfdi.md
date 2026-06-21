---
title: "Configurar facturación automática (CFDI 4.0)"
description: "Aprende cómo habilitar la facturación automática para que tus clientes reciban su CFDI 4.0 en cuanto realicen el pago."
category: "Facturación y CFDI"
order: 1
---

# Configurar facturación automática al pago

Cord te permite automatizar completamente tu proceso de facturación. Cuando un cliente realiza el pago a través de tu cotización, Cord puede emitir y enviar automáticamente el CFDI 4.0, ahorrándote trabajo manual.

## Requisitos Previos

Antes de activar la facturación automática, necesitas haber subido tu **CSD (Certificado de Sello Digital)** en el portal de Cord.
No uses tu FIEL (e.firma), el SAT requiere el CSD específicamente para emitir facturas.

## Instrucciones paso a paso

1. Dirígete a **Ajustes > Facturación (CFDI)** en tu panel principal.
2. Sube tus archivos `.cer` y `.key` de tu CSD, y proporciona la contraseña.
3. Activa el interruptor **"Facturación Automática"**.
4. Selecciona el **Uso de CFDI predeterminado** (ej. *G03 Gastos en general*) y el **Régimen Fiscal** aplicable a tus ventas.

## ¿Qué sucede después?

Cada vez que un cliente abra una cotización aprobada para pagar, se le solicitará su Constancia de Situación Fiscal o sus datos fiscales precisos. 
Inmediatamente después de confirmarse el cargo a la tarjeta o la recepción del SPEI, Cord generará la factura (CFDI de Ingreso) y se la enviará por correo electrónico junto con los archivos PDF y XML.
