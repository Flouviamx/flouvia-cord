---
title: "[EN] Conciliación de depósitos"
description: "Exporta reportes para empatar depósitos con tu contabilidad."
category: "Payments & Deposits"
---

Conciliar pagos B2B puede ser complejo, especialmente si recibes múltiples transferencias SPEI o depósitos consolidados de Stripe.

### Conciliación de Transferencias (SPEI)
Cord no tiene visibilidad directa de tu estado de cuenta bancario. Para conciliar transferencias:
1. Cuando recibas un depósito, busca el Folio de la cotización o el RFC del cliente en Cord.
2. Abre la cotización y haz clic en **Marcar como Pagado**.
3. Si la cotización requiere CFDI, esto detonará el timbrado de la Factura (PUE) o del Complemento de Pago (REP) de inmediato.

### Conciliación de Stripe
Si tus clientes pagan con tarjeta vía el checkout integrado:
1. Cord marca la cotización como 'Pagada' instantáneamente gracias al webhook.
2. En tu cuenta de Stripe, podrás ver el número de Cotización de Cord (ej. `COT-042`) inyectado en los `metadata` del PaymentIntent.
3. Usa los reportes de Stripe para ver qué transacciones componen cada dispersión a tu banco.
