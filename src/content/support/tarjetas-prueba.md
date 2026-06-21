---
title: "Números de tarjeta de prueba"
description: "Lista de PANs para simular flujos 3D Secure y fallos."
category: "Desarrolladores"
---

Cuando estés integrando flujos de cobro en el entorno **Sandbox**, no uses tarjetas de crédito reales. Utiliza nuestros números mágicos de tarjeta de prueba para simular comportamientos exitosos o de error.

### Tarjetas Mágicas para Pruebas

Para usar estas tarjetas, asegúrate de estar en Modo Pruebas o usando la llave `sk_test_...`. En los campos de expiración pon cualquier fecha futura (ej. `12/28`) y en CVC cualquier número (ej. `123`).

**Flujos Exitosos (Pago Aprobado)**
- Visa: `4242 4242 4242 4242`
- Mastercard: `5105 1051 0510 5100`
- AMEX: `3782 822463 10005` (usa un CVV de 4 dígitos para AMEX).

**Simulación de Errores y Declinaciones Bancarias**
Si deseas probar tu interfaz para ver cómo reacciona cuando un cliente recibe un rechazo:
- Tarjeta Reportada Robada: `4000 0000 0000 0002`
- Fondos Insuficientes: `4000 0000 0000 0004`
- Tarjeta Caducada: Utiliza la tarjeta de éxito `4242` pero pon una fecha del pasado (ej. `01/22`).

El backend devolverá el objeto JSON simulando a la perfección el comportamiento del procesador real.
