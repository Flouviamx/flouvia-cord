# Historial — Plataforma: API pública, MCP, Webhooks, Cord Elements

> API REST v1, servidor y cliente MCP, webhooks salientes, y el SDK `@flouviahq/elements`
> (Cord Elements) en todas sus fases. Extraído de `historial.md`. Orden: más reciente arriba.

---

✅ **Cord Elements v1.0.0 — rediseño mayor del SDK al nivel Stripe/Clerk (jul 2026)** —
   motivado por una integración real (cliente "El Zarco") que reveló que la mitad del
   contrato entre el SDK y la app no estaba conectado: 3 `@ts-ignore` por tipos
   incompletos, `CordBuilder.Items` reescrito a mano (286 líneas) porque los estilos
   inline no se podían sobreescribir, un botón "Abrir en pestaña nueva" porque el
   iframe perdía la marca sin `<CordProvider>`, datos de cliente perdidos en silencio,
   y `result.folio`/`result.token` siempre `undefined`. Mismo paquete de npm
   (`@flouviahq/elements`), mismo nombre — versiones sucesivas, no un paquete nuevo.
   Seis fases:
   • **Fase 0 — Tipos generados, no escritos:** `tsc --emitDeclarationOnly` reemplaza
     los `types/*.d.ts` escritos a mano (10 de 11 exports de `./react` no tenían tipo).
     Anti-deriva: `scripts/check-exports.mjs` + `api-report.json` committeado, comparan
     los exports reales del bundle contra un snapshot — falla si divergen. CI nueva en
     `.github/workflows/elements.yml` (`tsc` → build → check-exports → `attw` → `publint`).
     Bug de SSR encontrado y corregido: `class CordCotizadorElement extends HTMLElement`
     a nivel de módulo tronaba con `ReferenceError` al importar el paquete desde Node
     (sin DOM) — afectaba el entrypoint `.` completo.
   • **Fase 1 — Appearance de punta a punta:** nuevo `configureCord()` (config global
     estilo `loadStripe`), `theme: 'dark'/'auto'` real (antes tipado pero sin efecto),
     `<CordCotizador>` ya no truena sin `<CordProvider>` en el árbol (antes
     `useCordTranslations()` llamaba `useCordContext()`, que lanza sin Provider),
     appearance rancia corregida (el iframe no reaccionaba a cambios tras el primer
     render), 5 `baseUrl` hardcodeados unificados en `resolveOrigin()`/`resolveApiBase()`.
   • **Fase 2 — Clases estables + headless real:** inline styles reemplazados por
     clases `.cord-*` inyectadas dentro de `@layer cord` (Tailwind del consumidor
     siempre gana, sin `!important`); `appearance.elements` (override por elemento,
     patrón Clerk) y `appearance.baseTheme: 'none'` (headless total). Nuevo
     `useQuoteBuilder()` — el estado del Builder como hook standalone; `<CordBuilder>`
     pasa a ser un consumidor delgado de él (el patrón que El Zarco reconstruyó a
     mano ahora es de primera clase).
   • **Fase 3 — Contrato de datos:** el sobre `{ data }` que envuelve TODA respuesta
     de `/api/v1/*` nunca se desenvolvía — `result.folio` era SIEMPRE `undefined`, en
     el hook Y en el Server SDK, corregido. `CreateQuoteInput.cliente` — cotizar a un
     cliente nuevo con find-or-create acotado (solo crea, nunca actualiza; marca
     `origen: 'embed'` en la fila — nueva columna en `clientes`). Errores tipados
     (`CordError` con `.status`/`.code`). Eventos como unión discriminada (`CordEvent`)
     + `onViewed`/`onSigned`/`onItemComment` nuevos; el relay del embed omitía
     `cord:item_comment` (se perdía en silencio, corregido). `engine.ts`: `ivaPct`
     fuera de `[0,1]` ahora lanza `RangeError` en vez de un total silenciosamente
     incorrecto (este motor lo importa el servidor para dinero real).
   • **Fase 4 — pk_ vs proxy resuelto por tipos:** `CordProviderProps` es ahora una
     unión discriminada — pasar `publishableKey` y `proxyUrl` a la vez (el bug real de
     El Zarco: una `pk_` de prueba pegada junto a un proxy real) es error de
     compilación. `useCordClients()` es solo-proxy con error tipado y ruidoso
     (`code: 'clients_require_proxy'`) en modo publishable — antes hacía un fetch real
     que el servidor rechazaba con 403 en silencio. Los dos 404 de El Zarco (adivinar
     endpoints de catálogo/clientes cortando la URL de creación) desaparecieron.
   • **Fase 5 — Webhooks:** `constructEvent` devolvía `{ type, data, created }`
     (mentira — `evt.type`/`evt.created` SIEMPRE `undefined`; la forma real es
     `{ event, created_at, data }`, corregido). Doble firma anti-replay: header nuevo
     `X-Cord-Signature-V1` con timestamp, sin romper verificadores legacy que ya
     validan `X-Cord-Signature`. `constructEventAsync` con WebCrypto para runtimes
     edge (limitación documentada: el módulo entero sigue important `node:crypto`,
     así que un runtime sin ese built-in puede fallar al importar).
   • **Fase 6 — DX:** README reescrito contra el código real (el viejo documentaba
     `<CordEmbed />`, que no existe), CHANGELOG con tabla de migración a 1.0.0,
     ejemplo de referencia en `examples/nextjs-app-router/`. `'use client'` agregado a
     `react.tsx` (faltaba — rompía en Next.js App Router, Server Components por
     default). `postMessage(..., '*')` del embed ahora usa el `parentOrigin` real
     cuando coincide con la allowlist de `orgs.embed_domains` (mismo gate que ya
     protege `frame-ancestors`); `data-cord-cotizador`+`data-token` de `embed.js`
     unificado a `data-cord-token` (mismo vocabulario que Webflow), el par viejo
     queda como alias legacy.
   • **Publicado en npm** como `@flouviahq/elements@1.0.0` (login vía `npm login`,
     confirmación 2FA por navegador — la sesión CLI de esta conversación no pudo ver
     la URL de auth completa, quedó redactada por un filtro de seguridad del entorno).
   ⚠️ Para El Zarco (y cualquier otro consumidor): `npm update @flouviahq/elements`,
     borrar los 3 `@ts-ignore`, y revisar la tabla de migración del CHANGELOG del
     paquete — hay varios breaking changes documentados (`onEvent` de un solo
     argumento, sobre de respuesta, unión pk_/proxy).

