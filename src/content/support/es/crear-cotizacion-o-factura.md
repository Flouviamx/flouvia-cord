---
title: "Crear una cotización o una factura paso a paso"
description: "El editor de Cord de principio a fin: cliente y términos, líneas, condiciones, vista previa, envío, autoguardado y atajos."
category: "Cotizaciones"
order: 0
---

Cotización nueva, borrador, nueva versión y factura usan **el mismo editor**. Lo abres desde **Cotizaciones > Nueva cotización**, **Facturas > Nueva factura** o el botón **Crear** de la barra superior. Lo que cambia entre una cotización y una factura son los textos y el paso 3.

### Atajo opcional: armarlo con IA

Arriba del editor está **Arma la cotización con IA** (o **Arma la factura con IA**). Pega el pedido del cliente o adjunta la foto o el PDF de su orden de compra y pulsa **Armar cotización con IA**: Cord empareja lo que pide contra tu catálogo y llena las líneas. Revisa siempre cantidades y precios. Si el documento ya tenía líneas, te pregunta si quieres **Reemplazar** las actuales o **Agregar al final**.

Si el documento ya tiene líneas, este bloque aparece plegado en una sola barra con el botón **Abrir**. No es obligatorio: puedes empezar directo en el paso 1.

### Paso 1: ¿A quién le cotizas?

1. En **Cliente**, escribe en el buscador: filtra por empresa, contacto, correo o identificador fiscal. Muévete con las flechas, elige con **Enter**; **Escape** cierra la lista y conserva el cliente que ya tenías.
2. Si no existe, la última opción siempre es **+ Crear nuevo cliente…**: lo das de alta en un modal y queda seleccionado.
3. Debajo verás su correo e identificador fiscal. Si el cliente tiene un nivel con descuento, aparece la nota "Nivel del cliente: −10% aplicado a los precios de lista de tu catálogo" (con su porcentaje).
4. A la derecha eliges los **Términos de pago**: **Contado**, **Net 15**, **Net 30**, **Net 60** u **Otro plazo** (Net 7, Net 45 o Net 90). Al elegir el cliente se preseleccionan los términos de su ficha.

### Paso 2: ¿Qué le vas a cotizar?

- **Agregar del catálogo:** escribe en "Busca en tu catálogo… (nombre o SKU)" y pulsa **Enter**. Para agregar varias piezas de una vez escribe la cantidad junto al nombre: "40 tubo", "40x tubo" o "tubo x40" agrega 40. Puedes agregar varios productos seguidos sin salir del buscador.
- **Línea libre:** **+ Línea libre** para un concepto que no está en tu catálogo.
- **Kits:** **+ Insertar kit** agrega todas las líneas de un kit; puedes indicar cuántas veces insertarlo y, si el kit tiene precio de combo, se aplica.
- **Precio:** cada línea muestra **Lista** (tu precio de catálogo) y **Precio** (lo que le cobras). Baja el precio sin tocar tu lista; la lista aparece tachada. Las cantidades aceptan decimales (1.5, 0,125) y los precios coma o punto.
- **Duplicar y quitar:** cada línea tiene botones para duplicarla o quitarla. Si quitas una por error, la barra "Quitaste … Deshacer" te deja recuperarla durante unos segundos.
- **Reordenar:** arrastra la línea por su agarre, o usa **Alt + flecha arriba/abajo** desde cualquier campo de la línea.
- **Impuesto por línea:** si tu catálogo tiene más de una tasa, cada línea muestra su propia columna de impuesto.
- **Margen:** en cotizaciones, la columna **Margen** muestra tu ganancia sobre el precio cuando el producto tiene costo capturado.

Una línea sin precio o con cantidad cero se marca en rojo y no se guarda hasta que la corrijas (el precio puede ser 0 si lo decides así).

### Paso 3: Condiciones

**En una cotización:**
- **Vigencia:** cuántos días es válida la oferta (15, 30, 60 o el valor predeterminado de tu cuenta).
- **Anticipo (%)** (opcional): el editor te dice cuánto paga tu cliente al aprobar y cuánto después. Ver [Cobrar un anticipo](/soporte/cobrar-anticipo).
- **¿En qué moneda le cotizas?:** la divisa de venta. Ver [Cotizaciones multimoneda](/soporte/cotizaciones-multimoneda).
- **Cobro recurrente mensual (iguala):** cobra el total cada mes con tarjeta. Solo funciona con términos de contado y no lleva anticipo.

