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

export interface SolIntegration {
    name: string;
}

export interface SolSecurityFeature {
    title: string;
    desc: string;
}

export interface SolSecurity {
    eyebrow: string;
    titulo: string;
    copy: string;
    features: SolSecurityFeature[];
}

export interface SolWorkflowStep {
    step: string;
    titulo: string;
    desc: string;
}

export interface SolUseCase {
    title: string;
    desc: string;
    link: string;
    logos: { name: string; domain: string }[];
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
    
    // Novedades para el rediseño Stripe Enterprise:
    integrations?: SolIntegration[];
    security?: SolSecurity;
    workflow?: SolWorkflowStep[];
    pillars?: { titulo: string; desc: string; link: string; href?: string }[];
    useCases?: SolUseCase[];

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
        titulo: 'Todo tu equipo cotiza. Nadie cede margen sin autorización.',
        sub: 'Cord pone topes de descuento, monto y margen a cada cotización, detiene la que los rebasa hasta que alguien con permiso la aprueba y registra quién hizo qué. Tus vendedores siguen cerrando en un solo link: aprobación del cliente, cobro y factura.',
        metaTitle: 'Cotizaciones con aprobaciones, permisos y SSO para equipos comerciales — Cord',
        metaDescription: 'Topes de descuento, monto y margen con aprobación interna, permisos por sección, SSO con SAML 2.0 y bitácora de auditoría. Tu equipo cotiza, cobra y factura desde un solo link en 12 países, con CFDI 4.0 en México.',
        paraQuien: 'Para organizaciones donde cotizan varias personas y responden varias áreas: ventas arma la propuesta, dirección comercial autoriza lo que sale de la regla, finanzas factura y cobra, y TI decide cómo se entra. Cada quien ve lo que su permiso le deja ver.',
        dolor: 'Cuando cada vendedor negocia por su cuenta, el margen se pierde en descuentos que nadie autorizó y que nadie puede rastrear después.',

        integrations: [
            { name: 'HubSpot' },
            { name: 'Xero' },
            { name: 'QuickBooks Online' },
            { name: 'Slack' },
            { name: 'Microsoft Teams' }
        ],

        security: {
            eyebrow: 'SEGURIDAD',
            titulo: 'Lo que tu área de TI va a preguntar, respondido.',
            copy: 'Estas son las medidas que Cord aplica hoy, descritas tal como funcionan, sin sellos ni certificaciones que todavía no tenemos.',
            features: [
                { title: 'Datos separados por organización', desc: 'Cada consulta declara a qué organización pertenece. Los clientes, el catálogo, las facturas y el equipo de una organización nunca aparecen en otra.' },
                { title: 'Credenciales cifradas', desc: 'Los tokens de tus integraciones se guardan cifrados con AES-256-GCM, y las contraseñas, con Argon2id.' },
                { title: 'Evidencia de cada aprobación', desc: 'Cuando tu cliente aprueba, Cord guarda su nombre, la fecha, la IP y una huella SHA-256 de las líneas que aceptó.' },
                { title: 'Bitácora de auditoría', desc: 'Invitaciones, cambios de permisos, conexiones de SSO e integraciones y movimientos de facturas quedan registrados con fecha e IP. Desde el plan Profesional.' }
            ]
        },

        workflow: [
            { step: '01', titulo: 'Cotización con reglas', desc: 'El vendedor arma la propuesta con tu catálogo y el descuento de nivel de cada cliente.' },
            { step: '02', titulo: 'Aprobación interna', desc: 'Si rebasa el descuento, el monto o el margen que fijaste, queda pendiente hasta que alguien con permiso la libera.' },
            { step: '03', titulo: 'Aprobación del cliente', desc: 'Tu cliente aprueba desde el link y Cord guarda la evidencia con una huella SHA-256.' },
            { step: '04', titulo: 'Datos hacia tus sistemas', desc: 'HubSpot, tu contabilidad y tus webhooks reciben el cambio sin que nadie lo capture otra vez.' }
        ],

