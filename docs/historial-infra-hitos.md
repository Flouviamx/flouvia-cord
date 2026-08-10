# Historial — Infraestructura, migraciones e hitos

> Migración de dominio, fixes de schema/RLS, auditorías de seguridad/escala, hitos
> fundacionales del proyecto, y notas de "listo para producción". Extraído de
> `historial.md`. Orden: más reciente arriba.

---

✅ **Cord Ops preparado para 10k+ usuarios y tablas de millones de filas (ago 2026)** —
   se eliminó el patrón inicial de cargar hasta 200 registros y ejecutar cuatro a siete
   subconsultas correlacionadas por cada fila visible. `/ops/users` y
   `/ops/organizations` ahora usan páginas SSR de 50, búsqueda GET persistente y CTEs
   que agregan sesiones, passkeys, membresías, clientes, productos y cotizaciones solo
   para los ids de la página actual. Los totales provienen de `count(*) over()` y las
   páginas fuera de rango regresan limpiamente al inicio.
   • `/ops/usage` dejó de descargar todas las organizaciones y de construir un `<select>`
     gigante. Se dividió en cuatro consultas con responsabilidades separadas: totales
     globales, resumen de proveedores, inbox SQL de las 50 organizaciones con mayor
     riesgo y una página de 50 organizaciones con agregados limitados a sus ids. El
     filtro ahora busca en servidor y los links de detalle conservan el filtro exacto
     por UUID. Esto evita que la vista crezca linealmente en HTML y en número de queries.
   • `/ops/security` pagina la auditoría privilegiada a 50 y acota las señales de
     identidad; las fichas de usuario/organización conservan conteos exactos pero limitan
     listas históricas (sesiones, equipo, llaves, webhooks y SSO) a ventanas recientes.
   • El explorador genérico cambió de `LIMIT/OFFSET + COUNT(*)` a keyset pagination con
     cursor estable sobre `created_at/id`. “Siguiente” conserva costo constante aun en
     tablas grandes, el total se toma de `pg_class.reltuples` como estimación y la
     búsqueda se restringe a un máximo de seis columnas identificadoras no sensibles.
   • `db/schema.sql` habilita `pg_trgm` y agrega índices idempotentes para búsquedas de
     nombre/correo, orden cronológico, sesiones, membresías, actividad comercial,
     ventanas de API/webhooks/proveedores/cobros y targets de auditoría. La migración se
     aplicó a Neon sin modificar filas de negocio.
   • Verificación: build de producción completo; smoke SSR autenticado real contra Neon
     en usuarios, búsqueda, organizaciones, uso, seguridad y explorador (seis respuestas
     200, sin errores); la sesión aislada de prueba se eliminó al terminar. La BD quedó
     con 2 usuarios, 4 organizaciones y 1 sesión Ops real. Esto valida la arquitectura e
     índices instalados; no pretende ser una prueba de carga sintética de 10k usuarios.

