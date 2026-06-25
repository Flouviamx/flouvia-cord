---
title: "Números de tarjeta de prueba"
description: "Lista de PANs para simular flujos 3D Secure y fallos."
category: "Desarrolladores"
---

Cuando estés probando el cobro con tu cuenta de **Stripe en modo de prueba**, no utilices tarjetas de crédito reales. Puedes simular pagos exitosos usando los números de prueba que provee Stripe.

### Tarjetas Mágicas (Solo en modo Test)

Asegúrate de tener configurada tu llave `sk_test_...` de Stripe en Cord.
En el formulario de Stripe Checkout, ingresa cualquier fecha futura de expiración y cualquier CVC de 3 dígitos.

**Para simular pagos exitosos:**
- Usa la tarjeta Visa genérica: `4242 4242 4242 4242`

**Para simular declinaciones bancarias:**
Stripe provee números específicos para simular errores. Usa cualquiera de estos con cualquier fecha y CVC:
- Fondos insuficientes: `4000 0000 0000 0004`
- Tarjeta reportada robada: `4000 0000 0000 0002`

El flujo reacciona igual que en producción: si el pago falla en el checkout de Stripe, la cotización no pasa a *Pagada*.
