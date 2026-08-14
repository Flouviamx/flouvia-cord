# Historial — Plataforma: API pública, MCP, Webhooks, Cord Elements

> API REST v1, servidor y cliente MCP, webhooks salientes, y el SDK `@flouviahq/elements`
> (Cord Elements) en todas sus fases. Registro acumulativo; cada entrada conserva su
> fecha y puede describir una arquitectura ya reemplazada.

---

✅ **MCP — calidad de las tools: paginación real, idempotencia, anotaciones y cifrado en
   reposo (fase 10, ÚLTIMA del plan de "MCP y webhooks a nivel artesanía", jul 2026)** — cierra
   el plan completo (7 fases de webhooks + 4 de MCP). Cuatro piezas:
   • **Paginación real en SQL** (`buscar_cliente`/`listar_productos`, `src/lib/mcp.ts`): antes
     cargaban la tabla COMPLETA de la org a JS y filtraban con `.includes()`, devolviendo
     `slice(0, 20 o 50)` sin ninguna señal de que había más — con cientos/miles de filas, cada
     llamada movía el directorio/catálogo entero por la red para enseñar 20 resultados. Ahora
     filtran (`ilike`, con escape de `%`/`_` para que buscar literalmente "50%" no se comporte
     como comodín) y paginan (`limit`/`offset` + `count(*) over()` para el total, todo en una
     sola query) directo en Postgres. Respuesta nueva y uniforme:
     `{items, total, has_more, next_cursor}` — un cliente MCP sabe pedir la siguiente página
     pasando `cursor: next_cursor` sin adivinar nada.
   • **Bug de exposición de datos encontrado de paso — `listar_productos` filtraba el margen:**
     la tool alimentaba su respuesta desde `getProductos()`, que SÍ incluye `costo` (el margen
     interno del producto) — cualquier llave de API de solo LECTURA podía leer el costo de cada
     producto del catálogo sin que la tool lo necesitara para nada (su propia descripción decía
     "id, SKU, nombre, unidad, precio de lista"). Al reescribir la query a SQL directo, el
     `SELECT` ahora excluye `costo` explícitamente — mismo criterio que ya aplica `pk_` (llaves
     publishable) sobre `/api/v1/productos`.
   • **Idempotencia en `crear_cotizacion_borrador`:** nueva tabla `mcp_idempotency`
     (`key_id + idempotency_key` único, RLS+FORCE por `org_id`) — la tool acepta un
     `idempotency_key` opcional (lo genera el CLIENTE, mismo patrón que Stripe); un reintento
     con la MISMA llave devuelve la respuesta YA GUARDADA (folio/id reales de la primera
     llamada) en vez de crear un segundo borrador. Antes, cualquier reintento tras un timeout
     de red duplicaba la cotización sin que el cliente MCP tuviera forma de saberlo. ⚠️
     **Ventana de carrera aceptada y documentada en el código:** dos llamadas con la MISMA
     llave literalmente simultáneas (no secuenciales) podrían ambas pasar el `SELECT` antes de
     que cualquiera termine de escribir — el índice único evita que `mcp_idempotency` termine
     con dos filas, pero no evita una segunda cotización real en ese caso extremo. El escenario
     que sí queda resuelto al 100% es el real: un cliente que reintenta DESPUÉS de no recibir
     respuesta (timeout), que es la causa de duplicados que describía el plan.
   • **Anotaciones + `outputSchema` en `tools/list`** (`McpToolAnnotations` nuevo en
     `src/lib/mcp.ts`, propagado por `rpc.ts`): cada tool ahora declara `readOnlyHint`/
     `destructiveHint`/`idempotentHint`/`openWorldHint`/`title` — es lo que le permite a un
     cliente MCP decidir qué llamadas auto-aprobar sin preguntarle al humano cada vez (las 6
     tools de lectura son `readOnlyHint:true`; `crear_cotizacion_borrador` es
     `readOnlyHint:false` y, honestamente, `idempotentHint:false` por default — solo es
     idempotente si el cliente manda `idempotency_key`). `outputSchema` declara la forma de
     nivel superior de cada respuesta (sin bajar a modelar cada campo anidado — proporción
     razonable de esfuerzo vs. valor).
   • **Cifrado en reposo del `auth_token` de `mcp_servers`** (`src/lib/crypto-secret.ts`,
     nuevo, AES-256-GCM): el token con el que Cord se conecta a un servidor MCP EXTERNO que la
     org registró (ej. HubSpot) vivía en texto plano en la base de datos. `ENCRYPTION_KEY` →
     `MCP_SECRET_KEY` (32 bytes en base64, opcional) cifra en `addMcpServer` y descifra en el
     ÚNICO lugar que de verdad lo usa (`client-manager.ts`, al abrir la conexión saliente). Sin
     la env var configurada, el token se guarda en claro igual que antes (degradación
     documentada, no bloquea nada) — y un token viejo guardado ANTES de configurar la llave se
     sigue leyendo tal cual después (el prefijo `enc:v1:` distingue cifrado de heredado, sin
     necesitar una migración de datos).
   • **`toggle_activo` ahora se audita:** `POST /api/agentes {action:'toggle_activo'}`
     (activar/desactivar un servidor MCP externo) era la única acción de ese endpoint que NO
     dejaba rastro en `audit_log` — las otras tres (agregar/eliminar/cambiar permiso) sí.
     Agregado `logAudit(...)` con el mismo patrón que las demás.
   • **`/api/mcp/playground.ts` — mismo fix de exposición de errores que ya se hizo en fase 9**
     para el resto de MCP, aplicado aquí también: solo se documentó como pendiente, ya estaba
     corregido desde la fase 9 (ver esa entrada).
   • **Verificado con dos harnesses reales:** uno aislado sin BD para `crypto-secret.ts` (11
     checks: round-trip con llave, degradación sin llave, compat hacia atrás con tokens en
     claro, llave equivocada devuelve `null` sin lanzar, IVs distintos por cifrado); y uno
     contra Neon (21 checks) que cubre `tools/list` con anotaciones/outputSchema reales,
     paginación de 3 páginas sobre 5 clientes sembrados (sin duplicados entre páginas, último
     `has_more:false`), `listar_productos` confirmando la AUSENCIA de `costo` en la respuesta,
     idempotencia (mismo folio en el reintento, UNA sola fila en `cotizaciones` con ese folio,
     una llave distinta SÍ crea una cotización nueva, sin llave sigue funcionando normal), el
     `auth_token` guardado por `addMcpServer` confirmado NO-texto-plano en la fila real de
     `mcp_servers` y descifrado exacto por el mismo camino que usa `client-manager.ts`, y la
     fila de `audit_log` que ahora sí deja `toggle_activo`. 32/32 checks. `npm run db:migrate`
     corrido contra Neon real (tabla `mcp_idempotency`, RLS+FORCE confirmado contra
     `pg_class`/`pg_policies`). `npm run build` limpio.
   ⚠️ **Fuera de alcance de esta pasada, deliberado:** la selección de tools por-servidor en
     `agentes.astro` (`setServerPermitido` sigue otorgando siempre `["*"]"` — TODAS las tools
     de un servidor conectado, aunque el schema de `agentes_permisos.herramientas` ya soporta
     una allowlist granular) es una feature de UI completa (listar las tools reales del
     servidor remoto vía `tools/list`, checkboxes, persistir la selección) — se dejó fuera para
     no construir una UI a medias; el resto de la fase 10 son fixes/mejoras de backend
     autocontenidos que sí se cerraron por completo.