✅ **Auditoría de "listo para producción" + 4 bugs de dinero/seguridad corregidos
   (jul 2026)** — André pidió un mapeo completo de la app para salir a producción el
   mismo día ("qué falta, qué está mal conectado"). Se verificó el estado REAL contra
   Neon/Stripe/Clerk (no solo el código): build limpio, schema sin drift (32 tablas +
   101 columnas, RLS/FORCE ok), 14 orgs reales en MX, Stripe Connect Custom YA
   aprobado en LIVE (1 cuenta con `charges_enabled`), y — al revisar los webhooks de
   Stripe con la API — se confirmó que **el webhook de "eventos en cuentas
   conectadas" que varias entradas anteriores de este archivo marcaban como
   pendiente YA EXISTÍA** (`application: ca_...`, con `payment_intent.succeeded` +
   `invoice.paid` + `customer.subscription.*`) — la nota de "pendiente" en esas
   entradas quedó obsoleta, este gap ya estaba cerrado antes de esta sesión.
   • **Bug de dinero real — se podía marcar `invoiced` sin haber facturado de
     verdad:** en `PATCH /api/cotizaciones/[id].ts`, el flip de status a `invoiced`
     y el `reportUsage(orgId,'timbrado',1)` corrían **ANTES** de que
     `emitFiscalDocument()` confirmara que el PAC (Facturapi) había timbrado
     correctamente — si el proveedor fallaba, la cotización igual quedaba marcada
     como facturada y se cobraba el folio de timbrado sin que existiera ningún CFDI
     real. Corregido: la emisión fiscal ahora corre PRIMERO; si `fiscal.emitted`
     es `false` el endpoint devuelve 502 sin tocar el status ni cobrar el folio.
   • **`USInvoiceProvider` fingía éxito:** devolvía `success:true` con un folio y
     un PDF **inventados** (`/invoices/pdf/ejemplo_us.pdf`, ni siquiera existe) —
     una org en EE.UU. veía su cotización "facturada" sin ningún documento fiscal
     real detrás. Reescrito para devolver `success:false` con mensaje honesto
     ("todavía no disponible para EE.UU."); combinado con el fix de arriba, la
     cotización nunca llega a `invoiced` en ese caso.
   • **Selector de país — decisión final:** se evaluó restringir el alta a solo
     México (dado que `FiscalFactory` solo tiene un proveedor real) pero André
     pidió mantener abiertos TODOS los países (MX/US/CO/AR/CL/PE/ES) — cotizar,
     cobrar y el CRM funcionan igual en cualquiera; lo único limitado a México es
     la FACTURACIÓN fiscal real. Se implementó ese límite de forma visible en 3
     lugares en vez de bloquear el alta: (1) **Ajustes › Fiscal** muestra un aviso
     ámbar y atenúa los bloques de CSD/timbrado cuando `orgs.country_code !== 'MX'`
     (nueva columna expuesta en `getOrg()` → `ORG.countryCode`); (2) el detalle de
     cotización oculta el botón "Timbrar CFDI 4.0" para orgs no-MX y muestra
     "Facturación fiscal — próximamente en tu país" en su lugar; (3) el backend
     (`FiscalFactory`/`emitFiscalDocument`) ya degradaba honesto a status `error`
     para países sin proveedor — ahora nunca deja pasar un flip a `invoiced` sin
     éxito real (mismo fix del punto anterior).
   • **"Exigir 2FA al equipo" pasó de guardar-sin-aplicar a enforcement real:** el
     toggle de `orgs.require_2fa` (Ajustes › Seguridad) solo se guardaba en BD —
     cero verificación en ningún lado, dando una falsa sensación de seguridad (una
     org lo tenía prendido creyendo estar protegida). Gate nuevo en
     `AppLayout.astro`: si la org exige 2FA y el usuario de la sesión NO lo tiene
     activo en Clerk (`clerkClient(Astro).users.getUser(uid).twoFactorEnabled`),
     se redirige a `/app/ajustes/cuenta?require2fa=1` — la ÚNICA salida permitida
     (junto con `/app/ajustes/seguridad`, para que el dueño pueda apagar el
     requisito si no quiere activar 2FA ahora mismo); nunca un bloqueo total sin
     escape. La llamada a Clerk solo ocurre cuando `ORG.require2fa` es `true`
     (la inmensa mayoría de orgs no paga ese costo extra por request). Aviso
     visible nuevo en `cuenta.astro` cuando llega por ese redirect, explicando por
     qué. Fail-open a propósito si Clerk falla (no se bloquea el acceso).
   • **Bug real en los correos de CRON — link roto tipo "Vercel":** `cron/
     recordatorios.ts` y `cron/cobranza.ts` armaban el link público con
     `new URL(request.url).origin` — pero cuando el CRON de Vercel dispara la
     request (no un navegador), ese origin resuelve a la URL INTERNA del
     deployment (`https://flouvia-cord-xxxx.vercel.app`), no a `cordhq.app`. Los
     recordatorios de cobro salían con un link roto/feo. Fix: helper nuevo
     `siteOrigin()` en `src/lib/email.ts` (lee `PUBLIC_SITE_URL`, default
     `https://cordhq.app`) usado en ambos crons — los endpoints disparados por el
     navegador del vendedor (enviar cotización, etc.) NO tenían este bug, su
     `origin` ya resolvía bien. De paso, `cron/recordatorios.ts` (texto plano, sin
     marca) se reescribió con la MISMA plantilla de `notifyQuoteSent`/`cron/
     cobranza.ts` (logo, color de marca de la org, botón pill) — antes era el
     único correo transaccional sin ese diseño.
   • **`og-cord.png` generado** (confirmado 404 en prod desde la auditoría SEO de
     una sesión anterior, ver [[cord-seo-ai-seo-audit-pattern]]): tarjeta OG
     1200×630 renderizada con Playwright (HTML/CSS propio, navy + logo real +
     tagline + 3 badges de confianza — mismo lenguaje visual que el resto del
     sitio) en vez de dejarla para diseño manual. Ya vive en `public/og-cord.png`.
   • **Cobranza con IA desactivada por seguridad operativa (dato, no código):**
     la auditoría encontró 2 orgs reales con `ai_cobranza_activa=true` y el cron
     agendado a diario — se desactivó el flag en esas 2 orgs directo en Neon para
     no mandar correos de cobranza automáticos sin que el dueño lo supiera de
     nuevo; reactivable desde Ajustes › Agentes IA cuando se quiera.
   • **Webhook de Stripe — evento faltante agregado vía API:** el endpoint de
     PLATAFORMA (distinto del de Connect, ver arriba) le faltaba
     `customer.subscription.updated` — sin él, un cambio de plan hecho desde el
     Customer Portal no sincronizaba `orgs.plan`. Agregado con la `sk_live_` ya
     configurada (no requirió tocar el dashboard).
   ⚠️ **Pendiente, dejado a propósito:** `FACTURAPI_USER_KEY` (CSD por org) —
     André prefiere esperar a tener usuarios reales antes de contratar el plan de
     Facturapi que la habilita; Upstash (rate-limit durable) — pendiente de
     provisionar manualmente desde Vercel Marketplace (la CLI de este entorno
     estaba autenticada con una cuenta/equipo de Vercel distinta al proyecto real
     de Cord, así que no se pudo hacer desde la sesión).
   • Verificado: 2 builds limpios tras cada tanda de cambios; estado de Stripe/
     Clerk/Facturapi confirmado con sus APIs reales (no solo inspección de
     código) antes de dar cualquier hallazgo por bueno.

