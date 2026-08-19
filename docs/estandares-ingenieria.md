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
`npm run security:billing-db` y `npm run build`. `test:payments` incluye
`security:currency`, que cubre las reglas 21 y 22.

### 18. Un límite es hard limit, soft limit o feature gate — nunca los tres a la vez

Todo límite de plan se declara en exactamente una de tres formas, con una sola fuente
para cada una:

- **Hard limit** (capacidad de stock, no se excede ni pagando): `RESOURCE_LIMITS` en
  `src/lib/entitlements.ts`, con espejo obligatorio en `cord_resource_limit()` y su
  trigger en `db/schema.sql`. `null` = sin tope desde ese plan.
- **Soft limit** (cuota mensual de flujo, incluida y facturable por excedente):
  `INCLUDED` en `src/lib/billing.ts`, reservada con `reserveUsage()`.
- **Feature gate** (capacidad binaria): `FEATURE_MIN_PLAN` en `src/lib/entitlements.ts`.

Un límite nuevo que no encaje limpio en uno de los tres es una señal de diseño confuso,
no una razón para mezclarlos. La tabla pública de precios (`src/lib/precios.ts`) describe
el contrato; nunca lo define — un número que solo existe ahí y no en uno de los tres
lugares de arriba no se aplica en ningún lado, por diseño o por descuido.

### 19. Una señal del cliente se mide en el cliente, y con actor

Un GET al SSR de una superficie pública no prueba nada: lo hace el propio vendedor
revisando su link, el bot de WhatsApp/Slack/Gmail generando la tarjeta del enlace y
el prefetch del navegador. Toda señal que el negocio va a **leer como comportamiento
del cliente** —vista, presencia, tiempo de lectura, aperturas— se registra desde una
petición que exige JavaScript ejecutándose con la pestaña visible, nunca desde el
render del servidor.

Además, esa señal se escribe **con actor**, no anónima. `src/lib/public-viewer.ts`
resuelve tres roles en cada petición al link público:

- `seller` — sesión válida y membresía activa en la org dueña; ve la superficie en
  modo vista previa y no genera señal;
- `bot` — crawler o generador de preview; se ignora por completo;
- `client` — el único que cuenta.

Una columna de señal sin columna de actor es un bug esperando a ocurrir. El caso que
originó la regla: `markViewed()` corría en el SSR de `/q/[token]`, así que el botón
"Abrir link" del propio vendedor marcaba la cotización como `viewed`, escribía "El
cliente abrió el link", disparaba el webhook `quote.viewed`, el correo al owner y el
evento de PostHog. El heartbeat de presencia tenía el mismo defecto: el vendedor
previsualizando encendía su propio badge "viendo ahora".

La lista de User-Agent de bots es defensa secundaria y siempre estará incompleta; la
defensa real es **dónde** se mide. Los contadores que alimenta un cliente sin sesión
se acotan en servidor (claves de un vocabulario cerrado, techo por tick): el emisor
no es de confianza.

Corolario de transparencia: si el negocio ve la actividad del destinatario, la
superficie pública se lo dice, y los términos lo describen. Las IP de estas señales
se guardan hasheadas; la excepción es la evidencia de firma, que las conserva
íntegras a propósito.

### 20. Una burbuja de chat dice quién la escribió

En una conversación de dos partes, la posición y el color **no** identifican al autor:
identifican el lado. En cuanto dos mensajes seguidos caen del mismo lado —el cliente
escribe dos veces, o el vendedor todavía no responde— quien lee ya no sabe quién
escribió cuál, y lee los ajenos como propios.

Toda burbuja lleva su autor junto a la hora, en las cuatro superficies del hilo
(chat general y por línea, del lado del cliente y del vendedor): `Tú` para el propio
y el nombre real de la contraparte para el otro. El nombre viene del dato, no de una
etiqueta genérica: el nombre del negocio en el link público, el del cliente en la app.

Corolario operativo: un hilo debe entregarse **en las dos direcciones**. Si un lado
tiene entrega en vivo y el otro exige recargar, la conversación se ve incompleta y
parece un monólogo. El caso que originó la regla: `cotizacion_comentarios` no viajaba
por ningún stream, así que el vendedor respondía en una partida y el cliente con la
página abierta no se enteraba nunca; con dos mensajes propios en pantalla y ninguno
del otro lado, el hilo se leía como si lo hubiera escrito él solo.

