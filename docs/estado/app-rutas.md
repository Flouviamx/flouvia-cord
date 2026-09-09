# Mapa de rutas y superficies — Cord

> Mapa completo de rutas (landing, `/app`, subdominios, API pública/MCP, entorno
> de prueba, legales) y `AppLayout`. Documento de estado actual; los detalles
> cronológicos viven en [`../historial/README.md`](../historial/README.md).
>
> El modelo de aislamiento por organización (`org_id`, tablas multi-tenant,
> política RLS, carriles de contexto, 2FA en APIs) se movió a
> [`multi-tenant.md`](multi-tenant.md).

## Mapa de rutas

Dominios propios de clientes: contrato y activación en
[`dominios-clientes.md`](dominios-clientes.md). Ajustes vive en
`/app/ajustes/dominio`; API de sesión en `/api/domains` y `/api/domains/verify`.
Implementación local apagada por defecto, pendiente de DNS/TLS real.

```
# Landing (prerender:true) — CONSTRUIDA
/                → landing de ventas (un solo index.astro que monta los componentes)
/producto/[slug] → páginas de producto (jun 2026, estilo Stripe): editor,
                   link-publico, seguimiento, cfdi, clientes-credito, cobranza-ia. Contenido en
                   src/lib/producto.ts; mockup por feature en [slug].astro (hero) +
                   components/producto/BlockMockup.astro (bloques);
                   animaciones compartidas en components/landing/PageAnims.astro
                   (masked titles via clase .masked-title, hero .pp-hero). Heroes con "settle"
                   estilo index — SIN exploded-view/tilt/partículas/flip (ver Estado actual).
                   Debajo del bento grid (jul 2026): components/producto/FeatureShowcase.astro
                   — sección tabbed estilo ElevenLabs "Flows" (mockup grande + 3 tabs debajo con
                   indicador deslizante + autoplay). Ver detalle en "Estado actual".
/precios         → página dedicada (jun 2026): toggle mensual/anual (2 meses gratis),
                   comparador completo, calculadora de valor (ROI) y FAQ.
                   Datos en src/lib/precios.ts (FUENTE ÚNICA de planes/comparativa/FAQ).
/soluciones      → HUB por industria (anclas + cada bloque enlaza a su detalle).
/soluciones/[slug] → página rica por industria (jun 2026, espejo de /producto/[slug]):
                   distribuidoras, construccion, manufactura, servicios. Contenido en
                   src/lib/solucion.ts; mockup propio por industria en [slug].astro.
/elements        → CORD Elements (jun 2026, estilo Stripe Checkout): el cotizador
                   embebible. Hero con <iframe> EN VIVO de /embed/demo en un mockup de
                   browser; snippet, pasos, features (lista), eventos dev. Enlazada en
                   el megamenú Producto.
/embed/[token]   → cotizador embebible (CORD Elements) para <iframe> de terceros.
                   Reutiliza components/q/QuoteCard.astro (mismo corazón que /q) con
                   EmbedLayout (sin chrome). Setea CSP frame-ancestors desde
                   orgs.embed_domains; postMessage resize + relay de eventos. Loader:
                   public/embed.js. export const prerender = false.

# Dev Blog (Subdominio dev.cordhq.app)
/dev-blog/*      → El ecosistema técnico para desarrolladores. El rewrite de host lo
                   hace ÚNICAMENTE `src/middleware.ts` (`SUBDOMAINS`), no vercel.json:
                   las visitas a `dev.cordhq.app` cargan esta ruta invisiblemente y los
                   accesos a `cordhq.app/dev-blog` redirigen a `dev.cordhq.app`. Los artículos viven en
                   `src/content/dev-blog/` (Astro Content Collections) y las vistas en
                   `src/pages/dev-blog/` (`index.astro`, `blog.astro`, `[slug].astro`).
                   Usa el layout 100% independiente `DevBlogLayout.astro` con estética
                   pixel/dark-mode.

# Facturación de la suscripción (Subdominio billing.cordhq.app · ago 2026)
# Superficie propia, FUERA del chrome de la app: sustituye por completo al Customer
# Portal del procesador. Ver reglas 26 y 27 de ../estandares-ingenieria.md.
/billing         → src/pages/billing/index.astro sobre BillingLayout.astro (layout
                   independiente, sin sidebar ni topbar, noindex). Suscripción en vivo,
                   tarjetas, comprobantes, CFDI del pago, datos fiscales y cancelar.
                   Exige sesión; sin ella redirige al login DEL APEX.
/billing/entrar  → única ruta sin sesión del subdominio. Canjea el token de traspaso
                   por una sesión propia de este host. Un solo uso, 90 s.
                   En PROD, todo /billing responde 404 fuera de billing.cordhq.app.

/api/billing/handoff       GET    emite el token de traspaso (vive en el APEX)
/api/billing/subscription  GET    la suscripción tal como Stripe la va a cobrar.
                                  NO deriva de orgs.plan: esa columna es la proyección
                                  de entitlements y con 100% de descuento dice 'free'
                                  sobre una suscripción viva.
/api/billing/methods       GET    tarjetas guardadas + cuál es la predeterminada
                           POST   SetupIntent para dar de alta una tarjeta
/api/billing/methods/[id]  PATCH  predeterminada (customer Y suscripción, las dos)
                           DELETE detach; rechaza la última con suscripción viva
/api/billing/invoices      GET    historial de cobros, cada uno con SU divisa
/api/billing/invoices/[id]/pdf  GET  proxy del comprobante (no se enlaza al proveedor)
/api/billing/datos         GET/PATCH  datos del customer + tax id; etiqueta por país
/api/billing/cancelar      POST   cancel_at_period_end; { reanudar: true } lo revierte
/api/billing/pagar         POST   liquida la factura abierta cuando hay past_due
/api/billing/factura       GET/POST  CFDI del pago de suscripción (solo México)
/api/billing/portal        POST   ESCAPE DE SOPORTE. Sin superficie: ninguna UI enlaza
                                  aquí y ninguna debe volver a hacerlo.
/api/geo                   GET    país por IP (x-vercel-ip-country). Sugerencia de
                                  presentación para /precios y onboarding, nunca
                                  autorización. Público (PUBLIC_API_EXACT).

Guard común: src/lib/billing-surface.ts. Cada endpoint recibe un id de objeto de
Stripe DESDE EL CLIENTE, así que `fetchOwned()` exige pertenencia al customer de la
org activa y devuelve 404 —no 403— cuando el dueño es otro: confirmar que un id
existe pero es ajeno ya es filtrar entre negocios.

# App — CONECTADA a Neon (src/lib/queries.ts); usa AppLayout.astro
/login /registro → formularios propios de acceso y alta; email/password + OAuth nativo
/app             → dashboard: KPIs (incl. "por dar seguimiento"), pipeline, recientes, feed
/app/informes    → INFORMES (ago 2026) — la única casa de la analítica. Reemplaza a
                   /app/cfo, /app/analitica y /app/tesoreria/flujo (los 3 borrados; el
                   middleware 302-redirige desde ellos vía LEGACY_ROUTES de informes.ts).
                   Una sola ruta con desplegable de informes (?r=resumen|comercial|
                   finanzas|flujo|cobranza|clientes|productos) + un solo selector de
                   fechas (?rango=30 o ?desde=&hasta=). Registro en src/lib/informes.ts
                   (cada informe declara scope 'rango'|'snapshot', perm y grupo); carga
                   de datos en src/lib/informes-data.ts; markup en
                   src/components/app/informes/*Report.astro (un componente por informe,
                   ~42 widgets). Widgets personalizables con clave por informe
                   (cord.report.<id>.v1). Gate: memberCan('analitica') + ReportDef.perm.
                   Los informes 'snapshot' NO renderizan el selector de fechas — muestran
                   un chip "Al día de hoy" (así no hay control que ignorar).
/app/desempeno   → desempeño del equipo (jul 2026; hoy 2ª pestaña junto a Informes):
                   ranking por vendedor (cotizaciones creadas/enviadas/cerradas, tasa de
                   cierre, monto cerrado, cobrado, ticket promedio, días a cierre) vía
                   getDesempeno() en queries.ts. Atribución por cotizaciones.creado_por
                   (`users.id`); gateado por el permiso `analitica`.
/app/cobranza    → cuentas por cobrar (jun 2026): cartera total, vencido, aging por
                   antigüedad, exposición por cliente (saldo vs límite) y tabla con
                   "marcar cobrada" + recordatorio por WhatsApp. getCobranza() en
                   queries.ts (por cobrar = status approved|invoiced; vence según términos).
/app/cobros      → "Mi dinero" (jul 2026). Gateado por el permiso `cobranza`; los
                   reembolsos exigen además `reembolsar`. SSR pinta SOLO lo que sale
                   de Neon (loadCobros en cobros-data.ts); todo lo del proveedor llega
                   después en UNA llamada a /api/cobros?parts=stripe, y `conectado` se
                   deriva de orgs, nunca de esa respuesta. WidgetGrid con prefs por
                   miembro (storageKey cord.cobros.v1). Los depósitos se leen de la
                   tabla `payouts` (listPayoutsFromDb en stripe-cobros.ts), poblada por
                   los webhooks payout.*; la lectura viva queda como respaldo.
/app/cobros/disputas/[disputeId]
                 → editor de evidencia de contracargo. El envío es irreversible y
                   exige step-up; ningún cron ni webhook puede enviarla solo
                   (scripts/dispute-safety-check.mjs).
/app/ajustes/cobros
                 → alta de Cord Payments (Connect Custom) + métodos de cobro + cuenta
                   de depósito manual + aceptación de la tarifa. Gateado por
                   `cobros_config`. El island recibe un DTO ANGOSTO, no el objeto
                   completo de getOrg(): Astro serializa las props al HTML y ahí
                   viajaba la cuenta de depósito descifrada.
/verificar-identidad/[token]
                 → captura móvil de documentos, PÚBLICA y noindex. El token es la
                   credencial (identity_capture_sessions) y la persona se deriva de la
                   FILA de la sesión, nunca del body (regla 30).
                   Es la ÚNICA ruta con camera=(self) en Permissions-Policy — el
                   default camera=() deshabilitaba getUserMedia también aquí, así que
                   el flujo del QR no arrancaba en Chromium.
                   Como el token viaja en el path: no-referrer, no-store, X-Robots-Tag
                   y `analyticsDisabled` (PostHog registraba la credencial viva en
                   $current_url). Ver regla 34.

APIs de cobros (ago 2026)
─────────────────────────
/api/billing/connect/create           POST   crea la cuenta conectada; 409 si el país
                                             no tiene riel (supportsOnlinePayments).
/api/billing/connect/account          PATCH  allowlist ACCOUNT_CONNECT_FIELDS. Las
                                             declaraciones legales y tos_acceptance se
                                             firman en SERVIDOR (date/ip/user_agent).
/api/billing/connect/persons          GET/POST/PATCH/DELETE — personas de KYC (UBO).
                                             Pertenencia verificada contra
                                             connect_personas ANTES de llamar al
                                             proveedor; step-up en las tres mutaciones;
                                             tope duro MAX_PERSONAS. El GET reconstruye
                                             la proyección si está vacía (backfill
                                             perezoso, sin migración masiva).
/api/billing/connect/status           GET    devuelve requirements SANEADOS + future_
                                             requirements + estado de verificación.
/api/billing/connect/document         POST   multipart. El `purpose` lo decide el
                                             DESTINO: identity_document (persona),
                                             additional_verification (empresa),
                                             account_requirement (documents.*).
/api/billing/connect/external-account POST   cuenta de depósito. Checksum en Cord,
                                             divisa derivada del PAÍS (no de
                                             orgs.moneda), cifrada al guardar, step-up.
/api/billing/connect/payout-schedule  GET/PATCH — frecuencia de depósito (diaria,
                                             semanal, mensual, manual) + días de
                                             retraso. Step-up y auditoría.
/api/billing/connect/capture-session  POST   acuña el token del QR. Step-up: es una
                                             credencial portadora que sube documentos.
/api/billing/connect/capture/[token]  GET/POST — PÚBLICA (PUBLIC_API_PREFIXES), no
                                             exenta de CSRF. Partes: front | back |
                                             address, más `action=cerrar`.
                                             Estados: pending → en_progreso →
                                             min_cubierto → cerrada | bloqueada. Sólo
                                             los dos últimos rechazan: colapsar
                                             min_cubierto con cerrada dejaba el REVERSO
                                             inalcanzable.
                                             Binding al primer dispositivo por cookie,
                                             tope acumulado de intentos incrementado
                                             ANTES de llamar al proveedor, ventana
                                             deslizante (30 min / 15 desde el primer
                                             uso) y dedupe por SHA-256. La auditoría usa
                                             created_by como actor real.
/api/billing/connect/{payouts,disconnect}
/api/billing/fees/accept              POST   activa la tarifa; zod z.literal de la
                                             versión exacta + step-up.
/api/cobros                           GET    payload de "Mi dinero" (?parts=stripe).
/api/cobros/[cobroId]/reembolso       GET/POST — nonce de un solo uso + step-up +
                                             idempotencia; la comisión NO se devuelve.
/api/cobros/disputas/[disputeId]/{evidencia,archivo,auto-evidence}
/api/q/[token]/{payment-intent,checkout,subscription-intent,spei-email}
                                             carril público del cobro de una cotización.
/api/i/[token] y /api/i/[token]/payment-intent
                                             carril público de la factura hospedada.
                                             ⚠️ /api/i/ DEBE estar en
                                             PUBLIC_API_PREFIXES: sin él el middleware
                                             responde 401 y la factura no se puede
                                             pagar (ver regla 33).
/api/stripe/webhook                   POST   plataforma Y cuentas conectadas, con
                                             secreto separado. Falla cerrado sin
                                             secreto; un evento firmado con el de
                                             Connect EXIGE event.account.

/app/cotizaciones        → tabla con filtros por estado (client-side)
/app/cotizaciones/nueva  → EL EDITOR — POST /api/cotizaciones (real). Comparte
                           con Facturas el contrato semántico de tema para panel,
                           campos, hero de IA, estados vacíos, dropdowns y foco
                           (`--editor-*` en `AppLayout`); ningún panel fija blanco.
/app/cotizaciones/[id]   → detalle + timeline + ACCIONES REALES (enviar, aprobar,
                           rechazar, pago, facturar, copiar link, eliminar borrador,
                           DUPLICAR → POST /api/cotizaciones/[id]/duplicate,
                           ENVIAR POR WHATSAPP → wa.me con mensaje + link pre-armado)
                           via PATCH/DELETE /api/cotizaciones/[id]. (paid acepta desde
                           'approved' o 'invoiced'). Presencia ("viendo ahora") + aviso de
                           mensajes nuevos EN VIVO (jul 2026, SSE) via GET
                           /api/cotizaciones/[id]/stream — reemplazó el polling de 8s a
                           /presence; ver "API Pública" abajo.
/app/cotizaciones/[id]/imprimir → PDF imprimible (window.print) personalizado con
                           la marca de la org: PLANTILLA (clasico|minimal|detallado vía
                           data-template en .sheet), LOGO real (ORG.logoUrl) o inicial,
                           color, contacto, mensaje, condiciones. print-color-adjust:exact.
/app/clientes /app/productos → CRUD real con modal <dialog> (POST/PATCH/DELETE
                           /api/clientes y /api/productos). Productos también con
                           IMPORTACIÓN CSV (botón → modal archivo/mapeo/preview →
                           POST /api/productos/import [dedupe por SKU] y
                           /api/clientes/import [dedupe por RFC/empresa]).
/app/clientes/[id]        → ficha con ESTADO DE CUENTA (ago 2026, antes del
                           historial de cotizaciones): saldo total, vencido,
                           atraso máximo y bandas de antigüedad (corriente,
                           1–30, 31–60, 61–90, 90+), leídas de
                           `cuentas_por_cobrar` — el mismo saldo que persigue la
                           cobranza. `getEstadoCuentaCliente()` en queries.ts.
/app/productos/kits       → (jul 2026) sub-pestaña de Productos (page-tabs
                           Catálogo|Kits, NO Ajustes): Kits de cotización — paquetes
                           pre-armados de renglones para insertar de un clic en el
                           editor. CRUD vía /api/kits (+/api/kits/[id]), incluye
                           precio de combo opcional (precio total fijo prorrateado
                           al insertar). Ver tabla `kits`/`kit_items` arriba.
/app/ajustes     → ÍNDICE (estilo Stripe): LISTA de CATEGORÍAS (no tarjetas, no
                   rail). Ajustes YA NO va en el sidebar — se entra por el engrane de
                   la topbar. Modelo en `src/lib/settings.ts`: **CATEGORÍAS → pestañas**
                   (`SETTINGS_CATEGORIES`, `categoryOfTab()`). Cada categoría abre su
                   primera pestaña; dentro, las sub-páginas son **PESTAÑAS horizontales**
                   (NO rail lateral, jun 2026 — André lo pidió). El `SettingsShell.astro`
                   recibe `tab="x"` (deriva la categoría), pinta breadcrumb + título +
                   tabs + slot + barra de guardar opcional. Guardado GENÉRICO: junta los
                   `[data-field]` → PATCH /api/org. La categoría de facturación se
                   adapta al país de la organización: México muestra RFC, régimen,
                   CSD y CFDI 4.0; los demás países muestran perfil fiscal y factura
                   comercial, indicando cuando aún no existe conexión con la autoridad.
                   El país se puede corregir en General; al cambiarlo se reconfigura
                   la experiencia fiscal en la siguiente navegación.
                   Categorías:
                   • Empresa: general · marca · facturación · plan
                   • Cotizaciones: cotizaciones (folio/IVA/retenciones/defaults/legal) · pdf · aprobaciones
                   • Equipo y roles: equipo
                   • Avanzado: integraciones · auditoria
                   • Tu cuenta: **cuenta** → monta `CustomUserProfile` propio (perfil,
                     sesiones, 2FA, passkeys y cuentas conectadas — identidad del
                     usuario, distinta de los datos del negocio).
                   Descubribilidad (ago 2026): antes el índice sólo pintaba el nombre de
                   las 14 CATEGORÍAS — las 23 pestañas reales (p. ej. "Impuestos" dentro
                   de Cotizaciones) nunca se mostraban en ningún lado, así que llegar al
                   catálogo de tasas eran 5 clics / 3 cargas de página. Cada fila del
                   índice muestra ahora sus pestañas como sub-links (`c.tabs`, ya
                   localizados y renombrados por país vía `localizeCategories()`) — la
                   fila pasó de `<a>` a `<div>` con el título como link propio, porque no
                   se pueden anidar `<a>`; el clic en toda la fila se conserva con una
                   capa `aria-hidden`/`tabindex="-1"` por debajo. ⌘K también indexa las
                   23 pestañas con sinónimos (`SettingsTab.keywords`, ago 2026): "IVA",
                   "VAT", "NIF", "CSD" o "Verifactu" ya encuentran su destino aunque no
                   sean el nombre de ninguna pestaña — antes `cmdkNav` sólo tenía una
                   entrada genérica "Ajustes". Los sinónimos empatan por PRINCIPIO DE
                   PALABRA (`"iva".startsWith`), no por substring, porque por substring
                   "iva" adentro de "privacidad" devolvía Datos y privacidad. La pestaña
                   "Facturas emitidas" de Facturación se quitó de `settings.ts`: era un
                   301 a `/app/facturas` que sacaba al usuario de Ajustes — invisible
                   mientras las pestañas no se mostraban, notorio en cuanto el índice
                   empezó a listarlas. El breadcrumb de `SettingsShell` ahora incluye la
                   pestaña activa (`‹ Configuración / Impuestos`), no sólo la categoría.

/app/facturas            → bandeja de facturas (`documentos_fiscales`, ago 2026).
                   Paginada por CURSOR en servidor. Distingue "Sin folio" de
                   los números oficiales, muestra fecha de creación, vencimiento,
                   saldo y estado operativo (incluidos vencida y error al emitir).
                   Casillas + barra de acciones
                   para ENVÍO MASIVO (hasta 50 por tanda) vía POST
                   /api/facturas/bulk — el servidor vuelve a filtrar qué es
                   enviable (emitida + no enviada + open|uncollectible), la UI
                   no autoriza. Todas las filas conservan una casilla visible:
                   borradores, enviadas y no elegibles la muestran deshabilitada
                   con el motivo en `title`/`aria-label`, en vez de dejar un hueco.
                   El estado financiero ocupa la insignia principal; entrega y
                   entorno aparecen como metadato secundario (`Enviada · Prueba`),
                   para que no compitan tres badges dentro de una columna estrecha.
                   Exporta la vista filtrada a CSV y enlaza a
                   /app/facturas/recurrentes.
/app/facturas/nueva      → EL EDITOR de facturas — impuesto por línea desde el
                   catálogo de la org (`buildTaxOptions`), retenciones que se
                   restan del total, vocabulario fiscal del país del emisor
                   (`getCountryProfile().taxLabel`/`taxIdLabel`). Módulo
                   bundleado (no `is:inline`): importa `calculateDocumentTotals`
                   de `packages/elements/src/engine.ts`, el MISMO motor que
                   calcula el servidor. La acción primaria es "Emitir y enviar":
                   primero muestra una revisión final, guarda el borrador y llama
                   `finalize_and_send`. El folio solo nace al emitir. También
                   permite emitir sin enviar o guardar y salir.
                   Su hoja `src/styles/editor.css` consume los tokens
                   `--editor-*` de `AppLayout`: resumen, campos y menús mantienen
                   contraste en dark; el hero de IA usa un navy propio y no el
                   acento azul claro del tema oscuro.
/app/facturas/[id]       → detalle con la misma jerarquía operativa que
                   Cotizaciones: progreso Borrador → Emitida → Enviada → Vista
                   → Pagada, cabecera cliente/total, partidas y saldos abiertos,
                   columna sticky de acciones y timeline propio
                   (`eventos.documento_id`, ver `src/lib/fiscal/timeline.ts`).
                   ACCIONES REALES: reintentar emisión, enviar, registrar pago
                   manual, anular, nota de crédito y duplicar como borrador.
                   Abrir link, copiar, PDF y WhatsApp forman una sola cuadrícula
                   de utilidades; ambas rutas reutilizan el logo de marca de
                   `WhatsAppIcon.astro`. Sus superficies consumen `--surface` y
                   `--surface-2`; no pueden fijar blancos porque el detalle comparte
                   el mismo contrato de tema claro/oscuro que `AppLayout`. Después
                   de la primera entrega, el CTA
                   principal pasa a pago y el envío queda como reenvío contextual
                   junto al destinatario; las acciones de excepción viven bajo
                   "Más acciones". El botón "Repetir cada mes"
                   hace POST /api/recurrencias con
                   `fromDocumentoId` (copia el snapshot inmutable de líneas, no
                   el catálogo, que pudo cambiar de precio).
/app/facturas/recurrentes → (ago 2026) lista de `documento_recurrencias`: pausar/
                   reanudar/eliminar. Pausar se permite SIEMPRE, incluso sin
                   plan — un downgrade no puede dejar a alguien sin poder
                   detener un cargo automático. Crear vive en el botón "Repetir
                   cada mes" de una factura ya emitida, no aquí.
/i/[token]       → hosted invoice page — saldo, historial de pagos, PDF/XML,
                   documento público con la misma jerarquía visual de `/q`:
                   marca y folio, saldo protagonista, partes, conceptos y
                   estado. Los documentos simulados o de sandbox muestran una
                   advertencia explícita y no ofrecen pago en línea.
                   Incluye pago con tarjeta (Stripe Elements) con REUTILIZACIÓN del
                   PaymentIntent vivo de la factura, y ABONO PARCIAL (ago 2026):
                   el monto lo propone el cliente y el servidor lo acota contra
                   el saldo real y el piso del proveedor
                   (POST /api/i/[token]/payment-intent con `{monto}` opcional).
                   Solo tarjeta — SPEI es un riel de México y liquida solo MXN.
                   Mismo tratamiento de actor que /q (regla 19): la vista se
                   marca solo la primera vez y solo si el actor es cliente.
/q/[token]       → vista PÚBLICA — aprobar/rechazar REALES via POST /api/q/[token]
                   (token = secreto, sin auth); muestra estado si ya se decidió;
                   "Descargar PDF" = window.print con @media print; color de marca
                   de la org. Token demo: /q/demo.
                   DOCUMENTO VIVO (ago 2026): el SSE empuja `patch` y el card aplica
                   los cambios del vendedor al DOM sin recargar (importes con
                   count-up, flash en la línea que cambió, rótulo "antes $X").
                   Solo un estado TERMINAL (paid/rejected/expired/invoiced) recarga.
                   Presencia mutua: el cliente ve "Ana está en línea".
                   ACTOR (Regla 19): el SSR ya NO marca la vista. La marca el
                   heartbeat (POST action:'ping'), que exige JS + pestaña visible.
                   src/lib/public-viewer.ts resuelve seller | bot | client; el
                   vendedor ve un banner de vista previa y no genera señal.
                   Cookie `cord_q_visitor` (httpOnly, 1 año) = personas y aperturas.
/embed/[token]   → mismo QuoteCard dentro de un iframe de terceros (Cord Elements).
                   Mismo tratamiento de actor. Ojo: la cookie es SameSite=Lax, así
                   que en un iframe cross-site no viaja y el actor cae al
                   identificador derivado de IP+org — suficiente para no contar al
                   equipo como cliente, insuficiente para distinguir dispositivos.
/desarrolladores/[slug] → páginas de desarrolladores (jun 2026, prerender, mismo
                   sistema que /producto/*): api (terminal curl + JSON response) y
                   mcp (chat UI con tool call). Contenido en src/lib/desarrolladores.ts.
                   Enlazadas en el megamenú DESARROLLADORES del navbar.

# Auth propio (ago 2026)
/api/auth/{register,login,logout,login/2fa} → núcleo de sesión. PÚBLICOS (se
                   auto-autentican) — ver PUBLIC_API_PREFIXES en middleware.ts.
/api/auth/{google,apple}/{index,callback}   → OAuth con PKCE (Google) y JWKS
                   real (Apple — verifyAppleIdToken en auth-apple.ts).
/api/auth/passkeys/{register-options,register,auth-options,verify} → WebAuthn
                   (@simplewebauthn/server v13).
/api/auth/reset-password/{request,confirm}  → reset con token sha256, 15 min.
/api/auth/verify-email/{request,confirm}    → verificación de correo BLOQUEANTE
                   (register.ts ya no crea sesión hasta confirmar).
/api/account/**  → INTERNOS (heredan el gate de sesión del middleware, a
                   diferencia de /api/auth/). profile · password ·
                   sessions (listar/revocar) · 2fa/{start,verify,disable,
                   backup-codes} · passkeys (listar/[id] DELETE) ·
                   connections/[provider] DELETE. Ver CustomUserProfile.tsx.
/ops             → Centro de operaciones interno, aislado del layout y analytics
                   públicos. Solo los dos operadores de la allowlist doble;
                   passkey o password+TOTP en producción.
/ops/users/[id]  → ficha de identidad: perfil, membresías, sesiones, passkeys,
                   OAuth, suspensión/restauración y auditoría.
/ops/organizations/[id] → ficha del workspace: equipo, cotizaciones, clientes,
                   productos, pagos, API keys, webhooks y SSO.
/ops/usage        → centro de consumo y riesgo por organización: cuotas de IA,
                   API y CFDI; tokens Anthropic; correos Resend; errores API;
                   fallos de webhooks; volumen Stripe y tamaño de Neon. Alertas
                   preventivas al 80% y críticas al 100% de la cuota. La tabla usa
                   búsqueda server-side y páginas SSR de 50; los totales/alertas se
                   calculan aparte y nunca se envía el catálogo completo de orgs.
/ops/database/[table] → explorador paginado de todas las tablas públicas. Los
                   campos criptográficos, secretos, tokens y datos financieros
                   sensibles permanecen redactados y no son buscables. La navegación
                   es keyset por cursor `created_at/id`, sin `OFFSET` profundo ni
                   `COUNT(*)`; el total sin filtro es una estimación de `pg_class`.
/ops/security    → sesiones Ops, señales de identidad y bitácora privilegiada. La
                   auditoría se pagina a 50 filas y las señales muestran el inbox
                   acotado de las 50 identidades más recientes que requieren atención.
/api/ops/users/[id] → PATCH administrativo: revocar sesiones, desbloquear o
                   eliminar una identidad no protegida. Rol Ops admin y auditoría
                   atómica obligatorios.
/api/ops/organizations/[id] → PATCH administrativo: revocar llaves API,
                   desactivar webhooks, cerrar sesiones del equipo o eliminar una
                   organización no protegida. Confirmación escrita para acciones
                   destructivas y auditoría en la misma transacción.
/api/orgs        → POST crea una org (el servidor genera el id — reemplaza a
                   /api/orgs/provision, que tenía un IDOR cross-tenant real).
/api/fiscal/documents/[id]/{pdf,xml} → descarga autenticada y acotada al `org_id`.
/api/fiscal/verifactu-cert → POST multipart {p12,password} sube y valida el
                   certificado de Verifactu (España); DELETE lo desconecta. Solo
                   subir un certificado que `parsePkcs12()` valida enciende
                   `orgs.verifactu_modo`. `requirePerm('ajustes')` +
                   `requireFreshAuth()` (step-up), igual que `/api/fiscal/csd`.
/api/cron/verifactu-submit → outbox de Verifactu (diario — el plan de Vercel de
                   Cord no permite crons más frecuentes; subir la frecuencia en
                   cuanto lo permita): envía a la AEAT los `verifactu_registros`
                   con `envio_estado='pendiente'`. El encadenamiento ya ocurrió
                   síncrono al emitir; esto es SOLO el envío, detrás de
                   `VERIFACTU_AEAT_ENABLED` explícito.
                   CFDI se proxifica desde Facturapi; las facturas comerciales se
                   renderizan desde los snapshots canónicos de Cord. XML solo existe
                   cuando el rail regulatorio realmente lo produce.
/api/equipo/resend → POST regenera el link de una invitación pendiente (rota
                   el token; el crudo original no es recuperable, solo su hash).

# API Pública (REST + MCP)
/api/notificaciones  → GET feed de actividad reciente (reusa tabla eventos; último ts para punto rojo)
/api/q/[token]   → acciones del CLIENTE (sin auth). approve | reject | comment |
                   counter | item_comment | ping | hito.
                   `ping` es el latido del documento vivo: marca la vista (una sola
                   vez, solo si el actor es cliente), escribe presencia CON ACTOR y
                   acumula atención por sección. `hito` cuenta abrir el PDF o
                   expandir una línea. `approve` acepta `rev` y responde 409
                   {stale:true} si la propuesta cambió mientras el cliente la leía —
                   la firma nunca cae sobre un total que el cliente no vio.
                   El payload del latido NO es de confianza: claves de vocabulario
                   cerrado y techo de 60s por clave/tick (src/lib/atencion.ts).
/api/q/[token]/stream        → SSE público (jul 2026, sin auth — token = secreto).
                   event: ready | patch | presence | message | line_message | status | ping.
                   `line_message {item_id, contenido}` entrega la respuesta del
                   vendedor en el hilo de UNA partida (cotizacion_comentarios, tabla
                   distinta de eventos). Antes no viajaba por ningún stream: el
                   vendedor respondía en una línea y el cliente con la página abierta
                   no se enteraba nunca (Regla 20). Filtra autor_tipo='usuario' — los
                   del propio cliente ya los pintó su envío optimista.
                   Sigue siendo polling a Neon DENTRO de la conexión larga, sin infra
                   nueva. Lo barato lo hace `cotizaciones.rev`: el ciclo normal lee un
                   entero y solo paga el snapshot completo (getLiveSnapshot) cuando ese
                   entero avanza. Cadencia adaptativa 1s (vendedor y cliente juntos) /
                   2.5s (solo cliente) / 5s (reposo); el cliente CIERRA la conexión al
                   ocultar la pestaña. `lastRev` avanza DESPUÉS del snapshot: adelantarlo
                   convertía un fallo transitorio de BD en un parche perdido para siempre.
/api/cotizaciones/[id]/stream → SSE con sesión (jul 2026). Empuja presencia
                   (event:presence {online,convCount,seccion,escribiendo}), mensajes
                   nuevos del cliente (event:message) y sus comentarios por partida
                   (event:line_message, filtrando autor_tipo='cliente') al detalle
                   del vendedor — reemplaza
                   el polling de 8s a /api/cotizaciones/[id]/presence (endpoint que sigue
                   vivo como fallback si el navegador no abre SSE).
                   También ESCRIBE la presencia del vendedor mientras la conexión vive:
                   es lo que hace que el cliente lo vea en línea en /q/[token]. Al cerrar,
                   retrocede su last_seen para apagarse sin esperar la ventana de 30s.
                   ⚠️ Gateado con live_presence: en Gratis/Starter devuelve 402, y el
                   fallback de polling apunta a /presence, que tiene el mismo gate. Así
                   que en esos planes el vendedor NO recibe nada en vivo — recarga.
                   El carril público del cliente nunca se gatea, de ahí la asimetría;
                   ver "Qué es en vivo en cada plan" en negocio-billing.md.
                   La presencia del vendedor tiene DOS escritores y solo este está
                   gateado: el otro es el heartbeat de /api/q/[token], que corre cuando
                   el propio vendedor abre el link público en vista previa.
/api/cotizaciones/[id]/atencion → resumen de atención del cliente (ago 2026). Personas,
                   aperturas, primera/última vez y segundos por sección. Gated con
                   requireEntitlement(orgId,'quote_attention') EN EL ENDPOINT — ocultar
                   el bloque no es autorización (Regla 17). Excluye a propósito las
                   visitas del propio equipo: mezclarlas vuelve ruido el panel.
/api/v1/me           → whoami (scope any)
/api/v1/cotizaciones → GET list (filtros status/limit/offset) + POST crear
/api/v1/cotizaciones/[id] → GET detalle (items + eventos)
/api/v1/clientes     → GET list + POST crear
/api/v1/productos    → GET list + POST crear
/api/v1/cobranza     → GET cartera
/api/mcp             → MCP JSON-RPC 2.0 (transporte moderno, sin sesión):
                   initialize/ping/tools/list/tools/call. Motor compartido en
                   src/lib/mcp/rpc.ts (jul 2026 — antes vivía inline aquí).
/api/mcp/sse + /api/mcp/message → transporte MCP legacy (HTTP+SSE), mismo
                   motor rpc.ts. Sesión (orgId/scope/keyId) en
                   src/lib/mcp/session-store.ts (Redis vía Upstash si está
                   configurado, si no Map en memoria — mismo patrón que
                   ratelimit.ts); message.ts exige Authorization: Bearer
                   ADEMÁS del sessionId y valida que la llave sea de la
                   MISMA org que abrió la sesión.
/api/webhooks        → CRUD webhooks salientes + POST action:test|redeliver|rotate
                   (rotate = ventana de solape 1h/24h/72h, devuelve secret nuevo 1 vez)
/api/cron/webhooks   → sweeper del outbox (cada minuto) — reclama trabajo vencido
                   (invocaciones muertas, reintentos programados) vía withSystemTx.
/api/cron/webhooks-limpieza → retención diaria (webhook_deliveries >30d + tope 500/
                   endpoint; webhook_events resueltos >30d, failed >90d). Borrado en
                   lotes acotados, nunca un DELETE gigante.
/api/cron/expirar-cotizaciones → diario (jul 2026): mueve a status='expired' toda
                   cotización sent/viewed cuya vigencia ya pasó (antes ningún código
                   path escribía ese status); registra evento interno + audit log +
                   dispara el webhook quote.expired.
/api/cron/recurrencias → (ago 2026) emite las facturas recurrentes que ya tocan
                   (`src/lib/fiscal/recurrencias.ts`). `next_run_at` avanza ANTES
                   de emitir — al revés, un fallo a medio camino deja la
                   recurrencia elegible otra vez y el cliente recibe la misma
                   factura dos veces. El gate de plan se evalúa EN CADA CORRIDA,
                   no solo al crear.
/api/cron/recordatorios → escalera de cobranza de facturas (ago 2026, antes un
                   correo en una ventana de 5 días). Cadencia configurable por
                   org (`orgs.recordatorio_etapas`); dedup real en
                   `documento_recordatorios`, no en el calendario.
/api/cron/intereses → intereses moratorios sobre los DOS rieles (ago 2026, vía
                   `cuentas_por_cobrar`), calculados sobre el SALDO.
/api/recurrencias → CRUD de `documento_recurrencias`. POST admite
                   `{fromDocumentoId}` para crear desde una factura ya emitida
                   (copia su `line_items_snapshot`, traduciendo el vocabulario
                   del documento fiscal al del borrador). PATCH `{activa}` no
                   exige plan — pausar siempre se permite.
/api/facturas/bulk → POST `{action:'send', ids:[...]}`, envío secuencial
                   (nunca en paralelo — el proveedor de correo limita), hasta 50
                   por tanda. Reporta cuántas NO se enviaron y por qué.
/api/facturas/export → GET CSV de la vista filtrada (`estado`, `q`, cliente y
                   rango de fechas). Consulta ordenada por `created_at,id` y
                   aplica un techo defensivo de 10,000 filas; neutraliza fórmulas
                   en celdas de texto antes de abrirse en Excel o Sheets.

# Entorno de PRUEBA (jul 2026 — ver "Entorno de prueba REAL tipo Stripe" en ../historial/README.md)
/api/test-mode/reset → POST "Vaciar datos de prueba" (interna, requiere sesión). Solo opera si
                   getActiveOrgId() resuelve a una org SANDBOX (guard `sandbox_of is not null`
                   antes de cualquier DELETE — nunca toca una org real); borra la sandbox entera
                   (cascade limpia cotizaciones/clientes/productos/etc.) y se recrea fresca +
                   reseed la próxima vez que se resuelva en modo prueba.

# Legales
/privacidad      → Aviso versionado LFPDPPP: distingue responsable/encargado y separa
                   subencargados, proveedores con obligaciones propias, autoridades e
                   integraciones dirigidas por el Cliente. Declara que el DPA independiente
                   sigue en borrador, que AEAT está desactivada por defecto, que incidentes
                   del encargado se notifican sin dilación indebida y que el borrado primario
                   no elimina automáticamente evidencia/proveedores. `prerender:true`,
                   scrollspy IntersectionObserver, TOC sticky con 14 secciones.
/terminos        → Términos y Condiciones (17 cláusulas): descripción del software, PI y
                   Feedback, planes + metered billing, autorización de débito (Stripe),
                   actividades prohibidas (EFOS/lavado), Fair Use, terceros, responsabilidad
                   fiscal, confidencialidad, indemnización, SLA + Fuerza Mayor, límite de
                   responsabilidad (12 meses pagados), API pública, uso de marca, cancelaciones
                   (sin reembolsos), ley aplicable (México / CDMX) y cambios. `prerender:true`,
                   scrollspy IntersectionObserver, TOC sticky con 17 secciones.
```

