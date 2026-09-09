# Landing, páginas públicas y Support Hub — Cord

> Documento de estado actual: estructura de la landing, navegación, animaciones,
> páginas públicas especiales y arquitectura del Centro de Ayuda. Para decisiones
> fechadas consulta [`historial/landing-marketing.md`](../historial/landing-marketing.md).

---

## Landing — estructura (YA CONSTRUIDA)

La oferta principal del home y `/precios`, en ES/EN, comunica **5 envíos gratis
cada mes y hasta 5 cotizaciones activas a la vez**, sin tarjeta. El cupo de envíos
se renueva el día 1 (UTC); el stock de activas es independiente. `PlanValue.astro`
explica el recorrido Gratis → Starter (más envíos y quitar la marca de Cord) →
Profesional (equipo y cobranza). Conserva los precios y permisos existentes.
Dominio de correo en Scale y dominio de enlaces son capacidades distintas:
este último no se ofrece. No se establece un umbral por facturación cobrada.
Hero, CTA final, fichas, FAQs, metadata, JSON-LD, `pricing.md` y `llms.txt`
describen la misma oferta. Ver decisión en `historial/landing-marketing.md`.

`src/pages/index.astro` monta los componentes de `src/components/landing/` y maneja
las animaciones GSAP globales. Orden de secciones:

| Componente | Sección | Notas |
|-----------|---------|-------|
| `Nav.astro` | Navbar | Replica el sistema de flouvia (ver abajo) |
| `Hero.astro` | Hero | Gradient mesh + mockup de la app + trust strip |
| `Features.astro` | Producto (`#producto`) | Bento grid con mini-mockups |
| `Steps.astro` | Cómo funciona (`#como`) | 3 pasos sobre fondo navy |
| `ClientView.astro` | Experiencia del cliente | Mockup de teléfono del link público `/q/` |
| `Pricing.astro` | Precios (`#precios`) | 3 planes, el de en medio destacado en navy |
| `Faq.astro` | FAQ (`#faq`) | Acordeón animado (botones + grid 0fr→1fr; uno abierto a la vez) |
| `Footer.astro` | CTA final + footer | Navy, enlaza a flouvia.com. Acepta props `ctaTitle`/`ctaSub` (las subpáginas personalizan el CTA) |

**Filosofía visual (jun 2026):** referencias = **Stripe + Linear**, alma = **Flouvia**.
Minimalista, lujoso, mucho aire. Secciones con `padding: 9rem` vertical. Tipografía
grande (hero H1 `clamp(2.7rem, 6.2vw, 5rem)`). Gradient mesh sutil monocromático
navy (NO los colores saturados de Stripe). Glows suaves estilo Linear bajo los
mockups. **El mockup del producto es la pieza que vende** — cada uno es HTML/CSS puro
con montos en `.editorial` (Inter 600 tabular). El mockup del hero AUTO-REPRODUCE
la historia del producto en loop (ver "Hero story" abajo).

### Navbar (`Nav.astro`) — replica el sistema de flouvia-web

Es el mismo patrón que `../flouvia/src/components/Navbar.astro`, adaptado:
- **Glass pill** (izquierda) Liquid Glass con los nav-links + **indicador deslizante**
  (`#nav-indicator`, cápsula de vidrio que GSAP desliza al link en hover, estilo
  segmented control iOS).
- **Megamenús (jun 2026):** estructura = PRODUCTO · SOLUCIONES · PRECIOS · RECURSOS.
  Tres triggers `data-mega` (producto/soluciones/recursos), cada uno con su panel
  `.pill-mega[data-panel=…]`; la píldora se expande EN VERTICAL y revela el panel
  activo. Cerrado colapsa `width:0; height:0`; GSAP anima width/height midiendo
  `offsetWidth` antes/después; cambiar de trigger con otro abierto colapsa el
  anterior al instante y abre el nuevo. Items con stagger fade+blur,
  `border-radius 100px → 24px` vía `.mega-open`; caret rota con `.mega-active`
  en el trigger (no con `.mega-open` global). Abre con hover/click, cierra con
  mouseleave, links sin mega, scroll y Escape. Variantes `.scrolled` (navy).
  Links del nav usan rutas absolutas (`/#precios`) para funcionar desde subpáginas.
