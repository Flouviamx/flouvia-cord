export interface SupportCategory {
    slug: string;
    es: { name: string; desc: string };
    en: { name: string; desc: string };
    icon: string;
}

export const SUPPORT_CATEGORIES: SupportCategory[] = [
    {
        slug: 'pagos',
        es: { name: 'Pagos y Depósitos', desc: 'Todo sobre recepción de fondos, tiempos de liquidación y comisiones.' },
        en: { name: 'Payments & Deposits', desc: 'Everything about receiving funds, settlement times, and fees.' },
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>',
    },
    {
        slug: 'cotizaciones',
        es: { name: 'Cotizaciones', desc: 'Guías para enviar y gestionar cotizaciones interactivas.' },
        en: { name: 'Quotes', desc: 'Guides for sending and managing interactive quotes.' },
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>',
    },
    {
        slug: 'facturacion',
        es: { name: 'Facturación', desc: 'Emite tus facturas y configura tus datos fiscales.' },
        en: { name: 'Invoicing', desc: 'Issue your invoices and set up your tax details.' },
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    },
    {
        slug: 'cuenta',
        es: { name: 'Cuenta y Equipo', desc: 'Administra accesos, roles y configuraciones de tu organización.' },
        en: { name: 'Account & Team', desc: 'Manage access, roles, and settings for your organization.' },
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    },
    {
        slug: 'desarrolladores',
        es: { name: 'Desarrolladores', desc: 'Documentación para APIs, Webhooks y Cord Elements.' },
        en: { name: 'Developers', desc: 'Documentation for APIs, Webhooks, and Cord Elements.' },
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    },
    {
        slug: 'seguridad',
        es: { name: 'Seguridad y Privacidad', desc: 'Información sobre cumplimiento PCI-DSS y protección de datos.' },
        en: { name: 'Security & Privacy', desc: 'Information about PCI-DSS compliance and data protection.' },
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    },
];

export const supportCategoryByName = (name: string) =>
    SUPPORT_CATEGORIES.find((c) => c.es.name === name || c.en.name === name) ?? null;