Un constructor único de burbujas por superficie, no uno por camino (envío optimista,
llegada por stream, render de servidor): con uno por camino es cuestión de tiempo que
alguno se quede sin etiqueta o con el lado invertido.

### 21. Un monto sin divisa es un número, no dinero

Todo importe que Cord muestre, guarde o cobre viaja **con su divisa**. No hay un
"$" por defecto ni un `MXN` implícito: el símbolo es parte del dato, no de la
plantilla.

Tres decisiones distintas, tres fuentes, y no se mezclan:

- **Divisa de venta** (`cotizaciones.base_currency`): en la que se capturan los
  precios, en la que el cliente ve el link, en la que se cobra y en la que se
  emite la factura. Manda en toda superficie del cliente.
- **Divisa contable** (`cotizaciones.fiscal_currency`, default `orgs.moneda`): en
  la que el negocio lleva sus libros. Cuando difiere de la de venta, el documento
  fiscal declara el tipo de cambio; nunca se reetiquetan los importes.
- **Divisa de la plataforma** (`src/lib/plan-currency.ts`): los precios de los
  planes de Cord. Es de Cord, no del cliente — `/precios`, el checkout de
  suscripción y el paywall **no** heredan `orgs.moneda`, que el usuario edita
  libre en Ajustes y por tanto no puede decidir en qué cobra Cord.
  Es un set **cerrado de dos**: `country_code = 'MX'` → MXN, cualquier otro país
  → USD. Cada divisa nueva obliga a configurar todos los Price de Stripe (base y
  medidos), así que ampliarlo es una decisión de negocio, no un `if`.
  `orgs.billing_currency` —evidencia de una factura real— **gana sobre el país**:
  Stripe congela `customer.currency` en el primer cobro, y mandar un `currency`
  que lo contradice es un 400 con el cobro a medias. En Stripe son
  `currency_options` sobre los MISMOS Price, no precios paralelos: los existentes
  ya tienen suscripciones vivas y duplicarlos partiría el catálogo en dos.
  Formato: `planMoney()`/`planCycleLabel()` de `src/lib/plan-money.ts`, único
  formateador. Los importes viven en `src/lib/precios.ts` como
  `precio: Record<PlatformCurrency, number>` — la divisa es un DATO, no un
  comentario.

Contratos ejecutables:

- Formato de servidor: `money()`/`moneyFull()` (`lib/mock.ts`, re-exportado por
  `lib/queries.ts`) leen la divisa del request. La fija el middleware desde
  `orgs.moneda` (`getAppGates`) y la sobrescribe el link público con la de la
  cotización (`getCotizacionByToken`).
- Formato de cliente: `lib/money-client.ts`, leyendo `<body data-currency>` que
  publica `AppLayout`. Un `<script is:inline>` no puede importarlo: replica la
  misma lectura del DOM, nunca un símbolo fijo.
- Unidad mínima hacia Stripe: `toMinorUnits()` de `lib/currency.ts`. **Nunca
  `Math.round(x * 100)`**: JPY, CLP, KRW y VND no tienen decimales (×100 cobra
  cien veces de más) y KWD/BHD tienen tres.
- Rieles con país: SPEI/CLABE son de México. Una capacidad de un solo país se
  detecta y se dice, no se ofrece y falla en el proveedor.

Casos que originaron la regla (ago 2026): `money()` era `'$' + Intl(es-MX)`, así
que un negocio en Madrid le mostraba "$1.000,00" a su cliente y uno en Tokio
inventaba dos decimales; `payment-intent.ts` y `checkout.ts` mandaban
`currency: 'mxn'` fijo, de modo que una venta de USD 1,000 se cobraba como MXN
1,000; `createConnectAccount` fijaba `country: 'MX'`, así que ningún negocio de
otro país completaba el alta de cobros.

### 22. Una tasa que no se puede demostrar no se inventa

El tipo de cambio es un dato de un tercero, con fecha. Cuando no se puede
obtener, la operación **falla cerrado** con un mensaje accionable; jamás se
sustituye por `1.0`, por una tabla de constantes ni por una estimación.