✅ **Ruteo de subdominios `dev.cordhq.app`/`docs.cordhq.app` arreglado + link a Docs en
   nav/producto (jul 2026)** — André había agregado los subdominios `dev.cordhq.app`
   (dev blog) y `docs.cordhq.app` (documentación) pero ambos mostraban la landing normal
   en su raíz. Causa raíz DOBLE:
   • **`index.astro` era `prerender = true`:** en modo `server`, una página prerender se
     sirve como HTML estático desde el edge de Vercel y **salta el middleware por
     completo** — el rewrite por host (`subdomainRewrite` en `src/middleware.ts`, ya
     existente) nunca corría en la raíz "/". Fix: `index.astro` ya NO es prerender (pasa
     por SSR; no hace queries, sin costo real).
   • **Doble sistema peleándose:** `vercel.json` tenía `rewrites`/`redirects` de
     subdominio que chocaban con la lógica del middleware — 500 en sub-paths del
     dev-blog, bucle 301 infinito en sub-paths de docs. Se limpió `vercel.json` (solo
     quedan los `crons`) y `src/middleware.ts` quedó como **único dueño** del ruteo de
     subdominios: reescritura idempotente y a prueba de bucles (guarda `/prefijo`, `/_*`
     y `/404` para no re-reescribir). De paso se quitó el redirect muerto de
     `cord.flouvia.com` (dominio viejo, ya no existe — confirmado por André).
   • **Bug real #1 encontrado al destapar el ruteo — 500 en TODO el dev-blog:** los
     componentes React del dev-blog (`PixelDevs`, `PixelIcon`, `DevConsole`, etc.) se
     montan con `client:load` (no `client:only`), así que Astro también los renderiza en
     SSR e importa `gsap` en el servidor. `gsap` se publica como ESM puro y el bundle
     serverless de Vercel lo cargaba como CommonJS → `SyntaxError: Cannot use import
     statement outside a module`. Invisible en `npm run dev` (Vite maneja ESM nativo) —
     el bug era EXCLUSIVO de producción. Fix: `gsap` agregado a `vite.ssr.noExternal` en
     `astro.config.mjs` (mismo patrón ya usado para `@modelcontextprotocol/sdk`).
   • **Bug real #2 — artículos del dev-blog renderizaban bien pero con status 404:**
     Astro fija el status HTTP según si el path ORIGINAL matchea una ruta del árbol
     principal, en una capa POR ENCIMA del middleware — un path raíz-limpio como
     `/building-...` no matchea ninguna ruta → 404 aunque el rewrite sirviera el
     artículo real (malo para SEO/crawlers). Se probó `context.rewrite()`,
     `next(payload)` y envolver la `Response` en `new Response(body,{status:200})`:
     ninguno lo corrige desde el middleware. **Solución real:** los links del dev-blog
     (`devBase` en `DevBlogLayout.astro`/`index.astro`/`blog.astro`) ya NO son
     condicionales a `import.meta.env.DEV` — ahora SIEMPRE llevan el prefijo
     `/dev-blog/*`, igual que ya hacía `docs` con `/docs/*`. Un path con prefijo SÍ
     matchea ruta → 200 nativo. La raíz `dev.cordhq.app/` sigue mostrando el home en
     200 (el rewrite `/` → `/dev-blog` matchea `index`).
   • **Link a Documentación agregado (nav + contextual), como Stripe separa Docs de
     Support:** ítem "Documentación" nuevo en el megamenú **Recursos** (desktop, junto a
     "Centro de ayuda") y su acordeón móvil, apuntando a `docs.cordhq.app`. Además, cada
     una de las 13 páginas de `/producto/[slug]` ganó una fila de cross-link
     "Documentación" al final (mapa `DOCS_PATH` en `[slug].astro`, apuntando a la
     sub-sección real de docs relevante a esa feature — verificado contra los slugs
     reales de `src/content/docs/{es,en}/`, no inventados).
   • **Bug real #3 encontrado al agregar los links — redirect recortaba el prefijo:** el
     redirect `cordhq.app/docs/*` → `docs.cordhq.app` en el middleware recortaba el
     prefijo `/docs` del destino; un deep link nuevo como
     `cordhq.app/docs/pagos/resumen` habría caído en `docs.cordhq.app/pagos/resumen`
     (SIN prefijo) → el mismo falso-404 del bug #2. Corregido para PRESERVAR el path
     completo en el destino del redirect.
   • Verificado en producción con status codes reales (no solo visualmente): las raíces
     y sub-páginas de ambos subdominios dan 200, el dominio principal (`cordhq.app` +
     `/precios` + `/producto/*`) sigue 200 sin regresión, y los redirects
     `cordhq.app/dev-blog|/docs` → subdominio dan 301 con destino correcto.
   ⚠️ **Regla a futuro (documentada también en memoria del proyecto):** (1) una página
     que sirve la RAÍZ de un subdominio nunca puede ser `prerender = true`. (2) el
     ruteo de subdominios vive SOLO en `src/middleware.ts` — no volver a agregar
     rewrites/redirects de subdominio en `vercel.json`. (3) cualquier lib ESM-pura
     importada en SSR vía un componente `client:load` (no `client:only`) necesita
     `vite.ssr.noExternal`. (4) los links internos de contenido servido por subdominio
     SIEMPRE llevan su propio prefijo (`/dev-blog/*`, `/docs/*`) — nunca URLs limpias a
     nivel raíz, o el status HTTP sale 404 aunque el contenido se vea bien.

