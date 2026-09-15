export type IntegrationSlug = 'hubspot' | 'slack' | 'make' | 'zapier';
export type IntegrationCategory = 'crm' | 'comunicacion' | 'automatizacion';

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

export const ZAPIER_INVITE_URL: string | null = null;

const favicon = (domain: string, size = 64) => `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=${size}`;

export const INTEGRATION_APPS: IntegrationApp[] = [
    { slug: 'hubspot', nombre: 'HubSpot', dominio: 'hubspot.com', categoria: 'crm', disponible: true, logo: favicon('hubspot.com', 128), tile: true, guia: '/soporte/conectar-hubspot' },
    { slug: 'slack', nombre: 'Slack', dominio: 'slack.com', categoria: 'comunicacion', disponible: true, logo: favicon('slack.com'), tile: false, guia: null },
    { slug: 'make', nombre: 'Make', dominio: 'make.com', categoria: 'automatizacion', disponible: true, logo: favicon('make.com', 128), tile: true, guia: '/soporte/conectar-make' },
    { slug: 'zapier', nombre: 'Zapier', dominio: 'zapier.com', categoria: 'automatizacion', disponible: ZAPIER_INVITE_URL !== null, logo: favicon('zapier.com', 128), tile: true, guia: null },
];

export type IntegrationState = 'on' | 'warn' | 'off' | 'info' | 'key' | 'soon';

export function integrationState(app: IntegrationApp, ctx: { hubspot: string | null; slack: boolean }): IntegrationState {
    if (!app.disponible) return 'soon';
    if (app.slug === 'hubspot') return ctx.hubspot === 'activa' ? 'on' : ctx.hubspot ? 'warn' : 'off';
    if (app.slug === 'slack') return ctx.slack ? 'on' : 'off';
    if (app.slug === 'zapier') return 'key';
    return 'info';
}

export const findIntegration = (slug: string | null | undefined) => INTEGRATION_APPS.find((a) => a.slug === slug && a.disponible) ?? null;

export const BRAND_LOGOS: Record<string, string> = Object.fromEntries(INTEGRATION_APPS.map((a) => [a.slug, a.logo]));

export const BRAND_TILES = new Set(INTEGRATION_APPS.filter((a) => a.tile).map((a) => a.slug));