`FXService` lanza `FXUnavailableError` y sus llamadores lo traducen: la creación
de cotización responde 503 y `/api/fx/quote` también. Una tasa cacheada y fechada
sí es un respaldo válido (es un dato real), acotada a 24 horas; un número inventado
no lo es nunca.

Corolario de cobertura: **una sola fuente no cubre el mundo, y su hueco no es una
caída**. El BCE publica ~30 divisas; para COP, CLP, PEN, ARS, UYU o GTQ responde
404. Por eso `FXService` consulta fuentes en cadena — BCE primero por ser la
referencia que declara el CFDI, luego dos de cobertura amplia — y distingue dos
respuestas que se veían iguales: *esta fuente no cubre el par* cede el turno a la
siguiente, *no hubo respuesta* es falla de red. Sólo cuando ninguna publica el par
se falla cerrado. Confundirlas dejaba a media Latinoamérica sin poder cotizar con
un mensaje que invitaba a reintentar algo que nunca iba a funcionar; y el mensaje
mostraba el código HTTP crudo al vendedor, contra la regla 14.

La tasa congelada al cotizar (`cotizaciones.fx_rate`) **debe tener consumidor**:
la declara el documento fiscal como tipo de cambio y con ella se calcula el total
contable (`documentos_fiscales.fx_rate` / `ledger_total`). Guardar una tasa que
nadie lee es la regla 15 aplicada al dinero — y es peor, porque parece que el
producto cubre multi-divisa.

Corolario de dirección: la conversión va **de la divisa de venta a la contable**
(multiplica). Si la vista previa del editor divide y la base de datos multiplica,
una de las dos miente. El caso real: `fx_rate` se calculaba, se guardaba y no lo
leía nadie; con la red caída se congelaba `1.0` durante 30 días, y el panel de FX
dividía el total tratándolo como si ya estuviera en la divisa contable — tres
capas con tres respuestas distintas para la misma venta.

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

### 23. Una tasa de impuesto es un dato de la línea, no de la organización

El impuesto viaja **con cada concepto**, no con el documento. En cuanto sales de
un solo giro es normal mezclar un servicio gravado con un producto exento, o dos
tasas distintas en la misma venta; aplanarlas a una sola produce un documento que
no cuadra con lo que la autoridad —o el cliente— espera.

Tres fuentes, y no se mezclan:

- **Catálogo por organización** (`impuestos`): las tasas que ese negocio cobra.
  `kind` (`consumo` | `retencion` | `exento`) es la clasificación NEUTRA y es la
  que decide la aritmética; `tipo` es el subcódigo local y **solo México lo usa**
  para mapear a los impuestos trasladados/retenidos del CFDI 4.0.
- **Tasa de la línea** (`cotizacion_items.tax_rate`): fracción, no porcentaje, y
  **snapshot al capturar**. Editar el catálogo después no puede reescribir la
  aritmética de un documento ya enviado o firmado. `null` significa "anterior al
  impuesto por línea" y cae a la tasa de la organización; `0` significa "exenta a
  propósito". Con `not null default 0` los documentos existentes habrían pasado a
  cero impuesto de un día para otro.
- **Retenciones**: se **restan** del total, se calculan sobre el subtotal y se
  toman de los perfiles predeterminados del catálogo. Donde el país no tiene
  retenciones, el catálogo no tiene filas de ese tipo y el renglón no se dibuja —
  no hace falta apagarlo con un `if (isMx)`.

Contratos ejecutables: `calculateDocumentTotals()` en
`packages/elements/src/engine.ts` es el motor ÚNICO (`calculateTotals` queda como
camino heredado y no se toca: escribió los totales que hoy viven en producción);
`buildTaxOptions()` en `src/lib/impuestos.ts` es el constructor único del
selector; `taxCatalogFor()` en `src/lib/impuestos-db.ts` **valida en servidor** la
tasa que manda el cliente contra el catálogo real — un POST a `/api/v1` no puede
declarar `tax_rate: 0` en una venta gravada.

