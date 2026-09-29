# Integraciones y automatización

> Documento de estado actual: catálogo de apps, Cord Workflows y las apps de
> Cord en plataformas de terceros. Para decisiones fechadas, consulta
> [`../historial/platform-api.md`](../historial/platform-api.md).

## Directorio de apps

`src/lib/integraciones/catalogo.ts` es la fuente única de las 7 apps (HubSpot,
Slack, Teams, WhatsApp, Make, Zapier, n8n): slug, nombre, dominio,
categoría, logo (favicon de Google, regla 8), si el logo llena la casilla y si la
app está disponible. De ahí salen el directorio de Ajustes, el detalle de cada
app y los logos de marca de los workflows (`src/lib/workflows/icons.ts`
reexporta `BRAND_LOGOS` y `BRAND_TILES`).

- `/app/ajustes/integraciones` — solo tarjetas de apps, conectadas primero.
- `/app/ajustes/integraciones/[app]` — estado, conexión y los workflows que usan
  esa app. Una app con `disponible: false` no abre detalle (regla 15).

Agregar una app es una entrada en el catálogo más su bloque en
`IntegrationDetail.astro` y sus textos en `src/i18n/app.ts`.

## HubSpot

Conexión OAuth por organización (`integracion_conexiones`), tokens cifrados con
`src/lib/crypto-secret.ts` y una cuenta de HubSpot solo puede estar conectada a
una organización.

- **Clientes ↔ Empresas y Contactos, en los dos sentidos.** De HubSpot regresan
  nombre, contacto, correo y teléfono, y solo de registros ya vinculados.
- **Cotizaciones → Deals**, con la etapa configurable por estado. Mover un Deal
  en HubSpot no cambia nada en Cord.
- **Anti-eco:** huella de lo último sincronizado (`integracion_vinculos.huella`)
  más el actor `integration:hubspot:<conexión>`.
- **Cola `integracion_sync`** con reintentos y cron diario; el webhook entrante
  valida la firma v3 con el client secret y resuelve la organización con
  `cord_resolve_integracion`.
- Sin divisa no se envía el monto del Deal (regla 21).

La app pública vive en `integrations/hubspot/` como proyecto del CLI de HubSpot
(plataforma 2026.03): scopes, URLs de regreso y webhooks de Empresas y Contactos.

