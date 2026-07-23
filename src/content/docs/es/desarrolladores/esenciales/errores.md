---
title: "Manejo de Errores"
description: "Comprende los códigos de estado y respuestas de error de la API de Cord."
---

<header class="content-header">
  <h1 class="page-title">Manejo de Errores</h1>
  <p class="page-subtitle">Cord utiliza códigos HTTP convencionales y una estructura de error predecible para indicar éxito o fallo.</p>
</header>

## Códigos de Estado HTTP

La API de Cord siempre devuelve códigos de estado HTTP estándar. Como regla general:
- **`2xx`** indican éxito.
- **`4xx`** indican un error originado por la información proveída (ej. parámetros faltantes, token inválido).
- **`5xx`** indican un error en los servidores de Cord (son muy raros).

### Resumen de Códigos

| Código | Descripción |
|---|---|
| **200 OK** | Todo funcionó como se esperaba. |
| **400 Bad Request** | La petición era inaceptable. Generalmente significa `invalid_request` (faltan campos) o `invalid_json`. |
| **401 Unauthorized** | Falta tu Clave de API o es incorrecta. |
| **403 Forbidden** | Tienes permisos insuficientes (ej. intentaste escribir con una clave que solo tiene permisos de lectura). |
| **404 Not Found** | El recurso (cotización, cliente) no existe. |
| **409 Conflict** | Por ejemplo, si intentas borrar datos de prueba (`/api/test-mode/reset`) sin estar en una organización tipo Sandbox. |

## Estructura del Objeto Error

Cuando ocurre un error `4xx` o `5xx`, Cord siempre responde con un objeto JSON unificado que contiene el tipo de error y un mensaje humano descriptivo para ayudarte a diagnosticar el problema de inmediato.

**Ejemplo de Respuesta de Error:**

```json
{
  "error": {
    "code": "invalid_request",
    "message": "El nombre de la empresa es obligatorio"
  }
}
```

### Códigos de Error Comunes (`error.code`)

- `invalid_json`: Ocurre cuando el cuerpo de tu petición `POST` o `PATCH` no es un JSON válido.
- `invalid_request`: Ocurre cuando fallan las validaciones de negocio. Por ejemplo, enviar una cotización sin especificar un cliente válido, o intentar aplicar un descuento superior al 100%. El campo `message` explicará la razón exacta.
