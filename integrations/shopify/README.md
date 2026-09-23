# App de Cord en Shopify

La configuración vive en `shopify.app.toml` y se publica con el CLI de Shopify.
Cord NO es una app embebida: Shopify solo guarda la configuración y entrega los
webhooks; la interfaz y la conexión viven en `cordhq.app`.

## Crear o enlazar la app

```bash
cd integrations/shopify
npx @shopify/cli@latest app config link   # elige "Create a new app" y nómbrala Cord
npx @shopify/cli@latest app deploy        # sube URLs, permisos y webhooks
npx @shopify/cli@latest app env pull      # deja el .env con las credenciales
```

`app env pull` escribe `SHOPIFY_API_KEY` y `SHOPIFY_API_SECRET` en `.env`, que
git ignora. Cord las lee como `SHOPIFY_CLIENT_ID` y `SHOPIFY_CLIENT_SECRET`:
cópialas con esos nombres en el mismo archivo y súbelas a Vercel.

## Qué mirar si algo falla

- Un webhook que Shopify no entrega suele ser una URL vieja: vuelve a correr
  `app deploy` después de cambiar `shopify.app.toml`.
- Cambiar `scopes` obliga a que cada tienda vuelva a autorizar la app.
- El secreto firma el regreso de OAuth y cada webhook. Si se rota, hay que
  actualizarlo en Vercel el mismo día o todos los webhooks empiezan a dar 401.
