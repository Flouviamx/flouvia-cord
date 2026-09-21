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

## Slack

Incoming webhook por organización (`orgs.slack_webhook_url`). Lo consumen
`notify()` y la acción `slack_message` de los workflows.

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

Mientras la app de Zapier no tenga link de invitación
(`ZAPIER_INVITE_URL` en el catálogo), la tarjeta dice "Próximamente".

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

## Pendiente operativo

Nada de esto se resuelve con código:

- **HubSpot:** publicar la ficha del marketplace; pide 3 instalaciones activas de
  cuentas ajenas. La certificación exige 60 y 6 meses listado.
- **Zapier:** logo, persona administradora con correo del dominio, link de
  invitación y, para el directorio público, Zaps reales corriendo más una cuenta
  de prueba para sus revisores.
- **Make:** token de API con scopes `sdk-apps` para publicar la app, y después
  pedir la revisión.

Checklist paso a paso de Make y Zapier, y apps recomendadas para después:
[`pendientes-make-zapier.md`](pendientes-make-zapier.md).
