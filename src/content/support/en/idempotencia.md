---
title: "[EN] Claves de Idempotencia"
description: "Evita cargos duplicados usando llaves de idempotencia."
category: "Developers"
---

La idempotencia es una técnica que asegura que una operación en la API ocurra exactamente una vez, sin importar cuántas veces se reintente la misma petición. Es vital para prevenir cobros dobles debido a fallos de red.

### ¿Cómo usar llaves de Idempotencia?

Al realizar peticiones `POST` que alteran el estado (ej. crear un cargo, reembolsar, timbrar factura), debes enviar el header HTTP `Idempotency-Key`.

```bash
curl -X POST https://api.flouvia.com/v1/charges \
  -H "Idempotency-Key: cobro_mensual_u102_abril" \
  -d '{...}'
```

**Reglas del Sistema:**
- La llave puede ser cualquier string único (ej. un UUID v4 o un ID interno de tu base de datos) de hasta 255 caracteres.
- Si la conexión se cae y reintentas el `POST` con la misma `Idempotency-Key`, Cord no cobrará de nuevo a la tarjeta. Simplemente te regresará exactamente la misma respuesta JSON que generó la primera vez (el cargo exitoso original).
- Las llaves de idempotencia caducan y son borradas de nuestra caché a las **24 horas** de haber sido recibidas.
