// src/lib/solucion.ts
// Contenido de las páginas de solución por industria (/soluciones/[slug]).
// Espeja la estructura de producto.ts: el copy vive aquí; el layout y los
// mockups (uno por industria) viven en src/pages/soluciones/[slug].astro.

export interface SolStat {
    valor: string;        // si trae countup se anima con count-up
    countup?: number;
    decimals?: number;
    prefix?: string;
    suffix?: string;
    label: string;
}

export interface SolBlock {
    eyebrow: string;
    titulo: string;       // admite HTML
    copy: string;
    bullets: string[];
}

export interface SolFaq {
    q: string;
    a: string;
}

export interface SolLink {
    href: string;        // /producto/<slug>
    label: string;       // ancla del link
}

export interface Solution {
    slug: string;
    nav: string;              // nombre corto (megamenú, hub, cross-links)
    eyebrow: string;
    titulo: string;          // H1, admite HTML
    sub: string;
    metaTitle?: string;      // <title>/OG — keyword-rich
    metaDescription?: string;// meta description
    paraQuien: string;       // "Para quién es Cord"
    dolor: string;           // el dolor principal
    stats: SolStat[];
    blocks: SolBlock[];
    resultado?: {            // caso de uso real con métricas (AI-SEO)
        cliente: string;
        metricas: { valor: string; label: string }[];
        nota: string;
    };
    faqs: SolFaq[];          // FAQ + FAQPage JSON-LD
    interlink: SolLink;      // link a la feature de producto más relevante
    cta: { titulo: string; sub: string };
}

