// Secciones de Ajustes — fuente única para el HUB (/app/ajustes) y la sub-nav
// del SettingsShell. Cada sección es una sub-página propia (marca, fiscal, …).
// `icon` = inner SVG (stroke, 24×24) para pintar el ícono de la tarjeta/rail.

export interface SettingsSection {
    id: string;
    href: string;
    label: string;
    desc: string;
    icon: string;
    group: string;   // grupo del índice (estilo Stripe: lista agrupada, NO tarjetas)
}

// Grupos en el orden en que se muestran en el índice.
export const SETTINGS_GROUPS = ['Negocio', 'Cotizaciones', 'Avanzado'] as const;

export const SETTINGS_SECTIONS: SettingsSection[] = [
    {
        id: 'marca', group: 'Negocio',
        href: '/app/ajustes/marca',
        label: 'Marca y contacto',
        desc: 'Nombre, color, correo, teléfono y dirección que ven tus clientes.',
        icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    },
    {
        id: 'fiscal', group: 'Negocio',
        href: '/app/ajustes/fiscal',
        label: 'Datos fiscales',
        desc: 'RFC, razón social y Certificado de Sello Digital para CFDI 4.0.',
        icon: '<rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/>',
    },
    {
        id: 'plan', group: 'Negocio',
        href: '/app/ajustes/plan',
        label: 'Plan y facturación',
        desc: 'Tu suscripción de Trato, método de pago y comprobantes.',
        icon: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
    },
    {
        id: 'cotizaciones', group: 'Cotizaciones',
        href: '/app/ajustes/cotizaciones',
        label: 'Cotizaciones e impuestos',
        desc: 'Prefijo de folio, IVA y vigencia con la que se generan.',
        icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
    },
    {
        id: 'pdf', group: 'Cotizaciones',
        href: '/app/ajustes/pdf',
        label: 'Documento PDF',
        desc: 'Plantilla, logo, mensaje y condiciones del PDF que recibe el cliente.',
        icon: '<path d="M4 4a2 2 0 0 1 2-2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><polyline points="14 2 14 8 20 8"/><circle cx="9" cy="14" r="1.4"/><path d="M7 18l3-3 2 2 3-3 2 2"/>',
    },
    {
        id: 'aprobaciones', group: 'Cotizaciones',
        href: '/app/ajustes/aprobaciones',
        label: 'Aprobaciones y tesorería',
        desc: 'Topes de descuento/monto que piden visto bueno e interés moratorio.',
        icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
    },
    {
        id: 'integraciones', group: 'Avanzado',
        href: '/app/ajustes/integraciones',
        label: 'Integraciones',
        desc: 'Conecta tu tienda (Shopify, WooCommerce), API, webhooks y Zapier.',
        icon: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    },
    {
        id: 'auditoria', group: 'Avanzado',
        href: '/app/ajustes/auditoria',
        label: 'Auditoría',
        desc: 'Registro inmutable de cada cambio: qué, cuándo e IP. Solo lectura.',
        icon: '<path d="M12 2a10 10 0 1 0 10 10"/><polyline points="12 6 12 12 16 14"/>',
    },
];