✅ **MCP — paridad con /api/v1: rate-limit por llave, medición de uso y bitácora (fase 9 del
   plan de "MCP y webhooks a nivel artesanía", jul 2026)** — hasta esta pasada, MCP era la
   asimetría más grande del código: `/api/v1` mide/limita/audita cada llamada vía
   `withApiAuth`, pero MCP autenticaba con `authApiKey` directo y ahí se quedaba — cómputo
   gratis (nunca cuenta contra la cuota de Stripe Billing), sin rate-limit por llave (solo el
   límite genérico por IP), e invisible en el "Log de actividad" de Ajustes › Developers.
   • **3 helpers extraídos de `withApiAuth` en `src/lib/apikey.ts`** (ahora exportados):
     `checkApiKeyRateLimit(auth)` (600/min llaves secretas, 120/min publishable — mismos
     números de siempre), `meterApiUsage(auth)` (fire-and-forget a `reportUsage(orgId,'api',1)`,
     solo llaves `live`), y `logApiRequest(auth, request, status, ms, routeOverride?)` — este
     último ganó un parámetro `routeOverride` nuevo (100% aditivo, default = comportamiento de
     antes). `withApiAuth` se reescribió para componer estos 3 mismos helpers en vez de tener
     la lógica inline — una sola fuente de verdad que ahora comparten `/api/v1` y MCP, no dos
     copias que puedan divergir.
   • **`routeLabel(msg)` nuevo en `rpc.ts`** — el pathname físico de MCP es siempre `/api/mcp`
     o `/api/mcp/message` sin importar qué se llamó, así que loguear eso sería inútil para
     depurar uso real. `routeLabel` arma una ruta LEGIBLE a partir del método JSON-RPC:
     `/mcp/ping`, `/mcp/initialize`, y para `tools/call` incluye el nombre de la tool —
     `/mcp/tools/call:listar_productos` — que es el dato que de verdad importa auditar.
   • **Cableado en las 3 rutas físicas:** `/api/mcp` (POST) y `/api/mcp/message` (POST, el
     transporte SSE) aplican rate-limit + bitácora en TODO mensaje autenticado, y miden uso
     SOLO en mensajes reales — una notificación (`notifications/initialized`, sin `id`) se
     loguea igual (para diagnóstico) pero NO cuenta como trabajo facturable, porque no ejecuta
     ninguna tool. `/api/mcp/sse` (GET, abre la sesión) aplica rate-limit + bitácora al abrir
     la conexión — sin medición ahí, porque abrir una sesión no ejecuta nada por sí solo; el
     uso real se mide mensaje por mensaje en `/message` conforme llegan (una sola conexión SSE
     puede llevar muchas llamadas a lo largo de sus ~4.5 minutos, así que medir solo la
     apertura habría subcontado brutalmente contra el transporte HTTP, donde 1 request = 1
     unidad). Los fallos de protocolo del lado de SSE (sesión no encontrada, llave de otra
     org, JSON mal formado) también quedan en la bitácora una vez que la llave se autenticó,
     con su propia ruta descriptiva (`/mcp/sse-message:session-not-found`, etc.) — mismo
     criterio que `withApiAuth`: no se loguea nada ANTES de que `authApiKey` resuelva una
     identidad real (un intento con llave inválida no dejaba rastro antes, y sigue sin
     dejarlo).
   • **`/api/mcp/playground.ts` — fuga de errores internos cerrada:** el probador de tools
     (Ajustes › Developers, sesión de Clerk) devolvía `err.message` crudo en el 500 ante
     CUALQUIER excepción — incluidas las que no son de negocio (`McpToolError`, mensajes
     pensados para mostrarse), como un id vacío que hace que Postgres rechace un `uuid`
     inválido con su propio texto de error interno. Corregido: solo `McpToolError.message` se
     expone; cualquier otra excepción devuelve un mensaje genérico.
   • **Verificado con un harness E2E real contra Neon**: un `tools/call` real por HTTP sube
     `uso_periodo.api` en +1 y deja una fila en `api_requests` con la ruta legible
     (`/mcp/tools/call:listar_productos`); una notificación responde 202, queda en la
     bitácora, pero NO mueve el contador de uso; un `ping` con `id` sí cuenta con ruta
     `/mcp/ping`; el MISMO comportamiento se confirmó por el transporte SSE (`/api/mcp/sse` +
     `/api/mcp/message`) — abrir la sesión se loguea como `/mcp/sse`, y un `tools/call`
     posterior por ese canal también sube el contador y deja la ruta con el nombre de la tool.
     `checkApiKeyRateLimit` llamado 605 veces seguidas contra la misma llave se bloqueó en la
     petición #595 (dentro del rango esperado del límite real de 600/min). Y se reprodujo el
     escenario EXACTO que exponía errores internos en el playground (`getCotizacion('')`
     lanza un error de Postgres real, NO un `McpToolError`) para confirmar que la lógica de
     enmascarado distingue correctamente ambos casos. 16/16 checks. `npm run build` limpio.
   ⚠️ **Pendiente (fase 10 del plan, aún sin empezar):** calidad de tools — paginación real en
     `buscar_cliente`/`listar_productos` (hoy cortan en 20/50 sin ninguna señal de que hay
     más), idempotencia en `crear_cotizacion_borrador` (un reintento del cliente crea una
     cotización duplicada), anotaciones `readOnlyHint`/`destructiveHint`/`outputSchema` por
     tool, y cifrado en reposo del `auth_token` de `mcp_servers` (hoy en claro).