export const SOLUCIONES: Solution[] = [
    {
        slug: 'empresas',
        nav: 'Empresas',
        eyebrow: 'PARA EMPRESAS',
        titulo: 'Cotizaciones escalables para equipos de alto rendimiento.',
        sub: 'Moderniza el proceso comercial de tu empresa. Cord elimina cuellos de botella en aprobaciones, controla el margen en tiempo real y asegura que cada propuesta enviada cumpla con los lineamientos de la compañía.',
        metaTitle: 'Software de cotizaciones B2B para Empresas — Cord by Flouvia',
        metaDescription: 'Plataforma empresarial para escalar procesos de cotización, controlar listas de precios por volumen y gestionar aprobaciones de crédito con seguridad y cumplimiento.',
        paraQuien: 'Cord para Empresas está diseñado para corporativos, distribuidores a gran escala y empresas B2B consolidadas que manejan grandes volúmenes de propuestas, requieren control estricto sobre precios y márgenes, y necesitan visibilidad total sobre el pipeline de ventas.',
        dolor: 'Los procesos comerciales descentralizados causan fugas de margen y pérdida de visibilidad en el cierre.',
        stats: [
            { valor: '99.9', countup: 99.9, decimals: 1, suffix: '%', label: 'de uptime histórico en nuestra infraestructura' },
            { valor: '10x', label: 'más velocidad en aprobaciones internas' },
            { valor: '0', countup: 0, label: 'fugas de margen por errores de cálculo' },
        ],
        blocks: [
            {
                eyebrow: 'CONTROL DE PRECIOS',
                titulo: 'Protege tu margen a escala.',
                copy: 'Configura reglas de negocio complejas, listas de precios por nivel de cliente y límites de descuento por representante. Cord asegura que ninguna cotización salga sin el margen esperado y centraliza la toma de decisiones financieras.',
                bullets: [
                    'Listas de precios dinámicas por volumen y región',
                    'Aprobaciones internas automatizadas por monto',
                    'Auditoría y trazabilidad en cada cambio de precio',
                ],
            },
            {
                eyebrow: 'INTEGRACIÓN EMPRESARIAL',
                titulo: 'Conectado a tu ecosistema operativo.',
                copy: 'Cord no es un silo. A través de nuestras APIs y Webhooks robustos, puedes sincronizar catálogos, actualizar CRMs (Salesforce, HubSpot) y disparar facturación en tu ERP en el milisegundo en que un cliente aprueba.',
                bullets: [
                    'Sincronización bidireccional con tu ERP',
                    'Webhooks en tiempo real para eventos de negocio',
                    'Catálogos gigantes gestionados vía API',
                ],
            },
            {
                eyebrow: 'SEGURIDAD Y CUMPLIMIENTO',
                titulo: 'Arquitectura diseñada para compliance.',
                copy: 'Desde firmas criptográficas SHA-256 en cada versión de la cotización, hasta controles de acceso basados en roles (RBAC). Cord cumple con los más altos estándares para que tu departamento de IT apruebe la plataforma en tiempo récord.',
                bullets: [
                    'Firmas inmutables en propuestas aprobadas',
                    'Roles y permisos granulares por equipo de ventas',
                    'SLA empresarial con soporte dedicado 24/7',
                ],
            },
        ],
        resultado: {
            cliente: 'Grupo Nacional Distribuidor',
            metricas: [
                { valor: '+$14M', label: 'en ingresos recuperados por control de precios' },
                { valor: '−45%', label: 'en tiempo de ciclo de ventas corporativas' },
                { valor: '100%', label: 'de adopción en el equipo en 3 semanas' },
            ],
            nota: 'Al unificar sus operaciones en Cord, Grupo Nacional redujo sus tiempos de cotización y logró blindar sus márgenes frente a variaciones de mercado, eliminando aprobaciones por correo electrónico.',
        },
        faqs: [
            {
                q: '¿Cord soporta flujos de aprobación interna para descuentos?',
                a: 'Sí. Puedes establecer umbrales lógicos. Si un representante ofrece un descuento mayor al permitido, la cotización se bloquea y requiere autorización de un gerente antes de poder ser enviada al cliente final.',
            },
            {
                q: '¿Cómo se integra Cord con nuestro ERP actual?',
                a: 'Nuestra API REST y el sistema de Webhooks permiten sincronizar clientes, inventarios y listas de precios bidireccionalmente. También generamos un payload estándar para disparar la facturación en SAP, Oracle o el ERP de tu elección al aprobarse una cotización.',
            },
            {
                q: '¿Podemos migrar nuestro catálogo de miles de SKUs?',
                a: 'Absolutamente. Cord está diseñado para escalar. Puedes importar vía CSV o conectar nuestra API para ingestar catálogos masivos. Las actualizaciones de precios se reflejan en tiempo real en todo el sistema sin afectar cotizaciones históricas.',
            },
            {
                q: '¿Cuáles son los estándares de seguridad de la plataforma?',
                a: 'Todos los datos están encriptados en reposo y en tránsito. Las cotizaciones cerradas generan una firma hash SHA-256 que garantiza su inmutabilidad. Ofrecemos SLAs empresariales para disponibilidad y soporte técnico directo.',
            },
        ],
        interlink: { href: '/producto/api', label: 'API y Webhooks para integraciones' },
        cta: { titulo: 'Escala tu operación comercial con confianza.', sub: 'Agenda una sesión técnica con nuestro equipo de soluciones.' },
    },
    {
        slug: 'startups',
        nav: 'Startups',
        eyebrow: 'PARA STARTUPS',
        titulo: 'Crece rápido, factura al instante.',
        sub: 'La agilidad es tu mayor ventaja. Cord te permite enviar propuestas profesionales en minutos, iterar precios, cerrar tratos con un clic y automatizar la facturación CFDI sin tocar un portal del SAT.',
        metaTitle: 'Cotizaciones y facturación rápida para Startups — Cord by Flouvia',
        metaDescription: 'Cord ayuda a startups y agencias de crecimiento rápido a enviar propuestas, cerrar clientes con un clic y automatizar la facturación. Escala sin burocracia.',
        paraQuien: 'Cord para Startups está diseñado para empresas de tecnología, agencias digitales y negocios de rápido crecimiento que necesitan velocidad extrema para proponer, iterar y cerrar clientes sin la sobrecarga administrativa tradicional.',
        dolor: 'Pierdes horas armando propuestas en PDFs que no convierten y facturando a mano.',
        stats: [
            { valor: '2', countup: 2, suffix: ' min', label: 'para enviar una propuesta pulida' },
            { valor: '1', countup: 1, suffix: ' clic', label: 'para que tu cliente apruebe y pague' },
            { valor: '0', countup: 0, label: 'horas desperdiciadas facturando a mano' },
        ],
        blocks: [
            {
                eyebrow: 'VELOCIDAD DE EJECUCIÓN',
                titulo: 'Del pitch al cierre en el mismo día.',
                copy: 'No dejes que el cliente se enfríe. Con plantillas preconfiguradas y un editor diseñado para la velocidad, puedes enviar propuestas interactivas y hermosas mientras el cliente todavía tiene tu reunión en la cabeza.',
                bullets: [
                    'Editor súper rápido con soporte para markdown',
                    'Métricas en tiempo real: sabe cuándo abren tu propuesta',
                    'Links mágicos de aprobación inmediata',
                ],
            },
            {
                eyebrow: 'PRESENTACIÓN PREMIUM',
                titulo: 'Luce como una empresa pública desde el Día 1.',
                copy: 'Tus prospectos te juzgan por tu presentación. Cord envuelve tu oferta en una experiencia digital impecable (Quiet Luxury) que grita profesionalismo, diferenciándote de startups que mandan PDFs generados en Word.',
                bullets: [
                    'Diseño responsivo de clase mundial por defecto',
                    'Tu logo y colores en cada interacción',
                    'Flujos de aceptación limpios y sin fricción',
                ],
            },
            {
                eyebrow: 'AUTOMATIZACIÓN PURA',
                titulo: 'Menos back-office, más ventas.',
                copy: 'Cuando el cliente aprueba, Cord toma el control. Genera el CFDI 4.0 con los datos exactos del trato y lo envía al cliente. Tú puedes enfocarte en entregar el producto, no en la talacha administrativa.',
                bullets: [
                    'Facturación CFDI 4.0 automática en el plan Starter',
                    'Pago en línea opcional directo en la propuesta',
                    'Timeline automático con evidencia de aprobación',
                ],
            },
        ],
        resultado: {
            cliente: 'Acme AI / Y Combinator W26',
            metricas: [
                { valor: '3x', label: 'más velocidad en ciclo de ventas' },
                { valor: '100%', label: 'de facturación automatizada post-cierre' },
                { valor: '0', countup: 0, label: 'fricción en onboarding B2B' },
            ],
            nota: 'Con un equipo de solo 4 personas, Acme AI utiliza Cord para manejar todas sus suscripciones anuales empresariales, luciendo como una corporación y operando con la agilidad de una startup.',
        },
        faqs: [
            {
                q: '¿Cord sirve para startups que venden suscripciones (SaaS)?',
                a: 'Sí. Puedes cotizar conceptos recurrentes (mensuales o anuales). Cuando el cliente aprueba la propuesta de suscripción, puedes conectarla con tu pasarela de pagos favorita usando nuestra API o cobrar los setup fees de inmediato.',
            },
            {
                q: '¿Cómo sé si mi prospecto está interesado?',
                a: 'El dashboard te notifica al instante en cuanto abren tu propuesta y cuenta cuántas veces la ven. Esto te da el timing perfecto para dar seguimiento y cerrar la venta antes de que se enfríen.',
            },
            {
                q: '¿Puedo integrar Cord con mis herramientas No-Code?',
                a: '¡Por supuesto! Cord cuenta con Webhooks que puedes conectar fácilmente a Zapier, Make o n8n para disparar notificaciones en Slack, actualizar bases de datos en Airtable o crear clientes en HubSpot.',
            },
            {
                q: '¿Necesito un equipo contable para facturar?',
                a: 'No. Cord automatiza la emisión del CFDI 4.0 al momento de la aprobación del cliente. Solo conectas tus sellos digitales (CSD) una vez, y nosotros nos encargamos de timbrar y enviar la factura correctamente formada.',
            },
        ],
        interlink: { href: '/producto/cfdi', label: 'facturación automatizada CFDI' },
        cta: { titulo: 'La herramienta secreta para crecer sin burocracia.', sub: 'Crea tu cuenta gratis hoy. Cierra tu primer trato mañana.' },
    },
];

export const findSolucion = (slug: string) => SOLUCIONES.find((s) => s.slug === slug);