✅ **Cord Elements — llaves publishable/secret + engine compartido + fixes de seguridad y dinero (jul 2026)** —
   pasada grande sobre `@flouviahq/elements` (`packages/elements/`) para acercarlo al nivel
   Stripe/Clerk Elements, hecha por André y verificada/corregida por auditoría.
   • **Modelo de llaves `pk_`/`sk_` real (como Stripe):** columna nueva `api_keys.type`
     (`secret` default | `publishable`). En Ajustes › Developers (`api.astro`) el modal de
     creación ahora tiene selector "Secreta (Backend)" vs "Pública (Frontend)"; las `pk_`
     se muestran con badge distinto en la tabla. `authApiKey` (`apikey.ts`) aplica un
     **scope estricto** a las `pk_` (pensadas para vivir expuestas en el navegador):
     solo `POST /api/v1/cotizaciones` (crear) y `GET /api/v1/productos` (catálogo,
     **sin el campo `costo`** — ver bug abajo); NUNCA `GET /cotizaciones` (cartera) ni
     nada de `/clientes` (CRM). Validación de `Origin`/`Referer` contra `orgs.embed_domains`
     que **falla-cerrado** para `pk_` (sin Origin → 403; antes era `if (origin) {...}`,
     un `curl` sin ese header se lo saltaba entero). Rate-limit propio más estricto
     (120/min `pk_` vs 600/min `sk_`). Al crear una `pk_` el scope se fuerza a `write`
     (antes nacía `read` y no podía hacer su único trabajo real: crear cotizaciones).
   • **Motor de cálculo compartido (`packages/elements/src/engine.ts`):** `num`/
     `sanitizeItem`/`calculateTotals` — la MISMA lógica de IVA/subtotal/total que usa
     `createCotizacion` (`src/lib/cotizaciones.ts`) y el `CordBuilder` nativo del SDK,
     para que dejen de poder divergir en los totales. El paquete lo re-exporta con tipos
     (`EngineItem`/`EngineItemInput`/`EngineTotals` agregados a mano en
     `packages/elements/types/index.d.ts`, que antes NO declaraba estos exports).
     ⚠️ **Paridad parcial:** `PATCH /api/cotizaciones/[id]` (editar) sí importa
     `sanitizeItem` del engine, pero `nueva.astro`/`editar.astro` (UI de la app) siguen
     con su cálculo inline propio — no es 100% una sola fuente de verdad todavía.
   • **Appearance API que SÍ llega al iframe:** antes `<CordProvider appearance>` solo
     tematizaba el `CordBuilder` nativo; el iframe (`<CordCotizador>`, el producto
     estrella) lo ignoraba. Ahora `core.ts` serializa `appearance` a un query param
     de `/embed/[token]`, que lo aplica a `QuoteCard`/`EmbedLayout` vía variables CSS
     `--cord-*` (color primario, texto, fondo, fuente).
   • **3 bugs reales encontrados y corregidos en esta misma pasada:**
     (1) **Dinero — doble división del subtotal:** al migrar `createCotizacion` al
     engine quedó `const realSubtotal = subtotal / (1 + ivaPct)` sobre un `subtotal`
     que el engine YA devolvía sin IVA — con `iva_incluido=true` el subtotal guardado
     quedaba mal (`subtotal + iva ≠ total`) y además rompía la paridad con `[id].ts`
     (editar), que sí calculaba bien. Fix: `const realSubtotal = subtotal` (el engine
     ya normaliza ambos casos). (2) **XSS reflejado en `/embed/[token]`:** el query
     param `appearance` se parseaba a CSS e inyectaba con `<style set:html={...}>`
     sin sanitizar — un valor con `</style><script>` rompía la etiqueta y ejecutaba JS
     en `cordhq.app`, alcanzable sin auth vía `/embed/demo?appearance=...`. Fix:
     whitelist de caracteres (`isSafe()` rechaza `< > { } ;`/`expression`/`javascript`/
     `vbscript`), nombres de propiedad saneados, soporte de `rules` (selectores CSS
     arbitrarios) eliminado, y las fuentes (`@import`) ahora solo cargan desde una
     allowlist de hosts (`fonts.googleapis.com`/`fonts.bunny.net`) — antes cualquier
     `https://` pasaba, permitiendo cargar una hoja de estilos externa arbitraria.
     (3) **La `pk_` filtraba el CRM completo y la cartera:** el primer intento de scope
     permitía `path.includes('/cotizaciones')` sin distinguir método (GET listaba TODAS
     las cotizaciones) y `GET /clientes` sin restricción — cualquiera que viera el
     código fuente de una página con una `pk_` expuesta podía leer el directorio de
     clientes (email/RFC/límite de crédito) y el pipeline completo. Ya arreglado (ver
     scope estricto arriba). Adicionalmente se encontró y cerró que `GET /productos`
     con `pk_` seguía filtrando `costo` (margen) del catálogo — el serializer ahora
     excluye ese campo cuando `auth.type === 'publishable'`.
   • **Housekeeping:** `packages/elements/src/engine.ts` vive DENTRO del paquete (no en
     `src/lib/`) para que `@flouviahq/elements` siga siendo self-contained/extraíble a
     su propio repo — la app lo importa desde `../../packages/elements/src/engine`, no
     al revés. Se quitó un `import { CordCotizadorElement } from './element'` sin usar
     en `react.tsx` que arriesgaba un crash en SSR de Next.js (`HTMLElement` no existe
     en Node; ese archivo hace `class ... extends HTMLElement` a nivel de módulo).
   ⚠️ Correr `npm run db:migrate` (columna `api_keys.type`).

