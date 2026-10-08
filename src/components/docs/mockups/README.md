# Mockups de docs.cordhq.app (`dm-*`)

Calcas de pantallas reales de Cord dentro de la documentación. No son
ilustraciones: un lector debe poder reconocer la pantalla al abrir la app.
Antes de construir uno, lee `MOCKUP_STANDARDS.md` y abre la UI real que vas a
imitar (`src/layouts/AppLayout.astro`, `src/pages/app/**`, `src/pages/q/**`).

## Piezas

| Archivo | Qué es |
|---|---|
| `DocsMockup.astro` | El marco. Todo mockup lo usa. |
| `src/styles/docs-mockups.css` | Tokens y primitivas `dm-*`. Global (regla 11); lo importa `DocsMockup`. |
| `DmIcon.astro` | Icono del registro Cord Glass (`iconInner()`). |
| `DmMoney.astro` | Monto con divisa: `$196,469.20 MXN`. |
| `DmStatus.astro` | Estado de cotización con el color de `STATUS_META` y la etiqueta de la app. |
| `DmRing.astro` | Anillo de progreso (guía de configuración). |
| `DmSidebar.astro` / `DmTopbar.astro` | Shell de la app. Los pinta `DocsMockup` con `chrome`. |
| `format.ts` | `dmT`, `pick`, `tpl`, `dmMoney`, `dmMoneyParts`, `favicon`, `initials`, `ringDash`, `DEMO`. |
| `index.ts` | Registro automático (`import.meta.glob`): todo `Dm*.astro` de la carpeta queda disponible en el MDX por su nombre de archivo. |
| `DmOnboardingWidget.astro` | Widget "Configura Cord" sobre Inicio. |
| `DmQuotePayment.astro` | Página de pago del link (`/q/[token]/pay`) con anticipo. |

## Uso desde MDX

Los mockups están **registrados globalmente**: `src/pages/docs/[...slug].astro` y
`src/pages/en/docs/[...slug].astro` pasan `components={{ ...docsMockups }}` a
`<Content>`, y `index.ts` arma ese mapa solo con todo `Dm*.astro` de esta
carpeta. En el `.mdx` no hay `import` ni hay que tocar las rutas; basta la
etiqueta con `lang`:

```mdx
<DmQuotePayment lang="es" />
```

```mdx
<DmQuotePayment lang="en" />
```

Un mockup puede recibir `caption` para reemplazar su pie por defecto:

```mdx
<DmOnboardingWidget lang="es" caption="La guía de configuración con la primera sección abierta." />
```

Dentro de una sección dividida de las portadas (`.docs-section.split`), el
mockup va en `<div class="section-visual">`; el marco se reacomoda solo al ancho
de la columna.

## API de `DocsMockup`

| Prop | Tipo | Notas |
|---|---|---|
| `lang` | `'es' \| 'en'` | Obligatoria. Si falta se deduce de la ruta (`/en/`). |
| `caption` | `string` | **Obligatoria.** Pie visible; es lo único que lee un lector de pantalla. Describe lo que se ve, con los datos. |
| `variant` | `'app' \| 'browser' \| 'phone' \| 'panel'` | `app` (por defecto): ventana de Cord. `browser`: página pública con barra de URL. `phone`: vista móvil. `panel`: tarjeta suelta (modal, correo, panel lateral). |
| `chrome` | `'full' \| 'topbar' \| 'none'` | Solo `app`. `full`: sidebar + topbar. `topbar`: solo topbar. `none`: solo el lienzo. |
| `sidebar` | `'full' \| 'rail'` | Solo `chrome="full"`. `rail` es la sidebar colapsada (solo iconos): deja más ancho al contenido. |
| `active` | `string` | id de `SIDEBAR_NAV` activo (`dashboard`, `cotizaciones`, `clientes`, `productos`, `facturas`, `cobros`, `cobranza`, `ai-ar`, `informes`, `desempeno`, `workflows`). |
| `badges` | `{ seguimiento?, vencidas? }` | Contadores de la sidebar. |
| `title` / `crumbs` | `string` / `string[]` | Encabezado de página de la app (h1 + migas). |
| `setupPct` | `number` | Muestra la píldora "Guía de configuración" con su anillo en la topbar. |
| `org` | `string` | Espacio de trabajo en la sidebar. Por defecto `Materiales del Valle`. |
| `url` | `string` | Solo `browser`, sin protocolo: `cordhq.app/q/7hQx2mKp/pay`. |
| `height` | `number` | Alto del escenario en px; lo que no cabe se recorta por abajo (sangrado). |
| `panelWidth` | `number` | Solo `panel`: ancho máximo de la tarjeta (480 por defecto). |
| `brand` | `string` | Color de marca del negocio (`--dm-brand`) para link público, PDF y correo. |
| `class` | `string` | Clase extra en el `<figure>` para el CSS propio del mockup. |

Slots: el por defecto es el contenido (lienzo de la app, página del navegador,
pantalla del teléfono o cuerpo del panel); `actions` va a la derecha del título
de la app; `overlay` es una capa absoluta sobre la ventana para lo que flota
(widget, modal, toast).

