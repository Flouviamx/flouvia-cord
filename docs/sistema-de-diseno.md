# Sistema de Diseño — Cord

> Extraído de `CLAUDE.md` para organización. Tokens de diseño, reglas visuales
> detalladas y componentes de UI. **Las 9 reglas core de diseño viven en `/CLAUDE.md`;**
> este archivo es el detalle extendido. Auto-carga vía `@import`.

---

## Diseño — sistema Flouvia adaptado a producto

Regla de oro: **misma alma, distinto cuerpo**. Tokens en `src/layouts/Layout.astro`
(`:root` global). Referencias visuales: **Stripe, Linear, Apple, Aesop**.

**Tokens disponibles:**
```css
--color-bg: #ffffff;  --color-bg-soft: #fcfcfc;  --color-blue-deep: #0a192f;
--color-text: #050505;  --color-text-muted: #555556;  --color-border: rgba(0,0,0,0.08);
--color-ok: #10b981;     /* aprobada / pagada */
--color-warn: #f59e0b;   /* pendiente / por vencer */
--color-danger: #ef4444; /* vencida / rechazada */
--font-sans: 'Inter';   /* --font-serif ELIMINADO jun 2026 — Inter única */
--ease-ios / --ease-spring / --ease-smooth   /* mismos que flouvia */
```

**Reglas tipográficas:**
- **Landing/login en Inter; la APP usa tipografía de SISTEMA (jun 2026, petición
  de André: "tipo Apple")** — AppLayout define `--font-sans: -apple-system,
  BlinkMacSystemFont, 'SF Pro Text', …` y NO carga Google Fonts. La landing
  (Layout.astro) sigue cargando solo Inter (weights 400–900).
- Sin serif — André pidió ELIMINARLAS (jun 2026). NO reintroducir Instrument Serif
  ni itálicas decorativas.
- **Montos y números** → clase `.editorial` (definida global en ambos layouts):
  Inter weight 600, `letter-spacing: -0.03em`, `font-variant-numeric: tabular-nums`.
  Es la firma "fintech" del producto (estilo Stripe). Nunca serif, nunca italic.
- **Headings 100% Inter bold** — sin palabra-acento.
- Eyebrows: `0.65rem`, weight 800, letter-spacing 3px, uppercase, color `#888`.
- **Logos oficiales** (`public/imgs/`): `logo-cord-navy.png` para fondos claros,
  `logo-cord-white.png` para fondos oscuros (sidebar de la app, footer, pill
  scrolled, mockups). Recortados a 780×300. NO recrear el wordmark con texto.

**Layout / componentes:**
- ⛔ **NADA de rejillas de tarjetas/cards como patrón de UI nueva (jun 2026, regla
  de André: "las cards no me gustan").** No construir hubs, índices, listados de
  features/integraciones ni settings con grids de tiles con borde+sombra. Preferir
  el estilo **Stripe/Linear de LISTAS**: filas con hairline (`border-bottom`),
  ícono + título + descripción en línea, tablas, secciones con eyebrow + hairline
  y mucho aire. Ejemplo canónico = índice de Ajustes (`/app/ajustes`) e
  integraciones (filas, NO tarjetas), al igual que **todas las FAQs y la página de Soporte**.
- **Airy Bento:** Cuando se requiera un layout de cuadrícula para navegación rápida (como las Quick Routes), no se deben poner líneas ni fondos divisorios por defecto. Usar `gap` generoso, fondos transparentes, iconos SVG delgados (stroke 1.2 - 1.5) y aplicar efectos de fondo únicamente durante el `:hover`.
- **Sidebar Ultra-Compacta (Premium Linear-style)**: El sidebar colapsado ahora tiene 56px de ancho absoluto (bypass de Astro optimizer en `AppLayout.astro`) para mantener el "soul" Linear. Los íconos no se centran, sino que mantienen `padding-left` con microinteracciones táctiles de `scale(0.94)` al click (`:active`). El z-index de la sidebar se elevó globalmente a 800 para prevenir overlapping del contenido principal.
- **Org Switcher Sólido**: El `<CustomOrgSwitcher />` y la cuenta tienen z-index masivo global (9999) y un background blanco/navy absoluto (inyectado via `<style is:inline>`) con sombras agresivas para separarlo físicamente del efecto Liquid Glass de la sidebar. Esto previene ilusiones de translucidez o superposición del dashboard tanto en modo expandido como colapsado.
- Secciones de la landing: `padding: 9rem` vertical (mucho aire, estilo Stripe/Linear).
- **Watermarks gigantes: ELIMINADOS del index (jun 2026, petición de André) — NO
  reintroducirlos en la landing.** Solo sobreviven en login/registro y en /q
  (fondo "Cord"). Si se usan ahí: Inter 800, letter-spacing −0.06em (`rgba(0,0,0,0.025)`
  claro / `rgba(255,255,255,0.025)` oscuro) **solo en landing/login** — dentro de la
  app NO (es herramienta, no editorial).
