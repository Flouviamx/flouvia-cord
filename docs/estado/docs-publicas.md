# Documentación pública — docs.cordhq.app

> Documento de estado actual del sitio de documentación. La historia de cómo
> llegó aquí (auditoría y fases de oct 2026) vive en
> [`../historial/landing-marketing.md`](../historial/landing-marketing.md). Los
> problemas de producto que encontró esa auditoría viven en
> [`hallazgos-auditoria-docs.md`](hallazgos-auditoria-docs.md).

## Qué es y dónde vive

- `docs.cordhq.app` sirve el árbol `/docs` (español) y `/en/docs` (inglés) del
  mismo proyecto. El ruteo del subdominio vive en `SUBDOMAINS` de
  `src/middleware.ts`; el apex redirige `/docs/*` al subdominio.
- Contenido: `src/content/docs/{es,en}/**/*.mdx` (118 páginas por idioma) más la
  referencia de la API (`src/pages/{,en/}docs/desarrolladores/referencia.astro`,
  generada desde `src/lib/api-schema.ts`). Esquema del frontmatter en
  `src/content.config.ts`.
- Rutas: `src/pages/docs/[...slug].astro` y `src/pages/en/docs/[...slug].astro`.
  Pasan `slug` al layout y registran los componentes MDX (Callout, Tabs,
  TabItem, Steps y todos los mockups `Dm*`).
- Layout: `src/layouts/DocsLayout.astro` (header, búsqueda, TOC, copiar para IA,
  feedback, metadatos editoriales, tokens `--docs-*`).

## Navegación: una sola fuente

`src/lib/docs-nav.ts` (`DOCS_NAV`) define las 5 secciones (Empezar, Cotizar y
cerrar, Cobrar y facturar, Automatizar, Desarrolladores), sus grupos y el orden.
De ahí salen las pestañas del header, `DocsSidebar`, `DocsBreadcrumbs`,
`DocsPager` (anterior/siguiente) y el `BreadcrumbList` del JSON-LD. No importa
nada, para que `node --experimental-strip-types` lo cargue en el check.

**Agregar una página** = crear el MDX en `es/` **y** `en/` + registrar su slug en
`DOCS_NAV`. Nunca editar el sidebar a mano: ya no existe markup de sidebar fuera
de `DocsSidebar.astro`.

## Contrato de contenido

- **El código manda.** Toda afirmación se verifica contra el código antes de
  publicarse (planes en `entitlements.ts`/`billing.ts`, tarifas en `fees.ts`,
  textos de botones en `src/i18n/app.ts`). La auditoría de oct 2026 encontró
  tarifas 10x abajo, funciones inexistentes y planes equivocados: ver el
  historial.
- **ES y EN en el mismo cambio**, misma información (EN es traducción completa,
  no condensada). Enlaces internos: ES a `/docs/...`, EN a `/en/docs/...`, sin
  `?lang=`.
- **Frontmatter completo** en toda página: `title`, `description`,
  `lastUpdated` (fecha editorial real), `availablePlans`, `appliesToMarkets`,
  `reviewedBy` y `prerequisites` cuando aplique. `seoTitle` ≤ 70 caracteres
  (el build falla si se pasa).
- **Estructura de página**: qué es, requisitos (plan, permiso, país), pasos con
  `<Steps>`, comportamiento y casos límite, límites por plan, problemas comunes,
  páginas relacionadas. Las páginas de resumen enlazan TODAS las de su sección.
- **Funciones construidas pero sin probar en producción** llevan el Callout
  "Esta función es nueva y puede no estar habilitada todavía en tu cuenta. Si no
  la ves, escríbenos." Nunca se describen como plenamente disponibles ni se
  niega lo que el código hace.
- Reglas permanentes aplicables: 1 (sin emojis), 10 (sin "B2B" como
  posicionamiento), 14 (sin proveedores ni variables internas), 15 (sin
  promesas sin consumidor) y 21 (todo monto con divisa) de
  `estandares-ingenieria.md`.
- Vocabulario de la UI real: "link" (no "Enlace Mágico"), "Inicio", los grupos
  del menú lateral tal como los define `src/lib/sidebar-nav.ts` (hoy Ingresos,
  Análisis, Automatización). Si la app renombra algo, las docs se actualizan en
  el mismo cambio.

## Mockups

`src/components/docs/mockups/` — leer su `README.md` antes de agregar uno.

- Marco `DocsMockup.astro` (`variant`: app, browser, phone, panel) y primitivas
  globales `dm-*` en `src/styles/docs-mockups.css`. Helpers: `DmIcon`,
  `DmMoney` (siempre con divisa), `DmStatus` (colores y textos reales de
  `STATUS_META`), `DmSidebar` (desde `SIDEBAR_NAV`), `DmTopbar`, `DmRing`;
  `format.ts` expone `dmT()` (diccionario real de la app) y `DEMO` (universo de
  datos: Materiales del Valle, Distribuidora El Zarco, COT-0148…).
- Todo `Dm*.astro` de esa carpeta se registra solo en MDX (`index.ts` con
  `import.meta.glob`); se usa como `<DmNombre lang="es" />`. Archivos sin
  prefijo `Dm` son piezas internas.
- 53 mockups. Son calca del producto real, no ilustraciones: cuando la app
  cambia una pantalla documentada, su mockup se revisa. Contenido interno
  `aria-hidden` + `inert`; el `caption` es lo que lee un lector de pantalla.
- Prohibido HTML con `style=""` dentro del MDX.

## Checks

- `npm run security:docs` (`scripts/docs-nav-check.mjs`, encadenado en
  `test:payments`): falla si una página no está en `DOCS_NAV`, si un slug no
  existe en ES y EN, si un enlace interno no resuelve, si una página EN enlaza a
  ES o si aparece `?lang=`.
- `npm run security:css` cubre las hojas de docs (regla 31).
- `npm run api:spec` / `security:api-spec` cubren la referencia de la API.
- Búsqueda: `/api/docs-search.json` indexa texto plano (`plainText()` de
  `src/lib/docs-search.ts`) de las 236 páginas más la referencia, con campo
  `section`. El MCP reutiliza el mismo índice.
- `llms.txt`, `llms-full.txt` y `llms-full.es.txt` se generan desde la colección.
