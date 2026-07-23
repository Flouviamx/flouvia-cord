// Configuración en 2 niveles (estilo Stripe): CATEGORÍAS → pestañas (sub-páginas).
// El índice /app/ajustes lista las categorías; cada categoría abre su primera
// pestaña y muestra una barra de pestañas horizontal (NO un rail lateral).
//
// Reorganizado jun 2026 → "centro de mando Enterprise" (7 secciones spine +
// extras): General · Branding · Cotizaciones · Facturación y CFDI · Planes y
// cobranza · Notificaciones · Equipo · Developers · Avanzado · Tu cuenta.
//
// i18n (jul 2026): cada categoría/pestaña lleva `label`/`desc` en español (default)
// y opcionalmente `labelEn`/`descEn`/`labelEn` por tab. `localizeCategories(locale)`
// devuelve la lista con label/desc ya resueltos al idioma del request (ver
// src/i18n/app.ts + currentLocale()) — cae a español si falta la traducción.

export interface SettingsTab { id: string; label: string; labelEn?: string; href: string; }
export interface SettingsCategory { id: string; label: string; labelEn?: string; desc: string; descEn?: string; icon: string; tabs: SettingsTab[]; }

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
    {
        id: 'general', label: 'General', labelEn: 'General',
        desc: 'Nombre del negocio, moneda base, contacto y localización.',
        descEn: 'Business name, base currency, contact info, and localization.',
        icon: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
        tabs: [
            { id: 'general', label: 'General', labelEn: 'General', href: '/app/ajustes/general' },
        ],
    },
    {
        id: 'branding', label: 'Branding', labelEn: 'Branding',
        desc: 'Logo, colores de marca y portal de tus clientes.',
        descEn: 'Logo, brand colors, and your clients’ portal.',
        icon: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.012 17.5 2 12 2z"/>',
        tabs: [
            { id: 'branding', label: 'Branding',          labelEn: 'Branding',      href: '/app/ajustes/branding' },
            { id: 'portal',   label: 'Portal del cliente', labelEn: 'Client portal', href: '/app/ajustes/portal' },
        ],
    },
    {
        id: 'cotizaciones', label: 'Cotizaciones', labelEn: 'Quotes',
        desc: 'Folio, impuestos, documento PDF y reglas de aprobación.',
        descEn: 'Numbering, taxes, PDF document, and approval rules.',
        icon: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/>',
        tabs: [
            { id: 'cotizaciones', label: 'Folio e IVA',         labelEn: 'Numbering & tax',  href: '/app/ajustes/cotizaciones' },
            { id: 'impuestos',    label: 'Impuestos',           labelEn: 'Taxes',            href: '/app/ajustes/impuestos' },
            { id: 'pdf',          label: 'Documento PDF',       labelEn: 'PDF document',     href: '/app/ajustes/pdf' },
            { id: 'aprobaciones', label: 'Aprobaciones',        labelEn: 'Approvals',        href: '/app/ajustes/aprobaciones' },
            { id: 'plantillas',   label: 'Plantillas',          labelEn: 'Templates',        href: '/app/ajustes/plantillas' },
        ],
    },
    {
        id: 'facturacion', label: 'Facturación y CFDI', labelEn: 'Invoicing & CFDI',
        desc: 'Datos fiscales, certificado de sello (CSD) y timbrado.',
        descEn: 'Tax details, digital seal certificate (CSD), and stamping.',
        icon: '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
        tabs: [
            { id: 'fiscal', label: 'Datos fiscales', labelEn: 'Tax details', href: '/app/ajustes/fiscal' },
        ],
    },
    {
        id: 'cobros', label: 'Cobros', labelEn: 'Payments',
        desc: 'Recibe pagos de tus clientes: tarjeta vía Stripe y transferencia bancaria.',
        descEn: 'Accept payments from your clients: card via Stripe and bank transfer.',
        icon: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
        tabs: [
            { id: 'cobros', label: 'Cobros', labelEn: 'Payments', href: '/app/ajustes/cobros' },
        ],
    },
    {
        id: 'planes', label: 'Planes y suscripción', labelEn: 'Plans & subscription',
        desc: 'Tu suscripción de Cord, uso del plan y tu método de pago.',
        descEn: 'Your Cord subscription, plan usage, and payment method.',
        icon: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
        tabs: [
            { id: 'plan', label: 'Suscripción', labelEn: 'Subscription', href: '/app/ajustes/plan' },
        ],
    },
    {
        id: 'notificaciones', label: 'Notificaciones', labelEn: 'Notifications',
        desc: 'Qué eventos te avisan y por qué canal (correo, Slack…).',
        descEn: 'Which events notify you and through which channel (email, Slack…).',
        icon: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M4 2C2.8 3.7 2 5.7 2 8"/><path d="M22 8c0-2.3-.8-4.3-2-6"/>',
        tabs: [
            { id: 'notificaciones', label: 'Notificaciones', labelEn: 'Notifications', href: '/app/ajustes/notificaciones' },
            { id: 'correo',         label: 'Correo',         labelEn: 'Email',         href: '/app/ajustes/correo' },
        ],
    },
    {
        id: 'equipo', label: 'Equipo y permisos', labelEn: 'Team & permissions',
        desc: 'Invita a tu equipo, define permisos y la seguridad de acceso.',
        descEn: 'Invite your team, set permissions, and access security.',
        icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        tabs: [
            { id: 'equipo',    label: 'Equipo y Roles',  labelEn: 'Team & roles',  href: '/app/ajustes/equipo' },
            { id: 'sso',       label: 'SSO',             labelEn: 'SSO',           href: '/app/ajustes/sso' },
            { id: 'seguridad', label: 'Seguridad',       labelEn: 'Security',      href: '/app/ajustes/seguridad' },
        ],
    },
    {
        id: 'integraciones', label: 'Integraciones', labelEn: 'Integrations',
        desc: 'Conecta Cord con tus aplicaciones y plataformas favoritas.',
        descEn: 'Connect Cord with your favorite apps and platforms.',
        icon: '<rect width="7" height="7" x="14" y="3" rx="1"/><path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3"/>',
        tabs: [
            { id: 'integraciones', label: 'Integraciones', labelEn: 'Integrations', href: '/app/ajustes/integraciones' },
        ],
    },
    {
        id: 'api_webhooks', label: 'API y Webhooks', labelEn: 'API & Webhooks',
        desc: 'Endpoints REST y notificaciones en tiempo real para tu sistema.',
        descEn: 'REST endpoints and real-time notifications for your system.',
        icon: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
        tabs: [
            { id: 'api',           label: 'API',                 labelEn: 'API',      href: '/app/ajustes/api' },
            { id: 'webhooks',      label: 'Webhooks',            labelEn: 'Webhooks', href: '/app/ajustes/webhooks' },
        ],
    },
    {
        id: 'mcp', label: 'MCP', labelEn: 'MCP',
        desc: 'Configura el Model Context Protocol para tus asistentes.',
        descEn: 'Configure the Model Context Protocol for your assistants.',
        icon: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
        tabs: [
            { id: 'mcp',           label: 'MCP',                 labelEn: 'MCP',      href: '/app/ajustes/mcp' },
        ],
    },
    {
        id: 'agentes', label: 'Agentes IA', labelEn: 'AI Agents',
        desc: 'Configura agentes autónomos de inteligencia artificial.',
        descEn: 'Configure autonomous AI agents.',
        icon: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
        tabs: [
            { id: 'agentes',       label: 'Agentes IA',          labelEn: 'AI Agents', href: '/app/ajustes/agentes' },
        ],
    },
    {
        id: 'elements', label: 'Cotizador embebible', labelEn: 'Embeddable quote builder',
        desc: 'Integra el cotizador directamente en tu sitio web.',
        descEn: 'Embed the quote builder directly on your website.',
        icon: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><rect width="9" height="8" x="3" y="3"/><rect width="18" height="5" x="3" y="16"/>',
        tabs: [
            { id: 'elements',      label: 'Cotizador embebible', labelEn: 'Embeddable builder', href: '/app/ajustes/elements' },
        ],
    },
    {
        id: 'avanzado', label: 'Avanzado', labelEn: 'Advanced',
        desc: 'Exportar tus datos, zona de peligro y registro de auditoría.',
        descEn: 'Export your data, danger zone, and audit log.',
        icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
        tabs: [
            { id: 'datos',     label: 'Datos y privacidad', labelEn: 'Data & privacy', href: '/app/ajustes/datos' },
            { id: 'auditoria', label: 'Auditoría',          labelEn: 'Audit log',      href: '/app/ajustes/auditoria' },
        ],
    },
    {
        id: 'cuenta', label: 'Tu cuenta', labelEn: 'Your account',
        desc: 'Tu perfil, sesiones activas, seguridad y autenticación.',
        descEn: 'Your profile, active sessions, security, and authentication.',
        icon: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>',
        tabs: [
            { id: 'cuenta', label: 'Perfil y seguridad', labelEn: 'Profile & security', href: '/app/ajustes/cuenta' },
        ],
    },
];

