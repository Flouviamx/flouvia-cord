---
title: "Claves de API"
description: "Administra las llaves criptográficas que dan acceso a la plataforma."
---

<header class="content-header">
  <h1 class="page-title">Claves de API</h1>
  <p class="page-subtitle">El token criptográfico que identifica a tus sistemas cuando interactúan con Cord.</p>
</header>

## Funcionamiento de las Claves

Toda petición programática a la API de Cord requiere una **Clave de API**. Puedes administrarlas, revocarlas y monitorear su uso desde **Ajustes > Desarrolladores > API**.

Por seguridad, los sistemas de Cord almacenan tu Clave de API como un Hash (`sha-256`) irreversible. La llave en texto claro (el string que comienza con `sk_...` o `pk_...`) solo se te mostrará **una vez** al momento de crearla. Si la pierdes, no hay forma de recuperarla; deberás revocarla y generar una nueva.

## Buenas Prácticas de Seguridad

### No subas claves secretas a repositorios
Nunca commitees (ej. en Git) una clave que comience con `sk_live_`. Si Cord detecta una clave comprometida en fuentes públicas de Github, los mecanismos automatizados de fraude pueden suspenderla preventivamente. Usa variables de entorno (como archivos `.env` no versionados) en tus servidores.

### Usa el alcance correcto (Publicable vs Secreta)
- **Claves Secretas (`sk_`):** Tienen acceso total de lectura y escritura a tus finanzas y clientes. Solo deben vivir en los servidores backend bajo tu control.
- **Claves Publicables (`pk_`):** Diseñadas para ser seguras de inyectar en aplicaciones web (frontend). Cord automáticamente aplicará restricciones sobre lo que estas claves pueden ver u ocultará campos sensibles (como el costo/margen de los [productos](/docs/desarrolladores/funciones/productos)) cuando reciba una petición firmada con ellas.

## Actividad en Tiempo Real

Dentro de la pestaña API en el dashboard, tendrás acceso a un log de auditoría en vivo sobre el uso de cada llave, permitiéndote rastrear rápidamente qué IP o qué flujo (API tradicional o MCP) originó un cambio en tu sistema.
