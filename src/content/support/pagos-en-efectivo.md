---
title: "Recepción de pagos en efectivo"
description: "Habilitar cobros en Oxxo y tiendas de conveniencia."
category: "Pagos y Depósitos"
---

Cord está construido principalmente para flujos B2B digitales (Transferencias SPEI y Tarjetas Corporativas), sin embargo, soportamos la emisión de referencias para pago en efectivo mediante la red OXXO Pay y Tiendas de Conveniencia.

### Funcionamiento de Pagos en Efectivo

Si activas esta opción en los ajustes de tu cuenta:
1. Al abrir la liga de pago de la cotización, el cliente podrá seleccionar "Pago en Efectivo".
2. Se le generará un código de barras y una referencia numérica de 14 dígitos.
3. El cliente tiene 48 horas para presentarse en ventanilla y pagar el monto exacto.

**Retraso de Liquidación y Notificación:**
A diferencia de las tarjetas, los pagos en efectivo en tiendas como OXXO pueden tardar hasta 24 horas en ser notificados a nuestros servidores. La cotización permanecerá en estado *Pendiente de Pago*. En cuanto el cajero de la tienda confirme la recepción del efectivo y la red nos lo notifique vía webhook, Cord disparará el recibo, timbrará la factura y pasará la cotización a estatus *Pagado* automáticamente.