✅ **Evolución de `@flouviahq/elements` a God-Level SDK (v0.5.0 y v0.6.0) (jul 2026)** —
   Se transformó la librería original (que solo era un wrapper de iframe) en una infraestructura financiera B2B nativa completa, al nivel de Stripe o Clerk:
   • **Patrón Compound (Slots):** El cotizador React (`<CordBuilder>`) dejó de ser una caja negra. Ahora expone componentes como `<CordBuilder.Header>`, `<CordBuilder.Config>`, `<CordBuilder.Items>` que el developer puede componer o reemplazar.
   • **Engine Nativo Avanzado:** Cálculos financieros en tiempo real. Soporte para `moneda` (MXN/USD), `terminos` (Contado/Net30/Net60), `vigenciaDias`, `notas` custom, y un toggle nativo de **"Precios incluyen IVA"** con lógica matemática inversa.
   • **Sincronización de Catálogo y CRM:** Hooks Headless (`useCordCatalog` y `useCordClients`) que jalan productos y clientes reales. El componente `<CordBuilder.Header>` ahora renderiza un `<datalist>` conectado al CRM de Cord: al seleccionar un cliente conocido, **auto-llena** su email, sus términos por defecto y enlaza el `cliente_id` oculto al payload para mantener el historial intacto en la plataforma.
   • **Server SDK y Seguridad (Webhooks):** Se expuso un entrypoint para Node (`@flouviahq/elements/server`). Añadimos criptografía real para los webhooks (`cord.webhooks.constructEvent`) usando `crypto` (HMAC SHA-256), bloqueando firmas inválidas o con timestamps antiguos (Replay Attacks). El build de esbuild se configuró con `platform: 'node'` para no romper el bundle web.
   • **Localización Nativa (i18n):** Se liberó la UI del hardcode en Español. `<CordProvider locale="en">` ahora traduce absolutamente toda la UI de forma dinámica usando el hook `useCordTranslations()`.

