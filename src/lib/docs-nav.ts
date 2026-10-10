// Navegación de docs.cordhq.app — fuente ÚNICA.
//
// El header (tabs), el sidebar, las migas de pan, el paginador Anterior/Siguiente
// y el JSON-LD BreadcrumbList salen de este árbol. Antes el sidebar vivía
// hardcodeado en DocsLayout.astro (tres ramas por `Astro.url.pathname.includes`,
// 142 ternarios de idioma y tres criterios distintos de "activo"), y una página
// podía existir sin que ninguna ruta de navegación la alcanzara.
//
// `npm run security:docs` (scripts/docs-nav-check.mjs) verifica que todo id de la
// colección `docs` (es/ y en/) esté aquí o en DOCS_NAV_EXCLUDED, y que todo slug
// de aquí exista en los dos idiomas.
//
// Este archivo NO importa nada a propósito: el check lo carga con
// `node --experimental-strip-types`.

export type DocsLang = 'es' | 'en';
export type Localized = { es: string; en: string };

export interface NavItem {
  /** Id de la colección sin el prefijo de idioma: `pagos/condiciones`. */
  slug: string;
  label: Localized;
  children?: NavItem[];
}

export interface NavGroup {
  /** Con `collapsible`, es el texto del botón; sin él, un encabezado discreto. */
  heading?: Localized;
  collapsible?: boolean;
  items: NavItem[];
}

export interface NavSection {
  id: string;
  tab: Localized;
  /** Slug al que apunta el tab del header. */
  home: string;
  /** Un slug pertenece a la sección si es igual a un prefijo o empieza con `prefijo/`. */
  prefixes: string[];
  groups: NavGroup[];
}

const same = (s: string): Localized => ({ es: s, en: s });
const OVERVIEW: Localized = { es: 'Resumen', en: 'Overview' };

