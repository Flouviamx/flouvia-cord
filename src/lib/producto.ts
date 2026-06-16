// src/lib/producto.ts
// Contenido de las páginas de producto (/producto/[slug]).
// El copy vive aquí; el layout y los mockups viven en src/pages/producto/[slug].astro.

export interface FeatureStat {
    valor: string;       // si empieza con número se anima con count-up via data-countup
    countup?: number;    // valor numérico para animar (opcional)
    decimals?: number;
    prefix?: string;     // ej. '$'
    suffix?: string;     // ej. '%', ' min'
    label: string;
}

export interface FeatureBlock {
    eyebrow: string;
    titulo: string;      // admite <br/>
    copy: string;
    bullets: string[];
}

export interface Feature {
    slug: string;
    nav: string;             // nombre corto (cross-links, megamenú)
    eyebrow: string;
    titulo: string;          // H1, admite <br/>
    sub: string;
    plan: string;            // en qué plan vive
    stats: FeatureStat[];
    blocks: FeatureBlock[];
    cta: { titulo: string; sub: string };
}

export const FEATURES: Feature[] = [
    {
        slug: 'editor',
        nav: 'Editor de cotizaciones',
        eyebrow: 'EDITOR DE COTIZACIONES',
        titulo: 'La cotización perfecta,<br/>en minutos.',
        sub: 'Arrastra productos de tu catálogo, negocia el precio línea por línea y mira el total recalcularse con IVA en vivo. Lo que antes era una hora en Excel, ahora son minutos.',
        plan: 'Disponible en todos los planes',
        stats: [
            { valor: '4', countup: 4, suffix: ' min', label: 'tiempo promedio para armar una cotización' },
            { valor: '100', countup: 100, suffix: '%', label: 'de los totales calculados sin errores de dedo' },
            { valor: '3', countup: 3, label: 'términos de pago: Contado, Net 30 y Net 60' },
        ],
        blocks: [
            {
                eyebrow: 'PRECIOS NEGOCIADOS',
                titulo: 'Cada cliente tiene su precio.<br/>Respétalo sin pensarlo.',
                copy: 'En B2B el precio de lista es solo el punto de partida. En Cord ajustas el precio de cada línea y el sistema te muestra el descuento aplicado al instante — tú decides hasta dónde llegar, el sistema se encarga de que los números cuadren.',
                bullets: [
                    'Precio negociado por línea, con el % de descuento visible',
                    'El precio de lista queda registrado — siempre sabes cuánto cediste',
                    'Líneas libres para conceptos fuera de catálogo',
                ],
            },
            {
                eyebrow: 'CATÁLOGO',
                titulo: 'Tu catálogo trabaja por ti.',
                copy: 'Carga tus productos una vez (con SKU, unidad y precio de lista) y agrégalos a cualquier cotización con un clic. Sin recapturar, sin copiar y pegar de otro archivo, sin precios desactualizados.',
                bullets: [
                    'Búsqueda instantánea por nombre o SKU',
                    'Unidades reales: piezas, sacos, m³, rollos, lo que vendas',
                    'Activa o pausa productos sin borrarlos',
                ],
            },
            {
                eyebrow: 'TOTALES EN VIVO',
                titulo: 'El IVA y los totales,<br/>siempre correctos.',
                copy: 'Cada cambio recalcula subtotal, IVA y total al instante, con redondeo correcto y números tabulares estilo fintech. Define la vigencia y los términos de crédito y la cotización queda lista para enviarse.',
                bullets: [
                    'IVA 16% configurable por negocio',
                    'Vigencia con fecha de expiración automática',
                    'Folio consecutivo con tu prefijo (COT-0148, COT-0149…)',
                ],
            },
        ],
        cta: { titulo: 'Arma tu primera cotización hoy.', sub: 'Gratis hasta 5 cotizaciones activas. Sin tarjeta.' },
    },
    {
        slug: 'link-publico',
        nav: 'Link público',
        eyebrow: 'LINK PÚBLICO',
        titulo: 'Tu cliente aprueba<br/>en un clic.',
        sub: 'Cada cotización genera un link elegante con tu marca. Tu cliente lo abre desde el celular, revisa los precios y aprueba — sin crear cuenta, sin descargar nada, sin fricción.',
        plan: 'Disponible en todos los planes',
        stats: [
            { valor: '0', countup: 0, label: 'cuentas que tu cliente necesita crear' },
            { valor: '1', countup: 1, suffix: ' clic', label: 'para aprobar la cotización' },
            { valor: '24/7', label: 'disponible desde cualquier dispositivo' },
        ],
        blocks: [
            {
                eyebrow: 'CERO FRICCIÓN',
                titulo: 'Sin registro, sin PDF perdido<br/>en el correo.',
                copy: 'El PDF adjunto muere en la bandeja de entrada. El link de Cord vive: tu cliente lo abre donde sea, ve la versión más reciente y actúa ahí mismo. Aprobar o rechazar es un botón, no una llamada.',
                bullets: [
                    'Funciona en WhatsApp, correo o donde lo compartas',
                    'Siempre muestra la versión vigente de la cotización',
                    'Botones de aprobar / rechazar directo en la página',
                ],
            },
            {
                eyebrow: 'TU MARCA',
                titulo: 'La página la firma tu negocio,<br/>no el nuestro.',
                copy: 'Tu logo, tu nombre y tus colores presiden la cotización. En los planes de pago desaparece el "Powered by Cord" y la experiencia es 100% tuya — tu cliente ve una empresa seria con sistemas serios.',
                bullets: [
                    'Logo y color de marca configurables en Ajustes',
                    'Diseño cuidado: tipografía fintech, montos protagonistas',
                    'También descargable como PDF con la misma marca',
                ],
            },
            {
                eyebrow: 'DEL SÍ AL PEDIDO',
                titulo: 'Aprobada la cotización,<br/>empieza el trato.',
                copy: 'Cuando tu cliente aprueba, tú recibes el aviso al instante y la cotización cambia de estado sola. Si tiene pago en línea habilitado, puede pagar ahí mismo; si maneja crédito, queda registrado bajo sus términos Net 30/60.',
                bullets: [
                    'Notificación inmediata de aprobación',
                    'Pago en línea con Stripe (plan Profesional)',
                    'El historial completo queda en el timeline',
                ],
            },
        ],
        cta: { titulo: 'Mándale un link, no un archivo.', sub: 'Mira la cotización de ejemplo o crea la tuya gratis.' },
    },
    {
        slug: 'seguimiento',
        nav: 'Seguimiento en vivo',
        eyebrow: 'SEGUIMIENTO EN VIVO',
        titulo: 'Sabes el momento exacto<br/>en que la ven.',
        sub: 'Se acabó el "¿ya la revisaste?". Cord te avisa en cuanto tu cliente abre la cotización, cuántas veces la ha visto y qué hizo después — para que llames en el momento justo.',
        plan: 'Disponible en todos los planes',
        stats: [
            { valor: '3', countup: 3, suffix: ' min', label: 'el aviso llega en cuanto abren el link' },
            { valor: '100', countup: 100, suffix: '%', label: 'del recorrido queda en el timeline' },
            { valor: '2', countup: 2, suffix: '×', label: 'más cierres cuando das seguimiento a tiempo' },
        ],
        blocks: [
            {
                eyebrow: 'LA SEÑAL QUE IMPORTA',
                titulo: 'El interés se enfría rápido.<br/>Atrápalo caliente.',
                copy: 'Una cotización vista hace 5 minutos es una venta viva; una vista hace 2 semanas, un pendiente muerto. Cord convierte la apertura del link en una señal accionable: te enteras al momento y puedes responder cuando tu cliente te tiene en la cabeza.',
                bullets: [
                    'Evento "vista" con fecha y hora exactas',
                    'Cuenta de aperturas (¿la vio 3 veces? está comparando)',
                    'El estado de la cotización cambia solo: enviada → vista',
                ],
            },
            {
                eyebrow: 'TIMELINE',
                titulo: 'Toda la historia,<br/>en un solo hilo.',
                copy: 'Creada, enviada, vista, aprobada, pagada, facturada — cada cotización lleva su historia completa. Cualquiera de tu equipo abre el detalle y entiende en segundos en qué va el trato, sin preguntar en el grupo de WhatsApp.',
                bullets: [
                    'Cronología completa por cotización',
                    'Feed de actividad global en el dashboard',
                    'Contexto instantáneo para todo tu equipo',
                ],
            },
            {
                eyebrow: 'PIPELINE',
                titulo: 'Tu pipeline real,<br/>no el de la libreta.',
                copy: 'El dashboard agrupa tus cotizaciones por estado y te dice cuánto dinero está por cerrar, cuánto cerraste en el mes y tu tasa de cierre. Decisiones con números, no con corazonadas.',
                bullets: [
                    'KPIs en vivo: por cerrar, cerrado del mes, tasa de cierre',
                    'Pipeline visual por estado',
                    'Detecta cotizaciones por vencer antes de que expiren',
                ],
            },
        ],
        cta: { titulo: 'Deja de perseguir. Empieza a saber.', sub: 'Tu primera notificación de "la vio" no tiene precio.' },
    },
    {
        slug: 'cfdi',
        nav: 'CFDI 4.0',
        eyebrow: 'FACTURACIÓN CFDI 4.0',
        titulo: 'De cotización aprobada<br/>a factura timbrada.',
        sub: 'Cuando el trato se cierra, la factura sale sola: CFDI 4.0 real, timbrado ante el SAT, directo desde la cotización. Sin recapturar en otro portal, sin errores de transcripción.',
        plan: 'Plan Negocio',
        stats: [
            { valor: '1', countup: 1, suffix: ' clic', label: 'de la cotización aprobada al CFDI' },
            { valor: '0', countup: 0, label: 'capturas dobles — los datos viajan solos' },
            { valor: '5', countup: 5, suffix: ' min', label: 'para conectar tu CSD la primera vez' },
        ],
        blocks: [
            {
                eyebrow: 'SIN RECAPTURAR',
                titulo: 'Los datos ya están.<br/>Úsalos.',
                copy: 'La cotización ya tiene los productos, las cantidades, los precios negociados y el RFC del cliente. Timbrar es un clic: Cord arma el CFDI 4.0 con esos mismos datos y lo manda al PAC. Cero transcripción, cero errores de dedo.',
                bullets: [
                    'CFDI 4.0 con los datos exactos de la cotización',
                    'RFC y datos fiscales del cliente guardados en su ficha',
                    'UUID, XML y PDF disponibles al instante',
                ],
            },
            {
                eyebrow: 'TU CSD, SEGURO',
                titulo: 'Conecta tu sello una vez<br/>y olvídate.',
                copy: 'Subes tu Certificado de Sello Digital (CSD) una sola vez, protegido y aislado en tu cuenta. A partir de ahí, cada timbrado usa tu sello sin que vuelvas a tocar archivos .cer y .key.',
                bullets: [
                    'CSD cifrado y aislado por negocio',
                    'Timbrado con PAC autorizado por el SAT',
                    'Solo para México — como debe ser',
                ],
            },
            {
                eyebrow: 'CICLO COMPLETO',
                titulo: 'La cotización, el pago<br/>y la factura: un solo hilo.',
                copy: 'La factura no vive en otro sistema: queda ligada a su cotización, con su evento en el timeline. Cuando contabilidad pregunte, todo está en el mismo lugar — quién aprobó, cuándo pagó y qué UUID le tocó.',
                bullets: [
                    'Factura ligada a su cotización y su timeline',
                    'Estado "facturada" visible en tu pipeline',
                    'Historial listo para conciliar',
                ],
            },
        ],
        cta: { titulo: 'Factura sin salir del trato.', sub: 'CFDI 4.0 automático en el plan Negocio.' },
    },
    {
        slug: 'clientes-credito',
        nav: 'Clientes y crédito',
        eyebrow: 'CLIENTES Y CRÉDITO',
        titulo: 'El crédito es tu ventaja.<br/>Contrólalo.',
        sub: 'En B2B vender a crédito es vender más — si lo controlas. Cord guarda los términos de cada cliente (Contado, Net 30, Net 60) y su límite de crédito, y los aplica solos en cada cotización.',
        plan: 'Plan Negocio',
        stats: [
            { valor: '3', countup: 3, label: 'términos por cliente: Contado, Net 30, Net 60' },
            { valor: '100', countup: 100, suffix: '%', label: 'de tus cotizaciones respetan el límite asignado' },
            { valor: '1', countup: 1, label: 'ficha por cliente con todo su historial' },
        ],
        blocks: [
            {
                eyebrow: 'DIRECTORIO',
                titulo: 'Cada cliente, una ficha<br/>que lo dice todo.',
                copy: 'Empresa, contacto, correo, RFC, términos de pago y límite de crédito — la ficha del cliente concentra lo que tu equipo necesita para cotizarle bien. Y como vive en el sistema, todos cotizan con las mismas reglas.',
                bullets: [
                    'Datos fiscales listos para el CFDI',
                    'Términos default que se aplican solos al cotizar',
                    'Historial de cotizaciones por cliente',
                ],
            },
            {
                eyebrow: 'LÍMITE DE CRÉDITO',
                titulo: 'Di que sí con confianza<br/>(y que no, a tiempo).',
                copy: 'Asigna un límite de crédito por cliente y deja que el sistema lo vigile. Antes de mandar una cotización a crédito sabes cuánto espacio le queda al cliente — el "se nos pasó" deja de existir.',
                bullets: [
                    'Límite en pesos por cliente',
                    'Visibilidad de exposición antes de aprobar crédito',
                    'Net 30/60 con vencimientos claros',
                ],
            },
            {
                eyebrow: 'RELACIÓN',
                titulo: 'Los buenos clientes<br/>se notan en los datos.',
                copy: 'Quién aprueba rápido, quién paga a tiempo, quién pide y nunca cierra. Con el historial concentrado, decides a quién darle mejores precios y a quién pedirle anticipo — con evidencia, no con memoria.',
                bullets: [
                    'Cotizaciones, aprobaciones y pagos por cliente',
                    'Mejores decisiones de precio y crédito',
                    'La memoria comercial deja de vivir en una sola persona',
                ],
            },
        ],
        cta: { titulo: 'Conoce a tus clientes por sus números.', sub: 'Empieza gratis y carga tu directorio en minutos.' },
    },
];

export const findFeature = (slug: string) => FEATURES.find(f => f.slug === slug);
