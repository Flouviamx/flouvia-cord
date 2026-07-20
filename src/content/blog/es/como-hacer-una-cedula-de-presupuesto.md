---
title: "Cómo hacer una cédula de presupuesto: Guía paso a paso y ejemplos"
excerpt: "Aprende qué es una cédula de presupuesto, sus tipos principales (ventas, producción y costos) y cómo elaborarla paso a paso para mejorar tu control financiero."
category: "Finanzas"
date: "20 Jul 2026"
readTime: "07 MIN"
img: "/images/blog/como-hacer-cedula-presupuesto.png"
authorName: "Equipo Cord"
authorRole: "Redacción"
---

Para mantener el control financiero de cualquier empresa o proyecto, la planificación es fundamental. Una de las herramientas más importantes en este proceso es la **cédula de presupuesto** (o cédula presupuestaria).

Si alguna vez te has preguntado **cómo hacer una cédula de presupuesto** que sea clara, útil y fácil de interpretar, en esta guía te explicamos paso a paso su estructura, tipos y mejores prácticas.

## ¿Qué es una cédula de presupuesto?

Una cédula de presupuesto es un documento estructurado (generalmente en forma de tabla) que desglosa los ingresos, costos y gastos proyectados de una empresa durante un periodo específico.

Su principal función es servir como **hoja de control presupuestal**, permitiendo a directores y gerentes comparar las cifras planeadas contra los resultados reales y tomar decisiones basadas en datos concretos, no en intuición.

## Tipos principales de cédulas presupuestarias

No existe una sola cédula; el presupuesto maestro se divide en varias que se alimentan entre sí en cascada:

### 1. Cédula de ventas
Es el punto de partida de toda la cadena. Aquí se proyectan las unidades a vender y el precio de venta por periodo (mes, trimestre). Sin este pronóstico, es imposible calcular la producción ni los costos.

### 2. Cédula de producción
Se construye a partir de la cédula de ventas y las políticas de inventario. Calcula cuántas unidades se deben fabricar o adquirir.
*Fórmula clásica: (Ventas proyectadas + Inventario final deseado) - Inventario inicial.*

### 3. Cédula de compras de materia prima
Define cuánto material comprar y a qué costo, para cubrir la producción proyectada sin acumular exceso de inventario.

### 4. Cédulas de costos (Mano de obra y CIF)
Una vez que sabes cuánto vas a producir, necesitas costear los salarios de los operarios y los costos indirectos de fabricación (CIF): depreciación, energía, mantenimiento, etc.

### 5. Cédula de cobranza y efectivo
Proyecta cuándo se cobrará efectivamente lo vendido (no es lo mismo facturar que cobrar). Aquí entran los esquemas de cobranza escalonada (por ejemplo: 40% al contado, 30% a 30 días, 30% a 60 días) y el flujo neto de caja.

## Pasos para elaborar una cédula presupuestaria

### 1. Recopila datos históricos
Revisa tus ventas y gastos de periodos anteriores. Analizar el historial te dará expectativas realistas, y te ayudará a identificar estacionalidades.

### 2. Define el periodo presupuestal
Decide si tu cédula será mensual, trimestral o anual. Para un control detallado, se recomienda desglosar en periodos mensuales.

### 3. Establece la estructura de filas y columnas
Una estructura estándar debe incluir:
- **Concepto / Partida:** (ej. "Ventas proyectadas", "Inventario final deseado", "Producción requerida").
- **Un valor por cada periodo:** Enero, Febrero, Marzo... o Q1, Q2, Q3, Q4.
- **Columna Total:** Suma automática de todos los periodos.

### 4. Define las fórmulas que enlazan filas y cédulas
Aquí está la clave: las cédulas no son tablas aisladas. La cédula de producción DEBE jalar datos de la cédula de ventas (referencias cruzadas). La de cobranza desplaza los valores de ventas en el tiempo (con offsets de periodo).

Hacerlo en Excel es posible pero frágil. Cada vez que alguien mueve una fila o inserta una columna, las referencias se rompen.

### 5. Compara lo presupuestado contra lo real
Una cédula sin seguimiento es solo un ejercicio académico. El valor real aparece cuando cada mes comparas tu proyección contra lo que realmente sucedió, calculas la variación (desviación) y ajustas.

## Ejemplo práctico: Cédula de presupuesto de ventas

Imaginemos una distribuidora B2B que vende mobiliario de oficina:

| Mes | Concepto | Unidades Proyectadas | Precio Unitario | Total Proyectado | Total Real | Desviación |
| --- | --- | --- | --- | --- | --- | --- |
| Enero | Silla Ergonómica Pro | 150 | $2,000 MXN | $300,000 MXN | $310,000 MXN | +$10,000 |
| Febrero | Silla Ergonómica Pro | 160 | $2,000 MXN | $320,000 MXN | $290,000 MXN | -$30,000 |
| **Q1** | **Total Trimestre** | **310** | -- | **$620,000 MXN** | **$600,000 MXN** | **-$20,000** |

La columna de desviación indica rápidamente si estás alcanzando tus metas o necesitas ajustar la estrategia.

## El problema de Excel (y cómo resolverlo)

La mayoría de las empresas B2B en México siguen creando sus cédulas presupuestarias en hojas de cálculo. Funcionan hasta cierto punto, pero conforme el negocio crece, surgen tres problemas recurrentes:

1. **Las fórmulas se rompen.** Alguien inserta una fila, y las referencias cruzadas entre cédulas dejan de funcionar.
2. **No hay conexión con los datos reales.** Comparar "presupuestado vs. real" exige exportar datos del ERP, del sistema de facturación y del banco, y conciliarlos manualmente cada mes.
3. **La cascada no se actualiza sola.** Si cambias las ventas proyectadas, tienes que recalcular producción, materia prima, cobranza y efectivo a mano.

**Cord** resuelve exactamente esto. El módulo de Cédulas Presupuestales de Cord incluye un motor de fórmulas con referencias cruzadas entre cédulas (Ventas alimenta Producción, que alimenta Compras de MP) y plantillas precableadas. Pero lo que realmente lo distingue es el **Presupuesto vs. Real**: como Cord ya tiene tus datos de ventas, cotizaciones y cobranza, puede comparar automáticamente tus cifras presupuestadas contra lo que realmente ocurrió, mostrando la variación en cada celda sin que tengas que exportar nada.

Para quienes buscan ir más allá, el **Wizard de Plan Financiero Completo** genera la cascada Ventas, Cobranza (40/30/30 con offsets) y Efectivo en un clic, y la siembra con el promedio real de ventas de los últimos 6 meses.

## Conclusión

Saber **cómo hacer una cédula de presupuesto** te da un mapa financiero claro. Al segmentar tus operaciones en ventas, producción y costos, podrás identificar áreas de mejora y reaccionar a tiempo ante cambios en el mercado.

Y si ya te cansaste de que Excel te falle en el momento crítico, prueba una herramienta que conecte la planeación con la realidad de tu negocio.
