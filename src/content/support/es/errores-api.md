---
title: "Manejo de códigos de error API"
description: "Significado de HTTP 400, 401, 402, 404 y 500 en Cord."
category: "Desarrolladores"
---

Cuando integras la API de Cord, es fundamental saber cómo manejar las respuestas fallidas para brindar una buena experiencia a tus usuarios.

### Estructura de un Error

Todas las respuestas fallidas (HTTP 4xx y 5xx) regresan un objeto JSON estandarizado:

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "parameter_missing",
    "message": "El campo 'amount' es obligatorio para procesar el pago.",
    "param": "amount",
    "doc_url": "https://cord.flouvia.com/soporte/errores-api#parameter_missing"
  }
}
```

### Códigos HTTP Comunes
- **400 Bad Request:** A tu petición le falta un parámetro o tiene un formato incorrecto.
- **401 Unauthorized:** Tu Clave API es inválida o no enviaste el header de autorización.
- **402 Payment Required:** El intento de cobro falló (ej. tarjeta declinada o sin fondos).
- **403 Forbidden:** Tu llave no tiene permisos para acceder a este recurso.
- **429 Too Many Requests:** Has superado el límite de peticiones (Rate Limit).
- **500 Internal Server Error:** Error de nuestro lado (es muy raro, pero contacta a soporte si persiste).

Para manejar declinaciones de tarjetas suavemente, lee la propiedad `code` (ej. `card_declined` o `insufficient_funds`) y muéstrale un mensaje amigable a tu cliente.