✅ **CORD Elements — cotizador embebible (jun 2026, FASE 1: iframe)** — el cotizador
   `/q` vive ahora dentro del sitio de un tercero vía `<iframe>`. El corazón se extrajo
   a `src/components/q/QuoteCard.astro` (REUTILIZADO por `/q/[token]` y `/embed/[token]`;
   es la semilla del futuro paquete npm `@flouviahq/elements`). El componente emite
   CustomEvents en `window` (`cord:approved`/`rejected`/`message`/`pay`).
   • `/embed/[token]` (`EmbedLayout`, fondo transparente, sin chrome) setea el header
     CSP `frame-ancestors` desde la allowlist `orgs.embed_domains` (anti-clickjacking;
     vacío = abierto, modo demo) y hace de puente: `ResizeObserver` → `postMessage`
     `cord:resize` (auto-altura) + relay de eventos al window padre.
   • `public/embed.js` = loader de "una línea": `<script src=…/embed.js>` + `<div
     data-cord-cotizador data-token="…">` inyecta el iframe, ajusta altura y re-emite
     los eventos como CustomEvents sobre el div anfitrión.
   • Ajustes › Developers › **Cotizador embebible** (`/app/ajustes/elements`): copia el
     snippet (con token real reciente) + gestiona dominios autorizados (`embed_domains`
     vía save genérico → `/api/org`). Nueva columna `orgs.embed_domains`.
   • **Landing `/elements`** (prerender, estilo Stripe Checkout): hero con un `<iframe>`
     EN VIVO de `/embed/demo` dentro de un mockup de browser ("portal.tucliente.com") —
     la página se demuestra a sí misma. Snippet, 3 pasos, features en LISTA (hairline,
     no tarjetas), sección de eventos para devs y CTA. Enlazada en el megamenú Producto
     del navbar. Usa `PageAnims` (masked-titles/reveals).
   • **Mejoras al loader (`embed.js`)**: skeleton con shimmer mientras carga + fade-in al
     `cord:ready` (adiós a la caja vacía), `MutationObserver` auto-monta embeds inyectados
     después (SPAs/modales), `referrerpolicy`, `data-min-height`, respeta reduced-motion.
     El embed reporta altura del `.embed-wrap` y emite `ready` tras `fonts.ready`.

