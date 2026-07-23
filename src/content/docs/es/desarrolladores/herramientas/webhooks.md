---
title: "Cord Webhooks"
description: "Construye integraciones en tiempo real reaccionando a eventos que ocurren en Cord."
---

<header class="content-header">
  <h1 class="page-title">Webhooks</h1>
  <p class="page-subtitle">Reacciona instantáneamente a cambios de estado en tus cotizaciones sin tener que hacer *polling* a la API.</p>
</header>

## ¿Por qué usar Webhooks?

En lugar de que tu sistema (como un ERP o un flujo automatizado de Zapier/Make) pregunte a Cord cada 5 minutos "¿ya pagó el cliente?", los Webhooks de Cord le "avisan" a tu sistema en el momento exacto en que ocurre el evento, enviando un `POST` HTTP a tu servidor.

Casos de uso comunes:
- Provisionar una licencia de software automáticamente cuando una cotización entra en estado `pagada`.
- Enviar un mensaje interno a Slack cuando una cotización es `vista` por primera vez por el cliente.
- Disparar el proceso de facturación en tu ERP.

## Configurar un Endpoint

Para comenzar a recibir eventos, debes registrar la URL de tu servidor:
1. Navega a **Ajustes > Desarrolladores > Webhooks**.
2. Haz clic en **Añadir Endpoint**.
3. Ingresa tu URL HTTPS pública. No se permiten URLs HTTP (sin cifrar) por seguridad.
4. Selecciona el subconjunto de eventos que deseas escuchar (ej. `cotizacion.enviada`, `cotizacion.pagada`).

## Seguridad y Firmas (HMAC-SHA256)

Debido a que tu endpoint debe ser público en Internet, cualquiera podría enviarle peticiones falsas intentando engañar a tu sistema. 

Para prevenir esto, Cord firma criptográficamente cada carga útil (payload) enviada a tu servidor usando un **Secreto de Endpoint**.

### Verificar la firma en tu servidor

1. Cord incluye un encabezado `X-Cord-Signature` en la petición `POST`.
2. Debes usar tu Secreto de Endpoint para calcular el hash HMAC-SHA256 del cuerpo exacto de la petición.
3. Compara el hash que calculaste con el que envió Cord. Si coinciden, la petición es auténticamente de Cord.

## Reintentos y Tolerancia a Fallos

Si tu servidor de destino está caído o devuelve un código de error (cualquier cosa que no sea `2xx`), Cord considerará el envío como fallido.

Puedes navegar al **Log de Entregas** dentro de los Ajustes de Webhooks para examinar el cuerpo de la petición que falló y la respuesta exacta que dio tu servidor (útil para debug). Allí también podrás hacer clic en "Reintentar Envío" manualmente.
