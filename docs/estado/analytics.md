# Analytics de producto

> Contrato vigente de PostHog y Vercel Analytics. Las auditorías fechadas viven en
> [`historial/app-features.md`](../historial/app-features.md) y
> [`historial/infra-hitos.md`](../historial/infra-hitos.md).

## Proyecto

- Proyecto canónico: **Cord**, id **`535370`** (`us.posthog.com/project/535370`).
  Es el que apunta `PUBLIC_POSTHOG_KEY` en el repo y en Vercel.
- En la misma cuenta existe un proyecto vacío **"Flouvia" (`597277`)** en otra
  organización — un duplicado sin uso. **Ignóralo.** Las herramientas REST del MCP
  de PostHog resuelven a él por defecto; hay que `switch-project 535370` antes de
  cualquier operación.

## Catálogo de eventos — fuente única de verdad

**`src/lib/analytics-events.ts`** define los eventos de producto: nombre,
carril, superficie (`server`/`client`), ámbito (`org`/`user`), si es ingreso, de
qué propiedad sale el `$insert_id`, y `required`/`optional` tipados por evento.

De ese archivo salen:

- los **tipos** de `trackServer` / `trackUser` / `cordTrack` — un typo en el
  nombre del evento (`quote_aproved`) no compila, y la bolsa de propiedades se
  valida contra el catálogo;
- el universo que verifica **`npm run security:analytics`**
  (`scripts/analytics-contract-check.mjs`, encadenado en `test:payments`).

El check falla CI cuando: se captura un evento fuera del catálogo, una entrada
del catálogo se queda sin call site (candado anti "cayó en silencio"), un evento
de ingreso se emite sin clave de idempotencia, un `trackServer` olvida
`is_sandbox`/`is_demo`, o los helpers regresan a descartar el tráfico interno.
`node scripts/analytics-contract-check.mjs --taxonomy` vuelca el JSON para
sincronizar las descripciones de la taxonomía de PostHog desde el repo.

Contexto histórico: el 14 ago 2026 un cambio de política silenció TODOS los
eventos comerciales durante ~un mes sin que nada avisara. El catálogo + el check
son el candado para que no vuelva a pasar.

## Helpers

- **`trackServer<E>(event, orgId, props, isSandbox?, isDemo?)`**
  (`src/lib/posthog-server.ts`) — eventos a nivel ORGANIZACIÓN. `distinctId`
  sintético `organization:<id>`, grupo `company`, `$process_person_profile:false`.
  El `$insert_id` sale de la propiedad que el catálogo declara como
  `insertIdFrom` (`event_id` para casi todos; `payout_id`/`refund_id`/… para los
  eventos de Stripe cuyo id natural no es un UUID de Cord).
- **`trackPaymentReceived(...)`** — mismo contrato; `metadata.payment_id` es
  OBLIGATORIO a nivel de tipo (sin él un reintento de webhook de Stripe cuenta el
  ingreso dos veces).
- **`trackUser<E>(event, userId, props, ctx)`** — eventos de PERSONA (solo el
  registro). Conserva el perfil de persona para poder atribuir la adquisición
  (`$initial_utm_*`). En el callback de OAuth la org aún no existe, así que lo
  interno se resuelve por correo (`isInternalAnalyticsEmail`).
- **`window.cordTrack(event, props)`** — cliente. Definido en el bloque
  `<script is:inline>` de `Layout.astro` y `AppLayout.astro`. Islas React usan
  `src/lib/posthog.ts` (`trackEvent` no etiqueta sandbox/demo — preferir
  `cordTrack`).

## Privacidad y captura

- PostHog inicia con `opt_out_capturing_by_default: true`. No captura hasta que el
  visitante acepta el aviso de cookies de `src/components/CookieConsent.astro`,
  montado en `Layout.astro` y `AppLayout.astro`. La decisión vive en
  `localStorage['cord_cookie_consent']` y se comparte entre landing y app.
- **Localhost, `127.0.0.1`, `::1` y `npm run dev` no capturan** (server:
  `import.meta.env.DEV` en `posthog-server.ts`; cliente: guard de `hostname`). El
  kill switch privado server-side es `POSTHOG_DISABLE_CAPTURE`.
