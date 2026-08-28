---
title: "Manejo de códigos de error API"
description: "Significado de HTTP 400, 401, 403, 404, 429 y 500 en la API de Cord."
category: "Desarrolladores"
---

Cuando integras la API de Cord, conviene manejar bien las respuestas fallidas para dar una buena experiencia.

### Estructura de un error

Las respuestas fallidas regresan un objeto JSON plano con dos campos:

```json
{
  "error": "El nombre de la empresa es obligatorio",
  "code": "invalid_request"
}
```

- `error`: mensaje legible que puedes mostrar o registrar.
- `code`: identificador estable para ramificar en tu código (ej. `invalid_json`, `invalid_request`).

### Códigos HTTP comunes

- **400 Bad Request:** falta un parámetro o el JSON está mal formado (`code: "invalid_request"` o `"invalid_json"`).
- **401 Unauthorized:** tu Clave API es inválida, está revocada o no enviaste el header `Authorization` (`"invalid_key"`, `"missing_key"`).
- **402 Payment Required:** tu suscripción llegó al número de llaves de API incluidas en el plan (`"subscription_key_limit"`); revoca una llave anterior o sube de plan.
- **403 Forbidden:** tu llave no tiene el alcance necesario (ej. usas una llave de solo lectura para un `POST`, código `"insufficient_scope"`), o una llave publicable intenta un origen/dominio no autorizado (`"unauthorized_origin"`, `"missing_origin"`).
- **404 Not Found:** el recurso no existe o no pertenece a tu organización.
- **409 Conflict:** la acción no encaja con el estado actual del recurso — por ejemplo, anular una factura que ya tiene pagos aplicados responde `409` con `code: "credit_note_required"`: el documento correcto es una nota de crédito.
- **413/415:** el cuerpo de la petición excede el tope de tamaño (`"payload_too_large"`) o no viene como `application/json` (`"unsupported_media_type"`).
- **429 Too Many Requests:** superaste el límite de peticiones o la cuota mensual de tu plan (`"api_quota_exceeded"`). Ver [Límites de peticiones](/soporte/limites-peticiones).
- **500 Internal Server Error:** error de nuestro lado (raro; contacta a soporte si persiste).
- **502/503:** el proveedor externo del que depende la operación no respondió — por ejemplo, timbrar una factura sin poder demostrar el tipo de cambio responde `503` con `code: "fx_unavailable"` en vez de inventar una tasa (ver la política de tipo de cambio en la documentación de facturación).

> Nota: la API v1 no procesa cobros con tarjeta directamente; eso ocurre en el link público de Cord. Por ello no verás errores de tarjeta declinada en estas respuestas.
