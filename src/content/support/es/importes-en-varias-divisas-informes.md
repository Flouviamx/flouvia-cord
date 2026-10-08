---
title: "Importes en varias divisas y zona horaria en el Inicio y los informes"
description: "Cómo convierte Cord tus ventas en otras monedas a la moneda base de tu negocio, qué tipo de cambio usa, qué pasa si no hay uno disponible y cómo afecta tu zona horaria a los días."
category: "Informes y analítica"
order: 7
---

Si vendes en más de una moneda, Cord no suma importes de divisas distintas como si fueran iguales: USD 1,000 más MXN 1,000 no son "2,000". Todo lo que ves en el Inicio, en los informes, en los CSV y en los correos programados se expresa en **una sola moneda: la moneda base de tu negocio**.

### Cuál es la moneda de tus informes

Es la **Moneda base** de **Ajustes › General**. Si cotizas siempre en esa moneda, no hay nada que convertir y no verás ninguna nota.

### Cómo se convierte cada importe

Para cada cotización, factura o pago, Cord usa la mejor tasa real disponible, en este orden:

1. **Está en tu moneda base:** se suma tal cual.
2. **Tiene un tipo de cambio fijado:** si al guardar la cotización (o emitir la factura) Cord congeló un tipo de cambio hacia tu moneda base, se usa ese. Es el mismo que declara tu factura, así que tus informes cuadran con tus documentos. Ve [Cotizaciones en varias divisas](/soporte/cotizaciones-multimoneda).
3. **No tiene uno fijado:** se usa el tipo de cambio publicado hoy.

Los pagos de una cotización usan el tipo de cambio de su cotización. Los pagos de facturas se convierten con el publicado hoy cuando están en otra moneda.

### La nota de divisa

Cuando hay importes en más de una moneda, debajo del indicador de dinero del Inicio y al pie de cada informe aparece una nota como esta:

> Importes en MXN. Las ventas en EUR y USD se convierten con el tipo de cambio fijado en cada cotización o factura; si no tiene uno, con el publicado hoy.

Si una moneda no tiene ningún tipo de cambio disponible, la nota lo agrega:

> No hay tipo de cambio disponible para COP: esas ventas no se suman por ahora.

### Qué pasa cuando no hay tipo de cambio

Cord **nunca inventa una tasa** ni suma esos importes como si valieran uno a uno. Mientras no haya un tipo de cambio publicado para esa moneda:

- Sus importes **quedan fuera** de las sumas (Cerrado, Cobrado, Vendido, Cotizado) y del conteo de ventas que usa el ticket promedio.
- Las cotizaciones sí cuentan en los conteos que no dependen del dinero, como **Cotizaciones** o **Tasa de cierre**.
- En cuanto vuelve a haber tasa, esas ventas se suman solas. No tienes que hacer nada.

### Por qué una cifra cambia de un día para otro

Las ventas que **no** tienen un tipo de cambio fijado se convierten con el de hoy, así que el total de un periodo pasado puede moverse un poco cuando la tasa cambia. Las que tienen tipo de cambio fijado no se mueven nunca.

### Si cambias la moneda base

Cambiar la **Moneda base** en **Ajustes › General** no modifica tus cotizaciones ni tus facturas, pero todo el análisis pasa a expresarse en la moneda nueva: el Inicio, los informes, los CSV y los correos. Puede tardar unos minutos en verse en todos lados.

### Las divisas en el CSV

Los importes del CSV vienen como número y la última columna, **Divisa**, dice en qué moneda están: siempre la moneda base. Ve [Exportar un informe a CSV](/soporte/exportar-informes-csv).

Para ver cuántas ventas tienes en cada moneda, usa un **Informe personalizado** agrupado por **Divisa**: cada fila es una moneda de venta, con sus importes ya convertidos a tu moneda base. Ve [Crear, guardar y compartir informes personalizados](/soporte/informes-personalizados).

### La zona horaria

Los días de tu análisis empiezan y terminan a medianoche **en la zona horaria de tu negocio** (**Ajustes › General › Zona horaria**), no en la del servidor ni en la de tu computadora:

- **"Hoy"** es el día de tu negocio. Una venta aprobada a las 11 de la noche en Ciudad de México cuenta ese día, no el siguiente.
- **Las semanas empiezan en lunes** y los meses, el día 1, ambos en tu zona.
- **Los correos programados** salen el lunes o el día 1 de tu zona, con la semana o el mes completos de tu zona.
- **Recompra por cohorte** cuenta los meses en tu zona.

Si tu equipo trabaja en otra zona horaria, los informes siguen la del negocio para que todos vean los mismos números.

### Problemas comunes

**Mis ventas en dólares no aparecen en el total.** Revisa la nota de divisa: si dice que no hay tipo de cambio disponible para esa moneda, quedan fuera hasta que lo haya. Si la nota no aparece, revisa que el periodo incluya esas ventas.

**El total de un mes pasado cambió.** Tiene ventas en otra moneda sin tipo de cambio fijado: se convierten con la tasa de hoy. Las cotizaciones que fijan un tipo de cambio al guardarse no cambian.

**Una venta aparece en el día equivocado.** Revisa la **Zona horaria** en **Ajustes › General**: los días se cortan a medianoche de esa zona.

**Veo los importes en otra moneda que la que esperaba.** Los informes usan la **Moneda base** de **Ajustes › General**, no la moneda de cada cotización.

Guía completa: [Informes y desempeño comercial](/docs/gestion/informes).