export const DOCS_NAV: NavSection[] = [
  {
    id: 'empezar',
    tab: { es: 'Empezar', en: 'Get started' },
    home: 'resumen',
    prefixes: ['resumen', 'productos', 'cuenta', 'operacion'],
    groups: [
      {
        items: [
          { slug: 'resumen', label: OVERVIEW },
          { slug: 'operacion/mapa-de-la-app', label: { es: 'Mapa completo de la app', en: 'Complete app map' } },
          { slug: 'productos', label: { es: 'Ver todos los productos', en: 'See all products' } },
        ],
      },
      {
        heading: { es: 'Crea una cuenta', en: 'Create an account' },
        collapsible: true,
        items: [
          { slug: 'cuenta/crear-cuenta', label: { es: 'Crea tu cuenta', en: 'Create your account' } },
          { slug: 'cuenta/resumen', label: OVERVIEW },
          { slug: 'cuenta/configuracion', label: { es: 'Configura tu cuenta', en: 'Configure your account' } },
          { slug: 'cuenta/configurar-con-ia', label: { es: 'Configura con IA', en: 'Set up with AI' } },
          { slug: 'cuenta/csd', label: { es: 'Agrega la información fiscal (CSD)', en: 'Add tax information (CSD)' } },
          { slug: 'cuenta/catalogo', label: { es: 'Importa tu catálogo', en: 'Import your catalog' } },
          { slug: 'cuenta/marca', label: { es: 'Personaliza tu marca', en: 'Customize your branding' } },
          { slug: 'cuenta/portal-cliente', label: { es: 'Portal del cliente', en: 'Client portal' } },
          { slug: 'cuenta/dominio-propio', label: { es: 'Dominio propio', en: 'Custom domain' } },
          { slug: 'cuenta/suscripcion', label: { es: 'Tu suscripción a Cord', en: 'Your Cord subscription' } },
          { slug: 'cuenta/equipo-seguridad', label: { es: 'Equipo y seguridad', en: 'Team and security' } },
          { slug: 'cuenta/mapa-de-ajustes', label: { es: 'Mapa de Ajustes', en: 'Settings map' } },
        ],
      },
    ],
  },
  {
    id: 'cotizar',
    tab: { es: 'Cotizar y cerrar', en: 'Quote and close' },
    home: 'cotizacion/resumen',
    prefixes: ['cotizacion', 'interaccion', 'gestion'],
    groups: [
      {
        heading: { es: 'Crea una cotización', en: 'Create a quote' },
        collapsible: true,
        items: [
          { slug: 'cotizacion/resumen', label: OVERVIEW },
          { slug: 'cotizacion/ia', label: { es: 'Generar con IA', en: 'Generate with AI' } },
          { slug: 'cotizacion/cliente', label: { es: 'Datos del cliente', en: 'Client data' } },
          { slug: 'cotizacion/productos', label: { es: 'Productos y descuentos', en: 'Products and discounts' } },
          { slug: 'cotizacion/descuentos', label: { es: 'Descuentos y cupones', en: 'Discounts and coupons' } },
          { slug: 'cotizacion/opciones', label: { es: 'Opciones avanzadas', en: 'Advanced options' } },
          { slug: 'cotizacion/envio', label: { es: 'Vista previa y envío', en: 'Preview and sending' } },
          { slug: 'cotizacion/aprobaciones-internas', label: { es: 'Aprobaciones internas', en: 'Internal approvals' } },
          { slug: 'cotizacion/timbrado', label: { es: 'Aprobación y facturación', en: 'Approval and invoicing' } },
        ],
      },
      {
        heading: { es: 'Interacción y cierre', en: 'Interaction and closing' },
        collapsible: true,
        items: [
          { slug: 'interaccion/vista-del-cliente', label: { es: 'Lo que ve tu cliente', en: 'What your client sees' } },
          { slug: 'interaccion/chat', label: { es: 'Chat y comentarios', en: 'Chat and comments' } },
          { slug: 'interaccion/negociacion', label: { es: 'Negociación y contraofertas', en: 'Negotiation and counteroffers' } },
          { slug: 'interaccion/firma', label: { es: 'Aprobación y evidencia', en: 'Approval and evidence' } },
        ],
      },
      {
        heading: { es: 'Gestión de ventas', en: 'Sales management' },
        collapsible: true,
        items: [
          { slug: 'gestion/dashboard', label: { es: 'Inicio y vistas', en: 'Home and views' } },
          { slug: 'gestion/cotizaciones', label: { es: 'Gestión de cotizaciones', en: 'Quote management' } },
          { slug: 'gestion/clientes', label: { es: 'Clientes y estado de cuenta', en: 'Clients and statements' } },
          { slug: 'gestion/tareas', label: { es: 'Tareas y seguimiento', en: 'Tasks and follow-up' } },
          { slug: 'gestion/notificaciones', label: { es: 'Notificaciones', en: 'Notifications' } },
          { slug: 'gestion/informes', label: { es: 'Informes y desempeño', en: 'Reports and performance' } },
        ],
      },
    ],
  },
  {
    id: 'pagos',
    tab: { es: 'Cobrar y facturar', en: 'Get paid and invoice' },
    home: 'pagos/resumen',
    prefixes: ['pagos'],
    groups: [
      {
        items: [
          { slug: 'pagos/resumen', label: OVERVIEW },
          { slug: 'pagos/aceptar', label: { es: 'Aceptar un pago', en: 'Accept a payment' } },
        ],
      },
      {
        heading: { es: 'Configurar cobros', en: 'Configure payments' },
        collapsible: true,
        items: [
          { slug: 'pagos/onboarding', label: { es: 'Conectar cuenta (KYC)', en: 'Connect account (KYC)' } },
          { slug: 'pagos/condiciones', label: { es: 'Tarifas y ventajas', en: 'Fees and advantages' } },
          { slug: 'pagos/metodos', label: { es: 'Métodos de cobro', en: 'Payment methods' } },
          { slug: 'pagos/mercado-pago', label: same('Mercado Pago') },
        ],
      },
      {
        heading: { es: 'Modelos de cobro avanzado', en: 'Advanced billing models' },
        collapsible: true,
        items: [
          { slug: 'pagos/anticipos', label: { es: 'Anticipo y Saldo', en: 'Upfront and Balance' } },
          { slug: 'pagos/cuotas', label: { es: 'Planes en cuotas', en: 'Installment plans' } },
          { slug: 'pagos/igualas', label: { es: 'Igualas recurrentes', en: 'Monthly retainers' } },
          { slug: 'pagos/credito', label: { es: 'Términos de crédito (Net)', en: 'Credit terms (Net)' } },
        ],
      },
      {
        heading: { es: 'Gestión de cobros', en: 'Payment management' },
        collapsible: true,
        items: [
          { slug: 'pagos/dashboard', label: { es: 'Dashboard de cobros', en: 'Payments dashboard' } },
          { slug: 'pagos/depositos', label: { es: 'Depósitos a tu banco', en: 'Payouts to your bank' } },
          { slug: 'pagos/reembolsos', label: { es: 'Reembolsos', en: 'Refunds' } },
          { slug: 'pagos/disputas', label: { es: 'Disputas y contracargos', en: 'Disputes and chargebacks' } },
          { slug: 'pagos/facturacion', label: { es: 'Facturación por país', en: 'Invoicing by country' } },
          { slug: 'pagos/facturas-emitidas', label: { es: 'Facturas', en: 'Invoices' } },
          { slug: 'pagos/facturas-recurrentes', label: { es: 'Facturas recurrentes', en: 'Recurring invoices' } },
          { slug: 'pagos/factura-electronica', label: { es: 'Factura electrónica europea', en: 'European e-invoicing' } },
        ],
      },
      {
        heading: { es: 'Cobranza y tesorería', en: 'Collections and treasury' },
        collapsible: true,
        items: [
          { slug: 'pagos/recordatorios', label: { es: 'Recordatorios automáticos', en: 'Automatic reminders' } },
          { slug: 'pagos/portal-facturas', label: { es: 'Portal de facturas', en: 'Invoice portal' } },
          { slug: 'pagos/cobro-automatico', label: { es: 'Cobro automático', en: 'Automatic payments' } },
          { slug: 'pagos/cartera-cobranza', label: { es: 'Cartera y seguimiento', en: 'Receivables and follow-up' } },
          { slug: 'pagos/cobranza-ia', label: { es: 'Cobranza autónoma (IA)', en: 'Autonomous collections (AI)' } },
          { slug: 'pagos/tesoreria-fx', label: { es: 'Tesorería y FX Lock', en: 'Treasury and FX Lock' } },
        ],
      },
      {
        items: [
          { slug: 'pagos/mejoras-confiabilidad', label: { es: 'Novedades', en: "What's new" } },
        ],
      },
    ],
  },
  {
    id: 'automatizar',
    tab: { es: 'Automatizar', en: 'Automate' },
    home: 'automatizacion/workflows',
    prefixes: ['automatizacion'],
    groups: [
      {
        heading: same('Cord Workflows'),
        collapsible: true,
        items: [
          { slug: 'automatizacion/workflows', label: OVERVIEW },
          { slug: 'automatizacion/workflows/primer-workflow', label: { es: 'Crea tu primer workflow', en: 'Create your first workflow' } },
          { slug: 'automatizacion/workflows/ideas', label: { es: 'Ideas listas para usar', en: 'Ready-made ideas' } },
          { slug: 'automatizacion/workflows/disparadores', label: { es: 'Disparadores', en: 'Triggers' } },
          { slug: 'automatizacion/workflows/condiciones', label: { es: 'Condiciones', en: 'Conditions' } },
          { slug: 'automatizacion/workflows/esperas', label: { es: 'Esperas', en: 'Waits' } },
          { slug: 'automatizacion/workflows/consultas', label: { es: 'Consultas', en: 'Lookups' } },
          { slug: 'automatizacion/workflows/acciones', label: { es: 'Acciones', en: 'Actions' } },
          { slug: 'automatizacion/workflows/datos-del-evento', label: { es: 'Datos del evento', en: 'Event data' } },
          { slug: 'automatizacion/workflows/publicar', label: { es: 'Publicar, pausar y eliminar', en: 'Publish, pause and delete' } },
          { slug: 'automatizacion/workflows/ejecuciones', label: { es: 'Ejecuciones y errores', en: 'Runs and errors' } },
          { slug: 'automatizacion/workflows/limites', label: { es: 'Límites', en: 'Limits' } },
        ],
      },
      {
        heading: { es: 'Integraciones', en: 'Integrations' },
        collapsible: true,
        items: [
          { slug: 'automatizacion/integraciones', label: OVERVIEW },
          {
            slug: 'automatizacion/integraciones/hubspot',
            label: same('HubSpot'),
            children: [
              { slug: 'automatizacion/integraciones/hubspot-sincronizacion', label: { es: 'Qué se sincroniza', en: 'What syncs' } },
              { slug: 'automatizacion/integraciones/hubspot-etapas', label: { es: 'Pipeline y etapas', en: 'Pipeline and stages' } },
              { slug: 'automatizacion/integraciones/hubspot-problemas', label: { es: 'Problemas con HubSpot', en: 'HubSpot troubleshooting' } },
            ],
          },
          { slug: 'automatizacion/integraciones/slack', label: same('Slack') },
          { slug: 'automatizacion/integraciones/teams', label: same('Microsoft Teams') },
          { slug: 'automatizacion/integraciones/whatsapp', label: same('WhatsApp Business') },
          { slug: 'automatizacion/integraciones/gmail', label: same('Gmail') },
          { slug: 'automatizacion/integraciones/google-sheets', label: same('Google Sheets') },
          { slug: 'automatizacion/integraciones/excel', label: same('Microsoft Excel') },
          { slug: 'automatizacion/integraciones/quickbooks', label: same('QuickBooks Online') },
          { slug: 'automatizacion/integraciones/xero', label: same('Xero') },
          { slug: 'automatizacion/integraciones/shopify', label: same('Shopify') },
          { slug: 'automatizacion/integraciones/zapier', label: same('Zapier') },
          { slug: 'automatizacion/integraciones/make', label: same('Make') },
          { slug: 'automatizacion/integraciones/n8n', label: same('n8n') },
        ],
      },
    ],
  },
  {
    id: 'desarrolladores',
    tab: { es: 'Desarrolladores', en: 'Developers' },
    home: 'desarrolladores/empezar/resumen',
    prefixes: ['desarrolladores'],
    groups: [
      {
        items: [
          { slug: 'desarrolladores/empezar/resumen', label: OVERVIEW },
        ],
      },
      {
        heading: { es: 'Empezar', en: 'Get Started' },
        collapsible: true,
        items: [
          { slug: 'desarrolladores/empezar/apikey', label: { es: 'Crea tu API Key', en: 'Create your API Key' } },
          { slug: 'desarrolladores/empezar/inicio-rapido', label: { es: 'Inicio rápido', en: 'Quickstart' } },
          { slug: 'desarrolladores/empezar/pruebas', label: { es: 'Entornos de Prueba', en: 'Test Environments' } },
        ],
      },
      {
        heading: { es: 'Herramientas', en: 'Tools' },
        collapsible: true,
        items: [
          { slug: 'desarrolladores/herramientas/workbench', label: same('Cord Workbench') },
          { slug: 'desarrolladores/herramientas/webhooks', label: same('Webhooks') },
          { slug: 'desarrolladores/herramientas/cli', label: same('CLI') },
          { slug: 'desarrolladores/herramientas/sdks', label: { es: 'SDK de Node', en: 'Node SDK' } },
          { slug: 'desarrolladores/herramientas/mcp', label: { es: 'Servidor MCP', en: 'MCP Server' } },
          { slug: 'desarrolladores/herramientas/configuracion-asistida', label: { es: 'Configuración asistida', en: 'Assisted setup' } },
          { slug: 'desarrolladores/herramientas/oauth', label: { es: 'OAuth para apps', en: 'OAuth for apps' } },
          { slug: 'desarrolladores/herramientas/integraciones', label: { es: 'Integraciones', en: 'Integrations' } },
        ],
      },
      {
        heading: same('Cord Elements'),
        collapsible: true,
        items: [
          { slug: 'desarrolladores/herramientas/elements/resumen', label: OVERVIEW },
          { slug: 'desarrolladores/herramientas/elements/react', label: same('React & Next.js') },
          { slug: 'desarrolladores/herramientas/elements/web-components', label: same('Web Components & Vue') },
          { slug: 'desarrolladores/herramientas/elements/headless', label: same('Headless') },
          { slug: 'desarrolladores/herramientas/elements/fiscal', label: { es: 'Formulario fiscal', en: 'Tax form' } },
          { slug: 'desarrolladores/herramientas/elements/server', label: { es: 'Proxy de servidor', en: 'Server proxy' } },
          { slug: 'desarrolladores/herramientas/elements/apariencia', label: { es: 'Apariencia', en: 'Appearance' } },
          { slug: 'desarrolladores/herramientas/elements/eventos', label: { es: 'Eventos', en: 'Events' } },
          { slug: 'desarrolladores/herramientas/elements/seguridad', label: { es: 'Seguridad CSP', en: 'CSP Security' } },
        ],
      },
      {
        heading: { es: 'Esenciales', en: 'Essentials' },
        collapsible: true,
        items: [
          { slug: 'desarrolladores/esenciales/autenticacion', label: { es: 'Autenticación', en: 'Authentication' } },
          { slug: 'desarrolladores/esenciales/paginacion', label: { es: 'Paginación', en: 'Pagination' } },
          { slug: 'desarrolladores/esenciales/errores', label: { es: 'Manejo de Errores', en: 'Error Handling' } },
          { slug: 'desarrolladores/esenciales/versiones', label: { es: 'Versiones de la API', en: 'API Versions' } },
          { slug: 'desarrolladores/esenciales/seguridad', label: { es: 'Seguridad', en: 'Security' } },
          { slug: 'desarrolladores/referencia', label: { es: 'Referencia de la API', en: 'API Reference' } },
        ],
      },
      {
        heading: { es: 'Funciones', en: 'Features' },
        collapsible: true,
        items: [
          { slug: 'desarrolladores/funciones/cotizaciones', label: { es: 'API de Cotizaciones', en: 'Quotes API' } },
          { slug: 'desarrolladores/funciones/clientes', label: { es: 'API de Clientes', en: 'Clients API' } },
          { slug: 'desarrolladores/funciones/productos', label: { es: 'API de Productos', en: 'Products API' } },
          { slug: 'desarrolladores/funciones/cobranza', label: { es: 'API de Cobranza', en: 'Collections API' } },
          { slug: 'desarrolladores/funciones/facturas', label: { es: 'API de Facturas', en: 'Invoices API' } },
          { slug: 'desarrolladores/funciones/tareas', label: { es: 'API de Tareas', en: 'Tasks API' } },
          { slug: 'desarrolladores/funciones/eventos', label: { es: 'API de Eventos', en: 'Events API' } },
        ],
      },
      {
        heading: { es: 'Seguridad y Privacidad', en: 'Security & Privacy' },
        collapsible: true,
        items: [
          { slug: 'desarrolladores/seguridad/sso', label: { es: 'SSO y SAML', en: 'SSO & SAML' } },
        ],
      },
    ],
  },
];

