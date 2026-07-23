---
title: "Autenticación"
description: "Cómo autenticar tus solicitudes a la API de Cord utilizando Bearer Tokens."
---

<header class="content-header">
  <h1 class="page-title">Autenticación</h1>
  <p class="page-subtitle">Aprende a estructurar tus peticiones autenticadas hacia los servidores de Cord.</p>
</header>

## Bearer Tokens

La API de Cord utiliza tokens al portador (Bearer Tokens) para autenticar las peticiones entrantes. Debes enviar la API Key que generaste en el panel de control como un encabezado HTTP `Authorization`.

Todas las peticiones deben realizarse a través de HTTPS. Las peticiones sin autenticación o enviadas vía HTTP plano fallarán.

**Ejemplo de Petición:**

```bash
curl -X GET "https://api.cordhq.com/v1/cotizaciones" \
     -H "Authorization: Bearer sk_live_tU..."
```

## Claves Secretas vs Publicables

Cord soporta dos alcances principales de claves de API para garantizar la seguridad de tus datos:

1. **Claves Secretas (`sk_`):** Diseñadas para usarse **únicamente** en tus servidores backend. Tienen permisos completos de lectura y escritura.
2. **Claves Publicables (`pk_`):** Diseñadas para exponerse en el frontend (navegadores web, apps móviles). 

### Enmascaramiento Automático de Datos

Las claves publicables tienen restricciones de seguridad automáticas impuestas por la API. Por ejemplo, si consultas la [API de Productos](/docs/desarrolladores/funciones/productos) usando una clave publicable, el servidor de Cord omitirá automáticamente el campo `costo` (margen) para garantizar que los visitantes de tu sitio web no puedan descubrir tus márgenes de ganancia.

> **Atención:**
> **Nunca expongas tus Claves Secretas.** Si tu clave secreta es comprometida, debes revocarla inmediatamente desde la pestaña Ajustes > Desarrolladores > API.

## Comprobación Rápida de Identidad

Si necesitas probar si tu clave de API está funcionando correctamente y a qué cuenta pertenece, puedes utilizar el endpoint `me`:

```bash
curl -X GET "https://api.cordhq.com/v1/me" \
     -H "Authorization: Bearer sk_live_tU..."
```
