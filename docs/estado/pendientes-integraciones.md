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
| **Microsoft Teams** | Flujo de Power Automate en producción; "Conectar con Microsoft" construido e **inactivo** | Registrar la app en Entra, credenciales, prueba real, verificación de editor | André, luego Claude | Microsoft 365 de pago (decisión: no pagar todavía) |
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

**Por qué está en pausa:** registrar la app en Entra es gratis, pero probarla exige
un Teams de empresa. Microsoft 365 Business Basic cuesta unos 6 USD por usuario al
mes (un mes de prueba gratis que se cobra si no se cancela). André decidió no pagar
todavía. El flujo de Power Automate sigue siendo el camino vigente.

**Para activarlo:**
- [ ] Conseguir un tenant de Microsoft 365 con Teams (Business Basic o un cliente
  que preste el suyo para la prueba).
- [ ] Registrar la app en Entra: multiinquilino, solo cuentas de trabajo o escuela,
  redirección `https://cordhq.app/api/integraciones/teams/callback`, permisos
  delegados `User.Read`, `Team.ReadBasic.All`, `Channel.ReadBasic.All`,
  `ChannelMessage.Send` (ninguno pide consentimiento de administrador).
- [ ] Crear el secreto de cliente y poner un recordatorio: vence en máximo 24 meses
  y, vencido, ninguna organización puede renovar su acceso.
- [ ] `TEAMS_CLIENT_ID` y `TEAMS_CLIENT_SECRET` en Vercel y redeploy.
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
Latinoamérica, Estados Unidos y España).

| Prioridad | App | Por qué le sirve a Cord | Esfuerzo |
|---|---|---|---|
| 1 | **QuickBooks Online y Xero** | Que cada factura y pago de Cord aparezca solo en la contabilidad. QuickBooks domina en Estados Unidos; Xero en Reino Unido y buena parte de Europa. | Medio: OAuth y revisión de sus marketplaces |
| 2 | **Alegra / Holded / Siigo** | Contabilidad local: Alegra (México, Colombia, Perú), Holded (España), Siigo (Colombia). | Medio por cada una |
| 3 | **Pipedrive** | El CRM más usado por equipos pequeños después de HubSpot; mismo modelo de sincronización. | Medio |
| 4 | **Shopify** | Cotizar mayoreo para tiendas que ya venden en línea. | Medio |
| 5 | **Tiendanube y WooCommerce** | El equivalente de Shopify en Latinoamérica y en sitios propios. | Medio |
| 6 | **Salesforce** | Cuentas grandes (plan Scale). | Alto: AppExchange y revisión de seguridad |
| 7 | **Google Workspace** | Crear cotizaciones desde Gmail y exportar ventas a Sheets. Sheets y Calendar ya se cubren con Make y Zapier. | Medio |

Todo lo que se agregue sigue la regla 15: nada aparece en Ajustes › Integraciones
como disponible hasta que funcione de punta a punta.
