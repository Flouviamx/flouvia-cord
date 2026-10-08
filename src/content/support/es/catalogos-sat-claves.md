---
title: "Claves de producto y unidad del SAT en tus facturas"
description: "Cómo asignar a cada producto su clave de producto o servicio y su clave de unidad del SAT, y qué clave usa Cord cuando no la asignas."
category: "Facturación"
order: 2
---

Esto aplica solo a organizaciones en **México**: cada concepto de un CFDI 4.0 lleva una **Clave de producto o servicio** (catálogo c_ClaveProdServ, 8 dígitos) y una **Clave de unidad** (catálogo c_ClaveUnidad) del SAT.

### Asignar las claves a un producto

1. En **Productos**, abre el producto (o crea uno nuevo).
2. En la sección **Facturación electrónica (SAT)**, escribe en **Clave de producto o servicio** una palabra que describa lo que vendes (por ejemplo "software" o "consultoría") y elige la clave de la lista. Si ya conoces la clave, escribe sus 8 dígitos.
3. La **Clave de unidad** se llena sola según la **Unidad** del producto: "hora" se timbra como `HUR`, "mes" como `MON`, "kg" como `KGM`, "servicio" como `E48`. Si necesitas otra, escríbela y queda fija (por ejemplo `ACT` para una actividad).
4. Guarda el producto.

Desde ese momento, cada cotización o factura que incluya el producto se timbra con sus claves. Las claves se toman al timbrar y quedan guardadas en el CFDI: cambiarlas después no altera facturas ya emitidas.

### Qué clave se usa si no la asignas

- **Concepto de un producto sin clave de producto:** se envía la clave genérica `01010101` ("No existe en el catálogo").
- **Producto sin clave de unidad:** se usa la que corresponda a su unidad; si la unidad no se reconoce, `H87` ("Pieza").
- **Línea libre** (escrita a mano, sin producto del catálogo): `01010101` y `H87`.

Las claves genéricas son válidas ante el SAT y no impiden timbrar, pero no describen tu giro: tu cliente no puede clasificar el gasto con precisión. Si tu contador te pide claves específicas, asígnalas a tus productos.

<Callout type="info">
Si la búsqueda no responde, escribe directamente los 8 dígitos de la clave. Cord valida que tenga la forma del catálogo antes de guardar y antes de timbrar.
</Callout>
