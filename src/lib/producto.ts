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
    titulo: string;      // admite HTML
    copy: string;
    bullets: string[];
}

export interface Faq {
    q: string;
    a: string;
}

export interface ShowcaseTab {
    eyebrow: string;      // etiqueta corta sobre el título
    titulo: string;       // hook, orientado al gancho psicológico (pérdida/urgencia/prueba social/autoridad)
    copy: string;         // 1-2 frases, tono editorial B2B, sin exagerar
}

export interface Feature {
    slug: string;
    nav: string;             // nombre corto (cross-links, megamenú)
    eyebrow: string;
    titulo: string;          // H1, admite HTML
    sub: string;
    metaTitle?: string;      // <title>/OG — keyword-rich (cae a `${nav} — Cord`)
    metaDescription?: string;// meta description (cae a `sub`)
    plan: string;            // en qué plan vive
    stats: FeatureStat[];
    blocks: FeatureBlock[];
    showcase: ShowcaseTab[]; // sección tabbed bajo el bento — 3 ángulos de venta con mockup grande
    faqs: Faq[];             // FAQ + FAQPage JSON-LD (mínimo 3 por página)
    cta: { titulo: string; sub: string };
}

export const FEATURES: Feature[] = [
    {
        slug: 'editor',
        nav: 'Editor de cotizaciones',
        eyebrow: 'EDITOR DE COTIZACIONES',
        titulo: 'Arma propuestas con precios inteligentes, en minutos.',
        sub: 'Ajusta precios por línea, define términos de crédito y mira el total recalcularse con impuestos en vivo. Todo lo que antes hacías en Excel, ahora en una sola pantalla.',
        metaTitle: 'Cómo hacer cotizaciones con precios negociados — Cord',
        metaDescription: 'El editor de cotizaciones de Cord permite negociar el precio de cada producto por separado, aplicar términos Net 30/60, calcular impuestos en tiempo real y generar un link de aprobación con tu marca. Para distribuidores y mayoristas en cualquier país.',
        plan: 'Disponible en todos los planes',
        stats: [
            { valor: '4', countup: 4, suffix: ' min', label: 'tiempo promedio para armar una cotización' },
            { valor: '100', countup: 100, suffix: '%', label: 'de los totales calculados sin errores de dedo' },
            { valor: '3', countup: 3, label: 'términos de pago: Contado, Net 30 y Net 60' },
        ],
        blocks: [
            {
                eyebrow: 'PRECIOS NEGOCIADOS',
                titulo: 'Cada cliente tiene su precio. Respétalo sin pensarlo.',
                copy: 'El precio de lista es solo el punto de partida. En Cord ajustas el precio de cada línea y el sistema te muestra el descuento aplicado al instante — tú decides hasta dónde llegar, el sistema se encarga de que los números cuadren.',
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
                titulo: 'El IVA y los totales, siempre correctos.',
                copy: 'Cada cambio recalcula subtotal, IVA y total al instante, con redondeo correcto y números tabulares estilo fintech. Define la vigencia y los términos de crédito y la cotización queda lista para enviarse.',
                bullets: [
                    'IVA 16% configurable por negocio',
                    'Vigencia con fecha de expiración automática',
                    'Folio consecutivo con tu prefijo (COT-0148, COT-0149…)',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'EL COSTO DE EXCEL',
                titulo: 'Cada hora en una hoja de cálculo es una venta que no cerraste.',
                copy: 'Mientras arrastras celdas y corriges fórmulas, tu competencia ya mandó su cotización. Cord arma la misma en 4 minutos — con el catálogo, el IVA y el total ya resueltos.',
            },
            {
                eyebrow: 'SIN FRICCIÓN',
                titulo: 'Agrega, negocia, envía. Sin saltar entre tres pantallas.',
                copy: 'Busca el producto, ajusta el precio de la línea, mira el total recalcularse — todo en el mismo lugar donde antes brincabas entre el catálogo, la calculadora y el Word.',
            },
            {
                eyebrow: 'CERO ERRORES DE DEDO',
                titulo: 'El número que envías es el número correcto.',
                copy: 'El IVA, los totales y el descuento por línea se calculan solos. Ya no hay un cliente que te llame para decirte que tu Excel sumó mal.',
            },
        ],
        faqs: [
            {
                q: '¿Cómo funciona el editor de cotizaciones de Cord?',
                a: 'El editor de cotizaciones de Cord permite agregar productos del catálogo con un clic, negociar el precio de cada línea individualmente, aplicar descuentos por volumen y definir los términos de pago (Contado, Net 30 o Net 60). El subtotal, IVA y total se recalculan automáticamente en tiempo real. El tiempo promedio para armar una cotización es de 4 minutos.',
            },
            {
                q: '¿Puedo tener precios diferentes para cada cliente en Cord?',
                a: 'Sí. En Cord cada línea de cotización tiene su propio precio negociado, independiente del precio de lista en el catálogo. El sistema muestra el porcentaje de descuento aplicado por línea y guarda el precio de lista como referencia para saber exactamente cuánto se cedió en cada venta.',
            },
            {
                q: '¿El editor de Cord calcula el IVA automáticamente?',
                a: 'Sí. Cord calcula el IVA 16% de forma automática con cada cambio en el editor. El subtotal, el IVA y el total se actualizan en tiempo real sin necesidad de fórmulas manuales. La tasa de IVA es configurable por negocio.',
            },
        ],
        cta: { titulo: 'Arma tu primera cotización hoy.', sub: 'Gratis hasta 5 cotizaciones activas. Sin tarjeta.' },
    },
    {
        slug: 'link-publico',
        nav: 'Link público',
        eyebrow: 'LINK PÚBLICO',
        titulo: 'Tu cliente aprueba y firma desde un link.',
        sub: 'Cada propuesta genera un link interactivo con tu marca. Tu cliente lo abre, revisa los términos, firma legalmente y aprueba, sin crear cuenta ni descargar nada.',
        metaTitle: 'Aprobación de cotizaciones por link sin registro — Cord',
        metaDescription: 'El link público de Cord genera una página con tu marca (logo, colores y datos fiscales) donde tu cliente revisa la cotización y aprueba en un clic, sin crear cuenta ni descargar nada. Para cualquier negocio, en cualquier país.',
        plan: 'Disponible en todos los planes',
        stats: [
            { valor: '0', countup: 0, label: 'cuentas que tu cliente necesita crear' },
            { valor: '1', countup: 1, suffix: ' clic', label: 'para aprobar la cotización' },
            { valor: '24/7', label: 'disponible desde cualquier dispositivo' },
        ],
        blocks: [
            {
                eyebrow: 'CERO FRICCIÓN',
                titulo: 'Sin registro, sin PDF perdido en el correo.',
                copy: 'El PDF adjunto muere en la bandeja de entrada. El link de Cord vive: tu cliente lo abre donde sea, ve la versión más reciente y actúa ahí mismo. Aprobar o rechazar es un botón, no una llamada.',
                bullets: [
                    'Funciona en WhatsApp, correo o donde lo compartas',
                    'Siempre muestra la versión vigente de la cotización',
                    'Botones de aprobar / rechazar directo en la página',
                ],
            },
            {
                eyebrow: 'TU MARCA',
                titulo: 'La página la firma tu negocio, no el nuestro.',
                copy: 'Tu logo, tu nombre y tus colores presiden la cotización. En los planes de pago desaparece el "Powered by Cord" y la experiencia es 100% tuya — tu cliente ve una empresa seria con sistemas serios.',
                bullets: [
                    'Logo y color de marca configurables en Ajustes',
                    'Diseño cuidado: tipografía fintech, montos protagonistas',
                    'También descargable como PDF con la misma marca',
                ],
            },
            {
                eyebrow: 'DEL SÍ AL PEDIDO',
                titulo: 'Aprobada la cotización, empieza el trato.',
                copy: 'Cuando tu cliente aprueba, tú recibes el aviso al instante y la cotización cambia de estado sola. Si tiene pago en línea habilitado, puede pagar ahí mismo; si maneja crédito, queda registrado bajo sus términos Net 30/60.',
                bullets: [
                    'Notificación inmediata de aprobación',
                    'Pago en línea con tarjeta, disponible en todos los planes',
                    'El historial completo queda en el timeline',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'EL PDF QUE NADIE VUELVE A ABRIR',
                titulo: 'Un adjunto muere en la bandeja de entrada. Un link vive.',
                copy: 'La mayoría de los PDF de cotización se abren una sola vez y se pierden. Cord manda un link que tu cliente aprueba con el pulgar, desde WhatsApp, sin buscar un archivo perdido.',
            },
            {
                eyebrow: 'TU MARCA, NO LA NUESTRA',
                titulo: 'Que se vea como lo mandó una empresa seria — porque lo es.',
                copy: 'Logo, colores y dominio propio. Tu cliente ve tu negocio, no un "powered by" genérico. La confianza se construye desde el primer clic.',
            },
            {
                eyebrow: 'DEL SÍ AL COBRO',
                titulo: 'Aprobar deja de ser el final del proceso. Es el inicio del cobro.',
                copy: 'En cuanto tu cliente dice que sí, tú lo sabes al instante y el pago o el crédito ya están listos para activarse. Cero llamadas de "¿ya viste mi cotización?".',
            },
        ],
        faqs: [
            {
                q: '¿Mi cliente necesita crear una cuenta para aprobar una cotización de Cord?',
                a: 'No. El cliente recibe un link, lo abre desde el celular o computadora, revisa los productos y el total con la marca del vendedor, y aprueba o rechaza con un botón. No necesita registrarse, instalar nada ni descargar archivos.',
            },
            {
                q: '¿El link de cotización de Cord funciona por WhatsApp?',
                a: 'Sí. El link público de Cord puede compartirse por WhatsApp, correo electrónico o cualquier canal. El cliente lo abre directamente desde el chat y puede aprobar la cotización sin salir del navegador.',
            },
            {
                q: '¿Puedo quitar la marca de Cord del link de aprobación?',
                a: 'Sí. En los planes de pago (Starter en adelante) se elimina el "Powered by Cord" y el link muestra únicamente el logo, nombre, colores y datos fiscales del negocio que envía la cotización. La experiencia es 100% de la marca propia.',
            },
        ],
        cta: { titulo: 'La próxima cotización que mandes por WhatsApp puede tener un botón de aprobar.', sub: 'Mira la cotización de ejemplo o crea la tuya gratis.' },
    },
    {
        slug: 'seguimiento',
        nav: 'Seguimiento en vivo',
        eyebrow: 'SEGUIMIENTO EN VIVO',
        titulo: 'Sabes el momento exacto en que la ven.',
        sub: 'Cord te avisa cuando tu cliente abre la propuesta, cuántas veces la ha visto y qué hizo después. Llama en el momento justo, con datos reales.',
        metaTitle: 'Saber cuándo tu cliente abrió la cotización: seguimiento en vivo — Cord',
        metaDescription: 'El seguimiento en vivo de Cord te avisa el instante exacto en que tu cliente abre la cotización, cuántas veces la vio y qué hizo después, para que sepas cuándo dar seguimiento. Sin adivinar, sin perseguir por WhatsApp.',
        plan: 'Disponible en todos los planes',
        stats: [
            { valor: '3', countup: 3, suffix: ' min', label: 'el aviso llega en cuanto abren el link' },
            { valor: '100', countup: 100, suffix: '%', label: 'del recorrido queda en el timeline' },
            { valor: '2', countup: 2, suffix: '×', label: 'más cierres cuando das seguimiento a tiempo' },
        ],
        blocks: [
            {
                eyebrow: 'LA SEÑAL QUE IMPORTA',
                titulo: 'El interés se enfría rápido. Atrápalo caliente.',
                copy: 'Una cotización vista hace 5 minutos es una venta viva; una vista hace 2 semanas, un pendiente muerto. Cord convierte la apertura del link en una señal accionable: te enteras al momento y puedes responder cuando tu cliente te tiene en la cabeza.',
                bullets: [
                    'Evento "vista" con fecha y hora exactas',
                    'Cuenta de aperturas (¿la vio 3 veces? está comparando)',
                    'El estado de la cotización cambia solo: enviada → vista',
                ],
            },
            {
                eyebrow: 'TIMELINE',
                titulo: 'Toda la historia, en un solo hilo.',
                copy: 'Creada, enviada, vista, aprobada, pagada, facturada — cada cotización lleva su historia completa. Cualquiera de tu equipo abre el detalle y entiende en segundos en qué va el trato, sin preguntar en el grupo de WhatsApp.',
                bullets: [
                    'Cronología completa por cotización',
                    'Feed de actividad global en el dashboard',
                    'Contexto instantáneo para todo tu equipo',
                ],
            },
            {
                eyebrow: 'PIPELINE',
                titulo: 'Tu pipeline real, no el de la libreta.',
                copy: 'El dashboard agrupa tus cotizaciones por estado y te dice cuánto dinero está por cerrar, cuánto cerraste en el mes y tu tasa de cierre. Decisiones con números, no con corazonadas.',
                bullets: [
                    'KPIs en vivo: por cerrar, cerrado del mes, tasa de cierre',
                    'Pipeline visual por estado',
                    'Detecta cotizaciones por vencer antes de que expiren',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'EL INTERÉS SE ENFRÍA RÁPIDO',
                titulo: 'Un cliente que vio tu cotización hace 10 minutos todavía piensa en ti.',
                copy: 'Uno que la vio hace dos semanas, ya no. Cord te avisa el segundo exacto en que abren el link — para que llames cuando todavía te tienen en la cabeza.',
            },
            {
                eyebrow: 'LA VIO 3 VECES = ESTÁ COMPARANDO',
                titulo: 'Sabes exactamente qué tan cerca está el sí.',
                copy: 'Cada apertura queda registrada. Si tu cliente volvió a entrar varias veces en un día, no te está ignorando — está decidiendo. Es tu señal para llamar, no para esperar.',
            },
            {
                eyebrow: 'TU PIPELINE, DE VERDAD',
                titulo: 'Deja de adivinar cuánto vas a cerrar este mes.',
                copy: 'El dashboard te dice cuánto dinero está por cerrar, cuánto ya cerraste y qué cotizaciones llevan un silencio peligroso. Decisiones con números, no con la memoria de la última llamada.',
            },
        ],
        faqs: [
            {
                q: '¿Cómo sé si mi cliente ya vio la cotización en Cord?',
                a: 'Cord envía una notificación en tiempo real en cuanto el cliente abre el link de la cotización. El dashboard muestra el evento "vista" con fecha y hora exactas, y el número de veces que el cliente la ha abierto. Si la cotización fue vista varias veces, suele indicar que el cliente está comparando opciones.',
            },
            {
                q: '¿Cord guarda el historial completo de cada cotización?',
                a: 'Sí. Cada cotización en Cord tiene un timeline completo: cuándo se creó, cuándo se envió, cuándo el cliente la vio (y cuántas veces), cuándo fue aprobada o rechazada, y cuándo se timbró el CFDI. Cualquier miembro del equipo puede ver el historial sin necesidad de preguntar.',
            },
            {
                q: '¿Cord tiene pipeline de cotizaciones?',
                a: 'Sí. El dashboard de Cord muestra las cotizaciones agrupadas por estado (borrador, enviada, vista, aprobada, facturada) con el valor total de cada etapa. Incluye KPIs en vivo: monto por cerrar, monto cerrado en el mes y tasa de cierre. También detecta cotizaciones próximas a vencer antes de que expiren.',
            },
        ],
        cta: { titulo: 'Deja de perseguir. Empieza a saber.', sub: 'Tu primera notificación de "la vio" no tiene precio.' },
    },
    {
        slug: 'clientes-credito',
        nav: 'Clientes y crédito',
        eyebrow: 'CLIENTES Y CRÉDITO',
        titulo: 'Sabes cuánto te debe cada cliente antes de venderle otra vez.',
        sub: 'Cada cliente tiene una ficha con sus términos de pago, su límite de crédito y un estado de cuenta al día que junta cotizaciones y facturas. Vendes a crédito con los números enfrente, no de memoria.',
        metaTitle: 'Clientes, crédito Net 30/60 y estado de cuenta por cliente — Cord',
        metaDescription: 'Guarda los términos de pago (Contado, Net 30, Net 60), el límite de crédito y el nivel de precio de cada cliente, y consulta su estado de cuenta por antigüedad, con cotizaciones y facturas juntas. En todos los planes.',
        plan: 'Disponible en todos los planes: 50 clientes en Gratis, 500 en Starter y sin tope desde Profesional',
        stats: [
            { valor: '3', countup: 3, label: 'términos de pago por cliente: Contado, Net 30 y Net 60' },
            { valor: '5', countup: 5, label: 'bandas de antigüedad en el estado de cuenta: al corriente, 1–30, 31–60, 61–90 y más de 90 días' },
            { valor: '4', countup: 4, label: 'niveles de precio por cliente —Estándar, Plata, Oro y Distribuidor—, cada uno con su descuento' },
        ],
        blocks: [
            {
                eyebrow: 'LA FICHA',
                titulo: 'Un cliente, una ficha con todo lo que necesitas para cotizarle.',
                copy: 'Empresa, contacto, identificación fiscal con el nombre que usa su país, dirección, términos de pago, límite de crédito y nivel de precio. El nivel aplica su descuento en cuanto eliges al cliente en el editor, así que todo tu equipo cotiza con las mismas reglas. Tu directorio entra y sale en CSV.',
                bullets: [
                    'Identificación fiscal con la etiqueta de su país: RFC, NIF, EIN…',
                    'Niveles Plata, Oro y Distribuidor con descuento automático',
                    'Importación y exportación del directorio en CSV',
                ],
            },
            {
                eyebrow: 'ESTADO DE CUENTA',
                titulo: 'Lo que te debe, por antigüedad, en su propia ficha.',
                copy: 'La ficha de cada cliente junta lo que tiene abierto en cotizaciones aprobadas y en facturas, descontando anticipos, abonos y notas de crédito, y lo reparte por antigüedad: al corriente, de 1 a 30 días, de 31 a 60, de 61 a 90 y más de 90. Cada documento lleva su vencimiento y sus días de atraso, y abre su detalle con un clic.',
                bullets: [
                    'Saldo total, vencido y atraso máximo, al día de hoy',
                    'Cotizaciones y facturas juntas, sin contar dos veces la misma venta',
                    'En todos los planes, sin configurar nada',
                ],
            },
            {
                eyebrow: 'LÍMITE Y TÉRMINOS',
                titulo: 'El límite te avisa. La decisión sigue siendo tuya.',
                copy: 'Con un límite asignado, la ficha muestra qué porcentaje del crédito está en uso y te marca cuando el saldo abierto lo rebasa; desde Profesional, el tablero de cobranza reúne a todos los clientes excedidos. Y una venta a Net 30 o Net 60 no se le cobra al cliente antes de tiempo: el link confirma el pedido con crédito, muestra cuándo vence y, si cobras en línea, ofrece el pago al llegar la fecha.',
                bullets: [
                    'Porcentaje de crédito en uso, con alerta al rebasarlo',
                    'Clientes excedidos en un solo lugar, desde Profesional',
                    'A crédito, el link muestra el vencimiento en lugar de cobrar',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'EL CLIENTE QUE SE ALEJA',
                titulo: 'Un buen cliente no avisa cuando deja de comprarte.',
                copy: 'El informe de clientes lista a quienes tienen historial contigo pero ninguna actividad en 90 días, con lo que te han comprado y su nivel. Es la llamada que conviene hacer antes de que se vuelva costumbre.',
            },
            {
                eyebrow: 'DESCUENTO CONTRA PUNTUALIDAD',
                titulo: 'Tu nivel Oro tiene el mejor precio. ¿También paga a tiempo?',
                copy: 'La matriz de nivel por comportamiento de pago cruza el nivel comercial de cada cliente con su puntualidad real —puntual, de 1 a 7 días tarde, más de 7—, para que el descuento premie a quien lo merece.',
            },
            {
                eyebrow: 'ANTES DE RENEGOCIAR',
                titulo: 'Llegas a la negociación sabiendo cuánto le has cedido.',
                copy: 'La ficha muestra el descuento acumulado frente a tu precio de lista, lo que más le vendes y su tasa de cierre contigo. Si pide otro descuento, ya sabes de dónde partes.',
            },
        ],
        faqs: [
            {
                q: '¿Cord bloquea una cotización si el cliente rebasa su límite?',
                a: 'No. El límite es una alerta, no un candado: la ficha marca el saldo por encima del límite y el tablero de cobranza lo lista, pero la cotización se puede enviar. Si quieres un freno antes de vender, las reglas de aprobación detienen una cotización por monto, descuento o margen hasta que alguien con permiso la apruebe; están en el plan Scale.',
            },
            {
                q: '¿Desde cuándo corre el plazo de Net 30 o Net 60?',
                a: 'Desde el día en que tu cliente aprueba la cotización. Con esa fecha se calculan el vencimiento que ve en el link, la antigüedad del estado de cuenta y cuándo entra a tu cartera vencida. Los términos se eligen en cada cotización —Contado, Net 30 o Net 60— y la ficha guarda los de cada cliente.',
            },
            {
                q: '¿Puedo traer mi directorio desde otro sistema?',
                a: 'Sí. Subes un CSV con empresa, contacto, correo, teléfono, identificación fiscal, términos y límite de crédito; si un cliente ya existe —por su identificación fiscal o por el nombre de la empresa—, se actualiza en lugar de duplicarse. También exportas el directorio completo cuando lo necesites.',
            },
            {
                q: '¿Quién puede cambiar el límite o los términos de un cliente?',
                a: 'Quien tenga el permiso de Clientes, el mismo que crea y edita fichas; el resto del equipo las consulta. Ojo: el rol Vendedor trae ese permiso de inicio. Si prefieres que solo administración toque límites y términos, quítaselo en Ajustes › Equipo y Roles; invitar a más personas está desde Profesional.',
            },
        ],
        cta: { titulo: 'Importa tu directorio y dale a cada cliente sus reglas.', sub: 'Importa tus clientes desde CSV en minutos. Gratis hasta 50 clientes.' },
    },
    {
        slug: 'cobranza-ia',
        nav: 'Cobranza con IA',
        eyebrow: 'COBRANZA CON IA',
        titulo: 'Un agente que redacta tu cobranza y espera tu visto bueno.',
        sub: 'Cada día, el agente revisa tu cartera vencida y le escribe a cada cuenta con su saldo real, sus días de atraso y el link para pagar. Puede ofrecer un plan en cuotas dentro de tus límites, y nada sale sin tu aprobación hasta que decidas dejarlo en automático.',
        metaTitle: 'Cobranza con IA: un agente que redacta y negocia tu cartera vencida — Cord',
        metaDescription: 'El agente de cobranza de Cord le escribe a cada cuenta vencida con su saldo real y el link de pago, puede ofrecer planes de 2 a 6 cuotas dentro de tus límites y espera tu aprobación antes de enviar. Desde el plan Scale.',
        plan: 'Agente de cobranza con IA en el plan Scale; el módulo de cobranza —cartera, prioridades y promesas de pago— desde Profesional',
        stats: [
            { valor: '1', countup: 1, label: 'corrida diaria sobre tu cartera vencida, además de las que lances con "Correr ahora"' },
            { valor: '6', countup: 6, label: 'cuotas mensuales como máximo en un plan; tú eliges el tope desde 2' },
            { valor: '0', countup: 0, label: 'correos que salen sin tu aprobación mientras el agente trabaja en modo de aprobación' },
        ],
        blocks: [
            {
                eyebrow: 'EL AGENTE',
                titulo: 'Cada correo lleva el saldo real y el link para pagar.',
                copy: 'Una vez al día, el agente toma las cuentas que ya pasaron su vencimiento y los días de gracia que definiste, y redacta un correo distinto para cada una: el saldo que de verdad falta, descontando lo que ya te pagaron; los días de atraso, y el link para pagar en línea. Escribe en el tono que elijas, en español o en inglés y con tu firma, y no le vuelve a escribir a la misma cuenta antes de los días que fijaste.',
                bullets: [
                    'Días de gracia, días entre correos y monto mínimo, a tu medida',
                    'Tono cercano, profesional o firme, con tu firma',
                    'Las igualas al corriente y las cuentas excluidas no reciben correos',
                ],
            },
            {
                eyebrow: 'PLANES EN CUOTAS',
                titulo: 'Si el cliente no puede pagar todo, le ofrece cuotas.',
                copy: 'A partir de los días de atraso que elijas, el agente puede proponer un plan de 2 a 6 cuotas mensuales que suman exactamente el saldo: sin descuentos sobre el adeudo y sin montos redondeados a ojo, porque las cuotas las calcula Cord, no el modelo. En modo de aprobación, el plan solo se vuelve real cuando tú lo apruebas; entonces el saldo pendiente se reemplaza por cuotas con su propio vencimiento, pagables desde el mismo link.',
                bullets: [
                    'De 2 a 6 cuotas mensuales; tú fijas el máximo',
                    'Las cuotas suman el saldo al centavo, sin quitas',
                    'Avance a la vista: cuántas cuotas van pagadas y cuándo vence la próxima',
                ],
            },
            {
                eyebrow: 'TÚ DECIDES',
                titulo: 'Nada llega a tu cliente sin pasar por tu bandeja.',
                copy: 'En modo de aprobación, cada correo espera en la bandeja: lo apruebas, lo editas, le pides al agente que lo rehaga con una indicación o lo descartas, y recibes un solo aviso por corrida, no uno por cliente. "En la mira" te dice a quién le escribirá en la próxima corrida y a quién no, con el motivo. Y si un cliente no debe recibir correos, lo excluyes con un clic.',
                bullets: [
                    'Aprobar, editar, rehacer o descartar cada borrador',
                    '"En la mira": a quién le escribirá y por qué no a los demás',
                    'Cada aprobación, descarte y exclusión queda en la bitácora de auditoría',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'VENCIDO SIN GESTIÓN',
                titulo: 'La cuenta más cara es la que nadie ha tocado.',
                copy: 'El tablero de cobranza separa lo vencido que ya tiene una promesa de pago de lo que nadie ha atendido, y ordena lo que queda por monto y días de atraso. Está desde el plan Profesional, antes de encender ningún agente.',
            },
            {
                eyebrow: 'RECUPERADO POR EL AGENTE',
                titulo: 'Solo cuenta como recuperado lo que se pagó después de su correo.',
                copy: 'El tablero del agente suma lo cobrado en los últimos 30 días en cuentas a las que ya les había escrito antes del pago; lo que llegó por su cuenta no se le acredita. Al lado ves cuántos planes en cuotas siguen activos y cuánto dinero comprometen.',
            },
            {
                eyebrow: 'DE LA APROBACIÓN AL AUTOMÁTICO',
                titulo: 'Empiezas aprobando todo. Sueltas cuando los correos ya no necesitan cambios.',
                copy: 'El agente arranca en modo de aprobación. Cuando llevas ocho correos aprobados sin cambiarles una palabra, Cord te sugiere dejarlo en automático; si prefieres seguir revisando, sigue esperando tu visto bueno.',
            },
        ],
        faqs: [
            {
                q: '¿Qué pasa cuando el cliente responde?',
                a: 'La respuesta llega a tu correo de contacto: el agente escribe a nombre de tu negocio y tu cliente te contesta a ti. Si prefieres seguir tú, le escribes desde el hilo de esa cuenta en Cord y el agente lee ese mensaje antes de su siguiente correo. Si un borrador no refleja lo que ya hablaron, le das una indicación —"aceptó tres cuotas", "más breve"— y lo rehace.',
            },
            {
                q: '¿En qué se diferencia de los recordatorios automáticos?',
                a: 'Los recordatorios salen en todos los planes con la misma plantilla para todos: por defecto, una factura recibe aviso siete días y un día antes de vencer, y a los 3, 7, 14 y 30 días de vencida. El agente escribe un correo distinto para cada cuenta según su atraso y lo que ya se habló, respeta tus exclusiones y puede ofrecer cuotas. Los dos pueden convivir.',
            },
            {
                q: '¿El agente puede ofrecer descuentos?',
                a: 'No. Sus reglas le prohíben ofrecer descuentos sobre el adeudo, y un plan solo se registra si sus cuotas suman exactamente el saldo: Cord lo verifica en el servidor en lugar de confiar en lo que redacte el modelo. Tampoco propone un segundo plan a una cuenta que ya tiene uno vigente.',
            },
            {
                q: '¿Desde qué correo escribe y qué ve mi cliente?',
                a: 'El correo sale a nombre de tu negocio a través de Cord, con respuesta a tu correo de contacto, y trae un botón para pagar en línea cuando tienes el cobro activo. Al pie dice que es un mensaje automatizado de cobranza enviado en nombre de tu negocio y cómo pedir que se detengan esos mensajes.',
            },
            {
                q: '¿Qué plan necesito y cuánto consume?',
                a: 'El agente vive en el plan Scale, y cada correo que redacta usa una acción de IA de tu plan: Scale incluye 500 al mes y lo que pase de ahí se cobra como excedente. El módulo de cobranza —cartera por antigüedad, prioridades, promesas de pago y recordatorio por WhatsApp— está desde Profesional.',
            },
        ],
        cta: { titulo: 'Tu cartera vencida no tiene que esperar a que tengas tiempo.', sub: 'Enciende el agente en modo de aprobación y revisa sus primeros correos. Disponible en el plan Scale.' },
    },
    {
        slug: 'divisas',
        nav: 'Multi-divisa y FX',
        eyebrow: 'MULTI-DIVISA',
        titulo: 'Vende en la moneda de tu cliente. Lleva tus libros en la tuya.',
        sub: 'Cotizas y facturas en cualquiera de 14 divisas, y cada venta queda registrada en tu moneda contable con una tasa que sale de una fuente publicada, nunca inventada. Si ninguna fuente publica el tipo de cambio, la operación se detiene y te dice por qué.',
        metaTitle: 'Cotizaciones y facturas en dólares, euros y 12 divisas más — Cord',
        metaDescription: 'Cotiza y factura en la divisa de tu cliente y registra cada venta en tu moneda contable con un tipo de cambio de una fuente publicada, congelado al cotizar y declarado en la factura. 14 divisas, en todos los planes.',
        plan: 'Disponible en todos los planes, incluido Gratis',
        stats: [
            { valor: '14', countup: 14, label: 'divisas para cotizar y facturar: las de los 12 países de Cord más JPY, CNY, CHF y AUD' },
            { valor: '3', countup: 3, label: 'fuentes de tipo de cambio consultadas en orden, empezando por el Banco Central Europeo' },
            { valor: '24', countup: 24, suffix: ' h', label: 'de antigüedad máxima para una tasa guardada; más vieja, la operación se detiene' },
        ],
        blocks: [
            {
                eyebrow: 'LA DIVISA DE LA VENTA',
                titulo: 'Tu cliente ve, aprueba y paga en su moneda.',
                copy: 'Eliges la divisa al armar la cotización y capturas los precios directamente en ella. El link, el correo, el cobro en línea y la factura salen en esa misma divisa, con su símbolo y su formato, sin que nadie convierta a mano en una hoja de cálculo.',
                bullets: [
                    '14 divisas: las de los 12 países de Cord más JPY, CNY, CHF y AUD',
                    'Link, correo, cobro y factura en la misma divisa',
                    'Los precios se capturan en la divisa de la venta',
                ],
            },
            {
                eyebrow: 'TU MONEDA CONTABLE',
                titulo: 'Tus libros siguen en tu moneda, con la tasa a la vista.',
                copy: 'Cuando vendes en una divisa y llevas tu contabilidad en otra, Cord congela el tipo de cambio al guardar la cotización, y esa misma tasa es la que declara la factura aunque la emitas semanas después. La factura guarda el total en las dos monedas y el PDF imprime la tasa usada.',
                bullets: [
                    'Tasa congelada al cotizar: la misma que declara la factura',
                    'Total en la divisa de la venta y en tu moneda contable',
                    'En México, el CFDI lleva esa tasa como tipo de cambio',
                ],
            },
            {
                eyebrow: 'UNA TASA QUE SE PUEDE DEMOSTRAR',
                titulo: 'Sin una tasa publicada, no hay tasa.',
                copy: 'Cord consulta el tipo de cambio en fuentes públicas que fechan cada dato, empezando por el Banco Central Europeo. Si ninguna responde, la cotización no se guarda y el editor te dice por qué: puedes intentar en un momento o cotizar en tu moneda. Una tasa guardada solo se reutiliza si tiene menos de 24 horas; nunca se sustituye por un 1 a 1 ni por una tabla fija.',
                bullets: [
                    'Primero el Banco Central Europeo; después, fuentes de cobertura amplia',
                    'Nunca un 1 a 1 ni una tabla fija de respaldo',
                    'Sin tasa demostrable, la operación se detiene con un mensaje claro',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'ANTES DE ENVIAR',
                titulo: 'Antes de mandar la cotización ya sabes cuánto es en tu moneda.',
                copy: 'Al elegir otra divisa, el editor muestra el tipo de cambio de hoy y una línea clara: lo que paga tu cliente y lo que eso significa en tus libros. Si en ese momento no hay tasa disponible, lo dice ahí mismo en vez de mostrarte un número de relleno.',
            },
            {
                eyebrow: 'LOS CENTAVOS QUE NO EXISTEN',
                titulo: 'Un peso chileno no tiene centavos. Cobrarlo como si los tuviera multiplica el cargo por cien.',
                copy: 'Cord conoce los decimales de cada divisa: el yen y el peso chileno van sin centavos, y así llegan al cobro en línea. Una herramienta que asume dos decimales para todas le cobra cien veces de más a tu cliente.',
            },
            {
                eyebrow: 'MÁS ALLÁ DEL EURO Y EL DÓLAR',
                titulo: 'Del dólar al peso colombiano, aunque el Banco Central Europeo no lo publique.',
                copy: 'El BCE no publica todas las divisas de Latinoamérica. Para el peso colombiano, el chileno, el argentino o el sol peruano, Cord toma la tasa de otras fuentes con fecha, en ese orden, en vez de dejarte sin poder cotizar.',
            },
        ],
        faqs: [
            {
                q: '¿Qué divisas puedo usar?',
                a: 'Catorce: peso mexicano, dólar estadounidense, dólar canadiense, real brasileño, euro, libra esterlina, peso colombiano, peso argentino, peso chileno y sol peruano —las de los 12 países donde opera Cord—, más yen, yuan, franco suizo y dólar australiano para comercio internacional. Si tu cuenta ya usaba una divisa que quedó fuera de la lista, la conservas.',
            },
            {
                q: '¿La tasa congelada protege mi margen?',
                a: 'Protege tus números, no el dinero. La tasa congelada decide cómo queda registrada la venta en tu moneda contable y qué tipo de cambio declara la factura; el editor te deja sumarle a la tasa del día un colchón de 1, 2 o 5%, con 2% de inicio. No es una cobertura cambiaria: tu cliente paga el importe en la divisa de la venta, y la conversión del dinero cuando llega a tu cuenta la hace tu banco o tu procesador de pagos al tipo de ese día.',
            },
            {
                q: '¿Cambia algo si mi cliente paga en línea?',
                a: 'El cobro se hace en la divisa de la venta. SPEI solo acepta pesos mexicanos, así que en una cotización en otra divisa tu cliente paga con tarjeta aunque tengas SPEI activado.',
            },
        ],
        cta: { titulo: 'Cotiza al extranjero sin una hoja de tipos de cambio al lado.', sub: 'Elige la divisa al armar la cotización. En todos los planes, gratis para empezar.' },
    },
    {
        slug: 'pagos',
        nav: 'Cord Payments',
        eyebrow: 'CORD PAYMENTS',
        titulo: 'El link que cierra la venta también la cobra.',
        sub: 'Tu cliente paga desde la cotización o la factura, con tarjeta o con Mercado Pago según tu país, y el dinero llega a tu cuenta, no a la de Cord. El alta de tu cuenta de cobro —identidad, socios y cuenta de depósito— se hace dentro de Cord.',
        metaTitle: 'Cord Payments: cobra con tarjeta, SPEI y Mercado Pago desde tu link — Cord',
        metaDescription: 'Cobra cotizaciones y facturas desde su propio link: tarjeta en 8 países, SPEI en pesos mexicanos y Mercado Pago en seis mercados de Latinoamérica. Anticipos, igualas mensuales y abonos parciales, en todos los planes.',
        plan: 'Disponible en todos los planes, incluido Gratis. Sin cuota extra: la comisión es por cobro y depende de la divisa y del riel.',
        stats: [
            { valor: '12', countup: 12, label: 'países con cobro en línea: 8 con Cord Payments y 6 con Mercado Pago; México y Brasil tienen los dos' },
            { valor: '4', countup: 4, label: 'formas de cobrar una cotización: pago total, anticipo y saldo, cuotas o iguala mensual' },
            { valor: '0', countup: 0, label: 'paneles de terceros para dar de alta tu cuenta de cobro' },
        ],
        blocks: [
            {
                eyebrow: 'DOS RIELES, UN MISMO LINK',
                titulo: 'Tarjeta, SPEI o Mercado Pago, según dónde vendas.',
                copy: 'Con Cord Payments tu cliente paga con tarjeta dentro de tu link, con tu marca y sin que lo mandes a otro sitio; en cotizaciones en pesos mexicanos también puede pagar por SPEI, a una CLABE exclusiva de ese cobro que se concilia sola. Donde Cord Payments no llega, cobras con tu cuenta de Mercado Pago: tu cliente paga en su checkout y vuelve a tu link.',
                bullets: [
                    'La tarjeta se cobra dentro de tu link, con tu marca',
                    'SPEI a una CLABE exclusiva de cada cobro, que se concilia sola',
                    'El dinero llega a tu cuenta, nunca a la de Cord',
                ],
            },
            {
                eyebrow: 'LO QUE SE COBRA',
                titulo: 'Anticipo al aprobar, saldo al vencer, iguala cada mes.',
                copy: 'Si pides anticipo, el link le muestra a tu cliente desde el primer vistazo cuánto paga al aprobar y cuándo vence el saldo, y cobra cada parte por separado. Una iguala se autoriza una sola vez con tarjeta y Cord Payments la cobra cada mes. En la factura, tu cliente puede abonar una parte del saldo con tarjeta o con Mercado Pago, y lo que falta sigue abierto.',
                bullets: [
                    'Anticipo y saldo, cada uno con su propio vencimiento',
                    'Igualas mensuales: tu cliente autoriza su tarjeta una vez',
                    'Abonos parciales al saldo de una factura',
                ],
            },
            {
                eyebrow: 'DESPUÉS DEL COBRO',
                titulo: 'Sabes cuánto te depositan, cuándo y a qué cuenta.',
                copy: 'En Cobros ves tu saldo disponible y el próximo depósito con su estado —programado, en camino o depositado— y su fecha de llegada, además de lo que se fue en comisiones, reembolsos y disputas. Tú eliges cada cuánto te depositan, y tu cuenta bancaria se captura en el formato de tu país —CLABE, IBAN, routing number o sort code— y se valida antes de guardarla, incluidos los dígitos de control donde el formato los tiene.',
                bullets: [
                    'El próximo depósito, con su estado y fecha de llegada',
                    'Depósitos diarios, semanales o mensuales, a tu elección',
                    'Cuenta de depósito validada en el formato de tu país',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'TRES SOCIOS, NINGÚN DUEÑO INVENTADO',
                titulo: 'Una sociedad con tres socios da de alta su cuenta sin declarar un dueño único que no existe.',
                copy: 'El alta de Cord Payments pregunta el papel real de cada persona —quién tiene 25% o más, quién dirige— y registra a cada una con su porcentaje. La foto de cada identificación se puede tomar con el celular escaneando un código, sin perder lo que ya se llenó en la computadora.',
            },
            {
                eyebrow: 'CONTRACARGOS',
                titulo: 'Si te disputan un cobro, la evidencia ya está armada.',
                copy: 'Cord reúne lo que prueba la venta —quién aprobó la cotización, cuándo, desde qué IP y qué partidas— en un documento listo para enviar. Agregas tus archivos y respondes desde Cobros antes de la fecha límite.',
            },
            {
                eyebrow: 'EL PAGO SE REGISTRA SOLO',
                titulo: 'Nadie tiene que marcar la venta como pagada.',
                copy: 'Cuando entra un pago —con tarjeta, SPEI o Mercado Pago—, la cotización o la factura se actualiza sola: el saldo baja y, cuando llega a cero, pasa a pagada. Si la misma cotización se paga por los dos rieles, queda señalada en el historial para que la revises, en vez de sumarse en silencio.',
            },
        ],
        faqs: [
            {
                q: '¿Cuánto cuesta cobrar en línea con Cord?',
                a: 'No hay cuota extra en ningún plan, incluido Gratis: se paga por cobro. En cobros en pesos mexicanos con Cord Payments, la tarifa es 4% + MXN 3 + IVA con tarjeta y 1% + MXN 7 + IVA por SPEI, con un máximo de MXN 588.12 por operación SPEI; se descuenta del cobro y en Cobros ves el neto que llega a tu banco. Con Mercado Pago pagas las tarifas de tu propia cuenta de Mercado Pago, y Cord no suma nada encima.',
            },
            {
                q: '¿Qué pasa si mi país no tiene Cord Payments?',
                a: 'Cobras en línea con tu propia cuenta de Mercado Pago: la conectas en Ajustes › Cobros y tu cliente paga desde el mismo link de la cotización o la factura. Cord te dice qué riel aplica en tu país antes de empezar el alta, no después de un error.',
            },
            {
                q: '¿En qué cambia cobrar con Mercado Pago?',
                a: 'Tu cliente termina el pago en el checkout de Mercado Pago y vuelve a tu link, y el dinero llega a tu cuenta de Mercado Pago. Sirve para el pago total, el anticipo, el saldo y las cuotas de una cotización, y para abonar a una factura. Lo que solo existe con Cord Payments es el SPEI con CLABE por cobro y las igualas mensuales con tarjeta. Si haces un reembolso desde Mercado Pago, Cord lo lee y lo registra en la cotización o la factura.',
            },
            {
                q: '¿Qué me pide el alta de Cord Payments?',
                a: 'Los datos de tu negocio, las personas que lo controlan —cada socio con 25% o más y quien lo dirige, con su papel real— y tu cuenta de depósito. Lo que se pide sale de lo que exige tu país: en España, Alemania o Reino Unido, por ejemplo, no se pide un número de identificación personal que allá no aplica. La foto de la identificación puedes tomarla con el celular escaneando un código QR, y Cord le quita la ubicación GPS antes de enviarla a verificar.',
            },
            {
                q: '¿Cuándo empiezo a recibir depósitos?',
                a: 'En cuanto tu cuenta queda verificada. Mientras falte algo, Cobros te dice cuántos requisitos quedan pendientes y la fecha límite, y los depósitos esperan. Cambiar la frecuencia de depósito o la cuenta bancaria pide confirmar tu identidad, porque decide a dónde y a qué ritmo sale tu dinero.',
            },
            {
                q: '¿Puedo devolver un pago?',
                a: 'Sí. Con Cord Payments reembolsas total o parcialmente un cobro desde Cobros, y se confirma tu identidad antes de mandarlo. Solo puede hacerlo quien tenga el permiso de Reembolsos, y ese permiso es aparte: ni el rol de Administrador lo trae de inicio. Con Mercado Pago, el reembolso se hace en tu cuenta de Mercado Pago y Cord lo registra solo.',
            },
        ],
        cta: { titulo: 'Activa el cobro antes de mandar la siguiente cotización.', sub: 'Cord Payments o Mercado Pago, desde Ajustes › Cobros. Gratis para empezar.' },
    },
    {
        slug: 'facturacion',
        nav: 'Cord Invoicing',
        eyebrow: 'CORD INVOICING',
        titulo: 'La factura deja de ser un PDF que mandas por correo.',
        sub: 'Cord emite la factura, le pone folio propio, la timbra donde hay que timbrarla, se la manda a tu cliente con su propio link de pago y te dice cuánto falta por cobrar. En México es CFDI 4.0 real ante el SAT; en el resto del mundo, factura comercial con tu marca y el tipo de cambio declarado.',
        metaTitle: 'Cord Invoicing: facturación en línea con link de pago y CFDI 4.0 — Cord',
        metaDescription: 'Emite facturas con folio propio, mándalas con su link de pago y sigue el saldo hasta que se cobren. CFDI 4.0 timbrado ante el SAT en México, factura comercial en el resto del mundo, en la divisa de la venta.',
        plan: 'Emisión de facturas desde el plan Starter — CFDI 4.0 en México y factura comercial en el resto; multi-divisa en todos los planes, incluido el gratuito',
        stats: [
            { valor: '5', countup: 5, label: 'estados del ciclo: borrador, emitida, pagada, anulada e incobrable' },
            { valor: '1', countup: 1, label: 'link por factura, con su saldo vivo y su propio cobro' },
            { valor: '4.0', label: 'versión del CFDI que Cord timbra real ante el SAT' },
        ],
        blocks: [
            {
                eyebrow: 'CICLO DE VIDA COMPLETO',
                titulo: 'Una factura no es un archivo. Es un estado.',
                copy: 'La armas como borrador y la revisas sin comprometer nada: el folio no se quema hasta que la emites. Al emitirla queda inmutable y timbrada. Cuando entra dinero, el saldo baja solo. Si te equivocaste antes de cobrar, se anula ante el proveedor fiscal; si ya cobraste, el camino correcto es una nota de crédito, y Cord no te deja confundirlos.',
                bullets: [
                    'Borrador editable que no consume folio ni timbre',
                    'Anulación real ante el SAT, no solo un cambio de color en pantalla',
                    'Nota de crédito cuando la factura ya tiene pagos aplicados',
                ],
            },
            {
                eyebrow: 'LINK DE PAGO POR FACTURA',
                titulo: 'Tu cliente abre la factura y la paga ahí mismo.',
                copy: 'Cada factura tiene su propia página con tu marca: los conceptos, el vencimiento, los pagos que ya entraron y el saldo que falta. Desde ahí se paga con tarjeta, directo a tu cuenta. Se descarga el PDF y, en México, el XML. Tú ves cuándo la abrió tu cliente — y solo cuando la abre tu cliente, no cuando revisas tu propio link.',
                bullets: [
                    'Página pública por factura, con tu logo y tu color',
                    'Cobro del saldo con tarjeta, a tu cuenta conectada',
                    'PDF siempre, XML timbrado en México',
                ],
            },
            {
                eyebrow: 'EL CARRIL CAMBIA POR PAÍS',
                titulo: 'México timbra ante el SAT. El resto factura con tu folio.',
                copy: 'Cuando el negocio es mexicano, Cord timbra CFDI 4.0 real a través de un PAC autorizado: UUID, XML y PDF válidos, bajo tu propio CSD. Fuera de México emite una factura comercial con folio consecutivo tuyo y tu marca — y lo dice así, sin fingir que la presentó ante una autoridad que todavía no está conectada. El flujo de trabajo es el mismo en los dos casos.',
                bullets: [
                    'CFDI 4.0 timbrado ante el SAT con el CSD de tu empresa',
                    'Factura comercial con folio consecutivo propio fuera de México',
                    'La factura se emite en la divisa de la venta, con el tipo de cambio declarado',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'DEL TRATO A LA FACTURA',
                titulo: 'Factura desde una cotización cerrada o desde cero, sin cambiar de herramienta.',
                copy: 'Si el trato ya vivía en Cord, la factura hereda cliente, líneas y divisa. Si no, la creas directo: es el caso más común de un negocio y no debería exigir inventarse una cotización.',
            },
            {
                eyebrow: 'EL SALDO SE ACTUALIZA SOLO',
                titulo: 'Dejas de preguntarte cuánto falta por cobrar de cada factura.',
                copy: 'Un pago con tarjeta desde el link, una transferencia que registras a mano: los dos bajan el saldo de la misma factura. Cuando llega a cero, se marca pagada y sale de la cartera vencida.',
            },
            {
                eyebrow: 'FACTURACIÓN POR API',
                titulo: 'Todo lo anterior también sirve sin abrir Cord.',
                copy: 'La API v1 crea borradores, emite, envía, registra pagos y anula. Los webhooks avisan cuando una factura se emite, se paga, falla el cobro o se vence.',
            },
        ],
        faqs: [
            {
                q: '¿Puedo emitir una factura sin haber hecho una cotización?',
                a: 'Sí. En Cord la factura es un objeto propio: entras a Facturas, eliges cliente, capturas los conceptos y la guardas como borrador. No necesitas una cotización previa. Si el trato sí venía de una cotización aprobada, la factura hereda cliente, líneas y divisa automáticamente y quedan ligadas.',
            },
            {
                q: '¿Cord timbra CFDI 4.0 real ante el SAT?',
                a: 'Sí, en México. Cord timbra CFDI 4.0 a través de un Proveedor Autorizado de Certificación, usando el Certificado de Sello Digital de tu propia empresa: el comprobante sale bajo tu RFC, con UUID, XML y PDF válidos ante el SAT. Subes tu CSD una vez en Ajustes y cada factura se timbra bajo tu cuenta, no bajo una cuenta compartida.',
            },
            {
                q: '¿Cómo cancelo una factura ya timbrada?',
                a: 'Desde el detalle de la factura, con el botón Anular. Cord manda la cancelación al SAT con tu propio certificado y solo la marca como anulada cuando el SAT la confirma; si el SAT la rechaza, te lo dice en vez de mostrarte una factura "cancelada" que sigue viva. Si la factura ya tiene pagos aplicados no se anula: Cord te pide emitir una nota de crédito, que es el documento correcto para ese caso.',
            },
            {
                q: '¿Qué es la página de factura y qué ve mi cliente ahí?',
                a: 'Es un link propio de cada factura, con tu logo y tu color. Tu cliente ve los conceptos, el total, la fecha de vencimiento, los pagos que ya entraron y el saldo que falta, y puede pagarlo con tarjeta en ese mismo momento; el dinero llega a tu cuenta conectada. También puede descargar el PDF y, en México, el XML timbrado.',
            },
            {
                q: '¿Puedo facturar en dólares si mi contabilidad está en pesos?',
                a: 'Sí. La factura se emite en la divisa de la venta —la que tu cliente aprobó y paga— y declara el tipo de cambio hacia tu divisa contable, que es exactamente lo que el SAT exige como TipoCambio. Cord toma la tasa de una fuente real y fechada. Si no puede obtener una tasa, la emisión falla con un mensaje claro en vez de inventarse un número: una factura con un tipo de cambio falso es un problema fiscal, no un detalle.',
            },
            {
                q: '¿Cord me avisa cuando una factura se vence?',
                a: 'Sí. Cada factura tiene su propia fecha de vencimiento, y Cord manda recordatorio al cliente antes y después de que llegue. En la bandeja ves cuánto tienes por cobrar, cuánto está vencido y cuántos días lleva cada factura. Los webhooks también disparan un evento cuando una factura se vence, se paga o falla su cobro.',
            },
            {
                q: '¿Puedo facturar desde mi propio sistema, sin entrar a Cord?',
                a: 'Sí. La API v1 expone facturas completas: crear borrador, emitir, enviar al cliente, registrar un pago, anular y emitir nota de crédito, además de consultarlas con su saldo. Los webhooks avisan de cada cambio de estado. Cord también expone un servidor MCP, así que un asistente de IA puede consultar tus facturas y preparar borradores.',
            },
            {
                q: '¿Qué pasa si mi negocio no está en México?',
                a: 'Cord emite una factura comercial con folio consecutivo propio, tus datos fiscales y tu marca, en la divisa de la venta. Es un documento comercial válido para cobrar y para tu contabilidad, y Cord lo dice tal cual: no afirma haberlo presentado ante la autoridad fiscal local, porque ese carril todavía no está conectado fuera de México. La arquitectura por país ya está construida para irlos sumando.',
            },
        ],
        cta: { titulo: 'Emite, manda y cobra. En un solo lugar.', sub: 'Factura con folio propio, mándala con su link de pago y mira cómo baja el saldo. Empieza gratis.' },
    },
    {
        slug: 'workflows',
        nav: 'Cord Workflows',
        eyebrow: 'CORD WORKFLOWS',
        titulo: 'El seguimiento de cada venta, en piloto automático.',
        sub: 'Reglas de "cuando pase esto, haz esto" que dan el siguiente paso por ti: una tarea cuando el cliente abre la cotización, un recordatorio antes de que venza la factura, un aviso en Slack cuando entra el anticipo. Sin escribir código.',
        metaTitle: 'Cord Workflows: automatiza ventas y cobranza sin código — Cord',
        metaDescription: 'Automatiza el seguimiento de cotizaciones y facturas: 44 eventos o un horario fijo disparan tareas, correos, WhatsApp, Slack, Teams y notas en HubSpot, con condiciones y esperas.',
        plan: 'Desde el plan Gratis: 1 workflow activo en Gratis, 5 en Starter y sin tope desde Profesional. Las ejecuciones no tienen tope',
        stats: [
            { valor: '44', countup: 44, label: 'eventos de Cord que pueden iniciar un workflow, además de un horario fijo' },
            { valor: '11', countup: 11, label: 'acciones: tareas, correo, WhatsApp, Slack, Teams, HubSpot y más' },
            { valor: '9', countup: 9, label: 'ideas listas para publicar, una por caso de uso real' },
        ],
        blocks: [
            {
                eyebrow: 'CUANDO PASE ESTO',
                titulo: 'Un evento real arranca el flujo, no un recordatorio en tu calendario.',
                copy: 'Un workflow vigila tu cuenta. Cuando el cliente abre una cotización, llega un anticipo, vence una factura o te abren un contracargo, se ejecuta solo. También puede correr a una hora fija —"cada lunes a las 9"— interpretada en la zona horaria de tu negocio, no en la del servidor.',
                bullets: [
                    '44 eventos de cotizaciones, pagos, facturas, clientes, productos y tareas',
                    'Horario fijo en la zona horaria de tu cuenta',
                    'Avisos de tiempo: cotización por vencer, factura por vencer y factura vencida',
                ],
            },
            {
                eyebrow: 'HAZ ESTO',
                titulo: 'Once acciones, de una tarea a una nota en HubSpot.',
                copy: 'Crea una tarea para la persona correcta, avisa al equipo por correo, escríbele al cliente con tu marca o mándale un WhatsApp con tu plantilla aprobada. Publica en Slack o en Teams, deja una nota en HubSpot o manda los datos a tu propia URL. Sobre el documento solo hace lo acotado: caducar una cotización vencida, aprobar una solicitud interna o anular una factura sin pagos.',
                bullets: [
                    'Correo y WhatsApp al cliente del documento, nunca a una dirección escrita a mano',
                    'Slack, Microsoft Teams y HubSpot desde el mismo editor',
                    'Los datos del evento viajan a tu propia URL por HTTPS',
                ],
            },
            {
                eyebrow: 'CONDICIONES, ESPERAS Y CONSULTAS',
                titulo: 'Espera a que el cliente decida. Y si no decide, insiste.',
                copy: 'Divide el flujo en dos ramas según los datos del evento, espera de 1 a 30 días o hasta que ocurra algo con un plazo máximo, y consulta un dato de tu cuenta —cartera vencida, pipeline abierto, saldo del cliente— antes de decidir. Antes de publicar, prueba el borrador contra el último evento real: las consultas corren y las acciones no.',
                bullets: [
                    'Ramas "si se cumple / si no se cumple", sin fórmulas',
                    'Espera condicionada: hasta que el cliente abra o apruebe, con plazo',
                    'Prueba sin publicar contra el último evento real',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'LA COTIZACIÓN QUE NADIE ABRIÓ',
                titulo: 'El seguimiento dejó de depender de que alguien se acuerde.',
                copy: 'La escalera de seguimiento espera dos días a que el cliente abra la cotización. Si la abre, crea la tarea de llamarle mientras está caliente; si no, le escribe por ti.',
            },
            {
                eyebrow: 'LA FACTURA QUE SE VENCIÓ EN SILENCIO',
                titulo: 'La cobranza empieza antes del vencimiento, no un mes después.',
                copy: 'Un recordatorio al cliente tres días antes, otro el día que vence y, si sigue sin pagarse, un aviso al dueño con el saldo que ya le deben.',
            },
            {
                eyebrow: 'NADA ES UNA CAJA NEGRA',
                titulo: 'Cada ejecución dice qué hizo, paso por paso.',
                copy: 'El historial muestra el estado de cada ejecución y el resultado de cada paso. El panel de salud agrupa las fallas de los últimos 30 días por causa, no por mensaje.',
            },
        ],
        faqs: [
            {
                q: '¿Necesito saber programar para usar Cord Workflows?',
                a: 'No. El editor se lee de arriba abajo en dos bloques, "Cuando pase esto" y "Haz esto", y cada paso se elige de una lista. Además Cord trae 9 ideas listas para usar —como la escalera de seguimiento de una cotización o la cobranza escalonada de una factura vencida— que puedes publicar tal cual o adaptar.',
            },
            {
                q: '¿Qué puede iniciar un workflow?',
                a: 'Cualquiera de los 44 eventos de Cord —cotizaciones enviadas, vistas, aprobadas o pagadas; anticipos y pagos fallidos; facturas emitidas, por vencer o vencidas; contracargos, reembolsos y depósitos; clientes, productos y tareas— o un horario fijo, como "cada lunes a las 9", en la zona horaria de tu negocio. Cada workflow tiene exactamente un disparador.',
            },
            {
                q: '¿Un workflow puede cobrar o emitir facturas por mí?',
                a: 'No. Un workflow no cobra, no emite facturas ni CFDI, no registra pagos y no aprueba ni rechaza una cotización en nombre de tu cliente: esas decisiones siguen siendo de una persona o del cliente. Lo que sí hace sobre tus documentos es acotado y explícito: escribirle al cliente del documento, caducar una cotización que ya pasó su vigencia, aprobar una solicitud de aprobación interna y anular una factura que todavía no tiene pagos.',
            },
            {
                q: '¿Cuántos workflows puedo tener en cada plan?',
                a: 'El plan Gratis permite 1 workflow activo, Starter 5 y desde Profesional no hay tope. Solo cuentan los activos: los borradores y los pausados no ocupan lugar. Las ejecuciones tampoco tienen tope; un workflow activo corre cada vez que ocurre su evento.',
            },
            {
                q: '¿Qué pasa con las ejecuciones en curso si cambio un workflow?',
                a: 'Terminan con la versión con la que empezaron. Lo que editas es un borrador y solo cambia lo que corre cuando pulsas Publicar; cada ejecución nueva toma una copia de la versión publicada en ese momento.',
            },
            {
                q: '¿Un workflow puede dispararse a sí mismo sin fin?',
                a: 'No. Un workflow nunca se dispara con los eventos que él mismo provoca, y una cadena de workflows que se disparan entre sí se corta después de tres niveles.',
            },
            {
                q: '¿Con qué herramientas se conecta?',
                a: 'Las acciones publican en Slack y Microsoft Teams, dejan notas en HubSpot y mandan WhatsApp con tu cuenta de WhatsApp Business. Para llevar los eventos de Cord a cualquier otra app están Zapier, Make y n8n, o una acción que manda los datos a tu propia URL.',
            },
        ],
        cta: { titulo: 'Deja que el siguiente paso se dé solo.', sub: 'Publica tu primer workflow desde una de las 9 ideas listas. Gratis para empezar.' },
    },
    {
        slug: 'finanzas',
        nav: 'Finanzas y flujo de caja',
        eyebrow: 'FINANZAS Y FLUJO DE CAJA',
        titulo: 'Tus próximos 90 días de caja, semana por semana.',
        sub: 'Cord proyecta tu flujo con tres fuentes separadas —lo que ya te deben, lo que probablemente cierres y tus igualas— y fecha cada monto con el historial real de pago de cada cliente. Sin fórmulas que mantener y sin confundir certeza con probabilidad.',
        metaTitle: 'Flujo de caja a 90 días, DSO y concentración de riesgo — Cord',
        metaDescription: 'Proyección semanal de flujo de caja a 90 días que separa cartera, pipeline ponderado e igualas, con DSO, concentración de riesgo, MRR y rentabilidad por nivel de cliente. Desde el plan Profesional.',
        plan: 'Plan Profesional en adelante',
        stats: [
            { valor: '90', countup: 90, suffix: ' días', label: 'de proyección, repartidos en 13 semanas' },
            { valor: '3', countup: 3, label: 'fuentes separadas: cartera, pipeline ponderado e igualas' },
            { valor: '4', countup: 4, label: 'indicadores de salud en tu inicio: DSO, concentración, margen cedido e ingreso esperado' },
        ],
        blocks: [
            {
                eyebrow: 'FLUJO A 90 DÍAS',
                titulo: 'Tres fuentes, nunca revueltas.',
                copy: 'La proyección separa lo que ya te deben por cotizaciones aprobadas, lo que probablemente cierres de tu pipeline y el cobro mensual de tus igualas. Cada fuente lleva su color, semana por semana durante 13 semanas, y la curva acumulada te dice cuánto habrá entrado a cada fecha.',
                bullets: [
                    'Cartera, pipeline ponderado e igualas, por separado',
                    'Flujo semanal de 13 semanas y curva acumulada de caja',
                    'Calculado al día de hoy, sin armar fórmulas',
                ],
            },
            {
                eyebrow: 'PROBABILIDAD REAL',
                titulo: 'Cada cotización abierta pesa lo que ese cliente suele cerrar.',
                copy: 'Una propuesta para un cliente que te aprueba siete de cada diez no vale lo mismo que una para quien casi nunca cierra. Cord pondera cada cotización abierta con la tasa de cierre histórica de su cliente y la ubica en el calendario con los días que ese cliente tarda en cerrar y en pagar. El pipeline ponderado por cliente te muestra quién sostiene tus próximas semanas.',
                bullets: [
                    'Probabilidad por cliente, a partir de sus cierres reales',
                    'Fecha esperada: sus días a cierre más sus días a cobro',
                    'Supuestos prudentes para clientes sin historial',
                ],
            },
            {
                eyebrow: 'MRR Y RENTABILIDAD',
                titulo: 'Lo recurrente, lo que está en riesgo y lo que te dejan tus descuentos.',
                copy: 'El informe de Finanzas suma el MRR contratado de tus igualas y lo anualiza, y aparta el MRR en riesgo: igualas con un cobro fallido o programadas para cancelarse. También cruza cada nivel de cliente con su descuento, su tasa de cierre y lo que realmente te compra.',
                bullets: [
                    'MRR contratado y ARR',
                    'MRR en riesgo: cobros fallidos y cancelaciones programadas',
                    'Rentabilidad por nivel: descuento, cierre y valor cerrado',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'EL CONTRATO CONTRA LA REALIDAD',
                titulo: 'Tu cliente firmó Net 30 y paga el día 44. La proyección usa el 44.',
                copy: 'Lo que ya te deben no se proyecta a la fecha del contrato, sino al vencimiento más el retraso promedio real de ese cliente. Si todavía no tiene historial de pago, se usa el retraso promedio de toda tu cartera.',
            },
            {
                eyebrow: 'EL RIESGO QUE NO SE VE EN EL SALDO',
                titulo: 'Si un solo cliente sostiene la mitad de tu pipeline, lo ves en tu inicio.',
                copy: 'El widget de salud del pipeline marca en verde, ámbar o rojo tus días promedio de cobro y el peso de tu cliente más grande. El informe de flujo mide además cuánto depende de ese cliente lo que esperas cobrar en los próximos 30 días.',
            },
            {
                eyebrow: 'NADA SE PIERDE',
                titulo: 'Lo que no cae en 90 días no desaparece: se muestra aparte.',
                copy: 'Una cotización que cerraría el día 120 o un cobro de iguala después del horizonte quedan en "Fuera del horizonte", con su monto y cuántos movimientos son. Las 13 semanas más ese renglón suman exactamente lo que entró a la proyección.',
            },
        ],
        faqs: [
            {
                q: '¿La proyección usa inteligencia artificial?',
                a: 'No. Es estadística sobre tu propio historial: tasa de cierre, días a cierre y días a cobro reales de cada cliente. Cuando un cliente no tiene historial, Cord usa supuestos prudentes —25% de probabilidad de cierre, 50% si ya abrió la cotización, 14 días para cerrar y 30 para pagar— en lugar de inventarle un comportamiento.',
            },
            {
                q: '¿Dónde veo estos números?',
                a: 'En Informes › Flujo de caja · 90 días y en Informes › Finanzas, calculados al día de hoy, y en tu inicio con los widgets de Salud del pipeline y Flujo esperado. Cada persona acomoda, oculta o cambia de tamaño sus widgets sin mover los de los demás.',
            },
            {
                q: '¿Quién puede verlos?',
                a: 'Quien tenga el permiso de Informes; el dueño siempre lo tiene. El rol Vendedor lo trae de inicio, así que si prefieres que los números de dirección los vea solo quien corresponde, ajústalo en Ajustes › Equipo y Roles; invitar a tu equipo está desde Profesional. El informe de Cobranza y cartera pide además el permiso de Cobranza.',
            },
            {
                q: '¿Qué incluye cada plan?',
                a: 'El flujo a 90 días y el informe de Finanzas están desde Profesional. En Starter ya tienes el pronóstico del pipeline y el margen cedido, y en Gratis la tasa de cierre, el embudo y tus mejores clientes y productos.',
            },
        ],
        cta: { titulo: 'Decide con la caja que viene, no con la que ya pasó.', sub: 'El flujo a 90 días está en el plan Profesional. Empieza gratis y sube cuando lo necesites.' },
    },
    {
        slug: 'aprobaciones',
        nav: 'Control de márgenes',
        eyebrow: 'CONTROL DE MÁRGENES Y APROBACIONES',
        titulo: 'Vende rápido, pero con el margen correcto.',
        sub: 'Define umbrales de descuento por rol. Si un vendedor da un descuento mayor al permitido, la cotización se pausa y pide aprobación gerencial. Tú cuidas el margen, ellos cierran la venta.',
        metaTitle: 'Control de márgenes y flujo de aprobaciones para ventas — Cord',
        metaDescription: 'Configura umbrales de descuento y flujos de aprobación gerencial para asegurar la rentabilidad de cada cotización en tu equipo de ventas.',
        plan: 'Plan Profesional en adelante',
        stats: [
            { valor: '100', countup: 100, suffix: '%', label: 'de cotizaciones pasan por validación de margen' },
            { valor: '1', countup: 1, suffix: ' clic', label: 'para aprobar o rechazar desde el celular' },
            { valor: '0', countup: 0, label: 'sorpresas a fin de mes por descuentos excesivos' },
        ],
        blocks: [
            {
                eyebrow: 'UMBRALES AUTOMÁTICOS',
                titulo: 'Reglas claras para todo el equipo.',
                copy: 'Establece que los vendedores pueden dar hasta un 10% de descuento. Todo lo que esté por debajo de eso sale directo al cliente; lo que lo supere, requiere un clic tuyo.',
                bullets: [
                    'Umbrales de descuento configurables por rol',
                    'Validación silenciosa en tiempo real',
                    'Bloqueo automático de envíos no autorizados',
                ],
            },
            {
                eyebrow: 'FLUJO GERENCIAL',
                titulo: 'Auditor silencioso.',
                copy: 'Cuando una cotización requiere aprobación, recibes una notificación al instante. Puedes ver qué tanto cedió el vendedor y aprobar o pedir ajustes desde cualquier lugar.',
                bullets: [
                    'Notificaciones push o por correo',
                    'Aprobación con un clic en el móvil',
                    'Chat interno en la cotización para ajustes',
                ],
            },
            {
                eyebrow: 'LOG INMUTABLE',
                titulo: 'Todo queda registrado.',
                copy: 'El timeline de la cotización guarda quién pidió la aprobación, quién la otorgó y a qué hora. Cero dudas sobre por qué un precio salió más bajo de lo normal.',
                bullets: [
                    'Historial completo de aprobaciones',
                    'Auditoría de márgenes',
                    'Responsabilidad clara por cada descuento',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'EL DESCUENTO QUE NADIE AUTORIZÓ',
                titulo: 'Un vendedor apurado por cerrar puede regalar tu margen sin querer.',
                copy: 'Define hasta dónde puede llegar un descuento antes de que se necesite tu aprobación. La velocidad de ventas ya no compite con la rentabilidad.',
            },
            {
                eyebrow: 'APRUEBA DESDE DONDE ESTÉS',
                titulo: 'Un clic desde el celular, y la venta sigue su curso.',
                copy: 'Cuando una cotización rebasa el umbral, te llega la notificación al instante — con el margen exacto que se está cediendo. Aprobar o pedir ajustes toma segundos, no una junta.',
            },
            {
                eyebrow: 'AUDITORÍA SILENCIOSA',
                titulo: 'Cada excepción queda registrada, aunque nadie la esté viendo en el momento.',
                copy: 'Quién pidió el descuento, quién lo aprobó y por qué — el log inmutable responde la pregunta antes de que alguien tenga que hacerla.',
            },
        ],
        faqs: [
            {
                q: '¿Puedo tener diferentes umbrales por vendedor?',
                a: 'Sí. Puedes definir reglas generales o ajustar los umbrales de descuento permitidos según la jerarquía (ej. Vendedor Junior 5%, Vendedor Senior 15%).',
            },
            {
                q: '¿Cómo apruebo una cotización que excedió el margen?',
                a: 'Recibes una notificación instantánea. Al abrirla, ves el resumen de la rentabilidad y dos botones: Aprobar o Rechazar. Si la apruebas, el vendedor ya puede enviarla.',
            },
            {
                q: '¿El cliente se entera del proceso de aprobación?',
                a: 'No. El flujo es completamente interno. Para el cliente, la cotización simplemente llega una vez que el equipo comercial la ha liberado.',
            },
        ],
        cta: { titulo: 'Deja de perder margen por error.', sub: 'Protege tu rentabilidad en cada cotización con el plan Profesional.' },
    },
    {
        slug: 'equipo',
        nav: 'Roles y equipo',
        eyebrow: 'EQUIPO, ROLES Y MULTI-EMPRESA',
        titulo: 'Todo tu equipo, trabajando en sincronía.',
        sub: 'Invita a tus vendedores, administradores y contadores con permisos granulares. Gestiona múltiples razones sociales o marcas desde una misma cuenta maestra.',
        metaTitle: 'Gestión de equipo, roles y multi-empresa — Cord',
        metaDescription: 'Administra tu equipo de ventas con permisos granulares y gestiona múltiples empresas o razones sociales desde una sola cuenta de Cord.',
        plan: 'Disponible desde el plan Starter (Multi-empresa requiere Profesional)',
        stats: [
            { valor: '5', countup: 5, label: 'niveles de permisos granulares' },
            { valor: '100', countup: 100, suffix: '%', label: 'de las acciones quedan en la bitácora de auditoría' },
            { valor: 'SSO', label: 'inicio de sesión seguro corporativo' },
        ],
        blocks: [
            {
                eyebrow: 'PERMISOS DE ACCESO',
                titulo: 'Cada quien ve solo lo que le toca.',
                copy: 'El vendedor solo ve sus propios clientes y cotizaciones. El gerente de ventas ve el pipeline de todos. El contador entra solo a descargar los CFDI. Seguridad total por diseño.',
                bullets: [
                    'Roles predefinidos (Admin, Gerente, Vendedor, Contador)',
                    'Privacidad total entre carteras de vendedores',
                    'Bloqueo de exportación o borrado',
                ],
            },
            {
                eyebrow: 'MULTI-EMPRESA',
                titulo: 'Varias razones sociales, un solo panel.',
                copy: 'Si tu corporativo opera con varias marcas o razones sociales fiscales, no necesitas cuentas separadas. Cambia de empresa con un clic, comparte el catálogo si quieres y mantén la cobranza organizada.',
                bullets: [
                    'Cambio rápido de empresa (Org switching)',
                    'Logo, colores y sellos fiscales aislados',
                    'Reportes consolidados o individuales',
                ],
            },
            {
                eyebrow: 'SSO Y SEGURIDAD',
                titulo: 'Accesos de grado empresarial.',
                copy: 'Tu equipo inicia sesión con las credenciales de Google o Microsoft de tu dominio. Si alguien deja la empresa, le cortas el correo y pierde acceso a Cord de inmediato.',
                bullets: [
                    'Single Sign-On (SSO) con proveedores estándar',
                    'Autenticación robusta',
                    'Bitácora de sesión y auditoría de accesos',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'CADA QUIEN VE LO QUE LE TOCA',
                titulo: 'La seguridad no debería ser un favor que le pides a tu vendedor.',
                copy: 'El vendedor solo ve su cartera. El gerente ve el pipeline completo. El contador solo entra por los CFDI. Nadie tiene acceso a más de lo que necesita, por diseño.',
            },
            {
                eyebrow: 'CRECE SIN MULTIPLICAR CUENTAS',
                titulo: 'Varias razones sociales, un solo panel de control.',
                copy: 'Cambia de empresa con un clic en vez de manejar contraseñas distintas para cada marca del corporativo. Catálogo, cobranza y reportes se mantienen organizados por separado.',
            },
            {
                eyebrow: 'SEGURIDAD DE NIVEL EMPRESARIAL',
                titulo: 'Cuando alguien deja la empresa, se le va el acceso el mismo día.',
                copy: 'Inicio de sesión con las credenciales corporativas de tu equipo. Cortas el correo, se corta Cord — sin tickets, sin esperar a que alguien se acuerde de revocar el acceso.',
            },
        ],
        faqs: [
            {
                q: '¿Puede un vendedor ver los clientes de otro vendedor?',
                a: 'Por defecto no. El rol de "Vendedor" restringe la vista únicamente a su propia cartera y sus propias cotizaciones. Solo los gerentes y administradores tienen visión global.',
            },
            {
                q: '¿Cómo funciona la característica multi-empresa?',
                a: 'Puedes crear múltiples Organizaciones bajo tu misma cuenta de usuario. Cada organización tiene su propio RFC, logotipo, certificado de sellos y clientes. Puedes invitar usuarios a una empresa sí y a otra no.',
            },
            {
                q: '¿Qué es SSO y por qué es más seguro?',
                a: 'Single Sign-On (SSO) permite a tus empleados iniciar sesión usando el sistema de identidades de tu empresa (ej. Google Workspace). Así no tienen que recordar contraseñas nuevas y centralizas el control de acceso.',
            },
        ],
        cta: { titulo: 'Trae a tu equipo a bordo.', sub: 'Empieza a colaborar y a estandarizar tu proceso hoy mismo.' },
    },
    {
        slug: 'negociacion',
        nav: 'Negociación',
        eyebrow: 'NEGOCIACIÓN Y APROBACIONES',
        titulo: 'Acuerdos blindados, línea por línea.',
        sub: 'Tus clientes pueden revisar, ajustar cantidades o proponer un nuevo precio en productos específicos. Cada cambio genera una versión inmutable firmada criptográficamente — adiós a los malentendidos.',
        metaTitle: 'Negociación de cotizaciones con firma digital — Cord',
        metaDescription: 'Permite a tus clientes aprobar o contraofertar línea por línea. Cada versión es inmutable y se firma con SHA-256 para total transparencia.',
        plan: 'Disponible desde el plan Pro',
        stats: [
            { valor: '100', countup: 100, suffix: '%', label: 'trazabilidad en cada versión' },
            { valor: '0', countup: 0, label: 'malentendidos sobre el precio final' },
            { valor: 'SHA-256', label: 'firma criptográfica por documento' },
        ],
        blocks: [
            {
                eyebrow: 'APROBACIÓN POR LÍNEA',
                titulo: 'Negociación quirúrgica.',
                copy: 'El cliente no rechaza toda la cotización si un solo precio no le cuadra. Puede aprobar 9 artículos y hacer una contraoferta solo en 1. Tú decides si aceptas, rechazas o haces una contrapropuesta, manteniendo la venta viva.',
                bullets: [
                    'Aprobación y contraoferta a nivel de línea',
                    'Ajuste de cantidades sugerido por el cliente',
                    'Flujo de chat integrado para discutir el acuerdo',
                ],
            },
            {
                eyebrow: 'VERSIONES INMUTABLES',
                titulo: 'El historial que no miente.',
                copy: 'Cada vez que la cotización cambia de estado (enviada, contraoferta, aprobada), Cord genera un snapshot inmutable. Si el cliente dice "yo aprobé otra cosa", tienes el registro exacto de quién, cuándo y qué aprobó.',
                bullets: [
                    'Historial visual de versiones (v1, v2, v3...)',
                    'Comparativa rápida de cambios entre versiones',
                    'Restauración a una versión anterior con un clic',
                ],
            },
            {
                eyebrow: 'FIRMA CRIPTOGRÁFICA',
                titulo: 'Seguridad de grado bancario.',
                copy: 'La versión final aprobada se sella con un hash SHA-256. Esto garantiza que ni una sola coma del documento puede ser alterada después de la aprobación sin romper la firma matemática.',
                bullets: [
                    'Firma SHA-256 inyectada en el PDF final',
                    'Auditoría matemática independiente',
                    'Certeza jurídica en el acuerdo comercial',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'EL RECHAZO TOTAL, EVITADO',
                titulo: 'Que un solo precio no te cueste toda la venta.',
                copy: 'Tu cliente aprueba 9 líneas y objeta solo 1 — no rechaza las 10. La negociación se vuelve quirúrgica en vez de todo-o-nada.',
            },
            {
                eyebrow: 'EL "YO NUNCA APROBÉ ESO"',
                titulo: 'Cada versión queda congelada. Nadie puede reescribir la historia.',
                copy: 'Si el cliente dice que aprobó otra cosa, tienes el registro exacto: qué, cuándo y quién. La memoria ya no depende de un correo perdido.',
            },
            {
                eyebrow: 'CERTEZA DE GRADO BANCARIO',
                titulo: 'Una firma que ni tú puedes alterar después.',
                copy: 'El hash SHA-256 sella la versión final aprobada. Ni una coma se puede tocar sin que la firma matemática lo delate.',
            },
        ],
        faqs: [
            {
                q: '¿Qué significa que la cotización tiene versiones inmutables?',
                a: 'Significa que cada que hay una negociación, en lugar de sobreescribir el documento original, se crea una nueva versión. Todas las versiones anteriores quedan guardadas permanentemente y no pueden ser modificadas, sirviendo como evidencia del proceso de venta.',
            },
            {
                q: '¿Cómo funciona la firma SHA-256?',
                a: 'Es un algoritmo criptográfico que toma el contenido exacto de la cotización aprobada y genera un código único. Si alguien intentara cambiar un precio o cantidad después de aprobado, el código cambiaría por completo, evidenciando la manipulación.',
            },
            {
                q: '¿El cliente necesita una cuenta para negociar?',
                a: 'No. El cliente accede a través del link público seguro, verifica su identidad con un código OTP enviado a su correo (opcional), y puede comentar, aprobar o contraofertar directamente desde su navegador.',
            },
        ],
        cta: { titulo: 'Cierra acuerdos con total transparencia.', sub: 'Evita los "yo te dije" y formaliza tus ventas.' },
    },

];

export const findFeature = (slug: string) => FEATURES.find(f => f.slug === slug);
