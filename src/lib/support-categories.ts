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
        // Una guía por mercado: qué documento emite Cord en cada país, qué
        // pide la autoridad y en qué estado está su riel fiscal.
        slug: 'facturacion-por-pais',
        es: { name: 'Facturación por país', desc: 'Qué documento emite Cord en cada uno de sus 12 países, qué necesita tu negocio y cómo corregir una factura.' },
        en: { name: 'Invoicing by country', desc: 'Which document Cord issues in each of its 12 countries, what your business needs and how to correct an invoice.' },
        icon: 'globe',
    },
    {
        slug: 'cuenta',
        es: { name: 'Cuenta y Equipo', desc: 'Administra accesos, roles y configuraciones de tu organización.' },
        en: { name: 'Account & Team', desc: 'Manage access, roles, and settings for your organization.' },
        icon: 'clients',
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

/**
 * Orden de lectura dentro de una categoría: primero los artículos con `order`
 * (de menor a mayor), después el resto por título. Lo comparten el hub, la
 * página de categoría y la barra lateral del artículo.
 */
export function sortSupportArticles<T extends { data: { title: string; order?: number } }>(list: T[]): T[] {
    return [...list].sort((a, b) => {
        const oa = a.data.order ?? Number.POSITIVE_INFINITY;
        const ob = b.data.order ?? Number.POSITIVE_INFINITY;
        if (oa !== ob) return oa - ob;
        return a.data.title.localeCompare(b.data.title);
    });
}
