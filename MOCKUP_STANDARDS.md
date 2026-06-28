# The Cord Mockup Standard (SOP)

**NIVEL DE EXIGENCIA: MASTERCLASS (STRIPE / LINEAR / APPLE / NOTION)**

Esta es la **Constitución de Diseño** para crear mockups de UI en la landing. El objetivo
no es "que se vea bien": el objetivo es que **parezca un screenshot real de un producto
pulido** — como si fuera la app de Stripe, Linear o la propia app de Cord. Cuando alguien
vea la página debe pensar "wow, esto es un SaaS serio".

> **Regla de oro:** un mockup excelente es una **calca creíble de una pantalla real** que
> **demuestra visualmente lo que dice el texto de al lado**. Densidad y realismo ganan;
> los adornos (cursores, toasts) son condimento, no el plato.

---

## 0. STACK — ⚠️ LEE ESTO PRIMERO

**Este proyecto NO usa Tailwind.** Todos los mockups son **CSS vanilla con clases
prefijadas** dentro de un `<style>` del `.astro` (`bm-*` en `producto/BlockMockup.astro`,
`sbm-*` en `soluciones/SolucionBlockMockup.astro`, `int-*`/`mock-ui` en las páginas de
soluciones). **NUNCA escribas `class="bg-white/70 backdrop-blur-3xl rounded-[2rem]"`** —
no hace nada.

- **Reutiliza la base existente.** El componente canónico es
  [`src/components/producto/BlockMockup.astro`](src/components/producto/BlockMockup.astro):
  ya trae card, floating pills, push-notif, dots, avatares, cursor SVG, `.editorial`. Extiéndelo,
  no reinventes.
- **Prefija tus clases** (`bm-<feature>-mN`, `sbm-<industria>-mN`) para no colisionar.
- **Animación:** GSAP solo en landing; loops `repeat:-1` y/o `ScrollTrigger {once:true}`
  (NUNCA scrub-on-drag). El HTML por defecto debe ser el **estado final** para que con
  `prefers-reduced-motion` se vea completo y correcto.

---

## 1. FILOSOFÍA: "CALCA REALISTA, QUIET LUXURY"

1. **Realismo > minimalismo vacío.** Mira las referencias de Stripe: muestran tablas reales
   con encabezados de columna, 5–8 filas de datos plausibles, tabs, pills de estado, sidebars.
   Eso es lo que se ve profesional. **Skeletons (barras grises) SOLO** para contenido
   verdaderamente periférico o cortado por el borde (filas que se desvanecen abajo), nunca
   para reemplazar el contenido principal que cuenta la historia.
2. **El mockup PRUEBA el copy.** Un mockup = una afirmación, visualizada literal. Si el texto
   dice "controla el margen", el mockup enseña un número de margen con su umbral. Si dice
   "cobra con un clic", enseña el botón de pago y el estado "Pagado". No mockups genéricos.
3. **Aire.** Paddings generosos, jerarquía tipográfica clara, deja respirar.
4. **Profundidad por capas, no por glow.** El "wow" de Stripe es una tarjeta flotante que se
   **encima** sobre el panel principal (ej. el card de saldo sobre el dashboard). Logra
   profundidad con superposición + sombras compuestas, no con halos saturados.
5. **Cero emojis. Cero cajas encajonadas.** SVGs finos (`stroke-width: 1.5–2`). Divisores
   hairline o `gap`, nunca bordes gruesos por todos lados. Negros para borde: `#0a192f` u
   opacidades suaves, nunca `#000` puro.

---

## 2. SUPERFICIE Y CONTENEDOR

### Modo de superficie (elige uno; **Light es el default**)
- **Light "calca de la app" (PREFERIDO):** espeja el modo claro real de Cord. Canvas
  `#f5f5f7`, tarjetas **blancas sólidas `#ffffff`** (NO translúcidas), texto navy `#0a192f`,
  números `.editorial`. Es el que más se parece a las referencias de Stripe. Úsalo para
  dashboards, tablas, checkout, listas, charts.
- **Dark "brand hero" (navy):** el gradiente navy de `BlockMockup.astro`
  (`linear-gradient(165deg,#0e2240,#0a192f,#081424)`). Resérvalo para piezas hero de marca o
  cuando el bloque vive sobre una sección oscura. Las MISMAS reglas de realismo aplican.

> El **glassmorphism (blur + translúcido) SOLO** para tarjetas flotantes que se superponen
> (overlays/toasts), nunca para la ventana/panel principal. Una superficie principal turbia
> se ve barata.

### Chrome contextual (no siempre lleva ventana)
- **App / dashboard** → frame de navegador mínimo: 3 puntos gris (`#d1d1d6`, monocromáticos,
  sin semáforo de colores) + pill de URL limpia (`dashboard.cord.flouvia.com`). O un sidebar
  de app real.
