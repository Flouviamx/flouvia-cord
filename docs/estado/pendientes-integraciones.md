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
| **Gmail** | Envío desde el Gmail del negocio y complemento en producción (28 sep 2026); conexión e inserción probadas | Registrar el regreso en Google Cloud; verificación y ficha de Marketplace | André | Verificación de Google |
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

## QuickBooks Online y Xero

**Hecho (27 sep):** carril de contabilidad completo en
`src/lib/integraciones/contabilidad/`. OAuth de los dos, alta de cliente sin
duplicar, factura con sus líneas (borrador en Xero, asentada en QuickBooks
porque no tiene borradores), idempotencia por vínculo, botón para mandar las
pendientes, tarjeta propia y artículo de ayuda en los dos idiomas. Contrato
verificado en `test/contabilidad.test.ts`.

**Falta:**
- [x] **QuickBooks PROBADO en sandbox (28 sep)**: app de Intuit creada, llaves
  de desarrollo en Vercel con `QUICKBOOKS_SANDBOX=true`, conexión a la empresa
  `9341458036003969`, y las dos facturas de la cuenta asentadas con su cliente
  (Customer 58, Invoice 145 y 146). Las empresas sandbox NO se ven en el
  QuickBooks normal: viven en `sandbox.qbo.intuit.com`.

  Dos fallos que encontró esta prueba y ya están corregidos: las líneas se
  armaban desde `cotizacion_items`, así que una factura de Cord Invoicing —sin
  cotización— daba cero líneas y se descartaba como `sin_lineas`; y el botón
  respondía "0 facturas enviadas" como si fuera éxito, que es lo que escondió
  el primero. Hoy manda `line_items_snapshot` y un cero con candidatas queda
  registrado con sus motivos.
- [ ] Llaves de PRODUCCIÓN de Intuit: exigen pasar su revisión. El cuestionario
  está contestado salvo un punto — hay que **quitar la API de pagos** de las
  categorías declaradas: Cord solo usa `com.intuit.quickbooks.accounting`, y
  declarar pagos mete la app en el sector regulado, donde una de las
  certificaciones ("los tokens viven solo en memoria volátil") es falsa para
  Cord, que los guarda cifrados.
- [ ] Rotar las llaves de QuickBooks: se escribieron en el chat.
- [x] **Xero PROBADO en producción (28 sep)**: organización Flouvia conectada,
  contacto y las dos facturas creadas como borrador. Una app sin certificar
  admite hasta 25 organizaciones conectadas.

  Dos cosas que encontró esta prueba:
  - **Permisos granulares.** Las apps de Xero creadas desde el 2 de marzo de
    2026 no aceptan `accounting.transactions`: quedó partido en
    `accounting.invoices`, `.payments`, `.banktransactions` y `.manualjournals`,
    y pedir el viejo devuelve `invalid_scope` antes de mostrar la pantalla de
    autorización. Cord pide `accounting.invoices` y `accounting.contacts`.
  - **`integracion_vinculos.externo_id` exigía solo dígitos** y Xero usa UUID,
    así que el vínculo no se podía guardar.

- [ ] **RIESGO CONOCIDO, sin cerrar: la ventana entre crear y vincular.** El
  objeto se crea en el proveedor y DESPUÉS se guarda el vínculo. Si algo falla
  entre esas dos cosas —como pasó con el UUID—, el documento queda creado allá y
  Cord sin memoria de él: al reintentar, lo duplica. Esta vez no hubo daño solo
  porque el insert que falló era el del cliente, que corre ANTES de crear la
  factura: fue el orden, no el diseño. El cierre real es una clave de
  idempotencia del lado del proveedor derivada del id del documento —Xero admite
  `Idempotency-Key` e Intuit su `RequestId`—, para que el reintento devuelva el
  mismo documento en vez de crear otro.
- [ ] Probar de punta a punta: conectar, emitir una factura y confirmar que
  aparece con el cliente correcto y sin duplicar.
- [ ] Mandar también los **pagos**, no solo la factura.
- [ ] Mapear los códigos de impuesto del proveedor en vez de dejar el impuesto
  al criterio de la cuenta.

---

## Gmail

