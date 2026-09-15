# Integraciones y automatización

> Documento de estado actual: catálogo de apps, Cord Workflows y las apps de
> Cord en plataformas de terceros. Para decisiones fechadas, consulta
> [`../historial/platform-api.md`](../historial/platform-api.md).

## Directorio de apps

`src/lib/integraciones/catalogo.ts` es la fuente única: slug, nombre, dominio,
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

## Cord Workflows

Contrato completo en [`app-rutas.md`](app-rutas.md) y en el historial. Resumen:

- Disparadores: los eventos de `domain_events`.
- Pasos: acción, condición (operadores de lista cerrada, sin `eval`) y espera en
  días.
- Acciones: crear tarea, avisar al equipo por correo, mensaje a Slack y nota en
  HubSpot. Cada acción de marca declara su `brand`, que es lo que pinta su logo.
- Plantillas: `src/lib/workflows/templates.ts`, único origen de las ideas que se
  ofrecen en la lista, en el editor y en el detalle de cada integración.
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