        pillars: [
            {
                titulo: 'Aprobación por excepción',
                desc: 'Fijas el descuento máximo, el monto máximo y el margen mínimo. Lo que los rebasa no llega al cliente hasta que alguien con el permiso de Aprobaciones lo libera.',
                link: 'Ver aprobaciones',
                href: '/producto/aprobaciones'
            },
            {
                titulo: 'Conectado a tu CRM y a tu contabilidad',
                desc: 'HubSpot, Xero, QuickBooks Online, Slack y Microsoft Teams se conectan desde Ajustes. Para tus propios sistemas, API REST y webhooks.',
                link: 'Ver integraciones',
                href: '/integraciones'
            },
            {
                titulo: 'Acceso según el puesto',
                desc: 'Administrador, Vendedor o Solo lectura como punto de partida, y diez permisos que ajustas persona por persona.',
                link: 'Ver equipo y roles',
                href: '/producto/equipo'
            }
        ],

        stats: [
            { valor: '3', label: 'topes por cotización: descuento, monto y margen' },
            { valor: '10', label: 'permisos por sección para cada persona' },
            { valor: 'SAML 2.0', label: 'SSO con Okta, Microsoft Entra o Google Workspace' },
        ],
        blocks: [
            {
                eyebrow: 'MARGEN BAJO CONTROL',
                titulo: 'Una excepción de precio necesita un nombre y una hora.',
                copy: 'El vendedor arma la cotización con tu catálogo, y los niveles de cliente —Estándar, Plata, Oro y Distribuidor— aplican su descuento solos. Si la propuesta rebasa el descuento máximo, el monto tope o el margen mínimo que fijaste, no sale: queda pendiente con el motivo exacto hasta que alguien con el permiso de Aprobaciones la libera o la regresa.',
                bullets: [
                    'Tres topes: descuento, monto y margen',
                    'Margen cedido y flujo a 90 días en Finanzas',
                    'La factura sale de la versión aprobada',
                ],
            },
            {
                eyebrow: 'SIN RECAPTURA',
                titulo: 'Lo que se cierra en Cord llega solo al resto de tu operación.',
                copy: 'HubSpot recibe cada cotización como Deal, con la etapa según su estado; Xero o QuickBooks Online reciben la factura definitiva, y Google Sheets o Excel llevan la fila de cada venta. Para tus propios sistemas, la API REST y los webhooks firmados con HMAC avisan de cada cotización, pago y factura, y reintentan durante casi cuatro días si tu servidor no responde.',
                bullets: [
                    'Pagos y depósitos también llegan como eventos',
                    'Facturas definitivas hacia Xero o QuickBooks Online',
                    'Catálogo y clientes por API o importación CSV',
                ],
            },
            {
                eyebrow: 'GOBIERNO DE ACCESO',
                titulo: 'TI decide cómo se entra. Nadie depende de una contraseña.',
                copy: 'Con SSO por SAML 2.0 solo entran correos de dominios que verificaste por DNS, y el rol de cada persona puede venir del grupo que manda tu proveedor de identidad. Puedes exigir verificación en dos pasos a todo el equipo, cerrar sesiones inactivas y limitar las invitaciones a tus dominios. Revocar un acceso saca a esa persona en su siguiente clic.',
                bullets: [
                    'Dominios verificados con un registro DNS',
                    'Rol asignado según el grupo del proveedor',
                    'SSO obligatorio, con el dueño como respaldo',
                ],
            },
        ],
        faqs: [
            {
                q: '¿Qué plan necesito para aprobaciones, SSO y auditoría?',
                a: 'Las aprobaciones internas y el SSO están en el plan Scale, que incluye 15 usuarios. El trabajo en equipo, los permisos por sección y la bitácora de auditoría empiezan en Profesional, con 5 usuarios. Cada usuario adicional se cobra aparte; los precios están en la página de planes.',
            },
            {
                q: '¿Puedo poner un tope distinto a cada vendedor?',
                a: 'Hoy los topes son de la organización: el descuento máximo, el monto máximo y el margen mínimo aplican a todo el equipo. Lo que sí cambia por persona es quién puede aprobar, porque aprobar es un permiso aparte. Si dos unidades de negocio necesitan reglas distintas, cada una puede ser su propia organización.',
            },
            {
                q: '¿Cómo llega a nuestros sistemas lo que se cierra en Cord?',
                a: 'Con integraciones listas para HubSpot, Xero, QuickBooks Online, Google Sheets, Excel, Slack y Microsoft Teams, o con la API REST y los webhooks. Los webhooks van firmados con HMAC y, si tu servidor no responde, Cord reintenta hasta 11 veces durante unos cuatro días. Zapier, Make y n8n cubren el resto sin programar.',
            },
            {
                q: '¿Cómo manejamos varias razones sociales?',
                a: 'Cada razón social es su propia organización en Cord, con su país, su divisa, sus impuestos, su numeración y su equipo, y en México timbra con su propio RFC. Una persona puede estar en varias con un rol distinto en cada una. Cada organización lleva su propio plan, y Cord no suma varias en un mismo informe.',
            },
            {
                q: '¿Podemos traer nuestro catálogo y nuestros clientes?',
                a: 'Sí. Importas productos y clientes desde un archivo CSV, hasta 2,000 filas por carga, o los das de alta por API. Si un producto ya existe con el mismo SKU, se actualiza en lugar de duplicarse.',
            },
            {
                q: '¿Qué garantías de seguridad y disponibilidad publican?',
                a: 'Cord separa los datos por organización, guarda cifradas las credenciales de tus integraciones, permite exigir verificación en dos pasos y SSO, y registra en una bitácora los cambios sensibles con fecha e IP. Todavía no publicamos certificaciones de terceros, métricas históricas de disponibilidad ni un SLA estándar.',
            },
        ],
        interlink: { href: '/producto/aprobaciones', label: 'aprobaciones y control de márgenes' },
        cta: { titulo: 'Pon reglas a tus precios antes de sumar más vendedores.', sub: 'Agenda una demostración con tu equipo comercial y tu área de TI.' },
    },
    {
        slug: 'startups',
        nav: 'Startups',
        eyebrow: 'PARA STARTUPS',
        titulo: 'Manda la propuesta hoy. Cobra en el mismo link.',
        sub: 'Cord le da a tu startup el flujo de ventas que no tienes tiempo de construir: propuesta con tu marca, aprobación del cliente, pago con tarjeta y factura. Empiezas gratis, sin tarjeta, y conectas tu producto por API cuando lo necesites.',
        metaTitle: 'Propuestas, cobro con tarjeta y facturas para startups — Cord',
        metaDescription: 'Manda propuestas con tu marca, cobra con tarjeta dentro del link y factura sin recapturar. Plan Gratis sin vencimiento, API REST, webhooks y MCP para tu producto, en 12 países. CFDI 4.0 para startups en México.',
        paraQuien: 'Para fundadores y equipos chicos que venden servicios, software o producto y no quieren armar su propio sistema de cotización y cobro. Empiezas en el plan Gratis y subes de plan cuando llega tu primer vendedor, sin migrar nada.',
        dolor: 'Armas la propuesta en un documento, cobras por transferencia y facturas a mano: tres herramientas para una sola venta.',

        integrations: [
            { name: 'Zapier' },
            { name: 'Make' },
            { name: 'n8n' },
            { name: 'Slack' },
            { name: 'HubSpot' }
        ],

        useCases: [
            {
                title: 'Agencias y consultoras',
                desc: 'Manda la propuesta de servicios, cobra un anticipo al aprobar y convierte el retainer en una iguala mensual que se cobra con la tarjeta que tu cliente autorizó una vez.',
                link: '/casos-de-uso/agencias',
                logos: [
                    { name: 'HubSpot', domain: 'hubspot.com' },
                    { name: 'Gmail', domain: 'mail.google.com' },
                    { name: 'WhatsApp', domain: 'whatsapp.com' }
                ]
            },
            {
                title: 'SaaS',
                desc: 'Cotiza el plan anual o el contrato a la medida en la divisa de tu cliente, cóbralo con tarjeta en el link y crea cotizaciones desde tu propio producto con la API.',
                link: '/casos-de-uso/saas',
                logos: [
                    { name: 'Zapier', domain: 'zapier.com' },
                    { name: 'Make', domain: 'make.com' },
                    { name: 'n8n', domain: 'n8n.io' }
                ]
            },
            {
                title: 'Comercializadoras',
                desc: 'Precios por nivel de cliente, catálogo importado por CSV o desde Shopify, y crédito a 30 o 60 días con aviso cuando un cliente rebasa su límite.',
                link: '/casos-de-uso/comercializadoras',
                logos: [
                    { name: 'Shopify', domain: 'shopify.com' },
                    { name: 'Google Sheets', domain: 'sheets.google.com' },
                    { name: 'Excel', domain: 'excel.cloud.microsoft' }
                ]
            },
            {
                title: 'Software factory',
                desc: 'Divide el proyecto en anticipo y saldo o en cuotas, deja que tu cliente comente línea por línea y recibe el aviso en Slack o Teams en cuanto aprueba.',
                link: '/casos-de-uso/software-factory',
                logos: [
                    { name: 'Slack', domain: 'slack.com' },
                    { name: 'Microsoft Teams', domain: 'teams.microsoft.com' },
                    { name: 'Xero', domain: 'xero.com' }
                ]
            }
        ],

        security: {
            eyebrow: 'CONFIANZA',
            titulo: 'Tus datos y los de tus clientes, en orden desde el primer día.',
            copy: 'Lo básico de seguridad viene incluido en el plan Gratis; no tienes que configurarlo tú.',
            features: [
                { title: 'Verificación en dos pasos', desc: 'Con app de autenticación, y puedes exigirla a todo tu equipo en cualquier plan.' },
                { title: 'Credenciales cifradas', desc: 'Los tokens de tus integraciones se guardan cifrados con AES-256-GCM.' },
                { title: 'Entorno de prueba', desc: 'Las llaves sk_test_ operan sobre un entorno separado, para que tus pruebas nunca toquen datos reales.' },
                { title: 'Timbrado con tu certificado', desc: 'En México, el CFDI 4.0 se emite con tu propio certificado de sello digital y tu RFC.' }
            ]
        },

        workflow: [
            { step: '01', titulo: 'Propuesta', desc: 'Duplicas la última cotización que funcionó o dejas que la IA arme las líneas desde el pedido del cliente.' },
            { step: '02', titulo: 'Aprobación', desc: 'Tu cliente abre el link, sin crear cuenta, y aprueba con su nombre.' },
            { step: '03', titulo: 'Cobro', desc: 'Paga con tarjeta en el mismo link, completo, con anticipo o en cuotas.' },
            { step: '04', titulo: 'Factura', desc: 'Un botón la emite con los mismos datos; en México, CFDI 4.0 desde Starter.' }
        ],

        pillars: [
            {
                titulo: 'Cobra en el mismo link',
                desc: 'Tu cliente aprueba y paga con tarjeta sin salir de tu propuesta. No hay cuota extra: pagas una comisión por cobro, también en el plan Gratis.',
                link: 'Ver Cord Payments',
                href: '/producto/pagos'
            },
            {
                titulo: 'Sabes cuándo la abren',
                desc: 'Cord te avisa en cuanto tu cliente abre la propuesta y registra cada vez que vuelve a entrar, para que llames mientras todavía te tiene en la cabeza.',
                link: 'Ver seguimiento',
                href: '/producto/seguimiento'
            },
            {
                titulo: 'Facturas desde el primer día',
                desc: 'Diez facturas comerciales al mes en Gratis y sin tope desde Starter. En México, Starter incluye 30 CFDI 4.0 al mes.',
                link: 'Ver facturación',
                href: '/producto/facturacion'
            }
        ],

        stats: [
            { valor: '0', label: 'de cuota mensual en el plan Gratis, que no vence' },
            { valor: '8', label: 'países con cobro con tarjeta dentro del link' },
            { valor: '14', label: 'divisas para cotizar y facturar' },
        ],
        blocks: [
            {
                eyebrow: 'VELOCIDAD',
                titulo: 'De la llamada a la propuesta, la misma tarde.',
                copy: 'Cargas tu catálogo una vez. Después duplicas la última cotización que funcionó o pegas lo que te pidió el cliente y la IA propone las líneas con los precios de tu catálogo. Los impuestos, el total y la vigencia se calculan solos, y la lista te dice en qué va cada propuesta.',
                bullets: [
                    '3 armados con IA al mes en el plan Gratis',
                    'Duplica una cotización y ajusta lo que cambia',
                    'Enviada, vista, aprobada o pagada, de un vistazo',
                ],
            },
            {
                eyebrow: 'PRIMERA IMPRESIÓN',
                titulo: 'Una propuesta que no delata que son tres personas.',
                copy: 'Tu logo y tus colores en un link que tu cliente abre desde el celular, sin crear cuenta ni descargar nada. Aprueba con su nombre y Cord guarda la fecha, la IP y una huella SHA-256 de lo que aceptó. Desde Starter desaparece el "Powered by Cord".',
                bullets: [
                    'Aprobación con nombre, fecha e IP',
                    'Tu marca sola, sin "Powered by", desde Starter',
                    'Comentarios del cliente línea por línea',
                ],
            },
            {
                eyebrow: 'MENOS ADMINISTRACIÓN',
                titulo: 'La factura sale de la venta, no de otra captura.',
                copy: 'Con la cotización aprobada o pagada, un botón emite la factura con el mismo cliente y las mismas partidas, y se la manda con el PDF y su link de pago. En México, Cord timbra CFDI 4.0 con tu propio certificado; en el plan Gratis emites una proforma. Si la factura queda abierta, los recordatorios de cobro salen solos.',
                bullets: [
                    'CFDI 4.0 con tu propio certificado',
                    'PDF y link de pago en el mismo correo',
                    'Recordatorios antes y después del vencimiento',
                ],
            },
        ],
        faqs: [
            {
                q: '¿Cuánto cuesta empezar?',
                a: 'Nada. El plan Gratis no vence y no pide tarjeta: incluye 5 envíos al mes, hasta 5 cotizaciones activas, 10 facturas comerciales y cobro con tarjeta. Cuando necesites más envíos o quitar la marca de Cord, subes a Starter; los precios están en la página de planes.',
            },
            {
                q: '¿Puedo cobrar con tarjeta desde el plan Gratis?',
                a: 'Sí. Cord Payments está en todos los planes, incluido Gratis, en México, Estados Unidos, Canadá, Brasil, España, Reino Unido, Alemania y Francia; pagas una comisión por cobro, no una cuota. En Colombia, Argentina, Chile y Perú cobras con tu propia cuenta de Mercado Pago.',
            },
            {
                q: '¿Sirve para vender suscripciones o contratos anuales?',
                a: 'Sí. Cotizas el plan anual en la divisa de tu cliente y lo cobras en el link. Si prefieres cobrar cada mes, tu cliente autoriza su tarjeta una vez en una iguala y Cord Payments la cobra mensualmente. Desde Profesional también puedes repetir una factura cada mes.',
            },
            {
                q: '¿Puedo integrar Cord a mi producto?',
                a: 'Sí, desde el plan Gratis, con 100 llamadas a la API al mes. La API REST crea clientes y cotizaciones, los webhooks avisan a tu backend de cada evento y Cord Elements pone el cotizador en tu web con Web Component, React o Vue. Las llaves de prueba operan sobre un entorno separado, y el servidor MCP deja que una IA como Claude consulte y arme cotizaciones.',
            },
            {
                q: '¿Qué pasa cuando contrate a mi primer vendedor?',
                a: 'Subes a Profesional e invitas hasta cinco personas con permisos por sección. Tus clientes, tu catálogo y tu historial siguen donde están: no migras nada.',
            },
        ],
        interlink: { href: '/producto/pagos', label: 'cobro con tarjeta dentro del link' },
        cta: { titulo: 'Tu próxima propuesta ya puede cobrarse sola.', sub: 'Crea tu cuenta gratis, sin tarjeta, y manda la primera hoy.' },
    },
];

export const findSolucion = (slug: string) => SOLUCIONES.find((s) => s.slug === slug);