✅ **MCP — sesiones fuera del proceso (Redis/memoria) + auth reforzada en el transporte SSE
   (fase 8 del plan de "MCP y webhooks a nivel artesanía", jul 2026)** — continuación directa
   de la fase 7 (ver entrada de abajo). Dos problemas quedaban abiertos ahí a propósito:
   • **Multi-instancia:** `activeSessions` (fase 7) seguía siendo un `Map` en memoria de
     proceso — con más de una instancia de Vercel activa, una sesión abierta por el `GET
     /api/mcp/sse` que sirvió UNA instancia no era visible si el `POST /api/mcp/message`
     siguiente caía en OTRA (Fluid Compute reutiliza instancias pero no las garantiza fijas
     entre requests). **`src/lib/mcp/session-store.ts` (nuevo)** — mismo patrón de
     `src/lib/ratelimit.ts`: Upstash Redis (REST) si `UPSTASH_REDIS_REST_URL`/`_TOKEN` están
     configuradas (aún pendiente de provisionar en este proyecto, ver
     `[[scale-security-audit-jul2026]]` en memoria), con fallback automático a un `Map` en
     memoria — documentado que en ese modo degradado solo funciona con una instancia, sin
     bloquear nada. Dos estructuras por sesión: `mcp:sess:<id>` (string JSON `{orgId, scope,
     keyId}`, TTL 600s) y `mcp:out:<id>` (lista FIFO de mensajes pendientes de entregar).
   • **`src/pages/api/mcp/sse.ts` reescrito al patrón de `/api/q/[token]/stream.ts`** (ya
     probado en producción para el chat en vivo del link público): el stream YA NO habla con
     ningún SDK ni objeto de transporte — es un loop que hace `drainOutbox()` cada ~1s y
     relaya cada mensaje como `event: message`, con `event: ping` de heartbeat cada ~20s
     (que además refresca el TTL de la sesión vía `touchSession()`), auto-cierre a los ~4.5
     min, y `request.signal` para limpiar (`deleteSession()`) al desconectar. El `POST
     /api/mcp/message` que procesa el mensaje puede caer en OTRA instancia sin problema: solo
     necesita leer la sesión del store y hacer `pushOutbox()` — nunca toca el stream
     directamente, así que no importa qué instancia lo sirva.
   • **`src/lib/mcp/transport.ts` (`WebSseTransport`, de la fase 7) ELIMINADO por completo** —
     ya no hace falta una clase de transporte: `sse.ts` y `message.ts` hablan directo con
     `session-store.ts` y con `handle()` de `rpc.ts`.
   • **Auth reforzada en `message.ts`:** antes el `sessionId` en el query string era la ÚNICA
     credencial — visible en logs de proxies intermedios, suficiente por sí solo para inyectar
     mensajes en una sesión ajena si se filtraba. Ahora el POST exige el header `Authorization:
     Bearer` de una API key válida (mismo `authApiKey` que usa todo el resto del API pública) Y
     valida que esa llave resuelva al MISMO `orgId` que quedó guardado en la sesión al abrirla
     — una llave de otra org con un `sessionId` adivinado o filtrado responde 403, no ejecuta
     nada. Sesión inexistente/expirada → 404. Todo con forma JSON-RPC real
     (`{jsonrpc:'2.0', error:{code, message}}`) en vez del `400 "Invalid message"` de texto
     plano que había antes — un cliente MCP ahora puede distinguir el tipo de fallo.
   • **Verificado con dos harnesses E2E reales:** (1) contra Neon + el backend en memoria (el
     único disponible en este entorno, sin Upstash provisionado): sesión SSE real abierta,
     `POST /message` sin sessionId (error JSON-RPC, no texto plano), sin Authorization (401),
     con la llave de OTRA org (403 por mismatch), con sessionId inexistente (404), y el flujo
     feliz completo — `tools/call` con credenciales correctas responde 202 y el resultado
     real (con el producto verdadero de esa org) llega por el STREAM, no en la respuesta del
     POST; una notificación autenticada no encola nada en el buzón (confirmado leyendo el
     siguiente frame real). 19/19 checks. (2) Contra un `fetch` mockeado con
     `UPSTASH_REDIS_REST_URL`/`_TOKEN` forzadas — verificó la FORMA exacta de cada comando
     Redis que `session-store.ts` mandaría en producción (`SET … EX`, `GET`, `EXPIRE` en las
     dos keys, `RPUSH`+`EXPIRE` en un solo pipeline, `LPOP` con count, `DEL` de ambas keys en
     un solo comando) — no se pudo probar contra Upstash real por no tener credenciales en
     este entorno, pero la forma de cada payload quedó confirmada contra el spec REST de
     Upstash. 11/11 checks. `npm run build` limpio en ambos casos.
   ⚠️ **Pendiente (fases 9-10 del plan, aún sin empezar):** paridad de rate-limit/metering/
     bitácora con `/api/v1` (MCP no reporta uso a `reportUsage`, ni cuenta contra cuota, ni
     deja fila en `api_requests` todavía — HTTP y SSE por igual); y calidad de tools
     (paginación real en `buscar_cliente`/`listar_productos`, idempotencia en
     `crear_cotizacion_borrador`, anotaciones `readOnlyHint`/`destructiveHint`, cifrado en
     reposo del `auth_token` de `mcp_servers`).

