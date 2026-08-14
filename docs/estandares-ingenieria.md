# Estándares de ingeniería y producto

> Reglas permanentes y no negociables. Su numeración es estable porque el
> historial referencia varias de ellas por número.

## Producto, marca y honestidad

### 1. Sin emojis

Está prohibido usar emojis en código, copy, interfaz o commits. Cord debe sentirse
profesional, serio y corporativo, con una estética Enterprise / Quiet Luxury. Para
acciones y estados usa texto o iconos SVG de una librería apropiada.

### 10. Posicionamiento horizontal

Cord no es "software B2B" ni "infraestructura B2B". Es una **plataforma de
cierre comercial** para cualquier negocio y país.

Copy canónico:

- "De la propuesta al pago. Todo en un solo link."
- "El ciclo de ventas desde la propuesta hasta el pago."

No uses en landing, SEO, JSON-LD o metadata mensajes limitantes como "solo para
empresas B2B", "Corporativo" o "ERP". El CFDI sí puede describirse como una
capacidad específica de México; no convierte al producto entero en una solución
exclusiva de ese país.

### 14. La UI describe estados, no infraestructura

Nunca muestres al cliente nombres de variables de entorno, proveedores internos o
archivos de configuración. `RESEND_API_KEY`, `FACTURAPI_USER_KEY`, Vercel y
Facturapi son vocabulario operativo, no mensajes accionables para el dueño de un
negocio.

Una respuesta dirigida al usuario explica el estado: "esto todavía no está
disponible; escríbenos". No expone el mecanismo: proveedor, variable o lugar de
configuración. Los proveedores sí pueden nombrarse en documentación técnica para
desarrolladores, donde el mecanismo es relevante.

Esta regla nació después de varias fugas reales: páginas de agentes/correo
nombraban `RESEND_API_KEY`, el endpoint fiscal exponía `FACTURAPI_USER_KEY` y el
panel fiscal explicaba la cuenta interna con la que se timbraba.

### 15. Una preferencia sin consumidor es una promesa falsa

Cuando un cambio agrega un toggle, preferencia o dato persistido, debe cablear en
el mismo cambio el consumidor que lo lee y actúa. Si todavía no existe una
integración real, la UI debe decir "Próximamente" en lugar de ofrecer un control
que guarda y aparenta funcionar.

Casos que originaron esta regla:

- `orgs.notif_prefs` se guardaba, pero correo y Slack no la consultaban;
- `orgs.integraciones` activaba conectores inexistentes;
- el snippet MCP mostraba `sk_live_xxxxxxxxxxxx`, un placeholder con apariencia de
  llave utilizable.

Verificación mínima: busca el campo o preferencia fuera del archivo que lo escribe.
Si solo aparece en la superficie que lo renderiza, no hay consumidor real.

### 17. Un plan guardado no es evidencia de pago

`orgs.plan` es una proyección para lectura y UI, nunca una credencial. Toda capacidad
pagada se autoriza con `src/lib/org-entitlements.ts` o `cord_effective_plan(uuid)` y
requiere una suscripción `active`, ids reales de customer/subscription, periodo vigente,
factura pagada que cubra ese periodo y `billing_paid_plan` igual o superior al nivel
solicitado. Ante inconsistencia cae a Gratis; si la verificación no está disponible,
la operación premium falla cerrada.

El contrato único vive en `src/lib/entitlements.ts`. Una feature nueva de pago debe
gatearse en cada camino que la ejecute: endpoint, query/SSR, cron, API pública, MCP y
superficie pública cuando corresponda. Ocultar un botón no es autorización. Los
downgrades preservan datos y configuración, pero dejan inoperantes los recursos y
capacidades excedentes hasta recuperar el plan.

El consumo variable se reserva con `reserveUsage()` antes de llamar al proveedor. La
reserva y el contador son atómicos; un fallo se revierte con `cancelUsage()` y un éxito
queda en el outbox durable para Stripe. El meter recibe solo el excedente sobre la cuota
incluida, nunca el consumo total.

Al modificar Billing ejecuta `npm run test:payments`, `npm run security:billing-live`,
`npm run security:billing-db` y `npm run build`.

## Diseño, interacción y accesibilidad

### 2. Sin saltos de línea embebidos

No incrustes `<br/>` en títulos o strings. Usa espacios y deja que CSS controle
los saltos mediante `max-width`, `text-wrap: balance` y reglas responsivas.

### 3. Sin grid genérico encajonado

Evita bento grids cerrados, cajas con bordes duros y card-dentro-de-card. Prefiere
Airy Bento con mucho aire y divisores hairline, o flujos limpios de una columna
centrada.

### 4. Light mode Apple por defecto

El fondo claro no es blanco plano: usa `#f5f5f7` en fondos e inputs. Las superficies
principales pueden ser blancas, con radios amplios cercanos a 40 px y sombras
difusas de varias capas que sugieran un squircle sin ruido visual.

### 5. Controles táctiles y microinteracciones sobrias

Los inputs no llevan borde por defecto: usan fondo gris suave y revelan un contorno
navy (`#0a192f` o `rgba(10, 25, 47, 0.15)`) al enfocar. Los CTA primarios son
píldoras con respuesta breve de escala en hover y active. El foco de teclado siempre
debe seguir siendo visible.

### 6. Jerarquía tipográfica y espacio