- Liquid Glass (blur + rim light + specular) en: navbar, topbar de la app y segmented
  controls de filtros. Patrón exacto en `Nav.astro` y en el navbar de flouvia-web.
- Sección oscura: `radial-gradient(ellipse at 20% 50%, #112240 0%, #0a192f 65%, #050b14 100%)`.
- Cards: border-radius 22–24px, sombras luxe. NO borders blancos en fondo oscuro —
  usar box-shadow profundo + `inset 0 0 0 0.5px rgba(255,255,255,0.06)`.
- Mockups: navy `#0a192f`, sombras muy profundas (`0 50px 100px -36px`), glow radial
  debajo (`.mockup-glow` / `.cv-glow`).

**Hovers:** `translateY(-2 a -4px)` + sombra, transiciones 0.4–0.6s, `--ease-spring`.
Sin scale dramático (max 1.03). Sin magnetic, sin back.out, sin elastic.

**Animación:** estándar único — `power2.out`, fade + `y:14–18`, stagger 0.08, gate
`.js-anim`. `expo.out`/`power3.out` solo para scrub o la entrada del navbar. SOLO en
landing/login. Dentro de la app: CSS animations simples (patrón portal de flouvia).
Sin SplitText, sin blur/scale en reveals de contenido.

**Bugs conocidos (heredados de flouvia, aplican igual):**
- Anti-FOUC: gate `.js-anim` (script is:inline en `<head>` del Layout, ya puesto).
- Anti-parpadeo de reveals: `gsap.set` oculta + `ScrollTrigger{once,onEnter:gsap.to}` —
  nunca `gsap.from`+`immediateRender:false`.
- `clearProps:'transform,opacity'` tras el reveal para liberar hovers.
- `overflow: clip` (no `hidden`) para no romper `position: sticky`.
- Estilos de DOM inyectado en runtime (Clerk, librerías) → `<style is:global>` porque
  Astro scopea con `[data-astro-cid]` y el DOM inyectado no lo lleva.
- `Clerk.signOut(cb)` necesita callback para no auto-navegar.
- **Error 500 / TypeError de Clerk en SSR (Pantalla Blanca):** Al usar componentes de React de Clerk (como `<WorkspaceSwitcher />`, `<SignInForm />`, etc.) dentro de `.astro`, **siempre** usar `client:only="react"`, NUNCA `client:load`. Clerk depende de `<ClerkProvider>`, el cual no existe en el SSR de Astro. Usar `client:load` causa que Astro intente pre-renderizarlo en servidor, provocando un crasheo interno en Vite ("TypeError: Cannot read properties of undefined") y dejando la pantalla blanca.
- **Corrupción de caché de Vite (tsconfig.json):** Mantén la configuración de TypeScript nativa de Astro. Forzar `"jsx": "react-jsx"` en `compilerOptions` corrompe el servidor de desarrollo (`npm run dev`) tirando TypeErrors fantasmas durante la transformación de dependencias. Si esto ocurre, borrar `.vite`, `.astro`, `node_modules` y hacer un `npm install` limpio.

---

## UI Components & Aesthetics

### Sidebar Navigation (AppLayout)
El componente `Sidebar.astro` es el menú principal de la app y presenta un diseño "Linear-style" / "macOS Dock".
- **Acordeones de Grupo:** Las cabeceras de los grupos (ej. "Principal", "Dinero") utilizan `grid-template-rows: 0fr/1fr` para lograr un colapso ultra-fluido impulsado puramente por CSS.
- **Dock Mode (Collapsed):** El modo colapsado funciona como una "isla flotante" o "Dock de iPad". Los iconos se escalan a cuadrados de 42x42px perfectamente centrados.
- **Normal Mode (Expanded):** Sigue la misma filosofía limpia que el modo Dock. Utiliza hover elástico sutil (sin físicas excesivas) y textos sólidos. El indicador de ítem activo es un cuadro de cristal líquido (`backdrop-filter`) idéntico en ambos modos, asegurando cohesión visual.
- **Microinteracciones:** Las tooltips en modo colapsado utilizan `transform-origin: left center` para brotar elásticamente desde el ícono. El indicador de ítem activo es una "pastilla de cristal" calculada matemáticamente en JS mediante `getBoundingClientRect()` para evitar bugs de offsetTop en anidamientos CSS.
- **Sombra Premium:** `--sb-shadow` iguala de forma idéntica la sombra doble de la `topbar` (`0 12px 36px -8px rgba(10,25,47,0.14)`) para asegurar que la sidebar no luzca plana frente al resto de los paneles, creando un volumen 3D ultra-premium.

