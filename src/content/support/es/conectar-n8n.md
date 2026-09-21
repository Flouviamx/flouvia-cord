---
title: "Conectar n8n"
description: "Usa Cord desde n8n: el nodo comunitario con disparador por webhook, o el nodo HTTP Request contra la API v1."
category: "Desarrolladores"
order: 43
---

n8n se conecta a Cord de dos formas. El **nodo de Cord** es el camino corto; el **nodo HTTP Request** sirve para cualquier endpoint que el nodo todavía no cubra.

### Con el nodo de Cord

1. En n8n, entra a **Settings › Community nodes** e instala `n8n-nodes-cord`. (En n8n Cloud, los nodos comunitarios se instalan desde la misma pantalla; en una instalación propia necesitas permiso de administrador.)
2. Crea una llave secreta en Cord: **Ajustes**, activa el modo desarrollador al final del índice y abre la pestaña **API**. Usa una llave con permiso de escritura; las que empiezan con `sk_test_` trabajan contra tu entorno de prueba.
3. En n8n crea una credencial **Cord API** y pega la llave. El botón de probar consulta tu cuenta y te dice si la llave es de prueba o de producción.
4. Agrega el nodo **Cord Trigger**, elige los eventos y activa el flujo: n8n registra el webhook en Cord por ti y lo borra cuando desactivas el flujo.
5. Para actuar sobre Cord, agrega el nodo **Cord**: clientes (crear, actualizar, obtener, buscar), cotizaciones (crear, obtener, buscar, enviar, marcar pagada) y tareas.

El disparador verifica la firma `X-Cord-Signature-V1` de cada entrega, así que un POST a la URL del webhook que no venga de Cord se descarta.

### Con el nodo HTTP Request

1. En Cord, agrega tu webhook en **Ajustes › Modo desarrollador › Webhooks** con la URL que te dé el nodo **Webhook** de n8n.
2. Para llamar a la API, usa el nodo **HTTP Request** contra `https://cordhq.app/api/v1/...` con el encabezado `Authorization: Bearer sk_...`.

### Límites

Los webhooks y las llamadas de API cuentan contra los límites de tu plan, igual que con Zapier o Make. Los ves en **Ajustes › Modo desarrollador**.