✅ **CORD Elements — FASE 2: paquete npm `@flouviahq/elements` (jun 2026)** — versión
   framework-native del embed, en `packages/elements/` (monorepo ligero, NO toca la app
   Astro; extraíble a su propio repo — solo habla con el iframe `/embed/*`). Arquitectura
   estilo Stripe: **core agnóstico** (`src/core.ts` = `mountCotizador(el, opts)` → iframe +
   skeleton + postMessage + relay, con `destroy()`), **Web Component** `<cord-cotizador>`
   (`src/element.ts`, auto-registrado al importar; re-emite eventos NATIVOS sin prefijo:
   `approved`/`pay`/… para HTML/Vue/Astro/Svelte), y **wrapper React** (`src/react.tsx`
   → `@flouviahq/elements/react`, `<CordCotizador token onApproved … />`, React peer OPCIONAL).
   Build con **esbuild** (`build.mjs` → ESM+CJS para `.` y `./react`; React externo); tipos
   `.d.ts` escritos A MANO en `types/` (no hay typescript instalado). `package.json` con
   exports map dual. Verificado E2E con Playwright: WC registra, `ready` dispara, auto-altura
   (300→1292px), `q-card` carga, 0 errores. Los tabs de `/elements` ahora muestran el paquete
   (React/Next usan `@flouviahq/elements/react`; Astro/Vue el WC; HTML/WordPress siguen con
   `embed.js`). ✅ **PUBLICADO en npm como `@flouviahq/elements` v0.1.0** (el scope `@cord`
   no estaba disponible → se usó la org `@flouviahq`). Re-publicar: subir `version` en
   `package.json` + `cd packages/elements && npm run build && npm publish`. El nombre del
   Web Component sigue siendo `<cord-cotizador>` (es marca de producto, no del paquete).

✅ **CORD Elements — FASE 3: SDKs Universales (jun 2026)** — Expansión de `@flouviahq/elements`
   para soportar frameworks y plataformas No-Code nativamente. Se agregaron wrappers y scripts:
   • **Vue 3** (`@flouviahq/elements/vue`): componente nativo `<CordCotizador>` con API Composition (`h`, `onMounted`), evitando `compilerOptions.isCustomElement`.
   • **Framer** (`@flouviahq/elements/framer`): componente React inyectado con `addPropertyControls` nativos de Framer para drag-and-drop y sidebar visual de inputs.
   • **Webflow** (`@flouviahq/elements/dist/webflow.js`): script IIFE standalone (`initWebflow()`) que auto-monta iframes buscando atributos `data-cord-token` en el DOM (`MutationObserver` friendly).
   Se actualizaron `exports` en `package.json` y los targets de `build.mjs` con esbuild.

✅ **API Pública (jun 2026)** — infraestructura de llaves API (`api_keys`, hashes SHA-256,
   nunca en claro) + auth Bearer en `src/lib/apikey.ts` (`authApiKey`, `withApiAuth`).
   Endpoints REST en `/api/v1/*`: `GET /me`, `GET|POST /cotizaciones`, `GET /cotizaciones/[id]`,
   `GET|POST /clientes`, `GET|POST /productos`, `GET /cobranza`. Llaves test (`sk_test_`) /
   live (`sk_live_`): las test no requieren plan; las live requieren plan Negocio. Scopes:
   `read` / `write`. Tenancy M2M via `reqContext.run({userId:null, orgId})` (override en
   `src/lib/context.ts`; `getActiveOrgId()` lo checa primero). Serializers sin exponer tokens
   internos en `src/lib/apiv1.ts`. Lógica única de creación de cotización extraída a
   `src/lib/cotizaciones.ts` (usada por `/api/cotizaciones` y `/api/v1/cotizaciones`).

