Lo que te falta de Make y Zapier

Está paso a paso en docs/estado/pendientes-make-zapier.md. En corto:

- Zapier (el código ya está subido en Zapier como app privada):
  a. Subir el logo.
  b. Invitar a contacto@cordhq.app al equipo como administrador.
  c. Generar el link de invitación y pasármelo. Ese link no es secreto.
- Make (el código está listo, pero nunca se subió):
  a. Crear un token en Perfil › API access con los permisos sdk-apps:read y sdk-apps:write.
  b. Ponerlo en integrations/make/.env. No lo pegues en el chat.
  c. Correr npm run deploy, o decirme "ya" y lo corro yo.
  d. Pasarme el link de invitación de la app.

Con cada link, yo cambio la tarjeta en Cord, reescribo la guía y lo subo.

Apps que te recomiendo además de Shopify

El md tiene la tabla completa con el porqué y el esfuerzo de cada una. El orden que te sugiero:

1. Microsoft Teams y n8n: son las más fáciles. Teams reutiliza casi todo lo de Slack.
2. WhatsApp Business: es la que más ventas cerraría en México y Latinoamérica, pero lleva más trámite con Meta.
3. QuickBooks o Xero (y Alegra o Holded según el país): para que cada factura y pago de Cord caiga solo en la contabilidad.
4. Mercado Pago: permitiría cobrar con tarjeta en Colombia, Argentina, Chile y Perú, donde hoy Cord no puede cobrar en línea.
5. Pipedrive, y más adelante Salesforce, cuando algún cliente grande lo pida.

Una aclaración: en inglés, algunos mensajes de error de los workflows y de HubSpot, y los avisos automáticos de Slack, todavía salen en español dentro de la app. En las guías en inglés viene lo que significa cada uno.