- **Tráfico interno del equipo de Cord: se ETIQUETA, no se descarta** (cambio
  set 2026, invierte la política anterior). `src/lib/analytics-internal.ts` usa
  `OPS_ALLOWED_EMAILS` como fuente única; los sandboxes heredan la clasificación
  de la organización padre.
  - Server: `trackServer`/`trackUser`/`trackPaymentReceived` mandan el evento con
    `is_internal: true` y marcan la org con `$internal_or_test_user` en el grupo
    `company` (`groupIdentify` memoizado).
  - Cliente: el navegador de Ops en producción manda `is_internal: true` +
    `$internal_or_test_user` en persona y grupo. La cookie `cord_analytics_internal`
    ya no apaga la captura: sólo mantiene el navegador etiquetado al volver a la
    landing sin sesión.
  - PostHog lo esconde de todos los insights vía la cohorte `444813`
    ("Internal / Test users") + los `test_account_filters` del proyecto por
    propiedad de evento (`is_internal`/`is_sandbox`/`is_demo` `is_not` true).
    `test_account_filters_default_checked = true`: los insights nuevos ya
    excluyen cuentas de prueba por defecto.
- No uses IP como identidad interna: cambia con VPN o red móvil.
- **Raspado de URLs**: el `before_send` de PostHog en ambos layouts pasa
  `$current_url`, `$referrer`, `$pathname` y `$set`/`$set_once` por `cordScrubUrl`
  — gemelo inline de `redactAnalyticsUrl()` (`src/lib/privacy-safe-analytics.ts`),
  reglas por `define:vars`. Quita tokens portadores (`/q/<token>`) y UUIDs de
  cliente antes de enviar. Paridad verificada en
  `test/privacy-safe-analytics.test.ts`. El proyecto también tiene
  `path_cleaning_filters` como defensa en profundidad.
- Vercel Analytics permanece separado para Web Vitals y no se gatea porque no usa
  cookies ni identifica al visitante. `privacidad.astro` (es/en) documenta PostHog
  y Resend como subencargados.

## Aha-moment y North Star

- **Aha-moment: primera cotización ENVIADA** (`quote_sent`, no `quote_created` —
  un borrador no es valor entregado).
- **North Star**: `landing → sign_up_completed → quote_sent → payment_received`.

## Embudo comercial canónico v2

```text
quote_created → quote_sent → quote_viewed → quote_approved
                                          → checkout_started → payment_received
             → quote_rejected  → quote_expired (cron)
```

Todos llevan `quote_id`, grupo `company`, flags `is_sandbox`/`is_demo`/`is_internal`
y monto/moneda cuando aplica. Semántica e idempotencia:

- `quote_viewed` ocurre solo en la primera transición `sent → viewed`
  (`markViewed()`, actor `client` — regla 19, nunca desde el SSR).
- `checkout_started` = PaymentIntent NUEVO; una reapertura es `checkout_resumed`.
  Vale para el link de la cotización (`/api/q/[token]/payment-intent`) y el de la
  factura (`/api/i/[token]/payment-intent`).
- `payment_received` se deduplica por `payment_id` y es la **única** fuente de
  ingreso confirmado por Stripe. `quote_marked_paid` es marcado manual y **nunca**
  se suma como ingreso.
- Los datos anteriores a v2 no se borran: usa el corte temporal o
  `analytics_version = 2`.

## Carril de facturas

Antes emitía CERO eventos. La emisión se ancla DENTRO de `logInvoiceEvent()`
(`src/lib/fiscal/timeline.ts`) — esa función ya marca cada transición del ciclo
de vida, así que "¿se nos olvidó una?" se responde leyendo un archivo:

```text
invoice_created → invoice_finalized → invoice_sent → invoice_viewed → invoice_paid
              invoice_voided        credit_note_created (si credit_note_of)
```

`invoice_paid` NO es revenue (el ingreso real lo declara `payment_received`, que
`settleInvoiceFromIntent` emite con `payment_kind: 'invoice'` sólo en el camino
`metadata.documento_id` — el camino `cotizacion_id` ya lo cuenta `markQuotePaid`).

## Dinero y suscripción

- `payment_received`, `payment_failed`, `refund_issued` (revenue negativo, dedup
  por `refund_id`), `dispute_created`, `payout_paid` — todos desde
  `src/pages/api/stripe/webhook.ts`, con dedup por `$insert_id` porque Stripe
  reintenta sus webhooks.
- `subscription_upgraded` / `subscription_downgraded` / `subscription_canceled`,
  `stripe_connect_activated`, `cfdi_first_timbrado`.

## Activación, adquisición y equipo

- `sign_up_completed` — server-side, cuenta nueva real tras verificar correo o
  primer OAuth/SAML, **no** en cada login. `sign_up_method`: `email`/`google`/
  `apple`/`saml`. Evento de PERSONA (`trackUser`).
