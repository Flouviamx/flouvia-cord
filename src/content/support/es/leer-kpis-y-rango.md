---
title: "Leer los KPIs y el selector de fechas"
description: "Qué mide cada cifra del Inicio, cómo se compara contra el periodo anterior, qué significan Hoy, Rango e Histórico y por qué el rango ya no aparece en la dirección."
category: "Informes y analítica"
order: 2
---

Las cifras del Inicio no miden todas lo mismo: unas siguen las fechas que elijas, otras son una foto de este momento y otras suman todo tu historial. Esta guía te dice cómo leer cada una.

### Elegir el periodo

1. En el indicador de dinero del Inicio, pulsa el selector de fechas. Muestra el periodo actual, por ejemplo **Últimos 30 días**.
2. Elige un periodo rápido: **Últimos 12 meses**, **Hoy**, **Ayer**, **Últimos 7 días**, **Últimos 30 días**, **Últimos 90 días**, **Este mes**, **Mes pasado**, **Este trimestre** o **Año a la fecha**.
3. Para fechas exactas, elige **Personalizado**, marca el primer y el último día en el calendario (los ves en **Desde** y **Hasta**) y pulsa **Aplicar**. **Cancelar** cierra sin cambiar nada.

Qué esperar:

- El periodo de inicio es **Últimos 30 días**.
- El Inicio cubre los últimos 12 meses: no puedes elegir días anteriores.
- "Hoy" es el día de la zona horaria de tu negocio (**Ajustes › General › Zona horaria**), no el de tu computadora.

### El rango se recuerda, pero ya no va en la dirección

Cord recuerda en este navegador el último periodo que elegiste en el Inicio. La dirección de la página ya no lleva `?rango=`: así no se ensucia la barra y un marcador viejo no te deja atrapado en un periodo. Si abres un enlace antiguo que sí lo trae, Cord lo respeta esa vez y limpia la dirección.

En **Informes** es distinto: ahí el periodo sí va en la dirección, para que al compartir el enlace de un informe la otra persona vea las mismas fechas. Cada informe recuerda además su propio periodo.

### Hoy, Rango e Histórico

Junto al título de cada widget hay una etiqueta. Pasa el cursor sobre ella para ver la explicación.

- **Rango** — "Sigue el rango de fechas elegido arriba." Cambia cuando mueves el selector.
- **Hoy** — "Foto de este momento; no sigue el selector de fechas." Por ejemplo, el pipeline, la cartera o lo que está por cerrar: lo que pasa hoy no depende del periodo que mires.
- **Histórico** — "Todo tu historial, sin importar el rango." Por ejemplo, **Días a cierre** o el **Ranking de vendedores**.

La nota bajo el indicador de dinero lo resume: "El rango aplica a ingreso, tendencia, embudo y rankings. Cartera, pipeline y salud siempre muestran hoy."

| Sigue el rango | Foto de hoy | Todo el historial |
|---|---|---|
| Indicador de dinero, Tasa de cierre, Ticket promedio, Cobrado, Tendencia mensual, Embudo de conversión, Clientes por tasa de aprobación, Productos por ingreso | Por cerrar, Por dar seguimiento, Pipeline, Antigüedad de cartera, Flujo esperado, Salud del pipeline, Necesitan seguimiento, Facturas vencidas | Días a cierre, Ranking de vendedores, De enviada a pagada |

### Qué mide cada cifra

