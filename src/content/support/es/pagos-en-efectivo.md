---
title: "Recepción de pagos en efectivo"
description: "Habilitar cobros en Oxxo y tiendas de conveniencia."
category: "Pagos y Depósitos"
---

Aunque las transacciones B2B suelen ser por transferencia SPEI, si utilizas Stripe como procesador de pagos en Cord, puedes habilitar métodos de pago alternativos como OXXO.

### Activar OXXO a través de Stripe

1. Ve al panel de control de Stripe.
2. En Métodos de Pago, activa OXXO.
3. Cuando el cliente abra la cotización en Cord y decida pagar, Stripe Checkout le ofrecerá descargar un voucher (código de barras) para pagar en efectivo en tienda.

**Flujo Asíncrono:**
El cliente tiene días para pagar el voucher. Durante este tiempo, la cotización en Cord seguirá en estatus *Pendiente*. Cuando el cliente finalmente paga en el OXXO, Stripe nos envía un webhook (a veces tarda hasta 24 horas hábiles), y en ese instante Cord pasa la cotización a *Pagada*. Desde ahí puedes timbrar el CFDI con un clic.
