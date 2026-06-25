---
title: "Evitar operaciones duplicadas"
description: "Cómo prevenir cotizaciones o registros duplicados al integrar la API."
category: "Desarrolladores"
---

La idempotencia es una técnica que asegura que una operación ocurra una sola vez, sin importar cuántas veces se reintente la misma petición. Es útil para prevenir duplicados cuando una conexión se cae a mitad de un `POST`.

> **Estado actual:** la API v1 de Cord **no expone todavía un header `Idempotency-Key`**. Mientras lo agregamos, usa las siguientes estrategias para evitar duplicados desde tu integración.

### Estrategias recomendadas

- **Guarda el `id` de la respuesta.** Cuando creas una cotización (`POST /api/v1/cotizaciones`), la respuesta trae `data.id` y `data.folio`. Persístelos en tu sistema y no reintentes si ya tienes un id para esa operación lógica.
- **Verifica antes de reintentar.** Si un `POST` falla por timeout, consulta primero con un `GET` (por ejemplo lista de cotizaciones recientes) para ver si la creación sí ocurrió antes de mandarla de nuevo.
- **Aprovecha el dedupe del importador.** La importación de **clientes** deduplica por RFC o nombre, y la de **productos** por SKU. Si sincronizas catálogos, reimportar no crea duplicados.

Cuando publiquemos el soporte oficial de `Idempotency-Key`, actualizaremos esta guía con el header y sus reglas.
