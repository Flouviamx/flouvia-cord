# Historial — Infraestructura, migraciones e hitos

> Migración de dominio, fixes de schema/RLS, auditorías de seguridad/escala, hitos
> fundacionales del proyecto, y notas de "listo para producción". Extraído de
> `historial.md`. Orden: más reciente arriba.

---

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
