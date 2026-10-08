---
title: "Crear, guardar y compartir informes personalizados"
description: "Arma tu propia tabla con Agrupar por y hasta seis métricas, compártela con un enlace, guárdala con nombre para todo el equipo y edítala o elimínala."
category: "Informes y analítica"
order: 5
---

El **Informe personalizado** responde las preguntas que los informes fijos no cubren: "¿cuánto vendí por país este trimestre?", "¿qué vendedor tiene mejor tasa de cierre con clientes nuevos?", "¿cuántas cotizaciones perdí cada semana?". Eliges cómo agrupar y qué medir, y Cord arma la tabla con su gráfica, sus cifras clave y su exportación a CSV.

### Qué cuenta este informe

Cuenta las **cotizaciones creadas en el periodo** (sin borradores) y lo que pasó con ellas después. Así cada fila responde "de lo que cotizamos en estas fechas, ¿cuánto se ganó, cuánto se perdió y en cuánto tiempo?".

Por eso su **Vendido** puede no coincidir con **Ventas en el tiempo**, que cuenta las ventas por su fecha de cierre: una cotización creada en septiembre y ganada en octubre aparece en septiembre aquí y en octubre allá. Las dos cifras son correctas.

### Armar un informe

1. Ve a **Informes**, abre el selector de informe y elige **Informe personalizado** (grupo **Personalizados**).
2. Elige el periodo con el selector de fechas.
3. En **Agrupar por**, elige cómo dividir la tabla:
   - **Cliente**, **Producto** o **Vendedor** (quien creó la cotización).
   - **Estado**: Enviada, Vista, Aprobada, Pagada, Facturada, Rechazada o Vencida.
   - **Mes**, **Semana** o **Día** de creación.
   - **País** del cliente, **Nivel de cliente** o **Divisa** de la cotización.
4. En **Métricas**, marca hasta seis:
   - **Cotizaciones:** cuántas se crearon.
   - **Cotizado:** su importe total.
   - **Ventas:** cuántas se ganaron (aprobadas, pagadas o facturadas).
   - **Vendido:** el importe de las ganadas.
   - **Tasa de cierre:** ventas entre cotizaciones enviadas, en porcentaje.
   - **Ticket promedio:** vendido entre ventas.
   - **Perdidas:** cuántas se rechazaron o vencieron.
   - **Días a cierre:** promedio de días entre crear la cotización y que se aprobara.
   - **Unidades:** unidades vendidas. Solo al agrupar por producto.
   - **Margen bruto:** vendido menos costo, solo de las líneas con costo capturado. Solo al agrupar por producto.
5. Cada cambio se aplica al momento: la tabla se recarga sola.

Qué esperar:

- Por defecto el informe agrupa por **Cliente** con **Cotizaciones**, **Ventas**, **Vendido** y **Tasa de cierre**.
- Las cuatro primeras métricas que marques aparecen arriba como cifras clave, comparadas contra el periodo anterior de la misma duración.
- La gráfica usa la primera métrica de dinero que elegiste (o la primera métrica, si ninguna es de dinero). Agrupado por tiempo dibuja barras por periodo; agrupado por otra cosa, los 10 primeros.
- La tabla se ordena por la primera métrica, de mayor a menor (o por fecha, si agrupas por tiempo), y muestra hasta 500 filas.
- La fila **Total** es el total real del periodo, no la suma de filas: una tasa o un ticket promedio no se suman.

Reglas de las métricas:

- Al marcar la sexta, las demás se desactivan y lees "Hasta seis métricas a la vez.". Desmarca una para elegir otra.
- No puedes quedarte sin métricas: desmarcar la última no hace nada.
- Una métrica en gris no aplica a esa agrupación. Pasa el cursor para ver por qué: "Solo al agrupar por producto" (**Unidades**, **Margen bruto**) o "No aplica por producto" (**Días a cierre**).

### Ir al detalle

- En la gráfica o en la primera columna, un **cliente** o un **producto** abre su ficha.
- Agrupado por **Mes**, una barra abre ese mes agrupado por **Semana**; agrupado por **Semana**, abre esa semana por **Día**. Las métricas se conservan.
- En el celular, el primer toque muestra el dato; **Ver detalle** dentro de la etiqueta te lleva.

### Compartir con un enlace

