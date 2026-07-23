---
title: "Entendiendo la idempotencia en transacciones financieras B2B"
date: "2026.07.02"
type: "BLOG"
topic: "Best Practices"
authors:
  - "ANDRÉ VALLE"
readTime: "6 MIN"
---
En los sistemas distribuidos, las redes son inherentemente poco confiables. Un cliente envía una solicitud para cobrar a la tarjeta de crédito de un cliente, pero la conexión se cae antes de que el servidor pueda responder. ¿Se procesó el cargo? ¿Debería el cliente volver a intentarlo?

Sin **idempotencia**, reintentar esa solicitud podría resultar en que se le cobre dos veces al cliente. Esto es inaceptable para la infraestructura financiera, por lo que la idempotencia es un principio central al construir sistemas de pago.

## ¿Qué es una Solicitud Idempotente?

Una solicitud de API es idempotente si realizarla varias veces produce el mismo resultado que realizarla solo una vez. Por ejemplo, una solicitud `GET` es naturalmente idempotente. Llamar a `GET /users/123` diez veces no cambia los datos del usuario.

Sin embargo, las solicitudes `POST` — como `POST /charges` — no son idempotentes por defecto.

## Implementando Claves de Idempotencia con Cord

Para reintentar de forma segura las solicitudes `POST`, la API de Cord requiere que los clientes envíen un encabezado `Idempotency-Key`. Esta clave es un identificador único (generalmente un UUID V4) generado por tu aplicación cliente.

```http
POST /v1/charges HTTP/1.1
Host: api.cord.com
Authorization: Bearer sk_test_123
Idempotency-Key: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d

{
  "amount": 5000,
  "currency": "usd"
}
```

Cuando envías esta solicitud, Cord verifica una caché rápida y distribuida buscando la clave de idempotencia.

1. **Si la clave es nueva:** Se procesa la transacción y la respuesta HTTP se almacena de forma segura.
2. **Si la clave se encuentra, y la solicitud original aún se está procesando:** La API mantiene abierta la nueva solicitud y espera a que termine la original.
3. **Si la clave se encuentra, y la solicitud original terminó:** Cord devuelve inmediatamente la respuesta HTTP en caché, sin volver a ejecutar la transacción.

## Por qué esto importa a los desarrolladores

Al integrar claves de idempotencia, puedes implementar una lógica de reintento agresiva en tus aplicaciones frontend o móviles sin temor a corrupción de datos o transacciones duplicadas. Al usar los SDKs de Cord, estas claves se generan y administran automáticamente, asegurando que los fallos transitorios de la red se manejen sin problemas tras bambalinas.