### Blog Aesthetics (WebGL GLSL — ElevenLabs Pattern)
El blog público (`/blog`) usa portadas generadas por **WebGL puro** (`BlogCover.jsx`, `client:only="react"`), no CSS ni fotografías.
- **Portadas GLSL:** FBM de 5 octavas con domain-warp de 2 capas → gradiente orgánico fotográfico. Tonemap Reinhard + dither. Reactivo al mouse (parallax UV shift) y al giroscopio en móvil. IntersectionObserver pausa el RAF cuando el canvas no está visible.
- **Paletas por categoría:** `PAL` en `BlogCover.jsx` — 3 stops dark→mid→highlight. `Finanzas`=navy/azure, `Ventas B2B`=teal/cyan, `Fiscal`=forest/mint, `Tecnología`=purple/lavender, `Operaciones`=warm/gold.
- **Overlay de título:** scrim bottom-up con texto blanco Inter 700, bottom-left en todos los cards. `featured=true` usa fuente mayor (`clamp(1.6rem,2.8vw,2.4rem)`).
- **Watermark de categoría:** ícono SVG a 9% de opacidad blanco, arriba-derecha, por encima del canvas pero bajo el título. Textura subpixel sin competir con el gradient.
- **Layout `/blog`:** header limpio `<h1>` + LinkedIn link, featured `21/9` full-width con metadata bar compacta, filtros inline sin sticky, grid `3/2` sin excerpt.
- **Avatares Minimalistas:** inicial estilizada (`.fc-avatar`) — círculo con gradiente azul Cord en la metadata bar del featured card. Sin fotografías de autor.

### Navbar & Mobile UX
- **Mobile Navbar Refinements:** Se corrigieron los estilos del language switcher (ES/EN) en la vista móvil (Glassmorphism + dark text en selección). Se ajustó la posición para no saturar la cabecera y se reubicó arriba del footer.
- **Autenticación (CTAs):** Se invirtieron las acciones primarias en la navegación móvil con sesión activa. Ahora el Dashboard es la acción principal a la izquierda, logrando más fluidez para los usuarios recurrentes.

### Roadmap Aesthetics
El roadmap público (`/roadmap` y `/en/roadmap`) fue rediseñado para alcanzar un estándar estético ultra sobrio, corporativo y nivel "Cord Premium".
- **Glassmorphism y Sombras:** Los filtros de navegación en la barra lateral ahora residen dentro de una tarjeta (`.rd-sidebar-card`) con una leve sombra flotante plana y bordes refinados.
- **Filtros tipo Píldoras:** Los filtros select (`.rd-select`) pasaron de tener diseños web tradicionales a lucir como píldoras suaves semi-transparentes que armonizan con el glassmorphism del proyecto.
- **Microinteracciones en filas:** Las filas de productos (rows) desecharon el fondo estilo "tarjeta tradicional". Al hacer hover, una leve opacidad de fondo (`var(--color-bg-soft)`) acompañada de un sutil `scale(0.995)` recrea una física de presión profunda, evitando estilos brillantes o saturados.
- **Toggles "Estilo Apple":** Los interruptores de filtrado utilizan dimensiones, comportamiento y colores fieles a iOS (`#D1D1D6` inactivo en modo claro, `#39393D` en modo oscuro, `#34c759` al encender).
- **Control Segmentado (Tabs):** Se eliminó el "control de tarjetas anidadas" en favor de etiquetas simples y sobrias con pesos gruesos (`font-weight: 800`), logrando que el layout de lectura prime sobre los adornos excesivos. Las páginas de producto individual (doc) también eliminaron los "badges" estilo píldora a favor de simple texto de color corporativo.
✅ **Rediseño visual y estructural de SSO (jun 2026)** — `/app/ajustes/sso` ahora presenta un diagrama de flujo horizontal premium con avatares de cristal integrados, mejorando el feeling premium B2B. Los botones "Empezar configuración" y "Documentación" ahora apuntan a rutas reales (`/app/ajustes/sso/configuracion` y el Centro de Ayuda `/soporte/configuracion-sso`). Se generaron los artículos correspondientes en ES/EN.
✅ **Refinamiento UI Páginas de Soluciones (jun 2026)** — Se rediseñó la página de soluciones (`/soluciones/[slug].astro`) para alcanzar el más alto nivel "Pro SaaS / Apple":
   • **Mockups hiper-realistas:** Se sustituyeron las representaciones abstractas de SVG por interfaces que simulan ser el software real (paneles de ingresos, consola terminal interactiva de sync, menú nativo de seguridad con toggles).
   • **Eliminación de adornos:** Se removieron los botones decorativos de ventana "tipo Mac fake" a petición de diseño, resultando en headers funcionales extremadamente limpios y sobrios.
   • **Simplificación de Copy:** Se eliminó la sección de métricas e hitos promocionales estáticos, testimoniales en bloque, y un CTA intermedio redundante. Todo el flujo se simplificó dejando un funnel directo hacia el footer.
   • **Nueva sección "Herramientas Avanzadas":** Se duplicó la estructura de bloque asimétrico (grid) para incorporar mockups detallando el Motor de Reglas de Negocio, Reportes en Tiempo Real (Métricas Core) y Multi-Entidad/Divisas.
   • **Centrado de layout:** El bloque nativo de "Preguntas Frecuentes" fue centrado de forma consistente con el resto del ecosistema de Cord.