- **Logo central** `logo-cord-navy.png` (30px alto) que **desaparece al hacer
  scroll** y reaparece como `pill-logo` (`logo-cord-white.png`, 17px) dentro de la
  glass pill navy (misma mecánica que el logo de flouvia). En mobile: dos `<img>`
  apiladas (navy/white) que se intercambian por opacity con `.scrolled`.
- **Derecha:** píldora glass "Entrar" con ícono de usuario (`.nav-login-pill`,
  estilo flouvia.com; versión navy en `.scrolled`) + botón navy "Empezar gratis".
- **Estado `.scrolled`** (>50px): la glass pill pasa a versión navy translúcida; los
  links y wordmark cambian a blanco. Transición por-propiedad `0.7s var(--ease-spring)`.
- **Mobile:** píldora glass con hamburguesa + wordmark + CTA; overlay con `clip-path:
  circle()` que abre desde la esquina superior derecha; links en Inter 700 con
  stagger blur (sin megamenú en mobile).
- **Anti-flash:** gate `.js-anim #navbar { opacity:0 }` (is:global) + entrada GSAP que
  oculta las piezas, revela el contenedor y las entra con stagger. `clearProps` al
  terminar para que `.scrolled`/`:hover` gobiernen.
- Diferencias vs flouvia: selector ES/EN con rutas reales (`/` y `/en`); wordmark
  de texto en vez de logos SVG. El login-icon pill SÍ existe desde jun 2026
  (André lo pidió).

### Idioma público y frontera con la app

- La primera visita a `/` negocia ES/EN con `Accept-Language`, incluyendo sus
  pesos `q=`. Español permanece en `/`; inglés redirige temporalmente a `/en`.
  Si el navegador no declara ninguno de los dos idiomas, inglés es el fallback
  internacional; un header ausente o solo `*` conserva español para crawlers.
- El selector manual gana sobre la detección y persiste un año en la cookie
  host-only `cord_public_lang`. Sus links usan `?lang=es|en` solo como señal al
  middleware en SSR; `Nav.astro` persiste la misma preferencia desde páginas
  prerenderizadas y limpia el query antes de navegar a la URL canónica.
- `publicPath()` en `src/i18n/utils.ts` es el único constructor de enlaces
  localizados de la landing. Solo agrega `/en` a familias que tienen una ruta
  inglesa real. `/app`, auth (`/sign-in`, `/sign-up`), links públicos (`/q`,
  `/i`) y los casos de uso ES-only conservan su ruta global.
- El middleware recupera bookmarks generados por el helper anterior —por
  ejemplo `/en/app`, `/en/sign-in`, `/en/q/demo` y `/en/casos-de-uso/*`— y los
  normaliza antes de que Astro responda 404.

### Animaciones de la landing (`index.astro`) — refinadas jun 2026 (Stripe/Linear)

> El usuario RECHAZÓ: botones magnéticos, ripple de click y tilt 3D con el cursor
> ("lo típico"). No reintroducirlos. El lenguaje actual es sutil y craft:

- **Masked line reveals (Linear):** los títulos (`.hero-title, .ft-title,
  .steps-title, .cv-title, .pr-title, .faq-title, .fc-title`) se parten por `<br>`
  en líneas envueltas en `.m-line` (overflow hidden) + `.m-line-in`; cada línea sube
  con `yPercent: 115 → 0`, `power3.out`, stagger 0.09–0.11. El util `wrapLines` los
  procesa al cargar; esos títulos quedan EXCLUIDOS del reveal genérico (`maskedSet`).
- **Mockup settle (Stripe):** el mockup del hero entra con `rotationX: 9` y
  perspectiva, y se APLANA con scrub conforme baja el scroll (`top 88%` → `top 32%`).
