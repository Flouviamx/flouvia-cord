---
title: "Presupuesto vs. Real: compara tu plan contra lo que de verdad pasó"
description: "Conecta filas de tus cédulas a tus ventas cerradas, unidades vendidas o cobranza recibida y ve la variación mes a mes, sin capturar nada."
category: "Presupuestos y análisis"
order: 2
---

**Presupuesto vs. Real** es lo que una hoja de cálculo no puede hacer: como tus ventas y tu cobranza ya viven en Cord, tu presupuesto puede compararse contra la realidad **automáticamente, mes a mes**. Debajo de cada celda presupuestada aparece el dato real de ese mes con su variación — verde si vas arriba del plan, roja si vas abajo.

> [!NOTE]
> Disponible desde el plan **Profesional**. En planes sin la función, el botón de conexión te muestra qué desbloquea.

## Conectar una fila

1. Abre una cédula en **Presupuestos** y ubica la fila que quieres comparar (puede ser de insumo o de fórmula).
2. Presiona el **ícono de enlace** junto al nombre de la fila.
3. Elige la fuente de datos:
   - **Ventas cerradas ($)** — el total de tus cotizaciones aprobadas, pagadas o facturadas, por mes de cierre.
   - **Unidades vendidas** — las cantidades de las líneas aceptadas de esas cotizaciones.
   - **Cobranza recibida ($)** — el dinero realmente cobrado (pagos de cotizaciones, anticipos, saldos y cuotas), por mes de cobro.
4. Guarda. La fila queda marcada con el enlace en verde y la etiqueta "vs." con su fuente; la cédula muestra el distintivo **Conectada a datos reales**.

Para cambiar la fuente o desconectar la fila, vuelve a presionar el ícono de enlace.

## Cómo se empatan los meses

Cord lee la **etiqueta de cada periodo** para saber contra qué mes comparar:

- Funcionan formatos como `Ene 2026`, `Enero 2026`, `2026-01` o `01/2026`.
- Etiquetas sin mes y año reconocibles (ej. `Q1`, `Semana 3`, o `Ene` sin año) **no muestran dato real** — la celda presupuestada se ve normal, sin línea de real debajo.
- Los **meses futuros** tampoco muestran real: el dato aparece cuando el mes llega.
- Un mes ya transcurrido **sin actividad** muestra `real 0` — eso también es información.

> [!TIP]
> Si creas la cédula con los presets de periodos (Trimestre, 6 meses, Año completo), las etiquetas ya salen en el formato correcto.

## Leer la variación

Bajo cada celda verás `real $X` seguido de una pastilla con el porcentaje contra lo presupuestado:

- **Verde (+13%)** — el real alcanzó o superó tu presupuesto.
- **Roja (−8%)** — el real quedó abajo del plan.

La comparación usa los mismos criterios que el resto de los reportes de Cord: las ventas cerradas siguen el criterio de Analítica y la cobranza suma los pagos realmente recibidos, sin dobles conteos.

## El atajo: plan completo ya conectado

Si creas tu presupuesto con el **Plan financiero completo** (el asistente de un clic), las filas de Ventas y Cobranza ya vienen conectadas a sus fuentes reales — no tienes que configurar nada.