**Columnas de personalización en `orgs`** (jun 2026, al final de `db/schema.sql`
como `alter table … if not exists`): `color_marca`, `email_contacto`, `telefono`,
`direccion`, `pdf_mensaje`, `pdf_condiciones`, `pdf_mostrar_lista`, **`pdf_template`**
(clasico|minimal|detallado, agregada jun 2026). `logo_url` (en la tabla base) ahora
guarda también data URLs de logos subidos en Ajustes. **Jun 2026 además:**
`cotizaciones.viewer_last_seen` (presencia), tabla **`tareas`** (CRM), y la **fase
enterprise**: `clientes.nivel`/`descuento_pct` (price tiers), `orgs.aprob_descuento_max`/`aprob_monto_max`/`aprob_margen_min`/`interes_moratorio_pct` +
`cotizaciones.aprob_estado`/`aprob_motivo` + `productos.costo` + `cotizacion_items.costo_unitario`
(Auditor Silencioso de márgenes), y la tabla **`audit_log`**. **Superpoderes de config (jun 2026):**
`orgs.vigencia_default_dias`/`terminos_default` (defaults que el editor `/nueva` SÍ
usa), `retencion_isr_pct`/`retencion_iva_pct`/`texto_legal`, `sitio_web`/`whatsapp`,
y fiscales SAT `regimen_fiscal`/`uso_cfdi`/`cp_fiscal`/`serie_folio` (catálogos en
`src/lib/sat.ts`). ⚠️ **El IVA ahora se respeta de verdad**: el editor y
`POST /api/cotizaciones` calculan con `orgs.iva_pct` (antes estaba hardcodeado 16%).
**Superseded ago 2026:** `orgs.iva_pct` quedó como respaldo de compatibilidad; la
fuente real es el catálogo `impuestos` con tasa **por línea** — ver `eventos` y
regla 23 arriba, y `retencion_isr_pct`/`retencion_iva_pct` se leen del catálogo
en vez de capturarse aparte (`/app/ajustes/cotizaciones` ahora los muestra en
modo lectura con link a Impuestos).
Medidor de uso real del plan en `getPlanUsage()`. **Jun 2026 (API/Webhooks):** tabla
`api_keys` (`org_id`, `key_hash` SHA-256, `mode` test|live, `scope` read|write, `label`,
`last_used_at`, `revoked`); tabla `webhooks` (`org_id`, `url`, `eventos` jsonb, `secret`
en claro para firma, `activo`, `last_status`, `last_error`, `last_delivery_at`);
columna `orgs.embed_domains` (allowlist CSP para Elements). **Jul 2026 (salud + rotación):**
`webhooks` ganó `fallos_consecutivos`, `deshabilitado_at`/`deshabilitado_motivo`,
`aviso_fallos_at`, `secret_prev`/`secret_prev_expira`/`secret_rotado_at`; `webhook_deliveries`
ganó `message_id`/`event_id` (liga al outbox); tabla nueva `webhook_events` (ver arriba). ⚠️
Correr `npm run db:migrate` tras pull.