- **Hero story (jun 2026):** el mockup del hero narra el loop del producto:
  badge `#mkStatus` cicla Enviada (azul) → Vista (ámbar) → Aprobada (verde) con
  pop, el toast `#mkToast` aparece en "Vista", los eventos `[data-story]` del
  timeline se encienden en orden y el chip `#mkChip` (CFDI timbrado) entra al
  aprobar; loop infinito con fade de cierre. El HTML por defecto es el estado
  FINAL (Aprobada) → sin JS/reduced-motion queda estático y completo.
- **Micro-demos bento (jun 2026):** en `.ev-edit` el precio baja en vivo
  (191.48 → 168.50) con flash verde y el chip −12% hace pop; el check del CFDI
  entra con pop. ScrollTrigger `once:true`.
- **Demo del teléfono (ClientView):** auto-reproducible al entrar en viewport —
  count-up del monto, items en stagger, cursor SVG que se desliza y "clickea"
  Aprobar (anillo verde de pulso), checkmark que se dibuja (strokeDashoffset),
  overlay de éxito; loop con repeatDelay 3.4s.
- **Count-up** de números (`[data-countup]` + `data-decimals`) al entrar en
  viewport — formato `Intl.NumberFormat('es-MX')`.
- **Parallax scrub** en hero-mesh. (Los watermarks de steps/footer se ELIMINARON
  jun 2026 a petición de André — ver regla de watermarks abajo.)
- **Reveals genéricos** (`.reveal`): patrón anti-parpadeo — `gsap.set` oculta +
  `ScrollTrigger {once:true, onEnter: gsap.to}` con `clearProps: 'transform'`
  (NUNCA limpiar opacity — el gate lo volvería a ocultar; bug conocido).
- Gate global `.js-anim .reveal/.reveal-mockup { opacity:0 }`; estilos `.m-line`
  en `<style is:global>`.
- `prefers-reduced-motion` → return temprano, todo visible y estático.
- El navbar maneja su PROPIA entrada (no la toca `index.astro`).

---

## Blog y newsletter

`/blog` y `/en/blog` comparten `BlogCTA.astro`. La suscripción usa doble opt-in
y mantiene separados los dos carriles de correo:

- los correos transaccionales siguen usando `RESEND_API_KEY` y `RESEND_FROM`;
- el blog usa Resend Marketing con `blog@cordhq.app`, llaves propias y
  segmentos separados para español e inglés;
- `POST /api/blog/subscribe` crea o renueva una solicitud `pending` en
  `blog_subscribers` y manda un enlace de 24 horas;
- `GET /api/blog/confirm` crea/reactiva el Contact en Resend solo después del
  clic y lo agrega al segmento de su idioma;
- `/api/resend/marketing-webhook` verifica la firma Svix y refleja bajas o
  eliminaciones en Neon. Resend es la fuente de entrega y supresión; Neon guarda
  la evidencia de consentimiento;
- `/blog/suscripcion` y `/en/blog/subscription` muestran el resultado sin
  indexarse.

Los Broadcasts deben enviarse al segmento correspondiente e incluir el enlace
de baja administrado por Resend. Las variables operativas viven únicamente en
`.env.example`.

---

## Cord Build — edición fundadora (`/build`)

- `/build` y `/en/build` comparten `components/build/BuildPage.astro` y el
  catálogo `i18n/build.ts`. Ambas son SSR; `/build` negocia idioma con la misma
  cookie/preferencia que la raíz, mientras `/en/build` es una URL inglesa explícita.
  El selector, el formulario, las fechas relativas y el retorno de pago preservan
  el idioma. La subasta sigue denominada en MXN hasta definir el contrato de USD;
  cambiar de idioma no cambia símbolos ni importes a escondidas.
- Comparte `Layout`, navbar, footer e Inter con la landing. El hero usa un bento
  de la edición fundadora, presencia de marca y seis meses de Scale; ya no simula
  estados de propuestas y pagos del producto.
- `BuildWall3D.tsx` conserva su nombre histórico, pero dibuja dos cordones SVG
  de borde a borde con cinco logos cada uno, sin WebGL ni panel contenedor.
  El mouse aporta impulso a un movimiento amortiguado que se detiene; móvil y
  movimiento reducido no dependen de hover. La selección mantiene el detalle aparte.
