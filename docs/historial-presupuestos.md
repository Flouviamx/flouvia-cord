# Historial — Presupuestos y Cédulas Presupuestales

> Cédulas presupuestales (motor de fórmulas), Presupuesto vs. Real, wizard de plan
> financiero completo, herramientas de análisis (VPN/TIR/EOQ/variaciones), y desempeño
> por vendedor. Extraído de `historial.md`. Orden: más reciente arriba.

---

✅ **Presupuestos v2 — landing `/producto/presupuestos` + soporte + roadmap + onboarding (jul 2026,
   sesión posterior a la entrada de abajo)** — cableado externo del feature:
   • **Página de producto NUEVA `/producto/presupuestos` (ES + EN):** entrada completa en
     `producto.ts`/`producto.en.ts` (hero "El presupuesto que se compara solo contra la realidad",
     3 blocks, 3 showcase tabs, 4 FAQs con FAQPage JSON-LD automático, plan "Gratis para probar ·
     completo desde Profesional"). Mockups por el agente `mockup-builder` (murió por límite de
     sesión a media pasada de pulido; se terminó a mano): hero `mk-presu-*` (grid de cédula con
     pills de vs. Real que hacen count-up + pop vía GSAP — se le agregó el guard `!reduced` que
     faltaba), 3 bento `bm-presu-*` en `BlockMockup.astro` (vs. Real / asistente de plan completo /
     calculadoras VPN — se corrigió el wrap del concepto que el agente dejó anotado:
     `white-space:normal` + pills más chicas), 3 escenas showcase en `ShowcaseMockup.astro`
     (cédula vs. Real / cascada del wizard / "junta con evidencia"). Slides nuevos del
     `ProductAccordion` (key `presupuestos`). Auditoría de clases usadas-vs-definidas corrida
     (regla §4.6.5): sin huecos nuevos (las `bm-presu-mN`/`mk-presu` son hook classes sin estilo,
     mismo patrón que `bm-appr-mN`). Verificado con Playwright contra el BUILD (regla del
     proyecto): hero con bleed derecho + pills animadas, bento limpio, showcase denso.
   • **Navegación:** megamenú Producto (desktop + móvil) y Footer, sección "Pagos y Finanzas",
     con ícono duotone de spreadsheet+tendencia; claves i18n nuevas `nav.mega.prod.12.*` (ES/EN).
     El sitemap la recoge solo (enumera FEATURES).
   • **Soporte:** `presupuestos-cedulas.md` (ES/EN) reescrito a v2 (wizard, freemium, ƒx, Total,
     + Periodo, duplicar con shift de año, límites actualizados — ya se pueden agregar periodos);
     artículo NUEVO **`presupuesto-vs-real.md`** (ES/EN, order 2 — herramientas pasó a order 3)
     documentando conexión de filas, empate por mes, futuro/etiquetas ilegibles → sin real, y el
     atajo del wizard; `herramientas-analisis.md` (ES/EN) ganó la nota de plan Profesional.
   • **Roadmap:** entrada `presupuestos-cedulas` (id 13) reescrita con secciones de vs. Real y
     plan completo + disponibilidad freemium (ES/EN, sigue `live`).
   • **Onboarding:** el paso `presupuestos` de `getSetupProgress()` cambió a "Crea tu primer
     presupuesto" con el gancho de vs. Real (la detección `done` ya era correcta: ≥1 cédula o
     análisis).
   • **Pasada de exactitud de copy (self-audit, sin agente por el límite de sesión):** se corrigió
     un "El 90% de los presupuestos muere en enero" (estadística inventada → "Casi todos…") y
     "cobranza 40/30/30 **editable**" → "**ajustable**" en producto/roadmap/soporte (las fórmulas
     no se editan en sitio — se reemplaza la fila; "Límites actuales" del artículo lo dice).
   • Verificado: 2 builds limpios (ES + EN generan `/producto/presupuestos`), capturas Playwright
     del build de hero/bento/showcase.