Marcado que produce: `<figure class="dm-figure">` con el escenario
`aria-hidden="true"` e `inert` (fuera del foco, del lector y del "Copiar para
IA") y un `<figcaption>`.

## Primitivas `dm-*`

- **Marco:** `dm-figure`, `dm-stage`, `dm-window`, `dm-panel`, `dm-phone`,
  `dm-caption`.
- **Shell:** `dm-sidebar` (`dm-sb-item.is-active`, `dm-sb-badge.is-danger`,
  `.is-rail`), `dm-topbar`, `dm-tb-search`, `dm-tb-create`, `dm-tb-icon`,
  `dm-onb-pill`, `dm-page-head`, `dm-crumbs`, `dm-h1`, `dm-content`,
  `dm-overlay`, `dm-scrim`, `dm-browser-bar`, `dm-url`.
- **Botones:** `dm-btn` + `dm-btn-primary` (píldora navy), `dm-btn-brand`,
  `dm-btn-secondary`, `dm-btn-ghost`, `dm-btn-danger`; tamaños `dm-btn-sm`,
  `dm-btn-lg`; `dm-btn-block`, `dm-btn-rect`.
- **Estado:** `<DmStatus status="viewed" lang={lang} />` para cotizaciones
  (borrador, enviada, vista, aprobada, rechazada, vencida, pagada, facturada).
  Para todo lo demás, `dm-tag` + `dm-tag-ok | -warn | -danger | -info | -navy`
  y `dm-tag-dot`.
- **Campos:** `dm-field`, `dm-label`, `dm-input` (`.is-focus`,
  `.is-placeholder`), `dm-select`, `dm-input-grow`, `dm-row` (`--dm-row-cols`),
  `dm-seg` (`span.is-on`), `dm-toggle` (`.is-on`), `dm-check` (`.is-on`).
- **Datos:** `dm-table` + `dm-tr` (`--dm-cols`), `dm-th`, `dm-tr.is-hl`,
  `dm-tr.is-fade`, `dm-num`, `dm-folio`; `dm-kpis`, `dm-kpi`, `dm-kpi-label`,
  `dm-kpi-num`, `dm-kpi-sub`, `dm-delta-up | -down`; `dm-kv`; `dm-surface`
  (+ `dm-surface-pad`); `dm-sec-head`, `dm-sec-title`, `dm-sec-link`.
- **Personas y marcas:** `dm-av` (+ `dm-av-1…5`, `dm-av-sq`, `dm-av-sm`,
  `dm-av-lg`) con `initials()`; `dm-logo` con `favicon('stripe.com')`.
- **Texto:** `dm-money`/`dm-cur` (vía `DmMoney`), `dm-editorial`, `dm-mono`,
  `dm-eyebrow`, `dm-muted`, `dm-faint`, `dm-strong`, `dm-ellipsis`, `dm-hair`,
  `dm-alert` (+ `-warn | -ok | -danger`), `dm-or`.
- **Responsivo:** `dm-hide-narrow` oculta lo periférico cuando el marco mide
  520 px o menos.

## Crear un mockup nuevo

1. Archivo `DmNombre.astro` en esta carpeta, con `lang` y `caption?` como props.
2. Los datos de demo en **un solo objeto** `{ es, en }` dentro del componente,
   leído con `pick(DATA, lang)`. Los textos de UI que ya existen en la app se
   leen del diccionario real con `dmT(lang, 'clave')` — así no divergen.
3. Envuelve el contenido en `<DocsMockup lang={lang} … caption={caption}>`.
4. El CSS propio va en `<style is:global>` con prefijo `dm-<nombre>-` y se
   llavea con la `class` del figure. El reflujo se hace con
   `@container dm (max-width: …)`, nunca con `@media` ni `transform: scale`.
5. No hay que registrarlo: el nombre del archivo es el nombre de la etiqueta.
   Sustituye la marca `{/* MOCKUP: … */}` en el `.mdx` de **los dos idiomas**.
6. Verifica con Playwright a 1440 y 390 px: sin scroll horizontal
   (`document.documentElement.scrollWidth <= innerWidth`) y texto legible.

## Reglas

- **Datos plausibles y consistentes.** Usa el universo de `DEMO`: el negocio
  *Materiales del Valle*, su cliente *Distribuidora El Zarco* (Raúl Mendoza),
  `COT-0148` por `$196,469.20 MXN`. Nada de "Cliente A" ni "$100".
- **Divisa siempre** (regla 21): `<DmMoney>` o `dmMoney()`. Nunca un "$" suelto.
- **Bilingüe:** todo mockup existe en ES y EN con la misma escena.
- **Sin `style=""` en el MDX** ni HTML de mockup en el MDX: el MDX solo lleva la
  etiqueta. Dentro del componente, `style` solo para variables CSS
  (`--dm-cols`, `--dm-st`).
- **Sin etiquetas que el artículo estiliza** dentro del mockup: `p`, `h1–h4`,
  `ul/ol/li`, `strong`, `code`, `pre`, `table`, `a`. Usa `div`/`span` con clase
  `dm-*`. El layout de docs les aplica márgenes y colores propios.
- **Iconos** del registro con `<DmIcon>`; marcas reales con `favicon()`
  (regla 8). Cero emojis, cero "✓" de texto.
- **Sin `backdrop-filter`** (regla 31) y sin animación: el estado dibujado es el
  final. Nada de semáforo macOS, tilt, partículas ni badges flotando alrededor.
- **Honestidad:** el mockup no muestra lo que la pantalla real no tiene. Si la
  marca `MOCKUP:` pide algo que no existe, se dibuja lo real y se avisa.