- No usar 'badges' o etiquetas tipo pill flotantes encima de los títulos del hero, el usuario prefiere un diseño más limpio sin badges.
✅ **Rediseño "Full-Bleed" y Gráficos CSS Avanzados (jun 2026)** — Actualizaciones a la página de Startups (`/soluciones/startups`):
   • **Carruseles Full-Bleed con Scroll-Padding:** Se reestructuraron los contenedores de los carruseles (Casos de Uso e Integraciones) sacándolos del contenedor principal para que ocupen `100vw`. Se utilizó un cálculo de `padding-left` dinámico (`calc(50vw - 550px)`) para alinear perfectamente la primera tarjeta con el título, y se añadió `scroll-padding-left` para resolver un bug nativo de "CSS Scroll Snap Bouncing" al llegar al inicio.
   • **ScrollSpy Horizontal (Barra tipo Stripe):** El menú de integraciones se convirtió en una pista de desplazamiento unificada con un "ScrollSpy" inteligente. Una barra superior con un gradiente animado se llena dinámicamente y resalta la pestaña activa en tiempo real según el porcentaje de scroll.
   • **Gráficos CSS Abstractos (No más ventanas Mac):** Se eliminaron definitivamente todos los adornos tipo "Fake macOS" de las tarjetas de integraciones. En su lugar, se desarrollaron ilustraciones animadas 100% en Vanilla CSS (tarjetas UI isométricas flotantes, nodos de datos conectados, editores de código oscuros) que aportan un look más técnico ("badass"), profesional y ligero sin sobrecargar el DOM.

✅ **Mockups premium `imk-*` + aurora iridiscente en tarjetas de Startups (jun 2026)** —
   Dos mejoras visuales en `/soluciones/startups.astro`:
   • **Reescritura de los 6 mockups de integración** ("Integra Cord a tu medida") al
     estándar Apple/Stripe con el prefijo `imk-*` (no colisiona con `cmk-*`/`bm-*`/`sbm-*`).
     Cada tarjeta del carrusel (3 tabs × 2 cards): (1) Editor — tabla con chrome, drag-zone dashed,
     fila activa azul, total footer; (2) Liga de pago — card flotante sobre `#f0ede8` con total 28px
     y CTA navy full-width; (3) Zapier flow — nodos conectados con logos Google Favicon API;
     (4) Webhooks — log con dot de pulso verde animado, evento monospace, badge `200 OK`;
     (5) Terminal oscura — `#0d1117` con `curl` + JSON coloreado; (6) Browser embed — chrome con
     URL `portal.tucliente.com`, widget con badge "Powered by Cord".
   • **Aurora iridiscente en las 6 tarjetas `.stripe-fg-card`** — overlay CSS puro (sin WebGL).
     Cada `.aurora-card` tiene un `.aurora-card-layer` (`position:absolute; inset:-40%`) con 3 blobs
     `radial-gradient`: teal `rgba(0,200,140,0.14)`, índigo `rgba(110,40,220,0.11)`, azul
     `rgba(37,99,235,0.05)` — mismos colores que el hero WebGL pero a opacidad muy baja (tarjetas
     siempre blancas). Animación CSS `aurora-card-breathe` (scale + rotate, 8s). JS RAF con lerp 6%:
     en `mousemove` los blobs siguen el cursor; en `mouseleave` regresan y el RAF para tras 1.4s.
     La aurora cubre TODA la tarjeta (texto + mockup) porque el layer está en el padre `.stripe-fg-card`
     con `z-index:0`; el contenido tiene `z-index:2`. El `overflow:hidden` del padre recorta el `inset:-40%`.
   ⚠️ **Regla de escape en Astro JSX:** literales `{` `}` en texto de mockups DEBEN ser
     `&#123;` / `&#125;` — Astro los parsea como expresiones y lanza error de build.
   ⚠️ **Dep fix (jun 2026):** `@clerk/astro@3.x` solo soporta hasta Astro 6 — NO actualizar
     a Astro 7 hasta que Clerk publique soporte. Pin: `astro@^6.4.8`, `@astrojs/vercel@^10.0.6`.
     `nanostores` debe ser dep directa (antes solo transitiva desde Clerk, Rollup no la resolvía).

