// src/lib/precios.ts
// Fuente ÚNICA de los precios y la comparativa de planes.
// La usan el home (components/landing/Pricing.astro) y la página /precios.
// ⚠️ Si André ajusta precios, cámbialos AQUÍ (un solo lugar).
//
// Matriz maestra (jun 2026): 5 niveles. Pro es el plan ANCLA (el que se empuja).
// Free = gancho · Starter = freelance · Pro = equipos (DESTACADO) ·
// Scale = corp · Developer = infraestructura.

export type PlanId = 'free' | 'starter' | 'pro' | 'scale' | 'developer';

export interface Plan {
    id: PlanId;
    nombre: string;
    tagline: string;
    precioMensual: number;        // MXN/mes (0 = gratis)
    destacado?: boolean;
    ribbon?: string;
    ctaLabel: string;
    ctaHref: string;
    feats: string[];              // bullets de la card
    stripeProductId?: string;     // producto en Stripe (el price_id se resuelve aparte)
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
            '5 cotizaciones activas',
            '50 productos y 50 clientes',
            '3 armados con IA al mes',
            'Link público + PDF',
            'Marca “Powered by Trato”',
        ],
    },
    {
        id: 'starter',
        nombre: 'Starter',
        tagline: 'Para el que vende solo.',
        precioMensual: 240,
        ctaLabel: 'Empezar ahora',
        ctaHref: '/registro',
        stripeProductId: 'prod_Ui3vQBd5goOHQ1',
        feats: [
            '50 cotizaciones activas',
            '500 productos y clientes',
            '20 armados con IA + 3 CFDI al mes',
            'Tu marca (sin “Powered by”)',
            'Importación por CSV',
        ],
    },
    {
        id: 'pro',
        nombre: 'Profesional',
        tagline: 'Para equipos que venden en serio.',
        precioMensual: 590,
        destacado: true,
        ribbon: 'MÁS POPULAR',
        ctaLabel: 'Empezar ahora',
        ctaHref: '/registro',
        stripeProductId: 'prod_Ui45gzUJYA3O2w',
        feats: [
            'Cotizaciones ilimitadas',
            'Hasta 5 usuarios',
            '50 armados con IA + 20 CFDI al mes',
            'Seguimiento en vivo y analítica',
            'Audit log inmutable',
        ],
    },
    {
        id: 'scale',
        nombre: 'Scale',
        tagline: 'Para operaciones con control.',
        precioMensual: 1390,
        ctaLabel: 'Empezar ahora',
        ctaHref: '/registro',
        stripeProductId: 'prod_Ui4AQicrCoCMUt',
        feats: [
            'Todo lo de Profesional',
            'Hasta 15 usuarios',
            '500 armados con IA + 100 CFDI al mes',
            'Flujos de aprobación y cobranza',
            'Correos desde tu dominio (SMTP)',
        ],
    },
    {
        id: 'developer',
        nombre: 'Developer',
        tagline: 'Para integrar a tu stack.',
        precioMensual: 2990,
        ctaLabel: 'Empezar ahora',
        ctaHref: '/registro',
        stripeProductId: 'prod_Ui4Iff1aimaK0y',
        feats: [
            'Todo lo de Scale',
            'Usuarios e IA ilimitados',
            '1,000 CFDI + 50,000 API al mes',
            'Excedentes al menor costo',
            'Infraestructura para integrar',
        ],
    },
];

// ── Comparativa completa (para la tabla de /precios) ──
// Valor por plan: true = incluido · false = no · string = detalle/limite
export interface CompareRow {
    label: string;
    free: boolean | string;
    starter: boolean | string;
    pro: boolean | string;
    scale: boolean | string;
    developer: boolean | string;
    hint?: string;
}
export interface CompareGroup {
    titulo: string;
    rows: CompareRow[];
}