El nombre del impuesto sale del país (`taxKindLabel()` + `getCountryProfile()`):
IVA en México, VAT en Reino Unido, GST en Australia, Moms en Suecia. Nunca un
ternario `isMx ? 'IVA' : 'Tax'`, que le decía "Tax" genérico a medio mundo.

Casos que originaron la regla (ago 2026): el catálogo `impuestos` existía por
organización y el editor de cotizaciones lo ignoraba —leía la columna plana
`orgs.iva_pct`—, así que capturar "IVA 8% frontera" o "Exento" no cambiaba nada;
`quoteIva()`/`quoteTotal()` calculaban con la constante `IVA = 0.16` mientras la
etiqueta sí decía la tasa real, de modo que el link público de un negocio en
Madrid mostraba "IVA 21%" junto a un importe que era el 16% del subtotal; y
`orgs.retencion_iva_pct`/`retencion_isr_pct` se capturaban, se guardaban y no los
leía nadie.

### 24. Una preferencia de país no es de presentación: se aplica

Lo que el negocio elige de su país tiene que llegar hasta el dato. No basta con
guardarlo ni con mostrarlo en Ajustes.

- **Zona horaria** (`orgs.zona_horaria`): todo formateo de fecha en servidor pasa
  por `src/lib/fmt-server.ts`, que lee locale **y** zona del request. La zona
  viaja por el mismo camino que la divisa (`getAppGates` → contexto). Sin ella
  todo se renderizaba en la del servidor: un negocio en Tokio veía sus
  cotizaciones fechadas un día antes, y "hoy"/"ayer" se calculaban contra un día
  que no era el suyo.
- **Rieles de cobro**: el formato de la cuenta de depósito sale de
  `src/lib/payout-fields.ts` (CLABE, IBAN con mod-97, routing+account, sort code,
  transit, BSB). Los dígitos de control se verifican en Cord, no en Stripe: una
  cuenta mal tecleada rebotaba con un error del proveedor que no le dice nada al
  vendedor (regla 14). SPEI es de México y solo liquida MXN — no se ofrece fuera.
- **Vocabulario fiscal e identidad**: `taxIdLabel` del perfil del país. "RFC" es
  de México; en Madrid es "NIF / CIF" y en Austin "EIN / Tax ID". Un `<select>`
  con los 32 estados mexicanos deja sin capturar su provincia a todo el resto.
- **Catálogos de arranque**: una cuenta nueva nace con las tasas estándar de su
  país (`TAX_PRESETS`). Estados Unidos y Brasil nacen **sin** preset a propósito:
  no hay tasa nacional que sugerir, e inventarla sería peor que dejarla vacía.

Verificación mínima: crea una organización fuera de México y recorre el flujo
completo. Si en algún punto lees "RFC", "SAT", "IVA" impuesto por el código, un
estado mexicano o una fecha corrida un día, la preferencia no llegó al dato.

### 25. La factura es un objeto vivo, no un PDF con folio

Todo lo que la cotización tiene para sostener una conversación comercial, la
factura lo necesita para sostener un cobro. Cuando una capacidad existe en un
riel y no en el otro, el que falta no es "todavía no": es una factura que nadie
puede perseguir.

- **Historia**: `eventos.documento_id`. Sin timeline, el vendedor no sabe si el
  cliente ya abrió la factura o si el correo se perdió. La vista se registra solo
  cuando `resolveViewer()` dice `client` y **solo la primera vez** (regla 19).
- **Cobranza**: la cartera se lee de la vista `cuentas_por_cobrar`, que une los
  dos rieles con una forma común. El agente de cobranza IA, los intereses
  moratorios, las exclusiones, las promesas y los planes negociados hacían `from
  cotizaciones`, y las tres tablas centrales tenían `cotizacion_id NOT NULL`: no
  es que estuviera sin implementar, es que no cabía el dato.
- **Recordatorios**: la dedup vive en `documento_recordatorios`, no en el
  calendario. Se registra la etapa **antes** de mandar y se libera si el envío
  falla; al revés, un fallo entre el envío y la escritura repite el cobro.
- **Recurrencia**: `next_run_at` avanza **antes** de emitir. Al revés, un fallo a
  medio camino deja la recurrencia elegible otra vez y el cliente recibe la misma
  factura dos veces. El día del mes se topa en 28: un "31" se salta febrero en
  silencio, y una factura que no se emite no se cobra.