✅ **Rediseño Minimalista Puro en Correos Transaccionales (jun 2026)** — Todos los templates de correos (`src/lib/email.ts`, `api/contacto/ventas.ts`, `api/cron/cobranza.ts`, `api/agentes.ts`) siguen una estética de "lienzo en blanco":
   • **Lienzo Puro (Cero Tarjetas):** Los correos no emplean estructuras de tarjetas anidadas flotando sobre fondos grises. El fondo de todo el correo es blanco `#ffffff` (true minimalist).
   • **Logo Corporativo Horizontal:** Se encabeza el correo con el logo horizontal oficial (`logo-cord-navy.png`) alineado a la izquierda para asentar una presencia de marca corporativa, limpia y robusta, en lugar del pequeño ícono.
   • **Tipografía Nativa Clean:** Mantenemos la pila tipográfica de sistema Apple (`-apple-system, BlinkMacSystemFont`) con colores de texto de ultra contraste pero suaves a la vista (`#111827` para headers, `#374151` para cuerpos) y pesos moderados (`500/600`).
   • **Ausencia de Bordes y Sombras:** Se evitan por completo el `box-shadow` y borders en los contenedores principales. Únicamente se permiten sutiles divisores (`1px solid #E5E7EB`) y fondos ligeros (`#F9FAFB` con un border-left de acento) para destacar metadatos (como las tablas de leads o los blockquotes de mensajes).

✅ **Rediseño Páginas de Casos de Uso (jun 2026)** — Se añadió una nueva sección 'Bento Grid / Benefits' estilo Stripe en las 4 páginas de casos de uso (saas, agencias, comercializadoras, software-factory):
   • **Tarjetas Tipo Bento:** Cada página cuenta con dos tarjetas principales que explican beneficios clave (por ejemplo: portales de cliente, cobros de retainers, créditos B2B o flujos por milestones).
   • **Mockups Reales y Limpios:** Cada tarjeta incluye un mockup embebido que ilustra de forma clara y directa la funcionalidad discutida sin badges innecesarios, manteniéndose fiel a la estética de 'quiet luxury' y las líneas de diseño Cord.
   • **Micro Features en Grid:** Debajo de las tarjetas, se agregó una cuadrícula de 4 columnas de iconos con explicaciones concisas sobre las automatizaciones disponibles, como conciliación automática de SPEIs, webhooks y recordatorios.
   • **Unificación de Tema:** Todas estas páginas usan ahora los gradientes y el acento primario Esmeralda (`#10b981`) y fondos navys (`#0a2540`), en consistencia absoluta con la marca de Cord.