✅ **MCP — motor JSON-RPC unificado, fin de la fuga cross-tenant en SSE (fase 7 del plan de
   "MCP y webhooks a nivel artesanía", jul 2026)** — la auditoría que originó la pasada de
   webhooks (ver entrada de abajo) encontró un bug de seguridad real en el canal SSE de MCP:
   `src/lib/mcp/cord-server.ts` instanciaba un único `Server` GLOBAL del SDK de MCP, y
   `sse.ts` hacía `cordMcpServer.connect(transport)` en CADA conexión nueva — el SDK guarda un
   solo campo `_transport` por instancia de `Server`, así que cada `connect()` pisaba el de la
   conexión anterior. Con dos sesiones SSE simultáneas de dos orgs distintas, la respuesta
   calculada para la org A podía terminar escrita en el stream de la org B (o viceversa) — una
   fuga cross-tenant real, no teórica. Además ese servidor solo exponía **1 tool**
   (`listar_productos`) contra las **7** reales de `/api/mcp` (HTTP): eran dos catálogos
   distintos y desincronizados.
   • **`src/lib/mcp/rpc.ts` (nuevo)** — se extrajo el `handle()` que antes vivía dentro de
     `src/pages/api/mcp.ts` a un motor compartido (`SERVER_INFO`, `RpcError`, `handle()`) que
     AHORA usan los dos transportes. `src/pages/api/mcp.ts` quedó como transporte HTTP
     delgado que solo arma/desarma el sobre JSON-RPC y llama a `handle()`.
   • **`cord-server.ts` ELIMINADO.** `src/lib/mcp/transport.ts` (`WebSseTransport`) dejó de
     implementar la interfaz `Transport` del SDK y de conectarse a un `Server` compartido —
     cada sesión SSE ahora es dueña de su propia identidad (`orgId`/`scope`/`keyId`,
     capturados una sola vez al abrir la sesión en `sse.ts`) y de su propio stream. Un mensaje
     entrante (`POST /api/mcp/message`) se procesa con `handleIncoming()`, que llama al MISMO
     `handle()` de `rpc.ts` y manda la respuesta ÚNICAMENTE por `this.send()` de esa instancia
     — no queda ningún estado compartido entre conexiones, así que la fuga desaparece por
     diseño (no por parche) y de paso los dos transportes quedan con el catálogo de 7 tools
     idéntico y sincronizado en una sola fuente. ⚠️ **SUPERADO por la Fase 8** (ver entrada de
     arriba): `transport.ts`/`WebSseTransport` se eliminó por completo en esa pasada siguiente
     y se reemplazó por `session-store.ts` (sesión + buzón fuera del proceso) — el fix de la
     fuga cross-tenant descrito aquí sigue vigente (nunca dependió de `transport.ts`, dependía
     de eliminar el `Server` global), solo cambió el mecanismo de entrega del mensaje.
   • **Bug de protocolo corregido:** `handle()` no tenía ningún caso para
     `notifications/initialized` (la notificación que todo cliente MCP manda justo después de
     `initialize`) — caía al `default`, lanzaba `-32601`, y el código respondía un **error a
     una notificación**, violación de JSON-RPC 2.0 (las notificaciones, mensajes sin `id`,
     jamás llevan respuesta) que rompe clientes MCP estrictos. Corregido cortocircuitando a
     `202` (HTTP) / sin escribir ningún frame (SSE) ANTES de invocar `handle()`, en vez de
     intentar reconocer cada notificación una por una.
   • **CORS corregido:** el preflight `OPTIONS` de `/api/mcp` anunciaba
     `Access-Control-Allow-Origin`, pero la respuesta REAL del `POST` no lo llevaba — un
     cliente MCP corriendo en el navegador pasaba el preflight y la petición real fallaba
     igual. Ahora `CORS_HEADERS` se aplica tanto a `rpcOk`/`rpcErr` como a la respuesta 202 de
     una notificación.
   • **Verificado con un harness E2E real contra Neon**, llamando los handlers de ruta REALES
     (no una reimplementación): dos orgs con su propia API key y su propio producto en
     catálogo, dos sesiones SSE abiertas al mismo tiempo, y una llamada a `listar_productos`
     disparada CONCURRENTEMENTE en ambas sesiones (`Promise.all`, reproduciendo el escenario
     exacto del bug) — el stream de cada org recibió únicamente su propio producto, nunca el
     de la otra. Además: `tools/list` idéntico (7 tools, mismos nombres) por HTTP y por SSE;
     `notifications/initialized` responde 202 sin tronar y sin encolar ningún frame en el
     stream (confirmado leyendo el SIGUIENTE frame real tras la notificación); CORS presente
     en una respuesta normal y no solo en el preflight; y el scope `read`/`write` por-tool
     (una llave de solo lectura sigue sin poder ejecutar `crear_cotizacion_borrador`) sobrevivió
     intacto al mover el motor. 25/25 checks. `npm run build` limpio.
   ⚠️ **Pendiente (fases 8-10 del plan, aún sin empezar):** sesiones SSE en Redis con TTL para
     que funcionen entre múltiples instancias de Vercel (hoy `activeSessions` sigue siendo un
     `Map` en memoria de proceso — funciona para el caso común de una instancia con Fluid
     Compute, pero una sesión abierta en una instancia no es visible en otra si el `POST
     /message` cae en una instancia distinta a la que sirvió el `GET /sse`); exigir
     `Authorization: Bearer` en `/api/mcp/message` (hoy el `sessionId` en el query string es la
     única credencial); paridad de rate-limit/metering/bitácora con `/api/v1` (MCP no reporta
     uso ni cuenta contra cuota todavía); y calidad de tools (paginación real, idempotencia en
     `crear_cotizacion_borrador`, anotaciones `readOnlyHint`/`destructiveHint`).

