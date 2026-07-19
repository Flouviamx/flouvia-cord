---
title: "Cédulas presupuestales: planea ventas, producción y efectivo"
description: "Arma la cascada de planeación financiera (Ventas, Producción, Compras, Cobranza, Efectivo) con plantillas, filas de fórmula y referencias entre cédulas."
category: "Presupuestos y análisis"
order: 1
---

Las **cédulas presupuestales** son la herramienta de planeación financiera de Cord. Te permiten armar la cascada clásica de contabilidad de costos —Ventas → Producción → Compras de Materia Prima → Cobranza— sin salir de una hoja de Excel desconectada de tu operación. Las encuentras en **Presupuestos** (menú lateral, sección Inteligencia).

> [!NOTE]
> Presupuestos requiere el permiso de **analítica**. El dueño de la organización y cualquier miembro con acceso a analítica pueden usarlo.

## Crear una cédula

Presiona **+ Nueva cédula** y elige:

1. **Tipo** — una plantilla que siembra filas listas para editar. Al elegir el tipo, Cord te sugiere un nombre y te explica qué trae esa plantilla. Tipos disponibles:
   - **Ventas** — la fila base de unidades por periodo.
   - **Ventas con factores de ajuste** — ventas base + ajustes en unidades, factores porcentuales encadenados (ej. económico, distribución) y el monto final en pesos.
   - **Producción** — Producción = Ventas + Inventario final deseado − Inventario inicial, ya cableada.
   - **Compras de Materia Prima** — mismo patrón sobre el consumo de MP.
   - **Mano de Obra y CIF** — filas de insumo para que armes tu costo total.
   - **Cobranza** — ventas a crédito distribuidas por porcentaje cobrado en el mes y los siguientes.
   - **Efectivo** — cobranza y pagos escalonados por periodo, más saldo inicial y final.
   - **Personalizada** — una cédula en blanco.
2. **Nombre** — puedes aceptar el sugerido o escribir el tuyo.
3. **Periodos** — usa los presets (Trimestre, 6 meses, 12 meses) o escríbelos separados por coma. Usa los **mismos nombres de periodo** en cédulas que se van a referenciar entre sí (ej. Producción y Compras de MP).

## El grid: filas de insumo y de fórmula

Cada cédula es una tabla de **conceptos (filas) × periodos (columnas)**. Hay dos tipos de fila:

- **Insumo** — la tecleas tú, celda por celda. Se guarda al salir de la celda.
- **Fórmula** — se muestra en gris claro y **se recalcula sola** cuando cambias un insumo del que depende. Debajo del concepto verás la fórmula en lenguaje legible (ej. `= Ventas + Inv. final deseado − Inv. inicial`). Al recalcular, las celdas afectadas dan un breve destello.

Para renombrar la cédula, haz clic en su nombre. Para eliminar una fila, usa el ícono de bote de basura; si otra fórmula la referenciaba, esa fórmula pasará a calcular 0 para esa fila.

## Construir una fórmula

Al agregar una fila y elegir el tipo **Fórmula**, aparece el constructor de términos. Cada término tiene:

- **Operación:**
  - **Suma / resta** — acumula el valor de una fila (coeficiente positivo suma, negativo resta).
  - **% de otra fila** — aplica un porcentaje de cambio sobre lo acumulado hasta ese punto (ej. +1% económico, luego +3% de distribución).
  - **× otra fila** — multiplica lo acumulado por otra fila completa (ej. unidades × precio).
- **Cédula** y **Fila** — la referencia. Puede ser una fila de **esta misma cédula o de otra** de tu organización — así "Producción" jala de "Ventas" sin recapturar nada.
- **Coef.** — el coeficiente (solo aplica a suma/resta).
- **Atrás** — toma el valor de un periodo anterior (0 = mismo periodo, 1 = el periodo pasado). Útil para cobranza escalonada (ej. 40% este mes, 30% el pasado, 30% el anterior).

Los términos se aplican **en el orden en que los agregas**.

> [!NOTE]
> Las cédulas son una herramienta de **planeación**, no un inventario en vivo. El inventario inicial/final deseado es un supuesto que tecleas por periodo, no un saldo rastreado por movimientos reales de almacén.

## Límites actuales

- No se pueden **agregar periodos** a una cédula ya creada — recréala si necesitas más.
- No hay **editar una fórmula** existente — puedes agregar o borrar filas.
- No hay **presupuestado vs. real** jalando datos de cotizaciones o ventas reales; las cédulas se alimentan de los supuestos que tecleas.
