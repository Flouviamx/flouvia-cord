# Lo que falta en integraciones y rieles de cobro

> Checklist operativo al 2026-09-21. Reemplaza a `pendientes-make-zapier.md`.
> Cada bloque dice qué está hecho, qué falta, quién lo hace y qué lo bloquea.
> La guía visual paso a paso para André vive en
> https://claude.ai/artifact/TGdoKNjJb6kfQBxpRyBKUj (privada).
>
> Regla de secretos: ningún token, llave ni secreto se pega en el chat. Van en el
> `.env` ignorado de `integrations/<app>/` o directo en Vercel.

## Resumen

| App | Estado | Lo que falta | Quién | Bloqueado por |
|---|---|---|---|---|
| **HubSpot** | En producción | Ficha pública del marketplace | André | 3 instalaciones activas de cuentas ajenas |
| **Zapier** | En producción, OAuth, app privada App246344 v1.1.0 | Directorio público (opcional) | André | Zaps reales de usuarios ajenos al equipo |
| **Make** | En producción, OAuth, app `cord-78vg5m` (us2) | Prueba desde otra zona; catálogo público (opcional) | André | Usuarios reales |
| **Slack** | En producción, "Añadir a Slack", app `A0C307S6ENB` | Directorio de apps de Slack (opcional) | André | Revisión de Slack |
| **n8n** | `n8n-nodes-cord` 1.1.0 en npm con constancia de origen | Verificación de n8n para n8n Cloud | n8n | Respuesta de n8n (enviado el 21 sep) |
| **Microsoft Teams** | App de Entra registrada y credenciales en Vercel (23 sep 2026); falta probarlo | Conectar, elegir canal y mandar prueba; verificación de editor | André prueba | Nada; el mes de prueba de Microsoft 365 corre desde el 23 sep 2026 |
| **Shopify** | Fases 1 y 2 en producción (catálogo y clientes hacia Cord; pedido de vuelta al cerrar) | Probar con una tienda de desarrollo; fases 3-5 (facturar pedidos, cotizar desde el admin, precios en vivo) | André prueba, Claude construye | Nada, es gratis |
| **WhatsApp Business** | Nivel 1 en producción (número + token + plantilla) | Prueba con número real; registro integrado de Meta | André | Verificación de negocio en Meta |
| **Mercado Pago** | En producción en México, pago real confirmado; app `7210198958457914` | Renovar el Client Secret; igualas y contracargos | André, luego Claude | Nada para México |

---

## HubSpot

**Hecho:** conexión OAuth, sincronización de Empresas, Contactos y Deals, etapas,
nota en el Deal desde workflows, revocación al desconectar.

**Falta:**
- [ ] Publicar la ficha en el marketplace de HubSpot. Pide 3 instalaciones activas
  de cuentas que no sean del equipo. La certificación posterior exige 60
  instalaciones y 6 meses listado.

---

## Zapier

**Hecho (21 sep):** app privada App246344, solo la versión 1.1.0 con OAuth 2.0 +
PKCE; versiones 1.0.x con llave borradas; `contacto@cordhq.app` es Admin; link de
invitación en `ZAPIER_INVITE_URL` (`src/lib/integraciones/catalogo.ts`); probado de
punta a punta en producción con un Chrome real.

**Falta (opcional):**
- [ ] Directorio público: tener Zaps reales activos de usuarios ajenos al equipo,
  dar a los revisores de Zapier una cuenta de prueba de Cord con datos de ejemplo
  y enviar el formulario de **Publishing**.

---

## Make

**Hecho (21 sep):** app `cord-78vg5m` en us2 con OAuth; módulos publicados (Watch
Events, 8 acciones, 2 búsquedas, Make an API Call); link de invitación en
`MAKE_INVITE_URL`; el regreso de OAuth vuelve a la zona de origen (`pickReturnTo()`),
porque `www.make.com/oauth/cb/app` no encuentra los intentos de otras zonas.

**Falta:**
- [ ] Probar la conexión con una cuenta de Make de otra zona (us1, eu1 o eu2).
- [ ] Opcional, con clientes usándola: **Request review** para el catálogo público
  (logo, descripciones en inglés, ejemplos).