**Tarjeta de Cord en HubSpot** (29 sep 2026): UI extension (`src/app/cards/`,
ubicación `crm.record.sidebar`) en Deals, Empresas y Contactos. Consulta con
`hubspot.fetch` a `GET /api/integraciones/hubspot/tarjeta` (en
`PUBLIC_API_EXACT` y en `permittedUrls.fetch`), que valida la firma v3 con el
secreto de la app, resuelve la organización por `portalId` con
`cord_resolve_integracion` y el registro por su vínculo (`deal` → la
cotización; `company`/`contact` → el cliente y sus últimas 8). Solo lee: crear
abre `/app/cotizaciones/nueva?cliente=` con la sesión de Cord, así que un
usuario de HubSpot sin cuenta en Cord no puede escribir nada. Se sube con
`hs project upload` (build #7).

## Slack

Incoming webhook por organización (`orgs.slack_webhook_url`). Lo consumen
`notify()` y la acción `slack_message` de los workflows.

"Añadir a Slack" (OAuth v2, permiso `incoming-webhook`) escribe en esa MISMA
columna, así que ningún consumidor cambió: la persona elige el canal en Slack y
Cord recibe el webhook de ese canal. `slack_channel` y `slack_team` solo sirven
para decir a dónde llegan los avisos; guardar una URL a mano los borra. Código en
`src/lib/integraciones/slack-oauth.ts` y `src/pages/api/integraciones/slack/`;
el state reusa `integracion_oauth_estados`. Se activa con `SLACK_CLIENT_ID` y
`SLACK_CLIENT_SECRET`; sin ellas la tarjeta solo ofrece pegar un webhook propio.
La app de Slack (`A0C307S6ENB`, workspace flouvia) se creó el 2026-09-21 desde
`integrations/slack/manifest.json` con la API de manifiestos; su manifiesto declara el
usuario bot porque Slack no acepta `incoming-webhook` sin él. Credenciales en
`integrations/slack/.env` (ignorado) y en Vercel. Sin distribución pública activada
solo se puede instalar en el workspace dueño de la app.

## Shopify

Dos direcciones: la tienda entra a Cord (fase 1, 22 sep 2026) y la cotización
cerrada sale como pedido (fase 2, 23 sep 2026). Vive en
`src/lib/integraciones/shopify/` y reusa el carril de HubSpot
(`integracion_conexiones` + `integracion_vinculos`), no una tabla propia.

- **Una variante es un producto.** Shopify tiene producto + variantes y Cord
  solo productos: la variante es la que tiene precio y SKU, así que aplanar por
  producto perdería el precio de cada talla. Un producto borrado se DESACTIVA,
  nunca se borra: puede estar dentro de una cotización ya enviada.
- **Un cliente no se duplica.** Si el correo ya existe en `clientes`, se adopta
  esa fila y se completa lo que falte en vez de crear una segunda empresa.
- **Anti-eco por huella** (`integracion_vinculos.huella`), igual que HubSpot:
  Shopify manda un webhook por cada campo que toque el comerciante, y sin la
  huella cada uno reescribiría la fila.
- **El token es "offline": no vence y no hay refresh.** Por eso el CHECK de
  `integracion_conexiones` que exige `refresh_token_enc` excluye a Shopify: el
  contrato original era de HubSpot, donde el refresh ES la credencial viva.
- **Dos firmas, un secreto.** El regreso de OAuth se firma en hex sobre los
  parámetros ordenados y cada webhook en base64 sobre el cuerpo CRUDO; las dos
  se comparan en tiempo constante y un webhook sin firma válida responde 401,
  como Shopify exige para aprobar la app. El regreso además caduca a los 5 min.
- **El dominio identifica, no autoriza** (regla 30): el webhook resuelve la
  organización con `cord_resolve_integracion` y vuelve a `withOrgTx`. El
  dominio se valida con forma estricta porque con él se arma la URL a la que
  Cord llama: aceptarlo libre sería dejar que el atacante elija el destino.
- **Webhooks obligatorios de privacidad** (`customers/data_request`,
  `customers/redact`, `shop/redact`) se contestan siempre, aun sin conexión
  viva; Cord no guarda compradores de la tienda, el negocio es el responsable.
- **La configuración de la app es código**: `integrations/shopify/shopify.app.toml`
  (URLs y permisos) se publica con `shopify app config link` + `shopify app
  deploy`. Los webhooks de negocio se registran POR TIENDA con la API
  (`registrarWebhooks()`), no en el toml: una app no embebida necesita
  `use_legacy_install_flow = true`, y ese modo rechaza los webhooks declarativos
  a nivel de app. En el toml quedan solo los obligatorios de privacidad, que sí
  acepta.
- La app no aparece en el directorio sin `SHOPIFY_CLIENT_ID`/`SECRET`
  (`SHOPIFY_LISTO` en el catálogo): una tarjeta "Conectar" sin app detrás
  mandaría a la persona a un error de Shopify (regla 15).

### Fase 2: el pedido de vuelta (23 sep 2026)

`src/lib/integraciones/shopify/orders.ts` es la PRIMERA dirección en la que Cord
escribe en el negocio de alguien más, así que todo está acotado a propósito:

- **Nace apagado.** El disparador vive en `integracion_conexiones.ajustes.pedidos`
  (`no` | `aprobada` | `pagada`) y el default es `no`: crear pedidos toca
  inventario y números de la tienda, y eso no puede aparecer por sorpresa
  (regla 15). Se elige en la tarjeta de Ajustes y se guarda al cambiar el select.
- **Un pedido por cotización lo garantiza el vínculo, no un `if`.** La fila de
  `integracion_vinculos` con `objeto = 'quote'` es la llave: el tipo pasa de
  `shopify_draft_order` a `shopify_order` al completarse. Un evento repetido
  reusa el que existe.
- **Una divisa distinta no se convierte, se detiene** (regla 21). Si la
  cotización va en otra divisa que la tienda —guardada al conectar con
  `leerTienda()`— no se crea el pedido. Mandar el número sin su divisa lo
  cobraría en la equivocada.
- **El precio que viaja es el negociado con su descuento.** Una línea con
  producto vinculado va como variante (descuenta inventario) y una línea libre
  como concepto suelto, en vez de perderse. El impuesto lo calcula Shopify con
  la configuración de la tienda; el documento fiscal sigue siendo el de Cord.
- **El permiso se detecta, no se asume.** `write_draft_orders` y `read_orders`
  se agregaron a los scopes, así que una tienda conectada ANTES de esta fase no
  los tiene: la tarjeta muestra "reconectar" en lugar de fallar contra el
  proveedor (regla 14). Publicado como versión `cord-4`.
- **Un fallo aquí no rompe la venta.** `onQuoteEvent()` cuelga de
  `domain-events.ts` dentro de `after(...)` y nunca lanza.

## Shopify para mayoreo (29 sep 2026)

- **Existencias**: `productos.existencias` (null = sin control de inventario) y
  `existencias_at`. Se escriben FUERA de la huella en cada sincronización y en
  los webhooks de producto (`inventory_quantity` + `inventory_management`), y
  el editor las pide al momento a `POST /api/integraciones/shopify/existencias`
  (`refrescarExistencias`, nodos `ProductVariant`) al agregar un producto o
  abrir un borrador. Cambios de inventario hechos en la tienda sin tocar el
  producto no disparan webhook sin `read_inventory`; por eso la consulta en vivo.
  Avisa, no bloquea.
- **Facturar pedidos de la tienda** (`ajustes.facturas`, nace `no`): webhook
  `orders/paid` → `facturarPedido()` en `src/lib/integraciones/shopify/facturas.ts`
  crea un BORRADOR con `createInvoiceDraft` (nunca emite). Idempotencia: el
  vínculo `shopify_order` (si el pedido ya está ligado a cualquier objeto, no se
  hace nada); los pedidos con etiqueta `cord` se saltan. Divisa
  `presentment_currency` con importes de presentación, descuentos por línea,
  envío como línea, tasa validada por `resolve()` del catálogo. Encenderlo
  registra el webhook en tiendas conectadas antes. Pedidos de invitado no se
  facturan. Lo verifica `test/shopify-facturas.test.ts`.

## Google Sheets y Excel

Una fila por documento en la hoja del negocio, al día sola (27 sep 2026). Son
**dos integraciones distintas** en el directorio —con su tarjeta, su artículo y
su estado— y una organización puede tener las dos conectadas a la vez: el
documento se lee una vez y se escribe en cada una. Por dentro comparten motor
(`src/lib/integraciones/hojas/`) y reusan el carril de HubSpot y Shopify
(`integracion_conexiones`), una conexión por proveedor.

- **Cada una se comporta como su plataforma.** Sheets recibe cabecera congelada
  y en negrita, filtro básico, formato de número en las columnas de dinero y
  anchos automáticos, todo en un `batchUpdate`. Excel recibe una **tabla de
  Excel de verdad** (`CordCotizaciones`, `CordFacturas`), que es lo idiomático
  ahí: da filtros, bandas, encabezado fijo y fórmulas por nombre de columna. Las
  filas nuevas se agregan POR la tabla, porque escribir en el rango de abajo las
  dejaría fuera de ella.
- **Qué columna lleva dinero se DERIVA de la cabecera** (`columnasMonto()`), no
  se escribe a mano: mover una columna movería el formato a la equivocada.

- **Excel reusa la app de Entra de Teams, y eso obliga a registrar SU retorno.**
  Los permisos se piden por autorización, así que compartir el registro es
  correcto; lo que no se hereda es la URL de retorno. La app `Cord`
  (`9c8b8fe6-8096-48a2-b991-32f978c12a9a`) necesita las cuatro:
  `/api/integraciones/teams/callback` y `/api/integraciones/hojas/callback`, cada
  una en producción y en `localhost:4321`. Faltando la de hojas, Microsoft
  responde `AADSTS50011` y la conexión de Excel muere antes de empezar.
- **El permiso es el más estrecho que existe, y eso decide el diseño.** Google
  recibe solo `drive.file` (más `openid email`), que no es un permiso sensible:
  la app ve ÚNICAMENTE los archivos que ella creó. Por eso Cord CREA la hoja en
  vez de pedir una existente — pedir `spreadsheets` habría dado acceso a toda la
  cuenta y metido al producto en la auditoría de seguridad anual de Google, que
  cuesta miles de dólares y se repite cada año. Excel usa `Files.ReadWrite` de
  Graph, con la MISMA app de Entra que Teams: los permisos se piden por
  autorización, así que quien solo conecta Excel nunca ve los de Teams.
- **La fila se encuentra por FOLIO, no por número de fila.** La hoja es de la
  persona y la persona ordena, filtra e inserta filas; un número guardado en
  Cord apunta a otra venta en cuanto alguien ordena por total, y entonces Cord
  sobrescribe el documento equivocado. El folio vive en la columna A y sobrevive
  a todo eso. Si no aparece, la fila se agrega al final.
- **Los importes viajan como número y la divisa en su columna** (regla 21). Una
  hoja existe para sumar: `"$1,234.50"` es texto que no suma. Y pegarle el
  símbolo al número escondería que la columna mezcla monedas, con un `SUM` que
  daría un total inexistente.
- **Las fechas van en la zona de la organización** (regla 24), en `YYYY-MM-DD`,
  el único formato que ordena bien y que las dos hojas reconocen sin importar el
  idioma del archivo.
- **Los títulos de las pestañas son un DATO, no una constante.** Se traducen al
  idioma de la organización al crear el archivo y se guardan en `ajustes`:
  buscarlos por un literal del código rompería la escritura en una cuenta en
  inglés.
- **Un fallo de la hoja no tumba la venta.** `onDomainEventHoja()` cuelga de
  `domain-events.ts` dentro de `after(...)`, nunca lanza, y un error de
  autorización marca la conexión en `error` para que la tarjeta ofrezca
  reconectar en vez de fallar en silencio.
- **Excel necesita una plantilla.** Graph no tiene "crear libro": un archivo de
  cero bytes no es un `.xlsx` y la API de libros lo rechaza. Cord sube una
  plantilla mínima de 1.9 KB —generada y verificada una vez— y a partir de ahí
  usa la API normal.
- Sin credenciales, cada proveedor se ofrece como "Próximamente" por separado
  (regla 15): hoy Excel está listo porque reusa la app de Teams, y Google espera
  su cliente OAuth (`GOOGLE_SHEETS_CLIENT_ID`/`SECRET`).

Contrato ejecutable en `src/lib/integraciones/hojas/columnas.ts`, verificado por
`test/hojas.test.ts`.

## QuickBooks Online y Xero

La factura definitiva de Cord entra a la contabilidad del negocio (27 sep 2026).
Vive en `src/lib/integraciones/contabilidad/` y reusa el carril de siempre
(`integracion_conexiones` + `integracion_vinculos`), una conexión por proveedor.

- **La idempotencia es el vínculo** (`objeto = 'invoice'`), no un `if`. Una
  factura duplicada en los libros de alguien se arregla a mano y con su
  contador; el vínculo es lo que impide que ocurra.
- **Solo viajan facturas DEFINITIVAS.** QuickBooks no tiene borradores: lo que
  se crea por su API queda asentado. Por eso el disparador es
  `invoice.finalized` / `invoice.sent`, nunca un borrador.
- **Xero sí tiene borradores, y se usan.** La factura entra en `DRAFT` y la
  aprueba el contador: un sistema externo no asienta solo en los libros de otro.
  Esa asimetría es deliberada y está dicha en la tarjeta de cada uno.
- **El importe de la línea se calcula sobre el precio YA redondeado.** Con el
  crudo, `33.333 × 3` daba precio 33.33 e importe 100.00: un renglón que no
  cuadra consigo mismo, y basta uno para que un contador desconfíe de todo lo
  que mande Cord.
- **QuickBooks exige un producto por línea de venta.** Cord asegura un servicio
  llamado `Cord` y cuelga de ahí todas las líneas, en vez de crear un producto
  por concepto y ensuciar el catálogo del contador. El folio de Cord va en la
  nota privada: la numeración de la contabilidad es del contador.
- **El refresh token de Xero es de un solo uso.** Cada renovación trae uno nuevo
  y hay que guardarlo; conservar el viejo mata la conexión en la siguiente hora.
- **El cliente se resuelve una vez y se recuerda** con su propio vínculo. Sin
  eso, cada factura crearía otro cliente con el mismo nombre.

- **El impuesto viaja con su tasa, o no viaja.** Cada tasa de Cord busca la
  tasa IDÉNTICA del catálogo de la contabilidad (`TaxRate` de Xero, que pide
  `accounting.settings.read`; `TaxCode` de QuickBooks). Sin coincidencia la
  factura no se asienta y el motivo queda en `ultimo_error` para que la tarjeta
  lo diga. QuickBooks de EE.UU. con impuesto automático (`PartnerTaxEnabled`)
  recibe `TxnTaxDetail.TotalTax` con el impuesto de Cord para que no lo
  recalcule; si el total asentado no cuadra, la factura se borra.
- **Las retenciones no viajan.** Ninguna de las dos las representa en una
  factura de venta; asentarla sin ellas inflaría la cuenta por cobrar.
- **La fecha es la de emisión** (`issued_at`), no la del borrador, y una factura
  anulada no viaja.

Lo que NO hace todavía: mandar los pagos y traer datos de vuelta. Está dicho en
los dos artículos de ayuda.

Contrato ejecutable en `lineasDe()` y `TIPOS` de
`src/lib/integraciones/contabilidad/service.ts` y en `impuestos.ts`, verificado por
`test/contabilidad.test.ts`.

## Enviar desde el Gmail del negocio

El negocio conecta su Gmail en Ajustes › Integraciones › Gmail y los correos a
SUS clientes (`OPERACIONES_GMAIL`: cotización enviada, factura, recordatorio de
pago y el correo al cliente de un workflow) salen desde su dirección (28 sep
2026). Los avisos internos siguen saliendo de Cord.

- **Solo `gmail.send`**, más `openid email` para saber la dirección. Es un
  permiso sensible, no restringido: pide la verificación de la pantalla de
  consentimiento de Google, no la auditoría anual. Usa el MISMO cliente OAuth
  de Google que Sheets (`GOOGLE_SHEETS_CLIENT_*`): un proyecto, una sola
  verificación. Su regreso es `/api/integraciones/gmail/callback`, que hay que
  registrar en ese cliente.
- **El callback exige el permiso de enviar.** Google deja desmarcar permisos
  uno por uno, y una conexión "activa" sin `gmail.send` fallaría en el primer
  correo.
- **Un envío fallido no pierde el correo.** `sendEmail` intenta Gmail y, si
  falla, sale por Resend como siempre; un 401/403 deja la conexión en `error`
  y la tarjeta pide reconectar. Es el orden correcto para correo de cobro: el
  cliente recibe la factura aunque la conexión esté rota.
- **El MIME se arma en Cord** (`src/lib/integraciones/gmail/mime.ts`) y se sube
  por el endpoint de carga (`uploadType=media`, hasta 35 MB) para que quepan
  los PDF. Todo dato del negocio pasa por `linea()`: un salto de línea en el
  nombre o el asunto inyectaría encabezados. Lo verifica
  `test/gmail-envio.test.ts`.
- **Sin gate de plan**: no le cuesta nada a Cord (no pasa por Resend) y es la
  forma en que el cliente reconoce al remitente.

## Cord para Gmail (complemento)

Complemento de Google Workspace que abre una cotización desde el correo del
cliente (27 sep 2026). Vive en `integrations/gmail/` como Apps Script, igual que
las apps de Zapier, Make y n8n viven como código en el repo.

- **El permiso es la decisión de diseño.** Usa
  `gmail.addons.current.message.readonly`, que lee ÚNICAMENTE el mensaje abierto
  y **no** está en la lista de permisos restringidos de Google —verificado
  contra la lista oficial—. Leer la bandeja (`gmail.readonly`) sí lo está, y
  obliga a una auditoría de seguridad anual de un tercero certificado. El
  complemento está hecho para no necesitarla nunca.
- **Del correo salen el remitente, el asunto y el folio si lo trae.** Con el
  folio el panel muestra la cotización del hilo en vivo (estado, última
  actividad) y deja responder con ella en el mismo hilo o reenviarla por Cord.
  El texto viaja a Cord solo al pulsar "Cotizar con IA"
  (`POST /api/v1/cotizaciones/ia`, que gasta IA del plan y no crea nada: la
  persona confirma las líneas). La IA es la misma del editor
  (`src/lib/ai-quote-draft.ts`).
- **Se conecta con el OAuth de Cord** (cliente `gmail`), sin llaves. El regreso
  NO es la `usercallback` de Apps Script: Google la ejecuta con la primera
  cuenta del navegador, que no siempre es la del complemento, y fallaba con "se
  requiere autorización" (28 sep 2026). El regreso registrado es
  `https://cordhq.app/oauth/listo`: `/api/oauth/authorize` detecta esa dirección
  (`isEntregaUri`), guarda el código en `oauth_entregas` contra el sha-256 del
  `state` y lo deja fuera de la URL; el complemento lo recoge en
  `/api/oauth/entrega` con su secreto, el `state` y su verificador PKCE, que en
  este carril es obligatorio. Un solo uso, cinco minutos de vida.
- **Al redactar** (`composeTrigger`), inserta el link de una cotización del
  destinatario. Lee solo los destinatarios del borrador
  (`gmail.addons.current.message.metadata`) y escribe con
  `gmail.addons.current.action.compose`; ninguno es restringido. Los borradores
  no se listan: todavía no tienen página que el cliente pueda abrir.
- **No gasta la cuota mensual de API** (`isFirstPartyClient` en
  `src/lib/oauth-core.ts`, aplicado en `meterApiUsage`): es la interfaz de Cord
  dentro de Gmail, no una integración que el negocio arma, y con las 100
  llamadas de Gratis se agotaba en días. Decisión de André (28 sep 2026). El
  límite por minuto sí aplica; Zapier, Make y n8n siguen contando.
- **La tarjeta de Ajustes** existe (`gmail` en el catálogo) pero dice
  "Próximamente" mientras `GMAIL_INSTALL_URL` sea `null`: la conexión ocurre
  dentro de Gmail y sin ficha en Google Workspace Marketplace no hay forma de
  instalarlo. El estado "Conectado" sale de `connectedOAuthApps`, como Zapier.
- La cotización nace con una línea a partir del asunto porque `createCotizacion`
  exige al menos una; el vendedor la termina en Cord, donde están los productos,
  los precios y los impuestos.

## Zapier y Make

Ambas apps viven como código en el repo y se publican con el CLI o la API de cada
plataforma:

- `integrations/zapier/` — app sobre la API v1: disparadores instantáneos que
  crean y borran su propio webhook y verifican `X-Cord-Signature-V1`, acciones y
  búsquedas. Se sube con `zapier-platform push`.
- `integrations/make/` — manifiesto en `app.mjs` y `deploy.mjs`, que crea o
  actualiza la app por la API de Make. Make no expone el cuerpo crudo del
  webhook, así que no puede verificar la firma; la protección es la URL única
  que Make genera por escenario.

El link de invitación de Zapier vive en `ZAPIER_INVITE_URL` (catálogo); sin él la
tarjeta dice "Próximamente". Desde la versión 1.1.0 la app de Zapier se conecta
por OAuth 2.0 (ver la sección siguiente). Make también: app `cord-78vg5m` en us2,
compartida con `MAKE_INVITE_URL`, con `clientId` y `clientSecret` en los datos
comunes de la conexión (`deploy.mjs`). n8n sigue con llave
de API: cada instancia tiene su propio redirect (`https://<instancia>/rest/oauth2-credential/callback`),
y el registro de clientes de Cord exige coincidencia exacta; abrirlo a cualquier
redirect sería justo lo que ese control evita.

El nodo de n8n se publica en npm como `n8n-nodes-cord`. Desde la 1.1.0 está armado
sobre la plantilla oficial de n8n (`n8n-node new`): TypeScript, lint estricto de
`@n8n/node-cli` y soporte para n8n Cloud activado (`n8n-node cloud-support`). La fuente
de verdad es `integrations/n8n/`; el repo público `Flouviamx/n8n-nodes-cord` es su espejo,
porque n8n solo verifica nodos publicados desde GitHub Actions con constancia de origen y
npm solo la genera desde repositorios públicos.

- `npm run lint` corre las reglas de n8n; `npm test` compila y verifica paquete, eventos
  y firma. `nodes/Cord/events.ts` se genera con `npm run sync` desde el catálogo de Zapier.
- Para publicar: copia al espejo (sin `scripts/sync-events.mjs`, que solo existe aquí) y
  empuja un tag igual a la versión; `publish.yml` corre `npm run release`, que en CI
  publica con constancia. Requiere Trusted Publisher configurado en npm.
- La plantilla de `n8n-node new` 0.48.6 genera los flujos de GitHub sin las expresiones
  `${{ ... }}` (`NPM_TOKEN: $`, `group: ci-$`); están corregidos a mano.
- El revisor real (`@n8n/scan-community-package`) analiza la fuente del repo con todas las
  reglas y, del paquete, solo `.js` y `package.json`. La 1.0.0 se publicó a mano, sin
  constancia, porque npm solo deja configurar Trusted Publishing en un paquete que ya existe.
- 1.1.0 publicada el 2026-09-21 desde GitHub Actions con constancia de origen (SLSA v1) y
  aprobada por `npx @n8n/scan-community-package`. Trusted Publisher se configuró con
  `npm trust github` (pide segundo factor en el navegador). El registro de npm tarda un
  par de minutos en mostrar una versión nueva aunque el flujo ya haya terminado.

## Cord como proveedor OAuth 2.0

Quien conecta una app externa autoriza en una pantalla de Cord en vez de crear y
pegar una llave. Código: `src/lib/oauth-core.ts` (tokens, PKCE, scopes, redirect
exacto — puro y probado en `test/oauth-core.test.ts`), `src/lib/oauth-provider.ts`
(base de datos), `src/pages/oauth/authorize.astro` (consentimiento),
`src/pages/api/oauth/{authorize,token,revoke}.ts`.

- **Un grant es una llave de vida corta.** `cord_oauth_issue()` crea una fila de
  `api_keys` con `oauth_client_id` y `expires_at` (1 h) más una de `oauth_grants`
  que guarda el hash del refresh token (180 días, se rota en cada uso). Así
  `/api/v1` y MCP aceptan el token sin tocar cada ruta, y los webhooks que la app
  crea (`created_by_key`) sobreviven a la renovación porque el id no cambia.
- **No cuentan contra el límite de llaves del plan** (`active_rank = 0`): son
  conexiones, no credenciales que el equipo administre. Tope de 25 conexiones
  vivas por app y organización.
- **Solo hash en base de datos**: códigos, access y refresh. El endpoint de token
  no tiene sesión ni organización, así que resuelve todo con funciones
  `security definer` (`cord_oauth_client`, `_consume_code`, `_issue`, `_refresh`,
  `_revoke`) y el consumo del código es una sola sentencia: dos canjes
  simultáneos no pueden ganar los dos.
- **Consentimiento**: el redirect debe coincidir EXACTO con el registrado; si no,
  no se redirige a ningún lado. Solo pueden autorizar quienes tienen el permiso
  `ajustes` en el espacio elegido (los mismos que crean llaves). PKCE S256
  opcional pero soportado; `plain` no se acepta.
- **Registro de clientes**: manual, con `scripts/oauth-client.mjs`. Escribe el
  secreto solo en el `.env` indicado y nunca lo imprime. No hay registro dinámico.
- **Astro `security.checkOrigin` está en `false`.** Bloqueaba el POST de
  formulario sin `Origin` del endpoint de token, que es como lo llama cualquier
  servidor. El CSRF de toda escritura sigue en `src/middleware.ts` con Origin
  obligatorio y exenciones declaradas (`csrf-policy.ts`).
- **CSP y COOP del flujo.** La CSP global limita `form-action`, y Chrome la aplica
  también al redirect que sigue al POST: sin excepción, "Autorizar" no hacía nada.
  La página de consentimiento publica el origen del redirect ya validado
  (`X-Cord-Form-Action`, header interno que el middleware consume y borra) y solo
  ese origen se suma a `form-action`. El flujo (consentimiento, su POST y el login
  con `redirect_url` hacia él) va con COOP `unsafe-none`: Zapier y Make abren la
  autorización en una ventana y necesitan su `opener` al volver. Probado con un
  Chrome real vía CDP, no con curl, que no aplica CSP.
- **Regreso por zona (Make).** Make documenta `www.make.com/oauth/cb/app`, pero esa
  página no encuentra los intentos de cuentas en otras zonas ("Resource not found"):
  cada zona atiende su propio `/<zona>.make.com/oauth/cb/app`. `pickReturnTo()` regresa
  al dominio del que vino la persona (su `Referer`) cuando esa dirección, con la misma
  ruta, está registrada para la app; el código sigue atado al `redirect_uri` que pidió
  la app, así que el canje no cambia. Si hace falta iniciar sesión, la zona viaja en
  `return_to`, validado igual contra lo registrado.
- Revocación: la conexión aparece en Ajustes › Modo desarrollador › API como
  "Conexión autorizada"; revocarla cierra la llave y el grant.

## Canales de aviso

`notify()` es la única puerta: lee `orgs.notif_prefs` y publica en los canales
marcados. Son tres columnas independientes —correo, Slack y Microsoft Teams—, no
un espejo: una org puede tener los dos canales conectados y querer cada evento en
uno solo.

- Slack: Incoming Webhook (`orgs.slack_webhook_url`), texto plano bilingüe.
- Teams: flujo de Power Automate (`orgs.teams_webhook_url`), Adaptive Card. Los
  conectores O365 de Teams están retirados, así que la URL vigente es la del
  flujo (`*.logic.azure.com`) y eso es lo que valida `isTeamsWebhookUrl()`.
  `webhook.office.com` se acepta para tenants que aún lo conserven.
- Teams con "Conectar con Microsoft" (sep 2026; app de Entra `Cord`
  `9c8b8fe6-8096-48a2-b991-32f978c12a9a` registrada el 23 sep 2026 en el tenant
  Flouvia, con `TEAMS_CLIENT_ID`/`TEAMS_CLIENT_SECRET` en Vercel. Sin esas dos
  variables la tarjeta solo ofrece el flujo). OAuth delegado de Microsoft Graph contra `organizations` (cuentas de
  trabajo o escuela; los canales no existen en cuentas personales) con
  `User.Read`, `Team.ReadBasic.All`, `Channel.ReadBasic.All` y
  `ChannelMessage.Send`, ninguno con consentimiento de administrador. Graph solo
  permite publicar en un canal con permiso delegado, así que la tarjeta sale a
  nombre de quien conectó y la UI lo dice. Tokens cifrados en
  `orgs.teams_graph_*`; el refresh se renueva con margen de 2 min y un
  `invalid_grant`/`interaction_required` marca `teams_graph_estado = 'error'`
  (estado `warn` en el catálogo y "Volver a conectar"). El equipo y el canal se
  eligen de las listas reales de Graph y sus nombres salen de Graph, no del
  navegador. **Un solo destino**: elegir canal borra `teams_webhook_url` y
  guardar un flujo propio desconecta Graph. `deliverTeams()` en
  `src/lib/integraciones/teams-graph.ts` es la única salida para avisos,
  workflows y la prueba. Microsoft no tiene revocación de un solo refresh token:
  desconectar borra el acceso en Cord y la persona quita la app desde
  myapps.microsoft.com si quiere. Sin probar contra un tenant real todavía.

## WhatsApp Business

Cloud API de Meta, con la cuenta del NEGOCIO: los mensajes salen de su número y
Meta le cobra a él la conversación. El token va cifrado en `orgs`.

Meta no permite iniciar una conversación con texto libre, solo con una plantilla
aprobada — por eso la acción de workflow ofrece VARIABLES (`{{1}}`…`{{4}}`) y no
un campo de mensaje: un campo libre prometería algo que el proveedor rechaza
(regla 15). El teléfono sale del cliente del documento y exige lada de país:
`toE164()` no la inventa, porque el mismo número existe en varios países.

## Cord Workflows

Contrato completo en [`app-rutas.md`](app-rutas.md) y en el historial. Resumen:

- Disparadores: los eventos de `domain_events`, incluidos contracargos, reembolsos, depósitos y cambios en la cuenta de cobros. Esos cuatro los emite `src/pages/api/stripe/webhook.ts` una sola vez por `referencia` del proveedor; la cuenta de cobros solo cuando cambia lo que puede hacer.
- **Anclas de tiempo** (sep 2026): `quote.expiring`, `invoice.due_soon` e
  `invoice.past_due` los emite `/api/cron/anclas-tiempo` una vez al día por
  documento vivo, con la distancia en días como campo. El día exacto lo elige el
  autor con una condición, no una cadencia fija de Cord. Son `public: false` en
  `DOMAIN_EVENTS`: no viajan a webhooks —un suscriptor recibiría el mismo aviso a
  diario— y solo se emiten para organizaciones con un workflow activo escuchando
  ese disparador, con dedup de 20 horas por documento.
- **Disparador programado** (sep 2026): `schedule.tick`. El horario vive en la
  definición y `workflows.next_run_at` dice cuándo toca; el cron horario lo
  AVANZA antes de emitir (regla 25) y encola solo ESE workflow —un tic
  compartido dispararía a los demás fuera de hora—. La hora se interpreta en
  `orgs.zona_horaria`, con `src/lib/workflows/schedule.ts` puro y probado contra
  el cambio de horario; el día del mes se topa en 28.
- Pasos: acción, condición (operadores de lista cerrada, sin `eval`), espera en
  días, **espera condicionada** (`wait_until`: revisa cada hora hasta que la
  condición se cumple o vence el plazo, con rama para cada salida) y **consulta**
  (`query`, catálogo cerrado en `datasets.ts` con el SQL en `datasets-run.ts`
  para que el editor no arrastre el driver al navegador).
- `workflow_runs.datos` guarda lo que produce la ejecución —resultados de
  consulta y el vencimiento de cada espera condicionada—, que es lo que permite
  que sobrevivan a una espera de días. El plazo se fija la primera vez y no se
  recalcula: revisarlo lo empujaría para siempre.
- **Prueba sin publicar**: `POST /api/workflows/[id]/probar` corre el borrador
  contra el último evento real. Las consultas se ejecutan (solo leen y son el
  dato que decide la rama); las acciones NO, y se devuelve el texto renderizado.
- El cron de workflows pasó de diario a **horario**: un horario elegido por el
  negocio y una espera condicionada no se pueden honrar con un barrido diario.
- Acciones: crear tarea, avisar al equipo por correo, escribir al cliente,
  caducar cotización, aprobar la solicitud interna, anular factura, POST a una
  URL, mensaje a Slack, mensaje a Teams y nota en HubSpot. Cada acción de marca
  declara su `brand`, que es lo que pinta su logo.
- **Condiciones de transición** (sep 2026): los tres eventos de actualización
  (`quote.updated`, `client.updated`, `product.updated`) llevan el valor
  ANTERIOR de los campos sobre los que se decide algo, y esos campos declaran
  `prev: true`. Ahí el editor ofrece `changed`/`unchanged` (`operatorsFor()`).
  Sin valor anterior el operador responde `false`: un evento previo a esta
  capacidad diría "cambió" a todo. El "antes" se lee en la MISMA transacción
  que el update, no en una consulta aparte.
- Las acciones que mutan un documento declaran `needs: 'quote' | 'invoice'` y el
  disparador declara qué objeto entrega (`object`): `validateForPublish` lo
  verifica, así que el desajuste se dice al publicar y no se descubre en una
  ejecución fallida. El objeto sobre el que se actúa sale SIEMPRE del evento,
  nunca de un parámetro del paso.
- El correo al cliente reserva `envios` con `reserveUsage()` antes de mandar y lo
  cancela si el envío falla: un workflow no puede ser la puerta de atrás para
  saltarse la cuota del plan Gratis. El destino del POST pasa por `safeFetch`
  (misma defensa SSRF que los webhooks) y se valida también al publicar.
- Errores de ejecución: se guardan como CÓDIGO (`wf.err.*`, `src/lib/workflows/errors.ts`)
  y se traducen al leer las ejecuciones (regla 36). Lo mismo hace HubSpot con
  `hs.err.*` para `integracion_conexiones.ultimo_error` y sus respuestas de API.
- Plantillas: `src/lib/workflows/templates.ts`, único origen de las 9 ideas que
  se ofrecen en la lista, en el editor y en el detalle de cada integración. Son
  nueve a propósito: una por caso de uso real, sin dos que se pisen.
- **Datos del negocio** (`ORG_FIELDS` en `catalog.ts`): se agregan a TODOS los
  disparadores en un solo lugar y los resuelve `orgValues()` en el motor. `hoy`
  se calcula en la zona de la organización, no en UTC (regla 24).
- **Panel de salud** (`workflowHealth()`): ejecuciones y causas de fallo de los
  últimos 30 días, agrupadas por el CÓDIGO del error. Agrupar así solo es
  posible porque el error se guarda como código: con la frase escrita, un cambio
  de redacción partiría una causa en dos.
- Límite de workflows activos como hard limit `active_workflows` (regla 18).

## Contrato de seguridad

Auditado el 2026-09-22 sobre HubSpot, Slack, Zapier, Make, n8n, Mercado Pago, la
API pública, MCP y Cord Workflows (Teams y WhatsApp quedaron fuera de esa
revisión). Lo que sostiene cada carril, y que no se debe romper sin reemplazarlo:

- **Toda firma se compara en tiempo constante** (`timingSafeEqual`): Stripe,
  Mercado Pago, HubSpot, correo entrante, cron, TOTP, contraseñas y el secreto
  de cliente de OAuth. Una comparación con `===` filtra el secreto byte a byte.
- **Todo destino que elige el usuario pasa por `src/lib/ssrf.ts`.** La IP se
  valida en el momento de abrir el socket (`guardedLookup` dentro del dispatcher
  de undici), no antes: validar y luego conectar deja una ventana de DNS
  rebinding. Nunca se sigue una redirección —un 302 hacia `169.254.169.254`
  evadiría cualquier validación previa— y el cuerpo se acota. Aplica a webhooks
  salientes, a la acción HTTP de Workflows y a los servidores MCP remotos.
- **OAuth de Cord**: PKCE S256 (`plain` no se acepta), `redirect_uri` con
  coincidencia EXACTA contra lo registrado, código de 5 minutos y un solo uso
  resuelto en una sola sentencia, secreto de cliente guardado como hash, access
  de 1 h y refresh rotatorio de 180 días. El **reuso de un refresh ya rotado
  revoca la conexión entera** fuera de una ventana de gracia de 30 s
  (RFC 9700 §4.14.2) y avisa a operaciones; dentro de la ventana solo se rechaza,
  para no castigar el reintento de un cliente que no recibió la respuesta.
- **CSRF cerrado por defecto**: toda escritura exige `Origin` del mismo origen,
  incluso sin el header, y la lista de exenciones vive en `csrf-policy.ts` — solo
  entra ahí un carril cuya credencial es una firma o un token portador, nunca una
  cookie. La CSP de `/oauth/authorize` se amplía con un header que pone el propio
  servidor en la RESPUESTA y se borra antes de salir: el navegador no puede
  fijarlo.
- **Rate limit con dos carriles**: `strictRateLimit` falla CERRADO en superficies
  privilegiadas y de dinero (incluido el carril público de pago, con componente
  de IP); `rateLimit` protege el resto y degrada a un contador local solo si ni
  Upstash ni Neon responden.
- **Ningún secreto sale de la base**: tokens de integración cifrados
  (`crypto-secret.ts`), secretos de webhook enmascarados al listarlos, el token
  de un servidor MCP se muestra como `••••••`, el export de la organización
  excluye las columnas `*_enc` y los logs guardan el estado HTTP, nunca el valor.
- **Datos ajenos escapados en cada destino**: HTML en los correos, `escapeSlack`
  en Slack (un nombre de cliente con `<url|texto>` llegaría como enlace al canal
  del vendedor) y el texto de Teams viaja como campo de una tarjeta.
- **Workflows con techo**: profundidad máxima de cadena, anidamiento acotado,
  200 pasos por ejecución, límite por acción (`strictRateLimit`), el correo al
  cliente consume la cuota del plan y solo puede escribirle al cliente del
  documento — no a una dirección arbitraria.

## Pendiente

El checklist completo, app por app (qué está hecho, qué falta, quién y qué lo
bloquea), vive en [`pendientes-integraciones.md`](pendientes-integraciones.md). En
corto, al 2026-09-21:

- **HubSpot:** ficha del marketplace (3 instalaciones ajenas).
- **Zapier, Make y Slack:** en producción; faltan los directorios públicos y
  probar Make desde otra zona.
- **n8n:** esperando la verificación de n8n para n8n Cloud.
- **Teams:** app registrada y credenciales puestas; falta la prueba real de punta a
  punta y la verificación de editor.
- **WhatsApp:** prueba con número real y registro integrado de Meta.
- **Mercado Pago:** en producción en México; faltan el pago real de prueba, renovar
  credenciales expuestas, confirmar otros países, facturas y reembolsos.
