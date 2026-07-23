---
title: "Conciliación financiera en tiempo real con Webhooks de Cord"
date: "2026.07.15"
type: "VIDEO"
topic: "Payments"
authors:
  - "CORD ENG"
readTime: "12 MIN WATCH"
---
Cuando se mueve dinero, tu sistema necesita saberlo de manera instantánea y precisa. Consultar (polling) las APIs para conocer el estado de las transacciones es ineficiente y propenso a límites de tasa. El estándar de la industria para actualizaciones financieras en tiempo real es recibir webhooks de tu proveedor de pagos.

Sin embargo, manejar webhooks en un contexto financiero requiere un nivel de rigor mucho mayor que un simple endpoint HTTP. Procesar webhooks de forma segura asegura que tus libros contables internos se mantengan perfectamente sincronizados con plataformas como Cord.

## Los desafíos de los webhooks financieros

Los webhooks son esencialmente solicitudes HTTP de "disparar y olvidar". Esto introduce varios desafíos críticos para los ingenieros:

1. **Entrega fuera de orden:** Podrías recibir un evento `payment_failed` antes de recibir el evento `payment_created`.
2. **Entrega duplicada:** Para garantizar la entrega (Entrega Al-Menos-Una-Vez), los proveedores a menudo enviarán el mismo webhook dos veces.
3. **Seguridad:** Actores maliciosos pueden enviar webhooks falsos a tu endpoint para inflar artificialmente el saldo de un usuario.

## Diseñando un pipeline de webhooks robusto

### 1. Verificación de Firma Criptográfica
Nunca confíes ciegamente en el contenido de un webhook. Siempre verifica la firma provista en las cabeceras utilizando el secreto compartido desde tu panel de Cord. En Node.js, esto implica calcular un HMAC SHA-256 del cuerpo crudo de la solicitud y compararlo con la firma proporcionada. Si no coinciden, devuelve instantáneamente un `401 Unauthorized`.

### 2. Acepta Rápido, Procesa Después
Los proveedores de webhooks esperan una respuesta HTTP `2xx` en unos pocos segundos. Si tu base de datos está bloqueada o el procesamiento toma demasiado tiempo, el proveedor asumirá que el webhook falló y activará una tormenta de reintentos.
En su lugar, tu endpoint debería enviar inmediatamente la carga útil cruda a una cola de mensajes (como Kafka o AWS SQS) y devolver un `202 Accepted`. Los procesos trabajadores (workers) pueden luego extraer de la cola a su propio ritmo.

### 3. Manejo de estado con marcas de tiempo (timestamps)
Para lidiar con webhooks fuera de orden, confía en la marca de tiempo `created_at` dentro de la carga útil, no en el momento en que tu servidor recibió la solicitud. Cuando actualices tu base de datos, usa actualizaciones condicionales:

```sql
UPDATE transactions 
SET status = 'failed' 
WHERE id = 'tx_123' AND updated_at < 'payload.timestamp';
```

Esto garantiza que un evento `payment_created` retrasado no sobrescribirá un estado `payment_failed` más nuevo en tu base de datos. Al aplicar estos patrones, puedes construir una integración de webhooks que sea tanto en tiempo real como financieramente sólida.
