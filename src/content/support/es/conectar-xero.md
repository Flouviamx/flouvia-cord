---
title: "Conectar Xero"
description: "Cada factura definitiva de Cord entra a tu Xero como borrador, con su contacto, sus líneas y su divisa."
category: "Cuenta y Equipo"
order: 28
---

Con Xero conectado, cada factura que emites en Cord aparece en tu contabilidad con su contacto, sus conceptos y su divisa. Dejas de capturar lo mismo dos veces.

**Entra como BORRADOR, y la apruebas tú.** Un sistema de fuera no debería asentar solo en los libros de nadie: Cord deja la factura lista y la revisa tu contador antes de aprobarla.

### Conectarlo

1. Entra a **Ajustes › Integraciones › Xero**. Necesitas el permiso de **Ajustes**.
2. Pulsa **Conectar Xero** y autoriza. Xero te pregunta a qué organización quieres dar acceso: elige la de tu empresa.
3. Al volver verás el nombre de la organización conectada. Desde ese momento, cada factura nueva viaja sola.
4. Si ya tenías facturas emitidas, pulsa **Enviar las facturas pendientes** para mandar las últimas 50 que falten.

### Qué crea en tu contabilidad

- **El contacto**, si no existe, buscándolo primero por correo para no duplicarlo. Una vez encontrado, lo recuerda.
- **La factura de venta** (`ACCREC`) en estado **DRAFT**, con la fecha, el vencimiento, la divisa, el folio de Cord en la referencia y una línea por concepto con el precio negociado y su descuento ya aplicados.
- Los importes se declaran **sin impuesto incluido** (`Exclusive`), porque Cord ya calculó el impuesto por línea de su lado y no queremos que Xero lo vuelva a aplicar encima.

### Lo que no hace todavía

- **No aprueba la factura.** Es deliberado: la apruebas tú en Xero.
- **No manda los pagos** ni mapea tus códigos de impuesto. Revisa el impuesto de la primera factura antes de aprobarla.
- **No trae nada de Xero hacia Cord.** El flujo va en un solo sentido.

### Si algo falla

Una factura nunca se manda dos veces: Cord recuerda cuál quedó en Xero. Si la conexión caduca —Xero renueva su acceso cada 30 minutos y revoca el anterior—, la tarjeta te lo dice y basta con reconectar.
