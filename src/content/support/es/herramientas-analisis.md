---
title: "Herramientas de análisis: proyectos (VPN/TIR), inventario y variaciones"
description: "Calculadoras de decisión con escenarios guardables: evaluación de proyecto, punto óptimo de inventario (EOQ) y análisis de variaciones estándar vs. real."
category: "Presupuestos y análisis"
order: 3
---

Además de las cédulas presupuestales, la sección **Presupuestos** incluye una pestaña de **Herramientas**: tres calculadoras de decisión con resultados en vivo y escenarios que puedes guardar y volver a abrir.

> [!NOTE]
> Las Herramientas requieren el permiso de **analítica** y el plan **Profesional** o superior. Solo se guardan los datos que capturas; los resultados se calculan al momento.

## Evaluación de proyecto (VPN)

Para decidir si una inversión conviene. Capturas la inversión inicial, la tasa de descuento, el número de años y el flujo neto anual (uniforme o distinto cada año). Obtienes:

- **Valor Presente Neto (VPN)** — con una etiqueta de **Se acepta / Se rechaza**.
- **Tasa Interna de Retorno (TIR)** — para compararla contra tu tasa de descuento.
- **Periodo de recuperación** — en cuántos años recuperas la inversión.
- **Factor de anualidad** — cuando el flujo es uniforme.

Si no conoces el flujo anual, abre el **asistente**: captura la ganancia antes de depreciación e impuestos, la depreciación y la tasa de ISR, y Cord deriva el flujo neto y lo aplica automáticamente.

## Punto óptimo de inventario (EOQ)

Para saber cuánto pedir y cuándo. Capturas la demanda anual, el costo de ordenar, el costo de mantener, el tiempo de entrega y los días hábiles al año. Obtienes:

- **Cantidad económica de pedido (CEP)** — el tamaño de pedido que minimiza el costo total.
- **Punto de reorden** — el nivel de inventario en el que conviene volver a pedir.
- **Órdenes al año** y el **costo total anual** desglosado en ordenar y mantener.

## Análisis de variaciones (presupuesto flexible)

Para comparar lo que **debería** costar tu producción contra lo que **realmente** costó. Capturas las unidades producidas y una lista de conceptos (materia prima, mano de obra, etc.), cada uno con su cantidad y precio estándar y real. Cord descompone la diferencia en:

- **Variación de precio** — cuánto se debe a pagar distinto por unidad.
- **Variación de cantidad** — cuánto se debe a usar más o menos insumo.

Cada variación se marca con una etiqueta **F** (Favorable, costó menos de lo estándar) o **D** (Desfavorable, costó más). La suma de precio y cantidad siempre cuadra con la variación total.

## Guardar y reutilizar escenarios

Cualquier calculadora se puede guardar con **Guardar escenario** (le pones nombre). Los escenarios aparecen en la lista de arriba; haz clic en uno para volver a cargarlo. Si editas un escenario cargado, puedes **Guardar cambios** sobre el mismo o **Guardar como nuevo** para conservar el original.
