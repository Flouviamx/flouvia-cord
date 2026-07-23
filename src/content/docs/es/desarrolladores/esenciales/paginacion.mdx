---
title: "Paginación"
description: "Aprende a navegar listas largas de resultados en la API de Cord."
---

<header class="content-header">
  <h1 class="page-title">Paginación</h1>
  <p class="page-subtitle">Navega eficientemente por grandes volúmenes de datos usando cursores offset.</p>
</header>

## ¿Por qué paginamos?

Endpoints que devuelven colecciones de objetos, como listar todos tus clientes o cotizaciones, pueden devolver cientos de miles de registros. Para asegurar que la API de Cord sea siempre rápida y estable, estos endpoints limitan la cantidad de objetos devueltos por defecto (generalmente 50 o 100) utilizando un modelo de paginación basado en `limit` y `offset`.

## Parámetros de Consulta

Todas las rutas de lectura de listas (`GET /v1/cotizaciones`, `GET /v1/clientes`, `GET /v1/productos`) aceptan los siguientes parámetros en la URL:

- `limit`: (Entero) Determina el número máximo de resultados a devolver. 
- `offset`: (Entero) Especifica cuántos resultados saltar antes de comenzar a devolver los datos.

**Ejemplo de Petición (Página 2):**

```bash
curl -X GET "https://api.cordhq.com/v1/clientes?limit=50&offset=50" \
     -H "Authorization: Bearer sk_live_tU..."
```

## Estructura de Respuesta (Meta)

Todas las respuestas paginadas de Cord devuelven un objeto JSON con dos propiedades principales: `data` (el arreglo de objetos) y `meta` (información sobre la paginación para tu frontend o scripts).

```json
{
  "data": [
    { "id": "cus_123", "empresa": "ACME Corp" },
    { "id": "cus_124", "empresa": "Stark Ind" }
  ],
  "meta": {
    "limit": 50,
    "offset": 50,
    "total": 142
  }
}
```

- Usa `meta.total` para construir controles de paginación en tu interfaz de usuario o para saber exactamente cuándo detener un script de exportación de datos.
