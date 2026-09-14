// src/lib/precios.ts
// Fuente ÚNICA de los precios y la comparativa de planes.
// La usan el home (components/landing/Pricing.astro) y la página /precios.
// ⚠️ Si André ajusta precios, cámbialos AQUÍ (un solo lugar).
//
// Matriz ago 2026 (delimitación de planes): 5 niveles. Pro es el plan ANCLA (el
// que se empuja). Free = gancho, con tope de envíos además de activas · Starter
// = freelance, con CFDI en México y factura comercial en los demás mercados · Pro =
// equipos (DESTACADO), ahora también cobranza y flujo de caja a 90 días ·
// Scale = automatización (aprobaciones, cobranza autónoma con IA, SSO) ·
// Developer = sin precio de autoservicio — capacidad y condiciones a medida,
// "Hablar con ventas" (ver `custom` abajo). Precios base SIN cambios: los price
// ID de Stripe LIVE ya tienen suscripciones activas.

// El tipo vive junto al contrato ejecutable de acceso. Se re-exporta para no
// romper consumidores históricos de `precios.ts`.
import type { PlanId } from './entitlements';
export type { PlanId } from './entitlements';
import type { PlatformCurrency } from './plan-currency';
import { EUR_MONTHLY } from './plan-eur-rates';

export interface Plan {
    id: PlanId;
    nombre: string;
    tagline: string;
    /**
     * Precio mensual por divisa de plataforma (0 = gratis). La divisa es un
     * DATO, no un comentario: hasta ago 2026 esto era un `number` con un
     * "// MXN/mes" al lado, y la landing en inglés publicaba una tabla USD
     * paralela que el checkout nunca cobró (regla 21).
     *
     * Developer conserva su valor real —Stripe sigue cobrando a las
     * suscripciones vigentes— pero no se muestra: `custom` lo saca del
     * autoservicio.
     */
    precio: Record<'MXN' | 'USD', number> & Partial<Record<PlatformCurrency, number>>;
    destacado?: boolean;
    ribbon?: string;
    /** Sin precio de autoservicio: "A tu medida" + CTA a ventas, sin checkout. */
    custom?: boolean;
    ctaLabel: string;
    ctaHref: string;
    feats: string[];              // bullets de la card
    stripeProductId?: string;     // producto en Stripe (el price_id se resuelve aparte)
}

// Anual = se pagan 10 meses (2 gratis). Cambia aquí si la promo es otra.
export const MESES_POR_ANIO = 10;
export const precioAnualTotal = (mensual: number) => mensual * MESES_POR_ANIO;
export const precioAnualMensualizado = (mensual: number) =>
    Math.round((mensual * MESES_POR_ANIO) / 12);