**Hecho (27-28 sep):**
- Complemento en `integrations/gmail/`, conectado por el OAuth de Cord. Probado
  en Gmail: la conexión y la inserción al redactar. Construido y pendiente de
  probar: estado en vivo de la cotización del hilo, responder en el hilo y
  cotizar con IA. Versión 1
  desplegada para Marketplace (`clasp deploy`).
- **Enviar desde el Gmail del negocio** (`gmail.send`), en producción. Falta
  registrar su regreso en Google Cloud para poder conectarlo.
- Página pública `/integraciones/gmail` con la declaración de datos de Google y
  guía `/soporte/conectar-gmail`.

**Falta:**
- [ ] André: registrar `https://cordhq.app/api/integraciones/gmail/callback` en
  el cliente OAuth de Google (el mismo de Sheets) y habilitar la Gmail API en
  el proyecto. Sin esto, "Conectar Gmail" regresa con error de Google.
- [ ] André: pantalla de consentimiento con los siete permisos (tabla en
  `integrations/gmail/README.md`) y enviar la verificación con el video de
  demostración.
- [ ] André: Marketplace SDK (configuración con el ID de la versión 1) y ficha
  (íconos y banner en `integrations/gmail/marketplace/`, capturas 1280 x 800).
- [ ] Legal: que el Aviso de Privacidad mencione el uso de datos de Google y el
  Uso Limitado en su próxima versión. Hoy lo declara la página de la
  integración; el revisor de Google lee el enlace de privacidad, así que puede
  pedirlo. Es un cambio de documento versionado, no de código.
- [ ] Al publicar: poner el link de la ficha en `GMAIL_INSTALL_URL`
  (`src/lib/integraciones/catalogo.ts`) y quitar de las docs y la página el
  "todavía no está publicado".

---

## Google Sheets y Excel

**Hecho (27 sep):** dos integraciones separadas en el directorio, con motor
compartido en `src/lib/integraciones/hojas/`. OAuth de cada proveedor, creación
del archivo, dos pestañas con una fila por documento, actualización por evento de
dominio, relleno inicial de 500 documentos por pestaña, tarjeta propia en Ajustes
y artículo de ayuda por integración en los dos idiomas. Sheets sale con cabecera
congelada, filtro y formato de número; Excel con tabla real. Contrato de columnas
verificado en `test/hojas.test.ts`. Una organización puede conectar las dos.

**Excel PROBADO en producción (28 sep):** conecta, crea el libro en OneDrive y
lo llena. Reusa la app de Entra de Teams.

Costó tres diagnósticos equivocados y vale la pena saber por qué. El síntoma era
que Excel no podía abrir el archivo y que Graph respondía 500 al preguntarle por
sus hojas. La causa: la plantilla en base64 estaba escrita como una
concatenación cuya PRIMERA línea empezaba con `+`, que en JavaScript es un más
UNARIO — convertía esa línea en `NaN`, se perdían 96 caracteres, y el
decodificador de base64 de Node se traga lo inválido sin avisar. Subía 4714
bytes de basura en lugar de 4784 de zip.

Dos lecciones que quedaron en el código:
- **Una plantilla incrustada se verifica EVALUANDO el módulo, no leyendo el
  archivo.** La verificación previa extrajo el base64 del fuente con una
  expresión regular: comprobó la intención, no lo que corre. Hoy lo cubre
  `test/hojas.test.ts`, que importa la constante y mide los bytes.
- **El cuerpo del error del proveedor se guarda en el log** (`detalle` en
  `proveedor-http.ts`). Sin él, un 500 es indistinguible de otro y se acaba
  adivinando la causa durante horas.

**Falta:**
- [x] `Files.ReadWrite` agregado a la app de Entra `Cord`
  (`9c8b8fe6-8096-48a2-b991-32f978c12a9a`) y consentimiento de administrador
  dado, desde el portal. **El CLI de Azure no sirve en este tenant**: el inicio
  de sesión normal pide entrar a Azure Resource Manager y la cuenta es
  administradora de Microsoft 365 sin suscripción de Azure, así que responde
  "no tiene permiso para acceder a este recurso". El portal de Entra sí funciona.
- [x] Registrar en esa app la URL de retorno de las hojas
  (`/api/integraciones/hojas/callback`, producción y localhost): reusar el
  registro de Teams comparte los permisos pero NO las URL de retorno, y sin ella
  Microsoft responde `AADSTS50011`.
