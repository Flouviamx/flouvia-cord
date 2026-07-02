# Landing, Fases y Support Hub — Cord

> Estructura de la landing (componentes, navbar, animaciones GSAP), fases de
> construcción y arquitectura del Centro de Ayuda. Auto-cargado vía `@import`.

---

## Landing — estructura (YA CONSTRUIDA)

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
- Diferencias vs flouvia: SIN lang switch (v1 solo español); wordmark de texto en
  vez de logos SVG. El login-icon pill SÍ existe desde jun 2026 (André lo pidió).

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

## Fases de construcción

1. **Núcleo** — Clerk + schema + CRUDs + editor de cotizaciones + dashboard
2. **Loop completo** — link público `/q/{token}` + tracking `viewed` + PDF + emails (Resend)
3. **Dinero** — Stripe Billing (límites del free) + pago en línea de cotizaciones
4. **CFDI + cierre** — timbrado (mismo PAC que la app de Shopify), pulir landing,
   listar Cord en `apps.ts` y footer de flouvia.com

---

## Support Hub Architecture (Astro Content Collections)

El Centro de Ayuda (`/soporte`) es un sistema de documentación *Stripe-level* impulsado por **Astro Content Collections** (Astro 6.0).

- **Estructura de Datos:** Los artículos viven en `src/content/support/*.md`. Contamos con ~61 artículos enriquecidos y estructurados con Markdown alerts (`> [!NOTE]`).
- **Ruteo Dinámico (`prerender = true`):** 
  - `src/pages/soporte/[slug].astro`: Plantilla de lectura con Sidebar dinámico izquierdo (artículos relacionados), Breadcrumbs y Paginación Siguiente/Anterior.
  - `src/pages/soporte/categoria/[categoria].astro`: Índice de categoría en formato de lista minimalista (diseño cardless corporativo).
- **Buscador Client-Side:** El autocompletado en `SupportHero.astro` consulta `/api/support-search.json.ts` y filtra en el cliente para latencia cero.
- **Diseño sin Emojis:** Todos los íconos de soporte utilizan SVGs estilo Lucide en lugar de emojis de texto. Todo el estilo "tarjeta" pesado fue removido en favor de fondos transparentes, divisores sutiles y estética corporativa.
- **Rutas Rápidas (Quick Links):** Se eliminó el diseño "Bento grid" asimétrico, reemplazándolo por una lista vertical minimalista (Simple Hairline List) que ocupa el 100% del ancho, alineada visualmente con las FAQs y el bloque editorial.
