---
title: "Facturación (CFDI) y la API"
description: "Cómo se emiten las facturas en Cord y qué expone la API pública v1."
category: "Desarrolladores"
---

La facturación **sí** está expuesta en la API pública v1. Una factura es un recurso propio: puedes crearla, emitirla, enviarla, registrarle pagos y anularla sin pasar por una cotización.

### El ciclo de vida de una factura

Una factura tiene dos ejes que no se mezclan: su **estado comercial** (`draft`, `open`, `paid`, `void`, `uncollectible`) y su **estado fiscal** (`pending`, `issued`, `cancelled`, `error`). "Timbrada ante el SAT" y "pagada por el cliente" son hechos distintos.

1. **Borrador** — `POST /api/v1/facturas` con `cliente_id` e `items`. No consume folio ni timbre.
2. **Emitir** — `POST /api/v1/facturas/{id}` con `{ "action": "finalize" }`. Aquí se reserva el folio consecutivo y se timbra: CFDI 4.0 ante el SAT en México (con el CSD de tu organización), factura comercial con folio propio en el resto del mundo.
3. **Enviar** — `{ "action": "send" }` manda la factura al correo del cliente con su PDF y el link a su propia página de pago.
4. **Cobrar** — el cliente paga con tarjeta desde ese link, o registras un pago manual con `{ "action": "payment", "monto": 1000, "moneda": "MXN" }`. El saldo baja en ambos casos; al llegar a cero la factura pasa a `paid`.
5. **Anular o acreditar** — `{ "action": "void" }` cancela ante el SAT. Si la factura ya tiene pagos aplicados, la respuesta es `409` con `code: "credit_note_required"`: el documento correcto es una nota de crédito, `{ "action": "credit_note" }`.

### Endpoints

| Método | Ruta | Scope |
|---|---|---|
| `GET` | `/api/v1/facturas?estado=&cliente=&q=&cursor=` | `read` |
| `POST` | `/api/v1/facturas` | `write` |
| `GET` | `/api/v1/facturas/{id}` | `read` |
| `POST` | `/api/v1/facturas/{id}` (`finalize`, `send`, `payment`, `void`, `credit_note`) | `write` |

El listado pagina por cursor: si la respuesta trae `meta.next_cursor`, repite la llamada con `?cursor=`.

### Desde una cotización

Si el trato ya vivía en Cord, sigue funcionando igual: marcas la cotización como **facturada** y Cord emite el documento heredando cliente, líneas y divisa. Las dos rutas producen la misma factura, con el mismo ciclo de vida.

Para que el CFDI salga a nombre de un RFC específico, captura el **régimen fiscal, código postal y uso de CFDI** del cliente en su ficha. Sin esos datos, el comprobante se emite como "público en general".

### Webhooks

Cada cambio de estado dispara un evento con payload de **factura** (folio, folio fiscal, saldo, vencimiento), no de cotización:

`invoice.finalized`, `invoice.sent`, `invoice.paid`, `invoice.payment_failed`, `invoice.voided`, `invoice.marked_uncollectible`, `invoice.overdue`.

### MCP

El servidor MCP de Cord expone `listar_facturas`, `detalle_factura` y `crear_factura_borrador`. La escritura llega solo hasta el borrador a propósito: timbrar es irreversible y cuesta dinero real, así que se hace desde la app o desde la API con una llave de escritura.