**En una factura:**
- **Vencimiento:** la fecha límite de pago; al cambiar los términos se recalcula sola.
- **Tipo de documento:** proforma o factura comercial, o el documento fiscal de tu país (CFDI 4.0 en México, VERI\*FACTU en España) cuando tu plan y tu configuración fiscal lo permiten. Ver [Facturación comercial en Gratis](/soporte/facturacion-gratis).
- **Divisa de la factura.**

Si cambias la divisa, los precios **no se convierten**: tus líneas conservan el mismo número en la nueva divisa, así que revísalos. Al final puedes agregar una **Nota para el cliente** (opcional).

### Revisa y envía

El resumen de la derecha muestra el conteo de líneas y unidades, el subtotal, lo que le descontaste, los impuestos por tasa, las retenciones y el **Total**, con las condiciones debajo (por ejemplo "Net 30 · válida 30 días"). Ahí también activas **Precios ya incluyen IVA** (o el impuesto de tu país) si tus precios lo traen incluido.

- **Vista previa** abre "Así lo verá tu cliente": una vista aproximada del documento. No guarda nada; el PDF final usa tu plantilla, tu marca y tus datos fiscales.
- **Cotización:** **Crear y enviar** (o **Guardar y enviar** en un borrador) genera el link público y lo manda. **Guardar borrador** (o **Guardar cambios**) guarda sin enviar. Si tu organización tiene aprobaciones y el descuento, el monto o el margen salen de tu política, el envío pide aprobación en lugar de llegar al cliente.
- **Factura:** **Emitir y enviar** abre una revisión final con cliente, total, vencimiento y a qué correo se entrega antes de **Emitir factura**. También tienes **Emitir sin enviar** y **Guardar y salir**. Emitir asigna el folio y no se puede deshacer: después, una corrección requiere anulación o nota de crédito.

### Autoguardado y cambios sin guardar

- Un **borrador** que ya existe se guarda solo unos segundos después de cada cambio; el resumen indica "Guardado a las …" o avisa si no se pudo guardar.
- Un documento **nuevo** no se crea en tu cuenta hasta que lo guardas o lo envías. Mientras tanto, este navegador conserva una copia: si cierras sin guardar, la próxima vez que abras **Nueva cotización** o **Nueva factura** te pregunta si quieres **Recuperar** el cliente, los términos, la nota y las líneas. La copia dura 7 días y vive solo en ese dispositivo.
- Si intentas salir con cambios sin guardar, Cord te pide confirmar.

### Atajos de teclado

- **⌘ Enter** (Ctrl + Enter en Windows): envía la cotización o emite la factura.
- **⌘ S** (Ctrl + S): guarda el borrador.
- **/**: lleva al buscador del catálogo. **⌘ K** sigue abriendo la búsqueda general de la app.

### En el celular

El editor se acomoda en una sola columna y nada se oculta: en las líneas, cantidad y precio llevan su etiqueta. Una barra fija abajo muestra el **Total** y el botón principal, y se retira cuando el resumen ya está a la vista. Los atajos de teclado y el arrastre para reordenar son de escritorio.

### Nueva versión de una cotización enviada

Si el cliente pide cambios a una cotización enviada, vista o vencida, ábrela y usa **Modificar y reenviar** (aparece con el número de la siguiente versión, por ejemplo V2). Se abre el mismo editor con la etiqueta de la versión: cambias líneas y precios, mientras que el cliente, la divisa y las condiciones se quedan como se enviaron. **Enviar nueva versión** la publica en el mismo link y la anterior queda en el historial.

La versión vuelve a correr la vigencia desde hoy, con la misma duración con que se envió (una cotización vencida revive así). Si necesitas cambiar cliente, divisa o condiciones, usa **Duplicar cotización** para partir de una copia. Ver [Duplicar o clonar cotizaciones](/soporte/clonacion-cotizaciones).