- [x] **Google Sheets PROBADO en producción (28 sep)**, a la primera. Proyecto
  `cord-510006`, cliente OAuth de tipo web, permisos `drive.file` + `openid` +
  `userinfo.email`, y la app PUBLICADA — en estado de prueba Google revoca los
  tokens a los 7 días y la conexión se moriría sola una semana después, que es
  la clase de fallo que nadie relaciona con su causa.
  Nota de contraste con Excel: aquí no hubo drama porque Sheets crea el archivo
  con una llamada a su API. La plantilla binaria que Excel obliga a subir fue la
  fuente de todos los problemas de esa noche.
- [x] Excel probado de punta a punta el 28 sep.
- [ ] Rotar el secreto del cliente de Google: se escribió en el chat durante la
  configuración.
- [ ] Confirmar en los dos que cambiar el estado de una cotización REEMPLAZA su
  fila en vez de duplicarla.
- [ ] Pendiente de producto: elegir una hoja EXISTENTE en vez de crear una. Con
  `drive.file` se puede sin ampliar permisos, usando el selector de archivos de
  Google, pero es una pantalla más y no bloquea el valor principal.

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

**Hecho (7 oct, auditoría de pagos):** ruteo del webhook por `cord_org`/`user_id`
con 503 ante fallas temporales, verificación de cuenta/importe/divisa/modo de
prueba, conciliación diaria (`/api/cron/mercadopago-conciliar`), preferencias que
vencen a las 72 h, renovación de credenciales que no se apaga por un 5xx, conexión
con `cobros_config` + reautenticación + país de la cuenta verificado + aviso a los
dueños, contracargos y mediaciones visibles (historia + alerta). Ver reglas 37–39.

**Hecho (9 oct, altos de la auditoría):** la liquidación de un cobro es la misma
para Mercado Pago y Cord Payments (`settleQuoteCobro`), un segundo pago del mismo
cobro por el otro riel se avisa y queda por devolver, los pagos en efectivo
pendientes (OXXO, boleto) se ven en la historia y en la página de pago, y "marcar
pagada" o anular una factura vence su preferencia.

**Falta, código (siguiente lote de la auditoría):**
- [ ] Conciliación periódica de PaymentIntents de cobros (regla 39): hoy un
  `payment_intent.succeeded` que se agota o se cierra a revisión deja el cobro
  `pendiente` hasta que alguien lo vea en la alerta. Mercado Pago ya la tiene.
- [ ] Invalidación cruzada al pagar: tras pagar por tarjeta, la preferencia o la
  ficha de OXXO de Mercado Pago del mismo cobro sigue viva (y viceversa). El pago
  tardío llega como duplicado con aviso, pero el efectivo es difícil de devolver.

**Falta, operativo (después del despliegue de la auditoría):**
- [ ] `npm run db:migrate` ANTES de desplegar: `pay.astro` lee
  `cotizacion_cobros.pago_en_proceso_at` y responde 500 sin la columna.
- [ ] Correr `/api/cron/conciliar-cotizacion-factura` en vista previa, revisar la
  lista y luego con `?aplicar=1` (repara facturas que nacieron con un saldo ya
  cobrado).
- [ ] Los pagos de PRUEBA (`live_mode: false`) ya no saldan documentos en
  producción: la prueba en COP de "Flouvia Colombia" con un comprador de prueba
  dejará el registro en la historia pero no marcará pagado. Para probar de punta a
  punta en producción hace falta un pago real.
- [ ] Probar un pago con un vendedor TERCERO (no el dueño de la app): el aviso llega
  a la `notification_url` de la preferencia, con `cord_org`.

**Falta, código:**
- [ ] Contracargos de Mercado Pago dentro del ledger (hoy se VEN y alertan, pero la
  cotización/factura sigue pagada) y tópico `topic_chargebacks_wh`.
- [ ] Validar en el botón (no solo en el proveedor) que la divisa de la cotización
  sea la del sitio de la cuenta (`orgs.mp_site_id`), y redondear COP/CLP a enteros.
- [ ] Reembolsar un pago de Mercado Pago desde Cord.
- [ ] Comisión de Cord en Mercado Pago (`marketplace_fee`) o declararla en cero.
- [x] Mercado Pago en la factura hospedada, con abono parcial (22 sep).
- [x] Reembolsos leídos del proveedor, en cotización y en factura (22 sep).
- [x] Link de pago en la cobranza con IA con cualquiera de los dos rieles (22 sep).
- [ ] Igualas recurrentes con Mercado Pago: exige guardar el medio de pago, que
  Checkout Pro no hace. Requiere el producto de suscripciones del proveedor.