✅ **Webhooks salientes llevados a nivel Stripe — outbox durable, identidad de evento, salud/auto-desactivación, rotación de secreto sin downtime, retención (jul 2026)** —
   auditoría pedida por André ("MCP y webhooks a nivel artesanía de código, útiles y seguros")
   encontró 4 bugs reales (fuga cross-tenant en MCP compartiendo un `Server` global entre
   conexiones SSE, bypass de SSRF porque `fetch` seguía redirects hacia `169.254.169.254`,
   `quote.paid` que se podía perder por usar `.catch()` en vez de `after()`/`waitUntil`, y un
   cuelgue por `clearTimeout` antes de leer el cuerpo de la respuesta) más la ausencia de casi
   toda la infraestructura que hace confiable un sistema de webhooks en producción: sin
   durabilidad (2 intentos en proceso — si moría la invocación, el evento se perdía sin
   rastro), sin identidad de evento (reintentos byte-idénticos, receptor no puede deduplicar),
   sin auto-desactivación de endpoints muertos, sin rotación de secreto, log sin retención.
   Siete fases, cada una verificada con harnesses E2E reales contra Neon + un endpoint HTTPS
   real (httpbin.org/postman-echo.com) — no mocks:
   • **Fase 0 (hotfix, sin migración):** `safeFetch()` nuevo en `src/lib/ssrf.ts` —
     `redirect:'manual'` (un 3xx nunca se sigue, se trata como fallo — cierra el bypass de
     metadatos), lectura del cuerpo ACOTADA (`readCapped`, 8 KiB) con el `AbortController`
     armado durante toda la lectura (ya no solo hasta los headers). Los 3 sitios de
     `dispatchQuoteEvent(...,'quote.paid')` en `stripe/webhook.ts` pasaron de `.catch(()=>{})`
     a `after(...)`.
   • **Fase 1 — outbox durable:** tabla nueva `webhook_events` (una fila por evento lógico ×
     endpoint suscrito, `payload` INMUTABLE) + `src/lib/webhook-delivery.ts` (motor nuevo,
     reemplaza el `deliver()` viejo de `webhooks.ts`, que queda como productor delgado). Cada
     evento se ENCOLA primero (awaited — durable aunque la invocación muera) y se entrega
     inline vía `after(flushNow(...))` para no perder la latencia p50 — el outbox es red de
     seguridad, no impuesto de latencia. Cron nuevo `/api/cron/webhooks` (cada minuto) reclama
     lo que quedó `pending`/`delivering` con lease vencido. El **claim** es una sola sentencia
     SQL (`for update ... skip locked` + CTE) — la corrección depende del *lease*
     (`lease_until`), no de `SKIP LOCKED` (que es solo rendimiento); cada `settle()` lleva
     `and lease_id = ${leaseId}` como CAS. Carril de sistema nuevo `withSystemTx`/`cronScope`
     en `db.ts`/`context.ts` para el claim cross-org (política RLS de `webhook_events` acepta
     `app.org_id` O `app.scope='system'`). **Bug real encontrado por el propio harness:**
     `claimByIdsOrg` (usado por `flushNow` tras encolar) no filtraba `next_retry_at <= now()`
     como sí hace `claimDue` — una segunda llamada podía re-disparar un intento antes de
     cumplir su backoff. Corregido.
   • **Fase 2 — identidad de evento:** el payload gana `id: "evt_…"` (generado ANTES de
     serializar, para que quede embebido en los bytes que se firman) + headers nuevos
     `X-Cord-Event-Id`/`X-Cord-Delivery-Id`/`X-Cord-Attempt`/`Idempotency-Key`. `redeliver()`
     reutiliza el `id` YA embebido en el payload guardado (mismo evento lógico) con fallback a
     generar uno fresco solo para filas legacy sin `id`. SDK (`@flouviahq/elements`) bumpeado a
     1.1.0 (sin publicar aún): `CordWebhookEvent.id` nuevo, 100% aditivo.
   • **Fase 3 — salud del endpoint:** la racha cuenta MENSAJES en estado TERMINAL (agotó los
     11 intentos, o un oneShot de prueba/replay falló) — nunca intentos sueltos, para que un
     mal minuto no desactive un endpoint sano. Racha 3 → correo de aviso (throttle 24h);
     racha 5 → `activo=false` + cancela lo pendiente de ese endpoint + correo + `logAudit`,
     guardado por `where activo=true` para que solo el primer fallo que cruza el umbral
     dispare el aviso (idempotente ante carreras). Nuevo botón "Reactivar y reintentar"
     (`reenableAndRetryRecent`, solo últimas 24h — nunca el backlog completo). Techo
     `OUTBOUND_LIMIT_PER_MIN=120` por endpoint ANTES de tocar la red (Cord no debe ser
     reflector de un ataque volumétrico) — un throttle no cuenta como intento ni toca la
     racha. `action:'test'`/`'redeliver'` ganaron rate-limit (20/min por org); el PATCH de
     endpoints (antes sin auditar — cambiar la URL a un host ajeno no dejaba rastro) ahora sí
     se audita. UI: banner rojo con el motivo + botones Reactivar/Reactivar y reintentar,
     botón "Editar" (la API ya soportaba PATCH `url`/`eventos`, la UI solo mandaba
     `{id,activo}`), `last_error` ahora se pinta (antes vivía en la BD sin mostrarse).
   • **Fase 4 — rotación de secreto sin downtime:** botón "Rotar secreto" con ventana de
     solape (1h/24h/72h). Durante la ventana, `X-Cord-Signature-V1` lleva DOS `v1=` (nuevo
     primero, viejo al final — el orden es load-bearing: un SDK sin actualizar que arma un
     `Record` se queda con el ÚLTIMO `v1=`, que es el del secreto que todavía tiene, así que
     sigue verificando sin tocar código). El SDK parcheado (`parseV1Header` ahora colecciona
     TODOS los `v1=`) acepta cualquiera que cuadre — verificado invocando el **SDK real
     compilado** (`dist/server.cjs`), no una reimplementación. `X-Cord-Signature` legacy (un
     solo valor posible) firma con el viejo durante la ventana y pasa al nuevo al cerrarse.
   • **Fase 5 — retención:** cron nuevo `/api/cron/webhooks-limpieza` (diario, 4am UTC) —
     `webhook_deliveries` > 30 días + tope de 500 filas más recientes por endpoint (hasta 50
     endpoints "calientes" por corrida, autocorrectivo); `webhook_events` succeeded/canceled
     > 30 días, failed > 90 días (`redeliver()` los necesita más tiempo). Borrado SIEMPRE en
     lotes acotados (`ctid = any(array(select ctid ... limit N))`), nunca un DELETE gigante.
     **El ahorro grande fue upstream:** `request_body` dejó de duplicarse en cada uno de los
     hasta 11 intentos de un mismo mensaje (ya vivía, idéntico, en `webhook_events.payload`) —
     `redeliver()` ahora lee el payload de ahí vía `message_id`, con fallback a la columna
     vieja solo para filas de antes de este cambio. `response_body` bajó de 4000 a 2000
     caracteres.
   • **Fase 6 — catálogo de eventos nuevos + SSRF definitivo (cierra el TOCTOU residual):**
     5 eventos nuevos en `WEBHOOK_EVENTS`: `payment.partial` (la rama de pago parcial en
     `stripe/webhook.ts` no emitía NADA — una integración nunca se enteraba de que cayó un
     anticipo/cuota), `payment.failed` (iguala/retainer con cobro recurrente fallido),
     `quote.updated` (reenvío tras "Modificar y reenviar" — reusa el mismo action `resend`,
     que pasó de disparar `quote.sent` a `quote.updated`; verificado que el badge de la UI
     `dotColor()` tiene fallback gris para tipos no reconocidos antes del cambio, así que no
     rompe nada visual), `quote.deleted` (nuevo `dispatchQuoteEventFrom()` — recibe el
     resumen de la cotización YA CAPTURADO antes del `DELETE`, porque para cuando se dispara
     el evento la fila ya no existe y una re-consulta normal fallaría), y `quote.expired`
     (gap real: nada en el código marcaba `status='expired'` — cron nuevo
     `/api/cron/expirar-cotizaciones`, diario, mueve a `expired` toda cotización
     `sent`/`viewed` cuya `vigencia` ya pasó, registra el evento interno + audit log, y
     dispara el webhook). `payment.partial` tiene un shape de `data` distinto (trae
     `tipo`/`monto`/`numero_cuota`/`saldo_pendiente`/`payment_method` fusionados al resumen
     normal) — `CordWebhookEvent` del SDK pasó a unión discriminada por `event` para que el
     tipo de `data` se infiera correctamente en TypeScript según el evento.
     **SSRF definitivo:** `guardedLookup()` nuevo en `ssrf.ts` — un `Agent` de `undici` con
     `connect.lookup` custom que valida la IP en el momento EXACTO de la conexión TCP,
     cerrando la ventana TOCTOU que quedaba entre el pre-chequeo DNS de
     `assertSafeWebhookTarget` y la resolución real que hacía `fetch` por su cuenta —
     verificado con una URL de DNS-rebinding real (`169-254-169-254.sslip.io`, que resuelve
     literalmente a `169.254.169.254`) bloqueada sin llegar a abrir el socket.
     **Bug real encontrado por el harness — el fix de SSRF rompía TODA entrega:**
     `guardedLookup` ignoraba el parámetro `options` y siempre respondía con la forma de una
     sola dirección (`callback(err, ip, family)`); pero el conector de `undici` invoca este
     lookup con `{ all: true }` y espera la forma de arreglo (`callback(err, addresses[])`) —
     con el shape equivocado, `net` de Node interpretaba el string de IP como si fuera el
     arreglo y tronaba con `Invalid IP address: undefined` en TODA conexión, incluida una
     entrega sana a un endpoint público real. Sin este fix, el cierre del TOCTOU habría
     tumbado el sistema de webhooks completo en el primer deploy. Corregido para respetar
     `options.all` y devolver el shape correcto en cada caso.
   • **Documentación:** reescritura completa de `docs.cordhq.app` → Desarrolladores →
     Herramientas → Webhooks (ES+EN) — la versión anterior documentaba nombres de evento
     inventados (`cotizacion.pagada`) y solo el header legacy; ahora cubre el payload real,
     ambos headers de firma, identidad/idempotencia, la tabla real de reintentos, salud del
     endpoint, rotación de secreto y el catálogo completo de 11 eventos + `ping` (incluyendo
     los 5 de la Fase 6). Nota de idempotencia + mención de rotación agregada también a la
     guía del Server SDK.
   ⚠️ **`invoice.canceled` deliberadamente NO se construyó** (estaba en la lista original de
     eventos nuevos): no existe ningún flujo de cancelación de CFDI en el código (Facturapi
     soporta cancelar con motivo SAT, pero Cord nunca lo expone) — construirlo solo para
     tener de qué colgar un webhook sería inventar una feature fiscal completa como efecto
     secundario de esta tarea. Queda fuera de alcance hasta que la cancelación de CFDI sea un
     feature real.
   ⚠️ **Pendiente (no bloqueante, documentado para una sesión futura):** el bloque de MCP del
     plan original (unificar el motor JSON-RPC entre `/api/mcp` y el canal SSE — hoy comparten
     un `Server` global que causa una fuga cross-tenant real —, sesiones en Redis con TTL, y
     paridad de rate-limit/metering/bitácora con `/api/v1`) sigue sin empezar.
   • Verificado: cada fase cerró con `npm run build` limpio + harness E2E propio contra Neon
     real y un endpoint HTTPS real (SSRF/redirect, backoff exponencial, doble-claim, sweeper
     cross-org, streak de salud con sus 2 umbrales, auto-cancelación de pendientes, throttle
     anti-reflector, rotación con el SDK real compilado, los conteos exactos de la retención
     en una segunda corrida idempotente, y en la Fase 6 los 5 eventos nuevos + el bloqueo real
     de DNS-rebinding + la regresión de entrega normal, contra la BD real). Migración de
     schema corrida contra Neon (tabla `webhook_events` + columnas nuevas en
     `webhooks`/`webhook_deliveries`, RLS+FORCE confirmado contra `pg_class`/`pg_policy`).

