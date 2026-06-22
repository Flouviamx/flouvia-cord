---
title: "[EN] Emitir Nota de Crédito (Egreso)"
description: "Aplica devoluciones y bonificaciones legales."
category: "Billing & CFDI"
---

Las Notas de Crédito (CFDI tipo Egreso) son el mecanismo fiscal del SAT para aplicar devoluciones, bonificaciones o corregir errores en saldos de facturas.

### Emitir una Nota de Crédito en Cord

Si necesitas anular el saldo de una factura sin cancelarla por completo (ej. le hiciste un descuento post-venta del 10% al cliente):

1. Localiza la Factura de Ingreso original en **Contabilidad > Facturas**.
2. En el menú de opciones (tres puntos), selecciona **Generar Nota de Crédito**.
3. Se abrirá un panel con los conceptos originales de la factura. Cord inyectará automáticamente el tipo de relación **01 (Nota de crédito de los documentos relacionados)** y vinculará el UUID de la factura padre.
4. Ajusta el monto a devolver/bonificar. Si es una devolución total de un producto específico, deja el precio intacto. Si es una bonificación, ajusta el valor al monto a descontar.
5. Haz clic en **Timbrar Egreso**.

El sistema enviará automáticamente un correo electrónico al cliente adjuntando el XML y el PDF de la Nota de Crédito para sus efectos de deducción fiscal.
