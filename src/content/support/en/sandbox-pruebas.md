---
title: "[EN] Entorno de Pruebas (Sandbox)"
description: "Simula pagos, rechazos y facturas sin dinero real."
category: "Developers"
---

Integrar un sistema de pagos y facturación requiere de un entorno seguro para experimentar sin miedo a gastar dinero o meterte en problemas legales con el SAT. Por eso, hemos dotado a cada organización de Cord con un entorno paralelo de Sandbox (Pruebas).

### Activar el Modo de Pruebas

En tu dashboard principal, ubica el botón o toggle superior llamado **Modo de Pruebas** y actívalo. La interfaz cambiará a color naranja.

En este entorno alternativo:
- Todos los clientes, cotizaciones y facturas creadas aquí son falsas y no existen en Producción.
- **Pagos Falsos:** Puedes probar la experiencia de tu cliente utilizando tarjetas de prueba proporcionadas (ej. la famosa tarjeta de prueba Visa terminación `4242`).
- **Timbrado Simulado:** Al emitir un CFDI en este entorno, la factura se valida mediante un motor que verifica la sintaxis del SAT (que las claves y cálculos coincidan), pero **NO** envía el XML oficial al SAT. De esta manera, tu contador no enloquecerá.

Asegúrate de utilizar las Llaves de API de Test (`sk_test_...`) en tu código mientras desarrollas.