- **Checkout / teléfono / componente suelto** → tarjeta flotante **sin** frame de navegador.
- **Stat callout / chart** → tarjeta suelta, sin frame.

### Sombras (compuestas — NUNCA `shadow-lg` genérico)
```css
/* Tarjeta light flotante (estilo Stripe) */
box-shadow:
  0 2px 4px rgba(10,25,47,0.04),
  0 28px 56px -14px rgba(10,25,47,0.12),
  inset 0 1px 0 rgba(255,255,255,0.6);
border-radius: 16px;            /* squircle; cards grandes hasta 24px */
border: 1px solid rgba(10,25,47,0.06);
```
Glow ambiental: **muy sutil y desaturado** (núcleo navy/azul a baja opacidad), p.ej.
`radial-gradient(ellipse at center, rgba(10,25,47,0.10) 0%, transparent 65%)` con `blur`.
Nada de `from-blue-500/20 to-purple-500/20`.

---

## 3. CONTENIDO: DATOS EXQUISITOS Y DENSOS

- **Nombres B2B reales y sobrios:** `Aceros del Norte`, `Constructora Apex`, `Grupo Modelo`,
  `Distribuidora del Bajío`. Nada de "Lorem" ni "Empresa 1".
- **Números con peso y formato:** `$1,248,500.00 MXN`, `42 ms`, `+14.2%`. Todos los números
  con clase `.editorial` (Inter 600, `tabular-nums`) para alineación perfecta.
- **Tablas como las de Stripe:** encabezados de columna reales, 5–8 filas con datos
  plausibles, columna de **estado con pills** (`Pagado` verde, `Vencido` ámbar, `Disputado`
  gris). Deja que la última fila se corte/desvanezca en el borde para sensación de "hay más".
- **Pills de estado:** `border-radius: 999px`, fondo translúcido + texto contrastante:
  verde `bg rgba(16,185,129,.12)/text #047857`, ámbar, navy. Coherentes con `STATUS_META`.
- **Logos de marca reales** (integraciones/clientes/herramientas) → **Google Favicon V2**,
  NUNCA emojis ni SVGs estáticos pesados:
  ```html
  <img src="https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://stripe.com&size=128"
       alt="Stripe" width="24" height="24" loading="lazy" style="border-radius:6px" />
  ```
- **Scroll oculto:** si un bloque hace `overflow:auto`, oculta la barra nativa
  (`&::-webkit-scrollbar { display:none }`).

---

## 4. MICRO-INTERACCIONES (OPCIONALES — condimento, no regla)

Las referencias de Stripe que perseguimos **no llevan cursor ni toast**: se ven como
screenshots calmados. Úsalos con criterio, máximo uno por mockup, y solo si refuerzan el copy:

- **Count-up** de un número clave al entrar en viewport.
- **Un solo cambio de estado** en loop suave (ej. el badge pasa a "Pagado", flash verde).
- **Tarjeta flotante que se superpone** (la pieza de profundidad más valiosa — preferirla
  sobre cursores/toasts).
- **Cursor fantasma / push-notif:** permitido pero **dosificado**. Si lo usas, que sea un SVG
  sólido con drop-shadow (NUNCA emoji) y que vaya hacia el CTA que menciona el texto.

Todo respeta `prefers-reduced-motion` (estado final visible y correcto sin JS).

---

## 5. PROHIBIDO (reglas de sangre)

1. **Tailwind** (`bg-white/70`, `rounded-[2rem]`, `max-w-5xl`…) — no existe en este repo.
2. **Componentes reales** (`<form>`, hooks, `useState`, llamadas a BD). El mockup es teatro
   visual estático; nada que rompa el build o el performance.
3. **`box-shadow` plano/genérico.** Siempre compuesto (ver §2).
4. **Skeletons como relleno principal.** Solo para periferia/cortes de borde.
5. **Cursor/toast obligatorios.** Son opcionales; el realismo manda.
6. **Cajas Bento de bordes duros, emojis, glass en la superficie principal, glow saturado.**

---

## 6. CHECKLIST ANTES DE ENTREGAR

- [ ] ¿Está en CSS vanilla con clases prefijadas (no Tailwind)?
- [ ] ¿Reutiliza/extiende la base `bm-*` de `BlockMockup.astro`?
- [ ] ¿Parece un screenshot real (tabla densa, encabezados, datos plausibles, pills)?
- [ ] ¿Demuestra literalmente lo que dice el copy de al lado?
- [ ] ¿Superficie blanca sólida (light) o navy hero — sin glass turbio de fondo?
- [ ] ¿Sombras compuestas + alguna pieza de profundidad por superposición?
- [ ] ¿Números con `.editorial`, marcas con Favicon V2, cero emojis?
- [ ] ¿Animación con estado final por defecto y `prefers-reduced-motion` cubierto?
- [ ] ¿Scroll nativo oculto donde aplique?
