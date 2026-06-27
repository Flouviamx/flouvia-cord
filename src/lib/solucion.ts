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
    titulo: string;       // admite <br/>
    copy: string;
    bullets: string[];
}

export interface SolFaq {
    q: string;
    a: string;
}

// Interlink solución → feature de producto (grafo de entidades para AI agents).
export interface SolLink {
    href: string;        // /producto/<slug>
    label: string;       // ancla del link
}

export interface Solution {
    slug: string;
    nav: string;              // nombre corto (megamenú, hub, cross-links)
    eyebrow: string;
    titulo: string;          // H1, admite <br/>
    sub: string;
    metaTitle?: string;      // <title>/OG — keyword-rich de industria (cae a `${nav} — Cord`)
    metaDescription?: string;// meta description (cae a `sub`)
    paraQuien: string;       // "Para quién es Cord [industria]" — extractable (audiencia objetivo)
    dolor: string;           // el dolor de la industria, una línea
    stats: SolStat[];
    blocks: SolBlock[];
    resultado?: {            // caso de uso real con métricas (AI-SEO: estadística con fuente)
        cliente: string;
        metricas: { valor: string; label: string }[];
        nota: string;
    };
    faqs: SolFaq[];          // FAQ + FAQPage JSON-LD (4 por página)
    interlink: SolLink;      // link a la feature de producto más relevante
    cta: { titulo: string; sub: string };
}

