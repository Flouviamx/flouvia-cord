# Cord para Make

App de Make construida sobre la API pública v1 de Cord. Toda la definición vive en `app.mjs` y se sube con la API de Make; no hay que editar nada en el editor web de Make.

## Qué incluye

- **Conexión**: OAuth 2.0. La persona autoriza en la pantalla de Cord y Make renueva el token solo; no hay llave que crear ni pegar. `clientId` y `clientSecret` viven en los datos comunes de la conexión (`deploy.mjs` los lee de `CLIENT_ID` y `CLIENT_SECRET` en `.env`). Se valida con `GET /v1/me`. Tokens y secretos se ocultan en los logs de Make.
- **Watch Events**: trigger instantáneo. Al crear el webhook en Make se eligen los eventos; Make lo registra con `POST /v1/webhooks` y lo borra con `DELETE` al quitarlo. Solo pasan los eventos elegidos.
- **Acciones**: Create a Client, Update a Client, Get a Client, Create a Quote, Get a Quote, Send a Quote, Mark a Quote as Paid y Create a Task.
- **Búsquedas**: Search Clients y Search Quotes, con paginación.
- **Make an API Call**: módulo universal limitado a `https://cordhq.app/api`.

Make no expone el cuerpo crudo del webhook, así que no puede recalcular la firma `X-Cord-Signature-V1` como Zapier. La protección es la URL del webhook, que Make genera única y secreta por escenario.

## Zona y dirección de regreso

Make documenta `https://www.make.com/oauth/cb/app` como dirección de regreso, pero con una cuenta en us2 esa página respondía "Resource not found" y nunca canjeaba el código. `MAKE_OAUTH_REDIRECT` en `.env` fija la dirección de la zona (por ejemplo `https://us2.make.com/oauth/cb/app`); sin ella se usa la de la documentación. Cualquier dirección nueva también debe registrarse en el cliente OAuth de Cord (`scripts/oauth-client.mjs`).

## Publicación

Publicar la app en Make (Custom apps › Cord › Publish) no publica sus módulos: cada uno tiene su propia visibilidad y, si se quedan privados, quien acepta la invitación ve "no se han creado módulos o son privados". `deploy.mjs` publica los módulos cuando la app ya está publicada.

## Logo

`logo.png`: fondo transparente y marca en negro. Make pinta lo negro de blanco y lo transparente con el color del tema, así que se ve navy con barras blancas. El ícono de la app de HubSpot no sirve aquí: su fondo casi negro se volvía blanco.

## Desarrollo

```bash
npm test
```

## Publicar

Crea en Make un token de API (Perfil › API access) con los scopes `sdk-apps:read` y `sdk-apps:write`, y guárdalo en `integrations/make/.env`, que no se sube a git:

```
MAKE_API_TOKEN=...
MAKE_ZONE=us1.make.com
MAKE_APP_NAME=cord
```

`MAKE_ZONE` es el dominio con el que entras a Make. Si el nombre `cord` ya está tomado, cambia `MAKE_APP_NAME`.

```bash
npm run deploy:dry   # muestra lo que haría
npm run deploy       # crea o actualiza la app
```

La app queda privada. Para compartirla, genera el link de invitación en Make; para el catálogo público, pide la revisión desde el panel de la app.