✅ **Presupuestos v2 — "Presupuesto vs. Real" + wizard de plan completo + freemium (jul 2026)** —
   pasada de producto pedida por André ("que todas las empresas lo necesiten y sea indispensable +
   intuitivo"). Diagnóstico: las cédulas eran una hoja de cálculo aislada (más limitada que Excel);
   lo que Excel no puede copiar es que Cord YA tiene los datos reales del negocio. Cuatro piezas:
   • **Presupuesto vs. Real (killer feature, Pro+):** columna nueva `cedula_filas.fuente_real`
     (`ventas_monto` | `ventas_unidades` | `cobranza_monto`, null = sin conectar). Una fila conectada
     muestra bajo cada celda presupuestada el REAL del mes + pill de variación (verde si real ≥
     presupuesto, rojo si abajo). Serie real en `getRealPorMes()` (queries.ts): ventas cerradas =
     `status in (approved,paid,invoiced)` por mes de `coalesce(approved_at, created_at)` (MISMO
     criterio que getAnalytics, para no divergir); cobranza = unión DISJUNTA de `cotizacion_cobros`
     pagados (por `paid_at`) + cotizaciones pagadas SIN ningún cobro pagado (pago manual legacy,
     excluyendo `es_recurrente`) — mismo patrón anti-doble-conteo que getCobros. El mapeo columna→mes
     lo hace `parsePeriodoMes()` (cedulas.ts): lee "Ene 2026"/"Enero 2026"/"2026-01"/"01/2026"/"Sep '26";
     etiqueta sin mes reconocible (ej. "Q1") O SIN AÑO explícito → null (⚠️ decisión de auditoría: se
     intentó asumir el año en curso para "Ene" y se revirtió — mostraría el real del año EQUIVOCADO en
     cédulas viejas sin advertencia; mejor sin dato que dato incorrecto). Meses futuros → null (no
     mostrar "real $0 · −100%" de un mes que no ha pasado). En planes sin Pro el GET devuelve
     `reales={}` aunque haya filas conectadas (herencia de downgrade). UI: botón de enlace por fila
     (verde cuando conectada) → modal de conexión (o upsell si no es Pro), tag "vs. Ventas cerradas ($)"
     bajo el concepto, badge "Conectada a datos reales" en el toolbar.
   • **Wizard "Plan financiero completo" (Pro+):** `createPlanCompleto()` (cedulas.ts) crea en un
     clic la cascada de dinero universal — Ventas → Cobranza (40/30/30 con referencias CRUZADAS +
     offsets, editable) → Efectivo (entradas = cobranza cruzada, gastos/pagos tecleados, flujo neto,
     saldo final) — ya cableada entre cédulas (lo que a mano exigiría dominar el constructor de
     fórmulas), **sembrada con el promedio real de ventas de los últimos 6 meses de la org** y con
     las filas clave ya conectadas a vs. Real. Checkbox "mi negocio produce" agrega Producción +
     Compras de MP (plantillas estándar). `POST /api/cedulas {plan_completo:true, periodos,
     incluirProduccion}`; exige ≥3 periodos (la cobranza se escalona a 3 meses).
   • **Freemium (decisión de André, reemplaza el gate total a Pro que había quedado sin commitear):**
     las cédulas básicas están en TODOS los planes con límite de cantidad — `cedulasLimit()` en
     permissions.ts: free 1 · starter 3 · pro+ ilimitadas (402 con mensaje claro al topar). Pro+
     gatea: vs. Real (`set_fuente`), wizard y las herramientas de análisis (`/api/analisis` sigue
     100% Pro; la página herramientas.astro conserva su bloqueo con CTA). `requirePresupuestosPlan()`
     quedó como gate de FEATURES pro, ya no de todo el módulo. Comparativa de /precios (ES/EN):
     "1 cédula / 3 cédulas / Ilimitadas" + filas nuevas de vs. Real y plan completo.
   • **Rediseño intuitivo:** modal de creación en 2 PASOS con lenguaje humano — paso 1 = lista
     hairline de tipos con íconos duotone y preguntas reales ("¿Cuánto voy a vender?", "¿Cuándo me
     pagan de verdad?", "¿Me alcanza la caja?"), con "Plan financiero completo" destacado arriba
     (chips Recomendado/Pro); paso 2 = periodos pre-llenados (6 meses desde el mes actual) + nombre
     (oculto en el wizard — ⚠️ requirió `.fld[hidden]{display:none}`, la regla documentada del
     `hidden` pisado por display propio, detectada en la verificación visual). Editor: columna
     **Total** por fila, badge **ƒx** en filas calculadas, botón **"+ Periodo"** (nueva acción
     `add_periodo` — anexar al final es seguro porque los valores van por índice; sugiere el mes
     siguiente al último), y **Duplicar** desde el índice con mini-diálogo "Mismos periodos" vs.
     "Recorrer al año siguiente" (`duplicateCedula()` con `shiftYears`: recorre los años de 4
     dígitos en periodos y nombre — sin el shift, la copia empataría vs. Real contra los meses del
     año viejo, hallazgo de la auditoría). El duplicado remapea fórmulas INTERNAS a las filas nuevas
     y conserva intactas las referencias cruzadas + `fuente_real` + valores.
   • **Verificado:** `npm run db:migrate` corrido (columna aditiva), 2 builds limpios, harness E2E
     contra la BD real (org demo) importando el motor real vía esbuild (`--define:import.meta.env=
     process.env`) — 21/21 checks (parseo de periodos, cascada 40/30/30 cruzada, seed histórico
     real $338,326, reales vs. query directa, futuro→null, duplicado con/sin shift, remapeo de
     refs), `node --check` del script `is:inline` del editor, y screenshots Playwright de harness
     estático (markup+CSS reales, fetch stubeado) del grid con vs. Real, modal de conexión, modal
     de creación paso 1/2 y sugerencia de periodo. Auditoría `code-correctness-reviewer`: 1 bug
     real (el del año asumido) — corregido; 0 fugas multi-tenant, 0 XSS, 0 doble conteo.
   ⬜ Pendiente natural (no bloqueante): resumen "plan vs. real del mes" en el índice de
     /app/presupuestos (el loop de regreso mensual); artículos de soporte de vs. Real/wizard.

✅ **Presupuestos "curso completo" — 4 fases sobre Cédulas + herramientas de análisis (jul 2026)** —
   André compartió un examen real de su universidad (presupuestos en México) y pidió llevar todo
   ese temario a Cord, por fases, validando cada una contra el examen antes de seguir. Se
   implementaron 4 fases; el problema de kardex PEPS se dejó FUERA a propósito (rompería la
   decisión de diseño "no ERP de inventario en vivo" de las Cédulas, ver entrada siguiente).
   • **Fase 1 — Fórmulas con % y multiplicación entre filas.** El primitivo `combo` de
     `src/lib/cedulas.ts` solo sumaba (`Σ coef·valor`). Se agregó `kind?: 'suma'|'pct'|'producto'`
     a `ComboTerm` (default `'suma'`, 100% retrocompatible) y `evalFila` pasó de un `reduce` sin
     orden a un **fold SECUENCIAL**: `suma` acumula, `pct` multiplica por `(1 + valor/100)`,
     `producto` multiplica por otra fila completa — permite cascadas "+ajustes → ×(1+FE%) →
     ×(1+FA%)" y "unidades × precio" en una sola fila. Plantilla nueva `ventas_factores`. Los
     términos `pct`/`producto` SIEMPRE referencian una fila (nunca una constante escondida en el
     JSON). Verificado contra Cía. Pass: 5,310.73 uds / $189,593.06 (el examen redondeó a enteros
     por paso en Excel → 5,311 / $189,593.11; el motor mantiene 2 decimales, es lo correcto).
   • **Fase 2 — Referencias cruzadas de periodo (presupuesto de efectivo).** `ComboTerm` ganó
     `offset?: number` (default 0). `resolveRef` desplaza el array resuelto: `shifted[i] =
     vals[i-offset] ?? 0` (fuera de rango = 0, no hay "periodo −1"). Con esto "cobranza = 40% de
     ventas del mes + 30% del mes pasado + 30% del anterior" es 3 términos suma con offset 0/1/2.
     Plantilla `efectivo`. ⚠️ El saldo NO se arrastra automático entre periodos (el motor calcula
     cada fila completa con guard de ciclos a nivel de fila → una auto-referencia saldo_inicial↔
     saldo_final se corta a 0 en TODOS los periodos; arreglarlo exige rediseñar el motor a
     resolución periodo-por-periodo). Decisión validada con André: saldo inicial/préstamo/
     inversión son filas `input` tecleadas (mismo patrón que "Inventario inicial"). Verificado
     contra Cía. Team (cobranza 40/30/30).
   • **Fase 3 — Herramientas de análisis guardables (VPN/TIR/payback + EOQ).** Calculadoras de
     resultado único que NO caben en el grid por-periodos → **tabla nueva `analisis`**
     (`id, org_id, tipo, nombre, inputs jsonb`), RLS directa por `org_id` + FORCE, sin
     `public_token` (mismo patrón que Cédulas; solo persiste INPUTS, resultados on-the-fly).
     Matemática PURA en **`src/lib/analisis.ts`** (sin imports de DB → se bundlea también en el
     `<script>` del cliente, single source of truth): `computeProyecto` (VPN, TIR por bisección,
     periodo de recuperación con año fraccionario, factor de anualidad), `deriveFlujoAnual`
     (asistente que replica el examen: `(ganancia−dep)·(1−ISR)+dep`), `computeInventario`
     (CEP=√(2·D·co/cm), punto de reorden, costos). API `/api/analisis`(+`/[id]`) CRUD gated por
     `analitica` con `sanitizeInputs` (whitelist de campos, anti-jsonb-arbitrario). Pestaña nueva
     **"Herramientas"** en `/app/presupuestos` (`herramientas.astro`) con las calculadoras vivas +
     lista de escenarios guardados (guardar sobre uno cargado = PATCH, "guardar como nuevo" =
     POST). Verificado: New Chance VPN $55,163.79 / payback 2.44; Cía. Fácil CEP 200 / reorden
     10.96 / total $400.
   • **Fase 4 — Análisis de variaciones (presupuesto flexible).** Tercer tipo de `analisis`
     (`variaciones`), reusa tabla/página/motor de Fase 3 (sin migración). `computeVariaciones`
     compara costo estándar vs. real de una producción y descompone la diferencia: `varPrecio =
     (pReal−pStd)·qRealTotal`, `varCantidad = (qRealTotal−qStdTotal)·pStd` (identidad garantizada
     `precio+cantidad=total`). Lista dinámica de conceptos + tabla de resultados con pills F/D
     (favorable/desfavorable). Verificado contra Bene, SA: MP total +$1,020 D (precio −$480 F,
     cantidad +$1,500 D); MO total +$4,500 D (precio +$7,200 D, cantidad −$2,700 F).
   • **Whitelist de tipos:** `TIPOS` en `/api/cedulas.ts` amplió a `ventas_factores`/`efectivo`;
     `TIPOS_ANALISIS` en `analisis.ts` = `proyecto`/`inventario`/`variaciones`. ⚠️ Cada tipo nuevo
     de cédula/análisis DEBE agregarse a su whitelist (se olvidó una vez en Fase 1, corregido).
   • **`npm run db:migrate` corrido** contra Neon (tabla `analisis` + RLS/FORCE confirmados vs.
     `pg_class`/`pg_policies`). Las 4 fases con `npm run build` limpio y cada fórmula verificada
     con un harness Node aislado que importa/replica el motor real (no se dio por buena ninguna
     sin cuadrar el número del examen). ⚠️ No hubo verificación visual (sin Playwright en el
     entorno + páginas tras el login de Clerk) — el CSS reusa patrones ya verificados pero la
     revisión visual final queda pendiente de André.
   • **Gate de plan + sidebar menos "divisorio" (jul 2026, sesión posterior):** André
     comparó el sidebar con el de Stripe (lista plana arriba, sin tanto encabezado por
     sección) y preguntó si Presupuestos debía requerir plan de pago. Dos cambios:
     (1) **Sidebar (`Sidebar.astro`)** — los grupos "Principal" y "Clientes y productos"
     (4 ítems: Inicio, Cotizaciones, Clientes, Productos) se fusionaron en un solo grupo
     **sin encabezado** (`label: null`, sin botón de acordeón — siempre expandido), como
     la lista plana de accesos diarios de Stripe; "Mi dinero" e "Inteligencia" siguen
     como grupos con título/acordeón debajo, igual que la sección "Productos" colapsable
     de Stripe. Menos secciones tituladas = menos sensación de estar "cortado en
     pedazos", sin tocar el resto de la mecánica (indicador deslizante, colapso, pins).
     (2) **Presupuestos ahora SÍ requiere plan Profesional en adelante** — hallazgo real:
     `/precios` YA prometía "CFO Dashboard: Pro en adelante" en la comparativa, pero
     ningún endpoint ni página lo enforce — cualquier org en Free con el permiso
     `analitica` (que trae el preset "Vendedor" por defecto) tenía acceso completo. Se
     corrigió SOLO para Presupuestos (no se tocó el gating de CFO/Analítica/Auditor
     silencioso, que ya estaban en producción — cambiar su acceso retroactivo es
     decisión de André, no algo para hacer en silencio). Nuevo `PRESUPUESTOS_PLANS`/
     `planTienePresupuestos()` en `permissions.ts` (mismo umbral que CFO: pro/scale/
     developer). Nuevo `requirePresupuestosPlan()` en `queries.ts` (mismo patrón que
     `planTieneEquipo` en `/api/equipo.ts`: 402, no 403 — es límite de plan, no de rol),
     cableado en los 4 endpoints (`/api/cedulas`, `/api/cedulas/[id]`, `/api/analisis`,
     `/api/analisis/[id]`, las 3 páginas Astro de Presupuestos muestran un estado
     "Disponible desde el plan Profesional" (distinto de "Sin acceso" por permiso) con
     CTA a `/app/ajustes/plan`. Fila nueva en la comparativa de `/precios` (ES+EN):
     "Presupuestos: cédulas y herramientas de análisis" = Pro en adelante. El nav del
     sidebar y el paso del onboarding se dejan siempre visibles (mismo patrón que
     "Invita a tu equipo", que también lleva a una pantalla con upsell si el plan no
     alcanza) — la discoverability no se oculta, el gate vive en la página/API.
   • **Pasada de intuición + cableado externo (jul 2026, sesión posterior):** (1) **UX** — el
     modal "Nueva cédula" mostraba la ayuda de *Producción* aunque el tipo default es *Ventas*
     (nunca coincidían al abrir); ahora la ayuda se sincroniza al abrir/cambiar y **sugiere el
     nombre** ("Presupuesto de Ventas"…) mientras el usuario no lo teclee. El constructor de
     fórmulas ganó una **fila de encabezados** (Operación · Cédula · Fila · Coef. · Atrás) — antes
     eran 5 controles sin etiqueta, solo tooltips — y la ayuda ahora explica el campo "Atrás"
     (offset de periodo). La calculadora de variaciones ganó **leyenda F/D** (Favorable/Desfavorable).
     (2) **Onboarding** — paso nuevo `presupuestos` en el grupo "Crece tu operación" de
     `getSetupProgress()` (`done` si la org tiene ≥1 cédula o ≥1 análisis; se agregaron 2 counts
     al batch de `withOrgTx`), con la descripción del grupo ampliada a incluir planeación. (3)
     **Soporte** — categoría NUEVA "Presupuestos y análisis"/"Budgets & Analysis" (slug
     `presupuestos`) en `SupportCards.astro` + ambas `category/[categoria].astro` (ES/EN), con 2
     artículos ES + 2 EN (`presupuestos-cedulas`, `herramientas-analisis`) escritos con copy 100%
     preciso vs. lo implementado (sin overpromising; documentan los límites reales). (4) **Roadmap**
     — item nuevo `presupuestos-cedulas` (id 13, área finanzas, `status: live`, `api: false`) en
     `roadmap-data.ts` (ES+EN). `npm run build` limpio; las páginas nuevas de roadmap/soporte/
     categoría se generan (ES+EN).
   • **Bug de UI previo corregido en la misma sesión (antes de las fases):** las páginas de
     Presupuestos (`presupuestos/index.astro` y `[id].astro`) usaban clases (`.modal`,
     `.modal-card`, `.btn-primary`, `.btn-ghost`, `.empty*`) que **nunca se definieron** — el
     `<dialog>` salía como popup nativo sin estilo y los botones sin diseño. Cada página Astro
     define sus propias clases scoped (no hay hoja global compartida para estas); se copió el CSS
     del mismo patrón de `clientes.astro`/`productos.astro` + estados vacíos de `analitica.astro`.
     También faltaba la clase `skeleton` (solo tenían `skeleton-line` → sin shimmer). ⚠️ Regla
     reconfirmada: al crear una página de app nueva con modal/botones, copiar el bloque CSS
     completo del patrón existente — no basta con usar los classnames.

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
