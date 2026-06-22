---
title: "[EN] Límites de peticiones (Rate limits)"
description: "Conoce los límites técnicos de la API de Cord y cómo manejar respuestas 429."
category: "Developers"
order: 4
---

Para asegurar la estabilidad y disponibilidad de nuestros servicios para todos los comercios, la API de Cord impone límites de peticiones (Rate Limits) por IP y por clave de cuenta.

### Límites Técnicos (Rate Limits)

En entorno de Producción (`Live Mode`), operamos bajo los siguientes umbrales estandarizados:
- **100 peticiones por segundo (req/s)** para endpoints de lectura (GET).
- **20 peticiones por segundo (req/s)** para endpoints de mutación y cobro (POST/PUT/DELETE).
- **5 peticiones por segundo (req/s)** para endpoints de facturación fiscal directa al PAC (invoices).

### Manejo de Códigos 429
Si superas la tasa permitida, Cord rechazará la petición con un código HTTP `429 Too Many Requests`.
Tu aplicación debe estar diseñada para manejar esto utilizando **Backoff Exponencial**:
1. Si recibes un 429, pausa la ejecución por 1 segundo e intenta de nuevo.
2. Si falla, pausa por 2 segundos.
3. Luego por 4, luego 8, etc.

**Aumento de Límites:** Si tu modelo de negocio requiere procesar ráfagas masivas (ej. venta de boletos o e-commerce de alto volumen), contacta a tu ejecutivo de cuentas Enterprise para moverte a una infraestructura dedicada.