✅ **MCP — servidor JSON-RPC 2.0 (jun 2026)** — en `/api/mcp` (`src/pages/api/mcp.ts`);
   auth Bearer mismo `authApiKey`. Métodos: `initialize`, `ping`, `tools/list`, `tools/call`.
   7 herramientas definidas en `src/lib/mcp.ts`: `listar_cotizaciones`, `detalle_cotizacion`,
   `cartera_vencida`, `resumen_negocio`, `buscar_cliente`, `listar_productos`,
   `crear_cotizacion_borrador`. Herramientas write comprueban scope; errores de negocio
   devuelven `isError: true` (no protocol error). Stateless (sin sesiones persistentes).

✅ **Webhooks salientes (jun 2026)** — tabla `webhooks` (url, eventos jsonb, secret en claro
   para firma, activo, last_status/last_error). Motor en `src/lib/webhooks.ts`:
   `dispatchQuoteEvent(orgId, cotizacionId, evento)` — best-effort (NUNCA lanza), 5s timeout,
   1 retry (300ms backoff), firma HMAC-sha256 en header `X-Cord-Signature: sha256=<hex>`.
   Payload: `{ event, created_at, data: { id, folio, status, total, cliente, link_publico } }`.
   Enganchado en los 6 eventos: `quote.sent`, `quote.viewed`, `quote.approved`,
   `quote.rejected`, `quote.paid`, `quote.invoiced` (5 archivos). CRUD en `/api/webhooks`
   (requiere permiso `ajustes` + plan API). Secret mostrado UNA vez al crear, luego enmascarado.
   UI funcional en Ajustes › Developers (lista, toggle activo/inactivo, eliminar, modal crear).

✅ **Developers PRO (jun 2026)** — observabilidad estilo Stripe/GitHub en Ajustes › Developers
   (`/app/ajustes/api`). **Log de entregas de webhooks + replay:** tabla nueva
   `webhook_deliveries` (cada intento con evento/status/error/intento/duración/`request_body`
   para re-enviar exacto + `response_body`); `deliver()` en `webhooks.ts` registra CADA intento
   y guarda el resumen; `sendTestEvent()` (evento `ping` de prueba) y `redeliver()` (replay).
   En `/api/webhooks`: `GET ?deliveries=<id>`, POST `{action:'test'}` y `{action:'redeliver'}`.
   UI: cada endpoint se DESPLIEGA → log con dot ok/err + status + latencia + botón "Reintentar"
   por entrega, y botón "Probar" por endpoint. **Log de requests del API:** tabla nueva
   `api_requests`; `withApiAuth` (apikey.ts) loguea cada llamada (método/ruta/status/ms/ip,
   best-effort) → sección "Actividad del API" con stats 24h (total/errores/latencia) + lista,
   refrescable vía `GET /api/dev/activity`. **MCP pro:** connect card con config Claude
   Desktop/Cursor/URL (copy) + catálogo de las 7 tools (desde `MCP_TOOLS`, con scope) +
   **probador en vivo** (`POST /api/mcp/playground`, sesión, solo tools de lectura, corre el
   handler real y muestra el JSON). **API keys:** modal de creación con selector de scope
   (lectura/escritura) en vez de `prompt()`. `getWebhookDeliveries`/`getApiActivity` en queries.ts.
   ⚠️ Correr `npm run db:migrate` (2 tablas nuevas).

✅ **MCP Bidireccional y Gobernanza de Agentes (jun 2026)** — CORD funciona ahora como Servidor Inbound (HTTP/SSE en `/api/mcp/sse` y `/api/mcp/message`) y como Cliente Outbound (`McpClientManager` en `src/lib/mcp/client-manager.ts`). La Base de Datos incluye tablas de gobernanza (`mcp_servers`, `agentes_ia`, `agentes_permisos`) permitiendo que la IA interna de CORD acceda a CRMs corporativos bajo un control estricto (RLS). El endpoint `/api/cotizaciones/ai-draft` implementa un 'Agent Loop' que consulta dinámicamente las herramientas remotas MCP habilitadas para ese agente antes de generar la cotización.

