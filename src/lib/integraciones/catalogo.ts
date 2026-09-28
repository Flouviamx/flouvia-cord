export type IntegrationSlug = 'hubspot' | 'shopify' | 'google-sheets' | 'excel' | 'slack' | 'teams' | 'whatsapp' | 'make' | 'zapier' | 'n8n';
export type IntegrationCategory = 'crm' | 'ecommerce' | 'productividad' | 'comunicacion' | 'automatizacion';

export interface IntegrationApp {
    slug: IntegrationSlug;
    nombre: string;
    dominio: string;
    categoria: IntegrationCategory;
    disponible: boolean;
    logo: string;
    tile: boolean;
    guia: string | null;
}

export const ZAPIER_INVITE_URL: string | null = 'https://zapier.com/developer/public-invite/246344/a3e1e697b77f2b9e803233fd998ef461/';
export const MAKE_INVITE_URL: string | null = 'https://www.make.com/en/hq/app-invitation/83a99178a8e30c3b36b5165225176c3f';

/**
 * Shopify solo aparece cuando la app de Cord existe del lado de Shopify. Sin
 * credenciales, una tarjeta "Conectar" mandaría a la persona a una pantalla de
 * error de Shopify (regla 15).
 */
/**
 * Cada hoja se ofrece por separado y solo si SU app existe (regla 15): son dos
 * integraciones distintas para quien las usa, y una cuenta puede tener las dos.
 * Excel reusa el registro de Entra de Teams, así que llega listo antes.
 */
export const GOOGLE_SHEETS_LISTO = Boolean(
    (import.meta.env.GOOGLE_SHEETS_CLIENT_ID || process.env.GOOGLE_SHEETS_CLIENT_ID)
    && (import.meta.env.GOOGLE_SHEETS_CLIENT_SECRET || process.env.GOOGLE_SHEETS_CLIENT_SECRET),
);
export const EXCEL_LISTO = Boolean(
    (import.meta.env.TEAMS_CLIENT_ID || process.env.TEAMS_CLIENT_ID)
    && (import.meta.env.TEAMS_CLIENT_SECRET || process.env.TEAMS_CLIENT_SECRET),
);

export const SHOPIFY_LISTO = Boolean(
    (import.meta.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_CLIENT_ID)
    && (import.meta.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_CLIENT_SECRET),
);

const favicon = (domain: string, size = 64) => `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=${size}`;

export const INTEGRATION_APPS: IntegrationApp[] = [
    { slug: 'hubspot', nombre: 'HubSpot', dominio: 'hubspot.com', categoria: 'crm', disponible: true, logo: favicon('hubspot.com', 128), tile: true, guia: '/soporte/conectar-hubspot' },
    { slug: 'shopify', nombre: 'Shopify', dominio: 'shopify.com', categoria: 'ecommerce', disponible: SHOPIFY_LISTO, logo: '/imgs/integrations/shopify.svg', tile: true, guia: '/soporte/conectar-shopify' },
    // Los dos van con `tile: false`: un mosaico dibuja el logo a sangre, y estos
    // son íconos de producto sin margen propio — a sangre se ven enormes.
    { slug: 'google-sheets', nombre: 'Google Sheets', dominio: 'sheets.google.com', categoria: 'productividad', disponible: GOOGLE_SHEETS_LISTO, logo: 'https://www.gstatic.com/images/branding/product/2x/sheets_64dp.png', tile: false, guia: '/soporte/conectar-google-sheets' },
    { slug: 'excel', nombre: 'Microsoft Excel', dominio: 'excel.cloud.microsoft', categoria: 'productividad', disponible: EXCEL_LISTO, logo: favicon('excel.cloud.microsoft', 128), tile: false, guia: '/soporte/conectar-excel' },
    { slug: 'slack', nombre: 'Slack', dominio: 'slack.com', categoria: 'comunicacion', disponible: true, logo: favicon('slack.com'), tile: false, guia: null },
    { slug: 'teams', nombre: 'Microsoft Teams', dominio: 'teams.microsoft.com', categoria: 'comunicacion', disponible: true, logo: favicon('teams.microsoft.com', 128), tile: false, guia: '/soporte/conectar-teams' },
    { slug: 'whatsapp', nombre: 'WhatsApp Business', dominio: 'whatsapp.com', categoria: 'comunicacion', disponible: true, logo: '/imgs/integrations/whatsapp.svg', tile: true, guia: '/soporte/conectar-whatsapp' },
    { slug: 'make', nombre: 'Make', dominio: 'make.com', categoria: 'automatizacion', disponible: true, logo: favicon('make.com', 128), tile: true, guia: '/soporte/conectar-make' },
    { slug: 'zapier', nombre: 'Zapier', dominio: 'zapier.com', categoria: 'automatizacion', disponible: ZAPIER_INVITE_URL !== null, logo: favicon('zapier.com', 128), tile: true, guia: null },
    { slug: 'n8n', nombre: 'n8n', dominio: 'n8n.io', categoria: 'automatizacion', disponible: true, logo: '/imgs/integrations/n8n.svg', tile: true, guia: '/soporte/conectar-n8n' },
];

export type IntegrationState = 'on' | 'warn' | 'off' | 'info' | 'key' | 'oauth' | 'soon';

export interface IntegrationCtx {
    hubspot: string | null;
    /** Estado de la conexión de Shopify: 'activa' | 'error' | null. */
    shopify: string | null;
    /** Estado de cada hoja: 'activa' | 'error' | null. Son independientes. */
    googleSheets?: string | null;
    excel?: string | null;
    slack: boolean;
    teams: boolean;
    /** Microsoft ya no acepta la conexión de Teams y hay que volver a iniciar sesión. */
    teamsError?: boolean;
    whatsapp: boolean;
    /** Apps con una autorización OAuth viva en esta organización (slug del cliente). */
    oauth?: readonly string[];
}

export function integrationState(app: IntegrationApp, ctx: IntegrationCtx): IntegrationState {
    if (!app.disponible) return 'soon';
    if (app.slug === 'hubspot') return ctx.hubspot === 'activa' ? 'on' : ctx.hubspot === 'error' ? 'warn' : 'off';
    if (app.slug === 'shopify') return ctx.shopify === 'activa' ? 'on' : ctx.shopify === 'error' ? 'warn' : 'off';
    if (app.slug === 'google-sheets') return ctx.googleSheets === 'activa' ? 'on' : ctx.googleSheets === 'error' ? 'warn' : 'off';
    if (app.slug === 'excel') return ctx.excel === 'activa' ? 'on' : ctx.excel === 'error' ? 'warn' : 'off';
    if (ctx.oauth?.includes(app.slug)) return 'on';
    if (app.slug === 'slack') return ctx.slack ? 'on' : 'off';
    if (app.slug === 'teams') return ctx.teamsError ? 'warn' : ctx.teams ? 'on' : 'off';
    if (app.slug === 'whatsapp') return ctx.whatsapp ? 'on' : 'off';
    if (app.slug === 'zapier' || (app.slug === 'make' && MAKE_INVITE_URL)) return 'oauth';
    if (app.slug === 'n8n') return 'key';
    return 'info';
}

export const findIntegration = (slug: string | null | undefined) => INTEGRATION_APPS.find((a) => a.slug === slug && a.disponible) ?? null;

export const BRAND_LOGOS: Record<string, string> = Object.fromEntries(INTEGRATION_APPS.map((a) => [a.slug, a.logo]));

export const BRAND_TILES = new Set(INTEGRATION_APPS.filter((a) => a.tile).map((a) => a.slug));