- **Cerrado:** el total de las cotizaciones que ganaste (aprobadas, pagadas o facturadas), por la fecha en que se aprobaron.
- **Cobrado:** el dinero que entró, por la fecha del pago, de cotizaciones y de facturas (incluidos los abonos parciales), menos lo reembolsado.
- **Cotizado:** el total de las cotizaciones que creaste, sin borradores, por su fecha de creación.
- **Tasa de cierre:** de las cotizaciones que enviaste en el periodo, qué porcentaje ya ganaste. Debajo lo ves en números, por ejemplo "6 de 15 enviadas en el rango". Se mide sobre lo que salió en el periodo (una cohorte), para que dos periodos se comparen sin mezclar fechas.
- **Ticket promedio:** lo cerrado en el periodo entre el número de ventas que lo forman.
- **Por cerrar:** lo enviado o visto que el cliente todavía no decide; la barra separa cuánto sigue **Enviada** y cuánto ya está **Vista**.
- **Por dar seguimiento:** cotizaciones que el cliente abrió y no ha respondido.

En el indicador de dinero, las pestañas **Cerrado**, **Cobrado** y **Cotizado** cambian la cifra grande y la gráfica.

### La variación contra el periodo anterior

Las cifras que siguen el rango se comparan contra el **periodo anterior de la misma duración, inmediatamente antes**:

- **Últimos 30 días** se compara con los 30 días previos.
- **Este mes**, si hoy es 8 de octubre, se compara con los 8 días anteriores al 1 de octubre (del 23 al 30 de septiembre), no con todo septiembre. Para comparar meses completos, elige **Mes pasado** o un rango **Personalizado**.

Cómo se muestra:

- **Importes y conteos, en porcentaje.** Cobrar 12,000 contra 10,000 se ve como una flecha hacia arriba con "20%".
- **Tasas, en puntos.** Pasar de 38% a 43% se ve como "5 pts" hacia arriba, no como "13%": una tasa que sube cinco puntos no creció un trece por ciento.
- La flecha y el color dicen si subió o bajó.
- En la gráfica del indicador de dinero, el periodo anterior aparece como una línea punteada.

Cuándo **no** hay variación:

- Si el periodo anterior está en cero. Un "+100%" contra nada no significa nada, así que Cord no muestra la flecha; en **Cobrado** lees "Sin periodo anterior para comparar".
- Con **Últimos 12 meses**: el Inicio no carga el año previo para compararlo.
- Si el periodo anterior caería antes de los 12 meses que cubre el Inicio (por ejemplo, **Año a la fecha** en la segunda mitad del año).

### Por qué un widget no cambió al mover las fechas

- Tiene la etiqueta **Hoy** o **Histórico**: no sigue el selector, a propósito.
- La **Tendencia mensual** cambia de agrupación sola: por día hasta 16 días, por semana hasta 70 días (cada barra empieza en lunes) y por mes en rangos más largos.
- **Clientes por tasa de aprobación** solo compara clientes con muestra suficiente: si al menos tres tienen dos o más cotizaciones, el ranking se hace solo entre ellos, para que un "1 de 1" no aparezca como tu mejor cliente.

### Problemas comunes

**El Inicio abre en un periodo que no elegí.** Es el último que usaste en este navegador. Cambia el periodo y se recordará el nuevo. En otro navegador o en modo incógnito empieza en **Últimos 30 días**.

**Le mandé el enlace del Inicio a un compañero y ve otras fechas.** El Inicio ya no comparte el periodo por la dirección. Para compartir números con fechas fijas, usa un informe en **Informes**: su enlace sí lleva el periodo.

**Un número del Inicio no coincide con un informe.** Revisa que los dos usen el mismo periodo y la misma definición: **Ventas en el tiempo** cuenta ventas por fecha de cierre, mientras que el **Informe personalizado** cuenta las cotizaciones creadas en el periodo y lo que pasó con ellas. Ve [Los informes de Cord](/soporte/informes-de-cord).

**Registré un pago y la cifra no cambió.** Las cifras del Inicio se recalculan en menos de un minuto; espera un momento y recarga la página. Si el pago está en otra divisa sin tipo de cambio disponible, queda fuera de la suma y la nota de divisa lo dice: ve [Importes en varias divisas y zona horaria](/soporte/importes-en-varias-divisas-informes).

Guía completa: [Inicio y vistas de cotizaciones](/docs/gestion/dashboard).
