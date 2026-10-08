import type { IconName } from './icons';

export interface SupportCategory {
    slug: string;
    es: { name: string; desc: string };
    en: { name: string; desc: string };
    icon: IconName;
}

export const SUPPORT_CATEGORIES: SupportCategory[] = [
    {
        slug: 'pagos',
        es: { name: 'Pagos y Depósitos', desc: 'Todo sobre recepción de fondos, tiempos de liquidación y comisiones.' },
        en: { name: 'Payments & Deposits', desc: 'Everything about receiving funds, settlement times, and fees.' },
        icon: 'card',
    },
    {
        slug: 'cotizaciones',
        es: { name: 'Cotizaciones', desc: 'Guías para enviar y gestionar cotizaciones interactivas.' },
        en: { name: 'Quotes', desc: 'Guides for sending and managing interactive quotes.' },
        icon: 'quote',
    },
    {
        slug: 'facturacion',
        es: { name: 'Facturación', desc: 'Emite tus facturas y configura tus datos fiscales.' },
        en: { name: 'Invoicing', desc: 'Issue your invoices and set up your tax details.' },
        icon: 'invoice',
    },
    {
        slug: 'cuenta',
        es: { name: 'Cuenta y Equipo', desc: 'Administra accesos, roles y configuraciones de tu organización.' },
        en: { name: 'Account & Team', desc: 'Manage access, roles, and settings for your organization.' },
        icon: 'clients',
    },
    {
        slug: 'informes',
        es: { name: 'Informes y analítica', desc: 'Personaliza tu Inicio, lee tus KPIs, exporta informes y recíbelos por correo.' },
        en: { name: 'Reports & Analytics', desc: 'Customize your Home, read your KPIs, export reports, and get them by email.' },
        icon: 'chart',
    },
    {
        slug: 'desarrolladores',
        es: { name: 'Desarrolladores', desc: 'Documentación para APIs, Webhooks y Cord Elements.' },
        en: { name: 'Developers', desc: 'Documentation for APIs, Webhooks, and Cord Elements.' },
        icon: 'code',
    },
    {
        slug: 'seguridad',
        es: { name: 'Seguridad y Privacidad', desc: 'Información sobre cumplimiento PCI-DSS y protección de datos.' },
        en: { name: 'Security & Privacy', desc: 'Information about PCI-DSS compliance and data protection.' },
        icon: 'lock',
    },
];

export const supportCategoryByName = (name: string) =>
    SUPPORT_CATEGORIES.find((c) => c.es.name === name || c.en.name === name) ?? null;