✅ **Migración de dominio: `cord.flouvia.com` → `cordhq.app` (jul 2026)** — André compró
   `cordhq.app` (dominio propio, ya no subdominio de flouvia.com) y decidió migrar Cord ahí
   de forma completa e inmediata.
   • **Código (83 archivos, hecho por el agente):** reemplazo mecánico de
     `cord.flouvia.com` → `cordhq.app` en TODO el repo — `astro.config.mjs` (`site`),
     `.env.example`, `public/robots.txt`/`llms.txt`/`openapi.yaml`, `src/pages/sitemap.xml.ts`,
     CLAUDE.md + los 5 `docs/*.md`, README.md, GEMINI.md, todas las páginas/componentes/API
     routes de `src/`, los 132 artículos de soporte ES/EN, y el paquete `@flouviahq/elements`
     (`config.ts` `DEFAULT_ORIGIN`, `package.json` `homepage`). Se dejaron intactas
     deliberadamente las referencias reales a `flouvia.com` (footer "hecho por Flouvia",
     `hola@/soporte@/legal@flouvia.com`, JSON-LD `Organization` de Flouvia) — esas siguen
     siendo el dominio correcto de la empresa matriz, no de Cord.
   • **Verificación SEO/AI-SEO:** `npm run build` limpio + grep sobre el **HTML generado**
     en `.vercel/output/static` (no solo el código fuente) confirmó **0 referencias** al
     dominio viejo en ninguna de las ~230+ páginas estáticas — canonical, `og:url`,
     hreflang ES/EN, JSON-LD y `sitemap.xml` ya leen `cordhq.app` en el 100% del sitio.
     Sigue el patrón de auditoría ya documentado (ver [[cord-seo-ai-seo-audit-pattern]]).
   • **Clerk (config manual de André, completada):** dominio de producción reconfigurado a
     `cordhq.app` en el dashboard — nuevo publishable key `pk_live_...Y29yZGhxLmFwcCQ`
     (verificado por API: `clerk.cordhq.app`/`accounts.cordhq.app` con DNS y SSL OK). El
     agente actualizó `PUBLIC_CLERK_PUBLISHABLE_KEY` en `.env` local (el `CLERK_SECRET_KEY`
     NO cambia — es el mismo instance, solo cambia el Frontend API domain). André completó
     el resto: la misma env var en Vercel + redeploy, y el webhook de Clerk
     (`/api/clerk/webhook`) reapuntado a `cordhq.app` en el dashboard (Svix).
   • **Stripe (config manual de André, completada):** los DOS webhooks (el de plataforma y
     el de "eventos en cuentas conectadas") reapuntados a `https://cordhq.app/api/stripe/webhook`
     en el dashboard. `STRIPE_CONNECT_WEBHOOK_SECRET` confirmado presente en Vercel (vivía
     solo ahí, nunca se había bajado al `.env` local — por eso una auditoría rápida del
     `.env` local no lo veía). Las URLs de éxito/cancelación de Checkout (`subscribe.ts`,
     `portal.ts`, `checkout.ts`) NO necesitaron tocarse — ya se construyen dinámicamente
     desde `new URL(request.url).origin`, nunca hardcodeadas.
   • **Vercel:** dominio de producción del proyecto movido a `cordhq.app` + env vars
     sincronizadas — hecho por André.
   • **Sin cambios en Neon/BD:** se confirmó que ninguna tabla almacena el dominio propio de
     Cord — `orgs.embed_domains` es la allowlist de dominios DE CADA CLIENTE (para el CSP
     del embed de Cord Elements), no el dominio de Cord. Cero migraciones.
   • **Facturapi/Resend:** sin cambios — Facturapi es solo integración saliente (sin webhook
     de vuelta a Cord) y el dominio remitente verificado en Resend sigue siendo
     `flouvia.com` (correos transaccionales), no se vio afectado.
   Los ajustes cosméticos de Stripe (Customer Portal, Branding, Business → Public details,
   Connect → Platform profile) también quedaron actualizados a `cordhq.app`.
   • **Bug encontrado tras el cambio — login con Google roto (`redirect_uri_mismatch`):**
     el botón "Continuar con Google" usa credenciales OAuth PROPIAS de Cord (Google Cloud
     Client ID `478617056813-nqstalbgn3sa8lij1i5ht0t4jaa3j1ie...`, confirmado vía
     `clerk config pull --instance prod` → `connection_oauth_google`), no las credenciales
     compartidas de Clerk — por eso el chequeo `clerk deploy status` (que solo valida que
     Clerk tenga credenciales configuradas) reportaba `oauth.complete: true` aunque el login
     real estaba roto: Google seguía teniendo registrado el redirect URI del dominio viejo
     (`clerk.cord.flouvia.com/v1/oauth_callback`) y rechazaba la solicitud. Fix: en Google
     Cloud Console (cuenta `hola@flouvia.com`) → Credentials → ese OAuth Client → se agregó
     `https://clerk.cordhq.app/v1/oauth_callback` a "Authorized redirect URIs" y
     `https://cordhq.app`/`https://clerk.cordhq.app` a "Authorized JavaScript origins".
     Sin cambios en Clerk (mismo client_id/secret). **Migración 100% completa**, sin
     pendientes.
   ⚠️ **Regla a futuro:** si Cord usa credenciales OAuth propias para un proveedor social
     (no las compartidas de Clerk), un cambio de dominio SIEMPRE requiere actualizar el
     redirect URI en la consola de ese proveedor (Google/GitHub/etc.) — `clerk deploy
     status` NO detecta esto, solo confirma que existan credenciales, no que el redirect
     URI esté vigente. Verificar el `client_id` real vía `clerk config pull` para saber si
     es custom (requiere este paso) o compartido de Clerk (no lo requiere). si el dominio vuelve a cambiar, repetir este mismo patrón — grep
     mecánico del dominio viejo en TODO el repo (no solo `src/`), verificar contra el HTML
     del BUILD (no el código fuente ni `npm run dev`), y los 3 sistemas externos a
     reconfigurar manualmente son siempre los mismos: Clerk (dominio + webhook), Stripe
     (2 webhooks + branding/portal), Vercel (dominio del proyecto + env vars).

