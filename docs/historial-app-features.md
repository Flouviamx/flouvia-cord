# Historial — App interna: features y UX

> Todo lo que vive dentro de `/app/**`: shell (sidebar/topbar/ajustes), editor de
> cotizaciones, link público `/q`, dashboard, cobranza, onboarding, dark mode, entorno
> de prueba, chat, tiempo real. Extraído de `historial.md`. Orden: más reciente arriba.

✅ **Ajustes: notificaciones reales, bandeja de facturas, MCP/Embed rediseñados, integraciones honestas (ago 2026)** —
   sesión grande sobre 6 páginas de Ajustes que André señaló con capturas ("hazlo funcionar",
   "esto no sirve para nada"). Auditoría previa encontró que Notificaciones e Integraciones eran
   **decorativas** (guardaban una preferencia que ningún emisor consultaba — la MISMA clase de bug
   documentada ya dos veces antes en este archivo con Cobranza IA/Equipo), que Facturación no podía
   funcionar por una tercera fuga de variable de entorno, y que MCP/Embed mostraban estado falso
   (una llave `sk_live_xxxxxxxxxxxx` con forma real que nunca conectaba nada). Ver Reglas 14 y 15
   nuevas de `CLAUDE.md`.
   • **`src/lib/notify.ts` (nuevo) — el emisor que Notificaciones nunca tuvo.** `orgs.notif_prefs`
     se guardaba desde jun 2026 pero **cero** correos al dueño existían en el código (los únicos
     `sendEmail` reales eran todos AL CLIENTE) y `dispatchSlack` (dentro de `webhooks.ts`) posteaba
     **todos** los eventos a Slack sin mirar la matriz. `notify(orgId, evento, data)` es la única
     puerta de salida: lee `notif_prefs`, manda correo al dueño (`orgs.owner_id → users.email`,
     plantilla propia con logo+botón pill, mismo lenguaje que `notifyQuoteSent`) y/o postea a Slack
     — nunca ambos si el checkbox está apagado. **Defaults sensatos**: una org que NUNCA guardó su
     matriz (`Object.keys(notif_prefs).length === 0`) recibe correo en aprobada/rechazada/pagada
     por default — en cuanto guarda una vez, la UI serializa las 7 filas completas y a partir de
     ahí se respeta literalmente lo guardado, defaults incluidos apagados. `dispatchSlack` se
     ELIMINÓ de `webhooks.ts` (dead code); el post a Slack ahora solo ocurre vía `notify()`, y solo
     si `data.folio` está presente — `team_join` (sin folio posible) estructuralmente nunca puede
     postear a Slack aunque alguien fuerce `slack:true` a mano en la BD. Cableado en los 7 puntos
     reales: `quote_viewed` (`markViewed` en queries.ts), `quote_approved`/`quote_rejected`
     (`/api/q/[token]`), `quote_paid` (3 sitios en `stripe/webhook.ts`, incluida la rama de iguala
     recurrente), `team_join` (`/api/equipo/join`), `quote_expiring` (query nueva en el cron
     `expirar-cotizaciones`, exactamente 3 días antes — coincidencia de fecha, sin tabla de dedup) y
     `payment_overdue` (query nueva en el cron `recordatorios`, exactamente el primer día vencido).
     La columna WhatsApp se **eliminó** de la UI/API (`CANALES`/whitelist de `/api/org/prefs`) — no
     existe ningún canal WhatsApp en el backend, ofrecerlo era otra promesa falsa.
   • **Fix de higiene encontrado al tocar `slack.ts`:** `EVENT_MSG` llevaba emojis (📤👀✅❌💰🧾🔔),
     violación directa de la Regla 1 de diseño del proyecto — se quitaron, quedaron marcadores de
     texto (`*APROBADA*` en negritas de Slack en vez de ✅).
   • **`/app/ajustes/facturas` (nuevo) — bandeja de facturas emitidas.** No existía NINGUNA pantalla
     que listara los CFDI juntos — solo se veían uno por uno dentro de cada cotización. `getFacturas()`
     nuevo en `queries.ts` (todos los `documentos_fiscales` de la org, join con folio/cliente/total),
     tabla con folio/cliente/total/fecha/estado (pill issued/pending/error/cancelled) + badges
     Simulada/Cuenta de prueba + links reales a los proxies `/api/cotizaciones/[id]/cfdi?type=pdf|xml`
     que ya existían. Nueva pestaña "Facturas emitidas" junto a "Datos fiscales" en la categoría
     Facturación y CFDI.
   • **Fuga de env var #3, cerrada:** `/api/fiscal/csd.ts` devolvía 503 con *"Falta
     FACTURAPI_USER_KEY en el entorno... Agrégala en Vercel"* — mensaje de infraestructura interna
     mostrado al dueño del negocio. Ahora: *"Timbrar con tu propio CSD todavía no está disponible en
     tu cuenta. Escríbenos a soporte@flouvia.com y lo activamos."*
   • **Panel "Timbrado (PAC)" — construido y luego ELIMINADO en la misma sesión, a petición
     explícita de André.** El primer intento agregó un panel de 3 estados (CSD propio/cuenta
     compartida/simulado) explicando honestamente con qué cuenta se timbraba — pero al verlo en
     vivo, André señaló que **nombrar el proveedor (Facturapi) y el mecanismo de cuenta compartida
     es información que el dueño del negocio no necesita**: lo único que le importa es si SU CSD
     está conectado (ya visible en el bloque de arriba) y poder ver sus facturas (el link nuevo). Se
     removió el panel completo — markup, CSS (`.pac-*`), el helper `facturapiSharedKeyConfigured()`
     recién creado en `src/lib/fiscal/facturapi.ts`, y las 3 menciones de "Facturapi" que quedaban
     en `set.fiscal.csd_intro`/`contrasena_hint`/`csd_conectado_toast` — el link "Ver facturas
     emitidas →" se reubicó junto al botón de subir CSD.
   • **`/app/ajustes/mcp` rediseñada — de plantilla falsa a estado real.** Antes mostraba
     `sk_live_xxxxxxxxxxxx` sin ninguna señal de si algo estaba conectado. Ahora: tablero de estado
     (¿hay una API key `secret` activa? ¿cuándo se usó MCP por última vez? — de `api_requests`
     filtrando `ruta like '/mcp%'`, instrumentado desde la fase 9 de MCP) con 3 estados reales
     (Sin conectar/Listo para conectar/Conectado) y botón **"Crear llave para MCP"** que llama
     `POST /api/keys` sin salir de la página — la llave real sustituye al placeholder en el snippet
     de configuración al instante, con el aviso "cópiala ahora, no se vuelve a mostrar" (mismo
     patrón de un-solo-vistazo que CSD/webhooks). Las 7 herramientas pasaron de `<code>nombre</code>`
     a `annotations.title` humano como encabezado + el nombre técnico en monospace debajo. Salió de
     `developers.css` al lenguaje visual de Ajustes (hairline, `.s-block`).
   • **`/app/ajustes/elements` — preview en vivo del embed.** Antes solo había un link "Ver el
     embed en una pestaña nueva". Ahora, si existe una cotización real enviada, se monta un
     `<iframe src="/embed/[token]">` DENTRO de la página (mockup de navegador con barra de URL) —
     prueba visual inmediata de que el cotizador embebible funciona, sin salir de Ajustes. Badge de
     "Instalación" (con dominios autorizados / modo abierto) junto al título.
   • **`/app/ajustes/integraciones` — reescrita dos veces en la misma sesión.** Primer intento:
     Slack se mantuvo como única integración real arriba, y la tabla de 5 conectores
     (Shopify/Woo/Meli/Zapier/CONTPAQi) + una grilla de "Aplicaciones recomendadas" (9 apps más)
     pasaron de toggle-que-no-conecta-nada a badges "Próximamente" estáticos. André corrigió en
     caliente: **"las que no están quítalas, deja solo Slack y di que habrá más próximamente"** —
     se eliminaron las DOS listas completas (14 nombres de producto que Cord no tiene, ninguno de
     los cuales era una promesa real de roadmap) y se reemplazaron por un solo bloque genérico "Más
     integraciones próximamente" con link a `/contacto/ventas` para pedir prioridad, sin nombrar
     ningún conector específico. `orgs.integraciones` (jsonb) queda como plumbing inerte — ya no
     hay ninguna UI que lo escriba.
   • **Bug de layout real encontrado por André en capturas — 3 páginas afectadas.** `.s-block` de
     `SettingsShell.astro` es un CSS grid de 2 columnas (`260px label | 1fr contenido`) que asume
     que el **primer hijo directo** es un `<h3>` (va a la columna angosta) y el resto a la columna
     ancha (`.s-block > *:not(:first-child) { grid-column: 2 }`). Los 3 bloques nuevos de esta
     sesión (estado de MCP, preview de Embed, "más integraciones" de Integraciones) tenían un
     `<div>` wrapper como primer hijo en vez de un `<h3>` directo — caían enteros en la columna de
     260px, comprimiendo el texto a una franja angosta con un vacío enorme a la derecha (exactamente
     lo que la captura de André mostraba: "Sin / conectar" partido en dos líneas). Fix: el bloque de
     MCP ganó su `<h3>` directo ("Estado de la conexión"); los de Embed e Integraciones pasaron a
     `.s-block.full` (grid de 1 columna, sin la reserva de 260px) ya que su contenido no tiene un
     label natural de columna izquierda. **Regla de verificación a futuro**: cualquier `.s-block`
     nuevo cuyo primer hijo NO sea un `<h3>` directo necesita la clase `.full`, o el contenido queda
     comprimido en silencio — sin error de build, sin warning, solo un layout roto que solo se ve
     al abrir la página real (exactamente el mismo patrón de "CSS que falla en silencio" ya
     documentado para el scoping de Astro en `app-rutas.md`).
   • **Onboarding a ancho completo + icono de Planes + tabs Apple.** `.idx-health` (tarjeta de
     onboarding en el índice de Ajustes) tenía un `max-width:800px` heredado dentro de un
     contenedor de 1040px — quitado. El icono de "Planes y suscripción" (un rayo genérico de
     "upgrade") se cambió por una tarjeta con banda (el objeto real de la categoría) — 9 de los 13
     iconos de categoría ganaron tratamiento duotone (Regla 9) donde tenían una forma cerrada real
     que lo justificaba. Las tabs de `SettingsShell` (antes un subrayado estilo 2010) pasaron al
     mismo lenguaje de segmented-control (`.ph-tab`) ya usado en Cobranza/Informes/Productos —
     unificación, no un tercer sistema de tabs nuevo.
   • Verificado con **90+ checks automatizados contra Neon real** (orgs/usuarios/sesiones
     temporales, siempre borrados al final) a lo largo de 6 harnesses distintos: `notify()` gatea
     de verdad en ambas direcciones (email/Slack encendido vs. apagado, defaults vs. matriz
     guardada, sandbox/demo excluidos, nunca lanza) confirmado con un servidor HTTP local
     capturando los posts reales de Slack; la bandeja de facturas cuadra con un `documentos_fiscales`
     sembrado a mano; el flujo completo de crear-llave-de-MCP fue probado con clic real → `POST
     /api/keys` real → llave real con forma `sk_(live|test)_[0-9a-f]{48}` inyectada en el snippet;
     el iframe de preview de Embed se navegó de verdad y respondió 200; el fix de layout se verificó
     midiendo `boundingBox().width` de cada bloque afectado (no solo presencia de clases); y el
     flujo de quitar CSD (con el modal `cordConfirm` real, no un `confirm()` simulado) se re-verificó
     después de la limpieza de JS que dejó huérfanos los hooks del panel PAC eliminado. `npm run
     build` limpio en cada tanda de cambios.

✅ **Ajustes › IA: fuera la jerga de infraestructura y la configuración duplicada (ago 2026)** —
   André abrió `/app/ajustes/agentes` y señaló tres cosas: que el aviso mencionaba
   `RESEND_API_KEY` ("no sé por qué dice lo de resend"), que el bloque de abajo era
   incomprensible ("eso de mcp no sé qué es") y que quería la página **ya lista para el
   cliente**, sin trabajo de su parte.

   • ⚠️ **Dos fugas de variables de entorno a la UI del cliente.** El aviso de esta página
     decía "Requiere `RESEND_API_KEY` configurada", y `Ajustes › Correo` iba más lejos:
     "no se enviará hasta verificar tu dominio en Resend y **setear RESEND_API_KEY**". Son
     variables de la PLATAFORMA — ningún cliente las ve, las configura, ni sabe qué es
     Resend. Además el requisito era falso desde el punto de vista del usuario: en
     producción ya está configurada. Reescritas para hablar de lo que el usuario sí
     controla, con una salida real ("escríbenos a soporte@flouvia.com y lo activamos").
     También se quitaron las menciones a Resend de `set.correo.intro` y
     `set.correo.dominio_hint`. **Barrido completo: cero `*_API_KEY`, `*_SECRET` o nombres
     de proveedor de infraestructura en el diccionario de la app** (las de `set.mcp.*` y
     `wb.*` se conservan: viven tras el toggle "Modo desarrollador" y ahí el público es
     explícitamente técnico).

   • ⚠️ **Configuración duplicada y desactualizada.** La entrada anterior de este changelog
     afirmaba que el toggle de cobranza de esta página "pasa a ser un link a la página del
     agente"; **no se hizo**, y quedó un segundo interruptor con copy viejo ("hasta 3
     cuotas" cuando ya son configurables 2–6; "solo sobre cotizaciones facturadas" cuando
     también entran las aprobadas). Ahora es una **tarjeta de estado** que lee la config
     real: modo (apagado / con aprobación / automático), días de gracia, cadencia, correos
     de los últimos 30 días y cuántos borradores esperan aprobación — con enlace a
     `/app/cobranza/agente`, que es la única fuente de verdad.

   • **"Servidores MCP" reescrito por lo que HACE.** El bloque presentaba "Servidores MCP
     conectados", "URL del endpoint SSE" y "Bearer token / API key" como si el lector fuera
     developer. Ahora se llama **"Conectar Cord a tus otros sistemas"** y explica el
     beneficio ("si tu información vive en otro lado… para que la IA la consulte al armar
     cotizaciones"). El estado vacío dice la verdad tranquilizadora: *"Cord funciona
     perfecto sin esto"*. El modal pide "Nombre", "Dirección del servidor" (con pista de
     dónde sacarla) y "Clave de acceso" (enmascarada, "solo si tu proveedor te pidió una").
     **La sigla MCP aparece exactamente una vez**, dentro de un `<details>` colapsado
     ("¿Qué tipo de sistemas puedo conectar?") que explica que es un estándar abierto y que
     si no sabes si aplica, no lo necesitas.

   • **Filas de conexión legibles.** Antes: dos toggles sin jerarquía ("Permitir IA" +
     uno sin etiqueta) y la URL técnica expuesta. Ahora cada fila dice su estado en
     palabras ("Conectado · con clave" / "Pausado") en vez de solo un puntito de color, los
     dos toggles están etiquetados ("La IA puede usarlo" / "Conexión activa") con la
     explicación de la diferencia **una sola vez** arriba en lugar de repetida por fila, y
     el nombre —el dato que importa— dejó de ser lo más aplastado del renglón. Bug corregido
     de paso: pausar una conexión solo cambiaba el puntito y la fila seguía diciendo
     "Conectado".

   • **Encabezado alineado:** la categoría se llamaba "Agentes IA — Configura agentes
     autónomos de inteligencia artificial", que no le dice nada a nadie fuera de la
     industria. Ahora es **"Inteligencia artificial — Qué puede hacer sola la IA de Cord, y
     hasta dónde llega"** (`src/lib/settings.ts`). El `intro` de la página, que repetía ese
     mismo texto, se eliminó.

   • **Verificado:** 49 claves `set.ag.*` reescritas con paridad ES/EN y sin huérfanas;
     `npm run build` limpio y `astro check` sin hallazgos; **31 checks con Playwright y
     sesión real** en dos suites — cero menciones de `RESEND`/env vars en la página y en
     Correo, cero "MCP" en la superficie pero sí dentro del desplegable, ausencia del
     segundo interruptor, la tarjeta reflejando el modo real y sus datos de config, el modal
     sin jerga y con la clave enmascarada, y las filas de conexión con nombre largo real
     (no desbordan, los controles siguen alcanzables, el estado en texto se sincroniza con
     el toggle y se persiste en la BD).
   ⚠️ **Nota de método:** dos "fallos" iniciales de la verificación resultaron ser errores
     del propio test, no del producto — `innerText()` devuelve vacío dentro de un
     `<details>` cerrado, y respeta `text-transform: uppercase`, así que comparar contra el
     texto en minúsculas falla. Verificar el DOM con `textContent` y comparar sin distinguir
     mayúsculas.

✅ **Cobranza con IA v2, Equipo rediseñado y UN solo bloqueo de permiso/plan (ago 2026)** —
   André pidió llevar `/app/ajustes/equipo` y la cobranza con IA al nivel Apple del resto
   de la app, que sirvieran de verdad, que fueran obvias desde el día 1, y unificar los
   bloqueos de "no tienes permiso / no tienes el plan", que tenían **7 diseños distintos**.

   • **`AccessGate.astro` (nuevo) — un solo bloqueo.** Antes había 5 copias literales del
     mismo hairline con candado (`SettingsShell`, `ajustes/index`, `desempeno`, `cobros`,
     `cobranza`), una card `border-radius:40px` centrada en `informes.astro` con texto
     hardcodeado sin `t()`, una línea de texto muted en el Workbench y un `.de-empty` en
     disputas idéntico al estado 404; solo **uno de los siete** ofrecía salida. Ahora todos
     usan el mismo componente centrado estilo Apple (squircle 56×56, icono duotone, copy y
     CTA por props): candado sin CTA para `perm`, escudo con CTA a
     `/app/ajustes/plan?plan=…` para `plan`. Cada página sigue pasando SUS claves i18n (el
     copy específico no se centraliza). `planUpsell()`/`minPlanOf()`/`SEAT_LIMITS` nuevos en
     `permissions.ts` — el 402 de equipo llevaba meses diciendo "plan Negocio" contra un
     `TEAM_PLANS` que ya arranca en Pro. `/app/ajustes/plan` acepta `?plan=pro` y resalta el
     plan destino. Se conservan a propósito la píldora `.lock-tag` de `portal.astro` (gate de
     CAMPO, no de página) y el `.de-empty` del 404 de disputas.

   • **Cobranza con IA: de cascarón a producto.** La página vivía en `/app/tesoreria/cobranza`
     (carpeta residual — `tesoreria/flujo` ya no existe) y era un feed plano de 50 mensajes
     sin agrupar, sin KPIs, sin una sola acción, con SQL crudo inline sin `withOrgTx`, y los
     `planes_pago_negociados` no se mostraban en ninguna parte. Ahora vive en
     **`/app/cobranza/agente`** (302 desde la ruta vieja vía `LEGACY_ROUTES`; `cobranza.astro`
     pasó a `cobranza/index.astro`) con `WidgetGrid` y 9 widgets: recuperado por el agente
     (30 d), esperan aprobación, planes activos, correos/tasa de respuesta, **bandeja de
     aprobación** (span 4, el centro: correo editable inline + plan propuesto + aprobar/
     editar/regenerar/descartar/no-escribirle), hilos agrupados por cotización con compose
     para que el humano tome el control, planes con avance real de cuotas, **"En la mira"**
     (a quién escribirá en la próxima corrida y a quién no, con el motivo), y exclusiones.
     Estado de arranque nuevo: 3 pasos + **el correo real que mandaría hoy** + "Activar con
     aprobación" (nadie enciende una IA que escribe a sus clientes sin ver antes qué dice).

   • **Un solo motor (`src/lib/agents/cobranza-run.ts`).** `runCobranzaForOrg` de
     `api/agentes.ts` —lo que ejecutaba el botón "Forzar ejecución"— era un **clon divergente
     con 6 bugs** que el cron ya había corregido: vencimiento por `c.vigencia`, solo
     `status='invoiced'`, monto = total crudo en vez del saldo, sin días de gracia, sin
     `payUrl` (el correo salía sin link de pago) y el historial mapeado con
     `rol: h.autor_tipo === 'agente_ia' ? 'user' : 'user'`, que además rompe la API de
     Anthropic con turnos consecutivos del mismo rol. Borrado. El cron quedó como loop
     delgado sobre `orgsConCobranzaActiva()`.

   • ⚠️ **Bug de producción corregido — sin cadencia.** El cron corre diario (`vercel.json`,
     16:00 UTC) y **no consultaba el último envío**: le escribía a la misma cotización
     vencida todos los días. `ai_cobranza_cadencia_dias` (default 7) lo cierra; un borrador
     sin resolver también frena el hilo. El comentario del cron que afirmaba "aún no está
     agendado a propósito" llevaba tiempo siendo falso; eliminado.

   • ⚠️ **Riesgo de dinero cerrado — plan en dry-run.** `executeProposePlan` cancelaba los
     PaymentIntents del cliente y reescribía `cotizacion_cobros` DENTRO del turno del modelo.
     Con bandeja de aprobación eso significaba que un correo que quedara en borrador y nunca
     se aprobara ya habría destruido los cobros pendientes. Ahora en modo aprobación valida
     igual pero solo registra el plan como **`'propuesto'`** (estado que existía en el schema
     desde jun 2026 y nunca se escribía); la materialización real (`materializePlan`,
     exportada) ocurre al aprobar el correo. También: el fallo de `checkQuota` devolvía un
     texto genérico que se enviaba igual y no quedaba registrado — ahora se guarda como
     `estado='fallido'`.

   • **Configuración real del agente** (10 campos nuevos en `orgs`, todos con rango acotado
     en `/api/org` y otra vez en el motor): modo aprobación/automático, gracia, cadencia,
     umbral de plan, máx. cuotas, tono (cercano/profesional/firme), idioma, firma, monto
     mínimo y tope por corrida. Antes todo estaba hardcodeado y siempre en español. Panel
     `<dialog>` desde la topbar; el toggle de Ajustes › Agentes pasa a ser un link (fuente
     única). Tabla nueva `cobranza_exclusiones` (RLS+FORCE) y ciclo de vida del mensaje en
     `cobranza_conversaciones` (`estado`/`aprobado_por`/`aprobado_at`/`editado`/`enviado_at`/
     `error`, default `'enviado'` para que el histórico quede coherente sin backfill).
     Endpoints nuevos en `/api/cobranza-ia/*`. `getCobranzaIA()` en `queries.ts` (cacheada
     30 s) calcula **`recuperado30d`** — dinero cobrado de cuentas a las que el agente
     escribió ANTES del pago; la cifra que justifica el feature y que no existía.

   • ⚠️ **`PATCH /api/org` no invalidaba ningún caché.** Guardar la config y recargar seguía
     mostrando los valores viejos hasta 30-60 s: el usuario cree que no se guardó y vuelve a
     guardar. Ahora llama `invalidateMoneyCaches(orgId)`. Detectado en la verificación con
     Playwright, no leyendo el código.

   • **Correo entrante:** `inbound-email.ts` corregido (threading por `message_id` real en vez
     del mock "última cotización invoiced del remitente", saldo real, vencimiento canónico,
     y el envío de la respuesta **descomentado** — el agente redactaba y nadie mandaba nada)
     pero **deliberadamente NO se agregó a `PUBLIC_API_PREFIXES`**: sigue inalcanzable, con
     los dos pasos exactos para encenderlo documentados en el archivo. Los correos salientes
     ya guardan `message_id` (`sendEmail` lo devuelve), así que el threading queda sembrado.

   • **Equipo — lo que estaba roto:** el tab "Inactivos" salía SIEMPRE vacío (el SQL de
     `getMembers` filtraba `estado <> 'revocado'`), "Exportar" no tenía listener (ahora es
     `/api/equipo/export` real), la columna "Último inicio de sesión" mostraba la fecha de
     ALTA porque el dato no existía (ahora sale de `sessions.last_used_at`), **13 atributos
     `data-i18n-*` se emitían y el script nunca los leía** (todos los toasts hardcodeados en
     español), faltaban **4 claves i18n** que renderizaban la clave cruda en el picker
     (`set.eq.perm.cobros_config.*`, `set.eq.perm.reembolsar.*` — la página itera los 10
     `PERMISOS` pero el diccionario solo tenía 8), y toda mutación hacía `location.reload()`.
     Todo corregido; 35 claves huérfanas del diseño anterior eliminadas.

   • **Equipo — lo nuevo:** medidor de asientos con `SEAT_LIMITS` (free 1 · starter 1 · pro 5
     · scale 15 · developer ilimitado) — el número que promete `/precios` desde jun 2026 no
     existía en código ni se mostraba; **grandfathering explícito**: una org que ya rebasa
     conserva a todos sus miembros y solo no puede invitar más. Actividad real por miembro
     (última sesión, cotizaciones de 30 días, última acción del `audit_log`, con `left join
     lateral` acotado). Badge "Gestionado por SSO" (`org_members.sso_managed` existía desde
     jul 2026 y era invisible: editabas permisos a mano y el siguiente login SAML los pisaba).
     Dominios de invitación visibles + validados antes del 422. **`PermPicker.astro`** nuevo
     (estaba duplicado literal entre los dos modales) agrupado por área — Vender / Dinero /
     Control y análisis / Administración — en vez de 10 toggles planos. Ficha del miembro en
     drawer con permisos EFECTIVOS (el owner los tiene todos por override de `memberCan`
     aunque su matriz esté vacía). Los modales migraron a `src/styles/modal.css` +
     `cordWireModal`. `/unirse/[token]` ganó i18n y dark mode, y dejó de aceptar invitaciones
     **ya usadas** (solo excluía `revocado`, así que un link consumido mostraba "Unirme" y
     devolvía 409 sin explicación).

   ⚠️ **Regla reconfirmada:** `src/styles/modal.css` **no** lo importa `AppLayout` — va por
     página. Se me olvidó en las dos páginas nuevas y los modales salieron sin cabecera flex
     ni botón de cerrar redondo; lo detectó Playwright midiendo `getComputedStyle`, no la
     inspección visual. Y el contrato es `.m-close` + `<h2>` (no `.m-x` + `<h3>`).

   • **Verificado:** `npm run db:migrate` contra Neon + 26 checks de schema (columnas,
     defaults, RLS/FORCE, índices, el CHECK que rechaza una exclusión sin destino);
     **17/17 del motor** contra la BD real con una org sembrada y borrada al terminar
     (gracia, monto mínimo, exclusiones, cadencia en sus dos sentidos, borrador que frena,
     dry-run que NO toca `cotizacion_cobros`, `materializePlan` con cuotas que suman exacto,
     plan al corriente, agente apagado, exclusión de demo/sandbox); **58 checks con Playwright
     y sesión real** repartidos en 4 suites (estado de arranque, 9 widgets, panel de config
     guardando los 10 campos, medidor y 402 real de asientos con grandfathering, picker
     agrupado sin claves crudas, ficha, y el MISMO gate en 3 páginas distintas visto con un
     miembro sin permiso); `npm run build` limpio y `astro check` sin hallazgos nuevos; y el
     CSS del build confirmando que las 8 clases de bloqueo viejas ya no salen y que las del
     `AccessGate` salen scopeadas.