/** Ids de la colección que existen a propósito fuera de la navegación (con su motivo). */
export const DOCS_NAV_EXCLUDED: Record<string, string> = {};

/** Slugs de la navegación servidos por una página .astro, no por un MDX de la colección. */
export const DOCS_NAV_ASTRO_PAGES: string[] = ['desarrolladores/referencia'];

export const DOCS_ROOT_LABEL: Localized = { es: 'Docs', en: 'Docs' };

export interface FlatNavItem {
  slug: string;
  label: Localized;
  section: NavSection;
  group: NavGroup;
}

/** `resumen` es la portada (`/docs`); en inglés todo vive bajo `/en`. */
export function docHref(slug: string, lang: DocsLang): string {
  const base = lang === 'en' ? '/en/docs' : '/docs';
  return slug === 'resumen' || slug === '' ? base : `${base}/${slug}`;
}

export function sectionFor(slug: string): NavSection | undefined {
  return DOCS_NAV.find((section) =>
    section.prefixes.some((p) => slug === p || slug.startsWith(`${p}/`)),
  );
}

function walk(items: NavItem[], section: NavSection, group: NavGroup, out: FlatNavItem[]): void {
  for (const item of items) {
    out.push({ slug: item.slug, label: item.label, section, group });
    if (item.children?.length) walk(item.children, section, group, out);
  }
}