- `onboarding_step_completed` (cliente) y `onboarding_completed` (**server-side**,
  `POST /api/onboarding/complete`, con firmografía: `industria`, `tamano_equipo`,
  `casos_uso`, `puesto`, `country_code`, `moneda`, `idioma`; `event_id = orgId`).
- `ai_draft_used` (editor de cotización y de factura, `surface: quote|invoice`),
  `kit_used`, `cobranza_ia_activated`, `api_key_created`.
- `team_member_invited`, `team_member_accepted`, `invite_viewed` (`/unirse/[token]`).
- `sso_login`.
- PostHog autocaptura `utm_*` en `$pageview` y persiste `$initial_utm_*` tras el
  primer `identify()`. Landing → registro → verificación es el mismo dominio, así
  que conserva el `distinct_id` anónimo.
- Group Analytics: `group('company', org_id, { plan, created_at, ... })`. Es un
  add-on de PostHog: confirma que esté contratado antes de esperar insights
  poblados por cuenta.

### Pendiente

- **`setup_step_completed`** — está en el catálogo pero en `SIN_CALL_SITE` del
  check con el motivo escrito: `getSetupProgress()` (`src/lib/queries.ts`) es una
  lectura por-página y necesita un marcador persistido de "ya emitido" (columna
  `orgs.setup_steps_emitted` o tabla propia) antes de cablearse.

## Documentación y demanda de contenido

`DocsLayout.astro` instrumenta el buscador vía `window.cordTrack`
(`trackDocsEvent` inyecta `page_path` + `language`):

- `docs_search_opened`, `docs_search_performed`, `docs_search_zero_results`,
  `docs_search_result_clicked`, `docs_feedback_submitted`.

La consulta se limita a 120 caracteres y sustituye correos y secuencias numéricas
largas antes de enviarse. Usa semanalmente `docs_search_zero_results` y las
páginas con mayor proporción de `helpful=false` como entrada al backlog editorial.
No interpretes una página sin eventos como "útil": puede ser falta de tráfico.

## Dashboards

Filtro por defecto `is_sandbox=false AND is_demo=false` en cada insight;
`payment_received` como única fuente de ingreso real. Suite existente:

Suite nueva (sep 2026 — carriles que los 6 tableros originales no cubrían):

- [Cobranza & Cuentas por Cobrar](https://us.posthog.com/project/535370/dashboard/2072425)
  — **`primary_dashboard`**. Ciclo de vida de la factura, tiempo de cobro (DSO
  proxy), North Star `registro → 1ª cotización enviada → pago`, señales de
  pérdida.
- [Mercados internacionales](https://us.posthog.com/project/535370/dashboard/2072623)
  — altas por `country_code`, ingreso por `currency`, funnel de conversión por
  país.
- [Salud de pagos](https://us.posthog.com/project/535370/dashboard/2072625)
  — `checkout_started → payment_received` por método, `payment_failed` por causa,
  monto de reembolsos y disputas.
- [Fiabilidad del producto](https://us.posthog.com/project/535370/dashboard/2072626)
  — `$exception` por tipo y por ruta, rageclicks y dead clicks. Core Web Vitals
  p75 viven en el dashboard nativo de Web Vitals.
- [Docs & deflexión de soporte](https://us.posthog.com/project/535370/dashboard/2072628)
  — búsquedas sin resultados, votos útil/no-útil, funnel búsqueda→clic.

Suite original:

- [Growth & Activation](https://us.posthog.com/project/535370/dashboard/1944817)
- [Revenue](https://us.posthog.com/project/535370/dashboard/1944818)
- [Core Funnel: Cotización a Cobro](https://us.posthog.com/project/535370/dashboard/1944819)
- [Account Health & Retention](https://us.posthog.com/project/535370/dashboard/1944820)
- [Feature Adoption](https://us.posthog.com/project/535370/dashboard/1944821)
- [Acquisition](https://us.posthog.com/project/535370/dashboard/1944822)

Muchos insights se crearon sin datos reales todavía: quedan validados como
consultas ejecutables, no como dashboards poblados. Si no reciben datos con
tráfico real, comprueba primero que `PUBLIC_POSTHOG_KEY`/`PUBLIC_POSTHOG_HOST`
en Vercel apunten a `535370`.

## Documentación pública

El catálogo incluye los cinco eventos ya emitidos por `DocsLayout.astro`:
`docs_search_opened`, `docs_search_performed`, `docs_search_zero_results`,
`docs_search_result_clicked` y `docs_feedback_submitted`. El contrato reconoce
`trackDocsEvent` y exige que conserve el reenvío a `cordTrack`, la página y el
idioma. No son eventos de ingreso; su registro en el catálogo no cambia la
política de consentimiento ni añade nuevas capturas.