✅ **Integraciones en Casos de Uso (jun 2026)** — Se diseñó y desarrolló la sección 'Integrations' estilo nube interactiva (flotante) al final de las 4 vistas de casos de uso.
   • Layout de 2 columnas: texto explicativo a la izquierda, logotipos burbuja flotantes a la derecha.
   • Diseño de logotipos: Contenedores blancos `.uc-bubble-inner` con `border-radius: 50
✅ **Integraciones en Casos de Uso (jun 2026)** — Se diseñó y desarrolló la sección 'Integrations' estilo nube interactiva (flotante) al final de las 4 vistas de casos de uso.
   • Layout de 2 columnas: texto explicativo a la izquierda, logotipos burbuja flotantes a la derecha.
   • Diseño de logotipos: Contenedores blancos `.uc-bubble-inner` con `border-radius: 50%`, y una capa envolvente `.uc-bubble` con animación de `floatBubble` (6s, asíncrona entre logotipos por `animation-delay`).
   • Escalado en Hover: Se usa `transition` y `box-shadow` en hover sin interrumpir el `floatBubble`, para un UI feel moderno ('super cabrón').
   • Data específica: SaaS usa Stripe/Vercel/Notion; Comercializadoras usa SAP/Salesforce/Shopify; Agencias usa Asana/Figma/HubSpot; Software Factory usa GitHub/Jira/GitLab.

✅ **Optimización Financiera en Casos de Uso (jun 2026)** — Se añadió la sección 'Optimiza tus ingresos' (Power Section) a las 4 vistas.
   • Layout: Grid 2x2 con texto a la izquierda y un ícono (mini-mockup CSS) a la izquierda del texto en pantallas grandes.
   • Diseño de Iconos: Se diseñaron 6 mini-mockups usando puro CSS (Toggle, Chart, Sync, Doc, Card, Code) con detalles sutiles en `box-shadow` y colores de Cord.
   • Detalles Tipográficos: Títulos `<h3>` de la cuadrícula con una sutil línea lateral (border-left) en color azul de acento (estilo Stripe).
   • Data específica: Textos de alto valor explicativo enfocados en SaaS (Suscripciones, Churn, MRR), Agencias (Retainers, Hitos), Comercializadoras (Crédito B2B, REP, Multimoneda) y Software Factory (Cobros por Commits, T&M, Analítica de márgenes).

   • Ajuste de UI: La sección 'Optimiza tus ingresos' se movió para ser la última sección justo antes del Footer en las 4 vistas, quedando después de las Integraciones.

   • Interacción GSAP Magnética: Se creó el componente `MagneticNodes.jsx` usando React y GSAP. Incorpora animación *Zero Gravity* independiente por nodo y un efecto magnético interactivo en `mousemove` que regresa a su origen con `elastic.out(1, 0.3)`. Estilos translúcidos premium aplicados en CSS puro sin Tailwind.

   • Red Tensorial de Canvas: Se agregó un `<canvas>` 2D detrás de los MagneticNodes que funciona con un ResizeObserver. Un loop a 60fps usando `gsap.ticker` calcula la distancia Euclidiana entre los centros de cada nodo en tiempo real (leyendo su `getBoundingClientRect` para considerar la gravedad y magnetismo simultáneamente). Dibuja conexiones dinámicas con opacidad y grosor inversamente proporcionales a la distancia usando un estilo 'Clear Mode' (platino translúcido).

   • Ajuste Visual de Nodos en Agencias: En `agencias.astro`, los iconos de los nodos magnéticos fueron reemplazados por los logotipos de las agencias (Ogilvy, Accenture, IDEO, Pentagram, Flouvia) manteniendo su color original, para integrarlos visualmente en lugar de mostrar logos de herramientas.

✅ **`ProductAccordion` — galería flex expandible WebGL en páginas de producto (jun 2026)** —
   `src/components/producto/ProductAccordion.jsx` + `ProductAccordion.css` (prefijo `pac-*`).
   Componente React montado en `/producto/[slug]` como `<ProductAccordion slug={feature.slug} client:only="react" />`.
   • **Motor WebGL idéntico a `BlogCover.jsx`:** WebGL puro (sin R3F), FBM de 5 octavas con domain-warp de 2
     capas (`q → r → fbm(uv+r)`), Tonemap Reinhard + dither anti-banding. 4 paletas navy/azul eléctrico
     (todas oscuras, mismo espectro); uniforms `u_res/u_time/u_mouse/u_ca/u_cb/u_cc`.
   • **Canvas de tamaño FIJO (480×560px):** se setea UNA vez al montar; CSS `width:100%; height:100%`
     estira visualmente. **Sin `ResizeObserver`** — el bug crítico era que `ResizeObserver` se disparaba
     en cada frame mientras GSAP animaba `flexGrow`, reiniciando el contexto WebGL y causando flashes
     negros. Regla: **NUNCA redimensionar un canvas WebGL dentro de una animación de layout;**
     fijar las dimensiones del canvas y dejar que CSS escale.
   • **Tamaños inactivos variados:** `RESTING = [0.85, 1.55, 1.10, 1.75]` — cada posición tiene un
     `flex-grow` de reposo distinto (estilo ElevenLabs), evitando que todas las tarjetas inactivas
     luzcan iguales.
   • **Tarjetas inactivas = shader + ícono apagado + etiqueta vertical:** el shader atmosférico +
     ícono apagado (`opacity:0.46, scale:0.76` — ver ajuste jul 2026 abajo) + label rotado `.pac-vlabel`
     ("01"/"02"/…) en la esquina inferior. Al activarse: ícono sube a pleno + bloque de texto (eyebrow +
     título + subtítulo) aparece desde abajo; el `.pac-vlabel` se desvanece.
   • **GSAP `flexGrow` con `expo.out 0.90s`:** en `useEffect` + `gsap.context()` + `.revert()` para
     cleanup (sin `@gsap/react`). Los textos tienen stagger intencional: activo aparece a `t=0.26`,
     inactivos se ocultan desde `t=0`.
   • **Íconos duotone glass Apple-style:** `fillOpacity` en múltiples capas (12–18% fondo, 30–55%
     detalle, 55–65% acento), `stroke 1.6–1.75px`, `strokeLinecap/Join="round"`.
   • **`IntersectionObserver`** pausa el RAF cuando el canvas no está en viewport.
   • **Mobile:** `flex-direction:column`, `flex-grow:unset`, transición de altura CSS
     (inactiva 68px → activa 268px), sin GSAP en mobile.
   • Se ELIMINÓ la sección `<!-- ── STATS ──` de `[slug].astro` (filas hairline con métricas
     numéricas por feature). La sección fue borrada completamente; el `ProductAccordion` queda
     directamente sobre los bloques de detalle `<!-- ── BLOQUES DE DETALLE ──`.
   ⚠️ **Regla a futuro:** si se añade un nuevo shader a un contenedor cuyo tamaño es animado
     por GSAP (o cualquier animación CSS), siempre usar canvas de tamaño fijo + CSS scaling.
     No usar `ResizeObserver` en contenedores con transiciones de `flex-grow`/`width`/`height`.

✅ **`ProductAccordion` — fix de bug de hover + pulido premium (jul 2026)** — André reportó que la
   interacción de hover se sentía "apresurada" y tenía un bug reproducible: al pasar el cursor de la
   última tarjeta hacia la penúltima, el hover a veces rebotaba hasta la PRIMERA en vez de quedarse en
   la penúltima.
   • **Causa raíz:** las tarjetas inactivas son angostas (~130px de `flex-grow`). Con `onMouseEnter`
     disparando `setActiveIndex(i)` de inmediato, GSAP arrancaba al instante la animación de 0.90s que
     agranda esa tarjeta — pero si el cursor seguía en movimiento (swipe rápido/trackpad), salía del
     área todavía angosta ANTES de que terminara de crecer, disparando el `mouseenter` de la siguiente
     tarjeta en cascada (a veces hasta 2-3 tarjetas de distancia), aterrizando en un índice muy distinto
     al que el usuario apuntaba.
   • **Fix — "dwell" antes de comprometer el hover:** se separaron `scheduleActive(i)` (usado en
     `onMouseEnter`, debounce de `HOVER_DWELL = 140ms` vía `setTimeout` en un ref `hoverTimer`) de
     `commitActive(i)` (usado en `onClick`/`onKeyDown`, comprometido al instante, sin debounce). Solo si
     el cursor permanece quieto sobre una tarjeta ≥140ms se dispara `setActiveIndex` y arranca la
     animación GSAP — para entonces el cursor ya no está en movimiento, así que no hay swipe que lo saque
     del área antes de que termine de crecer. `onMouseLeave` cancela el timer pendiente. Verificado con
     Playwright simulando el swipe exacto reportado (última tarjeta → penúltima con pocos pasos de
     `mouse.move`): antes aterrizaba en el índice 0, después del fix aterriza en el índice correcto.
   • **Bonus UX:** el mismo dwell resuelve la queja de "se siente muy rápida" — la interacción ahora se
     lee como deliberada (el usuario tiene que "asentarse" sobre una tarjeta) en vez de saltar al primer
     roce del cursor.
   • **Pulido visual:** se reactivó el render de `.pac-vlabel` (la clase CSS ya existía pero nunca se
     montaba en el JSX — ver corrección arriba); opacidad/escala de íconos inactivos subida de
     `0.38/0.72` a `0.46/0.76` + offset vertical sutil (`y:4→0`) al activarse, para que no se sientan tan
     "apagados"; anillo interior azul sutil (`inset 0 0 0 1px rgba(120,190,255,0.14)`) en `.pac-rim` de
     la tarjeta activa + sombra compuesta más profunda (coherente con el color del `:focus-visible`
     existente) — acento "quiet luxury", no glow saturado.
   ⚠️ **Regla a futuro:** en cualquier UI de hover que dispare una animación de LAYOUT (flex-grow,
     width, height — no solo opacity/transform), separar el "intent" del cursor (debounce) del commit
     real del estado. Comprometer el cambio de estado en el mismo frame que el `mouseenter` crudo es lo
     que causa el rebote cuando el target es angosto y el movimiento del cursor es rápido.

✅ **Hero de producto rediseñado: split-layout + 100dvh + mockups light mode (jul 2026)** —
   Reescritura del template `src/pages/producto/[slug].astro` en tres ejes:
   • **Split layout izq/der:** `.pp-hero-inner` ahora es un grid `1fr 1.4fr` con `.pp-hero-text`
     a la izquierda y `.pp-hero-visual` a la derecha. El visual tiene `margin-right: -12%` para
     que el mockup sangre fuera del contenedor (parcialmente cortado = intencional). El badge
     eyebrow se **eliminó del hero** (ya no existe en el template).
   • **Hero 100dvh exacto:** `.pp-hero` es `display: flex; align-items: center; min-height: 100dvh`
     — el contenido queda verticalmente centrado en la primera pantalla, sin espacio en blanco
     excesivo arriba. `.pp-hero-inner` tiene `padding: 7rem 5% 4rem 6%` (el 7rem superior da
     clearance al navbar sticky).
   • **Título verdaderamente a la izquierda:** GSAP `wrapLines()` inyecta `.m-line` y `.m-line-in`
     dinámicamente sin `data-astro-cid`, así los estilos scoped de Astro no los alcanzan. Se añadió
     `<style is:global>` después del bloque `<style>` con:
     `.pp-hero-text .m-line { text-align: left !important }` y
     `.pp-hero-text .m-line-in { display: block !important }`.
     ⚠️ **Regla:** cualquier override a nodos inyectados por GSAP/JS en runtime DEBE ir en
     `<style is:global>` — los estilos scoped de Astro solo aplican a nodos con `data-astro-cid`.
   • **Todos los mockups hero convertidos a light mode (Apple/Linear):** se reemplazaron los fondos
     navy oscuros de TODOS los componentes `mk-*` por superficies blancas con sombras sutiles
     multicapa. Cambios clave: `.mk-window` (blanco, dots macOS de colores), `.mk-sidebar` (gris
     claro `#f8fafc`), `.mk-row` (texto dark `#334155`), `.mk-public-card` (blanco, botón Aprobar
     navy), `.mk-toast` (blanco, sombra ligera), `.mk-tl` (blanco, items en gris), `.mk-cfdi`
     (blanco), `.mk-cli` (blanco), `.mk-ar` (blanco, burbujas IA azul claro / cliente navy),
     `.mk-fx-*` (blanco/gray), `.mk-intl-*` (blanco). Las animaciones GSAP que terminaban en
     `rgba(255,255,255,0.03)` (dark) se corrigieron a `#f8fafc` o `transparent`.