✅ Esqueleto Astro + tokens de diseño
✅ **Landing de ventas completa** (estilo Stripe/Linear con ADN Flouvia) — desplegada
✅ **Logos reales** en `public/imgs/`: `logo-cord-navy.png` (fondos claros) y `logo-cord-white.png` (fondos oscuros) — recortados a 780×300
✅ **App demo completa con datos mock** — dashboard, cotizaciones (lista + editor interactivo + detalle), clientes, productos, ajustes, link público `/q/{token}`
✅ **Clerk conectado** — `/login` y `/registro` con componentes reales (es-MX); falta proteger `/app`
✅ **Neon conectado** — la app lee/escribe real (`src/lib/queries.ts`, org demo `demo-user`)
✅ **Páginas de producto** `/producto/*` (5) + `/soluciones` — estilo Stripe, animaciones compartidas en `PageAnims.astro`
✅ **App funcional (jun 2026)** — CRUD de clientes/productos (modales), ajustes que guardan,
   acciones de cotización (enviar/aprobar/rechazar/pago/facturar), aprobar/rechazar REAL
   en `/q/[token]`, PDF imprimible personalizado por cuenta (`/app/cotizaciones/[id]/imprimir`)

✅ **Audit log inmutable** — tabla `audit_log` + helper `logAudit()`/`reqIp()` en db.ts;
   instrumentados org/cotizaciones/clientes/productos; vista de solo-lectura en Ajustes.