✅ **Gating de API/Webhooks → LÍMITES por plan + CSD multi-tenant + Slack robusto (jun 2026)** —
   sesión "hazlo funcionar" (André reportó webhooks/integraciones/CSD rotos):
   • **Dropdown del sidebar 100% opaco:** `--sb-menu-bg` (claro/oscuro) y `.tb-create-menu`
     pasaron de alpha 0.96–0.98 a SÓLIDO; `CustomOrgSwitcher.org-dropdown` usa
     `background-color: var(--surface)` + `background-image: var(--sb-menu-bg)` (a prueba de
     fallos). Bonus: el componente usaba `:global(.sb-collapsed)` (CSS inválido en un `<style>`
     plano de React → el navegador lo descartaba); corregido a `.sb-collapsed` plano, así el
     org switcher por fin se ajusta al sidebar colapsado.
   • **Gating → límites (no bloqueo):** decisión de André — la API y los webhooks YA NO se
     bloquean por plan; TODOS los planes (incl. `free`) los tienen, LIMITADOS por cantidad.
     `permissions.ts`: `webhookLimit` (free 1 · starter 3 · pro 10 · scale 25 · developer 100)
     y `apiKeyLimit` (free 2 · starter 5 · pro 20 · scale 50 · developer 200) + `planLabel`.
     `/api/webhooks` y `/api/keys` cuentan los existentes vs el límite (403 con mensaje claro);
     `apikey.ts` ya NO bloquea llaves live por plan (el consumo se mide por uso). UI: `api.astro`
     y `webhooks.astro` muestran `X/Límite` y deshabilitan el botón al tope (adiós upsell
     "plan Negocio"); el botón "Vivo" se desbloqueó. `planTieneApi` sigue existiendo
     (lo usa `portal.astro` para quitar marca).
   • **Slack robusto:** `/api/org/prefs` antes IGNORABA en silencio una URL de Slack inválida
     (guardar no hacía nada → parecía roto). Ahora: vacío = desconectar, válida = guardar,
     inválida = **error 400 claro**.
   • **CSD REAL multi-tenant (Facturapi Organizations):** la sección CSD de `/app/ajustes/fiscal`
     estaba 100% deshabilitada (maqueta). Ahora cada org de Cord = una organización en Facturapi
     con SU CSD, y timbra bajo SU RFC. Nuevo `src/lib/fiscal/facturapi.ts` (gestión vía la llave
     de CUENTA `FACTURAPI_USER_KEY`: create org → `POST /organizations`, legal → `PUT …/legal`,
     CSD → `PUT …/certificate` multipart cer/key/password, llave live → **`PUT …/apikeys/live`**
     que RENUEVA y devuelve el secreto — el GET solo lista enmascarado). Endpoint nuevo
     `/api/fiscal/csd` (POST multipart / DELETE). `MexicoSatProvider` acepta `providerApiKey`
     (la llave LIVE de la org); `emit.ts` y el proxy `/cfdi` la usan cuando existe, con fallback
     a la global. Cols nuevas `orgs.facturapi_org_id`/`facturapi_live_key`. UI de fiscal
     habilitada (subir/quitar CSD, estado en vivo, badge PAC). ⚠️ **Requiere `FACTURAPI_USER_KEY`
     en el entorno** (sin ella el endpoint responde 503 honesto y el timbrado cae a la global).
   • **Scripts:** `scripts/set-plan.mjs` (cambia plan de una org: `--list` / `--plan=… --org=…`
     / `--all`). Las 2 orgs "Flouvia" de André se subieron a `developer`. ⚠️ `npm run db:migrate`
     (2 cols nuevas en orgs).