- **Correo**: lleva el PDF adjunto y el copy propio del negocio
  (`email_intro`/`email_firma`/`pdf_mensaje`). Para un área de cuentas por pagar
  el archivo ES el trámite.
- **Pago parcial**: el monto lo propone el cliente y por eso se acota en servidor
  contra el saldo real. Sin abono parcial, quien quiere pagar la mitad transfiere
  por fuera y el ledger se queda mudo mientras la cobranza persigue dinero que ya
  entró.

### 26. Una superficie en otro host no comparte sesión: se traspasa

`cord_session` es **host-only** (`sessionCookieOptions()` no fija `Domain`). Una
superficie servida desde un subdominio propio —`billing.cordhq.app`— llega sin
identidad, y la salida fácil, ampliar la cookie a `.cordhq.app`, la mandaría
también a `ops.`, `docs.` y `dev.`. El aislamiento de Ops es deliberado y no se
sacrifica por comodidad de ruteo.

El contrato es un **traspaso de un solo uso**: el apex emite un token opaco
(`GET /api/billing/handoff`, tabla `billing_handoff_tokens`, 90 s de vida, se
guarda el sha256 y nunca el token), y el host destino lo canjea por una sesión
**propia** (`/billing/entrar` → `createSession()`). El marcado de "usado" va en el
mismo `UPDATE` que la lectura: dos pestañas abriendo el link a la vez no pueden
canjear el mismo token. Revocar sesiones desde Ajustes sigue funcionando, porque
son sesiones normales en la tabla `sessions`.

Corolarios que ya costaron caro en Ops y se repiten aquí:

- **Pinning de host.** El árbol `/billing` responde 404 en el apex bajo PROD. Una
  superficie alcanzable por dos hosts es una superficie con dos políticas de
  cookie, y tarde o temprano divergen.
- **La API viaja con la página.** `isAllowedMutationOrigin` exige mismo origen,
  así que un `fetch` de `billing.cordhq.app` al apex se rechaza con 403. Por eso
  `/api/billing` está en los prefijos del subdominio.
- **El redirect anti-duplicado es de SEO, no de ruteo**: aplica solo a páginas.
  Sin la excepción `p.startsWith('/api/')` se llevaba `/api/billing/*` del apex,
  que es el que usa `/app/checkout`, y rompía el alta de suscripción.
- La única ruta sin sesión del subdominio es la de canje. Todo lo demás redirige
  al login **del apex**: una cookie creada en el subdominio no sirve para el
  resto de la app.

### 27. Cord se factura a sí mismo con su propio motor

Lo que Cord le cobra al negocio —la suscripción y las comisiones de Cord
Payments— se documenta con el mismo motor fiscal con el que el negocio le factura
a sus clientes, usando el CSD de Cord (`FACTURAPI_CORD_ORG_KEY`). No hay un
segundo camino ni un proveedor aparte: `emitSubscriptionInvoice()` y
`emitPlatformInvoice()` viven juntos en `src/lib/fiscal/emit.ts`.

Tres reglas que no son negociables porque el documento es legal, no un PDF:

- **El doble timbrado se cierra en el índice, no en un `if`.**
  `suscripcion_facturas.stripe_invoice_id` es `unique`, y la fila se reserva
  ANTES de llamar al proveedor. Cancelar un CFDI ante el SAT exige aprobación del
  receptor y no siempre se consigue.
- **Solo se timbra un cobro liquidado y con importe.** Un CFDI declara ingreso
  recibido: sobre una factura `open` declararía ingreso inexistente, y sobre una
  de $0 —descuento del 100 %, crédito que cubre el periodo— no hay nada que
  declarar. La UI lo dice con un guion, no con un botón que va a fallar.
- **El subtotal se desagrega del total.** Los precios de Cord se publican con
  impuesto incluido (`tax_behavior: 'unspecified'`, sin Stripe Tax): sumarle IVA
  encima facturaría un peso que nadie pagó.

Es capacidad de **México**. Fuera, el comprobante del cobro ya ES el documento y
la opción ni se ofrece (regla 24).