✅ **RLS — Row Level Security en base de datos (jun 2026)** — defensa en profundidad a
   nivel de Neon/PostgreSQL. `ENABLE ROW LEVEL SECURITY` en 18 tablas (SIN `FORCE` por
   ahora: el rol dueño bypasea, lo que permite que `getActiveOrgId()` haga bootstrap sin
   contexto de org establecido). Políticas en `db/schema.sql` al final. Dos helpers en
   `src/lib/db.ts`:
   • `withOrgTx(orgId, ...queries)` — setea `app.org_id` vía `set_config(..., true)`
     (LOCAL a la transacción) y ejecuta todos los queries en **un solo batch HTTP** de
     Neon (`sql.transaction([...])`). Satisface RLS + reduce roundtrips.
   • `withPublicToken(token, ...queries)` — igual pero setea `app.public_token`; usado
     en `/q/[token]` donde no hay org_id de sesión.
   `queries.ts` completamente migrado: funciones multi-tenant usan `withOrgTx`; el link
   público usa `withPublicToken`; tablas sin FORCE (`orgs`, `org_members`) siguen con
   queries directas. Política especial en `cotizaciones`: permite acceso por `org_id` OR
   por `public_token`. Fail-closed: si `app.org_id` no está seteado → ninguna fila
   visible. Se agregó `FORCE ROW LEVEL SECURITY` a las tablas porque los handlers de
   `/api/*` y helpers ya usan `withOrgTx`.

