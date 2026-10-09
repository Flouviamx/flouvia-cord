---
title: "Claves de producto y unidad del SAT en tus facturas"
description: "Con qué clave se timbra cada concepto, cómo elegirla por producto o por línea y cuándo sale la genérica 01010101."
category: "Facturación"
order: 2
---

Esto aplica solo a organizaciones en **México**: cada concepto de un CFDI 4.0 lleva una Clave de Producto o Servicio (`c_ClaveProdServ`, 8 dígitos) y una Clave de Unidad (`c_ClaveUnidad`, como `H87`, `E48` o `HUR`) de los catálogos del SAT.

### Con qué clave se timbra cada concepto

Cord decide la clave de cada línea en este orden, campo por campo:

1. **La clave de la línea.** Si la elegiste en el editor (o la mandaste por la API), esa gana.
2. **La clave del producto.** Si la línea viene de un producto de tu catálogo que tiene claves SAT, se usan las suyas. Sin clave de unidad, Cord la deduce de la unidad que escribiste en el producto ("hora" es `HUR`, "servicio" es `E48`).
3. **Las genéricas del SAT.** Sin nada de lo anterior, el concepto sale con `01010101` ("No existe en el catálogo") y la unidad `H87` ("Pieza"). Son claves válidas y no impiden timbrar, pero no describen lo que vendes y tu cliente no puede clasificar el gasto.

Las claves quedan congeladas en la factura al guardarla: cambiar después la clave del producto no reescribe una factura ya emitida.

### Elegir la clave por producto

En **Productos**, abre el producto y llena la sección **Facturación electrónica (SAT)**. Puedes buscar la clave por descripción ("consultoría", "software") o escribir los 8 dígitos. También puedes importarlas en tu CSV de productos con las columnas `clave_sat` y `clave_unidad_sat`; la exportación del catálogo las incluye.

### Elegir la clave en una línea

En el editor de facturas y en el de cotizaciones, debajo de cada concepto aparece su clave SAT. Toca la clave para cambiarla: buscas en el mismo catálogo del SAT, eliges la unidad y aplicas. Sirve sobre todo para líneas libres ("Flete", "Consultoría de marzo") que no vienen de un producto.

Si una línea se timbraría con la genérica `01010101`, el editor lo marca en la propia línea y, antes de emitir la factura, te dice cuántos conceptos saldrían así.

### Por la API

Cada concepto de `POST /v1/facturas` y `POST /v1/cotizaciones` acepta `clave_sat` y `clave_unidad_sat`. Una clave con formato inválido se rechaza al guardar, con el nombre del concepto, en vez de fallar al timbrar.

<Callout type="info">
Al **duplicar** una factura, la copia conserva las claves SAT con las que se timbró cada concepto.
</Callout>