La configuración vive en la dirección de la página: el periodo, la agrupación y las métricas. Copia la dirección del navegador y mándala: quien la abra verá la misma tabla. Necesita ser parte de tu organización (con ella como organización activa) y tener el permiso **Informes**. El CSV que exporte también será exactamente esa tabla.

### Guardar el informe

1. Con la tabla como la quieres, pulsa **Guardar** (el icono de chincheta).
2. Escribe un **Nombre** de 1 a 80 caracteres, por ejemplo "Ventas por país del trimestre".
3. En **Envío por correo** deja **Sin envío** o elige **Cada lunes** o **El día 1 de cada mes**. Ve [Recibir un informe por correo](/soporte/recibir-informes-por-correo).
4. Pulsa **Guardar**.

Qué esperar:

- El informe aparece en el selector, en el grupo **Personalizados**, con la etiqueta **Informe guardado** y su nombre como título de la página.
- **Lo ve toda la organización:** cualquier persona con el permiso **Informes** puede abrirlo.
- **Se guardan la agrupación y las métricas, no las fechas.** Al abrirlo, usa el periodo del selector, así que el mismo informe sirve para cualquier mes.
- Cada organización puede tener hasta 50 informes guardados.

### Editar un informe guardado

1. Ábrelo desde el selector.
2. Cambia la agrupación o las métricas. La tabla se actualiza al momento, pero el informe guardado **no cambia** hasta que lo guardes.
3. Pulsa **Guardar cambios**. En el cuadro puedes cambiar también el nombre o el envío por correo.
4. Pulsa **Guardar cambios** para reemplazarlo o **Guardar como nuevo** para crear una copia con otro nombre y dejar el original igual.

### Eliminar un informe guardado

1. Ábrelo desde el selector.
2. Pulsa el icono de bote de basura (**Eliminar**), junto a **Guardar cambios**.
3. Confirma "¿Eliminar este informe guardado? Esto no borra ningún dato.". Si tenía envío por correo, deja de llegar.

### Quién puede hacer qué

| Acción | Quién |
|---|---|
| Armar, ver y exportar informes personalizados | Cualquier persona con el permiso **Informes** |
| Guardar un informe nuevo | Cualquier persona con el permiso **Informes** |
| Editar o eliminar un informe guardado | Quien lo guardó, el dueño de la cuenta o un administrador |
| Programar o cambiar el envío por correo | Solo quien lo guardó |
| Apagar el envío de un informe ajeno | El dueño de la cuenta o un administrador (elige **Sin envío**) |

Cuando abres un informe que guardó otra persona, ves "Guardado por otra persona del equipo".

### Guardar tu propia copia de un informe ajeno

Si abres un informe que guardó otra persona y no puedes editarlo, el botón dice **Guardar** (no **Guardar cambios**) y no tiene el icono de eliminar. Al pulsarlo, el cuadro aparece con el nombre vacío: escribe uno y pulsa **Guardar**. Cord crea un informe **nuevo y tuyo** con la agrupación y las métricas que tienes en pantalla; el original no cambia. Como la copia es tuya, también puedes programarle el envío por correo.

### Problemas comunes

**Quiero cambiar un informe que guardó otra persona.** Si no eres quien lo guardó ni administrador, no puedes reemplazarlo, pero **Guardar** crea tu propia copia con los cambios (ver arriba). Si ves "Solo quien guardó el informe o un administrador puede cambiarlo.", otra persona cambió tus permisos o el informe mientras tenías la página abierta: recárgala.

**Dice "Llegaste al máximo de 50 informes guardados."** Elimina los que ya no use tu equipo y vuelve a guardar.

**Dice "Ponle un nombre de 1 a 80 caracteres."** El nombre está vacío o es demasiado largo.

**Agrupé por Divisa y una divisa sale en cero.** Los importes siempre se expresan en la moneda base de tu negocio. Si una divisa no tiene tipo de cambio disponible, sus importes quedan fuera de la suma y la nota bajo el informe lo dice. Ve [Importes en varias divisas y zona horaria](/soporte/importes-en-varias-divisas-informes).

**Aparecen filas como "Sin cliente", "Sin vendedor" o "Sin dato".** Son cotizaciones sin cliente, sin vendedor identificado o sin país o nivel capturado en el cliente.

Guías relacionadas: [Exportar un informe a CSV](/soporte/exportar-informes-csv) · [Informes personalizados en la documentación](/docs/gestion/informes-personalizados).
