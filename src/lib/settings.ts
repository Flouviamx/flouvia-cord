// Configuración en 2 niveles (estilo Stripe): CATEGORÍAS → pestañas (sub-páginas).
// El índice /app/ajustes lista las categorías; cada categoría abre su primera
// pestaña y muestra una barra de pestañas horizontal (NO un rail lateral).
//
// Reorganizado jun 2026 → "centro de mando Enterprise" (7 secciones spine +
// extras): General · Branding · Cotizaciones · Facturación · Planes y
// cobranza · Notificaciones · Equipo · Developers · Avanzado · Tu cuenta.
//
// i18n (jul 2026): cada categoría/pestaña lleva `label`/`desc` en español (default)
// y opcionalmente `labelEn`/`descEn`/`labelEn` por tab. `localizeCategories(locale)`
// devuelve la lista con label/desc ya resueltos al idioma del request (ver
// src/i18n/app.ts + currentLocale()) — cae a español si falta la traducción.

/**
 * `keywords`: sinónimos para el buscador ⌘K, que sólo empata contra el TÍTULO.
 * Sirven para lo que la gente teclea pero no es el nombre de la pestaña: "IVA"
 * o "VAT" para Impuestos, "RFC"/"NIF"/"CSD" para Datos fiscales. Se escriben
 * en los dos idiomas en la misma cadena — el buscador normaliza y sólo mira si
 * el término está contenido, así que mezclar es correcto y evita duplicar la
 * lista por locale.
 */
import { iconInner } from './icons';

