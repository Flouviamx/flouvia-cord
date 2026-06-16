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

export interface Solution {
    slug: string;
    nav: string;              // nombre corto (megamenú, hub, cross-links)
    eyebrow: string;
    titulo: string;          // H1, admite <br/>
    sub: string;
    dolor: string;           // el dolor de la industria, una línea
    stats: SolStat[];
    blocks: SolBlock[];
    cta: { titulo: string; sub: string };
}

export const SOLUCIONES: Solution[] = [
    {
        slug: 'distribuidoras',
        nav: 'Distribuidoras y mayoristas',
        eyebrow: 'DISTRIBUIDORAS Y MAYORISTAS',
        titulo: 'Cada cliente,<br/>su propio precio.',
        sub: 'Vendes lo mismo a 200 clientes a 200 precios distintos. Cord guarda el precio negociado y los términos de cada cliente y los aplica solos — para que cualquiera de tu equipo cotice rápido sin regalar margen ni romper acuerdos.',
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
        ],
        cta: { titulo: 'Cotiza a cada cliente a su precio.', sub: 'Gratis hasta 5 cotizaciones activas. Sin tarjeta.' },
    },
    {
        slug: 'construccion',
        nav: 'Construcción y materiales',
        eyebrow: 'CONSTRUCCIÓN Y MATERIALES',
        titulo: 'Volumen, obra<br/>y crédito, bajo control.',
        sub: 'Cotizaciones de cientos de miles de pesos, entregas en obra y clientes que piden Net 60: el día a día del materialista. Cord le pone folio, vigencia y límite de crédito a cada trato — y te avisa en el momento en que lo aprueban.',
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
                    'CFDI 4.0 automático al cerrar (plan Negocio)',
                ],
            },
        ],
        cta: { titulo: 'Cotiza la obra completa<br/>en minutos.', sub: 'Empieza gratis y carga tu catálogo de materiales hoy.' },
    },
    {
        slug: 'manufactura',
        nav: 'Manufactura',
        eyebrow: 'MANUFACTURA',
        titulo: 'Cotiza especificación,<br/>lote y entrega.',
        sub: 'En manufactura cada cotización es un pequeño proyecto: especificaciones, cantidades mínimas, tiempos de entrega. Con líneas libres y notas por cotización, Cord documenta el acuerdo completo — y el timeline guarda quién aprobó qué y cuándo.',
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
                    'UUID, XML y PDF disponibles al instante (plan Negocio)',
                ],
            },
        ],
        cta: { titulo: 'Documenta el acuerdo,<br/>no lo persigas.', sub: 'Empieza gratis — tu primera cotización a la medida hoy.' },
    },
    {
        slug: 'servicios',
        nav: 'Servicios profesionales',
        eyebrow: 'SERVICIOS PROFESIONALES',
        titulo: 'Propuestas tan serias<br/>como tu trabajo.',
        sub: 'Una propuesta en PDF genérico compite mal contra una página elegante con tu marca, montos claros y un botón de aprobar. Manda un link que cierra por ti — y entérate en el momento exacto en que tu prospecto lo abre.',
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
        cta: { titulo: 'Manda un link,<br/>no un archivo.', sub: 'Mira una propuesta de ejemplo o crea la tuya gratis.' },
    },
];

export const findSolucion = (slug: string) => SOLUCIONES.find((s) => s.slug === slug);
