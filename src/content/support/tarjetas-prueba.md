---
title: "Números de tarjeta de prueba"
description: "Lista de PANs para simular flujos 3D Secure y fallos."
category: "Desarrolladores"
---

Cuando estés en la fase de implementación o desarrollando contra la API en el entorno **Sandbox**, no utilices tarjetas de crédito reales. Puedes simular pagos exitosos usando los números de prueba proporcionados por Stripe.

### Tarjetas Mágicas (Solo en modo Test)

Asegúrate de tener configurada tu llave `sk_test_...` de Stripe en Cord.
En el formulario de Stripe Checkout, ingresa cualquier fecha futura de expiración y cualquier CVC de 3 dígitos.

**Para simular pagos exitosos:**
- Usa la tarjeta Visa genérica: `4242 4242 4242 4242`

**Para simular declinaciones bancarias:**
Stripe provee números específicos para simular errores. Usa cualquiera de estos con cualquier fecha y CVC:
- Fondos insuficientes: `4000 0000 0000 0004`
- Tarjeta reportada robada: `4000 0000 0000 0002`

El sistema reaccionará igual que en producción: Cord no aprobará la cotización ni emitirá la factura en el modo de pruebas si el pago falla.
