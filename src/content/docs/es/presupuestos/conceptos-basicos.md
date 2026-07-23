---
title: "Conceptos básicos"
description: "Aprende cómo funciona el motor matemático de series de tiempo de Cord: filas, fórmulas combo, desfases y referencias cruzadas."
---

<header class="content-header">
  <h1 class="page-title">Conceptos básicos</h1>
  <p class="page-subtitle">Entiende el motor detrás de Cord. Aprende sobre series de tiempo, la fórmula Combo, desfases temporales y la conexión Presupuesto vs. Real.</p>
</header>

## La anatomía de un Presupuesto Maestro

En Cord, una "Cédula" no es una cotización unitaria, sino una matriz financiera. Las columnas representan **periodos en el tiempo** (ej. Ene 2026, Feb 2026), y las filas representan los **conceptos de ingreso o gasto**. 

Existen dos tipos fundamentales de filas en cualquier cédula:

1. **Filas de Input (Supuestos):** Son las celdas donde tú "tecleas" la información manualmente. Sirven para establecer hechos futuros. Por ejemplo: las unidades que esperas vender en marzo, o tu inventario inicial de enero. No se calculan, se asumen.
2. **Filas de Fórmula:** Son las celdas donde el motor hace su magia. El valor de cada mes en esta fila se calcula automáticamente referenciando a otras filas del proyecto. 

## El motor de fórmulas "Combo"

Para evitar la fragilidad de las hojas de Excel (donde alguien borra una celda y rompe toda la fórmula), Cord utiliza un solo primitivo matemático extremadamente robusto llamado **Combo**. 

Una fórmula Combo es una suma ponderada secuencial. Te permite sumar, restar, multiplicar por porcentajes o escalar valores en una sola regla matemática sin necesidad de escribir código. Cada término de la fórmula tiene un `coeficiente` y un tipo de operación:
- **Suma/Resta:** `(Valor de la fila X * 1) + (Valor de la fila Y * -1)`
- **Porcentual (pct):** Multiplica el acumulado por un porcentaje definido en otra fila.
- **Producto:** Multiplica el acumulado por el valor absoluto de otra fila.

## Desfases temporales (Offsets)

El flujo de efectivo rara vez ocurre en el mismo mes que la venta. Si cierras un proyecto de $100,000 en enero con términos Net-30, el dinero entrará al banco en febrero.

Para modelar esto, el motor de Cord incluye **Offsets**. Puedes decirle a una fila de fórmula: *"Toma el valor de la fila de Ventas, pero recórrelo 1 periodo hacia adelante (Offset: 1)"*. Esto permite crear políticas de cobranza del mundo real de manera automática, sin mover columnas a mano.

## Referencias Cruzadas (Cross-refs)

Las empresas no operan en silos, y sus presupuestos tampoco deberían. Cord te permite enlazar cédulas entre sí mediante referencias cruzadas.

- Puedes tener una **Cédula de Ventas** que el equipo comercial actualiza.
- Puedes tener una **Cédula de Cobranza** que *referencia de forma cruzada* la fila final de ventas para calcular los ingresos proyectados.
- Puedes tener una **Cédula de Flujo de Efectivo** que *referencia de forma cruzada* los ingresos proyectados y les resta los egresos.

Si Ventas cambia su proyección hoy, la Cédula de Flujo de Efectivo se actualizará instantáneamente, dándote visibilidad corporativa total.

## Presupuesto vs. Real

Proyectar el futuro no sirve de nada si no mides la realidad. El motor de Cord permite conectar cualquier fila de tu presupuesto a las **transacciones reales de la empresa**. 

Al detectar las columnas de meses ("Ene 2026"), Cord cruzará automáticamente tus expectativas con los cobros exitosos procesados en Stripe o con las facturas cobradas. Así sabrás si tu desviación fue del 5% o del 20%, permitiéndote ajustar el timón antes de que sea tarde.
