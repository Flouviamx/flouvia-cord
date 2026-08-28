---
title: "Aprobar y rechazar tratos (Flujo de clientes)"
description: "Cómo funciona la aprobación de cotizaciones desde la perspectiva del cliente final."
category: "Cotizaciones"
order: 2
---

Cord permite configurar un flujo de aprobación interno para evitar que los vendedores envíen cotizaciones con descuentos excesivos sin supervisión.

### Configurar Reglas de Aprobación

1. Ve a **Ajustes > Cotizaciones > Aprobaciones**.
2. En **Umbrales** define hasta tres topes independientes (deja cualquiera en 0 para desactivarlo):
   - **Descuento máximo (%):** el % de descuento sobre precio de lista de cualquier partida.
   - **Monto máximo:** el total de la cotización, en la divisa de venta.
   - **Margen bruto mínimo (%):** solo aplica a partidas que tengan capturado un costo unitario.
3. Guarda los cambios. No hay un constructor de reglas de texto libre: son estos tres umbrales numéricos, evaluados juntos — basta con que uno se rebase para requerir aprobación.

### Experiencia del Vendedor
Cuando un vendedor intenta enviar una cotización que rebasa alguno de los tres umbrales, la cotización se guarda como borrador pendiente en lugar de enviarse, y queda marcada con el motivo exacto (por ejemplo, "descuento 22% supera el 15% permitido"). Solo los miembros del equipo con el permiso **Aprobar** —normalmente owner/admin, configurable por persona en **Ajustes > Equipo y Roles**— ven los botones **Aprobar y enviar** / **Rechazar** en la cotización.

Al aprobar, la cotización se envía al cliente en ese momento y el link público queda disponible. Mientras está pendiente o si se rechaza, el link no se comparte con el cliente — no es que la URL exista y regrese un error: la cotización simplemente no ha sido enviada.
