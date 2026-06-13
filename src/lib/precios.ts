// src/lib/precios.ts
// Fuente ÚNICA de los precios y la comparativa de planes.
// La usan el home (components/landing/Pricing.astro) y la página /precios.
// ⚠️ Si André ajusta precios, cámbialos AQUÍ (un solo lugar).

export interface Plan {
    id: 'free' | 'pro' | 'negocio';
    nombre: string;
    tagline: string;
    precioMensual: number;        // MXN/mes (0 = gratis)
    destacado?: boolean;
    ribbon?: string;
    ctaLabel: string;
    ctaHref: string;
    feats: string[];              // bullets de la card
}

// Anual = se pagan 10 meses (2 gratis). Cambia aquí si la promo es otra.
export const MESES_POR_ANIO = 10;
export const precioAnualMensualizado = (mensual: number) =>
    Math.round((mensual * MESES_POR_ANIO) / 12);

export const PLANES: Plan[] = [
    {
        id: 'free',
        nombre: 'Gratis',
        tagline: 'Para probar el sistema.',
        precioMensual: 0,
        ctaLabel: 'Empezar gratis',
        ctaHref: '/registro',
        feats: [
            'Hasta 5 cotizaciones activas',
            'Catálogo de productos',
            'Link público y PDF',
            'Marca "Powered by Trato"',
        ],
    },
    {
        id: 'pro',
        nombre: 'Profesional',
        tagline: 'Para vender en serio.',
        precioMensual: 590,
        destacado: true,
        ribbon: 'MÁS POPULAR',
        ctaLabel: 'Probar 7 días gratis',
        ctaHref: '/registro',
        feats: [
            'Cotizaciones ilimitadas',
            'Tu marca (logo y colores)',
            'Seguimiento en vivo',
            'Términos Net 30 / Net 60',
            'Pago en línea de cotizaciones',
        ],
    },
    {
        id: 'negocio',
        nombre: 'Negocio',
        tagline: 'Con CFDI y crédito.',
        precioMensual: 1190,
        ctaLabel: 'Probar 7 días gratis',
        ctaHref: '/registro',
        feats: [
            'Todo lo de Profesional',
            'CFDI 4.0 automático ante el SAT',
            'Clientes con límite de crédito',
            'Analítica avanzada',
            'Soporte prioritario',
        ],
    },
];

// ── Comparativa completa (para la tabla de /precios) ──
// Valor por plan: true = incluido · false = no · string = detalle/limite
export interface CompareRow {
    label: string;
    free: boolean | string;
    pro: boolean | string;
    negocio: boolean | string;
    hint?: string;
}
export interface CompareGroup {
    titulo: string;
    rows: CompareRow[];
}

export const COMPARATIVA: CompareGroup[] = [
    {
        titulo: 'Cotizaciones',
        rows: [
            { label: 'Cotizaciones activas', free: '5', pro: 'Ilimitadas', negocio: 'Ilimitadas' },
            { label: 'Editor con precios negociados', free: true, pro: true, negocio: true },
            { label: 'Líneas libres (fuera de catálogo)', free: true, pro: true, negocio: true },
            { label: 'IVA configurable y totales en vivo', free: true, pro: true, negocio: true },
            { label: 'Folio consecutivo con tu prefijo', free: true, pro: true, negocio: true },
            { label: 'Duplicar y usar como plantilla', free: true, pro: true, negocio: true },
        ],
    },
    {
        titulo: 'Catálogo y clientes',
        rows: [
            { label: 'Catálogo de productos', free: true, pro: true, negocio: true },
            { label: 'Importar productos y clientes por CSV', free: true, pro: true, negocio: true },
            { label: 'Directorio de clientes', free: true, pro: true, negocio: true },
            { label: 'Términos default por cliente (Net 30/60)', free: false, pro: true, negocio: true },
            { label: 'Clientes con límite de crédito', free: false, pro: false, negocio: true },
        ],
    },
    {
        titulo: 'Link público y seguimiento',
        rows: [
            { label: 'Link público + PDF descargable', free: true, pro: true, negocio: true },
            { label: 'Aprobar / rechazar en un clic', free: true, pro: true, negocio: true },
            { label: 'Seguimiento en vivo ("la vieron")', free: true, pro: true, negocio: true },
            { label: 'Tu marca (sin "Powered by Trato")', free: false, pro: true, negocio: true },
            { label: 'Logo y color de marca propios', free: false, pro: true, negocio: true },
            { label: 'Pago en línea con Stripe', free: false, pro: true, negocio: true },
        ],
    },
    {
        titulo: 'Facturación, analítica y soporte',
        rows: [
            { label: 'CFDI 4.0 automático (timbrado SAT)', free: false, pro: false, negocio: true },
            { label: 'Analítica', free: false, pro: 'Esencial', negocio: 'Avanzada' },
            { label: 'Soporte', free: 'Por correo', pro: 'Por correo', negocio: 'Prioritario' },
        ],
    },
];

export const FAQ_PRECIOS: { q: string; a: string }[] = [
    {
        q: '¿De verdad puedo empezar gratis?',
        a: 'Sí. El plan Gratis es para siempre: hasta 5 cotizaciones activas, catálogo, link público y PDF. No pedimos tarjeta para registrarte.',
    },
    {
        q: '¿Qué cuenta como "cotización activa"?',
        a: 'Una cotización que sigue viva en tu pipeline (borrador, enviada, vista o aprobada sin cerrar). Las cerradas, pagadas o vencidas no consumen tu límite, así que el plan Gratis rinde más de lo que parece.',
    },
    {
        q: '¿Puedo cambiar de plan cuando quiera?',
        a: 'Cuando quieras, sin contratos ni penalizaciones. Subes de plan al instante y bajas al final de tu ciclo. Si cancelas, tus datos siguen ahí en el plan Gratis.',
    },
    {
        q: '¿Los precios llevan IVA?',
        a: 'Sí. Todos los precios están en pesos mexicanos y con IVA incluido. Lo que ves es lo que pagas.',
    },
    {
        q: '¿Cómo funciona el CFDI 4.0?',
        a: 'En el plan Negocio conectas tu Certificado de Sello Digital (CSD) una vez y, al cerrar una cotización, Trato timbra el CFDI 4.0 ante el SAT con los mismos datos. Sin recapturar en otro portal.',
    },
    {
        q: '¿Necesito tarjeta para la prueba de 7 días?',
        a: 'La prueba de Profesional y Negocio dura 7 días. Si decides quedarte, agregas tu método de pago; si no, no se cobra nada y sigues en Gratis.',
    },
    {
        q: '¿Tienen algo a medida o integración con mi ERP?',
        a: 'Sí, para volúmenes altos o integraciones (ERP, e-commerce, multi-sucursal) armamos un plan a la medida. Escríbenos a hola@flouvia.com.',
    },
];