Despliegue: `cd integrations/make && npm test && npm run deploy:dry && npm run deploy`
con `MAKE_API_TOKEN`, `MAKE_ZONE` y `MAKE_APP_NAME` en `integrations/make/.env`.

---

## Slack

**Hecho (21 sep):** app `A0C307S6ENB` creada con el CLI de Slack y la API de
manifiestos (`integrations/slack/manifest.json`; `incoming-webhook` exige
`bot_user`); `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET` en Vercel; distribución
pública activada; webhook propio como alternativa plegable.

**Falta (opcional):**
- [ ] Directorio de apps de Slack: requiere revisión de Slack (política de
  privacidad, página de soporte, pruebas de los revisores).

En `localhost` la tarjeta solo muestra el campo de URL: las credenciales viven en
Vercel y el callback está registrado para `cordhq.app`.

---

## n8n

**Hecho (21 sep):** `n8n-nodes-cord` 1.1.0 en npm, sobre la plantilla oficial
(`@n8n/node-cli`), publicada desde GitHub Actions con constancia de origen
(Trusted Publisher de npm); pasa `@n8n/scan-community-package`; enviada a
verificación de n8n.

**Falta:**
- [ ] Esperar la respuesta de n8n. Hasta entonces solo funciona en n8n autoalojado.
- [ ] Si piden cambios: editar `integrations/n8n`, copiar al espejo público
  `Flouviamx/n8n-nodes-cord`, subir la versión y el `CHANGELOG.md`, y crear el tag;
  el workflow `publish.yml` publica con constancia. Ojo: la plantilla de n8n borra
  los `${{ }}` de los workflows al generarlos.
- [ ] Cuando aparezca en n8n Cloud: quitar "cuando n8n termine de verificarlo" de
  `src/content/support/{es,en}/conectar-n8n.md`, de la tabla de
  `src/content/docs/{es,en}/automatizacion/integraciones.mdx` y del roadmap.

---

## Microsoft Teams: "Conectar con Microsoft"

**Hecho (21 sep):** código completo e inactivo. OAuth delegado de Microsoft Graph
contra `organizations`, selector de equipo y canal, envío de Adaptive Cards,
renovación del acceso, estado `warn` si Microsoft revoca, un solo destino por
organización. `src/lib/integraciones/teams-graph.ts`, rutas
`/api/integraciones/teams/{conectar,callback,canales}`, columnas `orgs.teams_graph_*`,
`orgs.teams_team_*`, `orgs.teams_channel_*`. El botón solo aparece con
`TEAMS_CLIENT_ID` y `TEAMS_CLIENT_SECRET`.

**Estado (23 sep 2026):** hecho el registro, falta la prueba. Tenant Flouvia
(`efaefa11-ccf5-41df-8d72-92b236b4f7d5`), app `Cord`
(`9c8b8fe6-8096-48a2-b991-32f978c12a9a`), creada con el CLI de Azure — que en esta
Mac vive en `~/.azure-cli-venv/bin/az`, no en Homebrew.

**Aviso operativo:** el asistente de Microsoft 365 pidió mover los MX de
`cordhq.app` a Exchange y se aplicó por error; el correo del dominio estuvo
apuntando a Microsoft unos 10 minutos y lo que llegó en esa ventana rebotó. Se
revirtió a `smtp.google.com` con SPF `include:_spf.google.com`. Teams NO necesita
el dominio: funciona con el `.onmicrosoft.com`.

**Para activarlo:**
- [x] Tenant de Microsoft 365 con Teams (mes de prueba, desde el 23 sep 2026 —
  se cobra si no se cancela).
- [x] App en Entra: multiinquilino (`AzureADMultipleOrgs`), redirecciones de
  producción y de `localhost:4321`, permisos delegados `offline_access`,
  `User.Read`, `Team.ReadBasic.All`, `Channel.ReadBasic.All` y
  `ChannelMessage.Send`, con consentimiento de administrador otorgado en el
  tenant.
- [x] Secreto de cliente `cord-prod`. **Vence el 23 de septiembre de 2028**, y
  vencido ninguna organización puede renovar su acceso. Renovarlo con
  `az ad app credential reset --id <appId> --append --years 2`.
- [x] `TEAMS_CLIENT_ID` y `TEAMS_CLIENT_SECRET` en Vercel (production, preview y
  development) y en el `.env` local.