- El feed público se actualiza cada 12 segundos solo con la pestaña visible;
  conserva la selección, permite reintentar y no inventa actividad ante errores.
  Los enlaces de las marcas confirmadas usan `noopener noreferrer sponsored`.
- Historial, montos y acciones tienen estilos también para nodos creados en runtime;
  el importe nunca se oculta en móvil. Reembolso en proceso y procesado son distintos.
- Con `BUILD_AUCTION_LIVE` deshabilitado, se puede explorar la posición y preparar
  los datos localmente. El formulario explica la vista previa; tanto el envío como
  el endpoint de cobro fallan cerrado. No se presenta un contador activo de subasta.
- **Pendiente de lanzamiento:** completar y verificar cierre, cobro del saldo,
  reembolsos y activación/expiración efectiva de Scale. Las funciones preparadas en
  schema no equivalen a este flujo completo. No abrir cobros solo cambiando el gate.
- Reparación aditiva del feed: `scripts/migrate-build-public-state.mjs` añade
  únicamente `current_logo_url` y `current_website_url`. No altera ofertas, fechas,
  precios ni suscripciones y es segura al repetirse.
- Verificación: `test/build-auction.test.ts` y `scripts/verify-build-ui.mjs`
  (navegador aislado, datos reales de lectura y fixtures solo de navegador;
  no crea ofertas ni procesa pagos).

## Página 404 pública

`src/pages/404.astro` usa navbar y footer globales sobre una composición clara
Apple/Cord. El hero muestra un `404` vectorial, copy de recuperación, CTA al inicio
y accesos aireados a producto, precios y soporte.

- El único shader es `src/components/CordDynamicBg.jsx`, el aurora GLSL compartido.
  No crees otro shader ni lo simules con gradientes CSS animados.
- `CordDynamicBg` acepta `maskImage`, `maskSize`, `maskPosition` y `maskRepeat`.
  La máscara vive en el `div` raíz React para recortar canvas, grano y color base
  sin cambiar a los consumidores que no pasan props.
- `public/404-mask.svg` usa paths vectoriales, no texto dependiente de una fuente.
- `.error-number__fallback` conserva la misma máscara y cubre carga inicial,
  ausencia de WebGL y `prefers-reduced-motion`.
- La isla usa `client:load`: entrega raíz y fallback en SSR, e inicia WebGL después
  de hidratar cuando entra en viewport.
- Fondo `#f5f5f7`, CTA navy en píldora con hover/active/focus; los tres accesos
  inferiores colapsan a una columna en móvil.

## Estado público de la plataforma

`/desarrolladores/status` y `/en/desarrolladores/status` son SSR y reportan solo
mediciones persistidas en `health_checks`. Un cron autenticado ejecuta una vez al
día tres sondas sintéticas: consulta mínima a Neon, lectura autenticada de la API
de plataforma de Stripe y render completo de `/q/demo`. La cadencia está ajustada
a Vercel Hobby, que no admite ejecuciones subdiarias y puede iniciar el cron en
cualquier momento dentro de la hora programada.

- una muestra ausente u obsoleta conserva la interfaz completa en estado neutral
  (“monitoreo en preparación” o “esperando muestras”), nunca verde;
- una muestra diaria permanece vigente 26 horas; perder la siguiente ejecución
  devuelve el estado público a neutral;
- los porcentajes son comprobaciones correctas dentro de una ventana máxima de
  90 días y se describen explícitamente como medición sintética, no como SLA;
- cada selector muestra la historia diaria real de su servicio; antes de la
  primera muestra solo se dibuja una guía neutral, sin fechas ni porcentajes;
- `status_incidents` no tiene semillas. Los incidentes bilingües se crean y
  actualizan manualmente desde `/ops/status` y quedan en la auditoría de Ops;
- si el schema no está migrado o Neon no responde, la página conserva un estado
  honesto sin afirmación de disponibilidad.

---

## Roadmap público

`/roadmap` y `/en/roadmap` comparten `src/components/roadmap/RoadmapPage.astro`;
los detalles comparten `RoadmapDetail.astro`. Los cuatro archivos de ruta solo
resuelven idioma, slug y `getStaticPaths`, por lo que el comportamiento ES/EN no se
duplica.

