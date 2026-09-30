---
title: "Conectar QuickBooks Online"
description: "Cada factura definitiva de Cord entra a tu QuickBooks con su cliente, sus líneas y su divisa, sin capturarla dos veces."
category: "Cuenta y Equipo"
order: 27
---

Con QuickBooks conectado, cada factura que emites en Cord aparece en tu contabilidad con su cliente, sus conceptos y su divisa. Dejas de capturar lo mismo dos veces y de cuadrar a fin de mes lo que ya estaba en dos lugares.

**QuickBooks no maneja borradores.** Lo que entra por aquí queda asentado en tus libros, así que Cord solo manda facturas que ya son **definitivas** de su lado: nunca un borrador, nunca una cotización.

### Conectarlo

1. Entra a **Ajustes › Integraciones › QuickBooks Online**. Necesitas el permiso de **Ajustes**.
2. Pulsa **Conectar QuickBooks** y autoriza con la cuenta que administra tu empresa en QuickBooks.
3. Al volver verás el nombre de la empresa conectada. Desde ese momento, cada factura nueva viaja sola.
4. Si ya tenías facturas emitidas, pulsa **Enviar las facturas pendientes** para mandar las últimas 50 que falten.

### Qué crea en tu contabilidad

- **El cliente**, si no existe. Cord lo busca primero por correo y luego por nombre, para no llenarte el catálogo de duplicados. Una vez encontrado, lo recuerda: la siguiente factura del mismo cliente reusa ese registro.
- **La factura**, con la fecha, el vencimiento, la divisa y una línea por concepto, con el precio negociado y su descuento ya aplicados.
- **Un servicio llamado "Cord"** la primera vez. QuickBooks no acepta una línea suelta con importe: toda línea de venta cuelga de un producto. Cord crea uno solo y lo reusa, en vez de inventar un producto por cada concepto y ensuciarte el catálogo.
- El folio de Cord va en la **nota privada**, no en el número de factura: la numeración de tu contabilidad es tuya y pisarla puede chocar con tu propia secuencia.

### Lo que no hace todavía

- **No manda los pagos.** Registras el cobro en QuickBooks como siempre. Está en la lista.
- **No envía facturas con retenciones.** QuickBooks no las registra en una factura de venta.

Cada línea entra con el código de impuesto de QuickBooks cuya tasa coincide con la de Cord. Si esa tasa no existe, la factura no se envía y la tarjeta te dice cuál crear.
- **No trae nada de QuickBooks hacia Cord.** El flujo va en un solo sentido.

### Si algo falla

Una factura nunca se manda dos veces: Cord recuerda cuál quedó en QuickBooks y no la repite. Si la conexión caduca, la tarjeta te lo dice y basta con reconectar; las facturas que no alcanzaron a viajar se mandan con **Enviar las facturas pendientes**.