- [ ] Probar en producción: conectar, elegir canal, **Enviar prueba**, un aviso de
  Notificaciones, la acción de workflow, la renovación después de una hora y la
  revocación desde myapps.microsoft.com (debe quedar en "Requiere reconectar").
- [ ] Verificación de editor: agregar `cordhq.app` como dominio en el centro de
  administración (registro TXT en Vercel, **sin** tocar los MX), inscribir a
  Flouvia en el Microsoft AI Cloud Partner Program (gratis) y pegar el Partner One
  ID en la app. Sin esto muchas empresas ven "editor no verificado" o no pueden
  autorizar.
- [ ] Después de probar: reescribir `conectar-teams.md` (es/en), la fila de Teams
  en `automatizacion/integraciones.mdx` (es/en) y mover el punto del roadmap a lo
  disponible.

---

## Shopify

**Hecho (22-23 sep):** app creada y publicada (`cord-4`), credenciales en Vercel
y en localhost. Fase 1: OAuth de la tienda, catálogo y clientes hacia Cord con
anti-eco por huella, webhooks de productos, clientes y desinstalación con firma
verificada, webhooks obligatorios de privacidad, tarjeta en Ajustes con
"Sincronizar ahora" y artículo de ayuda. Fase 2: pedido en Shopify al aprobarse o
pagarse la cotización, apagado por default, con guardia de divisa y un pedido por
cotización garantizado por el vínculo.
Código en `src/lib/integraciones/shopify/` y `src/pages/api/integraciones/shopify/`.

**Falta:**
- [ ] André: probar con una tienda de desarrollo — conectar, ver catálogo y
  clientes, cambiar un producto en Shopify y confirmar que llega, prender los
  pedidos y cerrar una cotización, desinstalar y reconectar.
- [ ] André, opcional: rotar el `client_secret` en Partners (se imprimió en la
  terminal al hacer `app env pull`); si se rota, actualizar Vercel y el `.env`.
- [ ] Fase 3: facturar los pedidos que nacen en la tienda (CFDI en México).
- [ ] Fase 4: cotizar desde el admin de Shopify (app embebida + admin action).
  Es la única fase que exige volver a `embedded = true` y session tokens.
- [ ] Fase 5: precios e inventario en vivo dentro del editor de cotizaciones.
- [ ] Opcional: publicar la app en la tienda de aplicaciones de Shopify (revisión).

---

## WhatsApp Business

**Hecho:** nivel 1 en producción. El negocio pega el identificador de su número, un
token de Meta y su plantilla aprobada; la acción de workflow manda la plantilla con
variables. Meta le cobra cada mensaje de plantilla a la cuenta del negocio.

**Falta:**
- [ ] Probar el nivel 1 con el número de prueba de Meta (gratis, hasta 5
  destinatarios) de punta a punta desde un workflow.
- [ ] Registro integrado de Meta (Embedded Signup) para conectar con un botón:
  requiere verificación de negocio de Flouvia en Meta, alta como Tech Provider y
  revisión de la app. Después, construir el flujo en Cord.

---

## Mercado Pago

**Hecho (21 sep):**
- App "Cord" `7210198958457914` (MLM, Checkout Pro, sitio propio) creada con el MCP
  oficial de Mercado Pago en la cuenta de empresa de Flouvia (owner `3708486760`),
  con redirección `https://cordhq.app/api/billing/mercadopago/callback`.
- Webhook de `payment` a `https://cordhq.app/api/mercadopago/webhook`.
- `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_WEBHOOK_SECRET` en Vercel (producción);
  copia local en `integrations/mercadopago/.env` (ignorado por git).
- El espacio Flouvia (MX) está conectado y con cobros activos.
- Prueba en producción con firma real: sin firma 401, con firma 200. Destapó y se
  corrigieron dos bugs: la política CSRF rechazaba el webhook (ningún pago se habría
  confirmado) y la búsqueda por preferencia consultaba una columna inexistente
  (ahora `cotizacion_cobros.mp_preference_at`).
- Botón de pago con la marca de Mercado Pago y tarjeta de Ajustes › Cobros con logo.

**Falta, operativo:**
- [x] **Pago real de prueba** (21 sep): cotización de $10 MXN pagada con tarjeta
  por Mercado Pago; Cord la marcó pagada sola por el webhook.