export const PLANES: Plan[] = [
    {
        id: 'free',
        nombre: 'Gratis',
        tagline: 'Para tus primeros clientes. Cada mes.',
        precio: { MXN: 0, USD: 0, EUR: EUR_MONTHLY.free },
        ctaLabel: 'Empezar gratis',
        ctaHref: '/registro',
        feats: [
            '5 envíos al mes, renovables',
            'Hasta 5 cotizaciones activas a la vez',
            '50 productos y 50 clientes',
            '3 armados con IA al mes',
            '10 facturas comerciales al mes',
            'Marca “Powered by Cord”',
        ],
    },
    {
        id: 'starter',
        nombre: 'Starter',
        tagline: 'Más propuestas. Tu marca al frente.',
        precio: { MXN: 240, USD: 12, EUR: EUR_MONTHLY.starter },
        ctaLabel: 'Empezar ahora',
        ctaHref: '/registro',
        stripeProductId: 'prod_Ui3vQBd5goOHQ1',
        feats: [
            'Envíos ilimitados; hasta 50 activas',
            '500 productos y clientes',
            'Facturas comerciales ilimitadas',
            '30 facturas con validez fiscal + 20 armados con IA al mes',
            'Tu marca (sin “Powered by”)',
        ],
    },
    {
        id: 'pro',
        nombre: 'Profesional',
        tagline: 'Tu equipo, tus ventas y tu cobranza.',
        precio: { MXN: 590, USD: 30, EUR: EUR_MONTHLY.pro },
        destacado: true,
        ribbon: 'PARA TU EQUIPO',
        ctaLabel: 'Empezar ahora',
        ctaHref: '/registro',
        stripeProductId: 'prod_Ui45gzUJYA3O2w',
        feats: [
            'Cotizaciones ilimitadas',
            '5 usuarios incluidos',
            '200 facturas fiscales + 50 armados con IA al mes',
            'Cobranza, facturas recurrentes y flujo a 90 días',
            'Seguimiento en vivo y dominio propio para tus links',
        ],
    },
    {
        id: 'scale',
        nombre: 'Scale',
        tagline: 'Automatiza el seguimiento y protege tu margen.',
        precio: { MXN: 1390, USD: 70, EUR: EUR_MONTHLY.scale },
        ctaLabel: 'Empezar ahora',
        ctaHref: '/registro',
        stripeProductId: 'prod_Ui4AQicrCoCMUt',
        feats: [
            'Todo lo de Profesional',
            '15 usuarios incluidos',
            '500 facturas fiscales + 500 armados con IA al mes',
            'Cobranza autónoma con IA y aprobaciones',
            'SSO empresarial y gobernanza de agentes IA',
        ],
    },
    {
        id: 'developer',
        nombre: 'Developer',
        tagline: 'Capacidad y condiciones a tu medida.',
        precio: { MXN: 2990, USD: 150 },
        custom: true,
        ctaLabel: 'Hablar con ventas',
        ctaHref: '/contacto/ventas',
        stripeProductId: 'prod_Ui4Iff1aimaK0y',
        feats: [
            'Todo lo de Scale',
            'Usuarios e IA ilimitados',
            '1,000 facturas fiscales + 50,000 API al mes',
            'Excedentes al menor costo',
            'Condiciones y onboarding a tu medida',
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
    overageDim?: 'usuario' | 'ia' | 'timbrado' | 'api';
}
export const overageRow = (overageDim: NonNullable<CompareRow['overageDim']>, label: string): CompareRow =>
    ({ overageDim, label, free: false, starter: false, pro: false, scale: false, developer: false });

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
            { label: 'Cotizaciones enviadas', free: '5 / mes', starter: 'Ilimitadas', pro: 'Ilimitadas', scale: 'Ilimitadas', developer: 'Ilimitadas' },
            { label: 'Armado de cotizaciones con IA', free: '3 / mes', starter: '20 / mes', pro: '50 / mes', scale: '500 / mes', developer: 'Ilimitado' },
            { label: 'Facturas comerciales', free: '10 / mes', starter: 'Ilimitadas', pro: 'Ilimitadas', scale: 'Ilimitadas', developer: 'Ilimitadas', hint: 'En México y España el documento comercial es una proforma.' },
            { label: 'Facturas con validez fiscal', free: false, starter: '30 / mes', pro: '200 / mes', scale: '500 / mes', developer: '1,000 / mes', hint: 'CFDI 4.0 en México; VERI*FACTU en España tras completar su activación. En los demás mercados Cord emite factura comercial y no timbra ante otras autoridades fiscales.' },
            { label: 'Llamadas a la API pública', free: '100 / mes', starter: '1,000 / mes', pro: '5,000 / mes', scale: '10,000 / mes', developer: '50,000 / mes' },
        ],
    },
    {
        titulo: 'Cotizaciones y editor',
        rows: [
            { label: 'Editor con margen bruto en vivo', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Línea libre (cotizar sin producto)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Listas de precio por nivel (Plata, Oro, Distribuidor)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Plantillas de PDF (clásico, minimal, detallado)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'PDF con tu logo y color de marca', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Duplicar cotización', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Historial de versiones inmutable', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Aprobación parcial por línea', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Pipeline Kanban (arrastrar para avanzar)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Tareas y recordatorios (CRM)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Impuestos configurables (IVA, IEPS, retenciones)', free: true, starter: true, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Experiencia del cliente (link público)',
        rows: [
            { label: 'Link público + PDF descargable', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Aviso “tu cliente vio la cotización”', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Presencia “lo está viendo ahora”', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'Aprobación con evidencia técnica (SHA-256)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Contraoferta y chat con el cliente', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Negociación por línea (hilos)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Pago en línea con tarjeta (Stripe)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Portal personalizable (banner y bienvenida)', free: true, starter: true, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Inteligencia artificial',
        rows: [
            { label: 'Armar cotización desde texto con IA', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Cobranza autónoma con IA (negocia cuotas)', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'CFO con IA (insight de flujo de caja)', free: false, starter: false, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Fiscal y multi-divisa',
        rows: [
            { label: 'Emisión fiscal integrada', free: false, starter: true, pro: true, scale: true, developer: true, hint: 'CFDI 4.0 en México con emisor configurado. VERI*FACTU en España requiere activación y validación. Sin promesa de cumplimiento fiscal universal.' },
            { label: 'Tu propio CSD (sello digital, México)', free: false, starter: true, pro: true, scale: true, developer: true },
            { label: 'Tipo de cambio congelado al cotizar', free: true, starter: true, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'CRM, analítica y cierre',
        rows: [
            { label: 'Seguimiento de pipeline y embudo', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Analítica: tasa de cierre y conversión', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Analítica: pronóstico y margen cedido', free: false, starter: true, pro: true, scale: true, developer: true },
            { label: 'Top clientes y top productos', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'CFO Dashboard (DSO, concentración de riesgo)', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'Ranking ponderado de clientes', free: false, starter: false, pro: true, scale: true, developer: true },

        ],
    },
    {
        titulo: 'Riesgo y tesorería',
        rows: [
            { label: 'Módulo de cobranza (aging de cartera)', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'Pronóstico de flujo de caja a 90 días', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'Flujos de aprobación (tope descuento/monto/margen)', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'Auditor silencioso de márgenes', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'Interés moratorio automático', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'Facturas recurrentes', free: false, starter: false, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Identidad y marca',
        rows: [
            { label: 'Importación masiva (CSV)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Quitar marca “Powered by Cord”', free: false, starter: true, pro: true, scale: true, developer: true },
            { label: 'Personalizar color y logo', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Dominio propio para tus links (cotizaciones.tuempresa.com)', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'Correos desde tu dominio (SMTP)', free: false, starter: false, pro: false, scale: 'Próximamente', developer: 'Próximamente' },
            { label: 'Multi-moneda (14 divisas ofrecidas)', free: true, starter: true, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Notificaciones e integraciones',
        rows: [
            { label: 'Correos transaccionales (enviada, vista, aprobada…)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Recordatorios de cobro automáticos', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Centro de notificaciones en tiempo real', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Integración con Slack', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Remitente y plantilla de correo a tu medida', free: false, starter: true, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Equipo, roles y seguridad',
        rows: [
            { label: 'Roles y permisos por sección', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'Invitaciones de equipo por correo', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'Organizaciones y cambio de espacio', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'SSO / SAML (enterprise)', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'Audit log inmutable (traza en DB)', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'Row Level Security (RLS) en base de datos', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Cifrado en tránsito y reposo (TLS + AES-256)', free: true, starter: true, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Desarrolladores y herramientas',
        rows: [
            { label: 'API pública REST', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Llaves de API incluidas', free: '2', starter: '5', pro: '20', scale: '50', developer: '200' },
            { label: 'Webhooks salientes (firma HMAC)', free: '1', starter: '3', pro: '10', scale: '25', developer: '100' },
            { label: 'Log de entregas + reintento (replay)', free: false, starter: false, pro: true, scale: true, developer: true },
            { label: 'Servidor MCP (para agentes de IA)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'Gobernanza de agentes IA (MCP saliente)', free: false, starter: false, pro: false, scale: true, developer: true },
            { label: 'Cotizador embebible (Cord Elements)', free: true, starter: true, pro: true, scale: true, developer: true },
            { label: 'SDKs (React, Vue, Framer, Webflow)', free: true, starter: true, pro: true, scale: true, developer: true },
        ],
    },
    {
        titulo: 'Excedentes (cobro por uso)',
        rows: [
            overageRow('usuario', 'Usuario adicional'),
            overageRow('ia', 'Armado con IA extra'),
            overageRow('timbrado', 'Factura fiscal adicional'),
            overageRow('api', 'API extra (por 100 req)'),
        ],
    },
];

export const FAQ_PRECIOS: { q: string; a: string }[] = [
    {
        q: '¿De verdad puedo empezar gratis?',
        a: 'Sí. Gratis no tiene fecha de vencimiento: incluye 5 envíos de cotizaciones cada mes, hasta 5 cotizaciones activas a la vez, 50 productos y 50 clientes. Puedes compartir el link y descargar el PDF con tu logo; el sello “Powered by Cord” permanece visible. No necesitas tarjeta.',
    },
    {
        q: '¿Qué cuenta como “cotización activa”?',
        a: 'Una cotización que sigue viva en tu pipeline (borrador, enviada, vista o aprobada sin cerrar). Las cerradas, pagadas o vencidas no consumen tu límite, así que el plan rinde más de lo que parece. En Gratis, además de las 5 activas hay un tope de 5 cotizaciones ENVIADAS al mes — ese sí se reinicia cada mes, sin importar cuántas cierres.',
    },
    {
        q: '¿Qué pasa si me paso del consumo incluido?',
        a: 'Gratis tiene topes duros. Desde Starter se cobran los excedentes de IA, facturas fiscales y API a las tarifas publicadas; las facturas comerciales no tienen tope en planes de pago. Starter conserva un usuario. En Profesional y Scale cada usuario adicional se cobra cada mes mientras siga activo. Puedes consultar tu consumo en la app.',
    },
    {
        q: '¿Puedo cambiar de plan cuando quiera?',
        a: 'Cuando quieras, sin contratos ni penalizaciones. Subes de plan al instante (con prorrateo) y bajas al final de tu ciclo. Si cancelas, tus datos siguen ahí en el plan Gratis.',
    },
    {
        q: '¿Los precios llevan impuestos?',
        a: 'Sí. Lo que ves es lo que pagas: no se suma nada al cobrar. Los negocios en México pagan los planes de Cord en pesos mexicanos (MXN); España, Alemania y Francia, en euros (EUR); los demás mercados soportados, en dólares (USD). Las suscripciones existentes conservan su moneda de facturación.',
    },
    {
        q: '¿Cómo funciona la facturación electrónica?',
        a: 'Hay dos tipos de factura. La comercial (proforma en México y España) está en todos los planes: 10 al mes en Gratis e ilimitadas desde Starter. La factura con validez fiscal empieza en Starter con 30 al mes; Profesional incluye 200 y Scale 500. Hoy Cord timbra CFDI 4.0 en México, y en España VERI*FACTU requiere completar su activación. En los demás mercados Cord emite la factura comercial y no timbra ante otras autoridades. Una proforma no sustituye el CFDI.',
    },
    {
        q: '¿Qué pasa después de mis 5 envíos gratis?',
        a: 'Se pausan los nuevos envíos hasta el primer día del siguiente mes (UTC), cuando se renueva el cupo de 5. Puedes esperar o elegir Starter para enviar sin límite mensual. El límite de cotizaciones activas es independiente: cerrar una libera espacio, pero no repone envíos. Llegar al cupo no convierte tu cuenta en una suscripción de pago.',
    },
    {
        q: '¿Cuándo me conviene pagar por Cord?',
        a: 'Elige Starter si necesitas facturas con validez fiscal donde Cord está habilitado, envíos sin límite o quitar “Powered by Cord”. Profesional añade cotizaciones ilimitadas, 5 usuarios incluidos, seguimiento en vivo, cobranza, facturas recurrentes y flujo de caja a 90 días. Scale suma aprobaciones, cobranza autónoma con IA y SSO. Puedes quedarte en Gratis mientras sus límites cubran tu operación.',
    },
    {
        q: '¿Puedo quitar la marca de Cord y usar mi dominio?',
        a: 'Puedes quitar “Powered by Cord” desde Starter; Profesional y Scale también lo incluyen. Tu logo y tus colores están disponibles incluso en Gratis. Enviar correos desde tu dominio (SMTP) llegará próximamente a Scale. Desde Profesional puedes servir tus enlaces desde un subdominio propio, como cotizaciones.tuempresa.com, configurándolo en Ajustes › Dominio.',
    },
    {
        q: '¿Gratis tiene un límite por el dinero que cobro?',
        a: 'Actualmente no hay un umbral de facturación mensual que obligue a cambiar de plan. Gratis se limita por envíos, cotizaciones activas y otros recursos. Los pagos en línea tienen comisiones de procesamiento y requieren una cuenta elegible en un mercado con Cord Payments; la suscripción gratuita no elimina esas comisiones.',
    },
    {
        q: '¿El plan Developer es para integrar Cord a mi sistema?',
        a: 'Exacto. Developer incluye 50,000 llamadas a la API y 1,000 facturas fiscales al mes, los excedentes más baratos, usuarios e IA ilimitados y el cotizador embebible — es la base para conectar Cord a tu ERP, e-commerce o portal de clientes. No tiene precio de autoservicio: se contrata hablando con ventas, para dejar la capacidad y las condiciones a la medida de tu integración.',
    },
    {
        q: '¿Necesito ser cliente de Flouvia para contratar un plan?',
        a: 'No. Cord es un software independiente: los negocios de los 12 mercados disponibles pueden registrarse directamente en cordhq.app y elegir un plan, sin relación previa con Flouvia ni con otro producto.',
    },
];