✅ **Vercel Analytics (jun 2026)** — `@vercel/analytics` instalado; componente `<Analytics />`
   montado en `Layout.astro` (landing) y `AppLayout.astro` (app). Page views y eventos se
   recopilan automáticamente en el dashboard de Vercel sin configuración adicional.

✅ **Cableado real de features "andamiaje" (jun 2026)** — auditoría que conectó al
   flujo real varias features que existían como tablas+clases pero NO se invocaban:
   • **Fix de dependencia (zod):** `@modelcontextprotocol/sdk` rompía en runtime por
     `zod@4.1.11` con la carpeta de compat `/v3/` ESM incompleta (faltaba `util.js`).
     Solución: `"overrides": { "zod": "4.4.3" }` en `package.json` + `vite.ssr.noExternal:
     ['@modelcontextprotocol/sdk']` en `astro.config.mjs`. ⚠️ El **build de prod no se
     afecta**, pero `npm ci` desde el lockfile puede romper el DEV de Vite (error
     "reading 'call'" en todos los `.astro`/`.ts`); la instalación que funciona en dev es
     `npm install` (regenera lockfile). Si truena: `rm -rf node_modules package-lock.json
     node_modules/.vite .astro && npm install`.
   • **Abstracción fiscal CABLEADA:** `src/lib/fiscal/emit.ts` junta datos (org/cliente/
     items/totales/país), enruta por `FiscalFactory` y registra en `documentos_fiscales`.
     Enganchado en la acción `invoiced` de `/api/cotizaciones/[id]`. `MexicoSatProvider`
     ahora timbra REAL vía **Facturapi** si `FACTURAPI_API_KEY` está seteada (sk_test_/
     sk_live_); si no, devuelve respuesta marcada `provider_data.simulado=true` (honesto).
     El PDF/XML se sirven por el proxy `/api/cotizaciones/[id]/cfdi?type=pdf|xml` (Facturapi
     no da URLs públicas). UI de documentos fiscales en el detalle (`getDocumentosFiscales`).
   • **FX REAL + multi-divisa cableada:** `FXService` hace fetch a Frankfurter (BCE, sin
     key) con fallback a mock; conectado a `createCotizacion` (puebla `base_currency`/
     `fiscal_currency`/`fx_rate`/`fx_locked_until`). Endpoint `/api/fx/quote` (preview) +
     selector de divisa/buffer/preview en vivo en el editor `/nueva`.
   • **MCP entrante SEGURO:** `/api/mcp/sse` valida la API key con `authApiKey` (antes
     `Bearer x` daba acceso total) y guarda el `orgId` en la sesión; `/api/mcp/message`
     ejecuta las tools dentro de `reqContext.run({orgId})` (tenancy real por RLS).
   • **MCP saliente FUNCIONAL:** `ai-draft` pasa el `agenteId` del agente por defecto
     (`getDefaultAgentId` en `src/lib/agents/governance.ts`) — antes se instanciaba sin
     agente y nunca cargaba servidores; `client-manager` inyecta el `auth_token`, mapea el
     nombre REAL de la tool (`toolMap`) y cierra conexiones (`disconnectAll`).
   • **Gobernanza de agentes (UI):** `/app/ajustes/agentes` (Developers › "Agentes IA y
     MCP") — CRUD de `mcp_servers`, toggle "Permitir IA" por servidor (`agentes_permisos`,
     herramientas `["*"]`) y toggle de cobranza autónoma. API `/api/agentes`.
   • **Cobranza IA con opt-in:** columna `orgs.ai_cobranza_activa` (default false); el cron
     `/api/cron/cobranza` solo procesa orgs con el flag, está protegido por `CRON_SECRET`,
     **manda el correo de verdad** vía Resend y ya está agendado en `vercel.json` (diario
     16:00 UTC). Botón "Forzar ejecución" (acción `run_cobranza`). El AR agent (`ar-agent.ts`)
     usa `AI_MODEL || claude-opus-4-8` (antes modelo hardcodeado).
   • **Tesorería en el menú:** `/app/tesoreria/flujo` y `/app/tesoreria/cobranza` se
     reescribieron con el sistema de diseño de Cord (usaban clases TAILWIND inexistentes →
     se veían rotas) y se enlazaron en el sidebar (grupo "Tesorería IA"; CFO restaurado al
     grupo "Dinero").
   • **Conversación en vivo:** el endpoint de presencia devuelve `convCount`; el detalle
     muestra un banner "Hay mensajes nuevos · actualizar" cuando el cliente comenta (sin
     recargar solo). Sigue siendo polling (8s), no SSE.
   ⚠️ Correr `npm run db:migrate` (columna `orgs.ai_cobranza_activa`). Nueva env opcional:
   `PAC_API_URL` (endpoint del PAC; el timbrado es simulado sin ella).