export interface SettingsTab { id: string; label: string; labelEn?: string; href: string; keywords?: string; }
export interface SettingsCategory { id: string; label: string; labelEn?: string; desc: string; descEn?: string; icon: string; tabs: SettingsTab[]; }

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
    {
        id: 'general', label: 'General', labelEn: 'General',
        desc: 'Nombre del negocio, moneda base, contacto y localización.',
        descEn: 'Business name, base currency, contact info, and localization.',
        icon: iconInner('sliders'),
        tabs: [
            { id: 'general', label: 'General', labelEn: 'General', href: '/app/ajustes/general', keywords: 'moneda currency divisa idioma language zona horaria timezone localizacion nombre negocio contacto' },
            { id: 'setup', label: 'Configurar con IA', labelEn: 'Set up with AI', href: '/app/setup', keywords: 'ia ai asistente assistant wizard configurar setup importar import catalogo catalog sitio web website lista de precios price list' },
        ],
    },
    {
        id: 'branding', label: 'Marca y apariencia', labelEn: 'Brand appearance',
        desc: 'Logo, colores de marca y portal de tus clientes.',
        descEn: 'Logo, brand colors, and your clients’ portal.',
        icon: iconInner('drop'),
        tabs: [
            { id: 'branding', label: 'Identidad',         labelEn: 'Identity',      href: '/app/ajustes/branding' },
            { id: 'portal',   label: 'Portal del cliente', labelEn: 'Client portal', href: '/app/ajustes/portal' },
            { id: 'dominio',  label: 'Dominio propio', labelEn: 'Custom domain', href: '/app/ajustes/dominio', keywords: 'dominio dominios domain domains subdominio subdomain dns cname txt tls ssl hostname marca branding' },
        ],
    },
    {
        id: 'cotizaciones', label: 'Cotizaciones', labelEn: 'Quotes',
        desc: 'Folio, impuestos, documento PDF y reglas de aprobación.',
        descEn: 'Numbering, taxes, PDF document, and approval rules.',
        icon: iconInner('quote'),
        tabs: [
            { id: 'cotizaciones', label: 'Folio e IVA',         labelEn: 'Numbering & tax',  href: '/app/ajustes/cotizaciones', keywords: 'folio numeracion numbering prefijo prefix serie consecutivo' },
            { id: 'impuestos',    label: 'Impuestos',           labelEn: 'Taxes',            href: '/app/ajustes/impuestos',    keywords: 'iva vat sales tax taxes gst impuesto impuestos tasa tasas rate rates retencion retenciones withholding isr irpf exento exempt catalogo' },
            { id: 'pdf',          label: 'Documento PDF',       labelEn: 'PDF document',     href: '/app/ajustes/pdf' },
            { id: 'aprobaciones', label: 'Aprobaciones',        labelEn: 'Approvals',        href: '/app/ajustes/aprobaciones', keywords: 'descuento discount margen margin umbral limite autorizacion' },
            { id: 'plantillas',   label: 'Plantillas',          labelEn: 'Templates',        href: '/app/ajustes/plantillas' },
        ],
    },
    {
        // Un cupón aplica igual a una cotización que a una factura: vive en su
        // propia categoría en vez de colgarse de una de las dos.
        id: 'descuentos', label: 'Descuentos', labelEn: 'Discounts',
        desc: 'Cupones con código, vigencia y límite de usos para tus documentos.',
        descEn: 'Coupon codes with validity dates and usage limits for your documents.',
        icon: iconInner('tag'),
        tabs: [
            { id: 'cupones', label: 'Cupones', labelEn: 'Coupons', href: '/app/ajustes/cupones', keywords: 'cupon cupones coupon coupons descuento descuentos discount discounts codigo code promocion promotion promo rebaja' },
        ],
    },
    {
        // "Facturación" a secas: el nombre de la sección describe la capacidad,
        // no el carril de un país. CFDI es el rail mexicano y se nombra dentro de
        // la sección cuando aplica, igual que factura comercial en el resto —
        // regla 10 (posicionamiento horizontal).
        id: 'facturacion', label: 'Facturación', labelEn: 'Invoicing',
        desc: 'Datos fiscales, certificado de sello y emisión de facturas.',
        descEn: 'Tax details, digital seal certificate, and invoice issuing.',
        icon: iconInner('bank'),
        // Sin pestaña "Facturas emitidas": /app/ajustes/facturas es un 301 a
        // /app/facturas, así que como pestaña sacaba al usuario de Ajustes.
        // Pasaba desapercibida mientras las pestañas sólo se veían dentro de la
        // categoría; ahora que el índice las lista, una que te expulsa se nota.
        // El archivo se conserva para links viejos en correos.
        tabs: [
            { id: 'fiscal', label: 'Datos fiscales', labelEn: 'Tax details', href: '/app/ajustes/fiscal', keywords: 'fiscal rfc nif cif nie ein tax id csd certificado certificate sello verifactu aeat sat cfdi regimen razon social domicilio facturacion invoicing qst tvq gst hst bn provincia province factur-x facturx xrechnung zugferd peppol leitweg e-rechnung einvoicing bic factura electronica spfe solucion publica crea y crece nf-e nfe sefaz danfe nota fiscal' },
        ],
    },
    {
        id: 'cobros', label: 'Cobros', labelEn: 'Payments',
        // Sin el nombre del procesador (regla 14): el dueño del negocio cobra con
        // tarjeta o transferencia, no "vía" un proveedor interno.
        desc: 'Recibe pagos de tus clientes: tarjeta y transferencia bancaria.',
        descEn: 'Accept payments from your clients: card and bank transfer.',
        icon: iconInner('wallet'),
        tabs: [
            { id: 'cobros', label: 'Cobros', labelEn: 'Payments', href: '/app/ajustes/cobros', keywords: 'stripe connect pagos payments tarjeta card transferencia spei clabe deposito payout comision fee banco mercado pago mercadopago' },
        ],
    },
    {
        id: 'planes', label: 'Planes y suscripción', labelEn: 'Plans & subscription',
        desc: 'Tu suscripción de Cord, uso del plan y tu método de pago.',
        descEn: 'Your Cord subscription, plan usage, and payment method.',
        // Antes un rayo genérico ("upgrade"/velocidad) sin relación con una
        // suscripción. Una tarjeta con banda — el objeto real de la categoría.
        icon: iconInner('card'),
        tabs: [
            { id: 'plan', label: 'Suscripción', labelEn: 'Subscription', href: '/app/ajustes/plan', keywords: 'plan planes pricing precio suscripcion subscription billing facturacion uso usage limite upgrade downgrade tarjeta' },
        ],
    },
    {
        id: 'notificaciones', label: 'Notificaciones', labelEn: 'Notifications',
        desc: 'Qué eventos te avisan y por qué canal (correo, Slack…).',
        descEn: 'Which events notify you and through which channel (email, Slack…).',
        icon: iconInner('bell'),
        tabs: [
            { id: 'notificaciones', label: 'Notificaciones', labelEn: 'Notifications', href: '/app/ajustes/notificaciones' },
            { id: 'correo',         label: 'Correo',         labelEn: 'Email',         href: '/app/ajustes/correo', keywords: 'email correo remitente sender from reply-to firma plantilla' },
        ],
    },
    {
        id: 'equipo', label: 'Equipo y permisos', labelEn: 'Team & permissions',
        desc: 'Invita a tu equipo, define permisos y la seguridad de acceso.',
        descEn: 'Invite your team, set permissions, and access security.',
        icon: iconInner('clients'),
        tabs: [
            { id: 'equipo',    label: 'Equipo y Roles',  labelEn: 'Team & roles',  href: '/app/ajustes/equipo', keywords: 'team equipo usuarios users miembros members roles permisos permissions invitar invite' },
            { id: 'sso',       label: 'SSO',             labelEn: 'SSO',           href: '/app/ajustes/sso', keywords: 'sso saml okta entra azure google workspace login inicio sesion' },
            { id: 'seguridad', label: 'Seguridad',       labelEn: 'Security',      href: '/app/ajustes/seguridad', keywords: 'seguridad security 2fa mfa totp passkey contrasena password sesiones sessions dominios' },
        ],
    },
    {
        id: 'integraciones', label: 'Integraciones', labelEn: 'Integrations',
        desc: 'Conecta Cord con tus aplicaciones y plataformas favoritas.',
        descEn: 'Connect Cord with your favorite apps and platforms.',
        icon: iconInner('plug'),
        tabs: [
            { id: 'integraciones', label: 'Integraciones', labelEn: 'Integrations', href: '/app/ajustes/integraciones', keywords: 'integraciones integrations apps hubspot slack make zapier crm conectar connect' },
        ],
    },
    {
        id: 'mcp', label: 'MCP', labelEn: 'MCP',
        desc: 'Configura el Model Context Protocol para tus asistentes.',
        descEn: 'Configure the Model Context Protocol for your assistants.',
        icon: iconInner('code'),
        tabs: [
            { id: 'mcp',           label: 'MCP',                 labelEn: 'MCP',      href: '/app/ajustes/mcp' },
        ],
    },
    {
        // "Agentes autónomos de inteligencia artificial" no le dice nada a nadie
        // fuera de la industria. El título describe qué hace, no qué es.
        id: 'agentes', label: 'Inteligencia artificial', labelEn: 'Artificial intelligence',
        desc: 'Qué puede hacer sola la IA de Cord, y hasta dónde llega.',
        descEn: "What Cord's AI can do on its own, and how far it goes.",
        icon: iconInner('cpu'),
        tabs: [
            { id: 'agentes',       label: 'Inteligencia artificial', labelEn: 'Artificial intelligence', href: '/app/ajustes/agentes' },
        ],
    },
    {
        id: 'elements', label: 'Cotizador embebible', labelEn: 'Embeddable quote builder',
        desc: 'Integra el cotizador directamente en tu sitio web.',
        descEn: 'Embed the quote builder directly on your website.',
        icon: iconInner('template'),
        tabs: [
            { id: 'elements',      label: 'Cotizador embebible', labelEn: 'Embeddable builder', href: '/app/ajustes/elements' },
        ],
    },
    {
        id: 'avanzado', label: 'Avanzado', labelEn: 'Advanced',
        desc: 'Exportar tus datos, zona de peligro y registro de auditoría.',
        descEn: 'Export your data, danger zone, and audit log.',
        icon: iconInner('shield'),
        tabs: [
            { id: 'datos',     label: 'Datos y privacidad', labelEn: 'Data & privacy', href: '/app/ajustes/datos', keywords: 'exportar export datos data privacidad privacy gdpr retencion eliminar borrar cuenta delete' },
            { id: 'historial', label: 'Historial de ajustes', labelEn: 'Settings history', href: '/app/ajustes/historial', keywords: 'restaurar restore cambios changes historial history' },
            { id: 'auditoria', label: 'Auditoría',          labelEn: 'Audit log',      href: '/app/ajustes/auditoria', keywords: 'auditoria audit log bitacora historial actividad registro' },
        ],
    },
    {
        id: 'cuenta', label: 'Tu cuenta', labelEn: 'Your account',
        desc: 'Tu perfil, sesiones activas, seguridad y autenticación.',
        descEn: 'Your profile, active sessions, security, and authentication.',
        icon: iconInner('user'),
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
export function localizeCategories(locale: 'es' | 'en', countryCode = 'MX'): SettingsCategory[] {
    const localized = SETTINGS_CATEGORIES.map((c) => ({
        ...c,
        label: locale === 'en' ? (c.labelEn || c.label) : c.label,
        desc: locale === 'en' ? (c.descEn || c.desc) : c.desc,
        tabs: c.tabs.map((tb) => ({
            ...tb,
            label: locale === 'en' ? (tb.labelEn || tb.label) : tb.label,
        })),
    }));
    if (countryCode.toUpperCase() === 'MX') return localized;
    return localized.map((category) => category.id === 'cotizaciones' ? {
        ...category,
        tabs: category.tabs.map((tab) => tab.id === 'cotizaciones'
            ? { ...tab, label: locale === 'en' ? 'Numbering & taxes' : 'Folio e impuestos' }
            : tab),
    } : category.id !== 'facturacion' ? category : {
        ...category,
        // El nombre de la categoría ya es neutro; fuera de México solo cambia la
        // descripción y el nombre de la pestaña fiscal (no hay CSD que subir).
        desc: locale === 'en'
            ? 'Tax profile, numbering, and commercial invoices for your country.'
            : 'Perfil fiscal, numeración y facturas comerciales para tu país.',
        tabs: category.tabs.map((tab) => tab.id === 'fiscal'
            ? { ...tab, label: locale === 'en' ? 'Tax profile' : 'Perfil fiscal' }
            : tab),
    });
}

/** Categoría (ya localizada) que contiene la pestaña `tabId`. */
export function localizedCategoryOfTab(tabId: string, locale: 'es' | 'en', countryCode = 'MX'): SettingsCategory | undefined {
    return localizeCategories(locale, countryCode).find((c) => c.tabs.some((t) => t.id === tabId));
}