✅ **Hero shader compartido (soporte + roadmap) y sidebar de Roadmap "Apple gray" (jul 2026)** —
   • **Motor de gradiente de `BlogCover.jsx` reutilizado como fondo de hero de página completa:**
     el hero de `/soporte` (`SupportHero.astro`) usaba `BlueAuroraBg.jsx` (aurora tipo ElevenLabs,
     blobs de Simplex noise) que se veía visualmente distinto a las portadas del blog. Se creó
     `src/components/support/SupportCoverBg.jsx` — el MISMO motor FBM de domain-warp de 2 capas
     (`q → r → fbm(uv+r)`) + Reinhard tonemap + dither que `BlogCover.jsx`, pero SIN el overlay de
     título/watermark (esos son propios de una tarjeta de blog, no de un hero de página). Paleta
     navy casi negro → azul marino → azul medio (`[0.015,0.035,0.085] → [0.035,0.095,0.22] →
     [0.09,0.20,0.46]`), con `topFade` (oscurece bajo el navbar) y exposición general `×0.62` para
     que el resultado sea oscuro y denso — el look pastel/claro inicial no convenció a André.
   • **`src/components/landing/RoadmapCoverBg.jsx`** — mismo motor, paleta más clara/viva
     (`[0.03,0.09,0.22] → [0.08,0.24,0.52] → [0.24,0.52,0.94]`, exposición `×1` sin el `0.62`)
     para diferenciarlo del azul oscuro de soporte. Montado en el hero de `/roadmap` y
     `/en/roadmap` (antes un hero blanco simple): el `<header class="rd-hero">` ganó una capa
     `.rd-hero-bg` (`position:absolute; inset:0`) con el shader + fallback de color sólido, y el
     contenido (`eyebrow`/`h1`/`lead`) pasó a blanco (`color:#ffffff !important` en el `h1` y en
     `.m-line-in` — los nodos que `wrapLines()` de `PageAnims` inyecta en runtime sin
     `data-astro-cid`, así que necesitan el override en `!important` para no perder el blanco).
     El hero ahora maneja su propio `padding-top` (~7–7.5rem) para despejar el navbar fijo; se
     quitó el `padding-top` que antes tenía `.rd-main` para ese mismo propósito.
   • **Separación hero→contenido:** `.rd-layout` (el grid de sidebar + lista) no tenía
     `padding-top`, así que al oscurecer el hero el contenido quedaba pegado a él. Se le agregó
     `padding-top` (3rem móvil / 4.5rem desktop).
   • **Sidebar "Plan de desarrollo" rediseñada a plano/Apple:** la card tenía borde + `box-shadow`
     + un `::before` de highlight interno tipo vidrio (look "glossy card"), que André no sintió
     sobrio. Se reemplazó por un panel plano gris Apple (`background: var(--color-bg-soft)`, SIN
     borde ni sombra, `border-radius: 28–30px`). Las 2 pestañas ("Plan de desarrollo"/"Lanzados")
     pasaron de subrayado a un **segmented control estilo iOS**: track `rgba(10,25,47,0.05)` con
     una píldora blanca (`.rd-tabs::before`) que se desliza vía `transform: translateX(100%)`
     activado con `:has(.rd-tab:nth-child(2).is-active)` (sin JS extra — mismo patrón `:has()` que
     ya usan los mockups `cmk-*`). Los `<select>` de filtro pasaron a blanco sólido sin borde
     (campo "recesado" sobre el panel gris, patrón Apple) en vez de compartir el gris del panel
     (antes eran invisibles: `--color-bg-soft` sobre `--color-bg-soft`). Sticky intacto
     (`position: sticky; top: 6rem`) — solo cambió el tratamiento visual, no el comportamiento.
     Aplicado en paralelo a `/roadmap` y `/en/roadmap`, incluyendo la variante de modo oscuro.
   ⚠️ **Regla a futuro:** si se necesita un hero-shader nuevo de página completa (no tarjeta),
     partir de `SupportCoverBg.jsx`/`RoadmapCoverBg.jsx` (motor FBM sin overlay de título) en vez
     de `BlogCover.jsx` directo — y forzar el texto en `!important` si convive con `masked-title`
     de `PageAnims` (los `.m-line-in` se inyectan sin `data-astro-cid`).