export const COMPARATIVA: CompareGroup[] = [
    {
        titulo: 'Límites del sistema',
        rows: [
            { label: 'Cotizaciones activas', free: '5', starter: '50', pro: 'Ilimitadas', scale: 'Ilimitadas', developer: 'Ilimitadas' },
            { label: 'Catálogo de productos', free: '50', starter: '500', pro: 'Ilimitado', scale: 'Ilimitado', developer: 'Ilimitado' },
            { label: 'Directorio de clientes', free: '50', starter: '500', pro: 'Ilimitado', scale: 'Ilimitado', developer: 'Ilimitado' },
            { label: 'Usuarios del sistema', free: '1', starter: '1', pro: '5', scale: '15', developer: 'Ilimitados' },
        ],
    },
    {
        titulo: 'Consumo mensual incluido',
        rows: [
            { label: 'Armado de cotizaciones con IA', free: '3 / mes', starter: '20 / mes', pro: '50 / mes', scale: '500 / mes', developer: 'Ilimitado' },
            { label: 'Timbrado CFDI 4.0 (SAT)', free: false, starter: '3 / mes', pro: '20 / mes', scale: '100 / mes', developer: '1,000 / mes' },
            { label: 'Llamadas a la API pública', free: '100 / mes', starter: '1,000 / mes', pro: '5,000 / mes', scale: '10,000 / mes', developer: '50,000 / mes' },
        ],
    },
    {
        titulo: 'Identidad y datos',
        rows: [
            { label: 'Importación masiva (CSV)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Quitar marca “Powered by Trato”', free: false, starter: true, pro: true, scale: true, developer: true },
            { label: 'Correos desde tu dominio (SMTP)', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'Multi-moneda (MXN, USD, EUR)', free: true, starter: true, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'CRM, analítica y cierre',
        rows: [
            { label: 'Presencia “lo está viendo ahora”', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'Analítica: tasa de cierre y conversión', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Analítica: pronóstico y margen cedido', free: false, starter: true, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Riesgo y tesorería',
        rows: [
            { label: 'CFDI 4.0 automático ante el SAT', free: false, starter: true, pro: true, scale: true, developer: true },
            { label: 'Flujos de aprobación (tope de descuento/monto)', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'Módulo de cobranza (aging de cartera)', free: false, starter: false, pro: false, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Infraestructura y desarrolladores',
        rows: [
            { label: 'Integración Zapier / Webhooks', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Cotizador embebible (Trato Elements)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Audit log inmutable (traza en DB)', free: false, starter: false, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Excedentes (cobro por uso)',
        rows: [
            { label: 'Usuario adicional', free: 'Tope duro', starter: 'Tope duro', pro: '$300 / u', scale: '$300 / u', developer: '$200 / u' },
            { label: 'Armado con IA extra', free: 'Tope duro', starter: '$4.00 / uso', pro: '$3.50 / uso', scale: '$3.00 / uso', developer: '$2.50 / uso' },
            { label: 'Timbrado CFDI extra', free: false, starter: '$3.00 / folio', pro: '$3.00 / folio', scale: '$2.00 / folio', developer: '$1.50 / folio' },
            { label: 'API extra (por 100 req)', free: 'Tope duro', starter: '$0.03 USD', pro: '$0.03 USD', scale: '$0.02 USD', developer: '$0.02 USD' },
        ],
    },
];

export const FAQ_PRECIOS: { q: string; a: string }[] = [
    {
        q: '¿De verdad puedo empezar gratis?',
        a: 'Sí. El plan Gratis es para siempre: hasta 5 cotizaciones activas, 50 productos, 50 clientes, link público y PDF. No pedimos tarjeta para registrarte.',
    },
    {
        q: '¿Qué cuenta como “cotización activa”?',
        a: 'Una cotización que sigue viva en tu pipeline (borrador, enviada, vista o aprobada sin cerrar). Las cerradas, pagadas o vencidas no consumen tu límite, así que el plan rinde más de lo que parece.',
    },
    {
        q: '¿Qué pasa si me paso del consumo incluido?',
        a: 'Depende del plan. En Gratis y Starter algunos límites son topes duros (se pausan hasta el siguiente ciclo o hasta que subas de plan). De Profesional en adelante, el excedente se cobra por uso al final del mes vía Stripe: armados con IA, timbres CFDI, usuarios y llamadas a la API. Sin sorpresas: ves el consumo en tiempo real dentro de la app.',
    },
    {
        q: '¿Puedo cambiar de plan cuando quiera?',
        a: 'Cuando quieras, sin contratos ni penalizaciones. Subes de plan al instante (con prorrateo) y bajas al final de tu ciclo. Si cancelas, tus datos siguen ahí en el plan Gratis.',
    },
    {
        q: '¿Los precios llevan IVA?',
        a: 'Sí. Todos los precios están en pesos mexicanos y con IVA incluido. Lo que ves es lo que pagas.',
    },
    {
        q: '¿Cómo funciona el CFDI 4.0?',
        a: 'Desde el plan Starter conectas tu Certificado de Sello Digital (CSD) una vez y, al cerrar una cotización, Trato timbra el CFDI 4.0 ante el SAT con los mismos datos. Sin recapturar en otro portal.',
    },
    {
        q: '¿Puedo probar Trato sin pagar?',
        a: 'Sí. El plan Gratis es para siempre: 5 cotizaciones activas, sin tarjeta. Cuando estés listo subes a un plan de pago y se cobra desde el alta. Puedes cambiar o cancelar cuando quieras.',
    },
    {
        q: '¿El plan Developer es para integrar Trato a mi sistema?',
        a: 'Exacto. Developer incluye 50,000 llamadas a la API al mes, los excedentes más baratos, usuarios e IA ilimitados y el cotizador embebible. Es la base para conectar Trato a tu ERP, e-commerce o portal de clientes.',
    },
];
