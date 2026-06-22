---
title: "[EN] Razones de pagos rechazados"
description: "Códigos de error bancarios comunes y cómo solucionarlos."
category: "Payments & Deposits"
---

Ver un pago fallido es frustrante, pero Cord delega el procesamiento directamente a Stripe, por lo que la declinación proviene de los algoritmos antifraude o del banco emisor de la tarjeta.

### Identificar el motivo en Stripe

Si un cliente te reporta que su tarjeta no pasa al intentar pagar una cotización:
1. Entra a tu Dashboard de Stripe y ve a **Pagos**.
2. Verás los intentos fallidos. Stripe te dirá exactamente por qué rebotó (ej. *insufficient_funds*, *do_not_honor*, *fraudulent*).
3. Al ser cobros B2B de alto monto (decenas de miles de pesos), es extremadamente común que los bancos bloqueen la tarjeta preventivamente.

**Solución recomendada:**
Pide al cliente que llame a su banco, confirme que él está intentando hacer un pago fuerte en línea, y luego vuelva a intentar el pago desde la cotización de Cord.