✅ **Documentación del SDK de NPM y rediseño visual "Apple" para docs (jul 2026)** — 
   • Se actualizaron a fondo los docs de `Cord Elements` en la barra lateral de desarrolladores (`DocsLayout.astro`), promoviéndolo de una subsección a un botón principal/desplegable de alto nivel.
   • Se crearon guías detalladas para el uso real del paquete NPM `@flouviahq/elements`:
     - `react.md`: Uso del `<CordProvider>`, `<CordCotizador>`, `<CordBuilder>` y `useQuoteBuilder`.
     - `web-components.md`: Uso del web component nativo `<cord-cotizador>` en Vanilla JS/PHP, el wrapper de Vue, y Code Components en Framer.
     - `server.md`: Documentación de `@flouviahq/elements/server` para validación criptográfica de webhooks (`constructEvent`) contra ataques de repetición y llamadas directas a la API REST.
   • Limpieza de tono: Se eliminaron todos los callouts genéricos de GitHub (`> [!TIP]`, `> [!WARNING]`) en favor de un formato más profesional con `> **Nota:**`.
   • Rediseño visual "Quiet Luxury / Apple": Se rediseñaron los estilos markdown globales de `.content-container` en `DocsLayout.astro`. Los `<pre>` ahora tienen fondo azul oscuro profundo (`#0a192f`), esquinas muy redondeadas (`16px`), padding amplio (`24px`), y sombras sutiles; los enlaces (`<a>`) pasaron de azul vibrante a negro sobrio con subrayado sutil que se acentúa en hover; y el código inline (`<code>`) recibió un fondo gris suave al estilo de la documentación de desarrolladores de Apple.

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