Los títulos usan negro `#050505`, tracking aproximado de `-0.04em` y line-height
`1.1`. Mantén márgenes y paddings generosos. Los flujos deben poder completarse con
teclado cuando el dispositivo tenga teclado; por ejemplo, `Enter` puede avanzar un
formulario sin eliminar el control visible equivalente.

### 7. Mockups de marketing

Antes de crear o modificar un mockup, lee
[`../MOCKUP_STANDARDS.md`](../MOCKUP_STANDARDS.md). El objetivo es una calca
realista de un screenshot: datos densos y plausibles, superficie blanca sólida y
nivel de detalle Stripe/Linear.

Cord no usa Tailwind. Los mockups usan CSS vanilla y prefijos por familia:

- `bm-*` para `BlockMockup`;
- `sbm-*` para `SolucionBlockMockup`;
- `cmk-*` para el kit compartido de `src/styles/mockups.css` en soluciones.

El patrón de bleed compartido mantiene `cmk-stage { inset: 0 }`; `cmk-shot` usa
`width: max(520px, calc(100% + 56px))` y `bottom: -40px`; el padre
`.stripe-fg-card` recorta con `overflow: hidden`. No encierres un mockup en otra
tarjeta.

### 8. Logos reales de marcas

Para marcas e integraciones usa Google Favicon V2 con el dominio real:

```html
<img src="https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://dominio.com&size=128" />
```

No sustituyas marcas por emojis ni agregues SVG estáticos pesados cuando la API
resuelve el activo.

### 9. Iconografía Glass Duotone

Los iconos SVG decorativos no deben ser trazos genéricos completamente huecos.
Contrato visual:

- trazo `currentColor` con `stroke-width="1.5"`;
- relleno `currentColor` con opacidad entre `0.12` y `0.15` para dar volumen;
- geometría directa, limpia y profesional que represente la acción sin
  abstracciones ornamentales.

Una CPU clara representa IA mejor que estrellas; una gráfica definida representa
analítica mejor que un símbolo ambiguo.

### 16. Móvil es táctil, no escritorio encogido

Por debajo de 880 px ninguna función esencial puede depender de hover, drag preciso
o atajos de teclado. Oculta o desactiva indicadores `<kbd>`, ayuda de atajos y
listeners de comandos globales solo en ese breakpoint; escribir, usar el teclado
virtual y confirmar formularios con `Enter` sigue permitido.

Los widgets se apilan en una columna y se ordenan con botones visibles de subir,
bajar y ocultar de al menos 44 px. Drag y resize permanecen en escritorio. Toda
gráfica interactiva debe responder a toque, mantener el detalle después del tap y
cerrarlo al tocar fuera.

Adaptar móvil no autoriza ocultar importes, estados, fechas, cantidades ni otra
información comercial, ni alterar el layout o los atajos de escritorio.

## Contratos de Astro y CSS

### 11. CSS global para markup ajeno o inyectado

Astro scopea un `<style>` agregando `data-astro-cid-*` solamente al markup que el
propio componente renderiza. Si una clase la consume otro componente o DOM creado
por JavaScript, una regla scopeada no matchea y falla sin error de build.

En esos casos, el CSS vive en `src/styles/*.css` importado por `AppLayout.astro` o
en `<style is:global>`, y se llavea preferentemente por un atributo del componente
como `[data-widget-grid]`, no por un id específico de página.

Hojas compartidas que `AppLayout` sí carga:

- `charts.css`
- `widgets.css`
- `daterange.css`
- `report-widgets.css`

`modal.css` y `ops.css` no forman parte de esa lista. Un `:global()` dentro del
`<style>` de una página evita el selector scopeado, pero no hace que esa hoja se
descargue en otras rutas.

Esta falla ya afectó gráficas duplicadas, `WidgetGrid`, `.kpi-label`, el vocabulario
`.report-*`/`.flow-*` y chips inyectadas en Cobros. Tras un cambio compartido,
verifica en `.vercel/output/static/_astro/*.css` que la regla se emita una sola vez.

Regla corta: si esta página no renderiza el markup en servidor, su CSS no puede
vivir en su `<style>` scopeado.

### 12. `modal.css` se importa por página

`AppLayout.astro` no carga `src/styles/modal.css`. Toda página que renderice
`<dialog class="modal">` debe importarlo explícitamente con la ruta relativa
correcta.

Contrato de markup:

```html
<div class="m-head">
  <h2>...</h2>
  <button class="m-close">...</button>
</div>
<div class="m-body">...</div>
<div class="m-foot">...</div>
```

No inventes `.m-x` ni sustituyas el `h2` por `h3`: esas variantes no están
estilizadas. La ausencia del import no produce error; el diálogo abre como HTML
crudo. En Cobranza IA y Equipo solo se detectó midiendo `getComputedStyle`, no con
el build.

### 13. La inicialización escucha el evento del componente

No dejes un `applyX()` suelto al final de un módulo de página para reconstruir el
estado inicial de otro componente. Los scripts de Astro son módulos diferidos:
corren después del parseo, en orden de documento, con `readyState === 'interactive'`.
Un componente en `slot="topbar-actions"` puede ejecutar su chunk antes que el
listener de la página; si emite durante su init, el evento se pierde.

El componente debe diferir su emisión inicial a `DOMContentLoaded`, cuando todos
los módulos diferidos ya registraron listeners. Este contrato evita la regresión
que dejó vacíos el hero y el embudo al inicializar `DateRangePicker` en `/app` y
`/app/informes`.