/** Categoría que contiene la pestaña `tabId`. */
export function categoryOfTab(tabId: string): SettingsCategory | undefined {
    return SETTINGS_CATEGORIES.find((c) => c.tabs.some((t) => t.id === tabId));
}

/**
 * Devuelve SETTINGS_CATEGORIES con `label`/`desc`/tab `label` ya resueltos al
 * idioma dado (en → usa labelEn/descEn/tab.labelEn; cae a español si falta).
 * No muta el original — usar SIEMPRE esta función al renderizar la UI de
 * Ajustes en vez de leer `.label`/`.desc` crudo de SETTINGS_CATEGORIES.
 */
export function localizeCategories(locale: 'es' | 'en'): SettingsCategory[] {
    if (locale !== 'en') return SETTINGS_CATEGORIES;
    return SETTINGS_CATEGORIES.map((c) => ({
        ...c,
        label: c.labelEn || c.label,
        desc: c.descEn || c.desc,
        tabs: c.tabs.map((tb) => ({ ...tb, label: tb.labelEn || tb.label })),
    }));
}

/** Categoría (ya localizada) que contiene la pestaña `tabId`. */
export function localizedCategoryOfTab(tabId: string, locale: 'es' | 'en'): SettingsCategory | undefined {
    return localizeCategories(locale).find((c) => c.tabs.some((t) => t.id === tabId));
}
