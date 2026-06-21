---
title: "Números de tarjeta de prueba"
description: "Lista de PANs para simular flujos 3D Secure y fallos."
category: "Desarrolladores"
---

# Números de tarjeta de prueba

Lista de PANs para simular flujos 3D Secure y fallos.

Como desarrollador, Cord te proporciona las herramientas para integrar esta funcionalidad directamente en tu propia arquitectura. A continuación, exploraremos cómo implementar **Números de tarjeta de prueba** usando nuestra API REST.

## Prerrequisitos de Integración

Antes de iniciar la petición, asegúrate de cumplir con lo siguiente:
- Tener una [Clave de API válida](/soporte/claves-api) (Secreta).
- Que tu entorno esté configurado para soportar conexiones TLS 1.2 o superior.
- Enviar el header `Authorization: Bearer sk_...`.

## Implementación Técnica

Dependiendo del entorno (Test o Live), tu petición debe dirigirse al endpoint correspondiente. A continuación un ejemplo de cómo estructurar la petición:

```bash
# Petición de ejemplo con cURL
curl -X POST https://api.flouvia.com/v1/resource \
  -H "Authorization: Bearer sk_test_your_secret_key" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: req_123456789" \
  -d '{
    "environment": "sandbox",
    "reference_id": "ext_987",
    "metadata": {
      "internal_user_id": "u_001"
    }
  }'
```

> [!NOTE]
> **Uso de SDKs**
> Si estás utilizando un ecosistema en JavaScript, te recomendamos encarecidamente utilizar el [Cord Node.js SDK](/soporte/node-sdk) para manejar la serialización de datos automáticamente.

## Manejo de Errores

Si la API rechaza tu petición, revisa el campo `error.code` en la respuesta JSON. Los errores comunes 40x generalmente indican que un parámetro requerido fue omitido o que tu API Key no tiene los permisos suficientes.
