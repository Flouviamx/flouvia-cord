// Configuración en 2 niveles (estilo Stripe): CATEGORÍAS → pestañas (sub-páginas).
// El índice /app/ajustes lista las categorías; cada categoría abre su primera
// pestaña y muestra una barra de pestañas horizontal (NO un rail lateral).
//
// Reorganizado jun 2026 → "centro de mando Enterprise" (7 secciones spine +
// extras): General · Branding · Cotizaciones · Facturación y CFDI · Planes y
// cobranza · Notificaciones · Equipo · Developers · Avanzado · Tu cuenta.

export interface SettingsTab { id: string; label: string; href: string; }
export interface SettingsCategory { id: string; label: string; desc: string; icon: string; tabs: SettingsTab[]; }

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
    {
        id: 'general', label: 'General',
        desc: 'Nombre del negocio, moneda base, contacto y localización.',
        icon: '<rect x="3" y="3" width="7" height="18" rx="1.5"/><path d="M10 9h7a2 2 0 0 1 2 2v10H10"/><line x1="14" y1="13" x2="15" y2="13"/><line x1="14" y1="17" x2="15" y2="17"/><line x1="6" y1="7" x2="7" y2="7"/><line x1="6" y1="11" x2="7" y2="11"/>',
        tabs: [
            { id: 'general', label: 'General', href: '/app/ajustes/general' },
        ],
    },
    {
        id: 'branding', label: 'Branding',
        desc: 'Logo, colores de marca y portal de tus clientes.',
        icon: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.012 17.5 2 12 2z"/>',
        tabs: [
            { id: 'branding', label: 'Branding',          href: '/app/ajustes/branding' },
            { id: 'portal',   label: 'Portal del cliente', href: '/app/ajustes/portal' },
        ],
    },
    {
        id: 'cotizaciones', label: 'Cotizaciones',
        desc: 'Folio, impuestos, documento PDF y reglas de aprobación.',
        icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
        tabs: [
            { id: 'cotizaciones', label: 'Folio e IVA',         href: '/app/ajustes/cotizaciones' },
            { id: 'impuestos',    label: 'Impuestos',           href: '/app/ajustes/impuestos' },
            { id: 'pdf',          label: 'Documento PDF',       href: '/app/ajustes/pdf' },
            { id: 'aprobaciones', label: 'Aprobaciones',        href: '/app/ajustes/aprobaciones' },
            { id: 'plantillas',   label: 'Plantillas',          href: '/app/ajustes/plantillas' },
        ],
    },
    {
        id: 'facturacion', label: 'Facturación y CFDI',
        desc: 'Datos fiscales, certificado de sello (CSD) y timbrado.',
        icon: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="12" y2="15"/>',
        tabs: [
            { id: 'fiscal', label: 'Datos fiscales', href: '/app/ajustes/fiscal' },
        ],
    },
    {
        id: 'cobros', label: 'Cobros',
        desc: 'Recibe pagos de tus clientes: tarjeta vía Stripe y transferencia bancaria.',
        icon: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" fill="currentColor" fill-opacity="0.12"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z" fill="currentColor" fill-opacity="0.12"/>',
        tabs: [
            { id: 'cobros', label: 'Cobros', href: '/app/ajustes/cobros' },
        ],
    },
    {
        id: 'planes', label: 'Planes y suscripción',
        desc: 'Tu suscripción de Cord, uso del plan y tu método de pago.',
        icon: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
        tabs: [
            { id: 'plan', label: 'Suscripción', href: '/app/ajustes/plan' },
        ],
    },
    {
        id: 'notificaciones', label: 'Notificaciones',
        desc: 'Qué eventos te avisan y por qué canal (correo, Slack…).',
        icon: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
        tabs: [
            { id: 'notificaciones', label: 'Notificaciones', href: '/app/ajustes/notificaciones' },
            { id: 'correo',         label: 'Correo',         href: '/app/ajustes/correo' },
        ],
    },
    {
        id: 'equipo', label: 'Equipo y permisos',
        desc: 'Invita a tu equipo, define permisos y la seguridad de acceso.',
        icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        tabs: [
            { id: 'equipo',    label: 'Equipo y Roles',  href: '/app/ajustes/equipo' },
            { id: 'sso',       label: 'SSO',             href: '/app/ajustes/sso' },
            { id: 'seguridad', label: 'Seguridad',       href: '/app/ajustes/seguridad' },
        ],
    },
    {
        id: 'integraciones', label: 'Integraciones',
        desc: 'Conecta Cord con tus aplicaciones y plataformas favoritas.',
        icon: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
        tabs: [
            { id: 'integraciones', label: 'Integraciones', href: '/app/ajustes/integraciones' },
        ],
    },
    {
        id: 'api_webhooks', label: 'API y Webhooks',
        desc: 'Endpoints REST y notificaciones en tiempo real para tu sistema.',
        icon: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
        tabs: [
            { id: 'api',           label: 'API',                 href: '/app/ajustes/api' },
            { id: 'webhooks',      label: 'Webhooks',            href: '/app/ajustes/webhooks' },
        ],
    },
    {
        id: 'mcp', label: 'MCP',
        desc: 'Configura el Model Context Protocol para tus asistentes.',
        icon: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
        tabs: [
            { id: 'mcp',           label: 'MCP',                 href: '/app/ajustes/mcp' },
        ],
    },
    {
        id: 'agentes', label: 'Agentes IA',
        desc: 'Configura agentes autónomos de inteligencia artificial.',
        icon: '<path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M21.18 8.02c-1-2.3-2.85-4.17-5.16-5.18"/>',
        tabs: [
            { id: 'agentes',       label: 'Agentes IA',          href: '/app/ajustes/agentes' },
        ],
    },
    {
        id: 'elements', label: 'Cotizador embebible',
        desc: 'Integra el cotizador directamente en tu sitio web.',
        icon: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
        tabs: [
            { id: 'elements',      label: 'Cotizador embebible', href: '/app/ajustes/elements' },
        ],
    },
    {
        id: 'avanzado', label: 'Avanzado',
        desc: 'Exportar tus datos, zona de peligro y registro de auditoría.',
        icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
        tabs: [
            { id: 'datos',     label: 'Datos y privacidad', href: '/app/ajustes/datos' },
            { id: 'auditoria', label: 'Auditoría',          href: '/app/ajustes/auditoria' },
        ],
    },
    {
        id: 'cuenta', label: 'Tu cuenta',
        desc: 'Tu perfil, sesiones activas, seguridad y autenticación.',
        icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
        tabs: [
            { id: 'cuenta', label: 'Perfil y seguridad', href: '/app/ajustes/cuenta' },
        ],
    },
];

/** Categoría que contiene la pestaña `tabId`. */
export function categoryOfTab(tabId: string): SettingsCategory | undefined {
    return SETTINGS_CATEGORIES.find((c) => c.tabs.some((t) => t.id === tabId));
}
