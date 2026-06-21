---
title: "Razones de pagos rechazados"
description: "Códigos de error bancarios comunes y cómo solucionarlos."
category: "Pagos y Depósitos"
---

Ver un pago fallido es frustrante, pero en el 90% de los casos, la declinación no proviene de la pasarela de Cord, sino del banco emisor de la tarjeta de tu cliente.

### Códigos de Declinación Comunes

En tu dashboard, si haces clic en un pago fallido, verás el motivo exacto:

- **insufficient_funds:** El cliente no tiene saldo suficiente o ha topado su límite de crédito. *Solución:* Pide al cliente usar otra tarjeta o pagar vía Transferencia SPEI.
- **do_not_honor / generic_decline:** El banco bloqueó la transacción por reglas internas de prevención antifraude. Al ser una transacción de alto valor online, los bancos suelen bloquearlas por protección. *Solución:* El cliente **debe** llamar a la línea de soporte al reverso de su tarjeta y autorizar verbalmente los cargos de "Flouvia/Cord", luego intentar pagar nuevamente.
- **expired_card:** El plástico caducó.
- **processing_error:** Error en la red de pagos. Inténtalo de nuevo en 5 minutos.

Nuestra IA de cobranza automáticamente le enviará un correo amigable al cliente explicándole que su pago falló y sugiriéndole contactar a su banco o cambiar el método de pago.