- `src/lib/roadmap-data.ts` es la fuente única de 19 iniciativas. Cada entrada declara
  familia (`quotes`, `payments`, `invoicing`, `platform`), mercado, flujo, alcance,
  límites y relaciones además de estado y disponibilidad de API.
- La lista separa Cord Invoicing como producto, CFDI 4.0 (México), Verifactu
  (España), validación de Constancia/RFC y facturación comercial internacional.
  Cord Payments tiene iniciativa propia y explicita los ocho mercados con cobro en
  línea, SPEI solo para MXN de cuentas mexicanas y pagos manuales donde Connect no
  está disponible.
- En escritorio los filtros forman una columna lateral compacta; debajo de `1024px`
  quedan cerrados dentro de un disclosure. Tabs, filtros activos, conteo, vacío y
  navegación por teclado comparten el mismo script. Las filas filtrables no usan
  reveals individuales: `[hidden]` las saca explícitamente del layout para que el
  conteo, lo renderizado y lo visible siempre coincidan al cambiar filtros.
- Cada detalle incluye resumen, metadatos de disponibilidad/producto/alcance, cuerpo
  editorial, flujo, límites claros e iniciativas relacionadas.

---

## Fases históricas de construcción

> Esta lista conserva la secuencia original del proyecto. Clerk fue reemplazado
> por auth propio; el estado vigente está en [`proyecto.md`](../proyecto.md).

1. **Núcleo** — auth, schema, CRUDs, editor de cotizaciones y dashboard
2. **Loop completo** — link público `/q/{token}` + tracking `viewed` + PDF + emails (Resend)
3. **Dinero** — Stripe Billing (límites del free) + pago en línea de cotizaciones
4. **CFDI + cierre** — timbrado (mismo PAC que la app de Shopify), pulir landing,
   listar Cord en `apps.ts` y footer de flouvia.com

---

## Support Hub Architecture (Astro Content Collections)

El Centro de Ayuda (`/soporte`) es un sistema de documentación *Stripe-level* impulsado por **Astro Content Collections**.

- **Estructura de Datos:** Los artículos viven en `src/content/support/*.md`. Contamos con ~61 artículos enriquecidos y estructurados con Markdown alerts (`> [!NOTE]`).
- **Ruteo Dinámico (`prerender = true`):** 
  - `src/pages/soporte/[slug].astro`: Plantilla de lectura con Sidebar dinámico izquierdo (artículos relacionados), Breadcrumbs y Paginación Siguiente/Anterior.
  - `src/pages/soporte/categoria/[categoria].astro`: Índice de categoría en formato de lista minimalista (diseño cardless corporativo).
- **Buscador Client-Side:** El autocompletado en `SupportHero.astro` consulta `/api/support-search.json.ts` y filtra en el cliente para latencia cero.
- **Diseño sin Emojis:** Todos los íconos de soporte utilizan SVGs estilo Lucide en lugar de emojis de texto. Todo el estilo "tarjeta" pesado fue removido en favor de fondos transparentes, divisores sutiles y estética corporativa.
- **Rutas Rápidas (Quick Links):** Se eliminó el diseño "Bento grid" asimétrico, reemplazándolo por una lista vertical minimalista (Simple Hairline List) que ocupa el 100% del ancho, alineada visualmente con las FAQs y el bloque editorial.

## Guías de confiabilidad y centro de ayuda

Docs ES/EN contiene `pagos/mejoras-confiabilidad`, enlazada desde Empezar y Pagos.
El índice de búsqueda deriva de la colección e incluye las nuevas guías. Ayuda
explica saldo, pagos/créditos/reembolsos, enlaces de factura, recurrencias y cambio
de método. La FAQ distingue anulación, nota de crédito y devolución. El roadmap
`confiabilidad-operativa` permanece en `next` con progreso y límites explícitos.
Ver [confiabilidad.md](confiabilidad.md) para evidencia y pendientes; esta página
no certifica publicación ni cambia el estado de los dominios propios.
