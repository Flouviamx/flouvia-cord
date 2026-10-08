---
title: "Exportar un informe a CSV (Excel y Google Sheets)"
description: "Descarga cualquier informe tabla con un clic: qué trae el archivo, cómo vienen los importes y la divisa, y cómo abrirlo en Excel con acentos correctos."
category: "Informes y analítica"
order: 4
---

Todos los informes tipo tabla se descargan como archivo CSV, listo para Excel, Google Sheets o tu sistema contable. El archivo trae exactamente lo que ves en pantalla, con los números como números.

### Qué informes se exportan

- **Ventas en el tiempo**
- **Ventas por cliente**
- **Ventas por producto**
- **Recompra por cohorte**
- **Pagos recibidos**
- **Impuestos facturados**
- **Ventas por vendedor**
- **Informe personalizado**, incluidos los informes que guardaste

Los informes de widgets (**Resumen**, **Diagnóstico comercial**, **Clientes**, **Productos**, **Finanzas**, **Flujo de caja · 90 días** y **Cobranza y cartera**) no se exportan. Si necesitas esos datos en una hoja, el **Informe personalizado** casi siempre puede armar la tabla equivalente.

### Cómo exportar

1. Abre **Informes** y elige el informe en el selector.
2. Ajusta el periodo con el selector de fechas. En **Ventas en el tiempo** elige además **Día**, **Semana** o **Mes**; en el **Informe personalizado**, la agrupación y las métricas.
3. Pulsa **Exportar CSV**, arriba de las cifras clave.
4. El archivo se descarga con un nombre como `cord-ventas-cliente-2026-09-01_2026-09-30.csv`: el informe y el periodo exportado. **Recompra por cohorte**, que no depende de fechas, lleva el día de hoy: `cord-recompra-2026-10-08.csv`.

Si la tabla está vacía ("Sin datos en este rango"), el botón no aparece: no hay nada que exportar.

### Qué trae el archivo

- **Las mismas columnas que la tabla**, con sus nombres en el idioma de tu cuenta, y una fila por renglón de la tabla.
- **Importes como número**, sin símbolo de moneda ni separadores de miles y con punto decimal: `48250.50` (o `48250` si es entero), no `$48,250.50`. Así puedes sumarlos, filtrarlos y hacer tablas dinámicas sin limpiar nada.
- **La divisa en su propia columna.** Si el informe tiene importes, la última columna es **Divisa**, con el código de la moneda base de tu negocio (por ejemplo `MXN` o `EUR`) en cada fila. Todos los importes del archivo están en esa divisa.
- **Porcentajes como número entero:** una **Tasa de cierre** de 43% viene como `43`.
- **Fechas en formato año-mes-día:** `2026-09-30`. En informes agrupados por semana, la fecha es el lunes de esa semana; por mes, el día 1.
- **Métodos de pago con su nombre**, como en pantalla: **Tarjeta**, **Transferencia**, **Efectivo**, **Registrado a mano**.
- **Celdas vacías** donde la tabla muestra un guion (—), por ejemplo un margen sin costo capturado.

El archivo **no** incluye la fila **Total**: así puedes sumar o filtrar las filas sin contar dos veces. Si necesitas el total, súmalo en la hoja o tómalo de la pantalla.

Cuánto trae: la tabla completa del periodo, con los mismos topes que la pantalla (hasta 500 clientes, productos o grupos y los 1,000 pagos más recientes del periodo).

### Abrir el archivo en Excel

El CSV va codificado en UTF-8 con la marca que Excel necesita para leer acentos y eñes, y separa las columnas con comas.

- **Si tu Excel usa comas para separar listas** (lo habitual en México y Estados Unidos), ábrelo con doble clic: cada dato cae en su columna y los acentos se ven bien.
- **Si todo aparece en una sola columna** (Excel configurado con punto y coma, común en España y otros países), no lo abras con doble clic. En Excel ve a **Datos › Desde el texto/CSV**, elige el archivo, selecciona **Coma** como delimitador y, si los decimales se leen mal, cambia la configuración regional del asistente a una que use punto decimal. Pulsa **Cargar**.
- **En Google Sheets**, ve a **Archivo › Importar › Subir** y elige el archivo. Sheets detecta las comas y los acentos solo.

### Protección contra fórmulas

Si un texto del archivo empieza con `=`, `+`, `-` o `@` (por ejemplo, un cliente registrado como `=HIPERVINCULO(...)`), Cord le antepone un apóstrofo para que Excel o Sheets lo muestren como texto en lugar de ejecutarlo. Los importes no se tocan: viajan como número.

### Quién puede exportar

Cualquier persona que pueda ver el informe. **Pagos recibidos** pide además el permiso **Cobranza**. Exportar está incluido en todos los planes.

### Preguntas frecuentes

**¿El CSV respeta el periodo que estoy viendo?** Sí. Exporta el rango, la agrupación y las métricas que se pintaron en pantalla, no un periodo guardado en otro lado.

**¿Puedo recibir el CSV automáticamente?** Sí, con un informe personalizado guardado con envío por correo: cada lunes o cada día 1 te llega el periodo que terminó con el CSV adjunto. Ve [Recibir un informe por correo](/soporte/recibir-informes-por-correo).

**¿Por qué los importes no tienen símbolo de moneda?** Para que sean números de verdad en tu hoja. La moneda está en la columna **Divisa**.

**Vendo en varias divisas, ¿cómo viene eso?** Todo se convierte a la moneda base de tu negocio con la mejor tasa disponible y la columna **Divisa** lo dice. Ve [Importes en varias divisas y zona horaria](/soporte/importes-en-varias-divisas-informes).

Guía completa: [Informes y desempeño comercial](/docs/gestion/informes).