✅ **FIX crítico de schema (jun 2026)** — varias columnas vivían SOLO en su `CREATE TABLE`
   y nunca se aplicaban en bases ya existentes (el `migrate` ignora "already exists"). Se
   re-declararon como `ALTER ... IF NOT EXISTS`: `cotizaciones.base_currency/fiscal_currency/
   fx_rate/fx_rate_source/fx_locked_until` (sin ellas `createCotizacion` tronaba) y
   `orgs.country_code` (sin ella `emit.ts`/facturar tronaba). **Regla a futuro:** toda
   columna nueva sobre una tabla existente va como `alter table … add column if not exists`,
   NUNCA editando el `create table`.

✅ **LISTO PARA PRODUCCIÓN (jun 2026)** — operativa verificada: DB de prod migrada; env vars
   en Vercel (`ANTHROPIC_API_KEY`, `RESEND_API_KEY`/`RESEND_FROM`, `CRON_SECRET`, DATABASE_URL,
   Clerk/Stripe live); webhooks de Stripe (`/api/stripe/webhook` + Customer Portal) y Clerk
   (`/api/clerk/webhook`) registrados; dominio de Resend verificado. Build y rutas sanas.

✅ **Toda la IA usa Haiku (jun 2026)** — decisión de André: TODO lo de IA corre con
   `claude-haiku-4-5-20251001` (configurable con `AI_MODEL`). Cableado: `ai-draft` (armar
   cotización), `ar-agent.ts` (cobranza autónoma) y `cashflow.ts` (AI CFO Insight de Tesorería).
   Antes `ar-agent` usaba opus y `cashflow` tenía hardcodeado `claude-3-5-sonnet-20241022` (modelo
   viejo, bug) — ambos corregidos. Regla a futuro: nada de IA hardcodea modelo; usar
   `process.env.AI_MODEL || 'claude-haiku-4-5-20251001'`.

⬜ Pendiente (no bloquea lanzamiento): `FACTURAPI_API_KEY` live en prod;
   `USInvoiceProvider` real (US); publicar `@flouviahq/elements` v0.2.0 (`npm login && npm
   publish`). Deuda menor: `/api/*` aún no migra a
   `withOrgTx` (pendiente para activar `FORCE ROW LEVEL SECURITY`); rate-limit del middleware es
   in-memory por instancia (para escala multi-réplica usar Upstash Redis); y 5 vulnerabilidades de
   `npm audit` de bajo riesgo (esbuild dev-Windows / path-to-regexp build-time) cuyo fix exige
   downgrade breaking de `@astrojs/vercel`.