✅ **"Mi dinero" y Cobranza rediseñadas con widgets + reconciliación real de Stripe (ago 2026)** —
   `/app/cobros` y `/app/cobranza` se quedaron atrás del salto estético de `/app/informes` y,
   sobre todo, subutilizaban sus datos: cobros mostraba el volumen mensual como una **lista de
   texto** (cero gráficas, sin rango de fechas, sin personalización) y enseñaba el bruto de Neon
   junto al saldo de Stripe **sin nada que los reconciliara**; cobranza solo pintaba `C.items`
   mientras `getCobranza()` calculaba `resumen`, `aging`, `clientes`, `promesas` y `payBehavior`
   en cada request para tirarlos a la basura.
   • **`/app/cobros` — 12 widgets** (`cord.cobros.v1`) con `DateRangePicker` propio: cobrado del
     rango con delta contra el tramo anterior, **neto depositado** (comisión de Stripe y % efectivo),
     saldo disponible, MRR de igualas, evolución diaria con serie comparativa (`line`), mix por
     método (`donut`), **"A dónde va cada peso"** (`segbar`: neto/comisión/reembolsos/disputas),
     depósitos, **salud de la cuenta Connect**, disputas, volumen mensual (`bar`, reemplaza la lista
     de texto) y cobros recientes.
   • **`src/lib/stripe-cobros.ts` (nuevo)** — read-model de solo lectura, separado de `billing.ts`
     (que es cliente REST + planes + meters + mutaciones de KYC). Agrega `/v1/balance_transactions`
     y `/v1/disputes`, que no existían. Reglas duras: **whitelist, nunca spread** (fuera
     `individual`, `company`, `tos_acceptance`, el blob crudo de `requirements` —solo conteos—,
     `external_accounts` completo —solo `{bank_name, last4}`— y `dispute.evidence`); todo en PESOS
     con una sola conversión en el borde del DTO; caché 60–300 s por función; `rateLimit`
     (**nunca `strictRateLimit`**, que en prod sin Upstash falla cerrado y mataría los widgets);
     y `Promise.allSettled` por llamada con array `degraded`, en vez del `try/catch` que englobaba
     las dos llamadas y las perdía juntas. ⚠️ `balance_transaction.net` YA trae la comisión
     descontada — restar `fee` otra vez descuenta doble.
   • **La salud de Connect NO cuesta llamada:** sale de las columnas que el webhook `account.updated`
     ya mantiene en `orgs`. Solo cae a `retrieveAccount()` (cacheado 5 min) si faltan requisitos o el
     banco. Deliberadamente **no** llama a `/api/billing/connect/status`, que ESCRIBE en `orgs` en
     cada GET y está gateado por `ajustes`.
   • **`/app/cobranza` — 9 widgets operativos** (`cord.cobranza.v1`, snapshot de hoy, sin selector de
     fechas): vencido, vence esta semana, promesas por vencer, vencido sin gestión (los 4 KPIs
     filtran la tabla al tocarlos), "Atiende primero" (monto × días vencido, con WhatsApp inline),
     promesas abiertas, crédito excedido, aging compacto y la **tabla accionable completa** como
     widget span 4. Deliberadamente NO replica la analítica de `/app/informes?r=cobranza` — eso
     desharía la consolidación de ago 2026.
   • **`getCobros(rango?)` parametrizada y cacheada** (antes sin caché, sin rango, un solo consumidor).
     El rango entra por **centinelas** (`1970-01-01`/`9999-12-31`) en vez de bifurcar las 5 queries,
     porque el `sql` de neon-serverless no compone fragmentos. ⚠️ El límite superior es
     `< hasta::date + 1`, NO `<= hasta`: `paid_at` es timestamptz y `<=` compara contra la
     medianoche, recortando todo lo cobrado durante la jornada — **verificado contra la BD real: con
     `<=` se perdía 1 de 6 cobros**. `getMrrIgualas()` nueva. `loadCobros()` en `src/lib/cobros-data.ts`
     es la fuente única que comparten la página (SSR) y `GET /api/cobros`.
   • **3 bugs propios encontrados durante la verificación:** (1) `conectado` se derivaba de
     `D.stripe?.connected`, pero el SSR pide `withStripe:false` → era SIEMPRE false y escondía los
     widgets de Stripe con la cuenta activa; ahora el payload expone `connected` derivado de `orgs`.
     (2) **Caí en la Regla 11 yo mismo:** las chips de "Estado de la cuenta", el desglose y la tabla
     de recientes los INYECTA el JS, así que su CSS scopeado no los alcanzaba — las chips salían como
     texto corrido sin formato. Movido a `<style is:global>` prefijado con `[data-cobros-shell]`.
     (3) Los chips de filtro de cobranza se apilaban en vertical porque `report-widgets.css` declara
     `.sec-head > div { flex-direction: column }` (para la columna título+subtítulo) y ganaba por
     orden de fuente; corregido anclando el selector a `.sec-head > .cbz-filters`.
   • **Seguridad:** se cerró la asimetría de permisos real — `/api/billing/connect/payouts` exigía
     `ajustes` mientras `/app/cobros` gatea con `cobranza`, así que un miembro de cobranza veía el
     saldo por SSR y se comía un 403 desde el navegador; ahora usa `requirePermAny(['ajustes',
     'cobranza'])` (nuevo helper) y devuelve DTOs recortados en vez de los objetos crudos de Stripe.
     `/api/cobros` gatea con `cobranza`, simétrico con la página.
   • **`invalidate()` de `cache.ts` estaba exportado y NUNCA se usaba** — bug latente: marcar una
     cotización como cobrada la quitaba de la pantalla y un F5 dentro de los 30 s de TTL la
     resucitaba. Nuevo `invalidateMoneyCaches(orgId)` cableado en `PATCH /api/cotizaciones/[id]`
     (cualquier transición de estado) y en los 3 métodos de `/api/promesas`.
   • **Preservar la tabla accionable dentro de un widget** fue la parte de mayor riesgo:
     (a) el `<dialog>` y `#cobErr` viven FUERA del `WidgetGrid` — el grid es `display:grid` y
     `showModal()` convertiría el diálogo en grid item, y `pointer-events` es heredada, así que la
     regla de modo edición lo dejaría inerte; (b) los listeners pasaron de uno-por-fila a **delegación**
     (el `forEach` sobre `.t-row` moría al re-renderizar y duplicaba lógica con los widgets de lista);
     (c) guarda `data-editing` en el handler porque `pointer-events:none` **no impide activar un botón
     enfocado con Enter/Space** — sin ella se podía registrar un pago mientras se reordenaban widgets;
     (d) `row.remove()` → `removeCotizacion(id)`, que limpia la cuenta de TODOS los widgets y recalcula
     los KPIs, leyendo un `data-total-num` nuevo (`data-total` guarda el string formateado que consumen
     WhatsApp y el modal, no se puede repurposear).
   • ⚠️ **Se intentó y se revirtió un `paidAtISO`:** `to_char(...,'YYYY-MM-DD')` (Postgres en GMT) y el
     `fmtDate` de `paidAt` (Node en America/Mexico_City) **discrepan un día completo** en cualquier
     pago posterior a las 18:00 hora de México (caso real: `to_char='2026-08-10'` vs
     `fmtDate='9 ago 2026'`). Un campo con dos semánticas posibles y ninguna documentada es una
     trampa; el eje agregado (rango, serie mensual, serie diaria) usa la convención GMT de forma
     consistente con `getSerieDiaria()` y `/app/informes`.
   • **Fase 0 de infraestructura:** el vocabulario de widgets (`.report-kpi`, `.report-list`,
     `.report-chart`, `.report-focus`, `.snapshot-tag`, `.flow-*`) vivía como `:global()` DENTRO del
     `<style>` scopeado de `informes.astro`, así que **solo se descargaba en `/app/informes`**. Movido
     a `src/styles/report-widgets.css` e importado por `AppLayout`. Verificado en el CSS compilado:
     sale **una sola vez**.
   • Verificado: `npm run build` limpio; 12/12 checks de SQL contra Neon real (incluida la prueba que
     demuestra el bug del `<= hasta`); **28/28 checks funcionales con Playwright** contra las páginas
     VIVAS con sesión real (estructura del grid, diálogo fuera del grid, rescue de `[hidden]`, filtros
     que no destruyen data-attrs, modal interactivo, la guarda de modo edición, borrado global,
     montaje de las 4 gráficas, CSS de DOM inyectado, y ausencia de campos sensibles de Stripe en el
     DOM); **14/14 de permisos y sandbox** creando miembros temporales con permisos parciales reales
     (y borrándolos al terminar). Paridad i18n ES/EN confirmada por script.
   ⚠️ **Fuera de alcance, documentado:** persistir `balance_transactions` en Neon (tabla + webhooks
     `payout.paid`/`payout.failed`) para histórico de comisiones sin pegarle a Stripe — requiere
     migración y config manual en el dashboard de Stripe. Y traducir a i18n los `aging[].label` /
     `histograma[].label` hardcodeados en español en `queries.ts` (los consumen 5 llamadores; las
     páginas nuevas traducen por `key` e ignoran el `label`).

✅ **Consolidación de Informes — 3 regresiones de la extracción, corregidas (ago 2026)** —
   tras unificar la analítica en `/app/informes` (desplegable de informes, widgets
   personalizables, motor de pronóstico único), André reportó que **se rompió Inicio**:
   widgets a ancho completo en vez de en columnas, gráficas vacías, y los botones de
   edición los tres visibles a la vez. Tres causas raíz, todas del mismo tipo:
   • ⚠️ **El grid de widgets desapareció en LAS DOS páginas — CSS scopeado que no alcanza
     al componente.** `index.astro` definía `#dashWidgets { display: grid }` e
     `informes.astro` definía `#reportWidgets { display: grid }`, ambos en su `<style>`
     **scopeado**. Pero el contenedor lo renderiza `WidgetGrid.astro`, así que **nunca
     recibe el `data-astro-cid-*` de la página anfitriona** → ninguna de las dos reglas
     matcheaba y los widgets caían a `display:block`, apilados a ancho completo. Además
     las dos páginas tenían implementaciones DIVERGENTES del mismo grid (`data-span`
     directo vs. `--widget-span`, gap 1.4rem vs 1rem, breakpoints distintos). Fix: una
     sola implementación en **`src/styles/widgets.css`**
     (global, ya importada por `AppLayout`), llaveada por `[data-widget-grid]`, con los
     `data-span`, los breakpoints y el modo edición compartidos. Las dos copias scopeadas
     se borraron.
   • ⚠️ **Carrera del evento `cord:range` — las gráficas dependientes del rango nunca
     recibían datos.** `DateRangePicker` emitía el `cord:range` inicial dentro de su
     `initializeAll()`. Astro emite los `<script>` como módulos, que corren **después del
     parseo** (`readyState === 'interactive'`, nunca `'loading'`) y **en orden de
     documento**; el picker vive en `slot="topbar-actions"` (temprano en el DOM), así que
     su chunk corre **antes** que el `<script>` de la página → el listener todavía no
     existía y el evento inicial se perdía. Síntoma exacto: las gráficas estáticas
     (sparkline, segbar de pipeline) pintaban y las del rango (hero, embudo) quedaban
     vacías. Fix: `initialize()` devuelve el emit inicial y `boot()` lo dispara en
     `DOMContentLoaded` (que ocurre **después** de todos los módulos diferidos), con
     `setTimeout(0)` como respaldo si ya pasó. ⚠️ De paso se encontró que `initialize()`
     tiene salidas tempranas y devuelve `undefined` en esos casos — sin filtrar, **un
     solo picker mal formado tumbaba el arranque de todos los demás**; ahora se filtra.
   • ⚠️ **`[hidden]` pisado por un `display` de autor** (trampa ya documentada del
     proyecto, tercera vez): `.reports-edit-btn { display: inline-flex }` le ganaba al
     `[hidden]{display:none}` del navegador → Personalizar + Listo + Restablecer se
     pintaban los tres a la vez. `index.astro` sí tenía su `.dash-edit-btn[hidden]`;
     `informes.astro` no. Agregado.
   • **Paridad tipográfica:** el markup de los informes usa `.kpi-label`, pero esa clase
     estaba **scopeada en `index.astro`** → en informes no aplicaba y las etiquetas salían
     más grandes. `.kpi-card`/`.kpi-label`/`.kpi-num`/`.kpi-sub` se promovieron al
     `<style is:global>` de `AppLayout` (junto a `.sec-head`/`.sec-title`, mismo criterio),
     y `.report-kpi-value` se alineó a `.kpi-num` (1.9rem, navy, `tabular-nums`).
   • **Selector de informe + fechas anclados a la derecha siempre** (`margin-left: auto`,
     que no depende del ancho del hermano) — antes el breakpoint de 560px los pasaba a
     `flex-start`. Se eliminó ese override.
   • Verificado: `npm run build` limpio, `npx astro check` sin errores nuevos, y un
     **harness de Playwright sobre el JS COMPILADO** (`.vercel/output/static/_astro`,
     servido por HTTP porque los chunks se importan entre sí con rutas relativas) que
     reproduce el orden real del DOM — chunk del picker primero, listener de la página
     después — y confirma que el evento inicial SÍ llega (`initial=true key=30`) y que el
     panel se portalea al `<body>`. En el CSS compilado se confirmó que el grid sale una
     sola vez y que no queda ningún `#dashWidgets`/`#reportWidgets` con `display:grid`.

---