export const SOLUCIONES: Solution[] = [
    {
        slug: 'distribuidoras',
        nav: 'Distribuidoras y mayoristas',
        eyebrow: 'DISTRIBUIDORAS Y MAYORISTAS',
        titulo: 'Cada cliente,<br/>su propio precio.',
        sub: 'Vendes lo mismo a 200 clientes a 200 precios distintos. Cord guarda el precio negociado y los términos de cada cliente y los aplica solos — para que cualquiera de tu equipo cotice rápido sin regalar margen ni romper acuerdos.',
        metaTitle: 'Software de cotizaciones para distribuidoras y mayoristas en México — Cord by Flouvia',
        metaDescription: 'Cord permite a distribuidoras y mayoristas en México gestionar listas de precios por cliente, términos Net 30/60, límites de crédito y CFDI automático — en una sola plataforma. Sin Excel, sin hojas sueltas, sin acuerdos que se pierden.',
        paraQuien: 'Cord para distribuidoras está diseñado para negocios con 10 a 200 clientes activos, que manejan precios diferenciados por cliente y procesan entre 20 y 500 cotizaciones al mes. Si vendes el mismo catálogo a precios distintos según volumen y relación, y hoy llevas esos acuerdos en Excel o en la cabeza de tus vendedores, Cord es para ti.',
        dolor: 'El precio especial vive en la cabeza de una persona y en hojas de Excel desactualizadas.',
        stats: [
            { valor: '200+', label: 'clientes con su propio precio, sin hojas sueltas' },
            { valor: '−12%', label: 'de descuento controlado, no improvisado' },
            { valor: '4', countup: 4, suffix: ' min', label: 'para armar una cotización completa' },
        ],
        blocks: [
            {
                eyebrow: 'PRECIO POR CLIENTE',
                titulo: 'El precio correcto<br/>sale solo.',
                copy: 'En distribución el precio de lista es solo el punto de partida: cada cliente tiene el suyo según volumen y relación. Cord registra el precio negociado de cada línea y te muestra el descuento aplicado, para que tu equipo cotice las mismas condiciones sin tener que preguntar.',
                bullets: [
                    'Precio negociado por línea, con el % de descuento visible',
                    'El precio de lista queda registrado — siempre sabes cuánto cediste',
                    'Líneas libres para fletes, conceptos o promociones del mes',
                ],
            },
            {
                eyebrow: 'CATÁLOGO CENTRAL',
                titulo: 'Una sola fuente<br/>de la verdad.',
                copy: 'Carga tu catálogo una vez —con SKU, unidad y precio de lista— y agrégalo a cualquier cotización con un clic. Se acabaron las listas de precios en cinco versiones distintas circulando por WhatsApp.',
                bullets: [
                    'Búsqueda instantánea por nombre o SKU',
                    'Importa tu catálogo completo por CSV en minutos',
                    'Activa o pausa productos sin perder su historial',
                ],
            },
            {
                eyebrow: 'TÉRMINOS Y CRÉDITO',
                titulo: 'Cada cliente,<br/>sus condiciones.',
                copy: 'Guarda los términos default de cada cliente (Contado, Net 30, Net 60) y su límite de crédito. Al cotizarle, las condiciones se aplican solas y sabes cuánto espacio de crédito le queda antes de aprobar.',
                bullets: [
                    'Términos de pago default por cliente',
                    'Límite de crédito en pesos, visible antes de cerrar',
                    'Historial completo de cada cuenta en un solo lugar',
                ],
            },
            {
                eyebrow: 'APROBACIONES B2B',
                titulo: 'Negociación sin fricción.',
                copy: 'Tus clientes mayoristas no siempre aceptan la primera oferta. Ahora pueden contraofertar línea por línea. Cada cambio genera una versión inmutable y la versión final se sella con firma criptográfica.',
                bullets: [
                    'Aprobación y ajuste de cantidades por línea',
                    'Versiones inmutables para evitar el "yo no pedí eso"',
                    'Firma SHA-256 para total seguridad jurídica',
                ],
            },
            {
                eyebrow: 'FINANZAS Y COBRANZA',
                titulo: 'Visibilidad total del flujo.',
                copy: 'Conecta tu cuenta bancaria y automatiza la conciliación. Cord cruza los pagos recibidos con las facturas emitidas, manteniendo tu cartera al día sin intervención manual.',
                bullets: [
                    'Conciliación bancaria automatizada',
                    'Reportes de antigüedad de saldos en tiempo real',
                    'Integración nativa con tu ERP actual',
                ],
            },
        ],
        resultado: {
            cliente: 'Distribuidora El Zarco · La Central de Abastos, CDMX',
            metricas: [
                { valor: '−67%', label: 'en el tiempo de procesamiento de órdenes' },
                { valor: '+25%', label: 'en el ticket promedio de venta' },
                { valor: '100%', label: 'de las órdenes de venta automatizadas' },
            ],
            nota: 'Distribuidora El Zarco, mayorista en La Central de Abastos de la Ciudad de México, adoptó Cord para gestionar sus precios diferenciados por cliente y automatizar su flujo de cotización.',
        },
        faqs: [
            {
                q: '¿Cómo gestiona Cord los precios diferenciados por cliente en una distribuidora?',
                a: 'Cord permite asignar un precio negociado a cada línea de cotización, independiente del precio de lista en el catálogo. Cuando un vendedor cotiza a un cliente específico, el sistema aplica automáticamente los precios y descuentos acordados para ese cliente, mostrando el porcentaje de descuento aplicado por línea. El precio de lista queda registrado como referencia para controlar el margen cedido.',
            },
            {
                q: '¿Cord sirve para distribuidoras que manejan cientos de SKUs?',
                a: 'Sí. El catálogo de Cord acepta importación masiva por CSV, búsqueda instantánea por nombre o SKU y unidades personalizadas (piezas, cajas, toneladas, litros, lo que corresponda al producto). Los productos se activan o pausan sin borrar su historial de precios. No hay límite de productos en los planes de pago.',
            },
            {
                q: '¿Cord funciona para distribuidoras en La Central de Abastos o mercados mayoristas en México?',
                a: 'Sí. Cord está diseñado específicamente para distribuidores mayoristas en México. Un caso de uso documentado es Distribuidora El Zarco en La Central de Abastos, CDMX, donde Cord redujo el tiempo de procesamiento de órdenes en un 67%, aumentó el ticket promedio en un 25% y automatizó el 100% de las órdenes de venta.',
            },
            {
                q: '¿Qué pasa si un cliente de la distribuidora pide un precio que no está en el catálogo?',
                a: 'Cord incluye líneas libres en el editor de cotizaciones, que permiten agregar conceptos personalizados fuera del catálogo con su descripción, cantidad, unidad y precio. Se usan para fletes, maniobras, descuentos especiales o cualquier concepto no estándar.',
            },
        ],
        interlink: { href: '/producto/clientes-credito', label: 'clientes y crédito' },
        cta: { titulo: 'Cotiza a cada cliente a su precio.', sub: 'Gratis hasta 5 cotizaciones activas. Sin tarjeta.' },
    },
    {
        slug: 'construccion',
        nav: 'Construcción y materiales',
        eyebrow: 'CONSTRUCCIÓN Y MATERIALES',
        titulo: 'Volumen, obra<br/>y crédito, bajo control.',
        sub: 'Cotizaciones de cientos de miles de pesos, entregas en obra y clientes que piden Net 60: el día a día del materialista. Cord le pone folio, vigencia y límite de crédito a cada trato — y te avisa en el momento en que lo aprueban.',
        metaTitle: 'Cotizaciones de materiales de construcción con CFDI y crédito — Cord by Flouvia',
        metaDescription: 'Cord permite a ferreterías, materialistas y proveedores de construcción cotizar volúmenes grandes sin errores, controlar crédito Net 60 por obra y timbrar el CFDI 4.0 automáticamente al cierre. Hecho para México.',
        paraQuien: 'Cord para construcción está diseñado para ferreterías, materialistas y proveedores de obra en México que arman cotizaciones de alto valor con muchas líneas, manejan crédito Net 30 o Net 60 por obra y necesitan timbrar CFDI 4.0 al cierre. Si vendes cemento, varilla, agregados o acabados por volumen y das crédito a constructoras, Cord es para ti.',
        dolor: 'Cotizaciones enormes armadas a mano, con el riesgo de un error de dedo que se come el margen.',
        stats: [
            { valor: '$196,469', label: 'cotizados y aprobados el mismo día' },
            { valor: '100', countup: 100, suffix: '%', label: 'de los totales calculados sin errores de captura' },
            { valor: 'Net 60', label: 'crédito por cliente, con límite controlado' },
        ],
        blocks: [
            {
                eyebrow: 'COTIZACIONES GRANDES',
                titulo: 'Cientos de líneas,<br/>cero errores de dedo.',
                copy: 'Cemento por tonelada, varilla por tramo, block por millar, arena por m³. Arma cotizaciones de cualquier tamaño con unidades reales y mira el subtotal, el IVA y el total recalcularse al instante, con redondeo correcto y números tabulares.',
                bullets: [
                    'Unidades reales: sacos, m³, tramos, rollos, toneladas',
                    'IVA 16% configurable y totales siempre cuadrados',
                    'Folio consecutivo con tu prefijo (COT-0148, COT-0149…)',
                ],
            },
            {
                eyebrow: 'CRÉDITO EN OBRA',
                titulo: 'Di que sí con confianza<br/>(y que no, a tiempo).',
                copy: 'En materiales el crédito es la herramienta de venta. Asigna un límite por cliente y deja que el sistema lo vigile: antes de mandar una cotización a Net 60 sabes cuánto le queda disponible. El "se nos pasó" deja de existir.',
                bullets: [
                    'Límite de crédito en pesos por cliente',
                    'Términos Net 30 / Net 60 con vencimientos claros',
                    'Exposición visible antes de aprobar cada trato',
                ],
            },
            {
                eyebrow: 'DEL SÍ AL CFDI',
                titulo: 'Aprobada en obra,<br/>facturada al instante.',
                copy: 'El cliente abre el link desde la obra, aprueba desde el celular y tú te enteras al momento. Cuando se cierra, la factura CFDI 4.0 sale con los mismos datos —sin recapturar en otro portal— y queda ligada a su cotización.',
                bullets: [
                    'Link público que se aprueba desde cualquier celular',
                    'Aviso inmediato cuando el cliente lo abre y lo aprueba',
                    'CFDI 4.0 automático al cerrar (plan Starter en adelante)',
                ],
            },
        ],
        faqs: [
            {
                q: '¿Cord sirve para ferreterías y proveedores de materiales de construcción en México?',
                a: 'Sí. Cord está diseñado para manejar las particularidades del sector construcción: cotizaciones de alto valor con muchas líneas, unidades reales como sacos, m³, tramos y toneladas, crédito Net 30 o Net 60 por obra o constructora, y CFDI 4.0 automático al cierre. El editor recalcula subtotal e IVA en tiempo real para evitar errores de captura en cotizaciones grandes.',
            },
            {
                q: '¿Cómo controla Cord el crédito de clientes en el sector construcción?',
                a: 'Cord permite asignar un límite de crédito en pesos a cada constructora u obra. Antes de enviar una cotización a crédito, el vendedor ve cuánto crédito disponible le queda al cliente frente al límite asignado. Los términos Net 30 o Net 60 se configuran por cliente y se aplican automáticamente en cada cotización.',
            },
            {
                q: '¿El cliente de una ferretería puede aprobar la cotización desde la obra?',
                a: 'Sí. Cord genera un link público que el cliente puede abrir desde cualquier celular sin instalar nada ni crear una cuenta. Puede revisar los materiales, cantidades y precios desde la obra y aprobar con un botón. El proveedor recibe una notificación inmediata de la aprobación.',
            },
            {
                q: '¿Cord genera el CFDI automáticamente para empresas de materiales de construcción?',
                a: 'Sí. Desde el plan Starter, Cord timbra el CFDI 4.0 automáticamente cuando se cierra una cotización aprobada. Los datos del comprobante se toman directamente de la cotización: productos, cantidades, precios negociados y RFC del cliente. No es necesario recapturar en ningún portal de facturación externo.',
            },
        ],
        interlink: { href: '/producto/cfdi', label: 'facturación CFDI 4.0' },
        cta: { titulo: 'Cotiza la obra completa<br/>en minutos.', sub: 'Empieza gratis y carga tu catálogo de materiales hoy.' },
    },
    {
        slug: 'manufactura',
        nav: 'Manufactura',
        eyebrow: 'MANUFACTURA',
        titulo: 'Cotiza especificación,<br/>lote y entrega.',
        sub: 'En manufactura cada cotización es un pequeño proyecto: especificaciones, cantidades mínimas, tiempos de entrega. Con líneas libres y notas por cotización, Cord documenta el acuerdo completo — y el timeline guarda quién aprobó qué y cuándo.',
        metaTitle: 'Cotizaciones de manufactura con especificación técnica y CFDI en México — Cord by Flouvia',
        metaDescription: 'Cord permite a empresas de manufactura en México cotizar lotes con especificación técnica, MOQ, tiempos de entrega y notas de condición. El cliente aprueba por link y el CFDI 4.0 se timbra automáticamente. Historial completo por cliente.',
        paraQuien: 'Cord para manufactura está diseñado para empresas que cotizan proyectos a la medida a otras empresas en México —maquinado CNC, corte láser, ensamble, inyección de plástico, metalmecánica— con especificación técnica, cantidad mínima de orden y tiempos de entrega. Si cada cotización tuya es un pequeño proyecto con condiciones propias, Cord es para ti.',
        dolor: 'El acuerdo técnico se pierde entre correos y nadie recuerda a qué precio se cerró el lote anterior.',
        stats: [
            { valor: '100', countup: 100, suffix: '%', label: 'del acuerdo documentado en un solo lugar' },
            { valor: '0', countup: 0, label: 'capturas dobles entre cotización y factura' },
            { valor: '3', countup: 3, label: 'términos de pago según el cliente' },
        ],
        blocks: [
            {
                eyebrow: 'ESPECIFICACIÓN',
                titulo: 'El detalle técnico,<br/>parte de la cotización.',
                copy: 'No todo cabe en un catálogo. Las líneas libres te dejan cotizar conceptos a la medida —material, acabado, tolerancia, cantidad mínima— con su precio y su descripción completa, para que el cliente apruebe exactamente lo que acordaron.',
                bullets: [
                    'Líneas libres para conceptos fuera de catálogo',
                    'Descripciones largas con la especificación del lote',
                    'Notas por cotización: MOQ, tiempo de entrega, condiciones',
                ],
            },
            {
                eyebrow: 'HISTORIAL',
                titulo: 'A qué precio cerraste<br/>el lote pasado.',
                copy: 'Cada cliente acumula su historial: qué pidió, a qué precio, cuándo y quién lo aprobó. La próxima vez que te pida una corrida, tienes la referencia exacta a la mano — sin escarbar en el correo de hace seis meses.',
                bullets: [
                    'Historial de cotizaciones por cliente',
                    'Precio negociado registrado línea por línea',
                    'Timeline con la cronología completa de cada trato',
                ],
            },
            {
                eyebrow: 'CIERRE FORMAL',
                titulo: 'Aprobación con evidencia,<br/>factura sin recapturar.',
                copy: 'El cliente aprueba en el link y queda registrado quién y cuándo — evidencia del acuerdo. Al cerrar, el CFDI 4.0 se arma con los datos de la cotización: las cantidades, los precios y el RFC ya están, timbrar es un clic.',
                bullets: [
                    'Aprobación registrada en el timeline como evidencia',
                    'CFDI 4.0 con los datos exactos de la cotización',
                    'UUID, XML y PDF disponibles al instante (plan Starter en adelante)',
                ],
            },
        ],
        faqs: [
            {
                q: '¿Cord permite cotizar lotes con especificaciones técnicas en manufactura?',
                a: 'Sí. Cord incluye líneas libres en el editor de cotizaciones donde se puede ingresar la especificación técnica completa de cada concepto: material, acabado, tolerancia, cantidad mínima de orden (MOQ) y cualquier condición relevante. El campo de notas por cotización permite agregar condiciones generales del lote como tiempos de entrega, porcentaje de anticipo y referencias de plano.',
            },
            {
                q: '¿Cord guarda el historial de precios de lotes anteriores en manufactura?',
                a: 'Sí. Cada cliente en Cord acumula el historial completo de cotizaciones: qué se cotizó, a qué precio, con qué especificación y quién aprobó. Cuando el mismo cliente vuelve a pedir una corrida, el vendedor puede revisar el precio y las condiciones del lote anterior directamente en la ficha del cliente, sin buscar en correos o archivos.',
            },
            {
                q: '¿Cord sirve para empresas de maquinado, corte láser o ensamble en México?',
                a: 'Sí. Cord está diseñado para cualquier empresa de manufactura que cotiza proyectos a otras empresas en México: maquinado CNC, corte láser, ensamble, inyección de plástico, metalmecánica y similares. Las líneas libres permiten describir cada proceso con su especificación y precio unitario, y el sistema genera el CFDI 4.0 automáticamente al cierre.',
            },
            {
                q: '¿Cómo queda registrada la aprobación del cliente en una cotización de manufactura?',
                a: 'Cuando el cliente aprueba la cotización a través del link público de Cord, el sistema registra en el timeline quién aprobó, desde qué dispositivo y a qué hora. Este registro funciona como evidencia del acuerdo comercial. El estado de la cotización cambia automáticamente a "aprobada" y queda disponible para generar el CFDI.',
            },
        ],
        interlink: { href: '/producto/seguimiento', label: 'seguimiento en vivo' },
        cta: { titulo: 'Documenta el acuerdo,<br/>no lo persigas.', sub: 'Empieza gratis — tu primera cotización a la medida hoy.' },
    },
    {
        slug: 'servicios',
        nav: 'Servicios profesionales',
        eyebrow: 'SERVICIOS PROFESIONALES',
        titulo: 'Propuestas tan serias<br/>como tu trabajo.',
        sub: 'Una propuesta en PDF genérico compite mal contra una página elegante con tu marca, montos claros y un botón de aprobar. Manda un link que cierra por ti — y entérate en el momento exacto en que tu prospecto lo abre.',
        metaTitle: 'Propuestas B2B con aprobación por link para servicios profesionales en México — Cord by Flouvia',
        metaDescription: 'Cord permite a despachos, consultorías y agencias en México enviar propuestas con su marca, saber el momento exacto en que el prospecto las abre, recibir la aprobación con un botón y cobrar el anticipo en línea. CFDI 4.0 automático.',
        paraQuien: 'Cord para servicios profesionales está diseñado para despachos, consultorías, agencias y firmas que envían propuestas a clientes B2B en México y necesitan saber si las leyeron, cerrarlas con un botón y cobrar el anticipo. Si tu venta depende de una propuesta bien presentada y del seguimiento en el momento justo, Cord es para ti.',
        dolor: 'La propuesta perfecta muere en la bandeja de entrada y nunca sabes si la abrieron.',
        stats: [
            { valor: '1', countup: 1, suffix: ' clic', label: 'entre tu propuesta y el "sí"' },
            { valor: '3', countup: 3, suffix: ' min', label: 'tarda en avisarte que la abrieron' },
            { valor: '2', countup: 2, suffix: '×', label: 'más cierres cuando das seguimiento a tiempo' },
        ],
        blocks: [
            {
                eyebrow: 'TU MARCA',
                titulo: 'La propuesta la firma<br/>tu despacho.',
                copy: 'Tu logo, tu nombre y tu color presiden la propuesta. En los planes de pago desaparece el "Powered by Cord" y la experiencia es 100% tuya: tu prospecto ve una firma seria, con procesos serios, antes de leer el primer número.',
                bullets: [
                    'Logo y color de marca configurables',
                    'Página y PDF con tipografía cuidada, montos protagonistas',
                    'Vigencia y términos claros en cada propuesta',
                ],
            },
            {
                eyebrow: 'LA SEÑAL QUE IMPORTA',
                titulo: 'Sabes el momento<br/>en que la leen.',
                copy: 'El interés se enfría rápido. Cord te avisa en cuanto tu prospecto abre la propuesta y cuántas veces la ha visto — para que llames cuando te tiene en la cabeza, no dos semanas después.',
                bullets: [
                    'Aviso al instante cuando abren tu propuesta',
                    'Conteo de aperturas (¿la vio 3 veces? está decidiendo)',
                    'El estado cambia solo: enviada → vista → aprobada',
                ],
            },
            {
                eyebrow: 'CERO FRICCIÓN',
                titulo: 'Aprobar es un botón,<br/>no una llamada.',
                copy: 'Tu prospecto abre el link donde sea, revisa el alcance y aprueba ahí mismo —sin crear cuenta, sin descargar nada. Si manejas pago en línea, puede pagar el anticipo en el momento; si no, queda registrado bajo sus términos.',
                bullets: [
                    'Aprobación en un clic, sin registro ni fricción',
                    'Funciona en WhatsApp, correo o donde lo compartas',
                    'Pago en línea opcional con Stripe (plan Profesional)',
                ],
            },
        ],
        faqs: [
            {
                q: '¿Cord sirve para enviar propuestas comerciales a clientes B2B en México?',
                a: 'Sí. Cord genera un link de propuesta con la marca del negocio (logo, colores, datos fiscales) que el prospecto puede abrir desde cualquier dispositivo. La propuesta muestra los servicios, precios y términos de pago, e incluye botones para aprobar, rechazar o hacer preguntas. No se requiere que el prospecto cree una cuenta ni descargue nada.',
            },
            {
                q: '¿Cómo sé si mi prospecto ya vio la propuesta que le envié?',
                a: 'Cord envía una notificación en tiempo real en cuanto el prospecto abre el link de la propuesta. El dashboard muestra la hora exacta de cada apertura y el número de veces que fue abierta. Si el prospecto la vio varias veces, suele indicar que está evaluando la decisión — es el momento ideal para hacer seguimiento.',
            },
            {
                q: '¿Cord permite cobrar anticipo al aprobar una propuesta de servicios?',
                a: 'Sí. Con el plan Profesional en adelante, Cord permite activar pago en línea con Stripe. Cuando el cliente aprueba la propuesta puede pagar el anticipo directamente desde la misma página, sin necesidad de transferencia separada ni seguimiento adicional.',
            },
            {
                q: '¿Cord genera CFDI para empresas de servicios profesionales en México?',
                a: 'Sí. Desde el plan Starter, Cord timbra el CFDI 4.0 automáticamente cuando el cliente aprueba la propuesta. Los datos del comprobante (descripción del servicio, precio, RFC del cliente) se toman de la propuesta aprobada. Disponible para cualquier empresa con RFC en México que emita CFDI por servicios.',
            },
        ],
        interlink: { href: '/producto/link-publico', label: 'el link público de aprobación' },
        cta: { titulo: 'La próxima propuesta que mandes<br/>va a tener un botón de aprobar.', sub: 'Mira una propuesta de ejemplo o crea la tuya gratis.' },
    },
];

export const findSolucion = (slug: string) => SOLUCIONES.find((s) => s.slug === slug);
