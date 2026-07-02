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
    titulo: string;      // admite     copy: string;
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
    titulo: string;          // H1, admite     sub: string;
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
        titulo: 'La cotización perfecta, en minutos.',
        sub: 'Arrastra productos de tu catálogo, negocia el precio línea por línea y mira el total recalcularse con IVA en vivo. Lo que antes era una hora en Excel, ahora son minutos.',
        metaTitle: 'Cómo hacer cotizaciones B2B con precios negociados en México — Cord',
        metaDescription: 'El editor de cotizaciones de Cord permite negociar el precio de cada producto por separado, aplicar términos Net 30/60, calcular IVA en tiempo real y generar un link de aprobación con tu marca. Para distribuidores y mayoristas en México.',
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
        titulo: 'Tu cliente aprueba en un clic.',
        sub: 'Cada cotización genera un link elegante con tu marca. Tu cliente lo abre desde el celular, revisa los precios y aprueba — sin crear cuenta, sin descargar nada, sin fricción.',
        metaTitle: 'Aprobación de cotizaciones B2B por link sin registro — Cord',
        metaDescription: 'El link público de Cord genera una página con tu marca (logo, colores y datos fiscales) donde tu cliente revisa la cotización y aprueba en un clic, sin crear cuenta ni descargar nada. Para cualquier negocio B2B en México.',
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
                    'Pago en línea con Stripe (plan Profesional)',
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
        sub: 'Se acabó el "¿ya la revisaste?". Cord te avisa en cuanto tu cliente abre la cotización, cuántas veces la ha visto y qué hizo después — para que llames en el momento justo.',
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
        slug: 'cfdi',
        nav: 'CFDI 4.0',
        eyebrow: 'FACTURACIÓN CFDI 4.0',
        titulo: 'De cotización aprobada a factura timbrada.',
        sub: 'Cuando el trato se cierra, la factura sale sola: CFDI 4.0 real, timbrado ante el SAT, directo desde la cotización. Sin recapturar en otro portal, sin errores de transcripción.',
        metaTitle: 'CFDI 4.0 automático desde la cotización aprobada — Cord',
        metaDescription: 'Cord timbra el CFDI 4.0 automáticamente ante el SAT en cuanto se aprueba la cotización, sin recapturar datos en otro portal. Facturación electrónica real para cualquier negocio B2B en México.',
        plan: 'Disponible desde el plan Starter',
        stats: [
            { valor: '1', countup: 1, suffix: ' clic', label: 'de la cotización aprobada al CFDI' },
            { valor: '0', countup: 0, label: 'capturas dobles — los datos viajan solos' },
            { valor: '5', countup: 5, suffix: ' min', label: 'para conectar tu CSD la primera vez' },
        ],
        blocks: [
            {
                eyebrow: 'SIN RECAPTURAR',
                titulo: 'Los datos ya están. Úsalos.',
                copy: 'La cotización ya tiene los productos, las cantidades, los precios negociados y el RFC del cliente. Timbrar es un clic: Cord arma el CFDI 4.0 con esos mismos datos y lo manda al PAC. Cero transcripción, cero errores de dedo.',
                bullets: [
                    'CFDI 4.0 con los datos exactos de la cotización',
                    'RFC y datos fiscales del cliente guardados en su ficha',
                    'UUID, XML y PDF disponibles al instante',
                ],
            },
            {
                eyebrow: 'TU CSD, SEGURO',
                titulo: 'Conecta tu sello una vez y olvídate.',
                copy: 'Subes tu Certificado de Sello Digital (CSD) una sola vez, protegido y aislado en tu cuenta. A partir de ahí, cada timbrado usa tu sello sin que vuelvas a tocar archivos .cer y .key.',
                bullets: [
                    'CSD cifrado y aislado por negocio',
                    'Timbrado con PAC autorizado por el SAT',
                    'Solo para México — como debe ser',
                ],
            },
            {
                eyebrow: 'CICLO COMPLETO',
                titulo: 'La cotización, el pago y la factura: un solo hilo.',
                copy: 'La factura no vive en otro sistema: queda ligada a su cotización, con su evento en el timeline. Cuando contabilidad pregunte, todo está en el mismo lugar — quién aprobó, cuándo pagó y qué UUID le tocó.',
                bullets: [
                    'Factura ligada a su cotización y su timeline',
                    'Estado "facturada" visible en tu pipeline',
                    'Historial listo para conciliar',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'EL RIESGO DE RECAPTURAR',
                titulo: 'Cada vez que vuelves a escribir un dato, hay una oportunidad de error fiscal.',
                copy: 'El RFC, los productos, los montos — ya están en la cotización aprobada. Cord los usa tal cual para timbrar el CFDI. Cero transcripción, cero multas por un dedo torcido.',
            },
            {
                eyebrow: '5 MINUTOS, UNA SOLA VEZ',
                titulo: 'Conecta tu sello digital hoy. No lo vuelvas a tocar.',
                copy: 'Subes tu CSD una vez, cifrado y aislado en tu cuenta. A partir de ahí, cada cotización aprobada se convierte en factura con un clic — no con una cita en la agenda de tu contador.',
            },
            {
                eyebrow: 'TODO EN UN SOLO HILO',
                titulo: 'Cuando contabilidad pregunte, todo está en el mismo lugar.',
                copy: 'La factura queda ligada a su cotización, con su UUID y su timeline completo. Nada de buscar en dos sistemas distintos para reconciliar quién pagó qué.',
            },
        ],
        faqs: [
            {
                q: '¿Cómo timbra el CFDI automáticamente Cord?',
                a: 'Cuando el cliente aprueba una cotización en Cord, el sistema arma el CFDI 4.0 con los datos exactos de la cotización: productos, cantidades, precios, RFC del cliente y datos fiscales del emisor. Lo envía al PAC autorizado y devuelve el UUID, XML y PDF timbrado ante el SAT. Todo sin salir de Cord ni recapturar datos en otro portal.',
            },
            {
                q: '¿Qué necesito para activar el CFDI en Cord?',
                a: 'Solo se necesita el Certificado de Sello Digital (CSD) del SAT: los archivos .cer y .key con su contraseña. Se cargan una sola vez en la sección de ajustes de Cord y quedan cifrados y aislados en la cuenta. El proceso tarda menos de 5 minutos. Disponible para negocios con RFC en México desde el plan Starter.',
            },
            {
                q: '¿El CFDI de Cord es válido ante el SAT?',
                a: 'Sí. Cord timbra CFDI 4.0 real a través de un Proveedor Autorizado de Certificación (PAC) autorizado por el SAT. El comprobante generado tiene UUID válido, incluye el sello digital del emisor y cumple con la versión 4.0 del estándar del Comprobante Fiscal Digital por Internet vigente en México.',
            },
        ],
        cta: { titulo: 'Factura sin salir del trato.', sub: 'CFDI 4.0 automático desde el plan Starter.' },
    },
    {
        slug: 'clientes-credito',
        nav: 'Clientes y crédito',
        eyebrow: 'CLIENTES Y CRÉDITO',
        titulo: 'El crédito es tu ventaja. Contrólalo.',
        sub: 'En B2B vender a crédito es vender más — si lo controlas. Cord guarda los términos de cada cliente (Contado, Net 30, Net 60) y su límite de crédito, y los aplica solos en cada cotización.',
        metaTitle: 'Gestión de crédito B2B: Net 30, Net 60 y límite por cliente — Cord',
        metaDescription: 'Cord guarda los términos de crédito de cada cliente (Contado, Net 30, Net 60) y su límite, y los aplica automáticamente en cada cotización — para vender a crédito sin perder el control de tu cartera.',
        plan: 'Plan Profesional en adelante',
        stats: [
            { valor: '3', countup: 3, label: 'términos por cliente: Contado, Net 30, Net 60' },
            { valor: '100', countup: 100, suffix: '%', label: 'de tus cotizaciones respetan el límite asignado' },
            { valor: '1', countup: 1, label: 'ficha por cliente con todo su historial' },
        ],
        blocks: [
            {
                eyebrow: 'DIRECTORIO',
                titulo: 'Cada cliente, una ficha que lo dice todo.',
                copy: 'Empresa, contacto, correo, RFC, términos de pago y límite de crédito — la ficha del cliente concentra lo que tu equipo necesita para cotizarle bien. Y como vive en el sistema, todos cotizan con las mismas reglas.',
                bullets: [
                    'Datos fiscales listos para el CFDI',
                    'Términos default que se aplican solos al cotizar',
                    'Historial de cotizaciones por cliente',
                ],
            },
            {
                eyebrow: 'LÍMITE DE CRÉDITO',
                titulo: 'Di que sí con confianza (y que no, a tiempo).',
                copy: 'Asigna un límite de crédito por cliente y deja que el sistema lo vigile. Antes de mandar una cotización a crédito sabes cuánto espacio le queda al cliente — el "se nos pasó" deja de existir.',
                bullets: [
                    'Límite en pesos por cliente',
                    'Visibilidad de exposición antes de aprobar crédito',
                    'Net 30/60 con vencimientos claros',
                ],
            },
            {
                eyebrow: 'RELACIÓN',
                titulo: 'Los buenos clientes se notan en los datos.',
                copy: 'Quién aprueba rápido, quién paga a tiempo, quién pide y nunca cierra. Con el historial concentrado, decides a quién darle mejores precios y a quién pedirle anticipo — con evidencia, no con memoria.',
                bullets: [
                    'Cotizaciones, aprobaciones y pagos por cliente',
                    'Mejores decisiones de precio y crédito',
                    'La memoria comercial deja de vivir en una sola persona',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'EL "SE NOS PASÓ" YA NO EXISTE',
                titulo: 'Sabes cuánto crédito le queda a cada cliente antes de decir que sí.',
                copy: 'Asigna un límite por cliente y deja que el sistema lo vigile. Vender a crédito deja de ser un acto de fe.',
            },
            {
                eyebrow: 'MISMAS REGLAS PARA TODOS',
                titulo: 'Que ningún vendedor invente sus propios términos.',
                copy: 'Contado, Net 30 o Net 60 — la ficha del cliente los aplica sola en cada cotización. El negocio decide las reglas, no la memoria de cada vendedor.',
            },
            {
                eyebrow: 'LA MEMORIA COMERCIAL, EN DATOS',
                titulo: 'Quién paga a tiempo se nota. Quién no, también.',
                copy: 'El historial completo por cliente te dice a quién darle mejor precio y a quién pedirle anticipo — con evidencia, no con la opinión de un solo vendedor que puede irse mañana.',
            },
        ],
        faqs: [
            {
                q: '¿Cómo gestiona Cord los términos de crédito Net 30 y Net 60?',
                a: 'En Cord, cada cliente tiene configurados sus términos de crédito por defecto (Contado, Net 30 o Net 60). Al crear una cotización para ese cliente, los términos se aplican automáticamente sin necesidad de recordarlos o escribirlos cada vez. El cliente y el vendedor ven los términos claramente en el link de aprobación.',
            },
            {
                q: '¿Cord permite asignar un límite de crédito por cliente?',
                a: 'Sí. Cord permite definir un límite de crédito en pesos para cada cliente. Antes de enviar una cotización a crédito, el vendedor puede ver cuánto crédito disponible le queda al cliente versus el monto total expuesto. Disponible en el plan Profesional en adelante.',
            },
            {
                q: '¿Cord guarda el historial de cotizaciones por cliente?',
                a: 'Sí. Cada ficha de cliente en Cord concentra todas las cotizaciones enviadas, las aprobadas, los pagos y los CFDI generados. El historial permite identificar qué clientes aprueban rápido, quiénes pagan a tiempo y quiénes solicitan cotizaciones sin cerrarlas, para tomar mejores decisiones de precio y crédito.',
            },
        ],
        cta: { titulo: 'Conoce a tus clientes por sus números.', sub: 'Empieza gratis y carga tu directorio en minutos.' },
    },
    {
        slug: 'cobranza-ia',
        nav: 'Cobranza con IA',
        eyebrow: 'COBRANZA AUTÓNOMA CON IA',
        titulo: 'Tu cobranza trabaja sola, hasta de noche.',
        sub: 'Un agente de inteligencia artificial da seguimiento a cada factura vencida por ti: le escribe al cliente, negocia un plan de pagos en cuotas y te avisa solo cuando necesita tu visto bueno. Tú apruebas, la IA persigue — sin que se te enfríe la cartera.',
        metaTitle: 'Cobranza automática con IA para empresas B2B en México — Cord',
        metaDescription: 'El agente de cobranza con IA de Cord da seguimiento a las facturas vencidas, negocia planes de pago de hasta 3 cuotas mensuales y proyecta tu flujo de caja a 90 días. Tú apruebas cada acuerdo; queda todo en bitácora. Para negocios B2B en México.',
        plan: 'Plan Scale en adelante',
        stats: [
            { valor: '24/7', label: 'el agente da seguimiento sin descanso ni olvidos' },
            { valor: '3', countup: 3, label: 'cuotas mensuales que puede negociar por sí solo' },
            { valor: '90', countup: 90, suffix: ' días', label: 'de flujo de caja proyectado con IA' },
        ],
        blocks: [
            {
                eyebrow: 'AGENTE AUTÓNOMO',
                titulo: 'No es un recordatorio. Es un cobrador que negocia.',
                copy: 'Activas la cobranza autónoma por cliente y el agente toma la cartera vencida: contacta por correo, lee la respuesta y propone un plan de pagos de hasta tres cuotas mensuales. Si el cliente acepta dentro de los límites que tú definiste, cierra el acuerdo; si pide algo fuera de rango, te lo escala. Trabaja de noche y en fin de semana — la cartera no se enfría esperando a que alguien marque.',
                bullets: [
                    'Contacta por correo y entiende la respuesta del cliente',
                    'Negocia hasta 3 cuotas mensuales dentro de tus reglas',
                    'Escala a un humano cuando se sale de los límites',
                ],
            },
            {
                eyebrow: 'FLUJO DE CAJA PREDICTIVO',
                titulo: 'Sabes cuánto vas a cobrar antes de cobrarlo.',
                copy: 'Cord cruza el retraso de pago promedio real de cada cliente con tu pipeline ponderado para proyectar tus ingresos semana a semana, hasta 90 días. En vez de adivinar, ves el flujo esperado con escenarios de probabilidad y un "AI CFO Insight" que te dice dónde está el riesgo y qué cobrar primero.',
                bullets: [
                    'Proyección a 90 días basada en tu historial real de pago',
                    'Escenarios de probabilidad, no una sola cifra optimista',
                    'Detecta concentración de riesgo y cartera que se va a atrasar',
                ],
            },
            {
                eyebrow: 'TÚ MANDAS',
                titulo: 'La IA propone. Tú apruebas.',
                copy: 'La cobranza autónoma es opt-in y la controlas tú: enciendes el agente por cliente, defines hasta dónde puede negociar y revisas cada plan desde un tablero de supervisión. Todo lo que el agente hace queda en la bitácora de auditoría — cada correo, cada acuerdo, cada cuota. Nunca es una caja negra.',
                bullets: [
                    'Opt-in por cliente: tú decides a quién persigue la IA',
                    'Tablero de supervisión con cada conversación en vivo',
                    'Cada acción registrada en el audit log inmutable',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'NUNCA SE CANSA DE PREGUNTAR',
                titulo: 'Tu mejor cobrador no duerme, no se frustra y no se le olvida.',
                copy: 'El agente de IA da seguimiento a cada factura vencida de noche, fin de semana, siempre. La cartera deja de enfriarse esperando a que alguien tenga tiempo de escribir.',
            },
            {
                eyebrow: 'NEGOCIA, NO SOLO RECUERDA',
                titulo: 'No manda un "por favor paga". Propone un plan de pagos real.',
                copy: 'Hasta tres cuotas mensuales, dentro de los límites que tú definiste. Si el cliente pide algo fuera de rango, la IA te lo escala — nunca decide sola lo que no le toca.',
            },
            {
                eyebrow: 'CERO CAJA NEGRA',
                titulo: 'Todo lo que hace la IA, tú lo puedes leer.',
                copy: 'Cada correo, cada acuerdo, cada cuota queda en un audit log inmutable. Enciendes el agente cliente por cliente — automatizar no significa perder el control.',
            },
        ],
        faqs: [
            {
                q: '¿Cómo cobra de forma automática el agente de IA de Cord?',
                a: 'El agente de cobranza con IA de Cord da seguimiento a las facturas vencidas por su cuenta: contacta al cliente por correo, interpreta la respuesta y propone un plan de pagos de hasta tres cuotas mensuales. Si el cliente acepta dentro de los límites que el negocio configuró, el acuerdo se registra; si se sale de esos límites, el agente lo escala a una persona. Funciona las 24 horas y queda todo en la bitácora de auditoría.',
            },
            {
                q: '¿La cobranza con IA es segura? ¿Quién aprueba los acuerdos?',
                a: 'Sí. La cobranza autónoma es opt-in y se activa cliente por cliente. El negocio define hasta cuántas cuotas y qué condiciones puede negociar el agente, y revisa cada plan desde un tablero de supervisión. Toda acción del agente —correos, acuerdos, cuotas— queda registrada en el audit log inmutable de Cord, así que nunca es una caja negra.',
            },
            {
                q: '¿Qué es la proyección de flujo de caja con IA de Cord?',
                a: 'Cord estima tus ingresos hasta 90 días hacia adelante cruzando el retraso de pago promedio real de cada cliente con el valor ponderado de tu pipeline. En lugar de una sola cifra, muestra escenarios de probabilidad y un panel "AI CFO Insight" que señala la concentración de riesgo y qué cartera conviene cobrar primero. Disponible en el plan Scale en adelante.',
            },
        ],
        cta: { titulo: 'Deja que la IA persiga tu cartera.', sub: 'La cobranza autónoma vive en el plan Scale. Tú apruebas, ella cobra.' },
    },
    {
        slug: 'divisas',
        nav: 'Multi-divisa y FX',
        eyebrow: 'MULTI-DIVISA Y COBERTURA CAMBIARIA',
        titulo: 'Cotiza en dólares. Factura en pesos. Cuida tu margen.',
        sub: 'Tu cliente ve el precio en su moneda; tú facturas en pesos. Cord congela el tipo de cambio del día por 30 días y le suma una cobertura, para que el margen que cerraste sea el margen que cobras.',
        metaTitle: 'Cotizaciones en dólares y euros con cobertura cambiaria para empresas en México — Cord',
        metaDescription: 'Cotiza en USD o EUR y factura en pesos. Cord toma la tasa spot del Banco Central Europeo, le aplica un buffer de cobertura para proteger tu margen y congela el tipo de cambio 30 días (FX lock). Para negocios B2B en México que venden con divisas.',
        plan: 'Disponible en todos los planes',
        stats: [
            { valor: '30', countup: 30, suffix: ' días', label: 'que se congela el tipo de cambio por cotización' },
            { valor: '3', countup: 3, label: 'monedas de presentación: USD, EUR y MXN — siempre facturas en pesos' },
            { valor: '2', countup: 2, suffix: '%', label: 'de cobertura sugerida sobre el tipo de cambio spot, ajustable' },
        ],
        blocks: [
            {
                eyebrow: 'DOS MONEDAS, UN TRATO',
                titulo: 'El cliente ve dólares. El SAT ve pesos.',
                copy: 'En Cord la moneda de presentación y la moneda fiscal son dos cosas distintas. Tu cliente revisa y aprueba la cotización en dólares o euros, como espera; tú facturas en pesos, como vives en México. Cord guarda ambas monedas y la tasa con la que las amarró dentro de la misma cotización, sin que tengas que llevar la conversión a mano.',
                bullets: [
                    'Presenta en USD, EUR o MXN; factura siempre en pesos',
                    'La tasa aplicada queda guardada en la cotización',
                    'El cliente decide en su moneda; tú cumples en la tuya',
                ],
            },
            {
                eyebrow: 'TIPO DE CAMBIO REAL',
                titulo: 'La tasa del día, no la del Excel viejo.',
                copy: 'Cord trae el tipo de cambio spot en vivo desde los datos del Banco Central Europeo, sin que captures nada ni dependas de una hoja desactualizada. Si por alguna razón el servicio externo no responde, Cord usa una tasa de respaldo para que tu cotización nunca se quede a medias. Lo ves en el editor antes de guardar.',
                bullets: [
                    'Tasa spot en vivo (datos del BCE), sin capturar nada',
                    'Preview del tipo de cambio mientras armas la cotización',
                    'Tasa de respaldo si el servicio externo falla — nunca se traba',
                ],
            },
            {
                eyebrow: 'COBERTURA Y FX LOCK',
                titulo: 'El margen que cierras es el que cobras.',
                copy: 'Entre que el cliente aprueba en dólares y tú facturas semanas después en pesos, el tipo de cambio se mueve y se come tu utilidad. Cord le suma un buffer de cobertura a la tasa spot (2% por defecto, tú lo ajustas) y congela ese número 30 días. No es un forward de banco: es un margen de seguridad que Cord calcula y deja fijo para que apruebes hoy o factures en tres semanas con el mismo número.',
                bullets: [
                    'Buffer de cobertura configurable sobre la tasa spot',
                    'FX lock: la tasa se congela 30 días por cotización',
                    'Protege tu utilidad del movimiento entre aprobar y facturar',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'EL DÓLAR SE MUEVE. TU MARGEN NO DEBERÍA.',
                titulo: 'Entre que aprueban y que facturas, el tipo de cambio se puede comer tu utilidad.',
                copy: 'Cord congela la tasa por 30 días con un colchón de cobertura. El margen que negociaste es el margen que cobras, sin importar qué haga el dólar mientras tanto.',
            },
            {
                eyebrow: 'SIN CAPTURAR NADA',
                titulo: 'La tasa del día, no la del Excel de la semana pasada.',
                copy: 'Cord trae el tipo de cambio en vivo automáticamente. Nadie en tu equipo tiene que acordarse de revisar el tipo de cambio antes de cotizar.',
            },
            {
                eyebrow: 'DOS MONEDAS, UN SOLO TRATO',
                titulo: 'Tu cliente ve dólares. El SAT ve pesos. Nadie se confunde.',
                copy: 'Presenta en USD o EUR como espera tu cliente internacional; factura en pesos como exige México. Ambas monedas quedan amarradas en el mismo documento.',
            },
        ],
        faqs: [
            {
                q: '¿Puedo cotizar en dólares y facturar en pesos con Cord?',
                a: 'Sí. En Cord la moneda de presentación es independiente de la moneda fiscal. Tu cliente revisa y aprueba la cotización en dólares (USD) o euros (EUR), mientras que tú facturas en pesos mexicanos (MXN). Cord guarda ambas monedas y el tipo de cambio aplicado dentro de la misma cotización, así que no necesitas llevar la conversión por separado en un Excel. La factura siempre se emite en pesos.',
            },
            {
                q: '¿De dónde saca Cord el tipo de cambio?',
                a: 'Cord obtiene la tasa spot en vivo a partir de los datos del Banco Central Europeo, sin que tengas que capturar nada manualmente. El tipo de cambio se muestra en el editor de cotizaciones antes de guardar. Si el servicio externo no responde por un problema de red, Cord aplica una tasa de respaldo para que la cotización nunca se quede sin generar. Las monedas de presentación disponibles son USD, EUR y MXN.',
            },
            {
                q: '¿Qué es la cobertura cambiaria y el FX lock de Cord?',
                a: 'La cobertura cambiaria es un porcentaje extra (buffer) que Cord suma al tipo de cambio spot para darte margen ante movimientos de la moneda; por defecto es 2% y tú lo puedes ajustar. No es un forward ni una cobertura contratada con un banco: es un colchón que el software calcula y deja fijo. El FX lock congela esa tasa 30 días desde que creas la cotización, así que aunque el cliente apruebe hoy y tú factures semanas después, el tipo de cambio que cobras es el mismo que cerraste y la volatilidad del dólar no se come la utilidad que negociaste.',
            },
        ],
        cta: { titulo: 'Vende en dólares sin perder en el cambio.', sub: 'Cotiza en USD o EUR, factura en pesos y deja que Cord proteja tu margen. Gratis para empezar.' },
    },
    {
        slug: 'internacional',
        nav: 'Facturación internacional',
        eyebrow: 'FACTURACIÓN INTERNACIONAL (US/MX)',
        titulo: 'Cotiza en dólares. Factura como debe ser.',
        sub: 'Vende a clientes en Estados Unidos sin perder el margen al tipo de cambio: cotiza en USD, blinda la tasa por 30 días y factura en MXN con CFDI 4.0 real. Una sola plataforma para el negocio que ya no cabe en una frontera.',
        metaTitle: 'Facturación internacional US/MX: cotiza en dólares, factura CFDI 4.0 en pesos — Cord',
        metaDescription: 'Cord cotiza en USD con cobertura cambiaria (tasa congelada 30 días) y factura en MXN con CFDI 4.0 timbrado ante el SAT vía Facturapi. Arquitectura multi-país lista para crecer. Para empresas B2B mexicanas que exportan o venden en dólares.',
        plan: 'Cobertura cambiaria y multi-divisa en todos los planes (incluido el gratuito); el timbrado CFDI 4.0 ante el SAT desde el plan Starter',
        stats: [
            { valor: '30', countup: 30, suffix: ' días', label: 'que congelas el tipo de cambio de la cotización (FX lock)' },
            { valor: '2', countup: 2, label: 'divisas por trato: una para cotizar, otra para facturar' },
            { valor: '4.0', label: 'versión del CFDI que Cord timbra real ante el SAT' },
        ],
        blocks: [
            {
                eyebrow: 'COBERTURA CAMBIARIA',
                titulo: 'El dólar se mueve. Tu margen no.',
                copy: 'Entre que tu cliente aprueba en dólares y tú facturas semanas después, el tipo de cambio puede comerse tu utilidad. Cord toma la tasa spot real del Banco Central Europeo, le suma el buffer de cobertura que tú definas y congela ese tipo de cambio por 30 días. El margen que prometiste es el margen que cobras.',
                bullets: [
                    'Tasa spot en vivo (USD a MXN, EUR a MXN) desde fuente del BCE',
                    'Buffer de cobertura configurable para absorber la volatilidad',
                    'FX lock de 30 días: la tasa queda guardada con la cotización',
                ],
            },
            {
                eyebrow: 'DOS DIVISAS, UN TRATO',
                titulo: 'Cotizas en la divisa que tu cliente entiende.',
                copy: 'En el editor eliges la divisa de presentación —la que ve tu cliente en el extranjero— y la divisa fiscal con la que vas a facturar. Cord guarda ambas en la cotización junto con la tasa congelada, así el documento que aprueba el cliente y el CFDI que entra a tu contabilidad nunca se contradicen.',
                bullets: [
                    'Divisa de presentación (USD) separada de la divisa fiscal (MXN)',
                    'Vista previa del monto convertido antes de enviar',
                    'Tasa, fuente y vigencia quedan registradas en el trato',
                ],
            },
            {
                eyebrow: 'CFDI REAL + ARQUITECTURA GLOBAL',
                titulo: 'México timbra de verdad. El resto, ya está cableado.',
                copy: 'Cuando el trato se cierra en México, Cord emite CFDI 4.0 real ante el SAT a través de Facturapi: UUID, XML y PDF timbrados. Por dentro, un patrón de proveedores fiscales enruta cada emisión según el país del negocio y la centraliza en un solo registro: la base lista para sumar más países conforme crezcas.',
                bullets: [
                    'CFDI 4.0 real timbrado ante el SAT (México) vía Facturapi',
                    'Registro fiscal unificado por país en un solo lugar',
                    'Arquitectura multi-país preparada para expandirse',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'VENDER SIN FRONTERA',
                titulo: 'El negocio que ya no cabe en un solo país no debería usar herramientas de un solo país.',
                copy: 'Cotiza en dólares a un cliente en Texas y factura en pesos en Guadalajara — desde la misma cuenta, el mismo catálogo, el mismo sistema.',
            },
            {
                eyebrow: 'COBERTURA REAL',
                titulo: 'El tipo de cambio ya no es una apuesta.',
                copy: 'Buffer de cobertura configurable más tasa congelada 30 días. Sabes exactamente cuánto vas a cobrar en pesos desde el momento en que el cliente aprueba en dólares.',
            },
            {
                eyebrow: 'MÉXICO TIMBRA DE VERDAD',
                titulo: 'CFDI 4.0 real, no una simulación con apariencia de factura.',
                copy: 'Cuando el trato se cierra en México, el UUID, el XML y el PDF salen timbrados ante el SAT — con una arquitectura ya lista para sumar más países.',
            },
        ],
        faqs: [
            {
                q: '¿Cord permite cotizar en dólares y facturar en pesos?',
                a: 'Sí. En el editor de Cord defines dos divisas: la divisa de presentación con la que tu cliente ve la cotización (por ejemplo USD) y la divisa fiscal con la que vas a facturar (por ejemplo MXN). Cord obtiene la tasa de cambio spot real, le aplica el buffer de cobertura que configures y la congela por 30 días junto con la cotización. Al cerrar el trato en México, la factura se emite como CFDI 4.0 en pesos.',
            },
            {
                q: '¿Cómo protege Cord mi margen ante movimientos del tipo de cambio?',
                a: 'Cord usa cobertura cambiaria. Toma la tasa spot en vivo (datos del Banco Central Europeo vía Frankfurter), le suma un porcentaje de buffer que tú defines para absorber la volatilidad, y bloquea ese tipo de cambio por 30 días (FX lock). Así, aunque el dólar se mueva entre la aprobación y la facturación, tú facturas a la tasa que pactaste y conservas el margen. La cobertura cambiaria y la multi-divisa están disponibles en todos los planes, incluido el gratuito.',
            },
            {
                q: '¿Cord factura clientes en Estados Unidos igual que en México?',
                a: 'No de la misma forma, y es importante ser claros. En México, Cord timbra CFDI 4.0 real ante el SAT a través de un Proveedor Autorizado de Certificación (Facturapi), con UUID, XML y PDF válidos. Para Estados Unidos no existe un timbre del gobierno equivalente: la emisión de facturas comerciales (Commercial Invoice) en EE.UU. está en la arquitectura como módulo en desarrollo, no como timbrado real equivalente al CFDI. Hoy, lo que cierra de verdad el ciclo fiscal es México; la base multi-país ya está construida para crecer hacia otros países.',
            },
        ],
        cta: { titulo: 'Vende sin frontera. Factura sin sorpresas.', sub: 'Cotiza en dólares con la tasa blindada y timbra tu CFDI 4.0 en pesos. Empieza gratis.' },
    },
    {
        slug: 'finanzas',
        nav: 'Finanzas y CFO',
        eyebrow: 'TU CFO CON IA',
        titulo: 'Flujo de caja predictivo a 90 días.',
        sub: 'Cruza tu pipeline con el historial real de pago de cada cliente. Sabes cuánto cobrarás antes de cobrarlo y detectas riesgos de impago antes de que sucedan.',
        metaTitle: 'Flujo de caja predictivo y CFO con IA para B2B — Cord',
        metaDescription: 'Cord usa IA para proyectar tu flujo de caja a 90 días cruzando tu pipeline con el historial de pago real de tus clientes.',
        plan: 'Plan Scale en adelante',
        stats: [
            { valor: '90', countup: 90, suffix: ' días', label: 'de proyección predictiva' },
            { valor: '100', countup: 100, suffix: '%', label: 'basado en el historial real de tu cartera' },
            { valor: '1', countup: 1, suffix: ' clic', label: 'para ver el semáforo de riesgo por cliente' },
        ],
        blocks: [
            {
                eyebrow: 'PREDICCIÓN REAL',
                titulo: 'No más adivinanzas en Excel.',
                copy: 'Cord no asume que un cliente a Net 30 paga al día 30. Analiza su historial real y si suele pagar al día 45, proyecta tu flujo con ese retraso (DSO).',
                bullets: [
                    'DSO (Days Sales Outstanding) calculado por cliente',
                    'Ajuste automático a la realidad de cobranza',
                    'Reporte visual sin armar fórmulas',
                ],
            },
            {
                eyebrow: 'RIESGO ACTIVO',
                titulo: 'El semáforo que cuida tu cartera.',
                copy: 'El AI CFO revisa la concentración de riesgo. Si un cliente que representa el 40% de tu cartera se empieza a atrasar, te lo advierte para que cierres la llave.',
                bullets: [
                    'Alertas tempranas de riesgo de impago',
                    'Concentración de cartera visualizada',
                    'Recomendaciones de acción con un clic',
                ],
            },
            {
                eyebrow: 'REPORTE GERENCIAL',
                titulo: 'La junta de finanzas, lista en segundos.',
                copy: 'Exporta la proyección o da acceso a tu equipo directivo a un tablero en vivo donde los números siempre están actualizados.',
                bullets: [
                    'Dashboard en vivo para el CFO',
                    'Exportación a CSV o PDF',
                    'Cero tiempo de conciliación mensual',
                ],
            },
        ],
        showcase: [
            {
                eyebrow: 'SE ACABARON LAS ADIVINANZAS',
                titulo: 'Sabes cuánto vas a cobrar antes de cobrarlo.',
                copy: 'Cord no asume que Net 30 se paga al día 30. Analiza el historial real de cada cliente y proyecta tu flujo con la verdad, no con el contrato.',
            },
            {
                eyebrow: 'EL RIESGO QUE NO VES A TIEMPO',
                titulo: 'Si el 40% de tu cartera depende de un solo cliente, quieres saberlo hoy.',
                copy: 'El semáforo de concentración de riesgo te avisa antes de que ese cliente se atrase — para que actúes mientras todavía hay margen de maniobra.',
            },
            {
                eyebrow: 'LISTO PARA LA JUNTA',
                titulo: 'El reporte que antes te tomaba una tarde armar, ahora ya está armado.',
                copy: 'Dashboard en vivo, exportable, siempre actualizado. Cero tiempo de conciliación cuando alguien de finanzas pregunta cómo va el mes.',
            },
        ],
        faqs: [
            {
                q: '¿Cómo proyecta Cord el flujo de caja?',
                a: 'Cord cruza las cotizaciones aprobadas (pipeline) con el comportamiento histórico de pago de cada cliente para predecir cuándo entrará el dinero realmente, no cuándo vence la factura teóricamente.',
            },
            {
                q: '¿Qué es el DSO y por qué es importante?',
                a: 'El DSO (Days Sales Outstanding) mide cuántos días tarda en pagar un cliente. Cord lo calcula automáticamente y lo usa para alertar sobre riesgos si un cliente empieza a aumentar su tiempo de pago.',
            },
            {
                q: '¿Quién tiene acceso a esta información?',
                a: 'En los planes avanzados, puedes definir roles. Solo los usuarios con permisos gerenciales o de CFO pueden ver las proyecciones y la concentración de riesgo total de la empresa.',
            },
        ],
        cta: { titulo: 'Anticípate a los baches de flujo.', sub: 'Tu CFO impulsado por IA está disponible en el plan Scale.' },
    },
    {
        slug: 'aprobaciones',
        nav: 'Control de márgenes',
        eyebrow: 'CONTROL DE MÁRGENES Y APROBACIONES',
        titulo: 'Vende rápido, pero con el margen correcto.',
        sub: 'Define umbrales de descuento por rol. Si un vendedor da un descuento mayor al permitido, la cotización se pausa y pide aprobación gerencial. Tú cuidas el margen, ellos cierran la venta.',
        metaTitle: 'Control de márgenes y flujo de aprobaciones para ventas B2B — Cord',
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
        metaTitle: 'Gestión de equipo, roles y multi-empresa para B2B — Cord',
        metaDescription: 'Administra tu equipo de ventas con permisos granulares y gestiona múltiples empresas o razones sociales desde una sola cuenta de Cord.',
        plan: 'Disponible desde el plan Starter (Multi-empresa requiere Profesional)',
        stats: [
            { valor: '5', countup: 5, label: 'niveles de permisos granulares' },
            { valor: '100', countup: 100, suffix: '%', label: 'de las acciones quedan en la bitácora de auditoría' },
            { valor: 'SSO', label: 'inicio de sesión seguro corporativo' },
        ],
        blocks: [
            {
                eyebrow: 'PERMISOS B2B',
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
                    'Autenticación robusta respaldada por Clerk',
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
        nav: 'Negociación B2B',
        eyebrow: 'NEGOCIACIÓN Y APROBACIONES',
        titulo: 'Acuerdos blindados, línea por línea.',
        sub: 'Tus clientes pueden revisar, ajustar cantidades o proponer un nuevo precio en productos específicos. Cada cambio genera una versión inmutable firmada criptográficamente — adiós a los malentendidos.',
        metaTitle: 'Negociación de cotizaciones B2B en México — Cord',
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
