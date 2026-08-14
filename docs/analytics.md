# Analytics de producto

> Contrato vigente de PostHog y Vercel Analytics. Las auditorías fechadas viven en
> [`historial-app-features.md`](historial-app-features.md) y
> [`historial-infra-hitos.md`](historial-infra-hitos.md).

## Privacidad y captura

- PostHog inicia con `opt_out_capturing_by_default: true`. No captura hasta que el
  visitante acepta el aviso de cookies de `src/components/CookieConsent.astro`,
  montado en `Layout.astro` y `AppLayout.astro`.
- La decisión se guarda en `localStorage['cord_cookie_consent']` y se comparte
  entre landing y aplicación mediante `opt_in_capturing()` y
  `opt_out_capturing()`.
- Localhost, `127.0.0.1`, `::1` y `npm run dev` no inicializan captura. El kill
  switch privado es `POSTHOG_DISABLE_CAPTURE`.
- Los workspaces internos de Cord Ops se excluyen antes de inicializar o capturar.
  `src/lib/analytics-internal.ts` usa `OPS_ALLOWED_EMAILS` como fuente única; los
  sandboxes heredan la clasificación de la organización padre.
- Al entrar con Ops se persiste `cord_analytics_internal=1` para evitar que el
  mismo navegador genere después sesiones anónimas en la landing.
- No uses IP como identidad interna: cambia con VPN o red móvil y puede ser
  compartida.
- Vercel Analytics permanece separado para Web Vitals y no se gatea porque no usa
  cookies ni identifica al visitante.
- `privacidad.astro` en español e inglés documenta PostHog y Resend como
  subencargados y separa la política de cookies en tres categorías.

## Embudo comercial canónico v2

Los eventos comerciales canónicos se emiten desde backend y llevan
`analytics_version: 2`:

```text
quote_created → quote_sent → quote_viewed → quote_approved
                                          → checkout_started → payment_received
```

Todos llevan `quote_id`, grupo `company`, flags `is_sandbox`/`is_demo` y monto o
moneda cuando aplica.

Contratos de semántica e idempotencia:

- `quote_viewed` ocurre solo en la primera transición `sent → viewed`.
- `checkout_started` ocurre al crear un PaymentIntent; una reapertura es
  `checkout_resumed`.
- Los eventos críticos usan `$insert_id` estable.
- `payment_received` se deduplica por `payment_id` y es la única fuente de ingreso
  confirmado por Stripe.
- `quote_marked_paid` significa marcado manual y nunca se suma como ingreso real.
- Los datos anteriores no se borran. Para análisis posterior al despliegue usa el
  corte temporal correspondiente o `analytics_version = 2`.

## Activación, expansión y adquisición

También están instrumentados:

- `ai_draft_used`;
- `sign_up_completed`, emitido server-side para una cuenta nueva real tras
  verificación de correo o primer OAuth, no en cada login;
- `subscription_upgraded`, `subscription_downgraded`,
  `subscription_canceled`, `payment_failed`;
- `stripe_connect_activated`, `cfdi_first_timbrado`;
- `team_member_invited`, `team_member_accepted`;
- `api_key_created`, `cobranza_ia_activated`, `kit_used`.

PostHog autocaptura `utm_*` en `$pageview` y persiste `$initial_utm_*` después del
primer `identify()`. El flujo landing, registro y verificación permanece en el mismo
dominio, por lo que conserva el `distinct_id` anónimo.

Group Analytics usa `group('company', org_id, { plan, created_at, ... })` con el
`org_id` propio de Cord. Es un add-on de PostHog: confirma que esté contratado antes
de esperar insights poblados por cuenta.

## Dashboards

El proyecto PostHog "Cord" usa el id `535370`. La suite contiene 6 dashboards y
17 insights, con filtro por defecto `is_sandbox=false AND is_demo=false` y
`payment_received` como única fuente de ingreso real:

- [Growth & Activation](https://us.posthog.com/project/535370/dashboard/1944817)
- [Revenue](https://us.posthog.com/project/535370/dashboard/1944818)
- [Core Funnel: Cotización a Cobro](https://us.posthog.com/project/535370/dashboard/1944819)
- [Account Health & Retention](https://us.posthog.com/project/535370/dashboard/1944820)
- [Feature Adoption](https://us.posthog.com/project/535370/dashboard/1944821)
- [Acquisition](https://us.posthog.com/project/535370/dashboard/1944822)

Al construirlos, el proyecto conectado solo contenía cinco `$pageview` y ningún
evento comercial real. Los insights quedaron validados como consultas ejecutables,
no como dashboards ya poblados. Si no reciben datos con tráfico real, comprueba
primero que `PUBLIC_POSTHOG_KEY` y `PUBLIC_POSTHOG_HOST` en Vercel apunten a ese
mismo proyecto.