✅ **Clientes y Productos rediseñados estilo Apple + páginas de detalle + fix del bug
   de scroll del modal (ago 2026)** — André pidió llevar `/app/clientes` y
   `/app/productos` a la misma estética Apple del dashboard, con capturas de Stripe
   (`/customers`/`/products`) como referencia: filtros tipo chip, clic en la fila entra
   al detalle (editar pasa a un botón), páginas de detalle con métricas calculadas, y
   reportó un bug real — el modal de "Nuevo cliente" perdía el header y el botón de
   guardar al abrir la sección fiscal, porque scrolleaba el `<dialog>` completo en vez de
   un área interna.
   • **Fix de raíz del modal:** los 4 diálogos de la app (`clientModal`, `prodModal`, los
     2 `importModal`, `kitDlg`) se reestructuraron a **head fija · body scrolleable ·
     footer fijo** (`.m-head`/`.m-body`/`.m-foot`, `.modal{max-height:min(86dvh,...);
     overflow:hidden}` + `.m-body{flex:1 1 auto;min-height:0;overflow-y:auto}`). Nuevo
     helper global `window.cordWireModal(dlg)` en `AppLayout.astro` (hairlines de
     head/foot que aparecen solo cuando hay contenido oculto por scroll, vía
     `ResizeObserver`). ⚠️ **Bug real encontrado de paso:** los 3 pasos del importador CSV
     (clientes y productos) se pintaban SIMULTÁNEAMENTE — faltaba
     `.imp-step[hidden]{display:none}` (mismo patrón ya documentado del proyecto: un
     `display` de autor siempre le gana al `[hidden]` del navegador).
   • **CSS unificado en `src/styles/modal.css`** (nuevo, hoja compartida — un `<style>`
     scopeado nunca habría alcanzado los 2 diálogos que no viven en la página) con la
     regla de que CADA selector va prefijado por `.modal` para no filtrarse a otros
     grupos de chips de la página (ej. términos/divisa del editor).
   • **`ClientModal.astro` revivido** (estaba huérfano, 0 imports) y **`ProductModal.astro`
     nuevo** — ambos con un **contrato por `CustomEvent` sobre `document`**
     (`clientmodal:open/saved/deleted`, `prodmodal:open/saved/deleted`) en vez de import de
     módulo, porque el editor de cotizaciones usa `<script is:inline define:vars>` (no
     puede importar) mientras que las listas usan `<script>` bundleado normal. El modal de
     "Nuevo cliente" que vivía DUPLICADO dentro de `cotizaciones/nueva.astro` (~90 líneas
     de CSS copiadas + ~30 divergentes, con `#f5f5f7`/`#fff` hardcodeados → roto en dark
     mode) se eliminó por completo; ahora `nueva.astro` monta `<ClientModal showDelete=
     {false} />` y solo escucha `clientmodal:saved` para insertar/seleccionar el `<option>`
     nuevo sin recargar. ⚠️ Se encontró que `nueva.astro` NUNCA importaba
     `styles/modal.css` — bug real que habría dejado el modal sin estilo; corregido.
   • **Queries nuevas (`src/lib/queries.ts`), sin `cached()` (editar → volver refleja el
     cambio de inmediato):** `getCliente(id)` (ficha + tasa de cierre, cerrado/pipeline/
     saldo abierto/cobrado —union disjunta con cobros de igualas recurrentes, mismo
     patrón que `getCobros()`—, uso de crédito, descuento cedido, días de silencio, top 5
     productos, últimas 10 cotizaciones, serie de 12 meses) y `getProducto(id)` (importe
     cerrado, unidades vendidas, tasa de cierre, realización de precio min/prom/max,
     descuento cedido, margen de lista vs. **margen realizado** —`null` explícito si
     `costo_unitario` histórico es 0, para no inventar un margen falso del 100%—, top 5
     clientes, últimas cotizaciones, kits que lo incluyen). `getClientes()`/
     `getProductos()` ganaron campos aditivos (`telefono`, `origen`, `createdAt`,
     `descripcion`, contadores de cotizaciones). `cotizacion_items` no tiene `org_id` — el
     aislamiento multi-tenant sale siempre del `join cotizaciones`. `/api/productos` ganó
     soporte para `descripcion` (la columna ya existía, la API nunca la aceptaba).
   • **Páginas de detalle nuevas** `clientes/[id].astro` y `productos/[id].astro` (mismo
     patrón que `cotizaciones/[id].astro`: `Promise.all` + redirect si no existe, crumbs,
     `.detail-grid` con sidebar sticky) — franja de métricas (`.surface-card`, la única
     superficie tipo card por la regla anti-grid del proyecto; el resto va hairline),
     crédito usado vs. límite, negociación (descuento cedido), sparkline de actividad de
     12 meses (`src/lib/chart.ts`), listas de cotizaciones/qué-le-vendes/quién-lo-compra/
     kits, y sidebar con contacto (mailto/tel/WhatsApp)/condiciones/estado fiscal/
     metadatos/eliminar. "Editar" abre el modal compartido (`showDelete={false}`, ya hay
     un botón de eliminar dedicado en el sidebar); al guardar, recarga la página. El CTA
     "Nueva cotización" del detalle de cliente usa el `?cliente=<uuid>` nuevo que
     `nueva.astro` ahora soporta para preseleccionar cliente (aditivo, no interfiere con
     `?draft=`).
   • **`clientes.astro` movido a `clientes/index.astro`** (evita colisión de rutas con el
     `[id].astro` nuevo) — de paso se eliminó una query `getCotizaciones()` completa que
     el archivo viejo cargaba solo para contar cotizaciones por cliente EN MEMORIA
     comparando por nombre de empresa; ahora `getClientes()` cuenta con un `left join
     lateral` en una sola query. Ambas listas (`clientes/index.astro`/
     `productos/index.astro`) ganaron barra de filtros tipo chip (Todos/Con cotizaciones/
     Sin cotizar/Con nivel/Con crédito/Sin fiscal para clientes; Todos/Activos/Inactivos/
     Con volumen/Sin costo/Margen bajo para productos, contadores calculados server-side)
     + selector de orden, combinados client-side con la búsqueda ya existente y
     persistidos en `?f=&s=` vía `history.replaceState`. Las filas pasaron de `<button>` a
     `<div>` con **stretched link** (`<a class="t-rowlink" style="position:absolute;
     inset:0">` + botón de editar como hermano con `z-index` mayor y
     `preventDefault/stopPropagation`) — nunca un `<button>` dentro de un `<a>`, el parser
     lo saca del anchor y rompe el grid en silencio.
   • **`.surface-card`/`.dash-card` promovidas a global** en `AppLayout.astro` (antes
     duplicadas en el `<style>` scopeado de `index.astro`) para que las nuevas páginas de
     detalle las puedan usar sin reinventar la sombra compuesta de 3 capas.
   • **Gráficas: NO se creó una librería nueva** — ambas fichas reutilizan tal cual el
     motor SVG/vanilla-TS que ya existía en `src/lib/chart.ts` (el mismo que usa
     `/app` para sus 9 tipos de gráfica: línea, combo, barras, hbar, embudo, dona,
     segbar, sparkline, gauge — documentado ahí desde antes de esta sesión). La ficha
     de cliente monta `mountSparkline()` para la fila "Actividad · 12 meses" (import
     normal en un `<script>` bundleado, con los valores mensuales viajando por un
     `data-values` JSON en el propio `<div>`, mismo patrón que `index.astro`). ⚠️ Detalle
     técnico real: el CSS de este motor (`.cd-chart-wrap`, `.chx-empty`, tooltips, etc.)
     vive scopeado por PÁGINA en cada consumidor — no hay una hoja global — porque el
     DOM lo inyecta JS en runtime y Astro solo scopea nodos que existían en el server
     render. Cada ficha nueva tuvo que copiar el mínimo necesario (`.cd-chart-wrap`/
     `.chx-empty`) en su propio `<style>`; no se tocó `chart.ts` ni se le agregó nada.
     Se evaluó agregar un `mountGauge()` (anillo de progreso, mismo motor) para "Tasa de
     cierre"/"Margen realizado" pero se descartó para no romper la consistencia visual
     de la franja de métricas (`.dc-kpis`/`.dp-kpis`), donde el resto de los números son
     texto plano — queda como mejora natural de una pasada futura si se quiere ese
     acento visual.
   • **Pasada de refinamiento visual (mismo día, mismo pedido de André: "puede ser
     mejor"):** las dos páginas de detalle ganaron una franja de identidad
     (`.d-head`/`.dh-*`) calcada 1:1 del patrón ya establecido en
     `cotizaciones/[id].astro` — avatar squircle (iniciales del cliente / ícono de caja
     para producto, con anillo de color por nivel en clientes y estado atenuado si el
     producto está inactivo) + badges (nivel/fiscal/origen o activo/con-volumen) + una
     línea de meta (contacto o SKU·unidad) a la izquierda, y el KPI más importante
     (Cerrado / Importe cerrado) como **hero stat grande** a la derecha — antes vivía
     aplanado dentro de la franja de métricas, compitiendo visualmente con el resto.
     La franja de métricas se reacomodó para no repetir ese número (ahora muestra
     Cotizaciones/Cerradas en su lugar). Filas de listas (cotizaciones, qué-le-vendes,
     compradores, kits, precios por volumen) pasaron de un hover plano de `opacity`
     a fondo `--color-bg-soft` + `border-radius` + chevron que se desliza en hover
     (mismo lenguaje de afordancia que ya usan los rankings del dashboard), y los
     botones primarios/secundarios ganaron `:active{transform:scale(0.97)}` (Regla de
     Diseño 5 — CTAs "responden con ligera reducción en hover/active", que se había
     quedado a medias en la primera pasada).
   • Verificado: `npm run build` limpio + `npx astro check` sin errores nuevos en ningún
     archivo tocado (el baseline de errores preexistentes del repo, ajeno a esta sesión,
     no cambió).

---

✅ **Pestañas de navegación contextual refinadas (ago 2026)** — el `page-tabs` del
   `AppLayout` abandona el subrayado pesado de App Store/Music. Las vistas relacionadas
   (Finanzas, Analítica, Equipo; Cobranza, IA y Flujo; Productos y Kits) comparten ahora
   un selector segmentado compacto: pista translúcida, pestaña activa blanca y apenas
   elevada, estados hover/active/focus visibles y equivalente oscuro. El cambio vive en
   `src/layouts/AppLayout.astro`; cada grupo declara únicamente `ph-tabs`, sin duplicar
   estilos locales.

---

✅ **Analítica convertida en diagnóstico comercial (ago 2026)** — `/app/analitica`
   deja de repetir el resumen de Inicio y pasa a responder dónde se frena el cierre y
   qué trabajo comercial conviene hacer primero.
   • **Nueva lectura `getAnalyticsDiagnosis()`** en `src/lib/queries.ts`: cohorte de
     90 días con serie diaria, embudo, pérdida por rechazo/vencimiento, descuentos por
     producto, concentración de pipeline por cliente y cotizaciones sin actividad por
     siete días. El pipeline por estado se declara explícitamente como fotografía viva,
     separado del histórico para no mezclar dos semánticas.
   • **Nueva superficie de Analítica:** tendencia intercambiable (cotizado/cerrado/cobrado),
     cuello de botella entre transiciones del embudo, pipeline segmentado, lista enlazable
     de seguimientos detenidos y rankings de descuento/pipeline. Consume las primitivas
     existentes de `src/lib/chart.ts` (línea, funnel, barra segmentada y barras
     horizontales); no se alteró la librería de gráficas.

---

✅ **Aviso de consentimiento de cookies + PostHog/Resend agregados al aviso de privacidad
   (ago 2026)** — André preguntó si tras el trabajo de dashboards de PostHog había que
   actualizar legales. Auditoría rápida de `privacidad.astro` encontró que la Política de
   Cookies (§05) solo mencionaba **Vercel Analytics**, y la tabla de Subencargados (§06)
   no listaba **PostHog** ni **Resend** — un hueco real, ya que PostHog identifica usuarios
   (email, plan, rol) y coloca un identificador persistente.
   • **`src/components/CookieConsent.astro`** (nuevo) — banner de consentimiento estilo
     Apple: tarjeta flotante squircle (`border-radius:26px`, sombras compuestas
     multicapa) abajo-izquierda en desktop, **bottom-sheet a todo lo ancho en móvil**
     (`env(safe-area-inset-bottom)`, `border-radius` solo arriba, CTAs apiladas). Entrada/
     salida con `translateY + scale` y `var(--ease-spring)`, `prefers-reduced-motion`
     respetado. Botones pill 999px (`all:unset` + reset explícito, mismo patrón que
     `.tb-icon`/`.pr-name-wrap` documentado en el proyecto). Tema oscuro vía
     `html[data-theme="dark"]` (no-op en la landing, donde ese atributo nunca se setea;
     activo dentro de la app).
   • **Gating real de PostHog, no solo aviso cosmético:** los dos `posthog.init(...)` del
     proyecto (`Layout.astro` y `AppLayout.astro`) ganaron `opt_out_capturing_by_default:
     true` — sin decisión del usuario, PostHog **no captura nada** (ni el pageview
     automático, ni `identify()`). `CookieConsent` es el ÚNICO que llama
     `posthog.opt_in_capturing()`/`opt_out_capturing()`, según `localStorage
     ['cord_cookie_consent']` (`'accepted'|'rejected'`) — compartido entre `/` y `/app`
     porque son el mismo origen, así que la decisión no se vuelve a preguntar al cruzar
     entre la landing y la app. Vercel Analytics NO se gatea (no usa cookies, no
     identifica a nadie — ver §05 del aviso), sigue siempre activo.
   • **Montado site-wide:** `<CookieConsent lang={...}>` se agregó al `<body>` de
     `Layout.astro` (landing, legales, y `/q/[token]` que reutiliza este layout) y de
     `AppLayout.astro` (app autenticada) — **NO** en `EmbedLayout.astro` (el cotizador
     embebible de Cord Elements en el iframe de un tercero; un banner ahí sería una
     intrusión absurda dentro de un widget incrustado, y ese layout de hecho no inicializa
     PostHog en absoluto).
   • **Reabrir preferencias:** `window.cordOpenCookiePrefs()` (expuesto por el componente)
     + botón "Administrar preferencias de cookies" agregado a la sección de Cookies de
     `/privacidad` (ES+EN) para que un usuario que ya decidió pueda cambiar de opinión sin
     borrar `localStorage` a mano.
   • **`privacidad.astro` (ES+EN) actualizado:** la Política de Cookies (§05) ahora separa
     3 categorías con precisión (antes 2, y la segunda mezclaba dos productos con
     comportamiento distinto): Estrictamente Necesarias (siempre activas), **Cookies de
     Analítica de Comportamiento (PostHog)** — nueva, explícita sobre el identificador
     persistente y que solo se activa tras aceptar — y **Medición sin Cookies (Vercel
     Analytics)** — reescrita para aclarar que es agregada/anónima por diseño y por eso NO
     depende del aviso. Tabla de Subencargados (§06) ganó 2 filas: **PostHog** y
     **Resend**; la fila `PAC (SAT)` se renombró a `PAC (SAT) — Facturapi` para nombrar al
     proveedor real (antes genérico). Fecha de "última actualización" bumpeada.
   ⚠️ **Fuera de alcance a propósito:** un banner de consentimiento GRANULAR (categoría por
     categoría, tipo OneTrust) no se construyó — con un solo proveedor de analítica
     gateable (PostHog) y uno que nunca necesita gate (Vercel Analytics), un selector
     binario Aceptar/Solo necesarias cubre el caso real sin la complejidad de un centro de
     preferencias completo. Si se agregan más herramientas de tracking a futuro, revisar
     si sigue siendo suficiente.
   • Verificado: `npm run build` limpio; HTML del build inspeccionado confirmando que el
     banner se monta en la landing (`/como-funciona`) y en `/privacidad`, que las 2 filas
     nuevas de la tabla (PostHog/Resend) y el botón de reabrir preferencias llegaron al
     HTML generado. ⚠️ `/en/privacidad` y `/en/terminos` (los wrappers de
     `src/pages/en/`) son SSR, no prerender (el `export const prerender = true` vive en el
     archivo ES, no se hereda al re-exportarlo desde el wrapper) — por diseño no aparecen
     como HTML estático en `.vercel/output/static/en/`, pero sirven correctamente en
     runtime; no es una regresión de esta sesión, es el comportamiento preexistente de
     ambos wrappers.

---

✅ **Suite de dashboards de PostHog — construida en vivo vía MCP (ago 2026)** — continuación
   directa de la entrada "PostHog — auditoría completa y endurecimiento" de abajo: con el
   MCP oficial de PostHog ya conectado (proyecto "Cord", id `535370`, org `Cord`), se
   construyeron en vivo los 6 dashboards que habían quedado diseñados pero no
   materializados (el roadmap de `CLAUDE.md` los marcaba `[ ]`).
   • **Hallazgo crítico previo a construir cualquier cosa:** una verificación por SQL
     directo (`execute-sql` contra la tabla `events`) mostró que el proyecto de PostHog
     conectado tenía **exactamente 5 eventos en toda su historia** — `$pageview`/
     `$pageleave`/`$autocapture` de dos sesiones sueltas (`localhost:4321/sign-in` y
     `cordhq.app/precios`, 30-31 jul 2026) — **cero eventos de negocio reales** (ni un solo
     `sign_up_completed`, `quote_created`, `payment_received`, etc.), pese a que la
     auditoría de código de la entrada de abajo confirma que esos `capture()` sí están
     cableados. Es decir: el código dispara los eventos, pero **no hay evidencia de que
     lleguen a este proyecto específico de PostHog en producción**. Señalado a André antes
     de construir nada; decidió proceder de todos modos para dejar los dashboards listos
     y que poblaran solos en cuanto el tráfico real aterrice — pero el hallazgo en sí es
     la señal más importante de esta sesión: **hay que confirmar que `PUBLIC_POSTHOG_KEY`/
     `PUBLIC_POSTHOG_HOST` en Vercel apunten exactamente a este proyecto (`phc_yemkm...`,
     id `535370`)** antes de asumir que el problema es otra cosa si los dashboards siguen
     vacíos más adelante.
   • **6 dashboards, 17 insights, todos con el mismo filtro por default**
     `is_sandbox=false AND is_demo=false` (propiedades de evento, aplicadas a nivel
     `properties` de cada query — nunca como breakdown) y `filterTestAccounts:true`:
     - **Growth & Activation** (`dashboard/1944817`): funnel `sign_up_completed → quote_created
       → quote_sent → payment_received` (ventana de 60 días, no 14 — un ciclo de venta B2B
       puede tardar); `sign_up_completed` por `sign_up_method`; funnel
       `ai_draft_used → quote_created` en ventana de 1 día (prueba el "aha moment" que ya
       sospechaba el roadmap del proyecto); WAU/MAU sobre `event: null` ("todos los
       eventos") como proxy de engagement general del producto.
     - **Revenue** (`dashboard/1944818`): **`payment_received` (suma de `amount`) es la
       ÚNICA fuente de ingreso en las 4 insights de este dashboard — `quote_marked_paid`
       (log manual del operador) NUNCA se usa para dinero real, por regla explícita.**
       Ingreso por método de pago y por `is_recurring` (uso vs. iguala), más
       `subscription_upgraded`/`downgraded`/`canceled` como señal de expansión/churn.
     - **Core Funnel: Cotización → Cobro** (`dashboard/1944819`): funnel completo
       `quote_created → quote_sent → quote_viewed → quote_approved → payment_received`
       (ventana de 90 días, por los términos de crédito Net 30/60) + la misma cascada con
       breakdown por `source` en `quote_created` (manual/ai_draft/duplicate).
     - **Account Health & Retention** (`dashboard/1944820`): retención semanal
       `sign_up_completed → $pageview`; `subscription_canceled` (conteo + `avg` de
       `tenure_days`); altas nuevas por la propiedad de PERSONA `plan` (poblada por
       `identify()` desde la auditoría anterior — **no depende del add-on de pago de Group
       Analytics**, es un breakdown de persona normal).
     - **Feature Adoption** (`dashboard/1944821`): trend de usuarios únicos (`math: dau`,
       proxy de org ya que estas son acciones de admin) para los 8 eventos de adopción
       (`stripe_connect_activated`/`cfdi_first_timbrado`/`team_member_invited`/`_accepted`/
       `api_key_created`/`kit_used`/`cobranza_ia_activated`/`checkout_started`). ⚠️ **Se
       simplificó a conteos crudos en vez de "% de orgs activas"** — ese ratio necesita una
       definición estable de "org activa" como denominador (8 fórmulas `A/B` por evento
       era demasiada complejidad frágil para una sola sesión); queda como iteración natural
       futura, no se forzó una métrica endeble.
     - **Acquisition** (`dashboard/1944822`): `sign_up_completed` por
       `$initial_utm_source`/`$initial_utm_campaign` (propiedades de PERSONA, pobladas por
       el autocapture de PostHog — confirmado ya funcional en la auditoría anterior, sin
       código nuevo); funnel `$pageview → sign_up_completed → payment_received` con
       breakdown por `$initial_utm_source`.
   • **Verificación real, no solo "se creó":** cada dashboard se verificó corriendo
     `insight-query` sobre su insight principal — las 6 corridas devolvieron resultados
     bien formados (columnas/fechas/estructura correctas) con valores en cero, coherente
     con el hallazgo de arriba (proyecto sin datos de negocio), nunca un error de query.
     Ningún dashboard se reportó como "listo con datos" — todos quedan documentados como
     "corre correctamente, poblará solo cuando haya tráfico real".
   • **Notas técnicas del MCP para quien reconstruya esto:** `insight-create` exige que
     TODA query (incluidos `FunnelsQuery`/`RetentionQuery`, no solo `TrendsQuery`) vaya
     envuelta en `{"kind":"InsightVizNode","source":{...}}` — pasar la query "pelada" da
     `Invalid input` sin más detalle. El campo `properties` de nivel superior en
     `TrendsQuery`/`FunnelsQuery` es un ARRAY plano de filtros (AND implícito entre ellos),
     no el objeto anidado `{type:"AND", values:[...]}` que aparece en algunos ejemplos
     viejos de la documentación del propio tool.
   • **Pendiente natural (no bloqueante, documentado):** confirmar el mismatch de
     `PUBLIC_POSTHOG_KEY`/`_HOST` mencionado arriba; si se confirma que sí es el proyecto
     correcto y el tráfico real tarda en aparecer, revisar el fix de CSP de la entrada de
     abajo contra el valor REAL desplegado en Vercel (no solo el `.env.example`). La
     "% de orgs activas" en Feature Adoption y el breakdown de retención por plan (Fase A5)
     quedan como posibles iteraciones futuras.

✅ **PostHog — auditoría completa + endurecimiento para escalar (ago 2026)** — André
   pidió analítica "nivel Apple/Stripe/ElevenLabs" para tomar decisiones de
   crecimiento. Una auditoría de código encontró que PostHog estaba solo a
   medias cableado desde la entrada de jul 2026 (abajo) — varios bugs reales,
   no solo huecos cosméticos:
   • **Bug crítico de CSP corregido:** `.env.example` documenta
     `PUBLIC_POSTHOG_HOST=https://us.i.posthog.com` como default, pero el CSP
     de `src/middleware.ts` solo permitía `https://us.posthog.com` (sin
     `.i.`) — si la variable de entorno real usaba el default documentado, el
     navegador bloqueaba EN SILENCIO todo el tracking del lado cliente (sin
     error visible salvo en devtools). Se blindó `script-src`/`connect-src`
     con los tres hosts (`us.posthog.com`, `us.i.posthog.com`,
     `us-assets.i.posthog.com`).
   • **`sign_up_completed` estaba roto:** la entrada original de abajo decía
     "eventos iniciales: sign_up_completed" pero el código real
     (`posthog-events.ts`) era 100% muerto — cero call-sites, perdido en la
     migración de Clerk a auth propio. Reescrito server-side, atado a
     momentos reales de cuenta nueva (nunca a cada login): en
     `verify-email/confirm.ts` (email, token de un solo uso) y dentro de la
     rama `insert into users` de `google/callback.ts`/`apple/callback.ts`
     (OAuth, nunca en login/link de una cuenta ya existente).
   • **`posthog-events.ts` eliminado** (código muerto — las 7 llamadas reales
     vivían como `posthog.capture()` crudo inline en `.astro`, nunca usaban
     esos wrappers tipados).
   • **Contaminación sandbox/demo cerrada:** cero call-sites (cliente o
     servidor) filtraban la org sandbox del "Entorno de prueba" ni la org
     demo permanente — toda esa actividad ficticia se mezclaba con datos
     reales de clientes en PostHog. Columna nueva `orgs.is_demo` (backfill
     `true` para la fila `rfc='FERR010203XYZ'`, antes solo detectable por ese
     RFC mágico). Nuevo helper global `window.cordTrack(event, props)`
     (definido en `AppLayout.astro`/`Layout.astro`) que etiqueta
     `is_sandbox`/`is_demo` en TODO capture — reemplazó las 7 llamadas
     `posthog.capture()` crudas de `q/[token].astro`,
     `cotizaciones/[id].astro` y `cotizaciones/nueva.astro`. Lado servidor:
     `trackPaymentReceived` (`posthog-server.ts`) gana los mismos 2 params,
     poblados en los 4 call-sites de `stripe/webhook.ts` desde un select
     barato de `orgs.sandbox_of`/`is_demo`.
   • **`identify()`/`group()` enriquecidos:** antes solo `company_name`; ahora
     `AppLayout.astro` manda `plan` (de `orgs.plan`), `role` (de
     `org_members.rol`), y `group('company', ...)` gana `plan`/`created_at`
     (columna `orgs.created_at` ya existía, solo faltaba exponerla en
     `getOrg()`) — sin esto ningún dashboard podía segmentar retención/
     activación por plan de pago. ⚠️ Group Analytics es un **add-on de pago**
     de PostHog — sin contratarlo, `group()` sigue siendo un no-op inofensivo.
   • **10 eventos nuevos de alto valor** (helper genérico `trackServer()` en
     `posthog-server.ts`, mismo contrato de identidad/tagging que
     `trackPaymentReceived`): `subscription_upgraded`/`downgraded` y
     `subscription_canceled` (con `tenure_days`) en `syncSubscription`/
     `downgradeToFree`; `payment_failed` en `setStatusByCustomer` (plan de
     Cord) y `recurringInvoiceFailed` (iguala); `stripe_connect_activated`
     en `updateAccountStatus` (flip `false→true` de `charges_enabled`, no
     cada reconfirmación); `cfdi_first_timbrado` en `PATCH
     /api/cotizaciones/[id]` (solo el primer timbrado exitoso de la org,
     contado ANTES de emitir); `team_member_invited`/`accepted` en
     `api/equipo.ts`/`api/equipo/join.ts`; `api_key_created` en
     `api/keys.ts`; `cobranza_ia_activated` en `api/agentes.ts` (solo al
     ACTIVAR, no al desactivar); `checkout_started` en
     `api/q/[token]/payment-intent.ts` (cierra el hueco entre "vista" y
     "pagada" del funnel público); `kit_used` en el editor
     (`cotizaciones/nueva.astro`, al insertar un kit).
   • **Bug real encontrado y corregido de paso (no relacionado a PostHog, en
     el mismo archivo/línea que se tocaba):** en `cotizaciones/nueva.astro`,
     el bloque de captura de `quote_created` para creación NUEVA (no
     borrador) referenciaba `payload.base_currency`, pero `payload` nunca se
     declaraba en esa rama (`else`) — `ReferenceError` en silencio, atrapado
     por el `catch` del handler, que cancelaba el `setTimeout` del redirect a
     la cotización recién creada. Cualquier usuario creando una cotización
     nueva (no editando un borrador) se quedaba viendo el toast de éxito sin
     ser redirigido. Corregido guardando `buildPayload(send)` en `payload`
     también en esa rama.
   ⚠️ **Pendiente (requiere acceso en vivo a PostHog vía su MCP, fuera del
     repo):** la suite de 4-6 dashboards (Growth & Activation, Revenue, Core
     Funnel Cotización→Cobro, Account Health & Retention, Feature Adoption,
     Acquisition) — diseñada y documentada en el plan de la sesión, pendiente
     de construirse en vivo una vez André conecte el conector MCP de
     PostHog. Roadmap futuro (alertas, session replay, feature flags,
     digest semanal) documentado ahí también, no repetido aquí.

✅ **PostHog Analytics (jul 2026):** Analítica de producto en `Layout.astro` (landing) y `AppLayout.astro` (app + identidad). Eventos iniciales: `sign_up_completed` (onboarding/workspace) y `quote_created` (nueva.astro + [id].astro duplicate). Coexiste con Vercel Analytics (web vitals vs. product analytics).

✅ **Workbench v3.1 — atajos reales, UTC en todas las pestañas, y desbloqueo de 2FA (jul 2026)** —
   André reportó que "los atajos de teclado y lo del horario no sirven". Ambos eran bugs míos de
   v3: **anuncié funcionalidad que no implementé**.
   • **Los atajos `W` / `⇧W` NO existían.** El menú ⋯ los listaba pero nunca se escribió el
     handler — solo `Escape` estaba implementado. Ahora sí: `W` abre/cierra el dock y `⇧W` alterna
     pantalla completa, con los mismos guards que los atajos globales de `AppLayout` (`typing()`
     para no dispararse dentro de un input, sin modificadores, Cmd+K cerrado) más dos propios:
     nunca con un modal del Workbench abierto ni con el modo dev apagado.
     ⚠️ **Bug de robustez encontrado al probarlo:** el guard de Cmd+K era
     `if (!document.getElementById('cmdk')?.hidden) return;` — si `#cmdk` no existiera,
     `undefined` hace que `!undefined` sea `true` y **todos los atajos mueren en silencio**.
     Reescrito a la condición real: "existe Y está abierto".
   • **El toggle "horas en UTC" solo alcanzaba 2 de 5 pestañas.** El formateo en cliente depende
     de que el SSR emita el ISO crudo en `data-ts`, y solo Registros y Eventos lo hacían; Resumen,
     Webhooks y el log de entregas mostraban texto ya formateado por `fmtRelative` del servidor,
     así que el toggle no los tocaba (y Resumen es la pestaña por defecto — de ahí el "no sirve").
     Se expuso el ISO en `getApiActivity()` (`recent[].ts`), `getWebhooks()` (`ultimaEntregaTs`) y
     `getWebhookDeliveries()` (`ts`), y los dos renders que ocurren en cliente (log de entregas y
     "Actualizar" de la actividad) ahora emiten `data-ts` y llaman `paintDates()`.
   • ⚠️ **Bug real destapado por el test:** el debounce de 400 ms del buscador de Registros seguía
     vivo al cambiar de pestaña — al dispararse, `loadTab('registros')` **pisaba el contenido de
     la pestaña que el usuario acababa de abrir**. Corregido con dos guardas: `loadTab` cancela el
     timer cuando el destino no es Registros, y el callback verifica `currentTab` antes de cargar.
   • **Icono de rayo del banner de "Entorno de prueba" eliminado** a petición de André
     (`.test-banner-icon` en `AppLayout.astro`, markup + CSS). El resto del banner ámbar sigue igual.
   • ⚠️ **Pantalla en blanco al entrar con `hola@flouvia.com` — causa raíz encontrada:** su org
     "Mi negocio" tenía `require_2fa = true` y la cuenta **no** tiene 2FA en Clerk
     (`two_factor_enabled: false`, verificado contra la API real), así que el gate de
     `AppLayout.astro:33` la redirigía a `/app/ajustes/cuenta?require2fa=1` en TODA página de
     `/app`. Explica por qué solo pasaba con ese correo: era la única org con el flag activo. Se
     desactivó el flag SOLO en esa org (update acotado por id, con estado verificado antes y
     después) y se dejaron sus 3 membresías como `owner`/`activo` con el jsonb de permisos
     completo. Nota: `memberCan()` ya devuelve `true` para cualquier `rol==='owner'`, así que los
     permisos nunca fueron el bloqueo — el jsonb se llenó para que la UI de Equipo los muestre
     marcados. ⚠️ Si se vuelve a activar "Exigir 2FA al equipo" sin tener 2FA configurado, el
     bloqueo se repite; el toggle de Ajustes › Seguridad debería avisarlo (pendiente).
   • **Verificado:** build limpio, `_tab_*` sigue vacío, **71/71 checks con Playwright** sobre el
     JS real compilado (17+26+14 de regresión + 14 nuevos que cubren `W`, `⇧W`, el guard de
     escritura, el guard de modal, y que el toggle UTC cambie las fechas en las 3 pestañas con
     fecha), 295 claves i18n con par ES/EN.

✅ **Cord Workbench v3 — pantalla completa, menú de opciones, pestañas Eventos y Salud (jul 2026)** —
   continuación directa de v2 (entrada siguiente). André pidió, con capturas del Workbench de
   Stripe: botón de pantalla completa junto al de cerrar, el menú de 3 puntitos, pestañas de
   Eventos y Salud, y mejorar Registros.
   • **Pantalla completa** (`.wb-dock.is-max`): el panel pasa a `100dvh` con `top:0`, y el grabber
     y la barra se ocultan (en maximizado sobran). Atajo por el botón ⤢ y salida con Escape.
     Persistido en `localStorage` junto al resto del estado. ⚠️ `--wb-h` se queda en el alto de la
     BARRA cuando está maximizado: mover los toasts al tope de la pantalla no aporta nada y su
     z-index (900 > 820) ya los deja encima. `--wb-bar-h` (padding de `.app-content`) no cambia.
   • **Menú ⋯ de opciones**, con toggle "Mostrar las horas en UTC", atajos de teclado y "Acerca de"
     con links a Documentación/OpenAPI. **Sin selector de tema a propósito** (decisión de André:
     el dock es navy siempre; agregarlo obligaría a mantener las dos superficies otra vez).
     ⚠️ El Escape ahora va **en cascada**: menú → modal → maximizado → dock, cada nivel con su
     `return`; sin eso un solo Esc cerraría varias capas de golpe.
   • **Toggle UTC sin round-trip:** el SSR emite el ISO crudo en `data-ts` y el formateo ocurre en
     el cliente (`fmtTs`), así el cambio es instantáneo y no hay que volver a pedir el fragmento.
     Es además la única vía razonable: `fmtRelative` del servidor (`queries.ts:41`) es privada al
     módulo y nunca incluye el año ni la zona.
   • **Pestaña "Eventos" nueva** (`getDevEvents(filtro)`): mezcla DOS fuentes en una línea de
     tiempo, con chips [Todos | Enviados | Internos] — decisión de André, porque `webhook_events`
     solo se llena si hay endpoints configurados y la pestaña saldría vacía para la mayoría.
     (a) **enviados** = `webhook_events` **agrupado por `event_id`** (hay una fila por
     evento × endpoint suscrito, todas con el mismo `event_id`; sin agrupar, un evento entregado a
     3 endpoints se vería como 3 eventos). Estado del grupo: `pending` si alguno sigue en cola,
     `parcial` si mezcla entregados y fallidos, si no el que domine. (b) **internos** = la tabla
     `eventos` (timeline de negocio) con el folio de la cotización. Dos queries + merge en JS, no
     `union all`: los shapes son muy distintos y castear en SQL saldría más frágil.
     ⚠️ **`eventos.detalle` NO se expone** — es texto libre que incluye mensajes de chat del
     cliente, y esta es una vista técnica: mostrarlo filtraría conversaciones a una pantalla de
     developers. Solo viajan el tipo y el folio.
   • **Pestaña "Salud" nueva:** estado general, endpoints con su racha de fallos / desactivados
     (`getWebhooks()`), cola del outbox (pendientes / reintentos vencidos / agotados) y
     distribución de errores. Sin query nueva — reusa `getDevOverview().wh`. `FAIL_WARN_THRESHOLD`
     y `FAIL_DISABLE_THRESHOLD` se **exportaron** desde `webhook-delivery.ts` para no duplicar los
     números mágicos en la UI.
   • **Registros maestro-detalle** (`getApiLogs(filtros)` nuevo): búsqueda por ruta con debounce,
     chips de método y de clase de status (2xx/4xx/5xx), y panel de detalle a la derecha. Los
     filtros viajan como query params al fragmento (mismo patrón que `?range=`) y entran en la
     clave de caché, así ir y volver entre filtros es instantáneo. El **detalle se resuelve 100%
     en el cliente** leyendo los `data-*` de la fila ya renderizada: cero round-trip.
     ⚠️ **`api_requests` NO guarda cuerpos de petición/respuesta** (solo `metodo`, `ruta`,
     `status`, `duracion_ms`, `mode`, `ip`, `key_id`) — el detalle es de metadatos y la vista lo
     dice explícitamente. Decidido con André: guardarlos implicaría persistir datos de clientes
     (RFC, correos, montos) en cada llamada, con su propia política de retención.
     El escape de comodines (`%`/`_`) en la búsqueda se hace antes del `ilike`, para que buscar
     literalmente "50%" no se comporte como patrón.
   • ⚠️ **BUG CRÍTICO reportado por André y corregido:** al **cerrar** el dock estando maximizado,
     `closeDock()` no limpiaba `isMax` → quedaban activos los tres efectos del modo maximizado a
     la vez: el dock seguía estirado a pantalla completa (`top:0`, z-index 855) pero con el panel
     oculto — **un div invisible que se comía TODOS los clics de la app** —, la barra seguía en
     `display:none` y el `<html>` con `overflow:hidden`. Fix en dos capas: (1) `closeDock()` sale
     siempre de maximizado y limpia las clases; (2) defensa en CSS — `is-max` solo surte efecto
     junto con `is-open`, y `.wb-dock:not(.is-open)` es `pointer-events:none` (con la barra en
     `auto`), de modo que un dock cerrado no puede bloquear la pantalla aunque el JS falle. Además
     la restauración inicial fuerza `isMax = st.open ? st.max : false`, porque un `localStorage`
     de antes del fix podía traer `max:true` con `open:false` y dejar la página sin scroll.
   • **Verificado:** build limpio; `_tab_*` sigue vacío (el fragmento nunca vuelve a emitir
     scripts); las queries nuevas corridas contra Neon real — los filtros discriminan sobre los
     datos verdaderos (GET→0, POST→9, 4xx→0, comodín escapado→0 en vez de 9) y los eventos
     internos devuelven 60 filas con folio; **57/57 checks con Playwright** sobre el JS REAL
     compilado (26 nuevos + 17 de regresión de v2 + 14 que reproducen exactamente el bug del
     maximizado: cerrar, comprobar que la barra sigue, que el centro de la pantalla es clicable,
     que un clic real llega al contenido, y lo mismo tras recargar); 245 claves i18n con par ES/EN.
   • **Documentación:** página nueva `docs.cordhq.app` → Desarrolladores → Herramientas →
     **Cord Workbench** (ES+EN) explicando qué es, cómo activarlo y para qué sirve cada pestaña,
     más entrada en el sidebar de `DocsLayout.astro`. De paso se corrigió el **drift de rutas** en
     los docs: las guías decían "Ajustes › API & Webhooks" (ruta que ya no existe desde v2) —
     ahora apuntan al Workbench. Y dos bugs preexistentes de navegación: `/herramientas/elements`
     no existe (es `elements/resumen`), y **33 links dentro de páginas EN apuntaban a la versión
     ES** (`/docs/...` en vez de `/en/docs/...`), así que un usuario en inglés caía en español;
     se normalizaron todos, incluidos los que dependían de un redirect vía `?lang=en`.
   ⚠️ **Regla para el harness de verificación** (mordió dos veces): al extraer el markup del
     componente con regex, el patrón que cierra tags self-closing necesita `\b`
     (`/<(p|div|span)\b.../`) — sin él, `<polyline/>` matchea como `<p>` y **rompe los SVG**
     (el icono de pantalla completa salía con una sola esquina de cuatro). Y los comentarios
     `{/* */}` hay que quitarlos: Astro los elimina al compilar, el harness no.

✅ **Cord Workbench v2 — navy Apple, barra abajo, gráficas y wizard full-screen (jul 2026)** —
   André reportó que el dock seguía "sin CSS", con números raros, que no bajaba, que la barra
   estaba arriba y que "agregar endpoint no sirve". La pasada anterior (ver entrada siguiente) lo
   había empeorado. Investigación contra el BUILD compilado → **tres causas raíz**, ninguna
   estética:
   • ⚠️ **BUG 1 — el CSS del fragmento NUNCA se emitía.** Astro coloca el único
     `maybeRenderHead()` antes del primer elemento HTML del template; en `[tab].astro` ese
     elemento vivía dentro de `{!hasAccess && (...)}`, rama que no se renderiza para un usuario
     CON acceso → la respuesta de `/app/wb/<tab>` salía con **cero `<link>`**. `developers.css`
     nunca cargó; el "reskin" que la pasada anterior eliminó era su ÚNICA fuente de estilo.
     **Fix:** `developers.css` se importa ahora desde `DevWorkbench.astro` (vive dentro de
     AppLayout → Rollup lo fusiona en `AppLayout.*.css`, que sí está en el `<head>`), y el
     fragmento tiene un `<div class="wb-frag">` raíz **incondicional** para que el
     head-instruction quede en un lugar estable. `/app/ajustes/mcp` conserva su propio import.
   • ⚠️ **BUG 2 — los `<script>` del fragmento no se re-ejecutaban.** `renderScript()` emite
     `<script type="module" src=...>`, y un módulo ES con el mismo src corre **una sola vez por
     documento**: al volver a una pestaña cacheada, `reviveScripts()` re-inyectaba el mismo src,
     el navegador lo ignoraba y **todos los botones quedaban muertos** (de ahí "agregar endpoint
     no sirve": funcionaba la primera vez, no la segunda). **Fix estructural:** TODO el JS se
     movió al controlador único de `DevWorkbench.astro`, que **delega por `data-wb-act`** sobre
     `.wb-body`; el fragmento es HTML puro y `reviveScripts()` desapareció. Primera carga,
     pestaña cacheada y `refresh()` son ahora el mismo code path. Los modales también se movieron
     al chasis para que un `innerHTML =` no pueda arrancarlos estando abiertos. i18n vía
     `define:vars` (`window.CORD_WB_I18N`) en vez de ~40 `data-i18n-*`.
     **Verificación decisiva:** `ls dist/client/_astro/_tab_*` debe salir **vacío**.
   • ⚠️ **BUG 3 (colateral, pre-existente en `AppLayout.astro`)** — el bloque `:root` cerraba en
     la línea 469 y dejaba los ~37 tokens `--sb-*` huérfanos fuera de todo selector: el parser
     hacía error-recovery y descartaba **los `--sb-*` en modo claro Y la regla
     `html.sb-collapsed`**. Corregido con un `:root {` explícito. Impacto medido antes/después:
     solo restaura el fondo del badge del sidebar (estaba invisible); cero regresiones.
   • **Layout invertido:** `.wb-panel` va primero en el DOM y `.wb-bar` al final — como `.wb-dock`
     es `fixed bottom:0`, la barra queda pegada al borde inferior y el panel se expande por encima
     (patrón del Workbench de Stripe). **Drag real:** el grabber achica el panel y por debajo de
     150px lo colapsa; arrastrar la barra hacia arriba lo reabre; ambos con pointer capture y
     flechas de teclado. `--wb-h` solo se escribe al soltar (escribirlo en cada `pointermove`
     encolaba una transición de 0.32s por frame en `.toast-stack`/`.onb`).
   • **Navy SIEMPRE vía scope de tokens:** en vez de ~100 overrides, `.wb-dock, .wb-modal`
     **redefine los tokens de tema** (`--surface`, `--color-border`, `--color-text`…) y la cascada
     vuelve navy todo `developers.css` sin tocarlo (`/app/ajustes/mcp` sigue en claro — verificado
     que el scope no se filtra). Solo quedan overrides para los literales hardcodeados que ningún
     token alcanza (fondos de `<code>`, ámbar, azul GET, bloques de terminal, botones copiar).
     ⚠️ `--color-blue-deep` tiene DOS roles (acento de texto vs. fondo sólido con texto blanco):
     como azul claro el acento se lee, pero los botones sólidos quedarían en ~2.2:1 → token aparte
     `--wb-accent-solid`. **No fusionarlos.**
   • **Resumen con gráficas** (`getDevOverview(range)` nuevo en `queries.ts`): serie temporal de
     `api_requests` en barras apiladas éxito/error, distribución 4xx/5xx + top de rutas que fallan,
     panel de Salud (endpoints caídos, cola y reintentos vencidos del outbox), entregas de eventos
     y Recursos para desarrolladores. Selector 24h/7d/14d por **SSR** (`?range=`, la clave del
     caché pasa a `tab|range`). 4 queries en un batch, **sin migración** (usa los índices que ya
     existen). ⚠️ Todo el cálculo de buckets va en **UTC** (`getUTC*`/`setUTC*`) para que las
     claves coincidan con el `date_trunc` de Postgres (sesión en GMT); con horas locales cada
     bucket erraría por el offset del runtime. Huecos rellenados en JS (el repo no usa
     `generate_series`).
   • **Wizard full-screen** para agregar/editar endpoint (pasos "Elegir eventos" → "Configurar
     destino", eventos agrupados por familia). ⚠️ Es un `<div>` en `z-index:860`, **NO** un
     `<dialog showModal()>`: un dialog se promueve al *top layer* y taparía a `window.cordConfirm`
     (un div en z-index 1000), dejándolo inutilizable. Incluye guard de Escape (sin él un solo Esc
     cerraba modal Y dock), `inert` en el fondo, scroll lock y restauración de foco.
   • **4 bugs propios encontrados y corregidos durante la verificación** (ninguno habría salido
     sin probar): (1) colisión de nombres — las barras de la gráfica se llamaban `.wb-bar`, que ya
     era la barra del dock, y la pisaban → renombradas a `.wb-chart-bar`/`.wb-chart-seg`;
     (2) `.wb-panel` tiene `display:flex`, que **anula el atributo `hidden`** → `closeDock()` no
     ocultaba nada; corregido con `.wb-panel[hidden]{display:none}` (regla ya documentada del
     proyecto); (3) el `click` que el navegador dispara al soltar un arrastre deshacía el drag →
     bandera `suppressClick`; (4) `.s-field`/`.s-input` solo existen en el `<style>` de
     `SettingsShell.astro`, así que los campos del wizard salían sin estilo → definidas acotadas
     al workbench.
   • **Verificado:** build limpio; `_tab_*` vacío y `renderScript`=0 en el chunk SSR; las 5
     queries corridas contra Neon real con las claves de Postgres cuadrando 2/2 contra el relleno
     en JS y los totales contra un conteo directo; **17/17 checks funcionales con Playwright** y
     el JS REAL compilado (incluye el escenario exacto del usuario: abrir wizard → cambiar de
     pestaña → volver desde caché → abrir otra vez); las 193 claves i18n usadas tienen par ES/EN.

✅ **Cord Workbench (dock de Desarrolladores) — rediseño Apple + redimensionable (jul 2026)** —
   ⚠️ **SUPERADA por la entrada de arriba.** Esta pasada asumió que `developers.css` daba el
   estilo base y eliminó el bloque de "reskin oscuro" de `workbench.css` — pero ese CSS **nunca
   cargaba** (BUG 1 de arriba), así que el reskin era la única fuente de estilo y al quitarlo el
   dock quedó sin formato. El enfoque de "seguir el tema claro/oscuro de la app" también se
   revirtió: André lo quiere navy siempre. Lo que SÍ sobrevive de aquí: el diagnóstico de la
   altura fija `62vh` sin límite de viewport, y el handle de arrastre (rehecho con colapso).
   • Altura acotada al viewport (`innerHeight - 200px`, mínimo 220px) + handle de arrastre
     `#wbDrag` con pointer events y flechas de teclado, persistido en `localStorage`.
   • Los 2 links de `/openapi.yaml`/`llms.txt` y el mensaje de éxito del prompt de IA usaban
     colores hardcodeados del tema navy viejo (`#7fd1c1` teal, `#6ee7b7` mint) — corregidos a
     tokens.

✅ **Exportar catálogo/clientes a CSV — cableado real (jul 2026)** — en Ajustes › Datos y
   privacidad, el botón "Catálogo y clientes (CSV)" era un placeholder estático ("Próximamente",
   sin link) mientras que "Descargar todo (JSON)" sí funcionaba (`/api/org/export`). André lo
   reportó al ver la pantalla. Se construyó el export real:
   • **`GET /api/productos/export`** y **`GET /api/clientes/export`** (nuevos) — devuelven CSV
     con las MISMAS columnas que sus importadores respectivos (`sku,nombre,unidad,precio,activo`
     y `empresa,contacto,email,telefono,rfc,terminos,limite`), así un archivo exportado se puede
     reimportar sin remapear columnas. Gateados por los permisos `productos`/`clientes`
     (`requirePerm`), BOM UTF-8 + CRLF para abrir limpio en Excel. Helper compartido
     `src/lib/csv.ts` (`csvCell` escapa comillas/comas, `csvFilename` arma el nombre con fecha).
   • **UI (`/app/ajustes/datos`):** el placeholder `.datos-soon` se reemplazó por dos botones
     ghost ("Productos" / "Clientes"), cada uno descarga su CSV vía link `download`. Claves i18n
     nuevas `set.datos.csv_productos`/`csv_clientes` (ES/EN); `set.datos.proximamente` queda sin
     uso en esta pantalla (se deja en el diccionario por si se reutiliza en otro lado).
   • Verificado con `npm run build` limpio.

✅ **i18n de la app interna — COMPLETADO, todo `/app/**` traducido (jul 2026)** —
   André pidió traducir la app al inglés. Se diseñó un sistema de i18n propio (sin librería
   externa), **distinto de `src/i18n/ui.ts`** (que es solo para la landing pública con rutas
   `/en/*` explícitas):
   • **Detección 100% automática por `Accept-Language`, sin toggle manual.** `src/middleware.ts`
     parsea el primer idioma del header (`en` → inglés, cualquier otro → español) y lo guarda en
     el contexto por-request (`ReqCtx.locale`, `src/lib/context.ts`) junto a `orgId`/`testMode` —
     mismo patrón `AsyncLocalStorage` ya usado para esos dos. `currentLocale()` lo expone; la MISMA
     ruta (`/app/cotizaciones`, `/app/ajustes/general`, etc.) sirve en ES o EN según el navegador
     de quien la visita, sin URLs duplicadas.
   • **Diccionario en `src/i18n/app.ts`:** objeto plano `{ es: {...}, en: {...} }` con
     `t(locale, key)` (fallback a español si falta la key) — llenado de forma INCREMENTAL, página
     por página. Convención de namespacing: `sidebar.*`/`topbar.*`/`layout.*` (AppLayout), `q.*`
     (QuoteCard), `email.*` (correos transaccionales), `settings.*` (chassis compartido de
     Ajustes), y `set.<pagina>.*` por cada subpágina de Ajustes (`set.general.*`, `set.eq.*` para
     equipo, `set.api.*`, etc.).
   • **Puente para `<script>` no-inline:** un `<script>` normal de Astro (no `is:inline`) no puede
     llamar `t()` en runtime — se le pasan las cadenas necesarias vía atributos `data-i18n-*` en un
     elemento DOM estable, y el script las lee con `el.dataset.i18nXxx || 'fallback en español'`.
     Los `<script is:inline define:vars={{...}}>` (como en `pdf.astro`/`plan.astro`) reciben las
     traducciones directamente como variables precalculadas en el frontmatter — no necesitan el
     puente. Patrón replicado en `equipo.astro`, `webhooks.astro`, `mcp.astro`, `agentes.astro`,
     `integraciones.astro`, `api.astro`, `elements.astro`, `datos.astro`.
   • **Islands de React también traducidos:** `CustomUserProfile.tsx` (perfil de Clerk en Ajustes
     › Tu cuenta) recibe un prop `locale` desde `cuenta.astro` (resuelto server-side) e importa
     `t()` directo de `src/i18n/app.ts` — un módulo TS plano se puede importar igual desde un
     componente `.tsx`, no hace falta reinventar el bridge de `<script>`.
   • **Alcance completo (verificado con `npm run build` limpio en cada lote):** el shell
     compartido (`AppLayout.astro` — topbar, Cmd+K, centro de notificaciones, drawer de ayuda/FAQ,
     chat; `Sidebar.astro`), el chassis de Ajustes (`SettingsShell.astro`), **las 20 subpáginas de
     Ajustes** (general, branding, portal, cotizaciones, impuestos, pdf, aprobaciones,
     plantillas, fiscal, cobros, plan, notificaciones, correo, equipo, sso, seguridad,
     integraciones, api, webhooks, mcp, agentes, elements, datos, auditoria, cuenta), el link
     público `QuoteCard.astro` (`/q/[token]` y `/embed/[token]`), los correos transaccionales
     (`src/lib/email.ts` → `notifyQuoteSent`), y **el resto de la app de negocio** cerrado en una
     segunda pasada: `index.astro` (dashboard), `cotizaciones/{index,nueva,[id],[id]/editar,
     [id]/imprimir}.astro`, `clientes.astro`, `productos/{index,kits}.astro`, `cfo.astro`,
     `analitica.astro`, `desempeno.astro`, `cobranza.astro`, `cobros.astro`,
     `tesoreria/{cobranza,flujo}/index.astro`, y
     `checkout.astro` (Payment Element).
   • **Namespaces nuevos de esta pasada** en `src/i18n/app.ts`: `dash.*`, `cot.*`, `ed.*`
     (editor `nueva.astro`), `id.*` (detalle `[id].astro`), `edv.*` (`editar.astro`), `imp.*`
     (`imprimir.astro`), `cli.*`, `prod.*`/`kit.*`, `cfo.*`, `an.*` (analítica, compartido con
     desempeño), `des.*`, `cob.*`/`cbr.*` (cobranza/cobros), `tia.*` (cobranza IA), `flu.*` (flujo
     de caja), `chk.*`
     (checkout).
   • **Cada `<script>` no-inline** de estas páginas sigue el mismo puente de `data-i18n-*`/
     `JSON.stringify` sobre un contenedor estable descrito arriba; los `<script define:vars>`
     (`kits.astro`) reciben un objeto `T` plano (sin funciones —
     `define:vars` serializa con `JSON.stringify`) precomputado en el frontmatter.
   • **Bug de Astro/esbuild encontrado y evitado (regla a futuro):** un objeto literal `{...}`
     como rama falsa de un ternario dentro de una expresión JSX (`{cond ? x : tpl(t(...), {n:...})}`)
     lo interpreta el compilador de Astro como el shorthand de Fragment `<>` intentando recibir
     atributos, y truena con `Unable to assign attributes when using <> Fragment shorthand syntax`
     (visto en `cfo.astro`). Fix: sacar el cálculo del ternario a una variable ANTES del `return`/
     JSX, nunca anidar un objeto literal como rama de un ternario dentro de `{}` de JSX.
   • **Único pendiente real, documentado y sin bloquear nada:** `ajustes/sso/configuracion.astro`
     (el wizard de configuración SSO) sigue sin traducir — es 100% cosmético (SSO empresarial no
     está conectado, ver `historial-auth-clerk.md`), sin botones de entrada activos.
   • Fuera de alcance documentado (no bloqueante, requiere su propio diseño):
     `ConnectCustomOnboarding.tsx` (wizard de Stripe Connect en Ajustes › Cobros), los nombres/
     taglines de planes de `src/lib/precios.ts` (`PLANES`), las etiquetas `TIPO_IMPUESTO` de
     `src/lib/queries.ts`, y el texto de eventos generado en backend que consume
     `getNotificaciones()` (ej. "aprobó la cotización", "vio el link").

✅ **Kits de cotización + precio de combo (jul 2026)** — feature nuevo pedido por André:
   paquetes pre-armados de renglones (ej. "Kit de obra negra") que se insertan de un clic
   en el editor, en vez de agregar producto por producto cada vez que se cotiza la misma
   combinación. André pidió explícitamente que vivieran **dentro de Productos** (no en
   Ajustes) como una sub-pestaña — se descartó el diseño inicial en `/app/ajustes/kits`.
   • **2 tablas nuevas** (`db/schema.sql`, mismo patrón que `cedulas`/`cedula_filas`): `kits`
     (nombre, descripción, activo, **`precio_combo` nullable** — ver abajo) y `kit_items`
     (`producto_id` nullable = línea libre dentro del kit, `descripcion`, `cantidad`, `orden`,
     `org_id` denormalizado). RLS directa por `org_id` + FORCE, sin carril `public_token` (no
     hay vista pública de un kit). Un kit es pura conveniencia de captura: al insertarse se
     vuelve `cotizacion_items` normales, indistinguibles de una línea agregada a mano — nunca
     hay referencia de vuelta del lado de la cotización hacia el kit.
   • **`/app/productos` se partió en `index.astro` (Catálogo) + `kits.astro` (Kits)**, unidas
     por la barra de sub-pestañas `page-tabs` (mismo patrón `.ph-tab` que ya usan
     CFO — `git mv` de `productos.astro` a `productos/index.astro`, ajustando la
     profundidad de los imports relativos). `/app/productos/kits`: lista hairline (nombre ·
     descripción · "N líneas" · badge "Combo $X" si aplica · Editar/Eliminar) + modal de
     creación/edición que reutiliza el MISMO combobox de búsqueda de catálogo que el editor
     de cotizaciones (`.prod-search`/`.prod-drop`, CSS calcada, `is:global` porque el dropdown
     se inyecta por JS) más "+ Línea libre". Todos los cambios de un kit (nombre, descripción,
     precio de combo, renglones agregados/quitados) se acumulan en el cliente y se confirman
     con un solo botón "Guardar" — la API solo expone `add_item`/`remove_item`/`rename` (sin
     `update_item`), así que editar la cantidad/descripción de un renglón YA GUARDADO se
     resuelve como "quitar el viejo + agregar uno nuevo" al momento de guardar.
   • **API** `/api/kits` (GET lista, POST crea) + `/api/kits/[id]` (GET detalle con renglones,
     PATCH `rename`/`add_item`/`remove_item`, DELETE) — gateados por el permiso `productos`
     (`requirePerm`), mismo nivel que el resto del catálogo.
   • **Insertar en el editor** (`/app/cotizaciones/nueva`): botón "+ Insertar kit" junto a
     "+ Línea libre" con un dropdown por kit (multiplicador + botón Agregar). La inserción
     reutiliza `addProduct`/`applyDesc`/`catMap`/`loadPricing` tal cual — los renglones de un
     kit heredan gratis precio por volumen, descuento por nivel de cliente, badge de margen y
     el chip de precio sugerido por historial, sin lógica de precio nueva.
   • **Precio de combo (segunda pasada, mismo día)** — un kit puede vender un precio TOTAL
     fijo para una unidad del kit, distinto a la suma de precios de lista de sus líneas
     (`kits.precio_combo`, nullable = sin combo, comportamiento original). En el modal de
     Kits: checkbox "Vender el kit a un precio fijo" + input de precio + hint en vivo ("Suma
     de lista: $X · el kit ahorra $Y (Z%)", en rojo/ámbar si el combo sale MÁS caro que
     comprar suelto — no se bloquea, solo se avisa). Al insertar un kit con combo en el
     editor: se calcula `ratio = precioCombo / sumaListaDeUnKit` y se sobreescribe el
     `negociado` de cada línea de CATÁLOGO con `lista × ratio` (mismo mecanismo que un
     descuento manual — `negoTouched:true` para que no se pise si después cambian de
     cliente); las líneas libres del kit NO participan del prorrateo (no tienen precio de
     catálogo contra qué repartir, quedan en $0 como cualquier línea libre). El dropdown de
     inserción y la fila de la lista de Kits muestran el precio de combo y el ahorro
     calculado server-side (`kitSumaLista()` en `nueva.astro`, `sumaListaKit()` en
     `kits.astro` — mismo cálculo, uno en frontmatter Astro y otro en el cliente).
     ⚠️ **Limitación conocida (aceptada, no bloqueante):** el prorrateo redondea a centavos
     por línea sin forzar que la suma total cuadre exacto al peso — puede haber un par de
     centavos de deriva en kits con muchas líneas; el vendedor siempre puede afinar el
     `negociado` de cualquier línea a mano después de insertar (es un campo editable normal).
   • Verificado: `npm run db:migrate` corrido dos veces (tabla + índices, luego la columna
     `precio_combo` vía `alter table ... add column if not exists` — nunca se editó el
     `create table` ya aplicado, siguiendo la regla del proyecto), RLS/FORCE confirmado contra
     `pg_class`/`pg_policies`, 2 pasadas de `npm run build` limpias, y los 2 bloques
     `<script>` inline (`kits.astro` con `define:vars`, el bloque `is:inline` de `nueva.astro`)
     verificados con `node --check` (sin sintaxis TS prohibida en scripts inline).
   ⬜ Pendiente natural de una siguiente pasada (ideas que André aprobó explorar después):
     detección automática de kits por co-ocurrencia real en `cotizacion_items` (sugerir
     "guardar como kit" cuando el mismo combo de productos se repite en varias cotizaciones)
     y un botón "Guardar como kit" directo desde una cotización ya armada en el editor.

✅ **Armar cotización desde foto/PDF — visión nativa de Claude en `ai-draft` (jul 2026)** —
   segundo feature del track "cotizar rentable" (ver `pricing-intelligence-feature.md` en
   memoria): el bloque "Armar con IA" del editor solo aceptaba texto pegado; ahora también
   acepta una FOTO o PDF de la orden de compra/requisición del cliente — el input real del
   comprador B2B casi nunca es texto limpio.
   • **`/api/cotizaciones/ai-draft.ts`** acepta `{ text?, file?: { mediaType, data, name } }`
     (uno de los dos es obligatorio) — `file.data` es base64 sin el prefijo `data:...;base64,`.
     Usa los bloques de contenido nativos de Claude (`type:'image'` para JPEG/PNG/WEBP/GIF,
     `type:'document'` para PDF) — **sin OCR aparte**, es la misma llamada a
     `messages.create` de siempre, solo con `content` como array de bloques en vez de string
     cuando hay archivo. El SYSTEM prompt se amplió para instruir a leer el documento como una
     orden de compra real (ignorar sellos/folios/firmas, cubrir todas las páginas). Mismo
     `checkQuota('ia')`/`reportUsage('ia',1)` y rate-limit que ya existían — no se creó una
     dimensión de cuota nueva. Tope defensivo server-side de 6M caracteres base64 (~4.5MB
     decodificado, el límite práctico del body de una función de Vercel).
   • **Editor (`nueva.astro`):** botón "Adjuntar foto o PDF" junto al textarea del bloque IA.
     Las **fotos se recomprimen en el navegador** antes de subir (canvas: redimensiona al lado
     mayor ≤1600px + reencode JPEG calidad 0.82) — una foto de celular puede pesar 5-10MB, muy
     por encima del límite de body, y a esa resolución Claude lee el texto igual de bien. Los
     **PDF se rechazan client-side sobre 3MB crudo** con mensaje claro (sugiere bajar la
     resolución del escaneo o subir una foto en su lugar) — Anthropic soporta hasta 32MB/100
     páginas, pero el límite real aquí es el body de la función, no la API. Chip con el nombre
     del archivo + botón de quitar; se limpia solo tras un armado exitoso (el texto NO se
     limpia, mismo comportamiento que ya tenía el flujo de solo-texto).
   • Las líneas armadas desde el flujo de IA ahora también disparan `loadPricing(idx)` por
     línea de catálogo (bug de alcance encontrado al tocar este archivo: el chip de precio
     sugerido de la sesión anterior solo se cableó en `addProduct`/carga de borrador, no en el
     resultado de `ai-draft` — corregido de paso).
   ⬜ **Límite conocido de v1:** no hay OCR/extracción de tabla estructurada previa — se apoya
     100% en la visión del modelo, que en documentos muy densos (tablas de 50+ renglones,
     letra manuscrita ilegible) puede perder o fusionar líneas; el usuario revisa antes de
     enviar (mismo disclaimer que ya existe para el flujo de texto: "Revisa cantidades y
     precios"). Sin cambios de schema ni de billing.

✅ **Inteligencia de pricing — precio sugerido por historial real (jul 2026)** — primer feature
   del track "cotizar rentable" (ver `pricing-intelligence-feature.md` en memoria): usa el
   historial YA decidido de la org (aprobada/pagada/facturada = ganada; rechazada/vencida =
   perdida — `sent`/`viewed`/`draft` se excluyen por no tener veredicto) para sugerir el
   descuento óptimo por línea, sin capturar ningún dato nuevo.
   • **`getPricingSuggestion()`** (`queries.ts`) agrupa el win-rate por banda de descuento de
     5 puntos (0/5/10/…/50+%) sobre `cotizacion_items` join `cotizaciones`, con 3 scopes en
     cascada: **producto exacto** → **cliente** (cualquier producto) → **org completa** — usa
     el primer scope con ≥3 cotizaciones decididas (umbral `PRICING_MIN_SCOPE_SAMPLE`).
     Dentro del scope elegido, sugiere la banda de MENOR descuento cuyo win-rate ≥60%
     (`PRICING_TARGET_WIN_RATE`); si ninguna banda alcanza ese umbral, cae a la de mayor
     win-rate observado. `confianza` = 'alta' (≥10 muestras) / 'media' (3-9). Una sola query
     agregada por `FILTER` (mismo patrón que `getAnalytics()`/`getDesempeno()`), cacheada 60s
     por `(orgId, productoId, clienteId)` vía `cached()` — solo lectura, no escribe nada.
   • **`GET /api/pricing/suggest?producto_id=&cliente_id=&precio_lista=`** (nuevo, protegido
     por el middleware de sesión) — expone la sugerencia al editor.
   • **Editor (`/app/cotizaciones/nueva`):** cada línea de catálogo agregada (o cargada de un
     borrador) dispara `loadPricing(idx)` en segundo plano; si hay sugerencia y el precio
     negociado actual difiere de ella, aparece un hint clicable bajo el nombre del producto
     ("Sugerido: $X") — un clic aplica el precio y dispara el flash de margen existente. El hint desaparece
     solo cuando el precio de la línea ya coincide con el sugerido. Sin cambios de schema.
   ⬜ **Límite conocido de v1:** la sugerencia se calcula una vez al agregar la línea; si el vendedor cambia de
     cliente después, NO se refresca automáticamente (recargar la línea sí lo haría). Fase 2
     natural si se valida: refrescar al cambiar cliente, y ampliar el scope a "familia de
     producto" cuando exista una noción de familia en el catálogo.

✅ **Fix de clipping en los page-tabs (`.ph-tab`) + pulido Apple (jul 2026)** — André reportó
   con captura que el segmented control de secciones (ej. "Cédulas · Herramientas" en
   `/app/presupuestos`, y el mismo patrón en CFO/Analítica/Desempeño y en el clúster de "Mi
   dinero") se veía cortado. **Causa raíz:** `.ph-tabs-row` tenía `overflow-x: auto` sin
   `overflow-y` explícito — por spec CSS, cuando un eje es scrollable y el otro es `visible`,
   el navegador fuerza el eje visible a `auto` también. Eso recortaba verticalmente el
   `box-shadow` del chip activo (y cualquier sangrado de borde) contra un contenedor de
   scroll invisible. Fix en `src/layouts/AppLayout.astro`: `overflow-y: visible` explícito +
   padding/margen negativo compensado alrededor de la fila para que la sombra tenga espacio
   sin mover el layout. Como el fix vive en el `AppLayout` compartido, corrige TODAS las
   filas de page-tabs de la app de una sola vez (no por página).
   • **Pulido "nivel Apple" adicional:** sombra del chip activo pasó de una sola capa plana a
     compuesta (contacto + ambiente + inset highlight superior — mismo lenguaje que el resto
     de superficies premium de la app); easing `cubic-bezier` (`--ease-ios`/`--ease-spring`) en
     vez de `ease` genérico; `letter-spacing` más ajustado; feedback táctil `scale(0.96)` en
     `:active` (chip activo e inactivo).
   • Verificado con `npm run build` (limpio) + inspección del CSS compilado en
     `.vercel/output/static/_astro/AppLayout.*.css` para confirmar que las reglas nuevas
     llegaron al bundle real.

✅ **Desempeño por vendedor — ranking de cierre/cobro por miembro del equipo (jul 2026)** —
   primer feature del track "qué más se puede construir" (auditoría de oportunidades sobre
   `org_members`/roles ya existentes). Antes `cotizaciones` no guardaba quién la creó, así que
   no había forma de atribuir cierres o cobros a un vendedor específico — solo existían métricas
   agregadas a nivel org (`getAnalytics()`/`getCFO()`).
   • **Columna nueva `cotizaciones.creado_por`** (clerk_user_id, nullable) + índice parcial
     `(org_id, creado_por)`. Se stampea en los DOS lugares donde nace una cotización con sesión
     de usuario: `createCotizacion()` (`src/lib/cotizaciones.ts`, vía `currentUserId()` del
     contexto por-request) y `POST /api/cotizaciones/[id]/duplicate`. Las cotizaciones creadas
     vía API key (M2M, sin sesión) o de antes de este campo quedan `null` — se agrupan aparte
     como "Sin asignar" en el reporte, nunca se pierden ni se atribuyen a alguien equivocado.
   • **`getDesempeno()`** (`src/lib/queries.ts`): agrega por `creado_por` — cotizaciones
     creadas/enviadas/cerradas, tasa de cierre, monto cerrado (`approved|paid|invoiced`), tiempo
     promedio a cierre y ticket promedio (mismo criterio que `getAnalytics()`, para que los
     números no diverjan entre páginas). El "cobrado" suma DOS fuentes — pago único/anticipo/
     saldo/cuotas (`cotizaciones.status='paid' or paid_at is not null`) y cobros de igualas
     recurrentes (`cotizacion_cobros` tipo `'cuota'` de una cotización `es_recurrente`, que nunca
     llega a `status='paid'`) — mismo patrón de unión ya usado en `getCobros()` para no repetir
     el bug de invisibilidad de ingreso recurrente que se corrigió en esa misma sesión.
   • **`/app/desempeno`** (nuevo, tercera pestaña de "Inteligencia" junto a Finanzas/Analítica):
     KPIs de equipo (cerrado total, tasa de cierre promedio, líder del periodo, vendedores
     activos) + tabla de ranking (posición, avatar con iniciales, cotizaciones, tasa de cierre,
     barra de monto cerrado, cobrado, ticket promedio, días a cierre) — mismo lenguaje visual
     hairline/`.editorial` que `/app/analitica`. Gateado por el permiso `analitica` (mismo que
     el resto de reportes — el owner y cualquier miembro con acceso a analítica ve el ranking
     completo del equipo, no solo su propia fila). Fila "Sin asignar" aparte, atenuada, cuando
     hay cotizaciones sin vendedor identificable.
   • Cableado en el sidebar (grupo "Inteligencia", ícono podio duotone), Cmd+K, y las pestañas
     cruzadas de `/app/cfo` y `/app/analitica` (ahora las 3 páginas comparten las mismas 3 tabs).
   • Verificado: `npm run db:migrate` corrido (columna + índice aditivos), `npm run build`
     limpio (los 2 warnings de CSS del build son preexistentes — `--sb-bg` de `AppLayout.astro`
     y contenido de un post del blog, no relacionados a este cambio).
   ⬜ Pendiente natural de una siguiente pasada (no bloqueante): comisiones en $/% configurables
     por vendedor sobre lo cerrado/cobrado — hoy el reporte es de VISIBILIDAD (ranking), no
     calcula pagos de comisión.

✅ **Sello de confianza + promesa CFDI en QuoteCard — llega a `/q` Y al embed de Cord
   Elements (jul 2026)** — parte de una sesión de estrategia sobre qué hace que Cord
   Elements sea "necesario" (no solo bonito) para un negocio B2B, y no opcional. De 4
   ángulos explorados (firma legal, candado de datos, sello visible, CFDI ligado al
   flujo), una auditoría de código confirmó que **la firma SHA-256 y el catálogo/CRM
   vivo ya llegaban a ambas rutas sin tocar nada** (Cord Elements reutiliza el MISMO
   `QuoteCard.astro` que `/q/[token]`, vía `/embed/[token]`) — pero el watermark
   "Powered by Cord" y cualquier promesa de CFDI **nunca llegaban al embed**, porque
   vivían como un bloque aparte en `src/pages/q/[token].astro`, fuera del componente
   compartido. Se corrigió moviendo ese bloque adentro de `QuoteCard.astro`:
   • **Pie de confianza compartido (`.q-cord-badge`)** — nuevo bloque al final de la
     tarjeta (visible en TODOS los pasos: revisar, firmar, aprobada, rechazada), gated
     por `ORG.portalPowered !== false` (mismo flag de siempre — los planes de paga
     pueden seguir quitándolo). Combina: ícono de escudo + "Firma con validez legal ·
     Listo para CFDI 4.0" (el CFDI solo se menciona si `org.paisCode === 'MX'`) + el
     link "Verificado por [logo Cord] — crea las tuyas gratis →" que antes vivía
     SOLO en `/q/[token].astro` y por eso nunca aparecía en un iframe de terceros.
   • **Línea de confianza pre-aprobación enriquecida** — la línea sutil que ya existía
     ("Cifrado · firma con validez legal", visible mientras la cotización sigue viva)
     ahora agrega "· CFDI 4.0" para orgs mexicanas, sin duplicar mensaje con el pie nuevo.
   • **Sello de auditoría post-aprobación con encabezado** — el bloque `.ql-audit-stamp`
     (Firmante/Fecha/Sello-hash, ya existente) ahora lleva un header con ícono de
     escudo + "Documento verificado · Listo para CFDI 4.0" (MX). Se actualizó en LOS
     DOS lugares donde existe este markup — el render del servidor (`QuoteCard.astro`)
     Y la inyección por JS tras firmar en vivo (regla ya documentada del proyecto:
     el DOM inyectado por JS debe ser idéntico al que renderiza el servidor) — para
     eso, el país de la org ahora viaja en `data-pais` sobre `.q-card`.
   • **`getCotizacionByToken` expone `org.paisCode`** (`src/lib/queries.ts`, nueva
     columna seleccionada `o.country_code as org_country_code`, default `'MX'`) —
     antes esta función no traía el país de la org en absoluto.
   • **Verificado con Playwright contra el dev server**: `/q/demo` (revisión, org
     "Mi negocio") muestra la línea "Cifrado · firma con validez legal · CFDI 4.0" y
     el pie "Verificado por CORD — crea las tuyas gratis →"; `/embed/demo` (cotización
     YA aprobada de la org semilla "Materiales del Valle", vista a través de la ruta
     de Cord Elements) muestra el MISMO pie y línea de confianza — confirma que el
     fix llega de verdad al embed, que era el bug real.
   • Se eliminó el bloque `.qp-via` (y su CSS) de `src/pages/q/[token].astro`, que
     quedó redundante al moverse a `QuoteCard.astro`.
   ⚠️ Los otros 2 ángulos de la sesión de estrategia (candado de datos por catálogo
     vivo, firma legal) no requirieron código — ya eran ciertos por arquitectura;
     quedan pendientes de convertirse en mensaje de venta (landing/roadmap).

✅ **Chat cliente↔vendedor rediseñado a orgánico + chat por producto para el vendedor
   (jul 2026)** — André reportó que responder desde el detalle de una cotización se
   veía como bitácora ("el cliente escribió... y respondiste...") en vez de un chat
   real. Causa raíz: el chat general y la bitácora de auditoría del vendedor
   compartían la MISMA tabla (`eventos`), pensada para log de sistema, y el texto se
   guardaba narrado en tercera persona (`El cliente escribió: "..."`, `Respondiste:
   "..."`, `Contraoferta del cliente (...)`) — eso es justo lo que se pintaba dentro
   de la burbuja del chat.
   • **Fix de raíz:** `eventos.detalle` para los tipos `comment`/`counter`/`reply` ya
     NO narra — guarda el mensaje tal cual (`src/pages/api/q/[token].ts`,
     `src/pages/api/cotizaciones/[id].ts`). La burbuja ya comunica quién habla por
     posición/color (patrón ya usado en `/q`), así que la narración sobraba. Las
     contraofertas con monto usan un rótulo corto y consistente ("Propuesta: $X —
     mensaje") en vez de la frase completa en tercera persona — igual en el insert
     del servidor y en el append optimista del cliente (`QuoteCard.astro`).
   • **Vista de detalle del vendedor (`/app/cotizaciones/[id]`) — separada en dos
     secciones** (antes todo vivía junto en "Actividad" con la caja de respuesta
     pegada al fondo del log):
     - **Actividad**: SOLO bitácora de sistema (enviada/vista/aprobada/pagada...) —
       `getCotizacion()` ahora filtra `tipo not in ('comment','counter','reply')`.
     - **Conversación** (nueva): burbujas estilo chat (`.dc-msg`/`.dc-thread`,
       mismo lenguaje visual que `.q-msg` de `/q` pero con tokens `var(--color-*)`
       para dark-mode) + compose con auto-resize, Enter para enviar (Shift+Enter =
       salto de línea), y **envío optimista** (la burbuja aparece al instante sin
       `location.reload()`).
   • **Chat por línea/producto para el vendedor (gap real, no existía):** antes,
     si un cliente comentaba sobre una línea específica desde `/q`
     (`cotizacion_comentarios`), el vendedor JAMÁS lo veía en la app — `getCotizacion()`
     no traía esa tabla. Ahora cada fila del detalle tiene un ícono de comentarios con
     contador (`.di-chat-toggle`); al abrirlo se ve el hilo y el vendedor puede
     responder (acción nueva `item_reply` en `/api/cotizaciones/[id].ts`, inserta en
     `cotizacion_comentarios` con `autor_tipo='usuario'` — misma tabla que ya usaba el
     cliente, validando que la línea pertenezca a esa cotización/org).
   • **`queries.ts` — `getCotizacion()` ahora trae 6 queries en el mismo batch**
     (antes 4): eventos de auditoría, versiones, conversación (comment/counter/reply)
     y comentarios por línea. `rowToQuote()` gana un 5º parámetro `conversacion` y
     expone `q.conversacion` (`MockQuote.conversacion`, nuevo campo) con `mine` desde
     la perspectiva del vendedor (`reply` = tú). Cada `item.comentarios` gana `mine`
     (`autor_tipo === 'usuario'`).
   ⚠️ **Regla a futuro:** el texto guardado en un evento/comentario que se vaya a
     pintar dentro de una burbuja de chat debe ser el mensaje TAL CUAL — nunca
     narrarlo en tercera persona pensando en cómo se vería en un log de auditoría.
     Si una tabla sirve dos propósitos (auditoría + chat), filtrar por `tipo` en la
     query en vez de intentar que un solo texto sirva para ambos casos.
   • Verificado con `npm run build` (limpio, sin cambios de tipos rotos).

✅ **Estandarización de Iconografía a Duotone Glass Minimalista (jul 2026)** — André solicitó
   refinar la estética de los íconos de la aplicación completa, rechazando SVGs complejos o
   abstractos (como "estrellas mágicas" para IA) en favor de una iconografía súper corporativa,
   geométrica y minimalista estilo Apple/Stripe.
   • **Regla 9 (CLAUDE.md) actualizada:** El estándar de iconos "Glass Duotone" cambió. El grosor de
     trazo bajó de `1.75`-`2.5px` a un estricto `1.5px`. Se prohibieron las figuras hiper-intricadas
     a favor de geometría limpia (ej. icono de CPU para IA, puertas de login minimalistas, gráficas
     de barras precisas).
   • **Landing Page / Navbar:** Se actualizaron todos los íconos del megamenú (Armado con IA, Cobranza,
     Finanzas, etc.) y el botón "Entrar" a la nueva estética. Se eliminaron bordes de foco azules
     (`focus-visible`) para favorecer transiciones limpias y sombras compuestas.
   • **Sidebar de la App (`/app`):** Se reemplazaron los 10 íconos de la navegación interna de la
     aplicación (`NAV_GROUPS` en `Sidebar.astro`) para adoptar el mismo stroke de `1.5px` y los
     rellenos `fill-opacity="0.12"`, unificando por completo el ecosistema visual desde la landing
     hasta dentro del SaaS.

✅ **Modal "Crear cuenta nueva" rediseñado estilo Stripe + país cableado de punta a punta (jul 2026)** —
   André pidió llevar el modal de creación de sub-cuentas (`CreateWorkspaceModal.tsx`, abierto desde
   `CustomOrgSwitcher`) a nivel Stripe/Apple y reportó que **el país nunca se guardaba en ningún
   lado** — necesario para la expansión internacional y el ruteo fiscal futuro (`FiscalFactory`/
   `orgs.country_code`, ya usado por `emit.ts` para CFDI vs. proveedor internacional).
   • **Rediseño completo del modal (2 pasos):** paso 1 = tarjetas de elección (anidar bajo la org
     activa vs. cuenta independiente) con check circular navy y gráfico de árbol; paso 2 = nombre +
     **selector de país** (7 países: MX default, US, CO, AR, CL, PE, ES) a la izquierda, con un
     **árbol de preview en vivo** a la derecha (bandera + badge "NUEVA" + hermanas atenuadas + "+N
     más") que refleja exactamente dónde caerá la cuenta — mismo patrón que el flujo real de Stripe
     Connect. Dialog squircle, acento navy de marca (antes usaba `#6366f1` indigo genérico, ajeno a
     la paleta de Cord), CTA píldora con `scale(0.97)`, inputs gris Apple con anillo navy al foco.
     Funciona en claro y oscuro (tokens `--sb-*`/`--app-canvas`).
   • **Copy corregido (era falso):** el modal decía que una cuenta anidada "comparte datos, miembros
     del equipo e informes" con la org principal — **falso**, el multi-tenant por `org_id` aísla
     100% los datos entre cualquier par de orgs (ver hallazgo pendiente en la entrada "Org switcher
     con sub-cuentas anidadas" más abajo, ahora resuelto aquí). Nuevo copy: la anidación es
     puramente organizativa/visual en el selector; cada cuenta conserva sus propios datos, equipo y
     reportes.
   • **`/api/orgs/provision` (nuevo, reemplaza a `/api/orgs/subaccount`):** se llama SIEMPRE tras
     `clerk.createOrganization()` (anidada o separada, no solo anidada como antes). Valida
     membresía activa del padre, escribe `countryCode`(+`parentOrgId` si aplica) al
     `publicMetadata` de Clerk (fuente de la agrupación visual del switcher) y además persiste
     `orgs.country_code`/`parent_org_id` en Neon **al vuelo** (upsert por `clerk_org_id`) sin
     esperar al webhook async.
   • **Webhook de Clerk reconcilia el país:** `organization.created`/`.updated` en
     `src/pages/api/clerk/webhook.ts` ahora también lee `public_metadata.countryCode` y actualiza
     `orgs.country_code` — doble escritura a propósito (al vuelo + reconciliación async) para que
     el país nunca quede en blanco aunque el fetch inicial falle.
   • Sin migración: `country_code` y `parent_org_id` ya existían en `orgs` (schema base +
     `alter table … if not exists`).
   • Verificado: `npm run build` limpio + Playwright renderizando el componente aislado (bundle con
     esbuild) contra los 4 estados (paso 1/paso 2 × claro/oscuro) — árbol de preview, banderas,
     badge, foco navy y CTA confirmados visualmente en ambos temas.

✅ **Onboarding "Stripe-style" (grupos con sub-pasos anidados) + actualización de legales/roadmap/
   soporte con el feature de cobros (jul 2026)** — André pidió mejorar el onboarding de la app
   ("en Stripe hay varios mini puntos dentro de un punto, sería increíble") y refrescar Términos,
   Privacidad, el Plan de Desarrollo y el Centro de Ayuda con todo lo construido en la sesión de
   cobros por términos/anticipo/cobranza IA (ver entrada inmediata siguiente).
   • **`getSetupProgress()` reestructurado a SECCIONES con sub-pasos** (`src/lib/queries.ts`): los
     10 pasos existentes se agruparon en 5 secciones con la secuencia real del ciclo de venta —
     **Prepara tu negocio** (marca·fiscal·PDF) → **Arma tu catálogo** (productos·clientes) →
     **Cierra tu primera venta** (crear·enviar) → **Recibe tu dinero** (activar cobros·cobrar y
     facturar) → **Crece tu operación** (equipo). Cada `task` ganó un campo `group`; la función
     devuelve `groups` (con su propio `doneN`/`total`/`done`) ADEMÁS de la `tasks` plana original
     — compat total con `/api/onboarding/progress`, que no cambió de forma.
   • **`OnboardingWidget.astro` reescrito** al patrón "checklist de Stripe": acordeón de GRUPOS
     (no de pasos sueltos) — cada grupo es un ícono squircle duotone (Regla 9) + título + su
     propio sub-progreso ("1/2 completados") + puntitos de mini-progreso (uno por sub-paso,
     verde = hecho) a la derecha cuando está colapsado. Al expandir un grupo se revelan sus
     sub-pasos con checkbox, descripción y botón "Configurar". Al completarse TODOS los sub-pasos
     de un grupo: el ícono se anima a check verde, el grupo se colapsa solo y abre el siguiente
     grupo pendiente automáticamente (mismo patrón de "guía viva" que ya tenía, ahora a dos
     niveles). El polling a `/api/onboarding/progress` (15s + focus/visibilitychange) sigue
     marcando sub-pasos Y recalculando el estado de su grupo padre sin recargar. Verificado con
     una captura Playwright del componente aislado (grupo completo colapsado con check verde +
     grupo "Cierra tu primera venta" expandido mostrando sus 2 sub-pasos).
   • **Roadmap actualizado con las features de la sesión de cobros:** `cobranza-ia` pasó de
     `beta` a `live` con copy real (link de pago en cada correo + negociación de 2-3 cuotas);
     item nuevo `anticipos-pagos-parciales` (`live`) describiendo el desglose anticipo+saldo.
   • **Términos de servicio (ES+EN, `terminos.astro`):** dos subsecciones nuevas en la cláusula
     04 (Condiciones de Pago) — *Anticipos, Pagos Parciales y Planes en Cuotas* (el usuario
     controla los términos comerciales y el tratamiento fiscal; Cord no genera el REP
     automáticamente) y *Cobranza Autónoma con IA* (el usuario autoriza a Cord a contactar a sus
     clientes en su nombre al activarla; deslinde sobre tono/contenido generado por IA).
   • **Aviso de privacidad (ES+EN, `privacidad.astro`):** finalidad nueva en la cláusula 03 —
     *Cobranza Autónoma con IA (opcional)*: qué datos de cartera se procesan, que está
     desactivada por defecto y solo corre tras activación explícita, y que el texto lo genera
     Anthropic bajo la misma garantía de no-entrenamiento ya documentada para el resto de la IA.
   • **Centro de Ayuda:** `terminos-de-credito.md` (ES+EN) reescrito — ya no promete un horario
     de recordatorios inventado ("días 25, 29 y 31") ni el flujo PPD viejo; ahora explica el
     gating real (el botón de pago se oculta hasta el vencimiento) y enlaza a los dos artículos
     nuevos. `facturacion-anticipos.md` (ES+EN) corregido para dejar de prometer REP automático
     y explicar el flujo real de Cord (dividir el cobro con `anticipo_pct`, timbrar tú el CFDI).
     Dos artículos nuevos (ES+EN): **`cobrar-anticipo.md`** (cómo pedir el % y qué ve el cliente)
     y **`cobranza-automatica.md`** (cuándo actúa el agente, qué hace, cómo activarla/desactivarla).
   ⚠️ **Pendiente de exactitud (no resuelto esta pasada):** varios artículos de Facturación/CFDI
     (no solo los tocados aquí) siguen usando terminología `PUE`/`PPD` de forma más prescriptiva
     de lo que el timbrado real de Cord garantiza — vale una pasada de auditoría de exactitud
     fiscal dedicada a esa categoría completa en el futuro (fuera de alcance de esta sesión).
   • Verificado: `npm run build` limpio con todos los cambios de contenido + el nuevo
     `OnboardingWidget.astro`; captura Playwright del widget confirmando el patrón visual de
     grupos/sub-pasos antes de dar por bueno el rediseño.

✅ **Editor de cotizaciones + detalle: pasada de intuitividad y funcionalidad (jul 2026)** —
   André pidió que crear una cotización fuera "super intuitivo" y reportó que en el modal de
   "Crear nuevo cliente" (que él mismo agregó al editor) las letras chicas de ayuda no se veían
   chicas. Mejoras en `/app/cotizaciones/nueva` y `/app/cotizaciones/[id]`:
   • **Bug reportado — `.m-hint` sin definir:** el modal de cliente se copió de `clientes.astro`
     pero la clase `.m-hint` (texto de ayuda chiquito) nunca se definió en el `<style>` scoped de
     `nueva.astro` (Astro scopea por archivo) → el texto salía en tamaño normal. Definida + el
     modal completo se restiló al lenguaje Apple del editor (inputs `#f5f5f7` sin borde, foco
     navy con anillo, radius 22px, sombra compuesta). ⚠️ Regla ya conocida reconfirmada: al
     copiar markup entre páginas Astro hay que copiar también sus clases scoped.
   • **Bug de datos — el modal de cliente DESCARTABA campos:** capturaba RFC, límite de crédito,
     nivel, descuento, términos y datos fiscales CFDI pero solo enviaba empresa/contacto/email al
     `POST /api/clientes` (que ya aceptaba todo). Ahora manda el payload completo, la opción nueva
     del select hereda `data-desc`/`data-nivel`/`data-term` reales y el descuento del nivel se
     aplica al instante a las líneas ya agregadas. Errores del API ahora salen inline en `#mError`.
   • **Buscador de productos (combobox):** el `<select>` nativo se reemplazó por un input de
     búsqueda con dropdown (filtra por nombre y SKU, acentos-insensible, ↑/↓ + Enter, Escape,
     click fuera cierra; tras agregar conserva el foco para agregar varios seguidos; fila nueva
     hace flash verde). Los items del dropdown son DOM inyectado → sus estilos (`.prod-*`,
     `.line-added`) viven en `<style is:global>` (regla del proyecto).
   • **Términos del cliente auto-aplicados:** las opciones del select de cliente llevan
     `data-term` (label "Contado"/"Net 30"/"Net 60" desde `terminos_default`); al elegir cliente
     se activa su chip de términos solo.
   • **Vigencia de borradores arreglada:** `parseInt(draftQuote.vigencia)` parseaba "10 jul 2026"
     → 10 y nunca matcheaba una opción. Campo nuevo aditivo `vigenciaDias` en `rowToQuote`
     (días RESTANTES) + `MockQuote`; el select (`#vigSelect`, ahora con `value`) pre-selecciona
     ese valor y lo agrega a la lista si no es estándar.
   • **Bug pre-existente — `ORG.aprobMargenMin` no existía:** `getOrg()` nunca mapeó
     `aprob_margen_min` → el badge de margen bajo del editor NUNCA se encendía (el Auditor
     Silencioso del backend sí funcionaba; era solo la señal visual en vivo). Mapeado.
   • **Validaciones con guía:** enviar sin cliente bloquea con toast + scroll/focus al paso 1
     (guardar borrador sin cliente sigue permitido); línea libre sin descripción bloquea el
     guardado; "+ Línea libre" enfoca la descripción recién creada. ⌘/Ctrl+Enter envía (guard:
     no dispara con el modal de cliente abierto). En modo borrador los botones dicen
     "Guardar y enviar"/"Guardar cambios".
   • **Detalle `[id]` — bug del botón copiar:** al copiar el link se hacía `btn.textContent = '✓
     Link copiado'`, lo que DESTRUÍA el `<svg>` interior para siempre (el botón quedaba sin
     ícono). Ahora el feedback es cambiar el label + `cordToast`, sin tocar el SVG.
   • **Detalle `[id]` — acciones legibles:** los 4 botones de ícono (Abrir link · Copiar link ·
     PDF · WhatsApp) ahora llevan etiqueta debajo (`.act-util-lbl`); "Continuar editando" subió
     junto al CTA primario en borradores; emojis ⏳/⚠️/🧾 reemplazados por SVG duotone (Regla 1);
     "IVA 16%" hardcodeado → `ORG.ivaPct`; confirm de facturar ya no menciona el plan "Negocio"
     (no existe); "Registrar pago" ahora pide confirmación.
   • Verificado: `npm run build` limpio + harness de Playwright con el script `is:inline` REAL
     contra DOM equivalente y `fetch` stub (8/8 pruebas: buscador, precio por volumen, descuento
     y términos por cliente, validaciones, payload completo del cliente, POST del borrador) +
     `node --check` del bloque inline (regla de sintaxis TS prohibida en `is:inline`).

✅ **Refactor de Ajustes: Layout "Quiet Luxury", Separación de Modo Developer e Integraciones (jul 2026)** —
   Se aplicó la estética "Quiet Luxury" consistentemente a todas las páginas de configuración y se reestructuró la jerarquía de navegación.
   • **Settings Layout Amplio:** `SettingsShell.astro` se refactorizó para utilizar un grid de 2 columnas (`260px` sidebar, `640px` content max-width) dentro de un contenedor amplio de `1040px`. Esto resolvió el problema de que los campos estuvieran demasiado pegados a la izquierda, ocupando mejor el espacio estilo Stripe.
   • **Fondo de Onboarding:** Se arregló el aspecto visual y el clipping del shader `SupportCoverBg` en `/ajustes/index.astro` para que coincida perfectamente con el fondo de la página de soporte.
   • **Iconos de Integraciones SVG:** En `ajustes/integraciones.astro` se reemplazaron las letras de texto iniciales por los logos SVG oficiales de las marcas (Shopify, WooCommerce, Mercado Libre, Zapier, Slack, CONTPAQi). Se corrigió un cruce en los SVGs donde WooCommerce y Mercado Libre estaban invertidos.
   • **Extracción de Integraciones:** "Integraciones" dejó de estar oculta bajo el toggle técnico y ahora es una categoría principal de primer nivel visible para cualquier usuario (en `SETTINGS_CATEGORIES`), porque cualquier persona puede integrar aplicaciones.
   • **Separación del Modo Desarrollador:** Se eliminó la súper-tarjeta monolítica de "Developers" que contenía todas las opciones. Ahora, al encender el toggle de **Modo desarrollador**, aparecen múltiples filas independientes en la sección de Avanzado: **API y Webhooks**, **MCP**, **Agentes IA**, y **Cotizador embebible**, permitiendo una navegación más directa y modular.

✅ **Refresh visual de la app → más Apple/iOS/Stripe (jul 2026)** — André pidió que la app
   interna (`/app/**`) se sintiera más Apple/iOS y más profesional/Stripe (referencias: los
   dashboards de Stripe), **conservando** el layout hairline/sin-tarjetas que ya le gustaba. El
   problema no era la estructura (ya era cardless) sino: gradientes en las gráficas, eyebrows
   uppercase diminutos como títulos, fondo casi-blanco, heroes navy con degradado y glass del
   shell muy cargado. Se atacó por una **capa compartida de tokens/clases en `AppLayout.astro`**
   para que la mayoría de páginas heredara el cambio.
   • **Tokens nuevos en `:root` (+ contraparte dark):** `--app-canvas: #f5f5f7` (gris Apple, usado
     SOLO en `html,body` — NO se tocó `--color-bg-soft`, que se sigue usando como track/hover y
     ahora lee como receso casi-blanco sobre el gris), `--chart-fill: #0a192f`, `--chart-fill-2`,
     `--chart-track: rgba(10,25,47,0.05)`, `--row-hover`, `--radius-card: 16px`. Dark intacto
     (`#0b1018`).
   • **Fondo lienzo → gris Apple `#f5f5f7`** vía `--app-canvas` (antes `--color-bg-soft` #fafbfc).
   • **CERO degradados en gráficas:** todos los rellenos de barra (`.flow-fill`, `.rank-fill`,
     `.week-fill`, `.margin-fill`, `.expo-fill`, `.bar-cer`, `.rank-bar` y las rayas del
     `.margin-bar`) pasaron de `linear-gradient(azul→navy / verde)` a **tono plano** con tokens:
     navy `var(--chart-fill)` para neutro, `var(--color-ok)` verde para positivo,
     `var(--color-danger)` rojo para over/negativo; rieles a `var(--chart-track)`. Archivos:
     `index.astro`, `cfo.astro`, `analitica.astro`, `cobranza.astro`.
   • **Títulos de sección legibles (sentence-case) tipo Stripe:** clases globales nuevas en
     `AppLayout` `.sec-head`/`.sec-title`/`.sec-link` (0.98rem, weight 600, `var(--color-text)`,
     `text-transform:none`) reemplazan el patrón viejo `.section-head h2 { 0.7rem; 800; uppercase;
     #99a2af }`. Migrados TODOS los dashboards (index/cfo/analitica/cobranza/tesorería) + las
     páginas de lista/detalle que conservan su `.section-head` local (clientes, productos,
     cotizaciones/[id], editar) — a estas se les restiló el `.section-head h2` local a
     sentence-case (el texto del markup ya estaba en caja normal; solo el CSS lo ponía uppercase).
     Barrido final: 0 eyebrows uppercase como título de sección en toda la app.
   • **Heroes navy sin degradado:** los `linear-gradient(135deg,#0d2038/#112240,#0a192f)` de
     `ajustes/index` (card salud), `ajustes/sso`, `ajustes/sso/configuracion`, `ajustes/equipo`,
     el hero "Armar con IA" de `cotizaciones/nueva`, los tabs de test-mode y el `.tf-insight`
     (radial) → **navy plano `var(--color-blue-deep)`** (se conserva el navy de marca, se elimina
     SOLO el degradado, que es lo que leía "no-Stripe").
   • **Shell glass calmado (Apple, no espejo):** `.topbar` y `.sidebar` bajaron de
     `blur(34px) saturate(1.9) brightness(1.03/1.04)` → `blur(24px) saturate(1.4)` (sin
     brightness). `.card` → `border-radius: var(--radius-card)` (16px).
   • **Selección de sidebar estilo iOS Settings:** el `.sb-indicator` (antes píldora de vidrio con
     blur) pasó a **relleno tintado** `var(--sb-active-bg)` radius 10px sin `backdrop-filter`,
     sombra mínima; filas más altas (`padding: 9px 11px`, radius 10px) e íconos un pelín más
     presentes.
   • **Sidebar = MISMO material que la pill de la topbar (André lo pidió explícito):** el material
     ya era casi idéntico (mismo `--sb-bg`, blur, borde, y `--sb-shadow` == sombra del topbar); lo
     que divergía era el `::before` con **`--sb-sheen`** (en claro un radial navy OSCURO que
     apagaba el sidebar y lo hacía ver más gris que el topbar; en oscuro un brillo azul que el
     topbar no tiene). Se puso **`--sb-sheen: transparent`** en ambos temas → el sidebar brilla
     solo con el inset highlight compartido, idéntico a la topbar. Radio del sidebar igualado a la
     topbar: **22px → 17px**. ⚠️ Regla: sidebar y topbar deben mantenerse como el MISMO material
     glass — no re-introducir un sheen/tinte propio en el sidebar; el brillo viene del inset de
     `--sb-shadow` (compartido con la topbar).
   • Verificado con `npm run build` (compila limpio). Todo es CSS/markup de clases — cero cambios
     de lógica, backend ni queries.
   ⬜ Pendiente (André lo pidió "más radical", se hablará después): cambios más profundos de UX de
     la app (no solo estética de tokens). Esto fue la pasada rápida de estética.

✅ **Entorno de prueba REAL tipo Stripe + fixes de guardado/cableado (jul 2026)** — el toggle
   "Entorno de prueba" dejó de ser cosmético. Diseño elegido: **org SANDBOX espejo**
   (`orgs.sandbox_of uuid → org padre`, índice único parcial `idx_orgs_sandbox_of`) — la sandbox
   es una org COMPLETA, así que TODO el multi-tenant/RLS/queries existentes funcionan sin cambios
   y los datos de prueba jamás se mezclan con los reales.
   • **Señal server-side:** la fuente de verdad es la **cookie `cord_test_mode`** (ya no
     localStorage). `src/store/testMode.ts` la escribe (localStorage queda como espejo para
     `api.astro`) y expone `toggleTestMode()` que navega tras el cambio (si la ruta actual trae un
     UUID va a `/app` — esa entidad no existe en el otro entorno). El middleware la lee →
     `reqContext.testMode` → **`getActiveOrgId()` (db.ts) resuelve `resolveSandboxOrgId(parent)`**:
     find-or-create idempotente (`on conflict (sandbox_of) where sandbox_of is not null`), copia
     snapshot de marca/config del padre (nombre, logo, color, prefix, plan, país, IVA, vigencia,
     términos, pdf_*, portal_bienvenida, email_from_name, iva_incluido_defecto) y siembra datos de
     ejemplo vía `seedDemoData()` (import dinámico para evitar ciclo). Si la resolución sandbox
     falla se LANZA error (nunca caer a la org real: escribir datos de prueba en producción sería
     peor que un 500). Probado E2E contra la BD real: idempotente, no anida, no captura membresías.
   • **Defensa anti-captura:** la resolución por membresía (paso 1 de `resolveOrgId`) ahora
     excluye orgs sandbox (`join orgs o on o.sandbox_of is null`) — una membresía en sandbox jamás
     debe capturar la sesión normal. NUNCA sembrar `org_members` en sandboxes.
   • **Llaves API tipo Stripe:** `authApiKey` (apikey.ts) resuelve las **sk_test_ → org sandbox**
     (find-or-create); una llave live que viva en una sandbox se rechaza (estado inválido).
     `POST /api/keys` fuerza `mode='test'` si la org activa es sandbox. En `api.astro` el segmento
     "Vivo" se deshabilita cuando el entorno de prueba está activo.
   • **Salvaguardas de dinero/fiscal real:** checkout público de cotizaciones sandbox → 409
     (jamás cobrar dinero real); `billing/subscribe` y `billing/portal` → 409 en sandbox;
     `emit.ts` corta ANTES del provider y registra documento **simulado** (`provider_data.simulado
     + modo_prueba`, `fiscal_id SIM-…`); correos de cotización con asunto `[Prueba]`; crons de
     intereses/cobranza-IA excluyen `sandbox_of is not null`. `reportUsage` a Stripe se salta solo
     (la sandbox no tiene `stripe_customer_id`).
   • **UI inconfundible (ámbar = test, como Stripe):** banner sticky `test-banner` en
     `AppLayout` (gradiente ámbar + botón "Salir del modo de prueba" que limpia la cookie), toggle
     del org switcher re-coloreado a ámbar (era verde), y **cinta `q-test-ribbon` en el link
     público** ("Cotización de prueba — sin validez comercial ni fiscal") vía el campo nuevo
     `org.esPrueba` de `getCotizacionByToken`.
   • **BUG CRÍTICO arreglado — cron de recordatorios:** `/api/cron/recordatorios` usaba
     `getActiveOrgId()` que sin sesión SIEMPRE resolvía la org demo → **ningún negocio real recibía
     recordatorios de cobro**. Reescrito para iterar la cartera de TODAS las orgs (excluyendo
     sandboxes y demo) en una sola query. Nota relacionada verificada empíricamente: el rol
     `neondb_owner` tiene `rolbypassrls=true`, por eso las queries directas de crons/apikey
     funcionan aunque las tablas tengan FORCE RLS (el RLS es defensa en profundidad, no bloqueo).
   • **BUG de guardado — `aprob_margen_min`:** tenía `data-field` en Ajustes → Aprobaciones pero
     el PATCH `/api/org` lo ignoraba → el margen mínimo del Auditor Silencioso NUNCA se guardaba.
     Agregado al handler y al UPDATE. ⚠️ Regla: todo `data-field` nuevo DEBE agregarse a
     `/api/org` (el guardado genérico no avisa si el server ignora un campo).
   • **SettingsShell — cambios sin guardar + ⌘S:** la barra de guardar ahora detecta estado
     "dirty" (serializa los `[data-field]` vs snapshot; botón con anillo que respira), avisa con
     `beforeunload` si sales sin guardar, y ⌘S/Ctrl+S guarda. El snapshot se re-toma tras guardar.
   • **Ajuste placebo cableado — moneda default:** el editor `/nueva` hardcodeaba `MXN selected`;
     ahora `DEFAULT_CURRENCY` = moneda del borrador o `ORG.moneda` (Ajustes → General) y si no es
     MXN el panel FX se abre desde el primer render.
   • **Barrido `alert()` → `window.cordToast(…, 'error')`** en plan, branding, plantillas,
     impuestos, api, webhooks, pdf y el editor (14 reemplazos; el aviso informativo de
     `datos.astro` se dejó). Los `confirm()` de acciones destructivas se conservan (pendiente:
     modal propio).
   • ✅ **Migración YA CORRIDA contra la BD de prod** (columna + índice, aditivo).
   ✅ **Follow-ups del track test-mode COMPLETADOS (jul 2026):** (1) **badge ámbar "Prueba"** junto
     al nombre de la org en `CustomOrgSwitcher` cuando el entorno de prueba está activo; (2) **botón
     "Vaciar datos de prueba"** en el banner (tipo Stripe "delete all test data") →
     `POST /api/test-mode/reset` borra la org sandbox por completo (guard `sandbox_of is not null` +
     cascade limpia hijos; se recrea fresca + reseed al recargar — probado E2E: el guard jamás toca
     una org real, el cascade deja 0 huérfanos); (3) **`/app/ajustes/plan` oculta los botones de
     cobro** (subscribe/portal) cuando `isTestEnv` y muestra un aviso ámbar; (4) **`confirm()` nativo
     ELIMINADO de toda la app** → nuevo **modal global `window.cordConfirm(opts): Promise<boolean>`**
     en AppLayout (markup + CSS con variante `danger` + `initConfirm`; Esc=cancelar, Enter=confirmar,
     foco en cancelar si es destructivo). Se reemplazaron los 12 `confirm()` de páginas + el de
     `CustomUserProfile.tsx` (este con fallback a `confirm()` nativo por si el island monta antes).
     ⚠️ Regla a futuro: nunca usar `confirm()`/`alert()` nativos en la app — usar `cordConfirm`/`cordToast`.
   ⬜ Pendiente menor: excluir sandboxes de KPIs si algún día hay métricas cross-org.

✅ **Rediseño Apple-style en Sidebar y Fix de Logo de Branding (jul 2026)** —
   Se limpió la interfaz del `Sidebar.astro` para alinearse a las reglas de "Quiet Luxury" y estética Apple:
   • Se eliminó el efecto "Spotlight" (brillo mágico siguiendo el cursor) y el desvanecido superior/inferior (`mask-image`), reemplazándolos con *hover states* sutiles.
   • Los iconos pasaron de ser figuras sólidas y pesadas a trazos finos tipo Lucide.
   • Se resolvió un bug donde el logo personalizado del espacio de trabajo (subido desde Ajustes > Branding) no se mostraba en la sidebar. El componente `CustomOrgSwitcher.tsx` intentaba leer la imagen desde Clerk (`organization.imageUrl`), cuando en realidad el logo se guarda en la tabla `orgs` de Supabase (`logo_url`). Se solucionó leyendo el logo vía `getOrg()` desde el servidor Astro y pasándolo como prop `orgLogoUrl` al componente React.

✅ **Barra de búsqueda en Catálogo/Directorio y rediseño de Precios por Volumen (jul 2026)** —
   Se implementó filtrado de cliente *instantáneo* (sin recargar ni hacer queries a la BD) en las pantallas de Productos y Clientes. Se reubicó la barra de búsqueda en el header (junto a los botones principales) integrando la clase `ph-search` con estilos premium y expandibles al hacer focus.
   • Además, se rediseñó la matriz de **Precios por volumen** en el modal de editar producto: se eliminaron los selectores numéricos por defecto del navegador, se añadió una clase `.vol-cell` con borde focus `var(--color-blue-deep)` y sombra similar a la de Apple, y se incluyó una etiqueta `<style is:global>` específica en `productos.astro` para permitir que Astro aplique los estilos premium al HTML generado dinámicamente (`innerHTML`) por JS.

✅ **Refactor: flujo de "Continuar editando" para usar el editor completo + bugs subsecuentes (jul 2026)** —
   A petición de André, la acción "Continuar editando" de un borrador (`/app/cotizaciones/[id].astro`) ya no manda a la página parcial `editar.astro`, sino que redirige a `/app/cotizaciones/nueva?draft=[id]`. En `nueva.astro` se implementó la lógica para detectar el parámetro `draft`, cargar la cotización usando `getCotizacion()`, y pre-poblar dinámicamente todo el estado inicial: cliente seleccionado, productos (incluyendo precios negociados), notas y días de vigencia. Esto unifica la experiencia de creación y edición en la misma interfaz ("como si apenas la estuviera creando").
   Al probar el guardado de borradores editados se encontraron y resolvieron tres bugs en cadena en `PATCH /api/cotizaciones/[id]`:
   • **Bug 1 — `actual` usada antes de definirse:** La variable `actual` (que guarda el `status` de la BD) se declaraba *después* del bloque de items que la necesitaba en la condición `actual === 'draft'`. Resultado: `actual` era `undefined`, el `UPDATE` tomaba el `else` incorrecto y el endpoint lanzaba un error no capturado que devolvía una respuesta vacía → "Unexpected end of JSON input" en el cliente. Fix: mover la declaración de `actual` y la validación de transición a *antes* del bloque de items.
   • **Bug 2 — `sql.query()` no existe en el cliente de Neon:** El `else` del bloque de actualización de status usaba `await sql.query(...)` (sintaxis estilo `pg`), que no está disponible — solo existe el tagged template `` sql`...` ``. Cuando `action.to === 'draft'` caía a ese `else` y lanzaba un `TypeError` que mataba el proceso sin devolver JSON. Fix: reemplazar con `` await sql`update cotizaciones set status = ${action.to} where id = ${id}` `` y envolver todo el handler en un `try/catch` global para que cualquier error devuelva JSON 500 en vez de respuesta vacía.
   • **Bug 3 — columna `vigencia_dias` no existe:** La tabla `cotizaciones` tiene la columna `vigencia` de tipo `date`, no `vigencia_dias` (esa convención es la de `orgs.vigencia_default_dias`). El `UPDATE` intentaba escribir en una columna inexistente. Fix: calcular la fecha con `current_date + (${vigDias} * interval '1 day')`.
   • **Bug 4 — columna `fx_buffer_pct` no existe:** La misma pasada de `update_draft` intentaba actualizar `fx_buffer_pct`, columna que tampoco existe en la tabla `cotizaciones` (fue diseñada pero nunca se migró). Fix: quitar la línea del `UPDATE`.
   ⚠️ **Regla permanente para cualquier `UPDATE` sobre `cotizaciones`:** antes de agregar una columna al SQL, verificar contra `db/schema.sql` (la definición base en líneas 63–87 + las migrations `ALTER TABLE` al final del archivo). Las columnas reales confirmadas para `update_draft` son: `cliente_id`, `terminos`, `vigencia` (date — calcular con `current_date + N * interval '1 day'`), `notas`, `base_currency`, `fiscal_currency`, `subtotal`, `iva`, `total`, `version`, `iva_incluido`. Nunca usar `sql.query()` — solo el tagged template `` sql`...` ``.

✅ **IVA incluido por defecto y refactor de toggles tipo iOS (jul 2026)** —
   Se implementó la capacidad de manejar cotizaciones con precios que ya incluyen IVA mediante un toggle en el editor (`nueva.astro`, `editar.astro`). La lógica matemática se ajustó en backend (`mock.ts`) para calcular siempre el subtotal base correcto y almacenarlo en BD. Se agregó la columna `iva_incluido_defecto` a la tabla `orgs` para permitir a cada negocio configurar si las cotizaciones nuevas inician con este switch encendido (gestionado desde `Ajustes > Impuestos`). Finalmente, la clase global `.s-toggle` se extrajo a `AppLayout.astro` y se rediseñó con dimensiones 44x24px y color Navy (`var(--color-blue-deep)`) para homologar una estética nativa tipo iOS (Apple) en todos los interruptores de la app.

✅ **Precios por volumen + Promesas de pago + landing de Integraciones (jun 2026)** — tres features
   nacidas de la auditoría de `/casos-de-uso/*` (claims que la app no cumplía → ahora sí):
   • **Precios por volumen (matriz por producto):** columna nueva `productos.precios_volumen jsonb`
     (`[{min, precio}]` ordenada asc; default `[]`). Saneada por `normVolumen()` en `queries.ts`
     (exportada, reusada por `/api/productos`). El modal de `/app/productos` tiene un editor de niveles
     (clases `vol-*`: "Desde N pz → $X", agregar/quitar). **El cotizador `/app/cotizaciones/nueva` lo aplica
     en vivo:** al cambiar la cantidad de una línea de catálogo, `volUnit(l)` busca el nivel más alto cuyo
     `min` se alcanza y reescribe `l.lista`; sobre ese precio se aplica el descuento por nivel de cliente
     (`applyDesc`) salvo que el vendedor haya fijado un precio manual (`l.negoTouched`). Muestra una nota
     verde "precio x volumen (N+)" bajo el nombre. Las líneas de IA (`ai-draft`) heredan los tiers del
     `catMap` por id. El payload no cambió de forma (sigue mandando `precio_unitario`=lista vigente).
   • **Promesas de pago (cobranza):** tabla nueva `promesas_pago` (org_id, cotizacion_id, fecha_promesa,
     monto?, nota, estado pendiente|cumplida|incumplida) + RLS/FORCE. API `/api/promesas` (POST/PATCH
     estado/DELETE, gated por `requirePerm('cobranza')`). `getCobranza()` adjunta la promesa pendiente más
     reciente por cotización (`item.promesa`). UI en `/app/cobranza`: botón de calendario por fila + modal
     (`#promModal`) para registrar/editar (fecha, monto opcional, nota), badge "Promete <fecha>" en la
     columna de estado, "Marcar cumplida" / "Quitar". Editar = DELETE+POST (reemplaza la vigente). Es
     **seguimiento manual** — NO automatiza cobros ni manda nada.
   • **Landing `/desarrolladores/integraciones` (ES+EN):** entrada nueva `integraciones` en
     `desarrolladores.ts` + `.en.ts` (auto-genera `/desarrolladores/integraciones` y `/en/...`). Hero mockup
     (webhook `POST quote.paid` firmado, tema teal) en `[slug].astro` + 2 block mockups en
     `DevBlockMockup.astro` (`integraciones` index 0 = terminal del payload + firma; index 1 = lista de
     destinos Zapier/Make/n8n/Slack/backend). Copy HONESTO: Cord NO tiene conectores propietarios por
     proveedor; emite webhooks HMAC-SHA256 (6 eventos) + API REST + Slack nativo; conectas SAP/Oracle/
     Salesforce vía Zapier/Make/n8n. Cableada en el megamenú de `Nav.astro` (desktop + móvil) y en
     `Footer.astro`. ⚠️ Correr `npm run db:migrate` (1 columna + 1 tabla).

✅ **Core loop: la IA como puerta de entrada del editor (jun 2026)** — track de "core loop mágico".
   En `/app/cotizaciones/nueva` el bloque "Armar con IA" (que ya iba primero pero se veía secundario:
   caja de borde punteado) se elevó a un **hero navy premium** (gradiente `#0d2038→#0a192f` + glow azul,
   estilo del card de salud de Ajustes): título "Arma la cotización con IA — la forma más rápida",
   textarea translúcida sobre el navy, botón blanco sólido prominente, y un divisor **"o créala
   manualmente"** antes del Paso 1. Así el camino con IA (pega el pedido del cliente → empareja tu
   catálogo) se lee como EL camino primario y los pasos manuales como alternativa. Se cambió el emoji
   `✦` por un **SVG de sparkle** (regla: NADA de emojis; las banderas 🇲🇽🇺🇸🇪🇺 del selector de divisa
   siguen siendo la excepción aprobada). Sin cambios al backend `ai-draft` ni a la lógica.

✅ **Simplificación de navegación — "menos es más" (jun 2026)** — primera tanda del track de
   intuitividad (decisión de André: la app tiene MÁS features de las que el vendedor típico usa;
   el salto de UX es enfocar y esconder, no agregar):
   • **Sidebar reagrupado a lenguaje plano** (`src/components/app/Sidebar.astro`, `NAV_GROUPS`):
     antes `Principal · Dinero(Cobranza/CFO Dashboard/Analítica) · Tesorería IA(Flujo predictivo/
     Agentes) · Catálogo`. Ahora `Principal(Inicio·Cotizaciones) · Clientes y productos · Mi dinero
     (Cobranza·Cobranza con IA·Flujo de caja) · Inteligencia(Finanzas·Analítica)`. Se eliminó la
     jerga ("CFO Dashboard"→Finanzas, "Tesorería IA"/"Flujo predictivo"→Flujo de caja, "Agentes de
     cobranza"→Cobranza con IA, "Dashboard"→Inicio). NO se borraron páginas ni rutas; los `id`/`href`
     siguen igual (estados activos intactos). Headings de página y Cmd+K alineados (en Cmd+K se
     conservó "CFO"/"tesorería" como keyword en la descripción para que la búsqueda los siga
     encontrando).
   • **Pestañas de sección (Stripe-style)** que unifican cada cluster sin fusionar páginas: las 3
     páginas de "Mi dinero" (`/app/cobranza`, `/app/tesoreria/cobranza`, `/app/tesoreria/flujo`) y
     las 2 de "Inteligencia" (`/app/cfo`, `/app/analitica`) comparten una barra de tabs (slot
     `page-tabs` + clase `.ph-tab`/`.ph-tab.active` que ya existía en `AppLayout` y nadie usaba).
   • **"Modo desarrollador" en Ajustes** (`/app/ajustes/index.astro`): la categoría **Developers**
     (API·Webhooks·MCP·Agentes·Embebible) queda **oculta por defecto** (CSS, sin flash) y se revela
     con un toggle que persiste en `localStorage cord.devmode` — esconde el ruido técnico al vendedor
     típico sin bloquear el acceso directo por URL (misma filosofía que SSO).
   • **Ajustes "Esenciales vs Avanzado"** (`/app/ajustes/index.astro`): el índice de categorías se
     parte en dos bloques con eyebrow — Esenciales (General·Branding·Cotizaciones·Facturación·Planes·
     Notificaciones·Tu cuenta) arriba, y Avanzado (Equipo·Developers·Avanzado) plegado abajo. La
     partición es local al índice (`ADVANCED = Set(['equipo','developers','avanzado'])`, no toca el
     tipo de `settings.ts`); Developers vive en Avanzado y sigue gateado por el toggle (el devmode
     ahora togglea `dm-on` sobre `#idxRowsAdv`).
   • **Pulido mobile:** `.ph-tabs-row` (las barras de tabs de sección) ahora scrollean horizontal en
     pantallas chicas (`overflow-x:auto`, scrollbar oculta, `.ph-tab{flex-shrink:0}`) → nunca se rompen
     en celular. El drawer móvil ya usa `NAV_GROUPS`, así que hereda el reagrupamiento automáticamente.
   ⚠️ **iCloud sigue rompiendo el repo:** el `.git` tenía copias de conflicto de iCloud (`index 2..8`,
     `refs/heads/main 2`, `refs/remotes/origin/main 2`) que corrompían las refs (3er incidente de iCloud
     tras el binario de esbuild). Se limpiaron y `git fsck` quedó verde. El push muere con SIGBUS en
     `pack-objects` bajo el sandbox del entorno → se empuja con el sandbox desactivado. **Acción
     recomendada: mover el repo fuera de `~/Desktop` (iCloud) a `~/dev/flouvia-cord`.**
   • **FIX latente:** `/app/tesoreria/flujo` y `/app/tesoreria/cobranza` leían el org con
     `getMyMembership()?.org_id` — pero `Membership` NO tiene `org_id`, así que `orgId` era siempre
     `undefined` y **ambas páginas salían SIEMPRE vacías**. Corregido a `getActiveOrgId()` (de `db.ts`);
     ahora cargan datos reales. Regla: para el org en un page usar `getActiveOrgId()`, no exprimir el
     membership.

✅ **Sidebar themed + Developers separado + onboarding ampliado (jun 2026)** — iteración de UI a
   petición de André:
   • **Sidebar = espejo de la topbar (vidrio BLANCO en claro, navy en oscuro)** — antes era
     siempre navy. Se introdujo un set de variables **`--sb-*`** en `:root` y su contraparte en
     `html[data-theme="dark"]` (`AppLayout.astro`); TODA la sidebar (nav, group-labels, badges,
     indicador, footer, toggle, acciones móviles, pins inyectados por JS) y el `CustomOrgSwitcher`
     leen esas variables → cambia de tema sin duplicar reglas. El **logo del footer** ahora son dos
     `<img>` (`.sb-foot-logo-navy`/`.sb-foot-logo-white`) que se intercambian por tema. Los
     dropdowns de cuenta y "Crear" usan **frosted casi-opaco** vía `--sb-menu-*` (mismo look del
     menú "Crear" de la topbar). Patrón a seguir para cualquier color nuevo en la sidebar: usar
     `var(--sb-*)`, NO `rgba(255,255,255,…)` hardcodeado.
   • **Colapsado pulido** — íconos 46px cuadrados centrados (ícono 21px), rail 74px sin huecos,
     badge = punto con aro `var(--surface)`, avatar de cuenta alineado con la columna de íconos.
   • **El contenido gana ancho al colapsar** — variable **`--content-max`** (1240px → **1440px**
     en `.sb-collapsed`, con transición) aplicada a `.app-content`/`.ph-inner`/`.ph-tabs-row`. Ya
     no solo se recorre.
   • **Developers SEPARADO en pestañas** — la antigua página combinada "API y webhooks" se partió
     (`settings.ts`): **API · Webhooks · MCP · Integraciones · Agentes IA · Cotizador embebible**.
     CSS compartido extraído a **`src/styles/developers.css`** (importado por las 3 páginas nuevas;
     antes vivía scopeado en `api.astro`). `api.astro` rediseñada **estilo Stripe** (tabla "Claves
     de API": Nombre · Token · Permisos · Último uso · Creación — clases `.key-table/.key-trow`);
     **`webhooks.astro`** (log de entregas + replay + prueba) y **`mcp.astro`** (connect + tools +
     probador) son páginas nuevas. Los 4 `init*()` JS originales se repartieron por página.
   • **Onboarding 5 → 9 pasos + RE-MONTADO** — `getSetupProgress()` ahora enseña el flujo completo:
     marca → fiscal → catálogo → clientes → crear → **enviar 1ª** → **PDF/portal** → **cobrar y
     facturar** → **invitar equipo** (cada uno con detección real en BD). ⚠️ El widget estaba
     **huérfano** (sus vars `setup`/`pillDash` y su CSS `.onb-pill` seguían en `AppLayout` pero el
     componente y la píldora ya no se renderizaban): se RE-MONTÓ `<OnboardingWidget>` + la píldora
     en `.tb-right`, ambos gated por `!setup.complete`.

✅ **App shell PREMIUM "liquid glass" (jun 2026)** — rediseño del `AppLayout.astro` para sentirse Apple/Linear/Stripe:
   • **Sidebar liquid-glass** — receta del navbar (rim lights en capas + sheen `::before`) e
     **indicador deslizante tipo iOS** (`.sb-indicator`): píldora de vidrio que sigue al hover
     entre los `.sb-item` y regresa al activo. CSS puro manejado por JS mínimo
     (`initSidebarIndicator` setea `top/height/opacity`); delegación `mouseover` cubre los
     "Fijados" inyectados; respeta `prefers-reduced-motion`; reposiciona en resize/colapso.
     Fallback pre-JS: `.sb-nav:not(.sb-ind-ready) .sb-item.active` muestra un realce sutil.
   • **Sidebar colapsado pulido** — los `.sb-group-label` colapsan en alto/padding (antes
     dejaban huecos vacíos); ítems = cuadros uniformes (44×40) centrados; el indicador pasa a
     **cuadrado centrado** (`left:50%`); ancho 76px.
   • **Topbar = pill flotante de vidrio** — ya NO es barra con borde inferior: `margin:1rem`,
     `border-radius:17px`, glass con rim lights + sombra luxe, `position:sticky; top:1rem`
     (el contenido se desliza desenfocado debajo, efecto Apple). En móvil margen menor.
   • **Org switcher de vidrio** (`CustomOrgSwitcher.tsx`) — botón con hover de vidrio, avatar con
     rim/sheen, y dropdown **frosted casi-opaco** (`blur(44px)` + opacidad ~0.97 → se ve el
     vidrio pero NO se transparenta el fondo; mismo fix aplicado al menú "Crear").

✅ **Topbar PRO: botón "Crear" + Cmd+K potente + quick-add tarea (jun 2026)** —
   • Botón **"Crear"** (desktop) en `.tb-right` con menú de vidrio: Cotización · Cliente ·
     Producto · **Tarea** (abre `#qtask`, un modal quick-add → `POST /api/tareas`). El JS
     `initCreateMenu(btnId, menuId)` es genérico (reusado por el menú móvil `sbCreate` y el de
     topbar `tbCreate`). Se eliminaron los `.btn-new` "+ Nueva cotización" sueltos del dashboard
     y de la lista (el botón global los cubre).
   • **Cmd+K** ampliado: rutas de Tesorería/CFO, acciones con `?nuevo=1`, "Nueva tarea" que
     ejecuta callback (soporte `it.run` en `activate`).

✅ **Tema claro/oscuro (jun 2026)** — sistema por tokens en `AppLayout.astro`:
   `html[data-theme="dark"]` remapea `--color-bg/bg-soft/text/text-muted/border`, agrega
   `--surface`/`--surface-2` (paneles/modales migrados de `#fff` → `var(--surface)`), y mueve
   `--color-blue-deep` a un azul vivo (era invisible en oscuro; sirve de acento). Toggle sol/luna
   en la topbar + **anti-flash** vía `<script is:inline>` en `<head>` + persistencia en
   `localStorage cord.theme`. ⚠️ **Actualizado (jun 2026):** el sidebar y el org switcher YA NO son
   navy fijo — ahora son blancos en claro / navy en oscuro vía las variables `--sb-*` (ver la
   entrada "Sidebar themed" arriba).
   ✅ **Completado:** se migraron todos los `#fff` hardcodeados de Ajustes (`/app/ajustes/*`),
   editores (`cotizaciones/nueva`/`editar`) y checkout a la variable `var(--surface)`. Ahora todo el flujo es 100% dark-safe.

✅ **Dashboard con analíticas nuevas + páginas sin cards (jun 2026)** —
   • Dashboard (`src/pages/app/index.astro`) cablea `getCFO()`+`getAnalytics()` (Promise.all) y
     agrega 4 widgets HAIRLINE: **Salud del pipeline** (DSO/concentración con semáforo),
     **Flujo esperado · 5 semanas** (mini bar chart CSS), **Necesitan seguimiento** (silenciadas
     accionables), **Mix** (clientes por tasa de aprobación + productos por ingreso).
   • Se quitaron los cards restantes: **Kanban** (`cotizaciones/index`) ahora son filas hairline;
     **detalle** (`cotizaciones/[id]`) con docs fiscales y versiones en hairline + nuevo
     **stepper de estado** (draft→sent→viewed→approved→paid/invoiced) + chips de acción de vidrio.

✅ **Link público 3.0 — "Apple premium" (jun 2026)** — mejoras a `QuoteCard.astro` (reusado por
   `/q` y `/embed`; gated por prop `standalone` para no romper el iframe):
   • **Barra de acción flotante** (`#qSticky`, solo `/q`): pill de vidrio fija abajo con total +
     "Aprobar"; aparece mientras el CTA real no está visible (IntersectionObserver) y solo en
     estado review. Al pulsar hace scroll al área y dispara el flujo de firma.
   • **Señales de confianza**: chip de **vigencia con urgencia** ("Vence en X días", ámbar si
     ≤7d / vencida), strip "● Conectado en tiempo real" + "Cifrado · firma con validez legal",
     y **bloque de contacto del vendedor** (WhatsApp/Correo/Llamar) — nuevos campos en
     `getCotizacionByToken`: `org.emailContacto/telefono/whatsapp` y `quote.diasVigencia`.
   • **Pago pulido**: panel con monto restated + "Pago protegido vía Stripe" + chips de tarjeta.
   • **Micro-lujo**: count-up del total al cargar (`data-countup`) + reveal escalonado de las
     líneas (`.qi-reveal`). Todo respeta `prefers-reduced-motion`.

✅ **Rediseño del chat en el link público (jun 2026)** — `src/components/q/QuoteCard.astro`
   El área de conversación (`.q-chat`) fue rediseñada de cero para verse y sentirse como un chat real:
   • **Eliminado el `<details>` acordeón** ("¿Tienes una duda o quieres negociar?") — era el mayor
     problema UX: ocultaba el input detrás de un click y no invitaba a escribir.
   • **Compose area siempre visible** (`.q-compose`): textarea auto-resize + botón enviar (flecha SVG
     circular, toma el `color` de marca de la org). La contraoferta y el campo de precio viven en una
     sección secundaria debajo, subtil pero accesible.
   • **Burbujas tipo iMessage**: mensajes del cliente a la derecha (navy `#0a192f`) / vendedor a la
     izquierda (gris claro `#f3f4f6`), radio asimétrico (3px en la esquina de origen). Contrareofertas
     con fondo ámbar tenue.
   • **Thread con scroll suave**: `max-height: 280px; overflow-y: auto` + scroll automático al fondo
     con `requestAnimationFrame` cuando llega un mensaje nuevo.
   • **IDs de JS intactos** (`#qMsg`, `#qProp`, `#qSendMsg`, `#qSendCounter`, `#qNegOk`, `#qNegErr`,
     `#qThread`): toda la lógica de envío/contraoferta/appendMsg funciona sin cambios.
   • Regla de construcción: el input de chat en `/q` siempre debe ser un compose open (no acordeón).
     Los per-line item threads (`.qi-thread`) NO se tocaron — siguen expandiéndose inline.

✅ **Restauración UI (jun 2026)** — Se restauraron los botones de Notificaciones y Ayuda en la topbar que se habían borrado accidentalmente y se corrigió el CSS (`.tb-icon`) para eliminar bordes azules de focus nativos en Safari/macOS.

✅ **PDF v2 (jun 2026)** — 3 plantillas (clasico/minimal/detallado), logo subible,
   y PREVIEW EN VIVO en `/app/ajustes`. Nueva columna `orgs.pdf_template`.

✅ **Importar por CSV** — productos y clientes (`/api/productos/import`, `/api/clientes/import`)
   con modal de archivo→mapeo→preview en `/app/productos` y `/app/clientes`.

✅ **Analítica** — `/app/analitica` (ventas/conversión, margen cedido, top clientes/productos)
   + KPI "por dar seguimiento" en el dashboard. Consultas en `getAnalytics()`.

✅ **Duplicar cotización** — `/api/cotizaciones/[id]/duplicate` (clona a nuevo borrador).

✅ **Enviar por WhatsApp** — botón en el detalle (wa.me con mensaje + link pre-armado).

✅ **Forecast en Analítica** — pronóstico de cartera abierta (pipeline ponderado:
   enviadas 30% + vistas 50%) + comparativo cerrado vs mes anterior.

✅ **CFO Dashboard (jun 2026)** — `/app/cfo`: inteligencia financiera avanzada.
   `getCFO()` en queries.ts cruza historial real por cliente (tasa de cierre =
   aprobadas/total, delay al pago = delta approved_at→evento paid) con el pipeline
   abierto para proyectar ingreso esperado semana a semana (5 cubetas: esta semana,
   próxima, +2, +3, +4 semanas). KPIs: pipeline total, ingreso esperado ponderado,
   DSO con semáforo (verde ≤30d / amarillo ≤60d / rojo >60d) y concentración de
   riesgo por cliente. Alertas automáticas: concentración ≥70% y cotizaciones
   silenciadas (+7 días sin respuesta). Ranking de clientes ponderado (tasa hist.,
   días a cierre, días a cobro, valor esperado). Sidebar grupo "Dinero", Cmd+K,
   atajo `G+F`.

✅ **Link público 2.0** — en `/q/[token]`: contraoferta + chat (comentarios) del cliente;
   el vendedor responde desde el detalle (caja de respuesta → evento `reply`). Sin
   migración (usa `eventos` tipos comment/counter/reply). getCotizacionByToken devuelve
   `conversacion`. (Soporta aprobación parcial por línea).

✅ **Link público "Quiet Luxury" (jun 2026)** — rediseño completo de `/q/[token]` y
   `QuoteCard.astro`. Fondo `#f3f2ef` con orbes radiales suaves. Card `border-radius:28px`,
   sombra sutil, logo real de la org (o inicial con color de marca). Total hero centrado
   `clamp(2.5rem,8vw,3.4rem)`. **Flujo de aprobación en 3 pasos** (sin modales externos):
   1. Revisar — CTA "Aprobar" + PDF + "Rechazar" discreto.
   2. Firma digital — nombre completo + checkbox de términos; botón deshabilitado hasta
      que ambos estén completos; timestamp + IP registrados en `eventos` como
      `"Firmado digitalmente por \"Nombre\" (IP x.x.x.x)"`.
   3. Confirmado — checkmark animado SVG (circle + check dibujados en CSS) + sello
      `"Firmado por X · fecha"` + botón de pago si aplica.
   Rechazo mejorado: textarea inline (adiós al `prompt()` nativo). `getCotizacionByToken`
   ahora incluye `logo_url` (como `org.logoUrl`) y `portal_bienvenida` (como
   `org.portalBienvenida`, ya presente en la query pero faltaba en el objeto devuelto).
   API `/api/q/[token]` acepta `signed_by` en el action `approve`.

✅ **IA: armar cotización desde texto** — `/api/cotizaciones/ai-draft` (SDK @anthropic-ai/sdk,
   tool_choice forzado; modelo claude-opus-4-8 vía AI_MODEL) + panel "Armar con IA" en el
   editor `/nueva`. Empareja el pedido del cliente con el catálogo. Requiere ANTHROPIC_API_KEY.

✅ **Topbar v3 + App shell PRO (jun 2026)** — rediseño completo del AppLayout:
   • **Topbar slim**: buscador pegado a la izquierda (ancho fijo ~360px), iconos a la derecha.
   • **Page header**: banda con título de sección grande (1.6rem) debajo de la topbar; botones
     de acción a la derecha (slot `topbar-actions` reubicado). Slot `page-tabs` para tabs de
     sección. Helper `.ph-tab` / `.ph-tab.active` para tabs consistentes.
   • **Breadcrumbs**: prop `crumbs=[{label, href?}]` en AppLayout; ya conectado en
     `/app/cotizaciones/[id]` y `/app/cotizaciones/nueva`.
   • **Cmd+K corregido y pulido**: los estilos de items inyectados por JS se movieron al
     bloque `is:global` (Astro scopea por `[data-astro-cid]` y el HTML inyectado no lo lleva —
     era la causa de que se viera feo). Selección sutil estilo Linear (barrita de acento navy,
     no bloque sólido), flecha `↵` en el item activo, atajo `kbd` visible (ej. "C" en Nueva
     cotización). **Recientes** en localStorage (`cord.recent.v1`) cuando el buscador está vacío.
   • **Centro de notificaciones real**: campana en la topbar abre panel con feed de actividad
     real (reusa tabla `eventos`); punto rojo si hay items no vistos (marcados en
     `cord.notif.seen`); nuevo endpoint `GET /api/notificaciones`. Iconos por tipo (enviada/
     vista/aprobada/rechazada/pagada/facturada/chat). "Marcar como leídas".
   • **Fijados en el sidebar**: botón de pin (phPin) en el page-header + sección "Fijados"
     al inicio de la sidebar; estado en localStorage (`cord.pins.v1`); `F` para fijar/quitar;
     tooltip al hover en modo colapsado igual que el resto del nav.
   • **Atajos de teclado globales**: `/` → abrir Cmd+K; `C` → nueva cotización;
     `G+D/C/L/P/B/A/F` → navegar a la sección (F = CFO Dashboard); `F` → fijar/quitar página del menú;
     `?` → overlay de ayuda. Ignorados cuando el foco está en un input/textarea/select.
   • **Barra de progreso de navegación** (estilo Linear/YouTube): barra azul de 2.5px en la
     parte superior que aparece al hacer click en un link y desaparece al cargar.
   • **Toasts globales**: `window.cordToast(msg, 'ok'|'error'|'info', ms?)` — toast centrado
     en la parte inferior con ícono, auto-dismiss y botón X. Flash post-navegación vía
     `sessionStorage 'cord.flash'`. Skeletons reutilizables: `.skeleton` + `.skeleton-line`.
   • **Overlay de ayuda de atajos** (`?`): panel centrado con la tabla de todos los atajos.
   • **Mobile v2 (jun 2026):** topbar en móvil = solo `☰ burger · lupa · campana` (barra de
     búsqueda colapsada a ícono cuadrado; notificaciones visibles; engrane/ayuda/guía ocultos
     de la topbar). **Tab bar inferior eliminada** (`.mobile-tabs` borrada; navegación en el
     drawer). **Drawer con acciones rápidas** (`.sb-mobile-actions`, solo móvil): botón azul
     **"+ Crear"** con mini menú desplegable (Cotización → `/app/cotizaciones/nueva`, Cliente →
     `/app/clientes?nuevo=1`, Producto → `/app/productos?nuevo=1`), **Ayuda** (abre el
     helpDrawer), **Configuración** (→ `/app/ajustes`). Los links `?nuevo=1` auto-abren el
     modal de alta correspondiente y limpian el query (`history.replaceState`). Tablas de
     productos y clientes usan `grid-template-areas` en móvil: fila tipo lista con nombre +
     dato secundario (SKU / contacto) debajo y precio/límite a la derecha. Bug de fecha en
     "Tareas y recordatorios" corregido: campo `.task-date` usa `color: var(--color-text)` y
     el formulario se apila a columna completa en móvil (`min-height: 44px`).

✅ **Presencia en vivo (gated) y Diseño Quiet Luxury** — el cliente con `/q/[token]` abierto manda heartbeat
   (`POST /api/q/[token]` action `ping` → `cotizaciones.viewer_last_seen`); el vendedor
   ve un indicador sutil `● Viendo ahora` en el detalle (poll `/api/cotizaciones/[id]/presence`).
   **Gated por plan**: el polling de UI solo se activa si la org está en plan `pro`, `scale` o `developer`.

✅ **Versiones de Cotizaciones (jun 2026)** — Historial inmutable (`cotizacion_versiones`). Al crear se genera V1. Al usar "Modificar y reenviar" en `/app/cotizaciones/[id]/editar` se crea la V2, etc., sin generar un folio nuevo. El detalle `/app/cotizaciones/[id]` muestra el badge de versión actual y un acordeón con el historial completo. El menú de acciones secundarias (PDF, Copiar link, WhatsApp) fue rediseñado a un grid compacto de iconos.

✅ **Editor de Cotizaciones Rediseñado (jun 2026)** — `/app/cotizaciones/nueva` usa un diseño limpio tipo Stripe/Linear (sin tarjetas), se arregló el selector de productos usando `p.id`, incluye botón de línea libre ("+ Agregar línea libre"), e incluye el cálculo del margen bruto porque `getProductos` en `queries.ts` ahora retorna el `costo`.

✅ **Guía de configuración v2 — Widget flotante dinámico (jun 2026)** — tarjeta
   acordeón fijada abajo-derecha (`src/components/app/OnboardingWidget.astro`):
   pasos por `getSetupProgress()` (marca/fiscal/productos/clientes/cotización),
   uno abierto a la vez, check animado al completar. Estado MINIMIZADO → píldora
   "Guía de configuración" con anillo SVG radial en la topbar de `AppLayout`.
   **Estado global persistente** entre páginas (store vanilla en `window.__cordOnb`
   + `localStorage` clave `cord.onb.v1` — equivalente de Zustand/Context en Astro SSR).
   **Auto-completado por BD**: polling a `/api/onboarding/progress` cada 15 s +
   `visibilitychange`/`focus` — los pasos se marcan solos sin recargar. Al llegar
   a 100% celebra y se auto-descarta. `?guia=1` resetea el estado. La card inline
   del dashboard fue ELIMINADA. `src/lib/onboarding.ts` + `/api/onboarding/seed`
   quedan como código muerto (reutilizable si se quiere "precargar ejemplos").

✅ **Pipeline Kanban + Tareas** — toggle Lista/Tablero en `/app/cotizaciones` (drag&drop
   avanza el pipeline vía PATCH actions); tarjeta de "Tareas y recordatorios" en el
   dashboard (`/api/tareas`, tabla `tareas`, getTareas()).

✅ **Listas de precio por nivel** — clientes con `nivel` (estandar/plata/oro/distribuidor)
   y `descuento_pct`; el editor aplica el descuento del nivel a las líneas al elegir cliente.

✅ **Flujos de aprobación + Auditor Silencioso (jun 2026)** — tres umbrales en Ajustes
   (`orgs.aprob_descuento_max`, `aprob_monto_max`, `aprob_margen_min`); si al enviar se rebasa
   cualquiera, la cotización queda `aprob_estado='pendiente'` (no se envía) y gerencia aprueba/
   rechaza desde el detalle. **El Auditor Silencioso** es el tercer umbral: margen bruto mínimo
   (%). Requiere que los productos tengan `costo` configurado; el costo se snapshotea en
   `cotizacion_items.costo_unitario` al cotizar. El editor muestra un badge **Margen** por línea
   en vivo (verde/rojo) que se actualiza al escribir el precio negociado. El motivo de bloqueo
   queda registrado: *"margen bruto 18% está por debajo del mínimo de 25%"*. El campo de costo
   está en el modal de Productos (`/app/productos`) y en la tabla `productos.costo`.
   Filtro "Por aprobar" en la lista de cotizaciones. ⚠️ Correr `npm run db:migrate`.

✅ **Recordatorios de cobro (Resend)** — `/api/cron/recordatorios` (cron en `vercel.json`,
   diario a las 9am UTC) manda correos 3 días antes del vencimiento vía Resend (REST).

✅ **Correo al enviar cotización (Resend)** — helper `src/lib/email.ts` (`notifyQuoteSent`/
   `sendEmail`); al crear-con-envío (`POST /api/cotizaciones`) o acción send/resend
   (`PATCH /api/cotizaciones/[id]`) se manda el link público al correo del cliente y se
   registra evento `email`. **Gated por `RESEND_API_KEY`**: sin la llave NO se manda nada
   — el link se genera igual. ✅ **En prod (jun 2026):** dominio verificado en Resend y
   `RESEND_API_KEY`/`RESEND_FROM` seteados en Vercel; los correos transaccionales ya salen.

✅ **FASE 3 — nuevas secciones de configuración (jun 2026)** — 4 secciones nuevas en Ajustes,
   todas con backend REAL. ⚠️ Correr `npm run db:migrate`.
   • **Portal del cliente** (`/app/ajustes/portal`, pestaña bajo *Branding*) — personaliza la
     página pública `/q`: `portal_banner`, `portal_bienvenida` (ya existía), toggles
     `portal_mostrar_chat` (oculta chat/contraoferta) y `portal_powered` (quita "enviado vía
     Cord" + watermark; gated por plan). PREVIEW en vivo. **Cableado REAL:** `QuoteCard.astro`
     pinta banner/bienvenida y oculta `.q-chat`; `/q/[token].astro` oculta watermark + loop
     viral; `getCotizacionByToken` devuelve los campos portal_*.
   • **Correo** (`/app/ajustes/correo`, pestaña bajo *Notificaciones*) — remitente y plantilla
     del correo transaccional: `email_from_name` (nombre visible), `email_reply_to`,
     `email_intro`, `email_firma` con variables `{cliente}{folio}{total}{negocio}`. PREVIEW de
     email. **Cableado REAL:** `email.ts` `sendEmail` acepta `fromName`/`replyTo` (dominio fijo
     al verificado en Resend, nombre libre); `notifyQuoteSent` usa intro/firma/remitente custom.
   • **Impuestos** (`/app/ajustes/impuestos`, pestaña bajo *Cotizaciones*) — tabla nueva
     `impuestos` (nombre, tipo iva|ieps|ret_iva|ret_isr|exento, tasa, es_default). CRUD en
     `/api/impuestos`. **Cableado REAL:** el perfil `es_default` de tipo iva/ret_iva/ret_isr
     SINCRONIZA `orgs.iva_pct`/`retencion_*` (vía `syncOrg`), así el editor lo usa sin refactor.
   • **Integraciones reales — Slack** (`/app/ajustes/integraciones`) — `slack_webhook_url` ya
     existía (solo guardaba); ahora **postea de verdad**: `src/lib/slack.ts` (`postToSlack`,
     best-effort, nunca lanza) enganchado en `dispatchQuoteEvent` (1 punto → los 6 eventos).
     UI: bloque Slack con input de Incoming Webhook + guardar (`/api/org/prefs`) + "Enviar
     prueba" (`/api/integraciones/slack-test`). Nuevas cols `orgs`: portal_*/email_* (7).

✅ **Rediseño UI/UX de Desarrolladores (Premium)** — La página de Configuración de API y Webhooks (`/app/ajustes/api.astro`) fue reconstruida usando una estética premium (Vanilla CSS: `DeveloperUI.css`). Incorpora layout de tarjetas limpios, insignias semánticas, tipografía monoespaciada, toggles segmentados y un bloque "Terminal Oscura" con micro-interacciones para la conexión de servidores MCP y webhooks.

✅ **Colaboración en Tiempo Real y Firmas Nativas (jun 2026)** —
   • **Hilos de negociación embebidos**: Comentarios interactivos por cada línea de la cotización (`cotizacion_comentarios`). Los clientes pueden debatir partidas específicas y llegar a un acuerdo granular en la misma vista pública de la cotización (`QuoteCard.astro` y `/api/q/[token].ts`).
   • **Firmas Legales Inmutables**: Nuevo flujo legal (`cotizacion_firmas`) donde se captura Nombre, Correo, IP, User Agent y un hash criptográfico SHA-256 generado a partir del *snapshot* del estado de los ítems cotizados. La cotización exhibe el sello de auditoría tras ser aprobada, actuando como un contrato digital legal y verificable.

✅ **Pulido visual y micro-interacciones (jun 2026)** — Mejoras premium de diseño "Quiet Luxury":
   • **Desarrolladores**: Ajuste de colores (azul `#93c5fd` en lugar de morado) en la UI de herramientas MCP para mayor coherencia visual.
   • **Link Público de Cotización**: Micro-interacciones TOP en los botones principales (`.ql-cta`, `.ql-ghost`), incorporando efectos dinámicos de escala, control de *brightness* y expansión fluida de sombras.
   • **Historial de versiones**: Transformado de una lista básica a un componente moderno y elegante estilo acordeón, con transiciones suaves, elevación al hover y micro-ajustes de posición (`translateX`).

✅ **Micro-interacciones Topbar y Sidebar (jun 2026)** — Elevación de la calidad de UI a nivel premium:
   • **Botón Sidebar:** Se actualizaron los íconos (flechas apuntando hacia el flujo de expansión/colapso). Animación sutil de desplazamiento del ícono (`translateX`) al hacer hover y un efecto de hundimiento (`scale(0.92)`) en estado activo.
   • **Topbar (Ajustes, Ayuda, Notificaciones):** Íconos reacondicionados con animaciones fluidas usando curvas CSS `spring` puras (engrane rotando 60°, efecto "wiggle" en Ayuda, y "bell-ring" en notificaciones). Levantamiento (`translateY(-1px)`) global para `tb-icon`.

✅ **Entorno de Prueba Global y Rediseño API (jun 2026)** — Centralización del estado de entorno:
   • **Nanostore de Test Mode:** Se introdujo `testMode.ts` (estado global sincronizado con `localStorage` como `cord_test_mode`) y se acopló al interruptor "Entorno de prueba" en el `CustomOrgSwitcher.tsx`.
   • **Rediseño "Quiet Luxury" en Desarrolladores:** Se eliminó la dependencia de `DeveloperUI.css` (estilo Stripe morado/blanco) en `/app/ajustes/api.astro`. La interfaz ahora usa clases nativas de Cord (`.api-btn-solid`, `.api-btn-ghost`) asegurando un Modo Oscuro perfecto.
   • **Org Switcher UI Fix:** Corrección de contraste de texto y recortes `text-overflow` (`min-width: 0` + `ellipsis`) para nombres de usuario/emails largos.

✅ **Aprobación parcial por línea (jun 2026)** — el cliente puede aprobar solo un
   subconjunto de líneas desde `/q`. Columna `cotizacion_items.aprobado` (default true).
   En `QuoteCard` cada línea tiene checkbox (solo si la cotización está viva) con total a
   aprobar EN VIVO; el botón se deshabilita si no hay líneas seleccionadas. `/api/q/[token]`
   acción `approve` acepta `accepted_items[]`: marca cada línea, y **la firma legal SHA-256
   cubre SOLO las líneas aceptadas** (el snapshot hashea `firmadas`, no todas). El evento
   registra "aprobó N de M líneas ($X de $Y)". El detalle del vendedor muestra las líneas
   excluidas tachadas con badge "No incluida" + nota de aprobación parcial. ⚠️ Correr
   `npm run db:migrate` (columna `cotizacion_items.aprobado`). **La facturación SÍ respeta
   la aprobación parcial:** `emit.ts` emite solo las líneas `aprobado=true` y recalcula
   subtotal/IVA/total desde las aceptadas (marca `aprobacion_parcial` en `provider_data`).

✅ **Fix crítico: firma en link público (jun 2026)** — `src/pages/api/q/[token].ts` usaba
   `sql.begin(async tx => …)` en la acción `approve`, pero el driver HTTP de Neon
   (`@neondatabase/serverless`) no expone ese método — solo `sql.transaction([...])`. La
   función crasheaba silenciosamente y la respuesta llegaba vacía → el cliente recibía
   "Unexpected end of JSON input" al intentar `res.json()`. Corregido: se arma un array de
   queries (`txQueries`) y se ejecuta con `(sql as any).transaction(txQueries)`. Mismo
   patrón que `withOrgTx`/`withPublicToken` en `db.ts`. **Regla a futuro:** NUNCA usar
   `sql.begin()` — siempre `sql.transaction([...])` (o los helpers `withOrgTx`/`withPublicToken`).

✅ **UX intuitiva en flujos core de la app (jun 2026)** — pasada de claridad y estética en las 5 pantallas más usadas, para que cualquier usuario (no técnico) entienda las funcionalidades al primer vistazo:
   • **Editor de cotización (`/app/cotizaciones/nueva`):** pasos numerados explícitos ("1 ¿A quién le cotizas?" / "2 ¿Qué le vas a cotizar?") con guía de texto debajo de cada encabezado. **Panel de divisas rediseñado de jerga a humano:** al elegir USD/EUR aparece un stepper visual "Tipo de cambio hoy → Tu tasa protegida" con tres presets de colchón **Poco / Normal / Cauto** (+1% / +2% / +5%) en lugar de un campo "buffer %" vacío; preview live "Tu cliente verá ≈ US$X · tú facturas $Y MXN". Resumen de sidebar enriquecido con conteo de líneas/piezas y línea "Le descontaste −$X" cuando el precio negociado baja del lista. Moneda con banderas (🇲🇽/🇺🇸/🇪🇺) — **NOTA: las banderas son excepciones aprobadas por el contexto de selección de país/divisa**, no emojis decorativos.
   • **Clientes (`/app/clientes`):** el par confuso "dropdown de nivel + campo numérico de descuento" reemplazado por **chips de nivel** (Estándar / Plata / Oro / Distribuidor) que al tocarse auto-sugieren un descuento típico y muestran una preview live en pesos ($1,000 → $900). Estado vacío con ícono, titular y botones "Nuevo cliente" / "Importar CSV".
   • **Productos (`/app/productos`):** etiquetas humanizadas ("¿Cuánto te cuesta?"). **Medidor de margen en vivo** dentro del modal: barra de color (verde ≥30% / ámbar 15-30% / rojo <15%) + texto "Ganas $X por unidad · margen Y%" — o "Pierdes $X" si el costo supera el precio. Estado vacío con ícono y CTA.
   • **Importar CSV (clientes y productos):** **indicador de pasos** en la cabecera del modal (1 Archivo · 2 Columnas · 3 Revisar) con dot activo/completado para que el usuario nunca pierda el hilo.
   • **Lista de cotizaciones (`/app/cotizaciones`):** **barra de resumen** al tope (valor en pipeline + aprobado por cobrar + pendientes de aprobación). **Conteos en los filtros** ("Abiertas 5", "Aprobadas 3"…). Estado vacío real cuando no hay cotizaciones. **Pista de arrastre** en la vista Kanban ("Arrastra las tarjetas para avanzar cada cotización en su pipeline").
   • Archivos modificados: `src/pages/app/cotizaciones/nueva.astro`, `src/pages/app/clientes.astro`, `src/pages/app/productos.astro`, `src/pages/app/cotizaciones/index.astro`.
    • **Ajustes y Modales (Quiet Luxury):** rediseño "borderless" nivel Stripe/Apple en las pantallas de configuración (`/app/ajustes/equipo`, `/app/ajustes/sso` y `/app/ajustes/cuenta`). Se extrajo el **SSO (SAML)** a su propia pestaña dedicada de alto nivel con un rediseño gráfico "glassmorphism" azul/blanco de Cord. Se eliminó por completo la dependencia de los componentes nativos de Clerk (`<UserProfile />`) reemplazándolos con "Islas de React" 100% custom conectadas a los Nanostores (`@clerk/astro/client`), implementando `user.update()`, `user.updatePassword()` y `session.revoke()`.

✅ **Responsive Mobile-First en Ajustes y Modales (jun 2026)** — Se refactorizó la estructura base de `/app/ajustes` (`SettingsShell.astro`) y los perfiles custom de Clerk (`CustomUserProfile.css`) para ser "mobile-first": inputs expandidos al 100%, sesiones apiladas y botones anchos tipo app nativa. Se adaptaron los modales de Developers y Agentes para que las acciones se apilen al 100% de ancho en pantallas pequeñas sin romper el grid.

✅ **Tiempo real de verdad vía SSE (jul 2026)** — el chat/presencia dejó de ser polling
   puro; se agregaron 2 endpoints SSE de larga duración (internamente siguen consultando
   Postgres, pero por PUSH en vez de por intervalo del cliente — sin infra nueva, viable
   con Fluid Compute):
   • **`GET /api/q/[token]/stream`** (público, sin auth — mismo patrón que el resto de
     `/api/q/[token]`, protegido por rate limit) — empuja `event: message` cuando el
     vendedor responde (eventos `tipo='reply'`, antes el cliente en `/q` NUNCA se enteraba
     de una respuesta sin recargar — hueco real, no solo lentitud) y `event: status`
     cuando la cotización cambia de estado del lado del vendedor (dispara
     `location.reload()` en el cliente, ya que cubrir todos los estados en vivo en el
     snapshot del script sería mucho riesgo para poco beneficio).
   • **`GET /api/cotizaciones/[id]/stream`** (requiere sesión, protegido por el
     middleware como el resto de `/api/cotizaciones/*`) — reemplaza el polling de 8s a
     `/presence` en el detalle del vendedor: empuja `event: presence {online,convCount}`
     y `event: message` (nuevo comentario/contraoferta del cliente) por push.
   • **Mecánica interna (misma en ambos):** `ReadableStream` con un loop que consulta la
     BD cada 2.5–3s, heartbeat `event: ping` cada ~20s (mantiene vivos los proxies/CDN),
     auto-cierre a los ~4.5 min (`MAX_MS`) — el cliente reconecta solo vía `EventSource`
     (reconexión nativa del navegador). `request.signal` (abort) corta el loop apenas el
     cliente se desconecta, para no dejar conexiones colgadas consumiendo el compute.
   • **Cliente:** `QuoteCard.astro` agregó `appendIncoming()` (burbuja izquierda "theirs",
     hermana de `appendMsg()` que ya existía para mensajes propios) + un `EventSource` que
     reconecta con backoff fijo de 4s en `onerror`. `[id].astro` reemplazó el
     `setInterval(poll, 8000)` por `EventSource`, con **fallback real a polling** si la
     conexión SSE nunca logra abrir (`openedOnce` — evita reintentar SSE indefinidamente
     en un entorno donde esté bloqueado, ej. algún proxy corporativo raro).
   • **Sin cambios de schema/infra:** no se tocó Redis/Upstash ni pub-sub; es polling del
     SERVIDOR hacia la BD (antes era polling del CLIENTE hacia el servidor) — el ahorro
     real es de latencia percibida (push instantáneo en vez de esperar el próximo tick del
     intervalo) y de round-trips HTTP redundantes, no de carga a la BD (sigue siendo
     consultas periódicas, solo que ahora viven en el servidor).
   ⚠️ **Regla a futuro:** si se agrega un tercer punto con esta necesidad (ej. el badge de
     notificaciones de la topbar, hoy también polling), replicar este mismo patrón
     (`ReadableStream` + loop + heartbeat + `MAX_MS` + fallback a polling) en vez de meter
     WebSockets o un pub-sub nuevo — no hace falta esa complejidad para esta escala.

**Consolidación de Informes y canon analítico (ago 2026)** — La analítica dejó de
   repartirse entre Inicio, Analítica, CFO, Flujo y Cobranza. `/app/informes` es ahora el
   shell único con siete informes registrados (`resumen`, `comercial`, `finanzas`,
   `flujo`, `cobranza`, `clientes`, `productos`), selector buscable y personalización de
   widgets persistida por informe. Los informes por rango comparten el selector de Inicio;
   los informes snapshot muestran una fecha estática y no ofrecen un control que ignoren.
   • Se extrajeron los estilos canónicos de gráficas, rango y widgets, además de los helpers
   de formato, rango y montaje de charts. Los paneles de fecha e informe se portalean al
   `body` para escapar del contexto de apilamiento de `.page-head`.
   • El canon de estados vive en `src/lib/metrics.ts`: cotizado excluye borradores, enviado
   incluye rechazadas/vencidas y cobrado acepta `status='paid'` o `paid_at`. Las series
   cobradas incorporan también cobros de igualas.
   • `getCFO()` es el único motor de pronóstico: 90 días, 13 semanas, desbordamiento
   explícito, cartera/pipeline/MRR separados y banda de confianza según muestra histórica.
   `getPayBehavior()` comparte el timing real por cliente con Cobranza.
   • Las rutas anteriores redirigen temporalmente con 302 y los pins se migran al informe
   equivalente. La navegación queda en nueve entradas y Cobranza conserva solo su trabajo
   operativo.
   • Los permisos se evalúan antes de las consultas; Inicio oculta y evita cargar widgets
   financieros sin autorización. `getDashboard()` dejó de hidratar hasta 100,000
   cotizaciones y usa agregados SQL más cinco filas recientes.