**Mock data:** `src/lib/mock.ts` exporta `ORG`, `PRODUCTOS`, `CLIENTES`,
`COTIZACIONES` (con items + eventos), `STATUS_META` (label/color/bg por estado),
helpers de dinero (`money`, `quoteTotal`…) y `findQuote`/`findQuoteByToken`.
La org demo es "Materiales del Valle" (construcción) — coherente con el mockup
del hero (COT-0148 → El Zarco). Al conectar Neon: reemplazar imports por queries.

**AppLayout (`src/layouts/AppLayout.astro`):** sidebar de vidrio sticky **temada con `--sb-*`**
(blanca en claro / navy en oscuro; logo navy↔blanco según tema, nav con íconos, org-switcher
arriba, "Fijados" antes de los grupos nav, footer con logo). El `<OnboardingWidget>` y su píldora
(`#onbPill` en `.tb-right`) se montan aquí, gated por `!setup.complete`.
Props: `title`, `page`, `heading?`, `crumbs?` (breadcrumbs). Slots: `topbar-actions`
(botones del page-header, derecha), `page-sub` (subtítulo opcional bajo el título),
`page-tabs` (tabs de sección, bajo el título — usar clase `.ph-tab`), slot default (contenido).
Topbar: buscador izquierda → tb-right (onb-pill, campana/notificaciones, ajustes).
Page-head: breadcrumbs → `h1.ph-title` + botón pin → ph-actions → ph-tabs-row.
Clases globales reutilizables: `.card`, `.status-pill`, `.editorial`, `.skeleton`,
`.skeleton-line`, `.ph-tab`. API JS global: `window.cordToast(msg, type, ms)` y
**`window.cordConfirm(opts): Promise<boolean>`** (jul 2026 — modal de confirmación,
reemplaza `confirm()` nativo en toda la app; ver detalle en `sistema-de-diseno.md`
→ "Modal de confirmación global"). `sessionStorage 'cord.flash'` para flash post-navegación.
Banner sticky de **entorno de prueba** (`#testEnvExit`/`#testEnvReset`) montado aquí,
gated por la cookie `cord_test_mode` (ver ../historial/README.md). Entradas con CSS `app-fadein`
escalonado (NO GSAP). Mobile: sidebar → drawer (ocupa 80vw, tab bar inferior ELIMINADA jun 2026).
En móvil la topbar muestra burger + crear (círculo) + lupa (ícono) + campana. Ayuda y config
viven en la sección `.sb-mobile-actions` dentro del drawer (oculta en desktop).
⚠️ Estilos de contenido inyectado por JS (Cmd+K items, notif panel, toasts, pins)
DEBEN vivir en `<style is:global>` — Astro scopea por `[data-astro-cid]` y el HTML
dinámico no lleva ese atributo. NO moverlos al bloque `<style>` scopeado.

**Idioma en las islas de React (ago 2026):** una isla de cliente (`client:load`/
`client:only`) NUNCA importa `src/i18n/app.ts` — pesa ~373 KB y mandarlo al
navegador de quien menos lo necesita (el cliente del vendedor, en `PaymentIsland`)
es el ejemplo real que originó la regla. El patrón: la página `.astro` resuelve
los textos con `t(L, …)` en servidor y los pasa como prop `strings`/`locale`, o la
isla declara su propio diccionario local `{ es: {...}, en: {...} }` cuando sus
textos no se comparten con ninguna página (`ConnectCustomOnboarding.tsx`,
`CustomOrgSwitcher.tsx`, `CreateWorkspaceModal.tsx`, `CustomUserProfile.tsx`,
`IdentityCaptureMobile.tsx`). El alta de cobros (`ConnectCustomOnboarding`)
además dejó de asumir México: el vocabulario SAT/RFC/INE y los 32 estados solo
se muestran cuando `org.countryCode === 'MX'`; fuera de México usa
`getCountryProfile()` y campos libres.

---
