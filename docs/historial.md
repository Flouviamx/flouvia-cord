# Historial y Estado actual — Cord

> Extraído de `CLAUDE.md` para organización. Registro cronológico de features,
> decisiones de arquitectura y bugs resueltos. **La fuente de reglas core sigue
> siendo `/CLAUDE.md`.** Este archivo se auto-carga vía `@import` desde CLAUDE.md.

---

## Estado actual (jun 2026)

✅ **Cédulas Presupuestales — motor de planeación financiera (jul 2026)** — feature nuevo
   pedido por André: la cascada clásica de contabilidad de costos (Presupuesto de Ventas →
   Producción → Compras de Materia Prima → Cobranza), como herramienta propia de Cord en vez
   de la hoja de Excel que usan hoy distribuidoras/manufactureras.
   • **Decisión de diseño explícita para NO caer en mini-ERP:** es una herramienta de
     PLANEACIÓN, no un sistema de inventario en vivo. El "inventario inicial/final deseado" es
     un SUPUESTO que el usuario teclea por periodo (una fila `input` más), NUNCA un saldo
     rastreado por movimientos reales de almacén — no hay kardex, no hay lotes, no hay
     entradas/salidas. Las fórmulas usan un solo primitivo genérico ("combo": suma ponderada de
     referencias a otras filas, coeficiente positivo suma / negativo resta) en vez de un
     lenguaje de fórmulas libre tipo Excel — cubre suma/resta/escala con una sola forma.
   • **3 tablas nuevas** (`db/schema.sql`, RLS `FORCE` con `org_id` denormalizado en las 3,
     mismo patrón que `cotizacion_cobros`/`promesas_pago`, sin carril `public_token` — no hay
     vista pública de una cédula): `cedulas` (documento: tipo/nombre/periodos jsonb),
     `cedula_filas` (renglones: tipo `input`|`formula`, `formula` jsonb flexible sin CHECK — la
     validación de forma vive en la app), `cedula_valores` (las celdas reales, solo para filas
     `input`; las `formula` se calculan on-the-fly, nunca se persisten).
   • **Motor de fórmulas** (`src/lib/cedulas.ts`, función `computeCedula`): resuelve cada fila
     `formula` contra sus referencias — propias o de OTRA cédula (esto da la cascada
     Ventas→Producción→Compras de MP sin necesitar un grafo genérico, solo referencias por
     `fila_id`+`cedula_id` opcional) — con memoización entre cédulas hermanas y corte de ciclos
     en dos niveles (entre cédulas vía `stack`, dentro de la misma cédula vía `evaluating`) para
     que una referencia circular resuelva a 0 en vez de colgar el request.
   • **5 plantillas precableadas** (`CEDULA_TEMPLATES`) que siembran filas al crear: Ventas,
     Producción (`= Ventas + Inv. final deseado − Inv. inicial`, la fórmula clásica ya cableada),
     Compras de MP (mismo patrón sobre consumo de MP), Mano de Obra y CIF, Cobranza — más
     `custom` (cédula vacía). El usuario puede editar/borrar/agregar filas libremente después;
     la plantilla es solo el punto de partida.
   • **UI** (`/app/presupuestos`, sidebar → grupo "Inteligencia", gated por permiso
     `analitica`): índice en lista hairline (sin cards, regla de diseño) con modal de creación
     (tipo + nombre + periodos, con presets de 3/6/12 meses); editor (`/app/presupuestos/[id]`)
     con grid de filas × periodos — filas `input` editables inline, filas `formula` de solo
     lectura resaltadas con **descripción legible de la fórmula** debajo del concepto (ej. "=
     Ventas + Inv. final deseado − Inv. inicial", resuelta por nombre de fila, no por id) y
     **flash verde/rojo** al recalcular tras un cambio (mismo patrón ya usado en el editor de
     cotizaciones); nombre de la cédula editable inline (clic → input, Enter/blur guarda — sin
     `prompt()` nativo); modal "Agregar fila" con constructor de fórmula por términos (cédula +
     fila + coeficiente, con picker que cruza a cualquier otra cédula de la org).
   • **Endpoints** `/api/cedulas` (GET lista + POST crea con plantilla opcional) y
     `/api/cedulas/[id]` (GET calcula y devuelve valores resueltos + catálogo de las demás
     cédulas de la org para el picker de referencias cruzadas; PATCH `add_fila`/`set_valor`
     `delete_fila`/`rename`; DELETE borra cascade). `set_valor` valida server-side que la fila
     sea `tipo='input'` antes de escribir — nunca se puede pisar una fórmula desde el cliente.
   ⚠️ **Fuera de alcance del v1 (a propósito, para no inflar el scope antes de validar con
     uso real):** no se pueden agregar periodos a una cédula ya creada (hay que recrearla);
     no hay "presupuestado vs. real" jalando datos de cotizaciones/ventas reales — quedó como
     posible fase 2 si el v1 se valida útil.
   • **Pasada "pro" (auditoría de diseño):** nombre editable inline (clic → input, sin
     `prompt()` nativo), descripción legible de la fórmula bajo cada fila calculada (ej. "=
     Ventas + Inv. final deseado − Inv. inicial", resuelta por nombre de fila, no por id),
     flash de recálculo en las celdas calculadas al editar un insumo (sin reconstruir el DOM
     ni robar el foco de la celda donde el usuario esté escribiendo — `refreshValues()` vs.
     `renderGrid()`), sombra en la columna fija al hacer scroll horizontal, estado vacío del
     grid. **Bug real encontrado y corregido por el `design-reviewer`:** ambos `<style>`
     (índice y editor) eran scoped normales, pero TODO el grid/lista se inyecta por JS vía
     `innerHTML` — mismo patrón de bug ya documentado del proyecto (`data-astro-cid` no llega
     al DOM inyectado en runtime, los selectores scoped nunca matchean). Corregido a
     `<style is:global>` en ambos archivos y verificado contra el CSS del BUILD real
     (`.pr-row-head{...}` sin sufijo de cid).
   • **2 bugs visuales más reportados por André con captura, corregidos:** (1) los botones
     nuevos (`.pr-name-wrap`, `.pr-del`, `.pr-del-fila`, `.pr-type-opt`, `.pr-term-del`,
     `.pr-add-term`, `.ppreset`) se veían con el recuadro nativo del navegador — se creó
     `.pr-name-wrap` como `<button>` (para la edición inline del nombre) sin resetear el
     `border`/`background` por defecto del elemento; corregido con `all:unset` + reset
     explícito (mismo patrón que `.tb-icon` en `AppLayout.astro`). ⚠️ Regla a futuro: todo
     `<button>` custom en la app necesita reset explícito, no basta con estilizar
     `padding`/`border-radius` encima del default del navegador. (2) el estado vacío del grid
     ("Esta cédula todavía no tiene filas") se veía AL MISMO TIEMPO que una fila real — el
     atributo HTML `hidden` se anula cuando el CSS del autor define `display` explícito sobre
     esa misma clase (`.pr-empty-grid{display:flex}` le gana en origen de cascada al
     `[hidden]{display:none}` del navegador, sin importar especificidad). Corregido agregando
     `.clase[hidden]{display:none}` explícito a cada clase que combina `display` propio con
     toggle por atributo `hidden` (`.pr-empty-grid`, `.pr-name-wrap`, `.pr-list`). ⚠️ Regla a
     futuro: cualquier elemento que se muestre/oculte con `el.setAttribute('hidden', '')` desde
     JS y que ADEMÁS tenga una regla CSS con `display` propio (`flex`/`grid`/etc., no el
     default del navegador) necesita su propio `[hidden]{display:none}` — si no, el `hidden`
     se ve pisado en silencio.
   • Verificado: `npm run db:migrate` corrido contra Neon (3 tablas, RLS+FORCE confirmado
     contra `pg_class`/`pg_policies`), `npm run build` limpio, CSS del build inspeccionado
     directamente para confirmar que los resets/overrides quedaron compilados.

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

✅ **Cobros recurrentes reales para igualas/retainers vía Stripe Subscriptions (jul 2026)** —
   auditoría de "promesas que el código hace pero no cumple": `casos-de-uso/agencias.astro`
   prometía "cargo automático cada mes" para igualas de agencias/consultoras, pero el sistema
   real solo generaba un link de pago manual + recordatorios — una FAQ de la misma página ya
   lo admitía honestamente, contradiciendo al resto del copy. Se construyó el feature real
   sobre **Stripe Subscriptions + Stripe Connect Custom**: el cliente autoriza su tarjeta UNA
   sola vez desde el link público y Stripe cobra el total automáticamente cada mes, **directo
   a la cuenta bancaria del vendedor** (mismo patrón `Stripe-Account: acct_...` que los cobros
   directos, cero comisión de Cord).
   • **Tabla nueva `cotizacion_suscripciones`** (una por cotización, `unique(cotizacion_id)`):
     `stripe_subscription_id/customer_id/price_id/product_id` (todos en la cuenta CONECTADA),
     `monto`, `moneda`, `intervalo`, `estado` (incomplete|active|past_due|canceled),
     `current_period_end`, `cancel_at_period_end`. RLS por `org_id` O `public_token` (mismo
     patrón que `cotizacion_cobros`) + FORCE. Columna nueva `cotizaciones.es_recurrente`
     (solo con `terminos='contado'`, mutuamente excluyente con anticipo — forzado server-side
     en `createCotizacion` y en el PATCH de `update_draft`, no solo en el cliente).
   • **`POST /api/q/[token]/subscription-intent.ts`** (nuevo, espejo de `payment-intent.ts`):
     crea/reutiliza **perezosamente** (no en el momento de aprobación, para no dejar
     suscripciones huérfanas si el cliente nunca autoriza) Product+Price(mensual)+Customer+
     Subscription (`payment_behavior=default_incomplete`, solo `card` — `customer_balance`/SPEI
     no puede auto-cobrar, obligaría a fondear el balance cada mes, así que una iguala
     "automática" no puede correr sobre SPEI) en la cuenta conectada, devuelve el
     `client_secret` de la primera factura. Protegido con **Idempotency-Key determinística**
     (derivada del `cotizacion_id`) contra condiciones de carrera (doble clic/doble pestaña/
     retry de red no crean una segunda Subscription en Stripe).
   • **`POST /api/cotizaciones/[id]/subscription.ts`** (nuevo): el vendedor cancela con
     `cancel_at_period_end: true`, gated por `requirePerm('cobranza')`.
   • **Webhook (`stripe/webhook.ts`) ramificado por `event.account`:** los eventos de
     suscripción/factura de una cuenta CONECTADA (`invoice.paid`/`invoice.payment_failed`/
     `customer.subscription.updated`/`.deleted`) van a handlers nuevos de IGUALA
     (`recurringInvoicePaid`/`recurringInvoiceFailed`/`syncQuoteSubscription`/
     `cancelQuoteSubscription`), completamente separados de los handlers de SUSCRIPCIÓN DE
     PLAN de Cord (`syncSubscription`/`downgradeToFree` — el billing SaaS de la plataforma).
     Son dos sistemas de suscripción distintos compartiendo el mismo endpoint; `findQuoteSub()`
     valida que `stripe_account_id` de la fila coincida con `event.account` (defensa
     multi-tenant). Cada cobro mensual pagado se registra como fila `'cuota'` en
     `cotizacion_cobros` (para que el historial de pagos del vendedor lo muestre) — la
     cotización recurrente **nunca** se marca `paid` (una iguala nunca está "totalmente
     pagada", es continua).
   • **UI:** toggle "Cobro recurrente mensual (iguala)" en el editor (`nueva.astro`, solo con
     términos=contado, oculta/anula anticipo); nota + botón "Autorizar cobro mensual" en el
     link público (`QuoteCard.astro`/`pay.astro`, `PaymentIsland.tsx` en modo `subscription`);
     tarjeta de estado + botón "Cancelar iguala" (`cordConfirm` danger) en el detalle del
     vendedor (`cotizaciones/[id].astro`).
   • **2 bugs reales encontrados y corregidos por una auditoría de correctness antes de dar el
     feature por bueno:** (1) **igualas activas tratadas como deuda vencida** en 4 sitios que
     ya asumían "`status='approved'` desde hace mucho = cartera sin cobrar" y nunca excluían
     `es_recurrente` — `getCobranza()` (aging sin tope), el cron de intereses moratorios
     (cargaba interés mensual sobre una cuenta que se cobraba puntual), el cron de
     recordatorios (avisaba "tu pago vence" a clientes al corriente), y el agente de cobranza
     con IA (le reclamaba a un cliente una deuda que no existía, porque `saldo = total −
     cotizacion_cobros pagados` siempre daba el total completo). Los 4 ahora excluyen
     `es_recurrente is not true`. Además el ingreso real de las igualas era invisible en
     `getCobros()` (dashboard "Mi dinero", filtraba por `status='paid'`, que una iguala nunca
     alcanza) — se agregó una unión aparte que suma los cobros `'cuota'` de cotizaciones
     recurrentes, sin doble conteo (los dos universos son disjuntos). Se auditó también
     `getCFO()`/`getAnalytics()` por el mismo patrón — **no aplica**: `getCFO()` solo cuenta
     como "pipeline abierto" `status in ('sent','viewed')` (nunca `approved`), y
     `getAnalytics()`/`getDashboard()` tratan `approved` como "cerrado/ganado" (semántica
     correcta para una iguala aprobada, no es lo mismo que "dinero pendiente de cobrar"). (2)
     **condición de carrera** en `subscription-intent.ts` que podía crear DOS Subscriptions
     activas en Stripe (huérfana + no cancelable desde Cord) si dos requests llegaban
     concurrentes — corregido con Idempotency-Key determinística.
   • **Copy de `agencias.astro` corregido** (FAQ, tarjeta "Retainers Mensuales Automáticos",
     "Seguimiento en tiempo real") para describir el flujo real: autorización única de tarjeta
     → cobro automático mensual directo a la cuenta del vendedor, requiere cobros con tarjeta
     conectados. No existe `/en/casos-de-uso` (solo ES), así que no hubo versión EN que tocar.
   ⚠️ **Pendiente de configuración manual en Stripe (no es código):** el webhook de "eventos en
     cuentas conectadas" (el mismo segundo endpoint que ya deben tener los cobros directos, con
     `STRIPE_CONNECT_WEBHOOK_SECRET`) necesita suscribirse ADEMÁS a `invoice.paid`,
     `invoice.payment_failed`, `customer.subscription.updated` y `customer.subscription.deleted`
     — sin esos eventos las igualas se autorizan y cobran bien en Stripe, pero Cord no
     reflejaría los cobros mensuales ni el estado de la suscripción. No se requiere un tercer
     endpoint ni env vars nuevas.
   ⚠️ **Limitación conocida (no es bug de dinero):** si el vendedor marca una cotización como
     recurrente sin tener los cobros con tarjeta conectados, el cliente ve la nota de la iguala
     pero no aparece el botón de autorizar (`subscription-intent` responde 403). Sin pérdida de
     dinero, solo un callejón suave — falta un aviso proactivo en el editor.
   • Verificado: `npm run db:migrate` corrido contra Neon (tabla + columna aditivas), 2 pasadas
     de `npm run build` limpias (antes y después de las correcciones de la auditoría).

✅ **Fix de copy fiscal falso — `/desarrolladores/fiscal` ya no promete IRS/EIN/Sales Tax
   (jul 2026)** — misma auditoría de "promesas rotas" de la entrada anterior. La página
   afirmaba "100% cumplimiento normativo SAT **e IRS**", exponía un endpoint ficticio
   `cord.tax.calculate()`, y prometía validación de EIN, cálculo dinámico de Sales Tax vs IVA,
   soporte de pedimentos y múltiples entidades legales bajo una misma cuenta — **nada de eso
   existe**: `USInvoiceProvider` sigue siendo un stub, y el patrón `FiscalFactory` solo tiene un
   proveedor real en producción (`MexicoSatProvider` vía Facturapi). Reescrita en ES y EN
   (`src/lib/desarrolladores.ts`/`.en.ts`) para vender honestamente lo que sí es real (CFDI 4.0
   real ante el SAT, arquitectura de adaptador-por-país lista para crecer) y dejar EE.UU.
   explícitamente en el roadmap — las FAQs ya no dicen "contacta a ventas para confirmar el
   alcance" (insinúa que tal vez ya funciona) sino "todavía no" + invitación a priorizarlo.
   Verificado contra el HTML del build: 0 ocurrencias de "IRS", `cord.tax.calculate`, o "EIN" en
   `.vercel/output/static/desarrolladores/fiscal` y su espejo `/en/desarrolladores/fiscal`.

✅ **Pasada de "hacerlo super top" — SEO/GEO tras la migración a dominio propio (jul 2026)** —
   André pidió aprovechar que Cord ya no vive bajo un subdominio de flouvia.com para
   reforzar SEO/AI-SEO de punta a punta.
   • **Bug crítico encontrado — `cord.flouvia.com` tirando 404:** al haber movido el
     dominio primario del proyecto de Vercel a `cordhq.app`, el subdominio viejo quedó
     con un alias de DNS huérfano (`x-vercel-error: DEPLOYMENT_NOT_FOUND`) — cualquier
     backlink, bookmark o link viejo compartido perdía toda la señal de autoridad y le
     pegaba a un 404. Fix: redirect 301 agregado en `vercel.json`
     (`{source: '/:path*', has: [{type:'host', value:'cord.flouvia.com'}], destination:
     'https://cordhq.app/:path*', permanent: true}`) — preserva el path completo.
     ⚠️ **Solo funciona si `cord.flouvia.com` está re-agregado como dominio del proyecto
     de Cord en Vercel** (Project Settings → Domains) — el código ya está listo, falta
     ese paso manual (ver checklist abajo).
   • **`robots.txt` — directivas explícitas para crawlers de IA:** antes solo existía el
     bloque `User-agent: *`, que los bots de IA heredaban implícitamente. Se agregó un
     segundo bloque explícito (mismo Allow/Disallow) nombrando 14 user-agents reales:
     `GPTBot`/`OAI-SearchBot`/`ChatGPT-User` (OpenAI), `ClaudeBot`/`Claude-Web`/
     `anthropic-ai` (Anthropic), `PerplexityBot`/`Perplexity-User`, `Google-Extended`/
     `GoogleOther`, `CCBot` (Common Crawl), `meta-externalagent`, `Amazonbot`,
     `Applebot-Extended` — mismo comportamiento efectivo, pero explícito y a prueba de
     futuro (si algún día se quiere bloquear uno solo, es una línea, no reestructurar).
   • **`llms.txt` reescrito — tenía un hueco real:** el archivo anterior se titulaba
     "Flouvia Cord" y era 100% documentación de API (duplicando `openapi.yaml`) — **nunca
     mencionaba que Cord es independiente de Flouvia**, justo la señal que motivó la
     auditoría SEO original (ver [[cord-seo-ai-seo-audit-pattern]]). Reescrito siguiendo
     el spec real de llms.txt (título + resumen en blockquote + links, no la API inline):
     el resumen ahora dice explícitamente "not exclusive to Shopify or to clients of its
     parent company, Flouvia", con secciones de Documentación/Producto/Soporte enlazando
     a las páginas reales. **Verificado con el agente `copy-accuracy-auditor` — cero
     hallazgos**, cada capability listada (pagos con tarjeta/SPEI, cobranza IA opt-in,
     anticipo/saldo/cuotas, roles y audit log, multi-divisa con FX lock, MCP, Cord
     Elements) se contrastó contra el código real y es 100% precisa.
   • **JSON-LD evaluado, sin cambios:** se consideró agregar un `Organization` propio
     para Cord (separado del de Flouvia) ahora que tiene dominio propio, pero el patrón
     actual (`SoftwareApplication` con `creator`/`provider` apuntando a la `Organization`
     de Flouvia) ya es el modelado correcto de schema.org — Cord no es una entidad legal
     separada, es un producto/marca de Flouvia, así que un segundo `Organization` sería
     una señal de identidad conflictiva, no una mejora. Se dejó intacto.
   • **`og:image` roto (encontrado, NO arreglado esta pasada):** `Layout.astro` referencia
     `/og-cord.png` como imagen por default de Open Graph/Twitter Card en TODAS las
     páginas, pero ese archivo **no existe** en `public/` — cualquier link de Cord
     compartido en WhatsApp/LinkedIn/Slack/X sale sin vista previa. André prefirió hacer
     el diseño él mismo en vez de que se generara — queda pendiente, él lo sube cuando
     esté listo.
   • **Investigación GEO 2026 — infraestructura falló, sin hallazgos verificados:** se
     lanzó un `deep-research` sobre prácticas 2026 de GEO/AI-SEO específicas a migración
     de dominio, pero pegó con un rate-limit de sesión a media corrida (92 de 105 agentes
     fallaron con "session limit") — el resultado no tiene ningún claim verificado, solo
     extracciones sin confirmar. Se descartó como fuente; el resto de esta pasada se hizo
     con conocimiento ya establecido del proyecto, no con ese research.
   ✅ **Punto 1 del checklist COMPLETADO y verificado:** André re-agregó `cord.flouvia.com`
     al proyecto de Vercel; el push a `main` se había quedado atorado en silencio (el
     commit local incluía `.github/workflows/elements.yml`, reaparecido de la nada, y
     GitHub lo rechazaba por falta del scope `workflow` en el PAT — mismo bug ya resuelto
     una vez antes en este repo, mismo fix: `git rm --cached` + `.gitignore`). Tras el
     push, deployment `dpl_6XLSt2...` a `READY` y verificado con `curl -I`:
     `cord.flouvia.com/producto/editor` → `308` con `location:
     https://cordhq.app/producto/editor`. El redirect está LIVE.
   ✅ **Checklist de autoridad de dominio — COMPLETADO (jul 2026):**
     1. ~~Vercel: re-agregar `cord.flouvia.com`~~ hecho y verificado (redirect 301 en
        vivo, confirmado con `curl`).
     2. ~~Google Search Console~~ hecho: `cordhq.app` alta como property de Dominio,
        verificado por DNS TXT (⚠️ primer intento falló — el registro se creó en
        `gsc.cordhq.app` en vez de la raíz por poner "gsc" como Name en vez de "@";
        corregido), `sitemap.xml` enviado correctamente (⚠️ primer intento también
        falló — se mandaron páginas HTML sueltas una por una como si fueran sitemaps
        en vez de la URL completa `https://cordhq.app/sitemap.xml`; corregido), e
        indexación manual solicitada para home + `/precios` + `/producto/editor` +
        `/soluciones/empresas` vía "Inspección de URLs".
     3. ~~Bing Webmaster Tools~~ hecho — importado directo desde la cuenta de Google
        Search Console (sin reverificar DNS).
     4. ~~Backlink real desde flouvia.com~~ hecho: se encontraron y corrigieron ~30
        referencias a `cord.flouvia.com` en el repo hermano `~/Desktop/flouvia`
        (imágenes de logo, los 10 CTAs de `CordPricing.astro`, `canonicalOverride` y
        JSON-LD de `src/pages/cord.astro`/`en/cord.astro`) — todas apuntaban al
        dominio viejo, que aunque ya redirige (301), le restaba fuerza a la señal de
        backlink directo. Commit `5b1729f` en el repo `flouvia` (solo esos 8 archivos;
        se dejaron intactos 2 cambios sueltos preexistentes de André en ese repo —
        `PlantillaContacto 2.astro`/`WhatsApp.astro` — sin comitear por error).
     5. **og:image** — sigue pendiente, André lo diseña él mismo (ver nota arriba, no
        se generó nada por IA a petición explícita suya).
   • **Documentado en memoria** ([[cord-domain-migration-cordhq]] actualizada) — checklist
     completo salvo el `og:image`.

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

✅ **Landing de Cord en flouvia.com — acordeón de FAQ + tarjetas con shader físico +
   push a main (jul 2026, repo hermano `~/Desktop/flouvia` — NO este repo)** — segunda
   pasada sobre el rewrite descrito en la entrada inmediata siguiente, ya en `main` de
   flouvia (`git push origin main`, commit `5f6782c`).
   • **FAQ convertido a acordeón estilo Cord:** el "Despejando dudas" de `cord.astro`/
     `en/cord.astro` (antes una grilla estática de 2 columnas) se reemplazó por
     `flouvia/src/components/cord/CordFaqAccordion.astro` — puerto 1:1 de
     `src/components/landing/FaqAccordion.astro` de ESTE repo (mismo ícono +/− que
     rota, `grid-template-rows` para la altura suave, uno-a-la-vez). El array `FAQS`
     en el frontmatter de cada página es ahora la ÚNICA fuente: alimenta el acordeón
     visible Y el `FAQPage` del JSON-LD (antes estaban duplicados a mano y podían
     divergir) — mismo patrón que exige `docs/sistema-de-diseno.md` de este repo para
     `FaqAccordion.astro`.
   • **Shader del Centro de Ayuda llevado a las tarjetas de "capacidades adicionales":**
     nuevo `flouvia/src/components/cord/CapAuroraBg.jsx`, el MISMO motor de
     `src/components/support/BlueAuroraBg.jsx` de este repo (teal/cobalt/cyan, grano de
     película), adaptado con el patrón de mouse LOCAL de `CardAuroraBg.jsx` (soluciones)
     para vivir dentro de una tarjeta clara y solo activarse en hover/foco — a diferencia
     de `CardAuroraBg`, que pinta SIEMPRE (tarjetas permanentemente oscuras), aquí el
     canvas usa `frameloop: active ? 'always' : 'never'` + fade de opacidad, así que las
     6 tarjetas no gastan GPU en reposo. Nuevo `CapCard.jsx` envuelve cada tarjeta,
     maneja el estado de hover/foco y aplica la clase `.is-active` (texto/ícono/link a
     blanco, definida en el `<style is:global>` de la página, no en el componente).
   • **Físicas reales en el shader, no solo un lerp:** el cursor dentro de la tarjeta se
     anima con un resorte masa-amortiguador (`F = -kx - cv`, constantes ajustadas para
     underdamped — el aurora rebasa el punto de destino y regresa) en vez del lerp plano
     que usan `BlueAuroraBg`/`CardAuroraBg` originales. La velocidad del resorte alimenta
     un uniform nuevo `u_force` que infla el empuje (`mPush`) y dispara un chispazo cyan
     adicional cuando el cursor se mueve rápido — es lo que da la sensación de "físicas"
     pedida explícitamente. ⚠️ **Este patrón (spring físico + frameloop condicionado por
     hover) no existe todavía en ESTE repo** — si se quiere el mismo efecto en una
     tarjeta de Cord (no de flouvia.com), portar `CapAuroraBg.jsx` de vuelta en vez de
     partir de `CardAuroraBg.jsx`, que solo tiene el lerp simple.
   • Botón CTA del hero cambiado de "Crear cotización gratis"/"Create a quote for free"
     a **"Empieza gratis"/"Start for free"**, uniforme con el resto de CTAs de Cord.

✅ **Landing de Cord en flouvia.com reescrita para reflejar el alcance real del producto
   (jul 2026, repo hermano `~/Desktop/flouvia` — NO este repo)** — `flouvia.com/cord` (y su
   espejo `/en/cord`) llevaba desde el lanzamiento hablando solo de "cotizar + aprobar + CFDI",
   sin mencionar nada construido después: cobranza autónoma con IA, pagos directos a la cuenta
   del negocio (Stripe Connect, cero comisión de Cord), multi-divisa con cobertura cambiaria,
   API/webhooks/MCP, Cord Elements o roles de equipo. Se reescribió `src/pages/cord.astro` +
   `src/pages/en/cord.astro` en el repo de flouvia, conservando 100% la estética de Flouvia
   (hero-grand con shader `fluid-target`, filas editoriales `service-row`, tarjetas navy) —
   NO la estética "Apple gray" propia de este repo. Cambios: hero reposicionado de "cotizaciones
   que se aprueban solas" a "cotiza, cobra y factura sin salir de un mismo link"; filas de "cómo
   funciona" ampliadas de 3 a 6 (+ cobranza con IA, pagos directos, multi-divisa); grid nuevo de
   6 capacidades avanzadas (CFO/analítica, roles de equipo, aprobaciones por margen, API+MCP,
   Cord Elements, firma SHA-256); FAQ y schema JSON-LD ampliados de 4 a 8 preguntas en paralelo
   exacto con el FAQ visible. **3 bugs de exactitud corregidos:** los 3 links de "cómo funciona"
   apuntaban a `/caracteristicas/*` (namespace que nunca existió en este dominio — 404 silencioso
   desde flouvia.com); el trust strip afirmaba "usado por docenas de empresas" (no verificable,
   se cambió a un claim de seguridad respaldable); el copy prometía el plan Free "gratis para
   siempre" con cotizaciones ilimitadas, pero el plan real tiene tope de 5 cotizaciones activas
   (ver `billing.ts` / `negocio-billing.md` de este repo) — se ajustó a "gratis para empezar".
   `CordPricing.astro` (componente compartido en flouvia) ya reflejaba la matriz real de 5 planes
   y no se tocó. ⚠️ **Regla a futuro:** cualquier link nuevo que se agregue en
   `flouvia/src/pages/cord.astro` hacia `cordhq.app` debe verificarse contra los slugs
   reales de `src/lib/producto.ts` / `desarrolladores.ts` de ESTE repo antes de escribirse —
   inventar una ruta ahí reproduce el mismo bug de 404 silencioso que se acaba de corregir.

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

✅ **Auditoría de conexiones custom + go-live listo (jul 2026)** — André pidió verificar que TODO
   lo custom (Stripe Billing mensual/anual/excedentes, Stripe Connect Custom, Clerk custom) conecte
   sin errores y un mapa de qué faltaba para operar con usuarios reales. Resultado de la auditoría
   (read-only sobre billing.ts, subscribe/portal, webhook de Stripe, connect/*, payment-intent,
   cobros, middleware, clerk/webhook, resolución de org + build limpio):
   • **Todo verificado OK:** suscripciones (Payment Element custom + Checkout fallback → webhook
     `syncSubscription` otorga plan solo en `active`), excedentes por uso cableados en las 4
     dimensiones (ia/timbrado/api/usuario, con `checkQuota` + `reportUsage` + techo anti-runaway
     10×), Connect Custom (PI por cobro, CLABE SPEI estable, conciliación por `cobro_id`, flip
     atómico idempotente, defensa multi-tenant por `event.account`), Clerk (middleware, webhook de
     sync sin degradar owner, `getActiveOrgId` con carriles API-key/Clerk-org/membresía/sandbox).
   • **1 bug real corregido — `current_period_end`:** `subscribe.ts` fija la API `2025-06-30.basil`,
     versión en la que Stripe MOVIÓ `current_period_end`/`current_period_start` del objeto
     Subscription raíz a cada ITEM. El webhook `syncSubscription` lo leía del nivel raíz → llegaba
     `undefined` → la fecha de renovación del plan se guardaba `null` (el plan sí se otorgaba bien;
     solo la fecha en Ajustes › Plan salía en blanco). Fix: `sub.current_period_end ??
     sub.items.data[0].current_period_end`. ⚠️ Regla a futuro: al pinnear una versión nueva de la
     API de Stripe en las llamadas salientes, considerar que los eventos del webhook pueden llegar
     con OTRA versión (la default del endpoint en el dashboard) — leer campos que se movieron entre
     versiones de forma defensiva.
   • **Config de go-live COMPLETADA por André** (era todo config manual, no código): 2º webhook de
     Stripe "eventos en cuentas conectadas" + `STRIPE_CONNECT_WEBHOOK_SECRET` (sin él el dinero de
     Connect caía al vendedor pero Cord no marcaba el cobro pagado — era EL gap crítico), llaves
     live de Stripe/Clerk en Vercel, Customer Portal, Resend/CRON_SECRET/Facturapi/Anthropic, y el
     **`DATABASE_URL` de Vercel apuntando al endpoint POOLED de Neon** (`-pooler` en el host —
     necesario para no agotar conexiones con usuarios concurrentes). Pendiente de producto (no
     bloquea MX): `USInvoiceProvider` sigue stub (facturación US no real); activación LIVE de la
     plataforma Connect Custom depende de aprobación de Stripe.

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

✅ **Rediseño Premium de ProductAccordion (jul 2026)** — André pidió refinar la plantilla de producto para hacerla sentir "Apple super premium" y menos vacía. 
   • **Iconografía "Glass Duotone":** Se reescribieron los 14 iconos SVG (`ICONS` en `ProductAccordion.jsx`) cumpliendo la Regla 9 (figuras intrincadas, `strokeWidth=1.75`, capas superpuestas de `fillOpacity`).
   • **Etiquetas verticales enriquecidas:** Las tarjetas inactivas ahora muestran `{label} · {title}` verticalmente, eliminando el espacio vacío que dejaba solo el número.
   • **Coreografía fluida (GSAP):** Animación de apertura cambiada de `hover` a `clic`. Se reemplazó el easing por `power4.out` con delays escalonados para emular la elasticidad y fluidez de iOS.
   • **Equilibrio de proporciones:** Se mantuvo el `max-width: 1260px` global pero se rebalancearon los flex-grow (`ACTIVE_GROW=5.0`, `RESTING=[1.5, 2.2, 1.8, 2.5]`). La tarjeta activa concentra mejor la tipografía (`max-width: 600px`), eliminando el exceso de espacio en blanco lateral sin romper la cuadrícula.


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

✅ **Cobros por términos de crédito + Anticipo/Saldo + Cobranza IA con link de pago (jul 2026)** —
   feature de 3 piezas pedido por André ("pagar solo tiene sentido al contado… que la cotización
   pueda cobrar el anticipo y luego el otro %… y al vencer el crédito el agente de cobranza mande
   el link de pago"). Diseño validado por el agente billing-fiscal-specialist antes de codificar.
   • **Gating por términos:** una cotización Net 30/60 aprobada YA NO muestra el botón de pago —
     el cliente ve "Pedido confirmado con crédito Net 30 — vence el [fecha]" y el pago se habilita
     al llegar la fecha (cálculo canónico `coalesce(approved_at, created_at) + días del término`,
     el mismo de getCobranza/intereses/recordatorios). Gateado en 4 capas: `q/[token].astro`,
     `embed/[token].astro`, `pay.astro` (redirect) y `payment-intent.ts` (409 server-side).
     `getCotizacionByToken` expone `pagoDisponible`/`saldoVence`/`cobros`/`anticipoPct`.
   • **Tabla nueva `cotizacion_cobros`** (anticipo | saldo | cuota | total): cada cotización se
     cobra en "rebanadas", cada una con su PROPIO PaymentIntent (SPEI conserva su CLABE estable
     por cobro; un customer POR COBRO a propósito — la CLABE se asigna por customer). RLS con
     acceso por `org_id` O `public_token` (como `cotizacion_items`) + FORCE. `numero_cuota NOT
     NULL DEFAULT 0` para que el unique `(cotizacion_id, tipo, numero_cuota)` aplique de verdad
     (NULLs serían distintos entre sí). Columnas nuevas: `cotizaciones.anticipo_pct`,
     `orgs.anticipo_default_pct`. La columna legacy `cotizaciones.stripe_payment_intent_id` queda
     de solo-lectura (el webhook resuelve por `metadata.cobro_id`, NUNCA por esa columna).
   • **Anticipo:** campo "% de anticipo" en el editor (preview en vivo "tu cliente paga $X al
     aprobar y $Y según términos") + default en Ajustes › Cotizaciones (`anticipo_default_pct`,
     agregado a PATCH /api/org por la regla de guardado). Al aprobar (ambas rutas: cliente en /q
     y vendedor en PATCH) se materializan anticipo (pagable ya) + saldo (vence según términos) en
     UNA transacción (dos inserts sueltos podían dejar solo el anticipo → flip prematuro a paid).
     Montos por RESTA de centavos (`splitAnticipo`/`splitCuotas` en `src/lib/cobros.ts`) — jamás
     redondear ambos lados. `payment-intent.ts` reescrito cobro-based: fila 'total' perezosa para
     el pago simple, PI reutilizable POR COBRO, gate por `vence`, regeneración si el total cambió
     sin pagos (cancelando ANTES los PIs en Stripe; si uno no se puede cancelar se ABORTA — mejor
     desglose viejo que pago huérfano).
   • **Webhook (`markQuotePaid`) por-cobro:** marca el cobro pagado (acepta también 'cancelado' —
     un SPEI en vuelo puede liquidarse tras un pago manual o un plan que lo reemplazó; el dinero
     llegó y SE REGISTRA, incluso si la cotización ya está 'paid'), cancela pendientes si lo
     pagado cubre el total, y hace el flip a 'paid' con un UPDATE atómico idempotente (`NOT
     EXISTS pendiente`) — el pago PARCIAL ya NO dispara `quote.paid` a las integraciones (sería
     mentirles); dispara evento informativo. Cobro inexistente → evento de conciliación + audit,
     sin flip. El pago manual del vendedor y el plan de cuotas cancelan sus PIs en Stripe
     (best-effort) para que una pestaña de checkout abierta no sobre-cobre.
   • **Cobranza IA v2:** el cron usaba `c.vigencia` (validez de la cotización, NO la fecha de
     pago) → corregido al cálculo canónico; status ampliado a `approved+invoiced` con 3 días de
     gracia; saldo REAL = total − cobros pagados; TODO correo lleva el link de pago determinista
     (botón "Pagar $X en línea" con el monto del cobro exigible, no del saldo total; sin cobro
     online activo el botón dice "Ver cotización y opciones de pago" → /q). Escalación a los 15+
     días: `propose_payment_plan` con validación SERVER-SIDE (cuotas 2-3, suma ≈ saldo ±1%, sin
     plan duplicado) materializa cuotas REALES pagables (cancela el saldo pendiente y sus PIs);
     `ar-agent.ts` ahora es un loop de 2 turnos (tool_result real de vuelta al modelo — adiós al
     "[Sistema:…]" sintético). Cliente al corriente de su plan NO recibe cobranza. Guards
     intactos: `ai_cobranza_activa` + `sandbox_of IS NULL` + `demo-user` + CRON_SECRET; sigue
     SIN agendar en vercel.json (disparo manual, decisión de André).
   • **3 bugs reportados por André en su prueba real, corregidos y verificados:** (1) ⚠️ REGLA
     NUEVA — el driver de Neon devuelve columnas `date` como OBJETO Date; `String(v).slice(0,10)`
     da "Sun Jul 12" que comparado lexicográficamente contra un ISO siempre es mayor → TODO pago
     quedaba "no disponible" (409) y /pay caía en redirect-loop ("solo recargaba la página").
     Helper `venceDia()` en `cobros.ts` (getFullYear/getMonth/getDate — NO toISOString, que puede
     correrse un día según TZ) usado en payment-intent/pay/queries. SIEMPRE usar `venceDia` para
     comparar fechas `date` leídas de la BD. (2) El sello de firma salía SIN formato al aprobar
     en vivo hasta recargar: el JS inyectaba innerHTML sin `data-astro-cid` → los estilos scoped
     no aplicaban (regla conocida). El JS ahora inyecta el MISMO markup `.ql-audit-stamp` del
     server (con escape XSS) y sus estilos viven en `<style is:global>` prefijados `.q-card`.
     (3) Con anticipo, el link mostraba el TOTAL como "a pagar" hasta recargar (los cobros se
     materializan al aprobar, DESPUÉS del render): QuoteCard ahora SINTETIZA el preview
     anticipo+saldo desde `anticipo_pct` (mismo `splitAnticipo`, mismo `q.total` de BD) → desde
     el primer render se ve la píldora bajo el total ("Hoy pagas $X de anticipo (N%) · Saldo: $Y
     — vence el [fecha]"), el desglose "Plan de pago" y el botón con el monto del anticipo,
     también inmediatamente tras la aprobación EN VIVO sin recargar.
   • Verificado: migración corrida en Neon, `npm run build` limpio, lógica de gating replicada
     contra las filas reales de la BD (Date objects), Playwright contra dev server (sello
     inyectado recibe estilos; /pay renderiza "Anticipo a pagar $506.50 · del total de $1,013.00";
     net30 redirige a /q; captura visual del link completo). Auditoría de correctness
     (code-correctness-reviewer) encontró 4 bugs de dinero pre-release (pagos huérfanos,
     materialización no atómica, botón muerto con cuotas futuras, monto equivocado en el correo)
     — todos corregidos antes de entregar.
   ⚠️ Sigue pendiente (config manual, ya documentado): el 2º endpoint de webhook de Stripe
     ("eventos en cuentas conectadas") con `STRIPE_CONNECT_WEBHOOK_SECRET` — sin él el dinero
     cae al vendedor pero Cord no marca los cobros pagados.

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

✅ **Auditoría de Stripe Connect Custom + checkout in-house + Clerk `/sso-callback` faltante (jul 2026)** —
   André pidió que "todo lo relacionado con Stripe Connect esté bien" (formulario de cobros, el
   checkout del link público) y reportó que alguien SIN cuenta que le da a "Entrar" en vez de
   "Crear cuenta" veía un error en lugar de que lo mandara a registrarse. Auditoría completa +
   rediseño "Apple" del formulario de cobros y del checkout, y fix del bug de Clerk.
   • **Bug de dinero — SPEI se generaba con una CLABE distinta en cada recarga:**
     `payment-intent.ts` creaba un `PaymentIntent` + `customer` NUEVOS en cada visita a
     `/q/[token]/pay`. Columna nueva `cotizaciones.stripe_payment_intent_id`: el endpoint ahora
     reutiliza el PI existente (y actualiza el monto si la cotización se re-versionó) en vez de
     duplicar — corrige tanto la CLABE inestable como el riesgo de PaymentIntents huérfanos.
   • **Bug de dinero — tarjeta se forzaba a SPEI:** el endpoint mandaba
     `payment_method_data[type]=customer_balance` en la creación del PI, lo que forzaba TODO pago
     (incluso con tarjeta activa) al flujo de transferencia. Quitado: el método lo decide el
     Payment Element al confirmar (`payment_method_types` sigue reflejando lo que el vendedor
     activó en Ajustes).
   • **Bug crítico — el webhook de pago tronaba después de marcar `paid`:** `webhook.ts` llamaba a
     `after(dispatchQuoteEvent(...))`, una función que **no existe** en el archivo — el handler
     lanzaba `ReferenceError` justo después del `UPDATE`, así que el pago sí quedaba marcado en BD
     pero el webhook saliente `quote.paid` (integraciones de terceros, Slack) nunca se disparaba.
     Corregido a fire-and-forget sin `after`.
   • **Bug de datos — el método de pago (tarjeta vs SPEI) se perdía en producción:** el webhook
     leía `sessionOrIntent.charges.data[0].payment_method_details.type`, campo que las versiones
     nuevas de la API de Stripe ya NO incluyen embebido en el PaymentIntent (solo `latest_charge`
     como id). Se agregó un fetch del charge en la cuenta conectada para resolver el método real.
   • **Bug — subir el reverso de la INE pisaba el frente:** `document.ts` escribía SIEMPRE en
     `[verification][document][front]` sin importar el `side` recibido. Corregido a usar el side
     real (aplica al doc a nivel cuenta de persona física; el de personas ya estaba bien).
   • **Hardening de `create.ts`/`status.ts`:** una cuenta guardada solo se desconecta cuando
     Stripe CONFIRMA que ya no existe (antes cualquier error transitorio de red la borraba);
     `status.ts` ya no responde 400 cuando aún no hay cuenta creada (el wizard arrancaba con un
     error en consola en vez de simplemente mostrar el paso 0).
   • **`ConnectCustomOnboarding.tsx` reescrito** — reanudación real (retoma en el primer requisito
     `currently_due` que reporta Stripe en vez de forzar los 8 pasos desde cero cada vez que se
     recarga la página), actualiza el representante existente en vez de duplicarlo si ya se había
     creado antes, valida la CLABE con el dígito de control real (pesos 3-7-1, no solo longitud),
     valida la fecha de nacimiento (mayor de 18), exige que se marque el checkbox de dueños
     beneficiarios antes de continuar, y hace polling cada 6s mientras la cuenta está "en
     revisión" (se recarga sola al activarse `charges_enabled`, sin que el usuario tenga que
     refrescar a mano). Rediseño visual: barra de progreso hairline animada, "Paso X de 8" con
     título dinámico, transiciones de entrada por paso, spinners en botones, preview de documento
     con palomita verde, panel de dueños/TOS recesado, estado activo con banco + terminación de
     CLABE + botón "Cambiar".
   • **Checkout in-house (`/q/[token]/pay` + `PaymentIsland.tsx`) rediseñado estilo Apple:**
     lienzo `#f5f5f7`, tarjeta blanca flotante `border-radius:28px` con sombras compuestas
     multicapa (mismo lenguaje visual que el resto del sitio), marca del vendedor (logo real o
     avatar con su color), total en `.editorial`, estados server-side correctos (cotización ya
     pagada → confirmación con palomita en vez de intentar cobrar de nuevo; no pagable → redirect
     al link público en vez de un formulario roto). `PaymentIsland` usa la Appearance API de Stripe
     (inputs gris `#f5f5f7` sin borde, anillo navy al foco, tabs tipo segmented control, locale
     `es-419`) y `redirect: 'if_required'` (tarjeta confirma sin salir de la página; SPEI redirige
     a las instrucciones con la CLABE y regresa a `/q/[token]?pagado=1`, donde el link público
     muestra un aviso verde de "pago en camino" mientras el webhook confirma).
   • **Bug de Clerk — `/sso-callback` no existía:** los botones "Google" de `CustomSignIn.tsx`/
     `CustomSignUp.tsx` (`authenticateWithRedirect({ redirectUrl: '/sso-callback' })`) apuntaban a
     una ruta que nunca se creó → 404 tras volver de Google. Página nueva
     `src/pages/sso-callback.astro` + `SsoCallback.tsx` (`clerk.handleRedirectCallback({
     transferable: true, ... })`) — con `transferable: true`, si alguien SIN cuenta entra por
     "Iniciar sesión con Google" Clerk convierte el intento en un registro automáticamente (y
     viceversa) en vez de fallar.
   • **Fix del bug reportado — login con correo inexistente ya no da error genérico:**
     `CustomSignIn.tsx` detecta el código `form_identifier_not_found` de Clerk y redirige a
     `/sign-up?email=...&desde=login` con el correo precargado y un aviso ("No encontramos una
     cuenta con ese correo. Créala aquí"); en sentido inverso, `CustomSignUp.tsx` detecta
     `form_identifier_exists` y redirige a `/sign-in?email=...&desde=registro`. Se agregó un
     diccionario `ERROR_ES` en ambos componentes para traducir los códigos de error más comunes de
     Clerk (contraseña incorrecta, contraseña filtrada, demasiados intentos, etc.) — antes se
     mostraba el `message` crudo de Clerk (en inglés, poco accionable).
   ⚠️ Correr `npm run db:migrate` (columna `cotizaciones.stripe_payment_intent_id`) — **ya corrida
     contra la BD local en esta sesión.**
   ⚠️ **Pendiente de configuración manual (no es código, ya documentado antes):** el SEGUNDO
     endpoint de webhook de Stripe para "eventos en cuentas conectadas" con
     `STRIPE_CONNECT_WEBHOOK_SECRET` — sin esto el dinero cae al vendedor pero Cord no marca la
     cotización pagada.

✅ **Org switcher con sub-cuentas anidadas (estilo Stripe) + refresh real al cambiar + "Tu cuenta" rediseñada con 2FA/Passkeys/cuentas conectadas (jul 2026)** —
   André pidió que el org switcher soportara una jerarquía "org principal + cuentas dentro" (como
   Stripe), que cambiar de cuenta recargara la data real (antes se quedaba con la data de la org
   anterior), y que `/app/ajustes/cuenta` se sintiera "super pro".
   • **Jerarquía de sub-cuentas:** columna nueva `orgs.parent_org_id uuid references orgs(id) on
     delete set null` (`db/schema.sql`, `alter table … if not exists`). La fuente de verdad para
     AGRUPAR en el switcher es `organization.publicMetadata.parentOrgId` de Clerk (disponible
     client-side sin roundtrip a Neon); el webhook de Clerk (`organization.created`/`updated`) lo
     lee y sincroniza `orgs.parent_org_id` resolviendo el `org_xxx` del padre → uuid interno.
     Endpoint nuevo `POST /api/orgs/subaccount` (`clerkClient(context).organizations
     .updateOrganization({ organizationId, publicMetadata })`, mismo patrón BAPI que
     `equipo.ts`) liga hijo→padre, validando primero que el usuario sea miembro **activo** del
     padre en `org_members` (403 si no). Cada cuenta hija sigue siendo una org de Cord normal —
     **datos 100% aislados** (multi-tenant por `org_id`, sin excepción); la jerarquía es solo de
     agrupación visual/organizativa en el switcher, no comparte config ni datos.
   • **`CustomOrgSwitcher.tsx` — árbol principal→hijos:** las membresías se agrupan por
     `publicMetadata.parentOrgId`; las orgs raíz (sin padre) se listan con sus hijas anidadas
     debajo (indent + hairline). **Fallback anti-desaparición:** si una sub-cuenta apunta a un
     padre del que el usuario ya no es miembro, se promueve a la lista raíz en vez de quedar
     oculta.
   • **`CreateWorkspaceModal.tsx` (nuevo) — flujo de creación tipo Stripe:** reemplaza el
     `prompt()` nativo original por un modal de 2 pasos (portal a `document.body`): paso 1 elige
     entre "Crea una cuenta en tu organización" (nested, bajo la org activa) o "Crea una cuenta
     separada" (independiente), con mini-diagramas ilustrando la jerarquía; paso 2 pide el
     nombre. Al confirmar: `clerk.createOrganization()` → si es `nested`, POST a
     `/api/orgs/subaccount` para ligar al padre (si falla el ligado, la org igual queda creada y
     usable — se avisa con `cordToast` que quedó como espacio independiente) → `handleSwitch()`.
   • **Refresh real al cambiar de org/cuenta:** `handleSwitch` hacía `clerk.setActive(...)` y solo
     cerraba el dropdown — como toda la data de `/app` se resuelve server-side con
     `getActiveOrgId()` (lee `auth().orgId`), la UI se quedaba con la data de la org anterior
     hasta que el usuario navegaba manualmente. Ahora, tras `setActive`, se hace
     `window.location.assign(...)` (mismo patrón ya probado por `toggleTestMode` en
     `src/store/testMode.ts`): si la URL actual trae un UUID de entidad (cotización/cliente
     concreto que no existe en la otra cuenta) redirige a `/app`; si no, recarga la misma ruta.
   • **`/app/ajustes/cuenta` (`CustomUserProfile.tsx`/`.css`) rediseñada:**
     - CSS migrado de una paleta slate hardcodeada (`#cbd5e1`/`#334155`/`#64748b`) a los
       **tokens de Cord** (`--surface`, `--color-bg-soft`, `--color-border`, `--color-text`,
       `--color-blue-deep`, `--ease-spring`/`--ease-ios`) — arregla el **dark mode**, que antes
       pintaba tarjetas blancas con texto oscuro sobre fondo oscuro.
     - Skeleton de carga real (antes referenciaba clases `.cup-card`/`.cup-card-body`
       inexistentes → texto plano sin estilo).
     - Avatar con **cambio de foto** (`user.setProfileImage({ file })`, overlay al hover).
     - **Secciones nuevas:** Autenticación de 2 pasos (TOTP vía `user.createTOTP()` →
       `verifyTOTP()`, con **códigos de respaldo** mostrados una sola vez tras habilitar —
       `createBackupCode()` — porque Clerk no los vuelve a revelar; clave secreta copiable en
       vez de prometer un QR que no se implementó, ya que mandar la secret TOTP a un servicio
       externo de generación de QR la filtraría), **Passkeys** (`createPasskey()`/
       `passkey.delete()`), y **Cuentas conectadas** (Google vía
       `user.createExternalAccount({ strategy: 'oauth_google', redirectUrl })` — el botón
       "Conectar" redirige a `verification.externalVerificationRedirectURL`, la URL de OAuth
       que Clerk devuelve; sin ese redirect el botón no iniciaba el flujo).
     - `alert()`/`confirm()` nativos reemplazados por `window.cordToast`/`window.cordConfirm`
       (con fallback si el island monta antes que el script de `AppLayout`).
     - Botones destructivos (Revocar sesión, Desactivar 2FA, Eliminar passkey, Desconectar
       cuenta) corregidos de `var(--color-warn)` (ámbar) a `var(--color-danger)` (rojo) — antes
       se veían ámbar por usar el token equivocado.
   • **Bug real corregido en el endpoint nuevo:** `const [rows] = await sql\`...\`` destructuraba
     mal el resultado del driver de Neon (`sql\`\`` devuelve un ARRAY de filas, no una fila) —
     `rows.length` era `undefined` y la validación de membresía del padre **siempre** devolvía
     403, así que ninguna sub-cuenta se ligaba nunca. Corregido a `const rows = await sql\`...\``.
   ⚠️ Correr `npm run db:migrate` (1 columna nueva en `orgs`).
   ⚠️ **Nota de copy pendiente de revisar:** el modal de creación (`CreateWorkspaceModal.tsx`)
     describe la opción "nested" como que la sub-cuenta "comparte datos, miembros del equipo e
     informes" con la org principal — eso NO es cierto en el modelo actual (el multi-tenant por
     `org_id` aísla 100% los datos entre cualquier par de orgs, padres o hijas); la jerarquía es
     puramente organizativa/visual en el switcher. Ajustar el copy si se quiere evitar confundir
     al usuario, o implementar de verdad algún nivel de dato compartido si eso es lo que se
     busca.

✅ **Refactor de Ajustes: Layout "Quiet Luxury", Separación de Modo Developer e Integraciones (jul 2026)** —
   Se aplicó la estética "Quiet Luxury" consistentemente a todas las páginas de configuración y se reestructuró la jerarquía de navegación.
   • **Settings Layout Amplio:** `SettingsShell.astro` se refactorizó para utilizar un grid de 2 columnas (`260px` sidebar, `640px` content max-width) dentro de un contenedor amplio de `1040px`. Esto resolvió el problema de que los campos estuvieran demasiado pegados a la izquierda, ocupando mejor el espacio estilo Stripe.
   • **Fondo de Onboarding:** Se arregló el aspecto visual y el clipping del shader `SupportCoverBg` en `/ajustes/index.astro` para que coincida perfectamente con el fondo de la página de soporte.
   • **Iconos de Integraciones SVG:** En `ajustes/integraciones.astro` se reemplazaron las letras de texto iniciales por los logos SVG oficiales de las marcas (Shopify, WooCommerce, Mercado Libre, Zapier, Slack, CONTPAQi). Se corrigió un cruce en los SVGs donde WooCommerce y Mercado Libre estaban invertidos.
   • **Extracción de Integraciones:** "Integraciones" dejó de estar oculta bajo el toggle técnico y ahora es una categoría principal de primer nivel visible para cualquier usuario (en `SETTINGS_CATEGORIES`), porque cualquier persona puede integrar aplicaciones.
   • **Separación del Modo Desarrollador:** Se eliminó la súper-tarjeta monolítica de "Developers" que contenía todas las opciones. Ahora, al encender el toggle de **Modo desarrollador**, aparecen múltiples filas independientes en la sección de Avanzado: **API y Webhooks**, **MCP**, **Agentes IA**, y **Cotizador embebible**, permitiendo una navegación más directa y modular.

✅ **Cobros v3 — Stripe Connect CUSTOM + Stripe Elements In-House (jul 2026)** —
   evolución definitiva del feature de cobros. Reemplaza por completo el approach OAuth Standard/Express y también el intento de Embedded Components (v2).
   Contexto: Aunque inicialmente se pensó que Custom exigía volumen alto, André solicitó la implementación Custom para lograr el nivel de integración "Quiet Luxury" y marca blanca al 100%. Todo el flujo ahora ocurre 100% in-house.
   • **Migración a Cuentas Custom:** se eliminó todo el flujo OAuth y Embedded (`ConnectOnboarding.tsx`).
     Ahora se utiliza la API nativa de Stripe (`createConnectAccount` con `type: 'custom'`). La recolección de datos (KYC, empresa, personas, banco) se hace mediante el nuevo componente `ConnectCustomOnboarding.tsx` totalmente nativo.
   • **LiveCapture (Verificación de Identidad In-House):** En lugar de subir un archivo mediante un input básico, o usar el onboarding externo, se construyó `LiveCapture.tsx`. Esto pide acceso a la cámara del navegador y toma fotos de la INE/Pasaporte y selfie en tiempo real. Se envía a Stripe vía la API `Files` (`stripeUpload` multipart/form-data) asociado al `person_id`.
   • **Checkout In-House (Stripe Elements):** Se eliminó la redirección al Hosted Checkout. Ahora el link público tiene un flujo interno en `/q/[token]/pay.astro`. Este carga un PaymentIntent (`/api/q/[token]/payment-intent.ts`) que rutea fondos a la cuenta conectada (`Stripe-Account` header) y muestra la UI in-house con `@stripe/react-stripe-js` (`PaymentIsland.tsx`).
   • **Tematización Dinámica:** El `<PaymentElement>` se instanció usando la Appearance API para heredar exactamente el color primario (`--theme-color`) del merchant, removiendo todo rastro estético de Stripe.
   • **Webhooks Mejorados (`/api/stripe/webhook`):** Ahora escucha `payment_intent.succeeded` generado por el Payment Element. Se agregó lógica matemática para leer `charges.data[0].payment_method_details.type` y distinguir pagos con `tarjeta` versus `customer_balance` (SPEI), sin depender de `payment_method_types` genéricos.
   • **Gestión In-House:** Endpoints completos en `/api/billing/connect/*` para manejar `external-account`, `persons`, `document`, y `status`. Se cuenta con un botón para **Desconectar** la cuenta desde `/app/ajustes/cobros` (ideal para limpiar cuentas viejas Express durante el desarrollo).
   • **Dashboard `/app/cobros` (NUEVO, sidebar "Mi dinero"):** página separada de Ajustes que muestra el
     DINERO QUE ENTRA (Ajustes › Cobros sigue siendo la CONFIGURACIÓN). `getCobros()` en `queries.ts`
     agrega total cobrado, desglose por método (tarjeta/spei/otro), serie mensual y cobros recientes —
     filtrando por `status='paid' OR paid_at IS NOT NULL` (NUNCA `status='invoiced'` solo, que puede
     estar sin pagar). Incluye sección de **Depósitos** (balance disponible/pendiente + payouts recientes
     vía `getBalance()`/`listPayouts()` de `billing.ts`). Gated por permiso `cobranza`
     (`memberCan(ME,'cobranza')`).
   • **Nueva columna `cotizaciones.payment_method`** + `paid_at` ahora SÍ se escribe (antes existía la
     columna pero nunca se llenaba). Se setea en `markQuotePaid` (webhook) y en el PATCH manual de pago.
   • **Paso nuevo en el onboarding de Cord:** "Activa los cobros en línea" en `getSetupProgress()`
     (`id: 'online_cobros'`, `done: !!stripe_charges_enabled`) — aparece en el `OnboardingWidget` de todo
     usuario nuevo o existente que no haya conectado cobros.
   • **Rediseño borderless "nivel Apple" completo:** se eliminaron TODAS las cards del flujo Connect
     (`.cobros-hero` navy con glow, `.connect-frame` con borde/sombra, `.cobros-celebration`,
     `.pay-preview`) → todo hairline/plano, consistente con el resto de Ajustes. El wizard
     (`ConnectCustomOnboarding.tsx`) pasó de tiles `.co-card-radio` con borde a filas hairline tipo iOS;
     `.co-requirements` de panel encajonado a lista hairline.
   • **Formulario nivel Stripe:** catálogo MCC ampliado (`stripe-catalogs.ts`, ~67 giros) con buscador
     (`<input list>` + `<datalist>`); validación de RFC con regex oficial MX ANTES de enviar a Stripe
     (bloquea el submit con mensaje claro en vez de esperar el error de la API); autorrelleno completo
     desde `getOrg()` (razón social, RFC, CP, dirección, teléfono, CLABE).
   • **El paso final del wizard distingue estado real:** si `charges_enabled` → "Todo listo, tu cuenta
     está activa" + botón para editar CLABE; si no → requisitos pendientes o "en revisión" — antes SIEMPRE
     mostraba "en revisión" aunque la cuenta ya estuviera 100% activa (bug de UX confuso).
   • **6 bugs reales encontrados y corregidos en auditoría (antes de dar por bueno el flujo):**
     (1) `pay.astro` importaba un layout inexistente (`QuoteLayout.astro`) — rompía el build entero;
     corregido a `Layout.astro` (el mismo que usa `/q/[token]`). (2) `pay.astro` seleccionaba
     `o.color_brand` (columna que no existe) en vez de `o.color_marca` — habría tronado en runtime con
     un 500 al abrir la página de pago. (3) La interpolación `style="...--theme-color: {color}"` no
     funciona en Astro (necesita `style={\`...${color}\`}`) — el color de marca nunca llegaba al CSS.
     (4) `payment-intent.ts` leía la variable de entorno `PUBLIC_STRIPE_KEY` (no existe) en vez de
     `PUBLIC_STRIPE_PUBLISHABLE_KEY` — Stripe.js nunca cargaba, la página de pago quedaba en blanco.
     (5) Los toggles de tarjeta/SPEI se mostraban ENCENDIDOS aunque la cuenta no tuviera Stripe conectado
     (`checked={ORG.aceptaTarjeta}` sin considerar `puedeCobrar`) — corregido a
     `checked={puedeCobrar && ORG.aceptaTarjeta}`. (6) `getCobros()` inicialmente contaba
     `status IN ('paid','invoiced')` como "cobrado" — INCORRECTO en ambos sentidos: una cotización puede
     facturarse (`invoiced`) SIN estar pagada, y una ya pagada puede facturarse después
     (`paid→invoiced`, perdiendo el filtro). Corregido a `status='paid' OR paid_at IS NOT NULL`.
   ⚠️ **Reglas reforzadas esta sesión:** (a) CSS que estilice DOM inyectado por JS (mensajes, Cmd+K,
     toasts) SIEMPRE va en `<style is:global>` — Astro scopea con `[data-astro-cid]` y el DOM dinámico no
     lo lleva. (b) El bloque de pago del link público se gatea por CONFIG de pago del negocio, no por el
     status de la cotización (vive oculto en el paso aprobado). (c) Los `.s-toggle` requieren la estructura
     `<input>` + `.s-toggle-track` (con `.s-toggle-thumb`) + `.s-toggle-text` — sin ella el switch no se ve.
     (d) "Cobrado" ≠ `status IN (...)` con `invoiced` — siempre filtrar por `paid_at IS NOT NULL` o
     `status='paid'` explícito para montos de dinero real. (e) El `sql` de neon-serverless NO compone
     fragmentos (`sql\`...${otroFragmentoSql}...\``) — inlinear la condición completa en cada query.

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

✅ **Cobros directos a la cuenta del dueño — Stripe Connect + transferencia + SPEI dinámico (jul 2026)** —
   hasta ahora, cuando un cliente pagaba una cotización desde `/q/[token]`, el cargo se creaba con la
   llave de PLATAFORMA de Cord (`STRIPE_SECRET_KEY`) → el dinero caía a Flouvia, no al negocio. Esto
   contradecía lo que YA prometían 2 artículos de soporte (`comisiones-tarifas.md`/`migracion-stripe.md`:
   "tu propia cuenta de Stripe, Cord nunca toca los fondos"). Se implementó Stripe Connect de verdad:
   ⚠️ **SUPERADO (jul 2026):** el flujo OAuth Standard/Express detallado aquí abajo se MIGRÓ definitivamente a **Stripe Connect Custom + Stripe Elements In-House** (ver entrada "Cobros v3" arriba).
   Lo de OAuth (`connect/{start,callback,status}.ts`, `getConnectOAuthUrl`, el nonce anti-CSRF, `STRIPE_CONNECT_CLIENT_ID`)
   YA NO EXISTE. Lo que SÍ sigue vigente de esta entrada: el modelo de charge directa con header
   `Stripe-Account` (cero comisión), las columnas de `orgs`, el SPEI dinámico, y los fixes de dinero.
   • **Connect Standard + Express** (`src/pages/api/billing/connect/{start,callback,status,disconnect}.ts`)
     — el dueño conecta SU Stripe existente (OAuth, `state`=nonce aleatorio en cookie httpOnly anti-CSRF,
     verificado en el callback — NUNCA el orgId, que sería adivinable) o crea una cuenta ligera vía
     Express (`account_link` hosted onboarding). Columnas nuevas en `orgs`: `stripe_account_id`,
     `stripe_account_type`, `stripe_charges_enabled`, más `acepta_tarjeta`/`acepta_transferencia`/
     `cobro_spei_auto`/`banco_nombre`/`banco_clabe`/`banco_beneficiario`. Página nueva
     `/app/ajustes/cobros` (toggles gated a `charges_enabled`).
   • **Charge directa, CERO comisión de Cord:** `checkout.ts` ahora agrega el header `Stripe-Account:
     acct_...` a la Checkout Session (sin `application_fee`/`transfer_data` — el comerciante de
     registro es el dueño). Rechaza el cobro con 403 si la org no tiene Connect activo o no acepta
     pagos en línea; sigue bloqueado en sandbox (409).
   • **SPEI dinámico (CLABE única por cotización) vía `customer_balance`/`mx_bank_transfer` de Stripe**
     — la misma cuenta conectada, sin que Cord retenga fondos (evita terreno regulado tipo Ley
     Fintech/IFPE). El webhook escucha también `checkout.session.async_payment_succeeded` (evento de
     liquidación diferida).
   • **3 bugs de dinero reales encontrados y corregidos en la misma pasada (auditoría antes de dar por
     bueno el flujo):** (1) `markQuotePaid` marcaba `paid` con solo `checkout.session.completed`, pero
     para SPEI ese evento llega con `payment_status:'unpaid'` en cuanto el cliente ve la CLABE — **antes
     de transferir**; ahora exige `payment_status === 'paid'` (el evento real de liquidación SPEI es
     `async_payment_succeeded`). (2) El checkout de SPEI no creaba ningún `customer`, que
     `customer_balance` exige para asignar la CLABE — Stripe rechazaba la sesión; ahora se crea un
     customer en la CUENTA CONECTADA (mismo header `Stripe-Account`) antes de armar la sesión. (3) El
     link público mostraba la CLABE ESTÁTICA de transferencia manual con la leyenda "se marcará pagada
     automáticamente" — falso, esa CLABE fija no se concilia sola; se separó el copy (transferencia
     manual = "envía tu comprobante", SPEI-auto = botón de pago en línea que genera la CLABE dinámica
     de Stripe) y el botón de pago ahora también aparece cuando solo hay SPEI (antes exigía tarjeta).
   • **Hardening adicional:** `markQuotePaid` valida `event.account` contra el `stripe_account_id` de
     la org dueña de la cotización — defensa en profundidad para que un merchant conectado no pueda
     marcar pagada una cotización ajena.
   • **Bug de nombre de variable de entorno encontrado y corregido:** `.env.example` declaraba
     `CONNECT_CLIENT_ID`/`CONNECT_WEBHOOK_SECRET` pero el código (`billing.ts`, `webhook.ts`,
     `connect/disconnect.ts`) lee `STRIPE_CONNECT_CLIENT_ID`/`STRIPE_CONNECT_WEBHOOK_SECRET` — con los
     nombres viejos configurados en Vercel, el código NUNCA las habría leído (OAuth Standard tronaría
     con "STRIPE_CONNECT_CLIENT_ID no configurada" y la firma de eventos Connect jamás verificaría).
     `.env.example` ya corregido a los nombres reales que usa el código.
   • **El webhook verifica DOS secretos** (`webhook.ts`): `WH_SECRET` (plataforma) y `CONNECT_WH_SECRET`
     (endpoint de eventos de cuentas conectadas) — la firma es válida si CUALQUIERA de los dos matchea,
     porque Stripe firma los eventos de Connect con el secreto de SU PROPIO endpoint (uno nuevo, no el
     de plataforma).
   ⚠️ **Pendiente de configuración manual en el dashboard de Stripe (no es código):** (1) crear un
     SEGUNDO endpoint de webhook (misma URL, "eventos en cuentas conectadas") y setear su secreto en
     `STRIPE_CONNECT_WEBHOOK_SECRET` — sin esto el dinero cae al dueño pero Cord nunca marca la
     cotización pagada; (2) confirmar que SPEI/bank-transfer esté habilitado para cuentas conectadas
     MX; (3) `STRIPE_CONNECT_CLIENT_ID` (Settings → Connect → OAuth settings). ⚠️ Correr
     `npm run db:migrate` (7 columnas nuevas en `orgs`).

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

✅ **Org Switcher rediseñado — estilo Apple/Settings, "inset grouped list" (jul 2026)** —
   `CustomOrgSwitcher.tsx` pasó de un dropdown plano genérico a un patrón Apple System
   Settings, reusando el MISMO lenguaje visual que el drawer de Ayuda (`.help-inset-group`/
   `.help-link` en `AppLayout.astro`) para consistencia entre menús de la app.
   • **Trigger de dos líneas:** el botón del switcher ahora muestra un eyebrow tracked
     ("Espacio de trabajo", 0.6rem uppercase) sobre el nombre de la org en bold — mismo
     patrón que el selector de Apple ID en macOS/iOS Settings. Nuevo wrapper `.org-text`
     (`flex-direction:column`).
   • **Dropdown = 3 tarjetas "inset grouped"** en vez de una lista plana: (1) Espacios de
     trabajo (avatar+nombre+rol, checkmark en badge circular navy para el seleccionado,
     con un anillo azul alrededor de su avatar), (2) Acciones (Crear espacio · Configuración
     del equipo con chevron de disclosure › · Entorno de prueba con su toggle), (3) Cuenta
     (perfil + Cerrar sesión). Cada fila tiene un **icon badge squircle 26px** (`.orgd-icon`)
     con fondo tintado — `orgd-icon-neutral` (gris/navy, mismo tono que `.help-link-ico`),
     `orgd-icon-amber` (Entorno de prueba — reusa el ámbar semántico del test-mode),
     `orgd-icon-red` (Cerrar sesión — reusa `--color-danger`). **Cero colores nuevos**: solo
     los 3 acentos que ya existían en la app (navy, ámbar de test-mode, rojo de peligro) —
     a propósito, para no romper la paleta "Quiet Luxury" con un arcoíris tipo iOS Settings.
   • **Divisores inset** (`::after` que arranca en `left:46px`, después del icono/avatar —
     no full-bleed) en vez de `<hr>`/borde completo, igual que el patrón de Ayuda.
   • **Bug real encontrado y arreglado — el badge "Prueba" rompía el layout:** el pill ámbar
     que se agregó junto al nombre en la sesión anterior (`.org-test-badge`) le robaba
     ~50-60px al `org-name` dentro de un sidebar de 232px reales, causando un truncado
     agresivo ("ESPACIO D...", "Materiales del V..." se cortaba aún más de lo normal).
     Reemplazado por una señal que NO consume espacio horizontal: (1) un **anillo ámbar**
     alrededor del avatar (`box-shadow`, visible también en modo colapsado 36×36 donde no
     hay texto) y (2) el **eyebrow cambia de texto/color** ("Espacio de trabajo" →
     "Entorno de prueba" en ámbar) — mismo patrón que iOS Settings usa subtítulos con color
     para indicar estado en vez de agregar chrome. Verificado con un mock estático (mismos
     tokens `--sb-*`/`--color-*` y CSS exacto del componente, renderizado con Playwright) en
     light/dark/colapsado/nombre-largo — 0 regresiones de truncado vs. el comportamiento
     anterior sin badge.
   • **`title={nombre}`** agregado en `.org-name`/`.org-item-name` — con sidebar angosto
     (232px) los nombres largos truncan por diseño (ellipsis); el tooltip nativo permite
     leer el nombre completo al pasar el cursor, sin costo.
   • ⚠️ **Se preservaron intactos** los classnames que `AppLayout.astro` fuerza vía
     `<style is:inline>` (bypass anti-translucidez, ver comentario "ASTRO OPTIMIZATION
     BYPASS" ahí): `.custom-org-switcher`, `.org-switcher-btn`, `.org-dropdown`,
     `.org-list-item`. Esas reglas fuerzan `background-color`/`box-shadow`/`z-index`/
     `backdrop-filter` con `!important` — **no pisar esas propiedades específicas** en el
     componente; el resto (`border-radius`, `padding`, contenido interno) es libre.
   • **Regla a futuro:** cualquier menú/dropdown nuevo de la app que quiera sentirse "Apple
     Settings" debe reusar este patrón (`.orgd-group` tarjeta + `.orgd-icon` badge + divisor
     inset), no reinventar un dropdown plano. Si se necesita una señal de estado (activo/
     alerta) en un trigger con espacio angosto, preferir anillo/color de texto sobre un
     badge/pill que compite por espacio horizontal.
   • **Toggle "Entorno de prueba" — proporciones reales de iOS:** el `.toggle-switch`
     inicial (28×16px, wash ámbar translúcido al 35%, thumb sin sombra del color del
     track) se veía plano y el estado OFF era casi invisible. Reescrito con las MISMAS
     proporciones/easing que `.s-toggle` (el toggle global de Ajustes, 44×24 con thumb
     blanco+sombra): track 38×24, `border-radius:100px`, OFF = gris sólido
     `rgba(10,25,47,0.13)` (dark: `rgba(255,255,255,0.16)`), ON = ámbar **sólido** `#f59e0b`
     (no translúcido), thumb 18px **siempre blanco** con `box-shadow` de dos capas
     (`0 1px 3px rgba(0,0,0,0.3), 0 1px 1px rgba(0,0,0,0.16)`) que se desliza
     `translateX(16px)`. Transiciones con `var(--ease-ios)`/`var(--ease-spring)` iguales a
     `.s-toggle`. Regla: cualquier toggle nuevo fuera de Ajustes debe copiar estas
     proporciones (no reinventar tamaños de 16-20px con washes translúcidos).

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

✅ **Evolución de `@flouviahq/elements` a God-Level SDK (v0.5.0 y v0.6.0) (jul 2026)** —
   Se transformó la librería original (que solo era un wrapper de iframe) en una infraestructura financiera B2B nativa completa, al nivel de Stripe o Clerk:
   • **Patrón Compound (Slots):** El cotizador React (`<CordBuilder>`) dejó de ser una caja negra. Ahora expone componentes como `<CordBuilder.Header>`, `<CordBuilder.Config>`, `<CordBuilder.Items>` que el developer puede componer o reemplazar.
   • **Engine Nativo Avanzado:** Cálculos financieros en tiempo real. Soporte para `moneda` (MXN/USD), `terminos` (Contado/Net30/Net60), `vigenciaDias`, `notas` custom, y un toggle nativo de **"Precios incluyen IVA"** con lógica matemática inversa.
   • **Sincronización de Catálogo y CRM:** Hooks Headless (`useCordCatalog` y `useCordClients`) que jalan productos y clientes reales. El componente `<CordBuilder.Header>` ahora renderiza un `<datalist>` conectado al CRM de Cord: al seleccionar un cliente conocido, **auto-llena** su email, sus términos por defecto y enlaza el `cliente_id` oculto al payload para mantener el historial intacto en la plataforma.
   • **Server SDK y Seguridad (Webhooks):** Se expuso un entrypoint para Node (`@flouviahq/elements/server`). Añadimos criptografía real para los webhooks (`cord.webhooks.constructEvent`) usando `crypto` (HMAC SHA-256), bloqueando firmas inválidas o con timestamps antiguos (Replay Attacks). El build de esbuild se configuró con `platform: 'node'` para no romper el bundle web.
   • **Localización Nativa (i18n):** Se liberó la UI del hardcode en Español. `<CordProvider locale="en">` ahora traduce absolutamente toda la UI de forma dinámica usando el hook `useCordTranslations()`.

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

✅ **Auditoría SEO + AI-SEO (GEO) + copywriting de todo el sitio público (jul 2026)** —
   André reportó el problema raíz: la IA (LLMs/AI Overviews) interpretaba Cord como un
   producto **exclusivo de los clientes de Flouvia** en vez de un SaaS público e
   independiente, porque el sitio repetía "by Flouvia"/"UN PRODUCTO DE FLOUVIA" en el
   `<title>`, la meta description, el trust strip del hero, el footer y el eyebrow del
   menú móvil — sin ningún dato estructurado que aclarara lo contrario. Pasada completa
   página por página (index → precios → producto → soluciones/casos de uso →
   desarrolladores → recursos), cubriendo SEO clásico, AI-SEO/GEO (JSON-LD) y
   copywriting/psicología de marketing. Verificado en cada tanda con `npm run build` +
   Playwright contra `.vercel/output/static` (regla ya documentada abajo:
   [[verify-mockups-against-build]]).
   • **`/index`:** `<title>`/`<meta description>` reescritos (quité "by Flouvia" del
     título; la independencia de Flouvia se explicita en la descripción: "no solo
     clientes de Flouvia"). JSON-LD nuevo: `Organization` (Flouvia) + `SoftwareApplication`
     (Cord, con `creator`/`provider` apuntando a Flouvia — la forma correcta en schema.org
     de decir "hecho por X pero es su propio producto") + `FAQPage` (antes no existía).
     Nueva FAQ #8 explícita: *"¿Cord es lo mismo que la app de Flouvia para Shopify?"*.
     El trust strip del hero pasó de una sola línea ("CONSTRUIDO SOBRE LA INGENIERÍA DE
     FLOUVIA") a 4 señales reales (CFDI 4.0 ante el SAT · cifrado TLS+AES-256 · hecho en
     México · respaldado por Flouvia — Flouvia ahora es 1 de 4 señales, no el mensaje
     completo). `hero.desc` abre con "para cualquier negocio en México — con o sin tienda
     en línea". Footer/menú móvil: "Un producto de" → "Hecho por el equipo de";
     "COTIZACIONES B2B · POR FLOUVIA" → "SOFTWARE B2B · PARA CUALQUIER NEGOCIO EN MÉXICO".
   • **`/precios`:** mismo criterio + fix de un bug real (la descripción vieja decía
     "crece a Profesional o **Negocio**" — ese plan no existe, es "Scale"). JSON-LD
     `Product` con un `Offer` por cada uno de los 5 planes + `FAQPage`. FAQ nueva:
     *"¿Necesito ser cliente de Flouvia para contratar un plan?"*.
   • **`/producto/*` (12 páginas × ES/EN = 24):** ya tenían buena base (`metaTitle`,
     `FAQPage` por página), pero las 24 `metaTitle` terminaban en "— Cord by Flouvia" —
     quitado en todas. Completé las 8 `metaDescription` que faltaban (4 features × 2
     idiomas). Agregué `BreadcrumbList` al template `[slug].astro` (antes ninguna de las
     12 tenía jerarquía estructurada).
   • **`/soluciones/empresas` y `/soluciones/startups`:** mismo fix de `metaTitle` (sin
     "by Flouvia") + "México" agregado a las `metaDescription` + `BreadcrumbList` nuevo.
   • **Casos de uso (`saas`, `agencias`, `comercializadoras`, `software-factory`):** no
     tenían FAQ visible ni ningún JSON-LD. Escribí 4 preguntas nuevas por página (16 en
     total, ES only — no hay `/en/casos-de-uso`), ancladas a features reales del producto
     (no al copy de marketing de cada página), con `FaqAccordion` + `FAQPage` +
     `BreadcrumbList`. **Hallazgo sin resolver (pendiente, ver abajo): los "trust logos"**
     (Ogilvy, Salesforce, Stripe, Vercel, GitHub, etc. con copy "usan Cord"/"operan con
     Cord") **casi seguro no son clientes reales** — André pidió dejarlo así por ahora.
   • **`/desarrolladores/*` (6 páginas × ES/EN + `status`):** la sección con menos base —
     la interfaz `DevPage` ni siquiera tenía campos `metaTitle`/`metaDescription`/`faqs`.
     Se agregaron (espejo del patrón de `Feature` en `producto.ts`) + 18 FAQ nuevas (3 por
     página) + `FAQPage`/`BreadcrumbList` en el template. **2 bugs de plan inexistente
     corregidos:** `api` decía "Plan Negocio" (no existe; la API ya no está gateada a un
     plan — está en todos, limitada por cantidad, ver el fix de gating de jun 2026) y
     `fiscal` decía "Plan Enterprise" (no existe; el tope real es "Developer"). De paso se
     arregló una corrupción real en `desarrolladores.ts`: el campo `sub` de la interfaz
     `DevPage` estaba atrapado dentro de un comentario de una sola línea (`// H1, admite
     <br/>sub: string;`), typo que no rompía el build pero sí el tipado. `status.astro`
     (ES y EN — son archivos separados, no comparten componente) ganó `BreadcrumbList` y
     se corrigió un **link roto real**: el botón "Contactar Soporte" mandaba a
     `support@cord.com`/`soporte@cord.com` (dominio que Flouvia no posee) → corregido a
     `soporte@flouvia.com` (el correo real usado en todo el resto del sitio).
   • **Recursos (Blog, Centro de Ayuda, Roadmap, Contacto ventas):** el contenido ya
     estaba bien escrito (auditoría de exactitud previa, ver entrada "Auditoría y
     reescritura de exactitud de Soporte/Blog/Roadmap" más abajo) pero sin NINGÚN dato
     estructurado. Trabajo a nivel de template para que el esfuerzo se multiplicara:
     `BlogPosting`+`BreadcrumbList` en `blog/[slug].astro` (14 posts × ES/EN), `Article`+
     `BreadcrumbList` en `soporte/[slug].astro` (132 artículos × ES/EN), `FAQPage`+
     `BreadcrumbList` en el hub `soporte.astro` (el FAQ se extrajo a
     **`src/lib/support-faq.ts`**, fuente única compartida con `SupportCards.astro` para
     que el schema nunca se desincronice del texto visible), `BreadcrumbList` en
     `soporte/categoria/[categoria].astro`, en `roadmap.astro`/`en/roadmap.astro` y en
     las 20 páginas de detalle `roadmap/[slug].astro`, y en `contacto/ventas.astro`.
     **Bug real corregido:** la FAQ del hub de soporte decía *"las llaves de producción
     requieren el plan Scale o Developer"* — falso desde el fix de gating de jun 2026 (la
     API ya está en todos los planes). `/q/demo` se dejó intacto (ya tenía `noindex`
     correcto — es un link de cotización, no contenido indexable).
   • **Infraestructura SEO nueva (no existía nada de esto):** `public/robots.txt`
     (disallow `/app`, `/api`, `/embed`, rutas de auth; referencia al sitemap),
     `public/llms.txt` (estándar emergente para agentes de IA — resume qué es Cord y
     aclara explícitamente la independencia de Flouvia en texto plano), y
     **`src/pages/sitemap.xml.ts`** (endpoint dinámico, `prerender=true`, sin dependencias
     nuevas): enumera páginas estáticas + producto/soluciones/desarrolladores (desde los
     `.ts` de contenido, fuente única) + roadmap + blog + soporte (vía `getCollection`) —
     234 URLs con hreflang ES/EN. El helper `pairEntry()` arma el `<xhtml:link>` cuando el
     patrón de ruta ES/EN no es un simple prefijo `/en/` (ej. `/soporte/x` ↔
     `/en/support/x`).
   ⚠️ **2 hallazgos de exactitud SIN resolver** (fuera de alcance de esta pasada, quedan
     para revisión de André): (1) `agencias.astro` (casos de uso) dice que Cord "agenda
     los cobros mensuales, procesa el pago... automáticamente" para igualas/retainers —
     pero el pago real es vía link de Stripe Checkout + recordatorios, no cargo
     recurrente automático a tarjeta; podría estar sobre-prometiendo. (2)
     `/desarrolladores/fiscal` afirma "100% cumplimiento normativo SAT **e IRS**" y tiene
     un ejemplo de código `cord.tax.calculate()` que no parece ser un endpoint real —
     combinado con que el proveedor de facturación US está documentado como no terminado
     (`USInvoiceProvider` stub, ver "Pendiente" al final de este archivo), es una
     afirmación fuerte que vale la pena revisar con calma.
   ⚠️ **Regla a futuro:** toda página pública nueva sigue este mismo patrón: `<title>`
     keyword-rich SIN "by Flouvia" (la independencia va en la descripción/FAQ, no en el
     título), `metaDescription` propia (nunca depender solo del fallback a `sub`),
     `BreadcrumbList` siempre, y `FAQPage` cuando haya FAQ visible — **el schema JSON-LD
     SIEMPRE debe leer de la MISMA fuente que el componente visual** (nunca un array
     duplicado a mano — por eso `support-faq.ts` se extrajo a un archivo compartido) para
     que nunca diverjan. Verificar con `npm run build` + Playwright contra
     `.vercel/output/static`, nunca contra `npm run dev` (ver regla de verificación de
     mockups).

✅ **Hero del index rediseñado — layout "unido" estilo ElevenLabs/Linear + header de
   Features (jul 2026)** — André pidió que el hero dejara de sentirse como dos secciones
   separadas (texto centrado full-height + gran gap + mockup aparte) y se acercara al
   patrón de ElevenLabs/Linear: texto y producto "unidos" en la misma pantalla.
   • **`Hero.astro` — texto+mockup unidos:** se quitó el `min-height: calc(100vh-120px)`
     de `.hero-inner` y se comprimió el ritmo vertical (título/desc/acciones/badge) para
     que el mockup ya no viva en una sección aparte tras un `margin-bottom: 6rem` — ahora
     empieza a sangrar dentro del primer viewport (se corta en el fold, como las
     referencias) en vez de requerir scroll completo para verse.
   • **Botón "Ver demo en 2 min" ELIMINADO** (no existe video demo) — se quitó el
     `btn-ghost` y las llaves `hero.btn.demo` (ES/EN) de `src/i18n/ui.ts`.
   • **Título a la izquierda, descripción a la derecha (split ElevenLabs):** nuevo wrapper
     `.hero-top` (`display:grid; grid-template-columns:1.25fr 1fr`) que pone `.hero-title`
     a la izquierda y `.hero-desc` a la derecha, ambos `text-align:left`; en mobile
     colapsa a 1 columna (`@media max-width:900px`). El botón "Empezar gratis" quedó
     left-aligned debajo del título (antes centrado).
   • **Chips "Aprobación en un clic · CFDI 4.0 automatizado · Gratis para empezar"
     ELIMINADOS** (los badges de palomita verde) — se borró `.hero-points`/`.hp-item`/
     `.hp-sep` del markup y CSS, y las llaves `hero.point.1/2/3` (ES/EN) de `ui.ts`. Se
     limpió también la línea muerta `.to('.hero .hero-points', …)` del timeline GSAP en
     `index.astro`.
   • **Trust strip (CFDI/cifrado/país/Flouvia) subido:** `.hero-trust` pasó de
     `margin-top: 8rem` a `2.75rem` — ahora queda pegado justo debajo del mockup en vez
     de flotar solo tras un scroll largo.
   • **`Features.astro` (sección "El sistema que conecta…", justo debajo del mockup) —
     mismo split que el hero:** nuevo wrapper `.ft-head-row` (grid `1.25fr 1fr`) con
     `.ft-title` a la izquierda y `.ft-sub` a la derecha (antes ambos centrados en una
     columna de 680px). Colapsa a 1 columna en `@media max-width:800px`.
   • **Bug real encontrado — título achicado no se veía (`h1.masked-title` global con
     `!important`):** al reducir el `font-size` de `.hero-title` en `Hero.astro` no pasaba
     nada visualmente porque `Layout.astro` tiene una regla global
     `h1.masked-title { font-size: … !important; text-align:center !important; … }`
     pensada para UNIFICAR el tamaño de título en todas las páginas públicas — esa regla
     le ganaba a `.hero-title` por `!important`, sin importar la especificidad normal.
     Fix: el hero del home ahora también usa `!important` en `.hero-title` (que sí gana
     por tener mayor especificidad — dos clases/atributo vs. una clase) para divergir
     A PROPÓSITO solo en el home, **sin tocar la regla global** que sigue unificando el
     resto de heroes (`/producto/*`, `/soluciones/*`, etc.). **Regla a futuro:** si un
     `h1.masked-title` no refleja un cambio de estilo esperado, revisar primero el
     `!important` de `Layout.astro` antes de asumir que es un problema de HMR/caché.
   • **Bug de entorno confirmado — iCloud sigue rompiendo el watcher de Vite:** durante
     esta sesión, ediciones a `Hero.astro` no se reflejaban en `npm run dev` (el HTML
     servido seguía con el CSS viejo) hasta hacer `touch` manual del archivo — el watcher
     de chokidar pierde eventos de escritura bajo `~/Desktop` (sincronizado con iCloud).
     Ya documentado como riesgo conocido (ver "iCloud sigue rompiendo el repo" más abajo,
     incidente del `.git`); esta vez afectó HMR en vez de refs de git. **Si un cambio de
     CSS/Astro no se refleja en dev pese a estar bien guardado: `touch` el archivo antes
     de sospechar de caché de Vite.**

✅ **Blog — TOC del artículo y CTA final rediseñados a cards Apple + fix de copy falso (jul 2026)** —
   André pidió que el índice flotante y la sección final del artículo (`/blog/[slug]`) se sintieran
   "más estilo Apple" y reportó que el CTA de contratación era falso (Cord no está contratando).
   • **TOC (`toc-container`, sidebar izquierdo del artículo):** el card ya tenía `background:#fff`
     pero con `border-radius:20px` y una sola sombra muy sutil (`0 10px 40px -10px rgba(0,0,0,.05)`)
     — sobre el fondo blanco de la página no se leía como tarjeta, se veía como texto plano.
     Se subió a `border-radius:28px` + sombra compuesta en capas (contacto + ambiente difusa +
     inset highlight superior + inset hairline 0.045 opacity) siguiendo el mismo lenguaje que
     `.bento-card` de `BlockMockup`/`ShowcaseMockup` (Regla de Diseño 4: tarjetas blancas puras,
     radius masivo, sombras difusas multicapa). **No se tocó `position` del contenedor** — el
     `.sticky` (`position:sticky; top:140px`) se dejó intacto a propósito porque un bug previo
     documentado en este mismo archivo (`position:relative` en `.toc-container`) ya había roto el
     sticky una vez; solo se ajustó `border-radius`/`padding`/`box-shadow`.
   • **`BlogCTA.astro` (sección final "Suscríbete al Blog de Cord"):** las 3 tarjetas del bento
     (`.bento-card`) tenían `background:#fff` sin NINGÚN `box-shadow` (la clase `hairline-border`
     en el markup no tenía definición en el `<style>` — CSS muerto) → sobre el fondo blanco de la
     página quedaban completamente planas, sin volumen. Rediseño completo: `border-radius:32px`,
     sombra compuesta en capas (mismo patrón que el TOC), hover con `translateY(-4px)` + sombra más
     profunda, iconos duotone glass (squircle `rgba(10,25,47,.07→.03)` + `inset` highlight, SVGs con
     `fill-opacity` por la Regla de Diseño 9), input de suscripción en gris Apple `#f5f5f7` con foco
     navy (Regla 5), botón pill con `scale(0.97)` en `:active`. Se quitó la clase huérfana
     `hairline-border` del markup (no hacía nada).
   • **Fix de copy falso:** la tarjeta pequeña de "¿Te gusta lo que lees?" decía "Cord construye
     infraestructura financiera... Únete al equipo" con CTA "Ver vacantes" → `/unirse` — pero
     `/unirse/[token]` es el flujo de INVITACIÓN DE EQUIPO (org_members), no una página de empleos;
     Cord no tiene vacantes abiertas. Se reemplazó por un CTA honesto: "Seguir en LinkedIn" →
     `https://linkedin.com/company/flouviamx` (el mismo link real que ya usa `/blog` en el header
     y el share-pill del artículo), con copy ajustado ("Síguenos para más análisis y casos de
     estudio" en vez de "Únete al equipo"). ES/EN actualizados en paralelo.

✅ **Index — teléfono + precios premium + sección "Avanzadas" estilo Apple (jul 2026)** — tres
   arreglos pedidos por André tras ver el index ("el celular quedó raro raro… lo de precios como la
   página de precios… esta sección más estilo Apple, mil veces mejor").
   • **`ClientView.astro` (el teléfono) limpiado a nivel Apple:** se QUITÓ el compose de chat que
     saturaba, se resolvió el truncado del nombre (el chip de folio robaba ancho → el folio se movió
     a la línea del RFC: "RFC … · COT-0148"), el teléfono se ensanchó (316→332px) y se dio más aire
     (card `border-radius:26px`, gaps y paddings mayores, TOTAL como héroe a 2.35rem, un solo botón
     pill de aprobar + "Descargar PDF" como link discreto). ⚠️ **El overlay de éxito `.ps-success`
     pasó de `rgba(255,255,255,0.94)` translúcido a SÓLIDO `#ededf0`** — antes, al hacer crossfade
     el contenido de la card se transparentaba encima y se veía "encimado/roto"; sólido queda limpio.
   • **`Pricing.astro` (precios del home) = calca de la página `/precios`:** se reemplazó la grilla
     hairline plana por las **tarjetas premium ElevenLabs**: `plan-visual` (header gris Apple) +
     `plan-aurora-bg` (aurora CSS azul eléctrico `pab-b1`/`pab-b2`) + `plan-body` con toggle mensual/
     anual + **CTA pill con shimmer** + features con hairline. La **aurora viaja** entre tarjetas
     (clase JS `aurora-active`, activa por defecto en el destacado, sigue al hover, regresa al salir
     del grid). El JS quedó **scopeado a `.pricing`** (querySelectors dentro de la sección) para no
     chocar con nada. Sin WebGL (aurora es CSS pura, como en /precios). El link "comparar planes"
     sigue a `/precios`.
   • **`AdvancedFeatures.astro` restyle Apple:** header con eyebrow tracked + título `clamp` tighter
     + **párrafo lead** (`adv.sub`); se quitó el botón de flecha suelto que se veía fuera de lugar.
     Tabs izquierda rediseñados: **íconos squircle** (border-radius 11px, no círculos), activo =
     tarjeta blanca con aro sutil `rgba(10,25,47,0.06)` + sombra suave (NO el borde azul duro +
     shadow anterior), ícono activo navy squircle. Canvas derecho: radius 28px, fondo con gradiente
     suave `#fbfcfd→#f3f4f7`, sombra premium; caja flotante con blur+saturate y sombra compuesta;
     backgrounds de pane más sutiles. **Fix del CFO:** el tooltip "Octubre (Actual)" pisaba el
     "14 Meses" del runway — se bajaron todas las barras (`--h` menores) y se subió el `margin-top`
     del chart a 48px para darle clearance; ahora el tooltip queda debajo del header, limpio.
   ⚠️ Las animaciones GSAP/CSS internas de los panes (typing, chat, bars rise, FX lock) NO se
     tocaron. Verificado contra el BUILD con Playwright (el dev server suelta estilos de componentes
     reescritos — ver [[verify-mockups-against-build]] / la regla de abajo).

✅ **Pasada global de mockups: index + soluciones + casos de uso (jul 2026)** — a petición de
   André ("quiero lo más top"): el mockup del hero del index y el teléfono estaban desactualizados
   vs la app real, y los casos de uso pedían rediseño completo.
   • **Hero del index (`Hero.astro`) = calca de la app ACTUAL en light mode:** ventana blanca
     estilo Stripe (sin dots macOS ni barra de URL), sidebar clara con los grupos reales del nav
     (Principal · Clientes y productos · Mi dinero · Inteligencia — labels vía i18n `mk.grp.*`/
     `mk.nav.6-7`), buscador ⌘K, breadcrumbs + page header con chips de acción, **stepper de
     estado** (Creada→Enviada→Vista→Aprobada, `.mk-stp[data-story]` — el JS del demo en
     `index.astro` ahora también togglea `is-pending` en el stepper), tabla con SKUs (`.mk-sub`)
     y nota verde de precio por volumen, panel de Actividad claro, avatar de org "Materiales del
     Valle". ⚠️ Bug de CSS aprendido: `.mk-row span:not(.mk-prod)` alcanzaba a los HIJOS de
     `.mk-prod` (los SKU quedaban alineados a la derecha) — usar `>` para hijos directos.
   • **Teléfono de ClientView = calca del `/q` actual:** Dynamic Island, pantalla `#f3f2ef` con
     card blanca (marca del vendedor + RFC + tag de folio, meta PARA + chip ámbar de vigencia,
     total hero sobre `#f5f5f7`, líneas con `×cant · unit`, strip "Conectado en tiempo real",
     botón pill 999px, compose de chat siempre visible con send circle). Todos los hooks GSAP
     intactos (`cvAmount`/`ps-item`/`cvApprove`/`ps-ring`/`cvCursor`/`cvSuccess`/`cvCheck`).
     Llaves i18n nuevas `cv.mk.folio/para/vig/live/chat`.
   • **Kit `cmk-*` (`mockups.css`):** `.cmk-shot` ahora es blanco SÓLIDO (adiós translúcido+blur),
     bleed reducido a `max(460px, 100%+48px)`, y los **dots del browser-chrome se ELIMINARON**
     (`.cmk-chrome-dots` tenía hover que los volvía semáforo macOS — prohibido); la URL ahora es
     píldora centrada. En startups también se borraron los `imk-dots` rojos/amarillos/verdes
     (editor, terminal y browser embed) — el terminal ganó un status `sk_live` a la derecha.
   • **Empresas/startups (mejora, estructura intacta):** editor de empresas con toolbar real de
     producto ("Editor · COT-2207" + badge Borrador) en vez de browser chrome; la lista de
     cotizaciones de startups se reordenó **Folio | Cliente | Estado | Total** (la col. de fecha
     se cortaba con el bleed y ocultaba los estados — regla: con bleed derecho, lo que cuenta la
     historia va a la IZQUIERDA).
   • **Casos de uso (REDISEÑO COMPLETO, 12 mockups):** las 4 páginas (`saas`, `agencias`,
     `comercializadoras`, `software-factory`) importan `src/styles/mockups.css` y reescribieron
     su split-mockup + 2 bentos con el kit `cmk-*`: ventana `.uc-cmk-window` (CSS local por
     página) para el split, y patrón `cmk-stage`/`cmk-shot` dentro de `.uc-bc-mockup` para los
     bentos. Historias por vertical: saas (editor con nivel/−10% + portal pagado con CFDI
     timbrado + propuesta con firma), agencias (iguala $38k/mes con timeline de automatización +
     anticipo con link de pago + tabla de igualas con MRR), comercializadoras (pedido Net 30 con
     precio por volumen + panel de crédito con pedido retenido + aging de cobranza),
     software-factory (milestones con avance de cobro + entregables PR merged + módulos up-sell
     con toggles iOS). Se borraron los `uc-mini-invoice`/`uc-mini-portal`/`uc-retainer-widget`
     viejos (CSS muerto sigue en cada página, inofensivo).
   • **Override de bleed en bentos** (en las 4 páginas): `.uc-bc-mockup .cmk-shot { right: -14px;
     bottom: -40px; width: auto }` — sangra por abajo (look "cortado" aprobado) pero solo 14px a
     la derecha para NO ocultar badges/montos. ⚠️ **Regla de verificación aprendida:** el dev
     server de Astro puede soltar el `<style>` scopeado de un componente reescrito (HMR) — los
     mockups se verifican con Playwright contra el **build** (`.vercel/output/static` + servidor
     estático), no contra `npm run dev`.

✅ **Rediseño completo de mockups en `/producto/[slug]` — hero + bento (jun 2026)** — pasada a
   fondo sobre `src/pages/producto/[slug].astro` y `src/components/producto/BlockMockup.astro`
   pedida por André con referencias directas de Stripe/Linear/ElevenLabs ("quiero que se vean
   cabronas, sobrias, reales, no caricaturescas").
   • **Hero — sistema de "satélites" flotantes (estilo Stripe payment-links):** además del mockup
     central del hero, ahora hay elementos `.pp-sat`/`.pp-bub` (tarjetitas y burbujas de chat) que
     flotan **fuera** de la ventana principal, en el espacio libre del hero — nunca dentro de una
     card. Entran con GSAP (`back.out`, stagger) y laten con un float independiente
     (`.pp-float-a`/`.pp-float-b`, fases opuestas). Ojo: `.pp-hero` tiene `overflow-x: clip`, así
     que los satélites deben posicionarse con `left`/`top`/`bottom` POSITIVOS dentro de la columna
     visual (nunca `left` negativo) o quedan recortados.
   • **Hero — eliminados los "traffic lights" macOS:** a petición explícita de André ("no me gusta
     nada de nada"), `.mk-dots` quedó `display:none` en todos los mockups del hero; `.mk-bar` ahora
     es un toolbar real de producto (título a la izquierda vía `.mk-bar-title`, badge de estado a
     la derecha). Paleta desaturada (avatares planos sin glow de color, barras grises con un solo
     acento navy) — nada de azul/verde neón.
   • **Hero — 3 mockups nuevos que faltaban:** `finanzas` (dashboard CFO: KPIs + barras + insight),
     `aprobaciones` (gauge de margen bajo el mínimo + alerta), `equipo` (roles con avatares). Antes
     esos 3 slugs no tenían hero mockup.
   • **`cobranza-ia` — chat LIBRE sobre el hero (sin card contenedora):** en vez de una card de chat
     encajonada, el mockup es una secuencia de burbujas (`.mk-chatfree`/`.cf-*`) que flotan
     directamente sobre el fondo del hero, con una "product card" del plan de pagos flotando
     también — replica el patrón de Stripe donde la demo vive suelta en el espacio, no en una
     ventana. Animación por pasos (`data-cf="0..4"`) que entra en cascada tipo conversación real.
   • **Bento (las 3 tarjetas por página) — ventanas `.bm-app` completas:** el patrón viejo
     (`.bm-card` chico flotando casi vacío en la esquina) se reemplazó por **UIs completas y densas**
     que llenan la tarjeta: toolbar real + tabla/lista con datos plausibles + footer con total —
     mismo nivel que un screenshot real de producto. Nuevo kit de clases reutilizables en
     `BlockMockup.astro`: `.bm-app`/`.bm-app-bar`/`.bm-app-body`/`.bm-app-foot`, `.bm-g`/`.bm-g5`
     (grids de tabla), `.bm-kv` (fila key-value), `.bm-tg-*` (tags de estado), `.bm-steps` (timeline
     vertical), `.bm-cc`/`.bm-cc-b` (chat), `.bm-bars2` (bar chart), `.bm-stat`/`.bm-2col`,
     `.bm-code` (bloque monospace). Los **33 mockups** (11 páginas de producto × 3 bloques) fueron
     reescritos con este patrón — editor, link-público, seguimiento, cfdi, clientes-crédito,
     cobranza-ia, divisas, internacional, finanzas, aprobaciones, equipo, negociación.
   • **Bento — CSS scopeado con `:has()`:** el override que hace que la ventana llene el ancho y
     sangre por abajo (`.pp-bcard-visual .bm-wrap:has(.bm-app)`) solo aplica a los mockups NUEVOS;
     el comportamiento viejo (`.bm-card` chico con peek al fondo) se conservó intacto para no romper
     nada que aún no se haya migrado. Regla a futuro: todo mockup nuevo de bento usa `.bm-app`, no
     `.bm-card` suelto.
   • **Limpieza:** se borraron ~330 líneas de animaciones GSAP muertas en `[slug].astro` que
     apuntaban a clases del sistema `.bm-card` viejo (`.bm-matrix-text`, `.bm-term-line`,
     `.bm-credit-fill`, etc.) — una de ellas (`bm-cfdi-m0`) crasheaba en consola (`null.innerHTML`)
     porque el nodo ya no existía. Se reemplazaron por **una sola animación genérica** que hace
     cascada de filas (`.bm-kv`/`.bm-step`/`.bm-cc-b`/`.bm-stat`/`.bm-tot-r`/`.bm-g`) en cualquier
     `.bm-app` del bento; el editor conserva su propia animación de cursor (negociación de precio).
   ⚠️ **Regla de verificación:** estos mockups son CSS/HTML estático — para revisarlos usar
     Playwright headless (GSAP no corre en curl/fetch de HTML crudo) y esperar a que el
     `ScrollTrigger` dispare (`scrollIntoView` + `waitForTimeout`) antes de capturar.

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

✅ **Fondos GLSL (React Three Fiber) en los heroes de Soluciones (jun 2026)** — André entró al
   mundo de shaders/WebGL y reemplazó los fondos CSS estáticos de los heroes de
   `/soluciones/empresas` y `/soluciones/startups` por **shaders animados en R3F**. Stack nuevo:
   `@react-three/fiber` + `three` (ver `package.json`). Patrón compartido de los 3 componentes
   (en `src/components/soluciones/`): `<Canvas orthographic>` con un `planeGeometry args={[2,2]}`
   fullscreen, vertex shader de clip-space (`gl_Position = vec4(position.xy, 0.0, 1.0)`, sin cámara),
   fragment shader con uniforms `u_time`/`u_resolution`/`u_mouse`, `powerPreference:'low-power'`,
   y el canvas montado con **`position:absolute; inset:0; pointerEvents:'none'`** DENTRO del div de
   fondo del hero (NO `fixed`/full-page — vive solo en el hero; los botones siguen clickeables).
   ⚠️ **Siempre `client:only="react"`** (nunca `client:load` — Clerk/Astro SSR → pantalla blanca).
   El mouse se trackea a nivel `window` (no del canvas, que tiene pointer-events none) y se suaviza
   con `Vector2.lerp(target, ~0.05)` en `useFrame` para reacción elástica.
   • **`DarkAuroraBg.jsx`** (hero de **empresas**, modo oscuro) — aurora de fluido tipo Vercel/Linear:
     Simplex Noise 3D (Gustavson) + FBM 4 octavas + doble domain-warp. Paleta: base navy `#0B0F19`,
     **2 auroras** (teal esmeralda `vec3(0,0.29,0.205)` principal + acento índigo `vec3(0.105,0.04,0.25)`
     mínimo). Claves que costó calibrar: el movimiento se ve por **deriva direccional** (`drift1`/`drift2`
     trasladan las coords del ruido en el tiempo → las auroras VIAJAN, no solo se deforman) + breathing
     (`sin()` desfasados por blob). El verde se contiene con `smoothstep(-0.05,0.64)` pero la INTENSIDAD
     la baja el **mix** (`blob1*0.55`), NO el umbral — bajar el umbral lava la pantalla de verde; bajar el
     mix lo deja como glow tenue (esto es lo que André aprobó). El índigo se ancla a la esquina
     inferior-izquierda con un término `corner`. Reacción al mouse: empuje del campo (`mPush`) + halo teal
     (`glow*blob1`, solo intensifica donde ya hay aurora). Tonemap Reinhard `color/(color+0.17)`.
   • **`QuantizedWaveBg.jsx`** (hero de **startups**, modo claro) — "Quantized Gradient Wave": el eje X se
     parte en `bands=80.0` columnas vía `floor()`, formando una onda expansiva (campana de Gauss + senos
     `ripple` + `breathe` autónomo). Para que NO se vean rectángulos: la altura se **interpola entre la
     columna actual y la siguiente** (`mix(waveHeight(cxA), waveHeight(cxB), smoothstep(fpart))`) y el borde
     superior se difumina (`edge=0.045`). Paleta modo claro: fondo blanco puro, barras azul cielo `#cae8fd`
     + verde menta `#ccf1df` (mezcla horizontal por `hueMix`), punta casi blanca. Interacción magnética: el
     pico `peakX` sigue al `u_mouse.x` + `magnet` eleva barras bajo el cursor. **Capas de pulido premium:**
     onda de fondo en parallax (2da capa más pálida/lenta vía `waveHeight(cx, layer)`), glow sobre la cresta,
     shimmer vertical viajero, y **dither anti-banding** (`hash()*0.006` — rompe los escalones de color de los
     gradientes pastel). El `DataScannerBg.jsx` previo quedó obsoleto (reemplazado por este).
   ⚠️ **Regla a futuro:** cualquier fondo shader nuevo en un hero de landing sigue este patrón
   (`<Canvas>` absoluto dentro del hero, `client:only`, mouse por window+lerp, `pointer-events:none`).

✅ **`GreenRampShader.jsx` — hero shader de Casos de Uso / Agencias (jun 2026)** — `/casos-de-uso/agencias`
   tenía un mockup flotante estático en el hero; se reemplazó por un shader R3F de fondo. ⚠️ Nota de doc
   drift: las entradas de abajo ("Shaders GLSL extendidos…") ya referenciaban `GreenRampShader`/`RampShader`
   como si existieran, pero los archivos NO estaban en el repo — este es el `GreenRampShader.jsx` real.
   • **`src/components/soluciones/GreenRampShader.jsx`** — "Green Ramp" modo claro Quiet Luxury: barras
     verticales SÓLIDAS cuantizadas (`floor(uv.x * 13.0)` → corte limpio *stepped*, SIN lerp horizontal
     entre barras, a diferencia de `QuantizedWaveBg`). La altura crece en diagonal izq→der (`mix(0.16,0.82,cx)`),
     respira lentísimo (`u_time*0.18`, dos senos desfasados = ecualizador pesado), y reacciona magnéticamente
     al cursor (`exp(-mDist²*90)` eleva+ilumina 1-2 barras bajo el mouse; el regreso elástico lo da el
     `lerp(target,0.05)` sobre `u_mouse` en JS). Paleta: blanco puro de fondo + verde salvia `vec3(0.776,0.871,0.808)`
     en la base → menta `vec3(0.886,0.953,0.910)` → blanco arriba (se desvanece). Dither anti-banding. Sin luces,
     `shaderMaterial` crudo, `planeGeometry [2,2]` fullscreen, `powerPreference:'low-power'`. Mismo patrón R3F
     que los otros heroes (`<Canvas>` orthographic absoluto dentro del hero, `client:only="react"`,
     `pointer-events:none`, mouse por window+lerp).
   • **`agencias.astro`**: se MONTÓ el shader en `.uc-hero-bg` (`absolute inset:0`, NO `fixed` full-page —
     regla del proyecto: vive solo en el hero) con un `::after` de fade blanco (gradiente 105°) para
     legibilidad del texto. Se ELIMINÓ el mockup (`.uc-hero-visual` + todo su CSS `.uc-mockup-*`/`.mock-*`),
     el corte diagonal `::before`, y el tween GSAP `.reveal-mockup` huérfano. El hero ahora ocupa
     `min-height:100dvh` (`display:flex; align-items:center`) → al recargar solo se ve el hero, el resto
     baja al scrollear. Texto alineado a la izquierda (`max-width:640px`). Botones reestilizados al patrón
     de `soluciones/startups`: primario navy pill (`padding:18px 38px`, flecha que desliza + `.btn-shimmer`
     que cruza en hover, transiciones `cubic-bezier(0.16,1,0.3,1)`) y ghost = píldora con borde translúcido
     (antes era link de texto plano). El primario se dejó navy (no blanco como startups) por el fondo blanco.

✅ **Shaders GLSL extendidos: aurora en tarjetas + Ramp parametrizado en Casos de Uso (jun 2026)** —
   continuación del track de shaders, ahora reutilizables:
   • **`CardAuroraBg.jsx`** — la MISMA aurora del hero de empresas (`DarkAuroraBg`: Simplex 3D + FBM
     + domain-warp, teal esmeralda + acento índigo) empacada para vivir DENTRO de una tarjeta oscura
     (`absolute inset:0` bajo el contenido, `z-index:1`). El cursor se mide RELATIVO al canvas de cada
     tarjeta (`getBoundingClientRect`), pausa el render fuera de viewport (`IntersectionObserver`,
     `frameloop` `always`↔`never`), `dpr={1}` y `prefers-reduced-motion → null`. El teal va un pelín más
     presente que el hero (mix `0.62` vs `0.55`) porque es el foco de la tarjeta.
   • ✅ **CABLEADO REAL en `/soluciones/empresas` (jun 2026, doc-drift corregido):** las 6 tarjetas de
     **"Capacidades Core"** y **"Herramientas Avanzadas"** (`.stripe-fg-card.aurora-card`) SEGUÍAN siendo
     blancas con la aurora FALSA de CSS (`.aurora-card-layer` = `radial-gradient` + RAF que lerpeaba
     `--ax/--ay/...`) — la entrada vieja describía `CardAuroraBg` como ya aplicado pero NO lo estaba.
     Ahora sí: se reemplazaron los 4 marcadores `<div class="aurora-card-layer">` por
     `<CardAuroraBg client:only="react" />`, las tarjetas se re-estilizaron a **modo oscuro como el hero**
     (fondo `#0b0f19` para evitar flash antes del fade-in del canvas, título blanco, desc
     `rgba(226,232,240,0.72)`, tags de vidrio con `backdrop-filter`), y se borró el bloque JS de tracking
     CSS (obsoleto) + las reglas `.aurora-card-layer`/`@keyframes aurora-card-breathe`. Los mockups
     `cmk-*` (screenshots blancos) quedan como capturas recortadas estilo Stripe sobre la tarjeta oscura.
     ⚠️ Ahora hay **7 contextos WebGL** en la página (1 hero + 6 tarjetas); el IntersectionObserver
     mantiene activas solo las visibles. **`/soluciones/startups` AÚN usa la aurora CSS** (`.aurora-card`
     con overlay `.aurora-card-layer`, ver entrada "Mockups premium `imk-*`" abajo) — NO migrada a
     `CardAuroraBg` todavía.
   • **`RampShader.jsx`** — versión PARAMETRIZADA del `GreenRampShader` de agencias: el mismo motor de
     barras verticales cuantizadas (`floor`, corte limpio sin lerp horizontal) pero con la paleta de las
     barras por **uniforms** (`u_base` abajo · `u_top` arriba) y un prop **`variant`** que selecciona entre
     `green | blue | azure | purple` (mapa `PALETTES` en RGB 0..1). Un solo componente sirve a varias
     páginas sin duplicar el GLSL. Se replicó el hero shader full-bleed de **agencias** (fondo absoluto
     `.uc-hero-bg` + shader `client:only` + `.uc-hero-inner` izq. + fade `::after` de legibilidad, 100dvh,
     botones píldora con shimmer) a las 3 páginas de Casos de Uso, cada una con su color: **`/casos-de-uso/saas`**
     = `blue` (cielo suave), **`/casos-de-uso/comercializadoras`** = `azure` (azul más fuerte),
     **`/casos-de-uso/software-factory`** (dev teams) = `purple` (lila). Se eliminó el hero Stripe de 2
     columnas (mockup window + eyebrow "Stripe para…") de esas 3 páginas — sin badges sobre el título.
   • **Mejoras "pro" al Ramp** (sobre el green original, aplican a todas las variantes): cordillera de
     **parallax de fondo** (banda distinta `bandsB=8` vs `bands=13`, más pálida y baja → profundidad),
     **glow de cresta** (bloom de color sobre los topes, más intenso bajo el cursor), **specular de 1px**
     en el borde superior de cada barra, **shimmer viajero** horizontal sobre las crestas, respiración
     senoidal desfasada y **dither anti-banding**. Todo en el fragment shader (sin coste JS extra).
   ⚠️ El `GreenRampShader.jsx` original (hero de agencias) queda intacto; `RampShader.jsx` es la base
   reusable a futuro — para un hero/tarjeta nuevo con barras, importar `RampShader` con su `variant`,
   NO duplicar el shader. Para auroras en tarjetas, usar `CardAuroraBg` (no overlays CSS).

✅ **Auditoría de páginas Soluciones (Empresas/Startups) + form de Contacto real (jun 2026)** —
   André pidió revisar las páginas nuevas `/soluciones/empresas` y `/soluciones/startups` (ES+EN),
   verificar links y que TODO el copy sea verdad ("no inventes nada"). Hallazgos y arreglos:
   • **Form de Contacto de ventas CABLEADO (era cosmético):** `/contacto/ventas` solo simulaba el
     envío (`// Simular envío de datos`) → cada lead se PERDÍA. Ahora postea a **`/api/contacto/ventas.ts`**
     (nuevo, `prerender=false`) que manda 2 correos vía el helper `sendEmail` de `src/lib/email.ts`:
     (1) el lead completo al equipo de ventas (reply-to = prospecto), (2) auto-ack al prospecto.
     Honeypot anti-spam (`website`). Nueva env opcional **`SALES_EMAIL`** (default `hola@flouvia.com`);
     gated por `RESEND_API_KEY` (sin ella responde ok igual, `emailed:false`). El submit en
     `ventas.astro` ahora hace fetch real + valida + deshabilita botón + avisa si falla.
   • **Rediseño premium `/contacto/ventas` (jun 2026):** split-panel layout — 38% panel izquierdo
     navy sticky con **`PriceAuroraBg` WebGL** (mismo shader de aurora azul eléctrico de `/precios`)
     + dots mesh flotante, logo blanco, headline, 3 value props y métricas strip; 62% panel derecho
     blanco con **wizard de 4 pasos** con chips premium (pill 999px). Pasos: (0) email hero,
     (1) datos + industria chips, (2) equipo/volumen/herramienta chips, (3) retos multi-select
     + timeline + textarea opcional. Transiciones GSAP direction-aware + checkmark SVG animado al
     éxito. API actualiza: 6 nuevos campos de calificación (industry, teamSize, monthlyQuotes,
     currentTool, challenges, timeline); asunto con "URGENTE" si timeline=urgente. Wrapper EN en
     `/en/contacto/ventas.astro`. Nav y footer ocultos con `body:has(.vs-layout)`. CSS prefix `vs-*`.
   • **Claims FALSOS corregidos a la realidad** (en ambas páginas + `src/lib/solucion.ts`/`.en.ts`):
     "Librerías oficiales Node/Python/PHP" (no hay SDKs) → **Cord Elements** (Web Component+React+Vue);
     "+5,000 aplicaciones / Zapier nativo" → "webhooks que conectas a Zapier/Make/n8n"; eventos de
     webhook `payment.succeeded`/`invoice.created` (estilo Stripe, falsos) → **`quote.paid`/`quote.approved`**
     reales; terminal "SAP NetWeaver + `/api/v1/erp/invoices`" (conector ERP inexistente) → flujo de
     **webhooks reales** (`cord webhooks listen` → `POST https://tu-erp.com/webhooks/cord`); "Cifrado
     End-to-End" → "cifrado en reposo (AES-256) y tránsito (TLS)"; "CFDI directamente con la API" →
     "crea cotizaciones/clientes/cobranza con la API REST"; y en los datos: **"SSO & SAML con Okta/Azure"**
     (SSO está "Próximamente", no conectado) → **"Registro de auditoría"** (sí existe), y la
     "Sincronización ERP nativa con Salesforce/SAP" de steps/pillars/bullets/FAQs → reframe a API/webhooks.
   • **Links rotos (404) arreglados:** navbar `/soluciones` (no hay índice) → `/soluciones/empresas`;
     `/producto/cotizaciones`→`editor`, `/producto/pagos`→`link-publico`, `/producto/cobranza`→`cobranza-ia`;
     `/desarrolladores/{sdks,webhooks,integraciones}`→`/desarrolladores/api` o `/elements`;
     `/docs`→`/desarrolladores/api`; `/comunidad`→`/soporte`. Los `href="#"` de los **pillars** ahora
     usan un campo nuevo **`href`** en el modelo `Solution.pillars` (apuntan a páginas reales). Los 4
     `useCases` del EN apuntaban a `/producto/*` rotos → corregidos a `/casos-de-uso/*` (como el ES);
     `interlink` `/producto/api` → `/desarrolladores/api`. ⚠️ **Regla:** las páginas de soluciones
     son standalone (`empresas.astro`/`startups.astro` + wrappers `/en/...` que pasan `isEn`); NO hay
     `/soluciones` index ni `[slug].astro`. Validar links data-driven (`uc.link`, `p.href`, interlink),
     no solo los `href="..."` literales. Los `href="#"` restantes son chrome de mockups (no navegación).

✅ **Kit de mockups `cmk-*` + patrón screenshot-bleed (jun 2026)** — auditoría de las páginas
   `/soluciones/empresas` y `/soluciones/startups` reveló que sus mockups usaban tarjetas flotantes
   genéricas ("card-dentro-de-card"). Se reescribieron TODOS los 12 mockups (6 por página: 3 "core"
   + 3 "advanced") con el patrón de **calca realista estilo Stripe**:
   • **`src/styles/mockups.css`** (NUEVA) — hoja compartida con prefijo `cmk-*` para no colisionar
     con `bm-*`/`sbm-*`. Clases clave: `cmk-stage` (`position:absolute; inset:0` — llena la celda
     visual), `cmk-shot` (`width: max(520px, calc(100%+56px)); bottom:-40px` — sobresale y sangra
     por derecha/abajo; el padre `.stripe-fg-card { overflow:hidden }` lo recorta), `cmk-nav`,
     `cmk-th`/`cmk-tr`, `cmk-badge` (variantes green/blue/gray/amber/red), `cmk-kpis`, `cmk-bars`,
     `cmk-kv`, `cmk-toggle`, `cmk-rule`/`cmk-tok` (motor de reglas), `cmk-seal` (SHA-256),
     `cmk-fx` (ticket multi-divisa), `cmk-chrome` (browser frame), `cmk-alert`.
   • **Bug crítico de div duplicado:** ambas páginas tenían `<div class="stripe-fg-card-visual">`
     DOS veces seguidas (abre sin cerrar + vuelve a abrir). Como `cmk-stage` es `position:absolute`,
     el div interno colapsaba a ~0px de ancho → todo el contenido se estrujaba a 1-2 caracteres
     de ancho. Eliminado el duplicado en `empresas.astro` y `startups.astro`.
   • **Mockups reescritos con datos reales y densos** (tabla de cotizaciones con folio/cliente/total/
     estado, portal público con browser chrome + total hero + CTA, CFDI 4.0 con UUID/RFC/timestamp,
     motor de reglas con tokens SI/Y/ENTONCES, analítica con KPIs + bar chart, ticket FX USD→MXN,
     editor con margen por línea + alerta de aprobación, log de webhooks con eventos reales, sello
     SHA-256 + RBAC con roles Admin/Vendedor + audit log).
   • **`MOCKUP_STANDARDS.md` reescrito** desde cero: ya no menciona Tailwind ni "contenedores macOS".
     Nuevo estándar: CSS vanilla `cmk-*`/`bm-*`, realismo > minimalismo, tablas densas, superficie
     blanca sólida, sombras compuestas, skeletons solo para periferia, patrón bleed documentado.
   • **`src/lib/solucion.ts` actualizado:** tipo `pillars` recibe campo opcional `href`; se enlazaron
     todas las páginas de producto reales (`/producto/aprobaciones`, `/desarrolladores/api`, etc.).
   ⚠️ **Regla de construcción de mockups para estas páginas:** importar
     `../../styles/mockups.css` en el frontmatter; usar `cmk-stage` + `cmk-shot` dentro del
     `<div class="stripe-fg-card-visual">`; NO anidar dos `stripe-fg-card-visual` seguidos.

✅ **Core loop: la IA como puerta de entrada del editor (jun 2026)** — track de "core loop mágico".
   En `/app/cotizaciones/nueva` el bloque "Armar con IA" (que ya iba primero pero se veía secundario:
   caja de borde punteado) se elevó a un **hero navy premium** (gradiente `#0d2038→#0a192f` + glow azul,
   estilo del card de salud de Ajustes): título "Arma la cotización con IA — la forma más rápida",
   textarea translúcida sobre el navy, botón blanco sólido prominente, y un divisor **"o créala
   manualmente"** antes del Paso 1. Así el camino con IA (pega el pedido del cliente → empareja tu
   catálogo) se lee como EL camino primario y los pasos manuales como alternativa. Se cambió el emoji
   `✦` por un **SVG de sparkle** (regla: NADA de emojis; las banderas 🇲🇽🇺🇸🇪🇺 del selector de divisa
   siguen siendo la excepción aprobada). Sin cambios al backend `ai-draft` ni a la lógica.

⬜ **PENDIENTES PRIORIZADOS — UX + Landing (jun 2026)** — la hoja de ruta para "la mejor app":

   **Track UX / core loop (3 cosas):**
   1. ✅ **Onboarding con cotización de ejemplo (COMPLETADO)** — Revivir el seed inicial (vía webhook de clerk o `src/lib/onboarding.ts` + `/api/onboarding/seed`, hoy código muerto) para que la primera pantalla NO esté vacía; + tour de 60s cuyo aha-moment es ver el badge "Vista" encenderse. Auto-descartar al completar `getSetupProgress()`. ⚠️ Toca datos → hacerlo con cuidado (marcar la demo como borrable).
   2. ✅ **Reforzar los puntos de entrada al flujo IA (COMPLETADO)** — "Nueva cotización" de la lista, el
      menú "Crear" y el quick-add ahora dicen "✨ Armar con IA" para invitar al editor nuevo.
   3. ✅ **Pulido fino del drawer móvil (COMPLETADO)** — ya hereda `NAV_GROUPS` (Mi dinero/Inteligencia); falta pasada de espaciados/tap-targets y que las tabs de sección se sientan nativas en celular.

   **Track Landing — que represente TODO lo nuevo:**
   Inventario actual: `/producto/*` (editor·link-publico·seguimiento·cfdi·clientes-credito·cobranza-ia·divisas·internacional·finanzas·aprobaciones·equipo), `/soluciones/*`, `/desarrolladores/*`.

   ✅ **FIX de inconsistencias (COMPLETADO):**
     - El **megamenú MÓVIL** de `Nav.astro` (bloques `m-sub`) actualizado (se agregaron `divisas`, `internacional`, `finanzas`, `aprobaciones`, `equipo`).
     - Copy de **`/desarrolladores/mcp`** actualizado a "MCP bidireccional + gobernanza de agentes".
   ✅ **Rediseño del Megamenú y Footer (COMPLETADO):**
     - Se subdividió el menú de "Productos" (tanto en Nav.astro desktop/móvil como en Footer.astro) en 3 categorías claras: *Flujo de Ventas*, *Pagos y Finanzas* y *Facturación y Operación*.
     - Se subdividió el menú de "Desarrolladores" (*Herramientas y Plataforma*) y de "Recursos" (*Ayuda y Contacto*) en `Nav.astro` y `Footer.astro` para mantener la misma jerarquía.
     - Se añadió el enlace **Contacto a ventas** dentro de la sección Recursos/Ayuda en la navegación y footer.
     - Se actualizaron los iconos SVG de "Casos de Uso" a un nivel premium (duotone line + fill opacity 0.1) para mejorar la estética visual y alinearse al diseño SaaS moderno.
   ✅ **Páginas nuevas de /producto (COMPLETADO):**
     - **`/producto/finanzas`** — "Tu CFO con IA" y dashboards (mockups y copy añadidos a `producto.ts` y `BlockMockup.astro`).
     - **`/producto/aprobaciones`** — Control de márgenes, auditor silencioso, flujos gerenciales.
     - **`/producto/equipo`** — Directorio B2B, cambio rápido de orgs, SSO.
     - **`/producto/negociacion`** — versiones inmutables, aprobación por línea, firma SHA-256.
   ✅ **Home index (COMPLETADO):**
     El bento grid en `Features.astro` se actualizó para incluir las "4 magias" de Cord.
   ✅ **Advanced Features "Full Canvas" (COMPLETADO):**
     La sección `AdvancedFeatures.astro` en la Landing se reescribió a un estándar "top-tier motion graphics" estilo Notion. Se eliminaron las cajas anidadas. Los 4 paneles ahora son lienzos absolutos edge-to-edge: (1) **IA:** Command bar tipo terminal + widget de cotización. (2) **Cobranza:** UI de CRM en tiempo real + widget de pago Stripe. (3) **CFO Dashboard:** Gráficas de barra dobles con meta operativa y tooltips interactivos B2B. (4) **Multi-divisa (FX):** Trade ticket institucional USD/MXN con tasa Banxico asegurada.
     ✅ **Mejora del Demo Público de Cotización (COMPLETADO):**
      Se actualizó la ruta `/q/demo` para mostrar datos reales y complejos ("Mi negocio" vs "Desarrollos Inmobiliarios Polanco"). Se configuró con estado `viewed` y vigencia de 2 días para encender y presumir todas las funciones interactivas: chat general, chat por concepto, exclusión de partidas, tags de urgencia, banner de validez legal y botones de contacto integrados.
   ✅ **Soluciones y Desarrolladores (COMPLETADO):**
     Se enriqueció la vertical de "Distribuidoras" con mockups de finanzas y aprobaciones (piloto pendiente de validación narrativa para las demás industrias y verticales nuevas). Se agregaron las páginas de `/desarrolladores` para **Multi-divisa FX** y **Fiscal internacional**.
     • **Rediseño Hero Soluciones (Stripe Enterprise):** Se reescribió por completo el hero de `/soluciones/[slug]` para lograr una estética "Quiet Luxury / Stripe Enterprise". Se eliminaron los mockups flotantes y el eyebrow "PARA EMPRESAS" a favor de un texto central masivo en blanco sobre un fondo oscuro con efecto "Aurora Mesh" y un "sweep" sutil animado. Los botones se ajustaron (btn-luxe blanco y btn-ghost con transparencia) para respetar la directiva de diseño premium, sobrio y sin grids.
     • **Rediseño Integraciones Startups (Stripe Enterprise):** Se actualizaron las tarjetas de integraciones (Cotizador Visual, Zapier, Webhooks, API, SDKs) en `/soluciones/startups`. Se reemplazaron gráficos abstractos y código fuente crudo por **mockups UI fotorealistas y minimalistas** de alta fidelidad (estilo Apple/Stripe), incluyendo dashboards de rendimiento de API, registros limpios de Webhooks y UI drag-and-drop.
     • **Refinamiento Hero & Navbar (jun 2026):** Se añadió soporte de `darkHero` en `Nav.astro` para cambiar dinámicamente el logo de la barra superior a blanco antes de hacer scroll (activo en la página `empresas`). El hero ahora ocupa el 100% de la pantalla inicial (`100dvh`), con alineación a la izquierda (left-aligned), tamaño de fuente estandarizado a la escala global de Cord (`clamp(2.4rem...)`) y elementos siempre visibles sin retardo de scroll.
   • **Soluciones (menor prioridad):** evaluar 1-2 verticales nuevas solo si hay narrativa real.
   • **Regla de construcción:** toda página nueva de producto usa la plantilla de `/producto/[slug]`
     (contenido en `producto.ts`, hero mockup en `[slug].astro`, block mockups en `BlockMockup.astro`),
     animada con `PageAnims` (settle, masked-titles, reveals) — SIN exploded-view/tilt/partículas/flip.
     Cablear cada una en el megamenú de `Nav.astro` (**desktop Y móvil**) y en `Footer.astro`. Versión EN
     en `producto.en.ts` + `/en/producto/[slug]`.

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

✅ **Auditoría y reescritura de exactitud de Soporte/Blog/Roadmap (jun 2026)** — André pidió revisar
   que el contenido dijera la verdad. Hallazgo: buena parte de Soporte documentaba una **API/SDK y
   features ficticias estilo Stripe** que Cord NO tiene. Se reescribieron 45 archivos (ES+EN):
   • **API/SDK real:** los artículos de Desarrolladores citaban un SDK inexistente (`cord-node`/
     `@flouviamx/cord`/`@cord/*`), montos en **centavos**, `customer_id`/`line_items`/`hosted_url`,
     `/v1/charges`, `/v1/invoices`, formato de error anidado y rate-limits "100 req/s". Se reescribieron
     contra la API REAL: `cordhq.app/api/v1`, Bearer `sk_test_`/`sk_live_`, montos en **pesos**,
     endpoints reales (`me`/`cotizaciones`/`clientes`/`productos`/`cobranza`), error plano `{error,code}`,
     y rate-limit real (~500/min por IP, ventana de 60s; el público v1 solo tiene el piso global del
     middleware). No hay SDK oficial → `node-sdk` ahora enseña REST con `fetch`; `react-sdk` apunta al
     paquete REAL `@flouviahq/elements`.
   • **Webhooks:** los artículos citaban eventos de Stripe (`charge.succeeded`, `invoice.created`) y
     header `Cord-Signature` con timestamp. Corregido a los eventos REALES (`quote.sent/viewed/approved/
     rejected/paid/invoiced`) y la firma REAL: `X-Cord-Signature: sha256=<hmac del cuerpo crudo>` (+
     `X-Cord-Event`), sin timestamp.
   • **Suscripciones/planes:** `planes-suscripcion` describía un "motor de suscripciones" inexistente;
     reescrito a los planes reales (MXN en ES, USD en EN) + Customer Portal. `facturacion-anual`: "ahorra
     20%" → "2 meses gratis" (anual = 10 meses). Se quitó el "sandbox aislado" (no existe: las llaves
     test no aíslan datos, solo no cuentan para facturación). `primeros-pasos`: quitados pasos
     inexistentes ("Cobranza > Métodos de Pago"/"Links de Pago").
   • **Roadmap** (`src/lib/roadmap-data.ts`): estados falsos corregidos — `validacion-constancia`
     `live`→`next` (OCR/EFOS no existen), `facturacion-internacional` `beta`→`next` (provider US es
     stub), `cobranza-ia` `next`→`beta` (sí está implementado), y se quitó la promesa de REP automático
     en `cfdi-automatico` (no implementado).
   • **Bug menor real:** se corrigieron 2 artículos huérfanos (`primeros-pasos`/`glosario-terminos`
     tenían `category: "Cuenta"`/`"Account"` en vez de `"Cuenta y Equipo"`/`"Account & Team"` → no
     aparecían en su categoría del hub). **El Blog quedó intacto: está correcto.**

✅ **Hero del Centro de Ayuda — aurora azul GLSL + dark mode compacto (jun 2026)** —
   `SupportHero.astro` rediseñado a estilo ElevenLabs: hero oscuro compacto (`padding: 7rem 5% 3.5rem`)
   con shader de fondo, barra de búsqueda en glassmorphism y sin sección de búsquedas populares.
   • **`src/components/support/BlueAuroraBg.jsx`** — nuevo shader R3F exclusivo del Centro de Ayuda.
     Paleta oceánica: base navy `#0A0F1C`, teal profundo `#004F4F` (dominante, izquierda como ElevenLabs),
     cobalto `#0D1E61` (centro-derecha), cyan sutil que sigue al cursor. Diferencias técnicas clave
     respecto a `DarkAuroraBg`: escala UV `0.42` (blobs 2× más grandes y atmosféricos), solo 3 octavas
     de FBM (más suave), `smoothstep(-0.30, 0.55)` (bordes difusos vs los cortes del teal original),
     fade oscuro en la parte superior (`topFade` — zona del navbar más oscura), y **grano de película
     doble capa** (estática + animada a ~24fps, intensidad `0.020`). Movimiento autónomo lento (`t*0.40`,
     lerp `0.03`) para móvil. `client:only="react"`, `pointer-events:none`, `powerPreference:'low-power'`.
   • **Dropdown claro:** `background:#ffffff`, `z-index:9999`, `overflow-y: visible` en el hero
     (`overflow-x: clip`) para que el dropdown no quede cortado por el contenedor oscuro.
   ⚠️ **Regla:** para el hero de soporte (dark compacto + aurora), usar `BlueAuroraBg` (NOT
     `DarkAuroraBg` — esa es de empresas/teal). Para heroes de landing: patrones en `src/components/soluciones/`.

✅ **Internacionalización del Centro de Ayuda (Support Center) (jun 2026)** — Se añadió soporte bilingüe (`/soporte` y `/en/support`).
   • **Arquitectura y Artículos:** Se crearon wrappers en `src/pages/en/support` que re-utilizan los templates de español pasando la bandera `isEn`. Los 66 artículos base en `src/content/support/en/` fueron **completamente traducidos al inglés B2B profesional** (retirando emojis y ajustando todos los enlaces internos). El build genera 132 rutas estáticas sin error.
   • **Componentes Dinámicos:** Los componentes `SupportHero`, `SupportCards`, `SupportSearch` y `FeedbackWidget` ahora tienen copys estáticos en ambos idiomas y renderizan dinámicamente según la ruta.
   • **Selector de Idioma Transparente:** Se parcheó `utils.ts` para mapear limpiamente `/soporte/categoria/` a `/support/category/`. Además, para resolver la recarga de página al cambiar de idioma en Astro sin romper todos los scripts atados a `DOMContentLoaded` (que ocurriría usando `<ClientRouter />`), se inyectó un parche en `Nav.astro` que utiliza `sessionStorage` para guardar y restaurar la posición exacta del *scroll* al vuelo, logrando una ilusión óptica de cambio instantáneo de idioma sin perder el lugar de lectura.


✅ **Block-mockups de Soluciones reescritos a motion-graphics (jun 2026)** — `SolucionBlockMockup.astro`
   (los 3 mockups por industria que acompañan a los bloques de texto en `/soluciones/[slug]`) estaba muy por
   debajo del nivel de los de producto: cards casi vacías, scrub atado al scroll (deprecado en estas páginas) y
   hasta un emoji `👆` (prohibido). Se reescribió COMPLETO al lenguaje de los mockups de producto/index:
   • **Componente** = base CSS compartida (cards navy con gradiente, floating pills, push notifications estilo
     iOS, cursor falso SVG —NUNCA emoji—, badges, `.editorial` monospace) + 12 mockups con clases prefijadas
     `sbm-<ind>-mN` (`dist`/`const`/`manu`/`serv`). Cada uno cuenta una micro-historia que EXPLICA su copy:
     distribuidoras (cursor negocia precio por línea con count-up y chip −12% · búsqueda de catálogo que teclea
     y agrega SKU · términos Net 30 + barra de crédito + push de pago), construcción (cursor edita cantidad y
     subtotal/IVA/total recalculan con flash verde · barra de crédito que avisa al rebasar límite · push
     "aprobó desde la obra" → timeline → sello CFDI 4.0), manufactura (línea libre que despliega la spec del
     lote · historial del cliente con count-up por corrida · sello de evidencia + CFDI sin recapturar),
     servicios (header que se reviste del color de marca + adiós "Powered by Cord" · push de apertura +
     contador de vistas + estado que avanza · cursor que aprueba → anillo de éxito → anticipo pagado Stripe).
   • **Animación** en el `<script>` de `soluciones/[slug].astro` (reemplazó el bloque de scrub viejo): reveal
     de entrada genérico (`.sbm-card` sube con fade) + 12 timelines GSAP que cuentan la historia con loops
     `repeat:-1` y/o `ScrollTrigger {once:true}` (NUNCA scrub-on-drag), todo bajo guard `!reduced`. El HTML por
     defecto queda en estado FINAL → con `prefers-reduced-motion` se ve completo y correcto.
   • **Regla a futuro:** todo loop-starter usa `ScrollTrigger {once:true}` para no apilar timelines al re-entrar
     en viewport; para teñir una barra con `background: gradient` se anima `background` (gradiente), NO
     `backgroundColor` (el gradiente opaco lo taparía); los overlays transitorios (push/pago) van con
     `opacity:0` por defecto en CSS para que el estado estático de reduced-motion sea limpio.
   El hero mockup de cada industria (inline en `[slug].astro`) NO se tocó (ya animaba con el "settle" de PageAnims).
   • **Paridad estética con producto (follow-up):** tras una revisión se identificaron 4 diferencias CSS vs
     `BlockMockup.astro`: (1) sombra de card — ahora 3 capas (`0 2px 4px` + `0 28px 56px -14px` + `inset 0 1px 0`);
     (2) floating pills — `filter: drop-shadow(0 10px 20px rgba(0,0,0,0.4))` + offsets `top/right: -18px/-14px`
     (se usa offset en vez de `transform: translate()` para que las animaciones GSAP de `y`/`scale` no pisen el
     transform); (3) dots de color — `box-shadow: 0 0 7px rgba(color,0.7)` para glow visible; (4) pills — fondo
     sólido `#0f172a` (no semi-transparente). El glow ambiental (`.sbm-glow`) pasó a núcleo azul
     `rgba(59,130,246,0.12)` + navy para dar profundidad. Resultado: idénticos a los de producto a nivel CSS.

✅ **FAQ unificada — componente `FaqAccordion.astro` (jun 2026)** — las 5 secciones de FAQ del
   sitio tenían 3 implementaciones distintas (`pr-faq-*` en Faq.astro y precios; `pp-faq-*` en
   producto/[slug]; `stripe-faq-*` en empresas y startups) con comportamientos distintos
   (`<details>` nativo en 4 casos, `<button>` JS en 1) y estilos inconsistentes. Se consolidaron
   en un único componente `src/components/landing/FaqAccordion.astro`:
   • **Diseño Apple/Stripe/Linear/ElevenLabs:** ícono circular `34×34px` con ring `1px` sutil
     que pasa de gris a navy al abrir, conteniendo un `+` SVG cuya línea vertical hace `scaleY(0)`
     con spring para convertirse en `−`. Hairline `border-top` en la lista + `border-bottom` por item.
   • **Animación via CSS grid trick:** `grid-template-rows: 0fr → 1fr` para altura suave sin
     medir alturas con JS. Respuesta con `opacity + translateY(-5px → 0)` y delay 80ms.
   • **One-at-a-time por lista:** el JS agrupa items por `.faq-acc-list` padre → múltiples
     instancias coexisten en la misma página sin conflicto.
   • **Accesibilidad completa:** `aria-expanded`, `aria-controls`, `role="region"`,
     `aria-labelledby`, `focus-visible`. Respeta `prefers-reduced-motion`.
   • **Props:** `faqs`, `eyebrow?`, `title?` (HTML), `id` (para IDs únicos), `class?`,
     `maxWidth?` (default `780px`). El título siempre lleva clase `masked-title`.
   • **Padding por página** vía `:global(.mi-clase)` en cada caller — el componente tiene
     `5rem 5%` de default; precios usa `4rem 5% 8rem`, producto `5rem 5% 3rem`, soluciones
     `5rem 5% 7rem`.
   • **Centro de Ayuda unificado (jul 2026):** el FAQ de `SupportCards.astro` (que usaba
     `<details>` nativo con prefijo `pr-faq-*`) también migró a `<FaqAccordion id="support"
     class="supp-faq-acc" maxWidth="860px" />`. Override de padding vía `:global(.supp-faq-acc)
     { padding: 4rem 0 }` (la sección vive dentro de `.content-wrapper` que ya tiene el margen
     horizontal). Aplica tanto en `/soporte` (ES) como en `/en/support` (EN) ya que `isEn`
     fluye desde `soporte.astro` → `SupportCards`.
   • **Botones CTA pill+shimmer (jul 2026):** todos los botones de acción en soporte
     (`pcta-button` en `SupportCards`, `cta-button` y `empty-cta` en `[categoria].astro`)
     upgrades a `border-radius: 999px` + efecto shimmer (`::after` que barre de izq a der en
     `:hover`, `linear-gradient(105deg)`) + `scale(0.97)` en `:active`, consistentes con el
     patrón de botones pill en precios y producto.
   ⚠️ **Regla a futuro:** TODO acordeón de FAQ (landing, precios, producto, soluciones, soporte)
     usa `<FaqAccordion>`. NUNCA volver a `<details>` ni a `<button>` ad-hoc para FAQs.
     Los prefijos `pr-faq-*`, `pp-faq-*` y `stripe-faq-*` están eliminados del codebase.
     TODO botón CTA prominente (primario pill) usa `border-radius: 999px` + shimmer `::after`.

✅ **Rediseño Premium B2B del Blog y Microinteracciones (jun 2026)** — Elevando la estética a "Top Top / Quiet Luxury":
   • **TOC Scrollspy Animado (Left Sidebar):** Rediseño ultra-premium del índice flotante. Se usa un track vertical sutil con una píldora indicadora (`toc-indicator`) que navega dinámicamente con transiciones `cubic-bezier`. Los enlaces del índice presentan un elegante micro-desplazamiento lateral (`translateX(4px)`) en hover/activo. Bug crítico solucionado: se removió un `position: relative` en `.toc-container` que rompía el comportamiento global de `position: sticky`.
   • **Botones de Redes Expansivos (Right Sidebar):** La barra de compartir (`.share-pill`) se transformó en botones circulares de `44x44px` que se expanden magnéticamente a `140px` al hacer hover. Se utilizó `position: absolute` para garantizar que el texto interior haga un "fade in" impecable sin moverse físicamente en el DOM. Función de portapapeles en JS con estado de éxito ("¡Copiado!").
   • **Layout Grid Ajustado:** Se forzó un canvas puramente blanco (`#ffffff`) para la vista de artículo, removiendo distracciones. El contenedor principal grid ahora aplica `align-items: flex-start` a las barras laterales para permitirles flotar el 100% de la longitud del contenedor padre (resolviendo colapsos de flex-stretch).

✅ **Blog — Portadas WebGL GLSL + Layout tipo ElevenLabs (jun 2026)** — sustitución completa de las portadas CSS estáticas y reestructuración del layout de `/blog`:
   • **`src/components/blog/BlogCover.jsx`** (`client:only="react"`) — portada dinámica vía WebGL puro (sin Three.js/R3F para reducir overhead con múltiples contextos por página). Motor: FBM de 5 octavas con **domain-warp de 2 capas** (`q` → `r` → `fbm(uv+r)`) produciendo gradientes orgánicos fotográficos. Tonemap Reinhard + dither anti-banding. Props: `category` (paleta), `featured` (tamaños), `title` (overlay de texto). Paletas dark→mid→highlight: `Finanzas` navy→azul→azure, `Ventas B2B` dark-teal→cyan, `Fiscal` forest→emerald→mint, `Tecnología` dark-purple→lavender, `Operaciones` warm-dark→gold.
   • **Mouse parallax** — tracking a nivel `window` (patrón del proyecto; `pointerEvents:'none'` en el canvas). Coords relativas al `wrapRef`. Lerp `0.055` por frame. Móvil: `touchmove` + `deviceorientation` (giroscopio).
   • **IntersectionObserver** — pausa RAF cuando el canvas no está visible. Resume automáticamente. Crítico con 7+ contextos WebGL por página.
   • **Overlay de título** — scrim `linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)`. Texto blanco Inter 700 bottom-left. Featured: `clamp(1.6rem,2.8vw,2.4rem)`. Grid: `clamp(0.88rem,1.4vw,1.05rem)`. Clamp a 3 líneas (`-webkit-line-clamp`).
   • **Watermark de categoría** — ícono SVG a `opacity:0.09` blanco, `position:absolute top-right`, `zIndex:2` (sobre canvas, bajo título). 140px en featured / 90px en grid. Por categoría: `TrendingUp` (Finanzas), target concéntrico (Ventas B2B), `FileText` (Fiscal), código `</>` (Tecnología), barras verticales (Operaciones). Textura subpixel sin competir con el gradient.
   • **`/blog` — Layout ElevenLabs:** eliminados blobs CSS (`.hero-canvas`, `.blob-1/2/3`, `@keyframes float`), `floating-card-wrapper` con truco `margin-bottom:-10rem`, y `blog-sticky-nav` con `margin-top:13rem`.
     – **Header limpio**: `<h1>Blog de Cord</h1>` + "Cord en LinkedIn →" en la misma fila, hairline separator.
     – **Featured full-width**: aspect ratio `21/9`, shader ocupa toda el área, título dentro del gradient bottom-left. Barra inferior compacta: categoría + fecha + avatar + autor + flecha.
     – **Filtros inline**: sin sticky, justo debajo del featured. Pills simples.
     – **Grid compacto**: `minmax(320px,1fr)`, imagen `3/2`, card body solo con fecha + título + "Leer →" (excerpt eliminado).
   ⚠️ **Regla a futuro:** covers del blog = `<BlogCover client:only="react" />`. NUNCA reintroducir `.stripe-cover`, `.gradient-1…5` ni blobs CSS. La página de artículo individual (`/blog/[slug]`) conserva su layout editorial sin cambios.

✅ **Nuevas páginas de Blog y Planes de Soporte (jun 2026)** — rediseño del landing para mejor conversión B2B:
   • **Blog dedicado (`/blog`):** Se eliminó "Cómo funciona" de la navegación global y se reemplazó por la landing del Blog. **Migramos a Astro Content Collections:** los artículos ahora viven como archivos Markdown independientes (`src/content/blog/*.md`) que generan rutas dinámicas (`/blog/[slug]`) con un layout editorial limpio y un Bento Grid de captura de leads al pie.
   • **Página de Cómo Funciona Mejorada:** Se reconstruyó `/como-funciona` con un nuevo hero que incluye un mockup flotante interactivo de aprobación de cotizaciones, y un grid de características clave estilo Stripe.
   • **Planes de Soporte (`/planes-soporte`):** Se migró de tarjetas de precio genéricas a una tabla de SLA técnica detallada que refleja mejor la venta de servicios Enterprise.
✅ **Centro de Ayuda de Clase Mundial (jun 2026)** — rediseño y reescritura masiva de `/soporte`:
   • **Reescritura Manual de 61 Artículos:** Eliminamos TODAS las plantillas genéricas. Se escribieron 61 archivos JSON (inyectados a Markdown) con contenido profundo, real, y específico para B2B. Aclaración clave de negocio: **Cord NO cobra comisiones por transacción**, todo el procesamiento se delega a la llave conectada de Stripe (Payouts, Disputas, FX), y Cord factura el SaaS (excedentes de CFDI/IA).
   • **Buscador Instantáneo (Cmd+K):** Endpoint en `/api/support-search.json` (prerendered) expone el índice. Componente `SupportSearch.astro` con Vanilla JS y `fuse.js`-like filtering inyectado en el nav/hero. Filtra por título y descripción instantáneamente sin recargas. Resolvimos el problema de z-index donde los resultados se ocultaban por debajo usando `:global` scoping.
   • **Navegación UX:** Tabla de Contenidos Automática (`[slug].astro` lee H2/H3 con Scrollspy). Breadcrumbs inyectados dinámicamente y grid de "Artículos Relacionados" leyendo el tag o la categoría actual.
   • **Widget de Feedback:** Botones de pulgar arriba/abajo al final de cada artículo con micro-interacciones. Si seleccionas una opción, el color cambia a verde/rojo para afirmar la acción (no se queda en un hover genérico).
✅ **Estética Quiet Luxury global aplicada (jun 2026)** — limpieza severa de UI a petición de André ("editorial, nada genérico, mucho aire"):
   • **Adiós a las cards (cajas redondeadas con borde y fondo):** Eliminadas del soporte y de listas genéricas. Se reemplazaron por el estilo **Hairline** (divisores sutiles de 1px) o layouts de columnas planas (Airy Bento).
   • **"Airy Bento" en Quick Routes:** El grid de soporte ya no tiene bordes entre celdas; usa gaps enormes (`3rem`) y fondos invisibles que revelan su color primario en hover.
   • **Íconos delgados y estéticos:** Se reemplazaron SVG anchos (stroke 2) por trazos elegantes (stroke 1.2 a 1.5), escalando su tamaño de 24 a 32px para sentirse más técnicos e intencionales.
   • **Globalización del FAQ Nativo:** El `<details>` nativo con estilo hairline usado en Soporte fue portado al 100% de la web (Landing y Precios), eliminando el código JS pesado y las cajas con sombras.

✅ **Navbar móvil — menú premium con acordeones (jun 2026)** — reescritura completa del
   overlay de `Nav.astro` a petición de André ("neta, carbona, estéticamente Cord"):
   • **Antes:** 5 links de texto plano (`Producto · Soluciones · Desarrolladores · Recursos · Precios`).
   • **Ahora:** 4 **acordeones colapsables** (uno abierto a la vez, misma mecánica que el FAQ)
     + 1 link directo para Precios. Cada acordeón expone los sub-items con ícono + título +
     subtítulo — reusando íconos y copys de los megamenús de escritorio → misma profundidad
     de producto en móvil. Expansión `grid-template-rows: 0fr → 1fr` (bulletproof, sin medir alturas).
   • **Fondo:** navy con mesh radial de marca (los mismos orbes `#0a192f/ellipse` de las secciones
     oscuras del sitio) en vez del gris sólido anterior.
   • **Bloque de CTA fijo abajo:** "Entrar" (ghost de vidrio) + "Empezar gratis" (sólido blanco),
     ambos full-width con `data-auth-swap` intacto para el swap Clerk en cliente.
   • Títulos editoriales Inter 700, `letter-spacing: -0.04em`; íconos 38px con borde de vidrio;
     chevron rota 180° al abrir; stagger blur-in en filas y sub-items; `env(safe-area-inset)`
     para notch/home-bar; área de nav scrolleable con pie anclado; estados `:active` táctiles.
   • Respeta `prefers-reduced-motion` (sin clip-path, blur ni transforms). Build verde.

✅ **Mockups de landing pulidos + página "Cobranza con IA" (jun 2026)** — limpieza de
   animaciones de las subpáginas (`/producto/*`, `/soluciones/*`, `/desarrolladores/*`) +
   primera página de las integraciones nuevas:
   • **Animaciones raras ELIMINADAS** (petición de André: "que no se volteen, nada raro"). Se
     quitó el **"exploded view"** del hero (el mockup que rotaba `rotationX:25/rotationY:-15` y
     se reensamblaba con el scroll) en las **3** plantillas → ahora el hero usa el **mismo
     "settle" limpio del index** (lo maneja `PageAnims.astro`: `rotationX:9 → 0` con scrub). Se
     quitaron también: el **tilt-3D-con-cursor** (efecto ya rechazado antes), el **emisor de
     partículas** en `mousemove` (creaba `<div.mk-particle>` huérfanos en `<body>` sin CSS), y la
     **tarjeta flip 180°** de manufactura (la "voltereta") → reemplazada por un mockup de "precio
     por volumen" con reveal escalonado limpio. El **Kanban** que se arrastraba con el scroll
     (scrub) pasó a ser un **loop de motion-graphic** auto-reproducido. **Regla a futuro:** en las
     subpáginas NO reintroducir exploded-view, tilt con cursor, partículas ni flips; los heroes se
     animan SOLO con el settle de `PageAnims`, y los mockups cuentan su historia con loops
     `once`/`repeat:-1` (como el index), respetando `prefers-reduced-motion`.
   • **Heroes de Soluciones ahora son motion graphics** (antes tarjetas estáticas): micro-historia
     por industria dentro del `.pp-mockup` (en el `<script>` de `soluciones/[slug].astro`):
     distribuidoras (precios por cliente que se revelan + chips de descuento con *pop*),
     construcción (materiales + barra de crédito que se llena), manufactura (specs + nota del
     lote), servicios (pulso del botón "Aprobar" + badge "Vista"). Gated por `!reduced`.
   • **Página NUEVA `/producto/cobranza-ia`** ("Cobranza con IA") — vende la cobranza autónoma
     (AR agent) + flujo de caja predictivo, que existían en la app pero no en la landing. Hecha
     sobre la plantilla de `/producto/[slug]`: entrada nueva en `FEATURES` (`src/lib/producto.ts`),
     **hero mockup** `.mk-ar` (el agente negocia un plan de 3 cuotas en vivo: burbujas que entran
     una a una + plan que se revela + "Aprobar" pulsando — JS en el bloque `if(wrap)` de
     `[slug].astro`, hook `#arThread`), y **3 block mockups** en `BlockMockup.astro`
     (`bm-ar-m0/m1/m2`: negociación que cierra, barras de flujo a 90 días, tablero de supervisión
     con estado Negociando→Pagado). Copy fiel a la feature (Scale, hasta 3 cuotas, opt-in, audit
     log) + FAQPage JSON-LD. Cableada en el **megamenú** (`Nav.astro`) y el **footer**
     (`Footer.astro`); aparece sola en los cross-links de las demás páginas de producto.
   ✅ **Páginas de Desarrolladores (COMPLETADO):** páginas de **Multi-divisa FX** y **Fiscal internacional (US/MX)** en `/desarrolladores` con mockups de API interactivos; copy de la página MCP actualizado a **MCP bidireccional + gobernanza de agentes**. Cord Elements ya contaba con sus mockups base.
   • ✅ **npm:** se agregó `"private": true` al `package.json` RAÍZ y se ejecutó `npm unpublish flouvia-cord@0.0.1 --force` para evitar la fuga del código fuente. Además, se re-publicó `@flouviahq/elements` a la versión **0.2.0** desde `packages/elements/`.

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
✅ **Rediseño premium de `/precios` — tarjetas ElevenLabs + aurora viajera (jun 2026)** —
   Reescritura completa de `src/pages/precios.astro` con tres mejoras:
   • **Tarjetas estilo ElevenLabs:** layout card con header visual (`plan-visual`, min-height 168px)
     + body (`plan-body`) separado. `plan-visual` tiene fondo Apple gray `#f5f5f7` uniforme para
     todos los planes. Cada tarjeta incluye un overlay de aurora CSS (`div.plan-aurora-bg` +
     blobs `.pab-b1`/`.pab-b2`): navy `#08152a` + radiales azul eléctrico `rgba(15,99,250,0.6)`
     y azul hielo `rgba(97,183,255,0.38)`, animados con `@keyframes pab-drift1/2` (orgánico,
     9s/13s). Por JS: la clase `aurora-active` viaja entre tarjetas — activa por defecto en el
     plan destacado (Profesional); al hacer `mouseenter` en otra tarjeta la aurora se transfiere
     (`opacity 0.5s`); al salir del `.pr-grid-wrap` regresa al destacado. El texto del header
     cambia a blanco con la misma transición. Sin badges "Más popular" (eliminados).
   • **Calculadora ROI con shader GLSL:** `PriceAuroraBg.jsx` (R3F, `client:only="react"`) — aurora
     azul eléctrico (#0f63fa) + hielo (#61b7ff) sobre navy #08152a, sin grano. Pasos numerados
     + sliders bidireccionales. La card aurora es `position:relative; overflow:hidden; background:#08152a`;
     el canvas es `position:absolute; inset:0; z-index:0`; el contenido va en `.pr-roi-card-inner`
     con `z-index:2`.
   • **Botones pill con shimmer:** TODOS los CTAs (tarjetas + fila `<tfoot>` de tabla comparativa)
     son `border-radius:999px` oscuros (`#111827` → `#0a192f` en hover) con pseudo-elemento `::after`
     que cruza en shimmer (`translateX(-110%→110%)`), `scale(0.97)` en `:active`. La fila de
     comparación siempre dice "Empezar" (ES) / "Get started" (EN) — texto uniforme sin variantes
     "gratis"/"ahora".
   ⚠️ **Regla a futuro:** aurora viajera = clase JS `aurora-active` sobre el `.plan` (un solo
   conjunto de nodos CSS por tarjeta, sin WebGL duplicado). `PriceAuroraBg` solo para el ROI card.
   Botones de precios = siempre oscuros, siempre pill 999px, siempre shimmer.

✅ **Tabla comparativa exhaustiva + precios en USD (jun 2026)** — La tabla de comparación de
   planes (`COMPARATIVA` / `COMPARATIVA_EN`) se expandió de ~20 filas a ~60 features en
   **13 grupos** cubriendo TODAS las funcionalidades de la app: límites del sistema, consumo
   mensual, cotizaciones y editor, experiencia del cliente (link público), inteligencia
   artificial, fiscal y multi-divisa, CRM/analítica, riesgo y tesorería, identidad y marca,
   notificaciones e integraciones, equipo/roles/seguridad, desarrolladores e infraestructura,
   excedentes. La versión en inglés (`src/lib/precios.en.ts`) ahora muestra precios en **USD**
   (Starter $12, Pro $30, Scale $70, Developer $150; excedentes en USD también), y todos los
   labels de moneda en la landing inglesa (`precios.astro`, `ui.ts`) dicen "USD" en lugar de
   "MXN". La calculadora ROI en inglés usa valores y constante PRO en USD. ⚠️ Se eliminó un
   **bloque duplicado** que existía en `precios.astro` (líneas 518-1014: segunda copia
   ES-only pegada por error que hacía que `/precios` renderizara todo dos veces). Ahora hay
   un solo `<Layout>` con `isEn` para las dos variantes. Fuentes: `src/lib/precios.ts` (ES),
   `src/lib/precios.en.ts` (EN), `src/i18n/ui.ts` (labels `pr.cycle.m` / `pr.sub`).
✅ **Landing v2 (jun 2026)** — `/precios` dedicada (toggle anual + comparador + ROI + FAQ),
   `/soluciones/[slug]` por industria (espejo de `/producto/[slug]`), home con DEMO
   INTERACTIVO en el hero (control de 5 pasos), bug del navbar arreglado (el megamenú
   ya no baja logo/botones). Precios centralizados en `src/lib/precios.ts`.
✅ **PDF v2 (jun 2026)** — 3 plantillas (clasico/minimal/detallado), logo subible,
   y PREVIEW EN VIVO en `/app/ajustes`. Nueva columna `orgs.pdf_template`.
✅ **Importar por CSV** — productos y clientes (`/api/productos/import`, `/api/clientes/import`)
   con modal de archivo→mapeo→preview en `/app/productos` y `/app/clientes`.
✅ **Analítica** — `/app/analitica` (ventas/conversión, margen cedido, top clientes/productos)
   + KPI "por dar seguimiento" en el dashboard. Consultas en `getAnalytics()`.
✅ **Duplicar cotización** — `/api/cotizaciones/[id]/duplicate` (clona a nuevo borrador).
✅ **Enviar por WhatsApp** — botón en el detalle (wa.me con mensaje + link pre-armado).
✅ **Cobranza** — `/app/cobranza`: cartera, vencido, aging, exposición por cliente,
   marcar cobrada + recordatorio por WhatsApp. getCobranza() en queries.ts.
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
✅ **Tesorería predictiva + interés moratorio** — en Cobranza: interés compuesto sobre saldo
   vencido (`orgs.interes_moratorio_pct`) y flujo de caja esperado (retraso de pago promedio
   real del historial). En getCobranza().
✅ **Cron de interés moratorio (jun 2026)** — `/api/cron/intereses` (cron en `vercel.json`,
   día 1 de cada mes a las 6am UTC, protegido por `CRON_SECRET`). Para cada org con
   `interes_moratorio_pct > 0`, aplica `saldo × tasa%` a todas las cotizaciones vencidas
   y registra el cargo en tabla **`intereses_moratorios`** (org_id, cotizacion_id, periodo
   'YYYY-MM', tasa_pct, saldo_base, monto, dias_vencido). Idempotente por
   `UNIQUE(cotizacion_id, periodo)`. NO modifica `cotizaciones.total` (preserva original).
   Manda correo-resumen al owner de la org si hay `RESEND_API_KEY`. Cada cargo queda en
   `audit_log` (acción `interes_moratorio.aplicado`). ⚠️ Correr `npm run db:migrate` (1 tabla nueva).
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
✅ **Recordatorios de cobro (Resend)** — `/api/cron/recordatorios` (cron en `vercel.json`,
   diario a las 9am UTC) manda correos 3 días antes del vencimiento vía Resend (REST).
✅ **Correo al enviar cotización (Resend)** — helper `src/lib/email.ts` (`notifyQuoteSent`/
   `sendEmail`); al crear-con-envío (`POST /api/cotizaciones`) o acción send/resend
   (`PATCH /api/cotizaciones/[id]`) se manda el link público al correo del cliente y se
   registra evento `email`. **Gated por `RESEND_API_KEY`**: sin la llave NO se manda nada
   — el link se genera igual. ✅ **En prod (jun 2026):** dominio verificado en Resend y
   `RESEND_API_KEY`/`RESEND_FROM` seteados en Vercel; los correos transaccionales ya salen.
✅ **Pago en línea (Stripe)** — botón en `/q/[token]` → `/api/q/[token]/checkout` (Stripe
   Checkout vía REST) + `/api/stripe/webhook` marca `paid`. Gated por `STRIPE_SECRET_KEY`.
✅ **Navbar con estado de sesión (jun 2026)** — `Nav.astro` detecta sesión en el cliente
   vía `$authStore` de `@clerk/astro/client` (nanostores). El markup estático (landing
   `prerender:true`) muestra por defecto "Entrar" + "Empezar gratis"; al detectar sesión
   se intercambian a "Ver planes" (`/precios`) + "Ir al Dashboard" (`/app`). Cubre las 3
   zonas: botones derecha desktop, CTA inferior móvil y overlay del menú móvil. Usa
   `data-auth-swap`/`data-in-*`/`data-out-*` como atributos de datos en los nodos del DOM;
   el script se suscribe a `$authStore` y aplica el cambio al resolver. Sin FOUC para el
   visitante anónimo (el caso común de la landing); swap ocurre tras carga de clerk-js.
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
✅ **Páginas de desarrolladores (jun 2026)** — `/desarrolladores/[slug]` (prerender, mismo
   sistema visual que `/producto/*`): `/desarrolladores/api` (terminal con curl + JSON response),
   `/desarrolladores/mcp` (chat UI con tool call `cartera_vencida`), y **`/desarrolladores/status`** 
   (página de estado y monitoreo "Quiet Luxury" con switch de componentes, historial a 90 días, leyendas, 
   tooltips customizados en CSS puro con micro-interacciones, mostrando fechas exactas y porcentajes reales).
   Contenido en `src/lib/desarrolladores.ts`. Animaciones `PageAnims`, masked-titles, count-ups, reveals.
✅ **Navbar v3 (jun 2026)** — nuevo megamenú DESARROLLADORES entre SOLUCIONES y RECURSOS:
   paneles API REST · MCP para IA · Cord Elements. PRECIOS movido al final como link simple.
   Orden: PRODUCTO · SOLUCIONES · DESARROLLADORES · RECURSOS · PRECIOS.
✅ **Footer v2 (jun 2026)** — expandido de 3 a 5 columnas: /01 Producto · /02 Soluciones ·
   /03 Desarrolladores · /04 Recursos · /05 Empresa. Trust chips en el bloque de marca
   (🇲🇽 Hecho en México · CFDI 4.0 · Datos cifrados). Grid responsive (≤1020px → 3 cols,
   ≤620px → 2 cols).
✅ **Vercel Analytics (jun 2026)** — `@vercel/analytics` instalado; componente `<Analytics />`
   montado en `Layout.astro` (landing) y `AppLayout.astro` (app). Page views y eventos se
   recopilan automáticamente en el dashboard de Vercel sin configuración adicional.
✅ **Páginas legales (jun 2026)** — `/privacidad` (Aviso de Privacidad Integral LFPDPPP+DPA,
   14 secciones: responsable/encargado, sub-processors, transferencias internacionales, ARCO,
   portabilidad, brechas) y `/terminos` (17 cláusulas: PI, metered billing, autorización débito,
   actividades prohibidas EFOS/lavado, SLA, límite de responsabilidad, API, uso de marca,
   cancelaciones sin reembolso, ley aplicable México/CDMX). Ambas `prerender:true`, grid
   TOC sidebar sticky con scrollspy `IntersectionObserver`, animaciones `PageAnims`
   (`masked-title` en H1, `reveal` en grid), microinteracciones CSS puras (subrayado expansivo
   en links, `translateX` activo en TOC, bullet `scale`, hover rows tabla).
✅ **Clerk Organizations — modo híbrido (jun 2026)** — Clerk = fuente de verdad de
   identidad (org switcher, email invitations, SSO/SAML, multi-org); Neon = fuente de
   verdad de datos de negocio (RLS, billing, 8 permisos granulares). Puente: columna
   `orgs.clerk_org_id` (text unique). Archivos modificados:
   • `db/schema.sql` — `alter table orgs add column if not exists clerk_org_id text unique;`
     + `clerk_user_id` ahora nullable (orgs de Clerk no tienen dueño único en el schema).
   • `src/lib/context.ts` — campo `clerkOrgId` en `ReqCtx` + `currentClerkOrgId()`.
   • `src/middleware.ts` — inyecta `auth().orgId` → `clerkOrgId`; `/api/clerk/` en `PUBLIC_API_PREFIXES`.
   • `src/lib/db.ts` — `getActiveOrgId()` resuelve por `clerk_org_id` primero (paso 0.5),
     con lazy-upsert si el webhook aún no llegó; todo el carril legacy se conserva.
   • `src/pages/api/clerk/webhook.ts` — sincroniza `organization.*` y
     `organizationMembership.*` → upsert en `orgs`/`org_members`; role mapping
     `org:admin`→preset `admin`, `org:member`→preset `vendedor`; no pisa permisos finos.
   • `src/layouts/AppLayout.astro` — `<OrganizationSwitcher>` en el sidebar
     (cambiar/crear orgs; `hidePersonal`, dark theme).
   • `src/pages/api/equipo.ts` — POST usa `createOrganizationInvitation` vía BAPI
     (Clerk manda el email); fallback a token/link si la org no tiene `clerk_org_id`.
     DELETE también llama `deleteOrganizationMembership` para mantener Clerk en sync.
   • `src/pages/app/ajustes/equipo.astro` — UI muestra "invitación enviada por correo"
     cuando `d.emailed === true`.
   • `scripts/backfill-clerk-orgs.mjs` — script de migración único (`npm run clerk:backfill-orgs`):
     crea Organization en Clerk por cada org Neon sin `clerk_org_id`, guarda el mapeo
     y agrega miembros activos. Re-ejecutable.
   ✅ **Config manual COMPLETADA en prod (jun 2026):** Organizations activado en el
     Dashboard, webhook en `https://cordhq.app/api/clerk/webhook` con los 8 eventos
     (`user.*` + `organization.*` + `organizationMembership.*`) y `CLERK_WEBHOOK_SECRET`
     seteado; migración + `clerk:backfill-orgs` corridos. (Si se quiere B2B-only: cambiar
     Membership de `optional` a `required` en el Dashboard.)
✅ **MCP Bidireccional y Gobernanza de Agentes (jun 2026)** — CORD funciona ahora como Servidor Inbound (HTTP/SSE en `/api/mcp/sse` y `/api/mcp/message`) y como Cliente Outbound (`McpClientManager` en `src/lib/mcp/client-manager.ts`). La Base de Datos incluye tablas de gobernanza (`mcp_servers`, `agentes_ia`, `agentes_permisos`) permitiendo que la IA interna de CORD acceda a CRMs corporativos bajo un control estricto (RLS). El endpoint `/api/cotizaciones/ai-draft` implementa un 'Agent Loop' que consulta dinámicamente las herramientas remotas MCP habilitadas para ese agente antes de generar la cotización.
✅ **Rediseño UI/UX de Desarrolladores (Premium)** — La página de Configuración de API y Webhooks (`/app/ajustes/api.astro`) fue reconstruida usando una estética premium (Vanilla CSS: `DeveloperUI.css`). Incorpora layout de tarjetas limpios, insignias semánticas, tipografía monoespaciada, toggles segmentados y un bloque "Terminal Oscura" con micro-interacciones para la conexión de servidores MCP y webhooks.
✅ **Internacionalización B2B (Abstracción Fiscal Global) (jun 2026)** — Desacoplamiento del SAT. La tabla `orgs` ahora soporta `country_code` y los documentos se centralizan en la tabla abstracta `documentos_fiscales`. Implementación del patrón Adapter (`src/lib/fiscal`) con `FiscalFactory` que enruta a proveedores locales como `MexicoSatProvider` (CFDI) o `USInvoiceProvider` (Commercial Invoices).
✅ **Multi-divisa con Cobertura Cambiaria (jun 2026)** — La tabla `cotizaciones` ahora soporta divisa de cotización (`base_currency`) independiente a la de facturación (`fiscal_currency`). Implementación de `FXService.ts` para obtener tasas *spot*, aplicar un *buffer%* de cobertura para proteger los márgenes, y congelar la tasa (FX lock) por 30 días para cotizaciones B2B.
✅ **Footer Stripe/Linear (jun 2026)** — rediseño premium estilo Stripe/Linear sin badges, sin prefijos numéricos, con tipografía sutil, enlaces gris técnico que hacen fade a blanco y enlace directo a soporte. Grid asimétrico (2fr 6fr). Se añadieron íconos sociales (Instagram, TikTok, X) usando SVG nativo en la base del footer, y se actualizaron los enlaces de la columna Recursos (`/blog`, `/precios`, `/planes-soporte`).
⚠️ **EXACTITUD (doc drift, corregido jun 2026):** la app **NO usa los componentes
   nativos `<SignIn/>`/`<SignUp/>` de Clerk** para los flujos de auth — usa **islas React
   propias** basadas en nanostores (`CustomSignIn`, `CustomSignUp`, `CustomOrgSwitcher`,
   `ForgotPassword`, `VerifyEmail`, `CreateWorkspace`) que escuchan la instancia global
   `$clerkStore`/`$userStore` inyectada por `@clerk/astro`. Sí se usa el nativo para
   `<UserProfile/>` (Ajustes › Cuenta). Las
   entradas de abajo que dicen "componentes nativos/oficiales de Clerk" reflejan un intento
   que se revirtió a los `Custom*`. **El "Entorno de prueba" ya es REAL
   (jul 2026)**: org sandbox espejo con datos 100% aislados — ver la entrada "Entorno de
   prueba REAL tipo Stripe" arriba (la nota vieja decía que era cosmético). ⚠️ Auth en re-trabajo activo (André): hay
   componentes nuevos sin commitear en `src/components/auth/` (`SignInForm.tsx`, etc.).
✅ **Clerk Premium UI & Nativos (jun 2026)** — Retorno a los componentes oficiales de Clerk (`<SignIn />`, `<SignUp />`, `<OrganizationSwitcher />`, `<OrganizationProfile />`) estilizados globalmente vía `appearance` con un diseño oscuro premium estilo Stripe/Linear (`src/lib/clerk-theme.ts`), eliminando código React manual redundante.
   • **Flujos de Autenticación**: Las rutas `/sign-in` y `/sign-up` montan los componentes nativos de `@clerk/astro` con redirecciones server-side desde `/login` y `/registro` en `astro.config.mjs`.
   • **Motor B2B (Organizations)**: El control de equipo (invitaciones, roles, accesos) opera mediante una **interfaz 100% custom y nativa estilo Stripe** (en `/app/ajustes/equipo`) que consume nuestros webhooks (`/api/equipo`), reemplazando definitivamente a `<OrganizationProfile />` por razones de diseño y control UX "Quiet Luxury".
   • **Componentes B2B**: El selector de espacios de trabajo se reemplazó por el `<OrganizationSwitcher />` nativo en el sidebar de `AppLayout.astro`. El onboarding usa `<CreateOrganization />`.
✅ **Colaboración en Tiempo Real y Firmas Nativas (jun 2026)** —
   • **Hilos de negociación embebidos**: Comentarios interactivos por cada línea de la cotización (`cotizacion_comentarios`). Los clientes pueden debatir partidas específicas y llegar a un acuerdo granular en la misma vista pública de la cotización (`QuoteCard.astro` y `/api/q/[token].ts`).
   • **Firmas Legales Inmutables**: Nuevo flujo legal (`cotizacion_firmas`) donde se captura Nombre, Correo, IP, User Agent y un hash criptográfico SHA-256 generado a partir del *snapshot* del estado de los ítems cotizados. La cotización exhibe el sello de auditoría tras ser aprobada, actuando como un contrato digital legal y verificable.
✅ **Pulido visual y micro-interacciones (jun 2026)** — Mejoras premium de diseño "Quiet Luxury":
   • **Desarrolladores**: Ajuste de colores (azul `#93c5fd` en lugar de morado) en la UI de herramientas MCP para mayor coherencia visual.
   • **Link Público de Cotización**: Micro-interacciones TOP en los botones principales (`.ql-cta`, `.ql-ghost`), incorporando efectos dinámicos de escala, control de *brightness* y expansión fluida de sombras.
   • **Historial de versiones**: Transformado de una lista básica a un componente moderno y elegante estilo acordeón, con transiciones suaves, elevación al hover y micro-ajustes de posición (`translateX`).
✅ **AI Agent Workflows — Cuentas por Cobrar y Flujo de Caja (jun 2026)** —
   • **Agentes de Cobranza Autónomos (AI AR)**: Nueva tabla `cobranza_conversaciones` y `planes_pago_negociados` para gestionar interacciones. Cron job (`/api/cron/cobranza`) y webhook (`/api/webhooks/inbound-email`) que alimentan al LLM (`ar-agent.ts`) permitiéndole negociar hasta 3 cuotas mensuales con deudores. Dashboard de supervisión en `/app/tesoreria/cobranza`.
   • **Predicción de Flujo de Caja**: Algoritmo predictivo en `cashflow.ts` que cruza el delay promedio de pago histórico con el valor ponderado del pipeline actual para estimar los ingresos a 90 días. Dashboard avanzado en `/app/tesoreria/flujo` con "AI CFO Insight" y escenarios de probabilidad.
✅ **Arquitectura Isomórfica de Auth (jun 2026)** — Solución al "Blank Screen" de Clerk en islas React
   dentro de Astro. Los componentes de React lanzaban error por falta de `<ClerkProvider>` en su contexto.
   Se reescribió `CustomSignIn.tsx`, `CustomSignUp.tsx`, `VerifyEmail.tsx`, `ForgotPassword.tsx` y
   `CreateWorkspace.tsx` para usar **nanostores** (`@nanostores/react` + `@clerk/astro/client`). Ahora
   las "islas" React escuchan la instancia global de Clerk inyectada por Astro (`$clerkStore`, `$userStore`)
   eliminando la dependencia de wrappers de Context.
✅ **Identidad Visual "Cord Navy" y Micro-Interacciones (jun 2026)** — Rediseño total de los flujos de
   autenticación (`/sign-in`, `/sign-up`, `/verify-email`, `/forgot-password`, `/onboarding/workspace`).
   Se eliminó el gradiente mesh multicolor heredado y se reemplazó por un fondo blanco inmaculado con una
   sutil cuadrícula punteada (radial-gradient mesh) en `#0a192f`. Se reemplazó el texto por logotipos reales.
   Los inputs y botones (`.btn-primary`) adoptan el Cord Navy puro (`#0a192f`), con sombras escalonadas y
   levantamientos `translateY(-1px)`.
✅ **Auth pages — minimalista tipo Linear (jun 2026)** — `/sign-in` y `/sign-up` rediseñadas a petición
   de André ("minimalista tipo Linear pero esencia Cord, fondo blanco"). Se descartó tanto la card centrada
   original (lucía plana: sombras/bordes a opacidad 0.05 = invisibles) como un intento de layout split de
   dos columnas. Diseño final:
   • **Fondo blanco limpio, todo centrado en columna** (sin panel lateral, sin card chrome — `.auth-card`
     es `transparent`, sin borde ni sombra). El formulario flota sobre el blanco al estilo Linear, pero en
     claro y con navy Cord. Estructura: logo Cord navy → formulario (Custom*) → footer "Hecho en México ·
     Datos cifrados".
   • **Estética Cord:** título navy `#0a192f` peso 600 tracking −0.025em, inputs border 1px sutil + focus
     ring navy `rgba(10,25,47,0.08)`, botón primario navy sólido full-width con hover `translateY(-1px)`,
     sociales blancos con border sutil. Inter, mucho aire (`gap: 2.25rem`), fade-in suave.
   • **CSS compartido idéntico en cada página** (mismo bloque `<style is:global>`; clases consumidas por
     `CustomSignIn`/`CustomSignUp`). `body:has(.auth-page)` oculta nav/footer de la landing.
   • **`client:only="react"`** en ambas páginas (corregido de `client:load`; Clerk requiere contexto de
     cliente — ver bug documentado más abajo sobre pantalla blanca).
✅ **OrgSwitcher "Linear-Style" (jun 2026)** — El `CustomOrgSwitcher.tsx` se rediseñó para operar en
   **Modo Oscuro Nativo** y acoplarse perfectamente al sidebar navy (`#0a192f`). El botón base es transparente
   con texto blanco semi-translúcido, y el menú desplegable flota con fondo `#0a192f` y bordes finos de alto
   contraste, evitando el efecto de "mezcla sucia" sobre el fondo blanco del dashboard.
✅ **Micro-interacciones Topbar y Sidebar (jun 2026)** — Elevación de la calidad de UI a nivel premium:
   • **Botón Sidebar:** Se actualizaron los íconos (flechas apuntando hacia el flujo de expansión/colapso). Animación sutil de desplazamiento del ícono (`translateX`) al hacer hover y un efecto de hundimiento (`scale(0.92)`) en estado activo.
   • **Topbar (Ajustes, Ayuda, Notificaciones):** Íconos reacondicionados con animaciones fluidas usando curvas CSS `spring` puras (engrane rotando 60°, efecto "wiggle" en Ayuda, y "bell-ring" en notificaciones). Levantamiento (`translateY(-1px)`) global para `tb-icon`.
✅ **Entorno de Prueba Global y Rediseño API (jun 2026)** — Centralización del estado de entorno:
   • **Nanostore de Test Mode:** Se introdujo `testMode.ts` (estado global sincronizado con `localStorage` como `cord_test_mode`) y se acopló al interruptor "Entorno de prueba" en el `CustomOrgSwitcher.tsx`.
   • **Rediseño "Quiet Luxury" en Desarrolladores:** Se eliminó la dependencia de `DeveloperUI.css` (estilo Stripe morado/blanco) en `/app/ajustes/api.astro`. La interfaz ahora usa clases nativas de Cord (`.api-btn-solid`, `.api-btn-ghost`) asegurando un Modo Oscuro perfecto.
   • **Org Switcher UI Fix:** Corrección de contraste de texto y recortes `text-overflow` (`min-width: 0` + `ellipsis`) para nombres de usuario/emails largos.
✅ **Reescritura Custom de Equipo y Roles (jun 2026)** — Se removió el componente "enlatado" `<OrganizationProfile>` de Clerk en favor de una vista `equipo.astro` 100% nativa. El nuevo diseño (inspirado en Stripe) introduce filtros estilo "píldora" fluidos, botones primarios con efectos glassmorphism/gradient, y modales nativos para invitar, editar roles y revocar accesos (conectados a `/api/equipo`), garantizando fidelidad total al "Dark Mode" del SaaS.
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
✅ **FIX crítico de schema (jun 2026)** — varias columnas vivían SOLO en su `CREATE TABLE`
   y nunca se aplicaban en bases ya existentes (el `migrate` ignora "already exists"). Se
   re-declararon como `ALTER ... IF NOT EXISTS`: `cotizaciones.base_currency/fiscal_currency/
   fx_rate/fx_rate_source/fx_locked_until` (sin ellas `createCotizacion` tronaba) y
   `orgs.country_code` (sin ella `emit.ts`/facturar tronaba). **Regla a futuro:** toda
   columna nueva sobre una tabla existente va como `alter table … add column if not exists`,
   NUNCA editando el `create table`.
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
✅ **Fix crítico: firma en link público (jun 2026)** — `src/pages/api/q/[token].ts` usaba
   `sql.begin(async tx => …)` en la acción `approve`, pero el driver HTTP de Neon
   (`@neondatabase/serverless`) no expone ese método — solo `sql.transaction([...])`. La
   función crasheaba silenciosamente y la respuesta llegaba vacía → el cliente recibía
   "Unexpected end of JSON input" al intentar `res.json()`. Corregido: se arma un array de
   queries (`txQueries`) y se ejecuta con `(sql as any).transaction(txQueries)`. Mismo
   patrón que `withOrgTx`/`withPublicToken` en `db.ts`. **Regla a futuro:** NUNCA usar
   `sql.begin()` — siempre `sql.transaction([...])` (o los helpers `withOrgTx`/`withPublicToken`).
✅ **LISTO PARA PRODUCCIÓN (jun 2026)** — operativa verificada: DB de prod migrada; env vars
   en Vercel (`ANTHROPIC_API_KEY`, `RESEND_API_KEY`/`RESEND_FROM`, `CRON_SECRET`, DATABASE_URL,
   Clerk/Stripe live); webhooks de Stripe (`/api/stripe/webhook` + Customer Portal) y Clerk
   (`/api/clerk/webhook`) registrados; dominio de Resend verificado. Build y rutas sanas.
✅ **CFDI 4.0 vía Facturapi (jun 2026)** — `MexicoSatProvider` crea la factura real en
   Facturapi (auth Basic con la API key), devuelve el UUID del SAT y los PDF/XML se sirven
   por `/api/cotizaciones/[id]/cfdi?type=pdf|xml`. **Key de TEST ya configurada**
   (`FACTURAPI_API_KEY`). ⚠️ **Gap del modelo:** Cord captura el RFC del cliente pero NO su
   régimen fiscal ni CP (domicilio) — `emit.ts` usa defaults (público en general / CP del
   emisor / uso G03). Para CFDI válido a un RFC específico hay que capturar régimen + CP +
   uso CFDI POR CLIENTE (agregar al alta de clientes). Para subir a producción: cambiar a
   `sk_live_` en `FACTURAPI_API_KEY` (Vercel).
✅ **UX intuitiva en flujos core de la app (jun 2026)** — pasada de claridad y estética en las 5 pantallas más usadas, para que cualquier usuario (no técnico) entienda las funcionalidades al primer vistazo:
   • **Editor de cotización (`/app/cotizaciones/nueva`):** pasos numerados explícitos ("1 ¿A quién le cotizas?" / "2 ¿Qué le vas a cotizar?") con guía de texto debajo de cada encabezado. **Panel de divisas rediseñado de jerga a humano:** al elegir USD/EUR aparece un stepper visual "Tipo de cambio hoy → Tu tasa protegida" con tres presets de colchón **Poco / Normal / Cauto** (+1% / +2% / +5%) en lugar de un campo "buffer %" vacío; preview live "Tu cliente verá ≈ US$X · tú facturas $Y MXN". Resumen de sidebar enriquecido con conteo de líneas/piezas y línea "Le descontaste −$X" cuando el precio negociado baja del lista. Moneda con banderas (🇲🇽/🇺🇸/🇪🇺) — **NOTA: las banderas son excepciones aprobadas por el contexto de selección de país/divisa**, no emojis decorativos.
   • **Clientes (`/app/clientes`):** el par confuso "dropdown de nivel + campo numérico de descuento" reemplazado por **chips de nivel** (Estándar / Plata / Oro / Distribuidor) que al tocarse auto-sugieren un descuento típico y muestran una preview live en pesos ($1,000 → $900). Estado vacío con ícono, titular y botones "Nuevo cliente" / "Importar CSV".
   • **Productos (`/app/productos`):** etiquetas humanizadas ("¿Cuánto te cuesta?"). **Medidor de margen en vivo** dentro del modal: barra de color (verde ≥30% / ámbar 15-30% / rojo <15%) + texto "Ganas $X por unidad · margen Y%" — o "Pierdes $X" si el costo supera el precio. Estado vacío con ícono y CTA.
   • **Importar CSV (clientes y productos):** **indicador de pasos** en la cabecera del modal (1 Archivo · 2 Columnas · 3 Revisar) con dot activo/completado para que el usuario nunca pierda el hilo.
   • **Lista de cotizaciones (`/app/cotizaciones`):** **barra de resumen** al tope (valor en pipeline + aprobado por cobrar + pendientes de aprobación). **Conteos en los filtros** ("Abiertas 5", "Aprobadas 3"…). Estado vacío real cuando no hay cotizaciones. **Pista de arrastre** en la vista Kanban ("Arrastra las tarjetas para avanzar cada cotización en su pipeline").
   • Archivos modificados: `src/pages/app/cotizaciones/nueva.astro`, `src/pages/app/clientes.astro`, `src/pages/app/productos.astro`, `src/pages/app/cotizaciones/index.astro`.
    • **Ajustes y Modales (Quiet Luxury):** rediseño "borderless" nivel Stripe/Apple en las pantallas de configuración (`/app/ajustes/equipo`, `/app/ajustes/sso` y `/app/ajustes/cuenta`). Se extrajo el **SSO (SAML)** a su propia pestaña dedicada de alto nivel con un rediseño gráfico "glassmorphism" azul/blanco de Cord. Se eliminó por completo la dependencia de los componentes nativos de Clerk (`<UserProfile />`) reemplazándolos con "Islas de React" 100% custom conectadas a los Nanostores (`@clerk/astro/client`), implementando `user.update()`, `user.updatePassword()` y `session.revoke()`.
✅ **Responsive Mobile-First en Ajustes y Modales (jun 2026)** — Se refactorizó la estructura base de `/app/ajustes` (`SettingsShell.astro`) y los perfiles custom de Clerk (`CustomUserProfile.css`) para ser "mobile-first": inputs expandidos al 100%, sesiones apiladas y botones anchos tipo app nativa. Se adaptaron los modales de Developers y Agentes para que las acciones se apilen al 100% de ancho en pantallas pequeñas sin romper el grid.
✅ **Wizard de Configuración SSO Empresarial (jun 2026)** — Se reconstruyó la pantalla secundaria de configuración de SSO (`/app/ajustes/sso/configuracion`) con un asistente interactivo de 3 pasos inspirado en Stripe.
   • **Paso 1 (Asignación de Roles):** Selección visual mediante tarjetas interactivas ("Dashboard de Cord" vs "Proveedor de Identidad").
   • **Paso 2 (Verificación de Dominio):** Input validado con prefijo `@` para establecer el enrutamiento de usuarios B2B.
   • **Paso 3 (Registro DNS TXT):** Instrucciones claras con caja de copia en un clic para mostrar el código de verificación `flouvia-verification`.
   • Además, se unificó la estética premium de los botones primarios a lo largo de las páginas de Ajustes (`equipo.astro` y `sso.astro`), devolviéndolos al gradiente oficial "Cord Navy" en un rediseño coherente "Quiet Luxury".
✅ **Datos fiscales del receptor POR CLIENTE (jun 2026)** — CFDI nominativo cableado de
   punta a punta. Columnas nuevas en `clientes`: `regimen_fiscal` (c_RegimenFiscal),
   `uso_cfdi` (c_UsoCFDI) y `cp_fiscal` (CP del domicilio fiscal del receptor). El alta/edición
   de clientes (`/app/ajustes` → modal de `/app/clientes`) tiene una sección colapsable "Datos
   fiscales para CFDI (opcional)" con selects de los catálogos SAT (`src/lib/sat.ts`). `getClientes`
   devuelve `regimenFiscal/usoCfdi/cpFiscal`; `/api/clientes` los persiste (POST/PATCH). **`emit.ts`
   ya los usa**: pasa `tax_system`/`zip`/`cfdi_use` del cliente al `MexicoSatProvider` (que ya los
   aceptaba), con fallback al CP/uso del emisor; si el RFC es genérico degrada a público en general.
   ⚠️ Correr `npm run db:migrate` (3 columnas nuevas en `clientes`).
✅ **Toda la IA usa Haiku (jun 2026)** — decisión de André: TODO lo de IA corre con
   `claude-haiku-4-5-20251001` (configurable con `AI_MODEL`). Cableado: `ai-draft` (armar
   cotización), `ar-agent.ts` (cobranza autónoma) y `cashflow.ts` (AI CFO Insight de Tesorería).
   Antes `ar-agent` usaba opus y `cashflow` tenía hardcodeado `claude-3-5-sonnet-20241022` (modelo
   viejo, bug) — ambos corregidos. Regla a futuro: nada de IA hardcodea modelo; usar
   `process.env.AI_MODEL || 'claude-haiku-4-5-20251001'`.
✅ **SSO marcado "Próximamente" (jun 2026)** — el SSO empresarial (SAML/OIDC) NO está conectado
   (sería config de Clerk de plan pagado). La pestaña `/app/ajustes/sso` conserva su estética
   premium (gráfico de flujo, badge Enterprise) pero se QUITARON los botones de acción
   ("Empezar configuración"/"Documentación"): ahora muestra un badge "Próximamente" + nota de
   contacto. El wizard `/app/ajustes/sso/configuracion.astro` sigue en el repo pero queda sin
   enlace de entrada (es 100% cosmético: no persiste nada). NO re-exponer botones hasta conectar SAML real.
✅ **Limpieza de código muerto de Clerk (jun 2026)** — se borró el clúster del re-trabajo de
   auth abandonado (0 imports): `src/components/auth/{SignInForm,SignUpForm,VerifyEmailForm,
   ForgotPasswordForm}.tsx` + `AuthForms.css`; toda la carpeta `src/components/b2b/`
   (`CreateWorkspaceForm`, `WorkspaceSwitcher`, `MembersManager`, `AcceptInvitationFlow`,
   `InvitationsManager`, `B2B.css`); las páginas huérfanas `src/pages/app/ajustes/invitaciones.astro`
   y `src/pages/accept-invitation.astro` (el flujo real de invitación es `/unirse/[token]`);
   `src/components/developers/DeveloperUI.css`; y el onboarding muerto `src/lib/onboarding.ts` +
   `/api/onboarding/seed` (el real es `getSetupProgress()` en queries.ts). El flujo de auth ACTIVO
   es 100% custom: `src/components/auth/{CustomSignIn,CustomSignUp,ForgotPassword,VerifyEmail}.tsx`
   + `CustomUserProfile`/`CustomOrgSwitcher`. (Ignorar las entradas viejas que digan "componentes
   nativos de Clerk `<SignIn/>`/`<UserProfile/>`": el approach final es Custom*.)
✅ **`FeatureShowcase` — sección tabbed estilo ElevenLabs "Flows" en `/producto/[slug]` (jul 2026)** —
   nueva pieza debajo del bento grid (3 tarjetas) en TODAS las páginas de producto, pedida por
   André con referencia directa a `elevenlabs.io/creative`: un mockup GRANDE que cambia según
   la pestaña activa, con 3 pestañas debajo (eyebrow + título + copy) y una barra indicadora
   que se desliza y se rellena sola como temporizador de autoplay.
   • **`src/components/producto/FeatureShowcase.astro`** (nuevo) — shell + tabs + interacción.
     `.shw-stage` (560px alto desktop, 460/400px en breakpoints) contiene los `.shw-panel`
     apilados (`position:absolute; inset:0`); `.shw-track` con `.shw-indicator` (barra 2px que
     se traslada/redimensiona vía `getBoundingClientRect`, mismo patrón que `#nav-indicator` de
     `Nav.astro`) + `.shw-indicator-fill` (un `<i>` con `scaleX(0→1)` que ES el temporizador de
     autoplay, 6s por tab). Arranca solo al entrar en viewport (`IntersectionObserver`) y **NUNCA
     se detiene por interacción del usuario** — ni al hacer hover ni al hacer clic manual en una
     pestaña (un clic manual salta a esa pestaña y el conteo vuelve a arrancar desde ahí; el
     ciclo sigue corriendo indefinidamente). Solo se pausa si la sección sale del viewport
     (`threshold:0.4`). ⚠️ Se intentó primero pausar en `mouseenter`/`mouseleave` — se quitó por
     petición explícita de André: como el cursor tiene que estar sobre la sección para hacer
     clic, el pause-on-hover hacía que el autoplay se congelara para siempre después de
     cualquier clic. **Regla a futuro: nada de pause-on-hover en componentes autoplay de esta
     familia**, solo pausa por viewport.
   • **Crossfade "settle" premium (Apple-style) vía GSAP:** el panel entrante arranca con
     `opacity:0, scale:1.035, y:16, blur(16px)` y se asienta a su estado final con
     `power3.out` en 0.9s (mismo lenguaje que el "settle" del hero mockup: perspectiva/blur que
     converge a foco nítido); el saliente se hunde (`scale:0.978, y:-6`) y se desvanece con
     `power2.inOut` en 0.5s. `z-index` temporal asegura que el entrante quede siempre encima
     durante el cruce. Reemplazó un crossfade plano por CSS `transition:opacity` (se sentía
     genérico) — la clase `.shw-panel-active` se conserva como fallback instantáneo para
     `prefers-reduced-motion` y para el estado inicial sin JS.
   • **`src/components/producto/ShowcaseMockup.astro`** (nuevo, ~1700 líneas) — 36 mockups
     (12 páginas de producto × 3 tabs), construido por el agente `mockup-builder` siguiendo
     `MOCKUP_STANDARDS.md`: mismo patrón "ventana blanca flotando sobre el `#f5f5f7` de
     `.shw-stage`" que `BlockMockup.astro`, pero a escala de HERO (más denso/cinemático que
     los mockups del bento) con su propio set de clases `shwm-*` autocontenido (Astro scopea
     `<style>` por componente — `.bm-*` de `BlockMockup.astro` NO es reusable aquí). Cada
     escena prueba literalmente el copy de su tab (ej. `editor` tab 1 = spreadsheet con
     `#REF!`/`#VALOR!` transformándose en la tabla limpia de Cord vía flecha; `cobranza-ia`
     tab 2 = chat donde el agente negocia 3 cuotas y el cliente acepta; `negociacion` tab 3 =
     sello SHA-256 con hash real).
   • **`showcase: ShowcaseTab[]`** — campo nuevo en la interfaz `Feature` (`src/lib/producto.ts`):
     `{ eyebrow, titulo, copy }` × 3 por feature, copy escrito con gancho de psicología de
     marketing (pérdida/urgencia/prueba social/autoridad — ej. "El PDF que nadie vuelve a abrir",
     "La vio 3 veces = está comparando"), DISTINTO al copy funcional de los `blocks` del bento
     (mismo feature, ángulo de venta diferente, para no repetir el mensaje dos veces en la misma
     página). Poblado para las 12 features en ES (`producto.ts`) y EN (`producto.en.ts`).
   • **`src/components/producto/ShowcaseAuroraBg.jsx`** (nuevo) — variante TRANSPARENTE del
     motor de aurora (Simplex 3D + FBM + domain-warp, mismo código base que
     `CardAuroraBg`/`DarkAuroraBg` de `src/components/soluciones/`) para vivir dentro de
     `.shw-stage` **sin tapar su gris `#f5f5f7`**: el fragment shader emite `gl_FragColor =
     vec4(color, alpha)` con `alpha` derivado de la intensidad de cada blob (0 donde no hay
     aurora → el gris se ve intacto) en vez de pintar un fondo navy opaco. Paleta azul oscuro
     saturado (`colorDeep`/`colorSteel`/`colorIndigo` — NO teal/esmeralda, esos son de
     `CardAuroraBg`) con **4 capas de blobs** (2 originales + 2 agregadas a petición de André
     por sentirse "vacío": una grande/lenta sesgada arriba-derecha, una chica/rápida abajo-
     izquierda) para que el lienzo se sienta lleno en las esquinas. Montado como
     `<ShowcaseAuroraBg client:only="react" />`, primer hijo de `.shw-stage` (antes que los
     `.shw-panel` en el DOM → queda debajo por stacking natural, sin z-index explícito).
     `material transparent` + `gl={{ alpha:true }}`; mismo patrón de `IntersectionObserver`
     +`prefers-reduced-motion` que el resto de la familia de shaders. ⚠️ **Regla a futuro:** si
     se necesita una aurora animada sobre una superficie CLARA en otra parte del sitio (no
     oscura como `CardAuroraBg`), clonar `ShowcaseAuroraBg` — el patrón es: alpha por blob en
     vez de color opaco, paleta saturada (colores oscuros a baja opacidad sobre gris/blanco se
     leen como "gris sucio", no como el color — hay que subir saturación Y alpha más de lo que
     se siente natural para un shader sobre fondo oscuro).
   • **Mockup del WhatsApp (`link-publico` tab 1) elevado a "screenshot real de dispositivo"** —
     a petición de André ("muchísimo mejor"): se agregó status bar completo (hora, señal, wifi,
     batería), dynamic island, header de WhatsApp con flecha de regreso + íconos de
     videollamada/llamada, separador de fecha "Hoy", timestamps por mensaje, tick de leído,
     preview de link enriquecida (thumbnail navy + monto + dominio) y home-indicator inferior.
   • **Bug real encontrado y corregido:** el mockup `editor` tab 2 ("Sin fricción") usaba clases
     (`.shwm-search`, `.shwm-search-drop`, `.shwm-drop-r`, `.shwm-landing`, etc.) que el agente
     `mockup-builder` nunca definió en el `<style>` — el SVG de la flecha se renderizaba sin
     restricciones de tamaño (las formas navy gigantes que reportó André) y el dropdown de
     búsqueda no tenía layout. **Regla a futuro:** después de que un agente de mockups entregue
     un archivo grande, correr un audit rápido de "clases usadas en el markup vs. clases
     definidas en `<style>`" (regex sobre `class="..."` / `class={\`...\`}` contra selectores
     `.clase`) antes de dar por bueno el resultado — encontró 1 bug real de 4 candidatas en
     este caso (las otras 3 eran inofensivas: atributos SVG inline o clases base ya estilizadas).
   ⚠️ Estas piezas (mockups grandes, shader, crossfade) son CSS/HTML/WebGL — para revisarlas
   usar Playwright headless (`npx playwright` funciona sin instalación previa en este entorno)
   y capturar en varios timestamps tras un clic para verificar transiciones, no solo el estado
   final.

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

⬜ Pendiente (no bloquea lanzamiento): `FACTURAPI_API_KEY` live en prod;
   `USInvoiceProvider` real (US); publicar `@flouviahq/elements` v0.2.0 (`npm login && npm
   publish`). Deuda menor: `/api/*` aún no migra a
   `withOrgTx` (pendiente para activar `FORCE ROW LEVEL SECURITY`); rate-limit del middleware es
   in-memory por instancia (para escala multi-réplica usar Upstash Redis); y 5 vulnerabilidades de
   `npm audit` de bajo riesgo (esbuild dev-Windows / path-to-regexp build-time) cuyo fix exige
   downgrade breaking de `@astrojs/vercel`.

✅ **COMPLETADO — Connect migrado a Embedded Components (jul 2026)** — lo que aquí estaba planeado YA se
   implementó; ver la entrada "Cobros v2 — Stripe Connect EMBEDDED" al inicio del archivo para el detalle
   final (endpoint `account-session`, island `ConnectOnboarding.tsx`, theming, webhook `account.updated`,
   OAuth `start/callback/status` eliminados).
   ⚠️ **SUPERADO otra vez (jul 2026) — ver "Cobros v3 — Stripe Connect CUSTOM" al inicio del archivo:** esta
   nota originalmente decía que Custom quedaba descartado porque exige **$250K USD de volumen en 12 meses
   + plataforma activada**, y Cord (fase inicial) no calificaba. André pidió construirlo de todos modos
   para llegar al white-label 100% ("Quiet Luxury" sin ninguna marca de Stripe visible) — se implementó
   Custom completo (KYC in-house, `LiveCapture` con cámara, Stripe Elements para el checkout). El código
   funciona en TEST mode sin problema; el requisito de volumen solo bloquea activar cuentas Custom en
   **LIVE** — eso sigue pendiente de que Stripe apruebe la plataforma. ⚠️ El `git stash connect-custom-wip`
   mencionado abajo NO contiene ningún trabajo de Custom real (se verificó: solo tenía un cambio ajeno de
   27 líneas en `cotizaciones/index.astro`) — el Custom real que quedó en producción se construyó desde
   cero directo en el código, no vino de ese stash. Seguro hacer `git stash drop` de ese stash si estorba.
   Sigue pendiente la confirmación legal Ley Fintech/IFPE y la **activación de la plataforma en live por
   parte de Stripe** (estaba en "submitted").
