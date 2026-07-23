---
title: "API de Productos"
description: "Alimenta y consulta tu catálogo de productos y servicios."
---

<header class="content-header">
  <h1 class="page-title">Productos</h1>
  <p class="page-subtitle">Alimenta tu catálogo de servicios y expón inventarios de forma segura en tus frontends.</p>
</header>

## Descripción General

El objeto `Producto` contiene los elementos de tu lista de precios (SKU, nombre, precio base y métrica de unidad). La API de productos de Cord es lo suficientemente segura como para que puedas consumirla no solo desde tus servidores internos, sino también directamente desde el navegador de tus clientes.

## Crear un Producto

Usa tu **Clave de API Secreta** (`sk_`) para alimentar el catálogo masivamente. Ideal para integraciones nocturnas o webhooks provenientes de sistemas de gestión de inventarios.

**Petición:**

```bash
curl -X POST "https://api.cordhq.com/v1/productos" \
     -H "Authorization: Bearer sk_live_tU..." \
     -H "Content-Type: application/json" \
     -d '{
       "sku": "LIC-PRO-24",
       "nombre": "Licencia Anual Profesional",
       "unidad": "licencia",
       "precio": 12000,
       "activo": true
     }'
```

**Respuesta Exitosa:**

```json
{
  "data": {
    "id": "prod_1a2b3c..."
  }
}
```

## Listar Productos y Seguridad de Datos

La API de listado (`GET /v1/productos`) cuenta con un mecanismo de enmascaramiento dinámico (Dynamic Masking) basado en el nivel de confianza de la clave de API con la que te autenticas.

Si usas una **Clave Secreta (`sk_`)**:
Cord asume que eres un sistema interno confiable y te devuelve el objeto completo, **incluyendo los costos ocultos y márgenes de ganancia (`costo`)**.

Si usas una **Clave Publicable (`pk_`)**:
Las claves publicables se exponen en el navegador (por ejemplo, para pintar una lista de precios en una web pública de React). Cord asume riesgo y **retira automáticamente el campo `costo` de todos los resultados en memoria** antes de serializar el JSON. Así, tus márgenes jamás se fugan al frontend público.

```bash
curl -X GET "https://api.cordhq.com/v1/productos?limit=50" \
     -H "Authorization: Bearer pk_live_yX..."
```
