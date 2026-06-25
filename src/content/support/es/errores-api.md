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

- **400 Bad Request:** falta un parámetro o el JSON está mal formado.
- **401 Unauthorized:** tu Clave API es inválida, está revocada o no enviaste el header `Authorization`.
- **403 Forbidden:** tu llave no tiene el alcance necesario (ej. usas una llave de solo lectura para un `POST`).
- **404 Not Found:** el recurso no existe o no pertenece a tu organización.
- **429 Too Many Requests:** superaste el límite de peticiones. Ver [Límites de peticiones](/soporte/limites-peticiones).
- **500 Internal Server Error:** error de nuestro lado (raro; contacta a soporte si persiste).

> Nota: la API v1 no procesa cobros con tarjeta directamente (eso ocurre en el link público vía Stripe), así que no verás errores de tarjeta declinada en estas respuestas.
