---
title: "Aplicar descuentos o promociones"
description: "Agrega descuentos por línea o totales a tu propuesta."
category: "Cotizaciones"
---

La flexibilidad en la negociación es vital. Cord no tiene un campo separado de "% de descuento": el descuento vive directamente en el precio de cada partida, más dos mecanismos que lo automatizan. No existe un descuento global sobre el subtotal — cada línea se negocia por separado.

### Cómo funciona

**1. Precio por partida:**
Cada renglón de la cotización tiene dos columnas: **Lista** (el precio de catálogo) y **Precio** (el precio final que le cobras a este cliente). Para dar un descuento, edita directamente el campo Precio — por ejemplo, bájalo de $1,000 a $800. Tu precio de lista no cambia: en esa línea aparece tachado. Si capturaste el costo del producto, la columna **Margen** muestra en tiempo real tu ganancia sobre el precio, y el resumen suma todo lo cedido en **Le descontaste**. Puedes dejar una partida a precio completo y descontar solo otra dentro de la misma cotización.

**2. Descuento automático por nivel de cliente o por volumen:**
Si el cliente tiene un **% de descuento** configurado en su ficha (**Clientes > [cliente] > nivel/descuento**), el editor lo aplica a los precios de lista de tu catálogo en cuanto lo eliges y lo indica bajo el cliente ("Nivel del cliente: −10% aplicado a los precios de lista de tu catálogo"). Puedes sobreescribir el precio a mano en cualquier línea. Si además el producto tiene precios por volumen configurados en el catálogo, el precio se ajusta según la cantidad capturada y la línea lo señala.

**Control de descuentos excesivos:**
Si tu organización tiene activado el flujo de aprobaciones (**Ajustes > Cotizaciones > Aprobaciones**), un descuento por línea que supere el % máximo configurado — o que deje el margen bruto por debajo del mínimo — bloquea el envío directo y pide aprobación antes de que la cotización llegue al cliente.

**Nota fiscal (México):** al facturar una cotización con precios negociados, el CFDI 4.0 declara el descuento en el nodo `Descuento` sobre la base gravable correcta. Fuera de México esto no aplica: el documento fiscal de cada país refleja el precio ya negociado, sin un nodo de descuento específico del SAT.
