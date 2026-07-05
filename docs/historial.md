# Historial y Estado actual — Cord

> Extraído de `CLAUDE.md` para organización. Registro cronológico de features,
> decisiones de arquitectura y bugs resueltos. **La fuente de reglas core sigue
> siendo `/CLAUDE.md`.** Este archivo se auto-carga vía `@import` desde CLAUDE.md.

---

## Estado actual (jun 2026)

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
     contra la API REAL: `cord.flouvia.com/api/v1`, Bearer `sk_test_`/`sk_live_`, montos en **pesos**,
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
     Dashboard, webhook en `https://cord.flouvia.com/api/clerk/webhook` con los 8 eventos
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
   que se revirtió a los `Custom*`. **El "Entorno de prueba" (`testMode.ts` / `cord_test_mode`)
   es COSMÉTICO**: solo cambia el prefijo de API key mostrado en Ajustes › Developers; NO
   aísla datos de test (no hay sandbox real). ⚠️ Auth en re-trabajo activo (André): hay
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

⬜ Pendiente (no bloquea lanzamiento): `FACTURAPI_API_KEY` live en prod;
   `USInvoiceProvider` real (US); publicar `@flouviahq/elements` v0.2.0 (`npm login && npm
   publish`); "tiempo real" full vía SSE/WebSocket (hoy es polling). Deuda menor: el "Entorno de
   prueba" es cosmético (solo cambia el prefijo de API key mostrado); `/api/*` aún no migra a
   `withOrgTx` (pendiente para activar `FORCE ROW LEVEL SECURITY`); rate-limit del middleware es
   in-memory por instancia (para escala multi-réplica usar Upstash Redis); y 5 vulnerabilidades de
   `npm audit` de bajo riesgo (esbuild dev-Windows / path-to-regexp build-time) cuyo fix exige
   downgrade breaking de `@astrojs/vercel`.
