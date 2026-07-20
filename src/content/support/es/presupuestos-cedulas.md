---
title: "Cédulas presupuestales: planea ventas, producción y efectivo"
description: "Arma la cascada de planeación financiera (Ventas, Producción, Compras, Cobranza, Efectivo) con plantillas, el plan completo en un clic, fórmulas entre cédulas y comparación contra tus datos reales."
category: "Presupuestos y análisis"
order: 1
---

Las **cédulas presupuestales** son la herramienta de planeación financiera de Cord. Te permiten armar la cascada clásica de contabilidad de costos —Ventas → Producción → Compras de Materia Prima → Cobranza → Efectivo— sin salir a una hoja de Excel desconectada de tu operación, y **compararla contra tus ventas y cobranza reales** mes a mes. Las encuentras en **Presupuestos** (menú lateral, sección Inteligencia).

> [!NOTE]
> Presupuestos requiere el permiso de **analítica**. El plan Gratis incluye 1 cédula y Starter 3; desde Profesional obtienes cédulas ilimitadas, el plan financiero completo en un clic, la comparación contra datos reales y las herramientas de análisis.

## Crear un presupuesto

Presiona **+ Nuevo presupuesto** y elige qué quieres planear:

1. **Plan financiero completo (recomendado, desde Profesional)** — el asistente crea en un clic la cascada Ventas → Cobranza → Efectivo, ya conectada entre cédulas (cobranza escalonada 40/30/30 ajustable, saldo de caja mes a mes), sembrada con tu **promedio real de ventas de los últimos meses** y con las filas clave ya conectadas a [Presupuesto vs. Real](/soporte/presupuesto-vs-real). Marca la casilla de producción si tu negocio maneja inventario para agregar también Producción y Compras de MP. Necesita al menos 3 periodos.
2. **O una cédula individual** — cada plantilla siembra filas listas para editar:
   - **Ventas** — la fila base por periodo.
   - **Ventas con factores de ajuste** — ventas base + ajustes en unidades, factores porcentuales encadenados (ej. económico, distribución) y el monto final en pesos.
   - **Producción** — Producción = Ventas + Inventario final deseado − Inventario inicial, ya cableada.
   - **Compras de materia prima** — mismo patrón sobre el consumo de MP.
   - **Mano de obra y CIF** — filas de insumo para que armes tu costo total.
   - **Cobranza** — ventas a crédito distribuidas por porcentaje cobrado en el mes y los siguientes.
   - **Efectivo** — cobranza y pagos escalonados por periodo, más saldo inicial y final.
   - **En blanco** — arma la tuya fila por fila.
3. **Periodos** — vienen pre-llenados con 6 meses desde el mes actual; usa los presets (Trimestre, 6 meses, Año completo) o escríbelos separados por coma. Usa el formato **"Mes Año"** (ej. `Ene 2026`) para que Cord pueda comparar cada columna contra tus datos reales de ese mes, y los **mismos nombres de periodo** en cédulas que se van a referenciar entre sí.

## El grid: filas de insumo y de fórmula

Cada cédula es una tabla de **conceptos (filas) × periodos (columnas)**. Hay dos tipos de fila:

- **Insumo** — la tecleas tú, celda por celda. Se guarda al salir de la celda.
- **Fórmula** — lleva un distintivo **ƒx**, se muestra en gris claro y **se recalcula sola** cuando cambias un insumo del que depende. Debajo del concepto verás la fórmula en lenguaje legible (ej. `= Ventas + Inv. final deseado − Inv. inicial`). Al recalcular, las celdas afectadas dan un breve destello.

Cada fila muestra además su **Total** (la suma de todos sus periodos) en la última columna. Para renombrar la cédula, haz clic en su nombre. Para eliminar una fila, usa el ícono de bote de basura; si otra fórmula la referenciaba, esa fórmula pasará a calcular 0 para esa fila.

## Agregar periodos y duplicar

- **+ Periodo** (barra superior del editor) agrega un mes al final de la cédula — Cord te sugiere el siguiente al último (ej. después de `Jun 2026`, sugiere `Jul 2026`). Máximo 36 periodos por cédula.
- **Duplicar** (ícono de copia en la lista de presupuestos) crea una copia completa — filas, fórmulas y valores. Puedes copiarla con los **mismos periodos** (para probar otro escenario del mismo año) o **recorrida al año siguiente** (`Ene 2026` → `Ene 2027`, ideal para arrancar el plan del próximo año con esta base).

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

## Comparar contra tus datos reales

Cualquier fila puede conectarse a tus **ventas cerradas, unidades vendidas o cobranza recibida** — Cord muestra el real y la variación bajo cada mes presupuestado, sin capturar nada. Ver [Presupuesto vs. Real](/soporte/presupuesto-vs-real).

## Límites actuales

- No hay **editar una fórmula** existente — puedes agregar o borrar filas.
- La comparación contra datos reales empata por **mes calendario** — periodos con etiquetas sin mes y año reconocibles (ej. "Q1" o "Ene" sin año) no muestran dato real.
