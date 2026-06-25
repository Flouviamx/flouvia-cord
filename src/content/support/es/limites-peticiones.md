---
title: "Límites de peticiones (Rate limits)"
description: "Conoce los límites de la API de Cord y cómo manejar respuestas 429."
category: "Desarrolladores"
order: 4
---

Para mantener el servicio estable para todos, Cord aplica un límite de peticiones **por IP**.

### El límite

Hay un piso global de aproximadamente **500 peticiones por minuto por IP** sobre todas las rutas. Es un límite por **minuto** (ventana móvil de 60 segundos), no por segundo. Para integraciones B2B normales (sincronizar catálogos, crear cotizaciones, leer cartera) queda muy holgado.

### Manejo de 429

Si superas el límite, Cord responde `429 Too Many Requests` con un header `Retry-After: 60` (segundos). Tu aplicación debe manejarlo con **backoff exponencial**:

1. Si recibes un 429, espera y reintenta (respeta `Retry-After` si viene).
2. Si vuelve a fallar, duplica la espera: 1s, 2s, 4s, 8s…
3. Pon un tope de reintentos para no quedarte en bucle.

**Buenas prácticas:** agrupa lecturas con paginación (`limit`/`offset`) en vez de muchas llamadas pequeñas, y evita *polling* agresivo — para enterarte de cambios usa [Webhooks](/soporte/configurar-webhooks) en lugar de consultar en bucle.
