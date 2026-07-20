# Historial — Landing, Marketing y Mockups

> Landing pública (home, precios, producto, soluciones, casos de uso, blog, soporte,
> roadmap, legales), mockups de UI, shaders GLSL/WebGL, SEO/AI-SEO, navbar/footer,
> copy y contenido de marketing. Extraído de `historial.md`. Orden: más reciente arriba.

---

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

✅ **Rediseño Premium de ProductAccordion (jul 2026)** — André pidió refinar la plantilla de producto para hacerla sentir "Apple super premium" y menos vacía. 
   • **Iconografía "Glass Duotone":** Se reescribieron los 14 iconos SVG (`ICONS` en `ProductAccordion.jsx`) cumpliendo la Regla 9 (figuras intrincadas, `strokeWidth=1.75`, capas superpuestas de `fillOpacity`).
   • **Etiquetas verticales enriquecidas:** Las tarjetas inactivas ahora muestran `{label} · {title}` verticalmente, eliminando el espacio vacío que dejaba solo el número.
   • **Coreografía fluida (GSAP):** Animación de apertura cambiada de `hover` a `clic`. Se reemplazó el easing por `power4.out` con delays escalonados para emular la elasticidad y fluidez de iOS.
   • **Equilibrio de proporciones:** Se mantuvo el `max-width: 1260px` global pero se rebalancearon los flex-grow (`ACTIVE_GROW=5.0`, `RESTING=[1.5, 2.2, 1.8, 2.5]`). La tarjeta activa concentra mejor la tipografía (`max-width: 600px`), eliminando el exceso de espacio en blanco lateral sin romper la cuadrícula.

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

✅ **Navbar con estado de sesión (jun 2026)** — `Nav.astro` detecta sesión en el cliente
   vía `$authStore` de `@clerk/astro/client` (nanostores). El markup estático (landing
   `prerender:true`) muestra por defecto "Entrar" + "Empezar gratis"; al detectar sesión
   se intercambian a "Ver planes" (`/precios`) + "Ir al Dashboard" (`/app`). Cubre las 3
   zonas: botones derecha desktop, CTA inferior móvil y overlay del menú móvil. Usa
   `data-auth-swap`/`data-in-*`/`data-out-*` como atributos de datos en los nodos del DOM;
   el script se suscribe a `$authStore` y aplica el cambio al resolver. Sin FOUC para el
   visitante anónimo (el caso común de la landing); swap ocurre tras carga de clerk-js.

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

✅ **Páginas legales (jun 2026)** — `/privacidad` (Aviso de Privacidad Integral LFPDPPP+DPA,
   14 secciones: responsable/encargado, sub-processors, transferencias internacionales, ARCO,
   portabilidad, brechas) y `/terminos` (17 cláusulas: PI, metered billing, autorización débito,
   actividades prohibidas EFOS/lavado, SLA, límite de responsabilidad, API, uso de marca,
   cancelaciones sin reembolso, ley aplicable México/CDMX). Ambas `prerender:true`, grid
   TOC sidebar sticky con scrollspy `IntersectionObserver`, animaciones `PageAnims`
   (`masked-title` en H1, `reveal` en grid), microinteracciones CSS puras (subrayado expansivo
   en links, `translateX` activo en TOC, bullet `scale`, hover rows tabla).

✅ **Footer Stripe/Linear (jun 2026)** — rediseño premium estilo Stripe/Linear sin badges, sin prefijos numéricos, con tipografía sutil, enlaces gris técnico que hacen fade a blanco y enlace directo a soporte. Grid asimétrico (2fr 6fr). Se añadieron íconos sociales (Instagram, TikTok, X) usando SVG nativo en la base del footer, y se actualizaron los enlaces de la columna Recursos (`/blog`, `/precios`, `/planes-soporte`).

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
