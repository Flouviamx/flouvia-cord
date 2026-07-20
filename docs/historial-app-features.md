# Historial — App interna: features y UX

> Todo lo que vive dentro de `/app/**`: shell (sidebar/topbar/ajustes), editor de
> cotizaciones, link público `/q`, dashboard, cobranza, onboarding, dark mode, entorno
> de prueba, chat, tiempo real. Extraído de `historial.md`. Orden: más reciente arriba.

---

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
     Presupuestos/CFO — `git mv` de `productos.astro` a `productos/index.astro`, ajustando la
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
     ("Sugerido: $X (72% cierra)", mismo lugar donde ya vivía la nota de precio por volumen)
     — un clic aplica el precio y dispara el flash de margen existente. El hint desaparece
     solo cuando el precio de la línea ya coincide con el sugerido. Sin cambios de schema.
   ⬜ **Límite conocido de v1 (a propósito, para no sobre-construir antes de validar uso
     real):** la sugerencia se calcula una vez al agregar la línea; si el vendedor cambia de
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