- [ ] Opcional: PKCE en la autorización (Cord no lo manda; no activarlo en el panel
  hasta implementarlo).

Herramientas: el MCP de Mercado Pago está configurado en Claude Code (alcance local
de este proyecto) con `create_application`, `save_webhook`, `get_credentials`,
`notifications_history`, `create_test_user` y `search_documentation`. Si no carga en
una conversación, `claude mcp login mercadopago-mcp-server` desde una terminal
interactiva y recargar la ventana.

---

## Siguiente nivel (29 sep 2026): construido, falta probar

- [ ] **HubSpot:** abrir un Deal y ver la tarjeta de Cord en la barra lateral
  (si no aparece: Personalizar › Apps › Cord). Build #7 del proyecto.
- [ ] **Shopify:** existencias en el editor con un producto que controle
  inventario; encender "Facturar los pedidos de tu tienda" y pagar un pedido de
  prueba. Los precios B2B solo se pueden probar en una tienda Plus con B2B.
- [ ] **QuickBooks y Xero, pagos:** cobrar una factura ya contabilizada y ver el
  pago allá; registrar un pago allá y pulsar "Enviar las facturas pendientes".
  Xero: reconectar (permiso `accounting.payments`) y elegir la cuenta de banco.
- [ ] **Slack:** reconectar con "Cambiar canal" (permisos nuevos), pegar un link
  de cotización, probar `/cord COT-...` y una solicitud de aprobación (el
  permiso de aprobaciones es del plan Scale).
- [ ] **Docs públicas de pagos de QuickBooks y Xero:** otra sesión tenía cambios
  sin guardar en esas páginas; agregar la sección de pagos cuando los suba.
- [ ] **Teams con botones que deciden:** necesita un bot registrado en Azure Bot
  Service, que pide una suscripción de Azure. Hoy la solicitud llega a Teams con
  un botón que abre Cord.

## Apps que conviene conectar después

Ordenadas por impacto para Cord (de la propuesta al pago, con fuerte uso en México,
Latinoamérica, Estados Unidos y España). El criterio de la lista es dónde
ATERRIZA el dinero que Cord cierra: hojas de cálculo y contabilidad primero,
porque es el trabajo que el negocio hace igual a mano cada mes. Una conexión
que solo suma un logo al directorio no entra.

| Prioridad | App | Por qué le sirve a Cord | Esfuerzo |
|---|---|---|---|
| 1 | **Alegra / Holded / Siigo** | Contabilidad local: Alegra (México, Colombia, Perú), Holded (España), Siigo (Colombia). | Medio por cada una |
| 2 | **Pipedrive** | El CRM más usado por equipos pequeños después de HubSpot; mismo modelo de sincronización. | Medio |
| 3 | **Tiendanube y WooCommerce** | El equivalente de Shopify en Latinoamérica y en sitios propios. | Medio |
| 4 | **Salesforce** | Cuentas grandes (plan Scale). | Alto: AppExchange y revisión de seguridad |
| 5 | **Pagos hacia la contabilidad** | Hoy Cord manda la factura pero no el cobro: el pago se registra a mano en QuickBooks o Xero. | Bajo, sobre el carril que ya existe |
| 6 | **Google Calendar** | Seguimiento agendado cuando una cotización está por vencer, y la llamada de cierre en el calendario del vendedor. Hoy solo con Make y Zapier. | Medio: `calendar.events` es sensible, entra en la misma verificación de Google |
| 7 | **Google Drive** | El PDF de cada factura y cotización en una carpeta del negocio, ordenado por año y cliente. `drive.file` ya está aprobado por Sheets. | Bajo |

Shopify salió de esta lista el 23 de septiembre de 2026 (está en producción en
los dos sentidos), Google Sheets y Excel el 27 de septiembre, y QuickBooks y
Xero el 27 también, y Gmail (envío y complemento) el 28.

Todo lo que se agregue sigue la regla 15: nada aparece en Ajustes › Integraciones
como disponible hasta que funcione de punta a punta.
