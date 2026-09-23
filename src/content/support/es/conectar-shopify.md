---
title: "Conectar Shopify"
description: "Trae los productos y los clientes de tu tienda a Cord para cotizar mayoreo con datos reales, y mantenlos al día solos."
category: "Cuenta y Equipo"
order: 24
---

Con Shopify conectado, tu catálogo y tus clientes de la tienda entran a Cord y se mantienen al día. Así cotizas mayoreo con los precios y los SKU que ya tienes, sin volver a capturarlos.

**Cord lee tu tienda y escribe solo lo que tú enciendas.** Productos y clientes entran solos; crear el pedido al cerrar la cotización nace apagado y lo activas tú. Cord nunca cambia precios ni edita tu catálogo.

### Conectarla

1. Entra a **Ajustes › Integraciones › Shopify**. Necesitas el permiso de **Ajustes**.
2. Escribe el dominio de tu tienda, el que termina en `myshopify.com`. Lo ves en Shopify › Configuración › Dominios.
3. Pulsa **Conectar Shopify**. Te lleva a Shopify para autorizar la app; ahí ves exactamente qué permisos pide: leer productos y clientes, y crear pedidos cuando tú lo actives.
4. Al volver, la tarjeta dice conectada. La primera sincronización tarda unos minutos según el tamaño del catálogo.

### Qué trae, y cómo

- **Productos:** cada **variante** de Shopify es un producto en Cord, porque es lo que tiene su propio precio y SKU. Una camisa con tres tallas llega como tres productos.
- **Clientes:** la empresa sale de la compañía del cliente en Shopify; si no tiene, del nombre de la persona. Si ese correo ya existe en tu lista de clientes, Cord no lo duplica: lo reconoce y completa lo que falte.
- **Al día solos:** cuando cambias un producto o un cliente en Shopify, Cord lo actualiza en segundos. Un producto borrado en Shopify se **desactiva** en Cord, no se borra: pudo quedar dentro de una cotización ya enviada.
- **Sincronizar ahora:** el botón de la tarjeta vuelve a leer todo el catálogo. Sirve si conectaste hace poco o si dudas de algo.

### Crear el pedido en Shopify al cerrar

Cuando la cotización cierra, Cord puede crear el pedido en tu tienda para que el surtido, el inventario y el envío vivan ahí. **Nace apagado**: lo activas tú en la tarjeta de Shopify, eligiendo cuándo se crea.

- **Al aprobarse la cotización:** el pedido queda como borrador en Shopify, listo para surtir o para cobrar desde ahí.
- **Cuando el cliente pague:** Cord cobra y el pedido entra a tu tienda marcado como pagado.

Cada línea con un producto de tu tienda viaja como esa variante, así el pedido descuenta inventario; una línea libre viaja como concepto con su precio, en vez de perderse. El precio que se manda es el negociado, con su descuento aplicado.

Dos cosas que conviene saber:

- **La divisa manda.** El pedido se crea en la divisa de tu tienda. Si la cotización va en otra, Cord no crea el pedido en lugar de cobrar en la equivocada.
- **El impuesto lo calcula Shopify** con la configuración de tu tienda. Si no coincide con el de la cotización, el documento fiscal de Cord es el que vale.

Una cotización genera un solo pedido: si el evento se repite, Cord reconoce el que ya existe.

### Desconectar

Desde la misma tarjeta, con **Desconectar**. Los productos y clientes que ya entraron se quedan en Cord, como cualquier otro dato tuyo; simplemente dejan de actualizarse. Si desinstalas la app desde Shopify, Cord se entera solo y marca la conexión como desconectada.

### Si algo falla

- **"Escribe el dominio de tu tienda"**: pusiste tu dominio propio (`mitienda.com`). Shopify autentica con el suyo, el que termina en `myshopify.com`.
- **"No pudimos verificar que la respuesta venga de Shopify"**: la vuelta de la instalación llegó sin la firma correcta o muy tarde. Inicia otra vez desde Cord, no desde un enlace guardado.
- **La tarjeta dice que requiere reconectar**: alguien desinstaló la app en Shopify o cambió sus permisos. Conéctala de nuevo desde Cord.