- [x] **Access Token renovado** (21 sep).
- [ ] **Client Secret:** sigue siendo el que se pegó en el chat (se verificó que
  sigue válido). Renovarlo en Credenciales de producción, ponerlo en
  `integrations/mercadopago/.env`, actualizar `MP_CLIENT_SECRET` en Vercel y
  redeploy; si no, la renovación de acceso de los vendedores conectados falla.
- [x] **Otros países** (21 sep): la app de México conecta vendedores de otro país.
  Confirmado con el vendedor de prueba de Colombia `TESTUSER1518459834063318184`
  (user id `3708111760`, creado con el MCP) desde el espacio "Flouvia Colombia".
  No hace falta una app por país.
- [ ] Opcional: un pago de prueba en COP desde "Flouvia Colombia" con un comprador
  de prueba de Colombia y una tarjeta de prueba, para confirmar la divisa.
- [ ] Opcional: `quality_evaluation` del MCP sobre el primer pago real para ver qué
  pide Mercado Pago mejorar en la integración.

**Falta, código:**
- [x] Mercado Pago en la factura hospedada, con abono parcial (22 sep).
- [x] Reembolsos leídos del proveedor, en cotización y en factura (22 sep).
- [x] Link de pago en la cobranza con IA con cualquiera de los dos rieles (22 sep).
- [ ] Igualas recurrentes con Mercado Pago: exige guardar el medio de pago, que
  Checkout Pro no hace. Requiere el producto de suscripciones del proveedor.
- [ ] Contracargos de Mercado Pago (`topic_chargebacks_wh`): hoy solo se leen pagos
  y reembolsos.
- [ ] Opcional: PKCE en la autorización (Cord no lo manda; no activarlo en el panel
  hasta implementarlo).

Herramientas: el MCP de Mercado Pago está configurado en Claude Code (alcance local
de este proyecto) con `create_application`, `save_webhook`, `get_credentials`,
`notifications_history`, `create_test_user` y `search_documentation`. Si no carga en
una conversación, `claude mcp login mercadopago-mcp-server` desde una terminal
interactiva y recargar la ventana.

---

## Apps que conviene conectar después

Ordenadas por impacto para Cord (de la propuesta al pago, con fuerte uso en México,
Latinoamérica, Estados Unidos y España). El criterio de la lista es dónde
ATERRIZA el dinero que Cord cierra: hojas de cálculo y contabilidad primero,
porque es el trabajo que el negocio hace igual a mano cada mes. Una conexión
que solo suma un logo al directorio no entra.

| Prioridad | App | Por qué le sirve a Cord | Esfuerzo |
|---|---|---|---|
| 1 | **Google Sheets y Excel** | Cada cotización, factura y pago en la hoja donde el negocio ya lleva sus números, sin exportar a mano. Es lo más pedido y lo de menor esfuerzo: las dos tienen API estable y ninguna exige revisión de marketplace. | Bajo |
| 2 | **QuickBooks Online y Xero** | Que cada factura y pago de Cord aparezca solo en la contabilidad. QuickBooks domina en Estados Unidos; Xero en Reino Unido y buena parte de Europa. | Medio: OAuth y revisión de sus marketplaces |
| 3 | **Alegra / Holded / Siigo** | Contabilidad local: Alegra (México, Colombia, Perú), Holded (España), Siigo (Colombia). | Medio por cada una |
| 4 | **Pipedrive** | El CRM más usado por equipos pequeños después de HubSpot; mismo modelo de sincronización. | Medio |
| 5 | **Tiendanube y WooCommerce** | El equivalente de Shopify en Latinoamérica y en sitios propios. | Medio |
| 6 | **Salesforce** | Cuentas grandes (plan Scale). | Alto: AppExchange y revisión de seguridad |
| 7 | **Gmail** | Crear cotizaciones desde el correo, donde de verdad empieza la conversación. Calendar ya se cubre con Make y Zapier. | Medio |

Shopify salió de esta lista el 23 de septiembre de 2026: está en producción en
los dos sentidos.

Todo lo que se agregue sigue la regla 15: nada aparece en Ajustes › Integraciones
como disponible hasta que funcione de punta a punta.