/** Páginas de una sección en orden de lectura. */
export function flatten(section: NavSection): FlatNavItem[] {
  const out: FlatNavItem[] = [];
  for (const group of section.groups) walk(group.items, section, group, out);
  return out;
}

/** Todas las páginas de la navegación, en orden de tabs y de sidebar. */
export function flattenAll(): FlatNavItem[] {
  return DOCS_NAV.flatMap(flatten);
}

export function findItem(slug: string): FlatNavItem | undefined {
  return flattenAll().find((entry) => entry.slug === slug);
}

export function labelFor(slug: string, lang: DocsLang): string | undefined {
  return findItem(slug)?.label[lang];
}

/** Anterior y siguiente en el orden global (cruza secciones al llegar al borde). */
export function prevNext(slug: string): { prev?: FlatNavItem; next?: FlatNavItem } {
  const all = flattenAll();
  const i = all.findIndex((entry) => entry.slug === slug);
  if (i === -1) return {};
  return { prev: all[i - 1], next: all[i + 1] };
}

export interface Crumb {
  label: string;
  /** Ausente en un grupo: los grupos no tienen página propia. */
  href?: string;
}

/**
 * Docs › Sección › Grupo › Página. Se omiten los niveles repetidos: la portada
 * de una sección no repite su nombre, y un grupo sin encabezado no aporta nivel.
 */
export function breadcrumbs(slug: string, lang: DocsLang): Crumb[] {
  const crumbs: Crumb[] = [{ label: DOCS_ROOT_LABEL[lang], href: docHref('resumen', lang) }];
  if (slug === 'resumen') return crumbs;
  const entry = findItem(slug);
  const section = entry?.section ?? sectionFor(slug);
  if (section) crumbs.push({ label: section.tab[lang], href: docHref(section.home, lang) });
  if (!entry || (section && slug === section.home)) return crumbs;
  if (entry.group.heading) crumbs.push({ label: entry.group.heading[lang] });
  crumbs.push({ label: entry.label[lang], href: docHref(slug, lang) });
  return crumbs;
}
