// Copy de las tres secciones extra de /producto/facturacion: equipos de
// finanzas (A7), portal del cliente y cobro automático (A8) y desarrolladores
// (A9). Vive aparte de `producto.ts` a propósito: ese archivo lo edita otra
// sesión y estas secciones solo existen en Cord Invoicing.
//
// Cada dato lleva al lado su fuente en código. Si la fuente cambia, cambia
// aquí también: una cifra que nadie verifica es la regla 15 aplicada al copy.

import type { IntegrationSlug } from './integraciones/catalogo';

export type Lang = 'es' | 'en';

/** Estado de una tarea en la tabla de conciliación. `click` = un clic en la app. */
export type ConcState = 'auto' | 'click' | 'soon';

export interface ConcRow {
    tarea: string;
    /** Qué hace Cord hoy, en una línea. */
    detalle: string;
    estado: ConcState;
}

export interface IntegrationLogo {
    nombre: string;
    /** Slug del catálogo: el logo sale de BRAND_LOGOS (src/lib/integraciones/catalogo.ts). */
    slug: IntegrationSlug;
    tipo: string;
    /** Solo QuickBooks: sus llaves de producción siguen en revisión de Intuit. */
    proximamente?: boolean;
}

export interface FinanzasCopy {
    eyebrow: string;
    titulo: string;
    sub: string;
    cartera: { eyebrow: string; titulo: string; copy: string; puntos: string[]; plan: string };
    recupera: { eyebrow: string; titulo: string; copy: string; puntos: string[]; plan: string };
    conciliacion: {
        eyebrow: string; titulo: string; copy: string;
        colTarea: string; colSin: string; colCon: string;
        manual: string; estados: Record<ConcState, string>;
        filas: ConcRow[];
    };
    integraciones: { eyebrow: string; titulo: string; copy: string; proximamente: string; logos: IntegrationLogo[]; cta: string };
}

export interface PortalCopy {
    eyebrow: string;
    badge: string;
    titulo: string;
    sub: string;
    puntos: { titulo: string; texto: string }[];
    reintentos: { titulo: string; copy: string; colCaso: string; colRegla: string; filas: { caso: string; regla: string }[] };
    domiciliacion: { titulo: string; texto: string };
}

export interface DevCopy {
    eyebrow: string;
    titulo: string;
    sub: string;
    codigoTitulo: string;
    codigoPie: string;
    eventosTitulo: string;
    eventosCopy: string;
    /** Los 9 eventos de factura del contrato público. */
    eventos: { nombre: string; texto: string }[];
    sdksTitulo: string;
    sdks: { nombre: string; paquete: string; texto: string; proximamente?: boolean }[];
    proximamente: string;
    links: { label: string; href: string }[];
}

// Integraciones listadas (los dos idiomas): las que están en producción según
// docs/estado/pendientes-integraciones.md (tabla Resumen) y
// src/lib/integraciones/catalogo.ts. QuickBooks: probado solo en sandbox; sus
// llaves de producción esperan la revisión de Intuit. n8n: `n8n-nodes-cord` en
// npm, solo autoalojado hasta que n8n lo verifique. Teams queda fuera: la app
// de Entra está registrada pero falta probarla.

const FINANZAS: Record<Lang, FinanzasCopy> = {
    es: {
        eyebrow: 'PARA EQUIPOS DE FINANZAS',
        titulo: 'Cobra a tiempo sin perseguir a nadie.',
        // Recordatorios: src/pages/api/cron/recordatorios.ts. Pago aplicado a su
        // factura: src/lib/fiscal/payments.ts (applyPayment). Xero:
        // src/lib/integraciones/contabilidad/xero.ts.
        sub: 'Cord junta lo que te deben en una sola cartera, le recuerda a tu cliente antes y después del vencimiento, aplica cada pago a su factura y, si usas Xero, la manda a tu contabilidad.',
        cartera: {
            eyebrow: 'CARTERA POR COBRAR',
            titulo: 'Lo que te deben, por antigüedad y por urgencia.',
            // Vista `cuentas_por_cobrar` (los dos rieles) y orden por monto × días:
            // src/lib/queries.ts getCobranza() + src/pages/app/cobranza/index.astro.
            copy: 'En Cobranza ves en una tabla las facturas abiertas y las cotizaciones aprobadas a crédito, cada una por su saldo real. Arriba, lo vencido y lo que vence esta semana; en Atiende primero, lo que más pesa en dinero y en días de atraso.',
            puntos: [
                // queries.ts: bucket = vigente | d30 | d60 | d60p.
                'Antigüedad en cuatro tramos: por vencer, de 1 a 30 días, de 31 a 60 y más de 60',
                // src/lib/informes.ts REPORTS (15) + src/pages/app/informes.astro (finanzas,
                // flujo y cobranza exigen cfo_dashboard, cashflow_90 y collections: Pro).
                '15 informes, de ventas por cliente a impuestos facturados; finanzas, flujo de caja y cartera desde Profesional',
                // src/lib/informes-programados.ts: cada lunes o cada día 1, con el CSV adjunto.
                'Un informe guardado te llega cada lunes o cada día 1, con su CSV adjunto',
                // src/pages/api/facturas/export.ts: estado, cliente, fechas y búsqueda.
                'Tus facturas a CSV, con los filtros que tengas puestos',
            ],
            // src/lib/entitlements.ts: collections → 'pro'.
            plan: 'Cobranza, desde el plan Profesional.',
        },
        recupera: {
            eyebrow: 'RECUPERA MÁS',
            titulo: 'Los recordatorios salen solos. La cartera difícil, con IA.',
            // recordatorios.ts: solo lifecycle 'open' con saldo; dedup en documento_recordatorios.
            copy: 'Mientras una factura siga abierta, Cord le recuerda a tu cliente el saldo antes y después del vencimiento, con el botón para pagar. Cuando una cuenta ya se atrasó, el agente de cobranza redacta un correo para cada una con el saldo real y el link de pago.',
            puntos: [
                'Antes y después del vencimiento; cada aviso sale una sola vez y se detiene al pagarse',
                // src/lib/agents/ar-agent.ts: Tono = cercano | profesional | firme.
                'El agente escribe en el tono que elijas: cercano, profesional o firme',
                // src/lib/agents/cobranza-run.ts: modo 'aprobacion' | 'automatico'.
                'Apruebas cada correo antes de que salga, o lo dejas en automático',
                // ar-agent.ts executeProposePlan: splitCuotas calcula los montos; docs
                // pagos/cobranza-ia: nunca descuentos sobre el capital; planes solo en cotizaciones.
                'Nunca ofrece descuentos sobre el capital; si propone cuotas en una cotización, los importes los calcula Cord',
            ],
            // entitlements.ts: collections_ai → 'pro'. Recordatorios: todos los planes.
            plan: 'Recordatorios en todos los planes. Agente de cobranza desde Profesional.',
        },
        conciliacion: {
            eyebrow: 'CONCILIACIÓN',
            titulo: 'Del cobro a los libros sin capturar dos veces.',
            copy: 'Lo que hoy se hace a mano, frente a lo que Cord ya hace por ti. Así funciona hoy, no en una presentación.',
            colTarea: 'Tarea',
            colSin: 'Sin Cord',
            colCon: 'Con Cord',
            manual: 'Manual',
            estados: { auto: 'Automático', click: 'Un clic', soon: 'Próximamente' },
            filas: [
                // email.ts notifyInvoiceIssued + cron/recordatorios.ts.
                { tarea: 'Enviar la factura y sus recordatorios', detalle: 'Correo con el PDF y el link; avisos antes y después del vencimiento.', estado: 'auto' },
                // api/i/[token]/payment-intent.ts (Cord Payments) y
                // api/i/[token]/mp-preference.ts + rama MP_INVOICE_REF del webhook de Mercado Pago.
                { tarea: 'Detectar un pago en línea y aplicarlo a su factura', detalle: 'Tarjeta con Cord Payments o Mercado Pago: el pago baja el saldo de esa factura.', estado: 'auto' },
                // cobros/webhook.ts y cobros-settle.ts → dispatchInvoiceEvent('invoice.paid');
                // workflows/catalog.ts: disparador invoice.paid + acción slack_message.
                { tarea: 'Marcarla pagada y avisar a tu equipo', detalle: 'Queda pagada al saldarse; tus sistemas reciben invoice.paid y un workflow avisa en Slack.', estado: 'auto' },
                // fiscal/payments.ts → emitPaymentComplement (CFDI PPD).
                { tarea: 'Emitir el complemento de pago en México', detalle: 'Uno por cada abono a un CFDI emitido para pagarse después.', estado: 'auto' },
                // integraciones/contabilidad/xero.ts (DRAFT) + pagos.ts (Payments con Idempotency-Key).
                { tarea: 'Mandar la factura a tu contabilidad', detalle: 'En Xero, la factura como borrador para tu contador; el envío de cada cobro se está habilitando. QuickBooks Online, próximamente.', estado: 'auto' },
                // Hoy: botón "Registrar pago" del detalle de la factura (fiscal/payments.ts
                // applyPayment, acotado al saldo). SPEI con CLABE por factura está construido
                // (cobros/spei.ts) y en beta en el roadmap: cuando salga de beta, esta fila
                // pasa a 'auto' cambiando solo `estado` y `detalle`.
                { tarea: 'Conciliar una transferencia con su factura', detalle: 'Registrar pago en la factura: baja el mismo saldo y no puede pasarlo. En México, el SPEI a una CLABE propia de cada factura que se concilia sola se está habilitando.', estado: 'click' },
            ],
        },
        integraciones: {
            eyebrow: 'INTEGRACIONES',
            titulo: 'Conectado a lo que tu equipo ya usa.',
            copy: 'Tus facturas llegan a tu contabilidad, a tus hojas de cálculo y a tus canales; lo que no está conectado directo, lo resuelves con Zapier, Make o n8n.',
            proximamente: 'Próximamente',
            logos: [
                { nombre: 'Xero', slug: 'xero', tipo: 'Contabilidad' },
                { nombre: 'QuickBooks Online', slug: 'quickbooks', tipo: 'Contabilidad', proximamente: true },
                { nombre: 'Google Sheets', slug: 'google-sheets', tipo: 'Hoja de cálculo' },
                { nombre: 'Excel', slug: 'excel', tipo: 'Hoja de cálculo' },
                { nombre: 'HubSpot', slug: 'hubspot', tipo: 'CRM' },
                { nombre: 'Shopify', slug: 'shopify', tipo: 'Tienda en línea' },
                { nombre: 'Gmail', slug: 'gmail', tipo: 'Correo' },
                { nombre: 'Slack', slug: 'slack', tipo: 'Avisos al equipo' },
                { nombre: 'WhatsApp Business', slug: 'whatsapp', tipo: 'Mensajes al cliente' },
                { nombre: 'Zapier', slug: 'zapier', tipo: 'Automatización' },
                { nombre: 'Make', slug: 'make', tipo: 'Automatización' },
                { nombre: 'n8n', slug: 'n8n', tipo: 'Autoalojado' },
            ],
            cta: 'Ver todas las integraciones',
        },
    },
    en: {
        eyebrow: 'FOR FINANCE TEAMS',
        titulo: 'Get paid on time without chasing anyone.',
        sub: 'Cord gathers what you are owed into one receivables view, reminds your client before and after the due date, applies each payment to its invoice and, if you use Xero, sends it to your books.',
        cartera: {
            eyebrow: 'ACCOUNTS RECEIVABLE',
            titulo: 'What you are owed, by age and by urgency.',
            copy: 'In Collections you see open invoices and quotes approved on credit in one table, each at its real balance. At the top, what is overdue and what comes due this week; in Handle first, what weighs most in money and days late.',
            puntos: [
                'Aging in four buckets: not yet due, 1 to 30 days, 31 to 60 and over 60',
                '15 reports, from sales by client to invoiced taxes; finance, cash flow and receivables from Professional',
                'A saved report reaches you every Monday or on the 1st, with its CSV attached',
                'Your invoices to CSV, with whatever filters you have on',
            ],
            plan: 'Collections, from the Professional plan.',
        },
        recupera: {
            eyebrow: 'RECOVER MORE',
            titulo: 'Reminders go out on their own. The hard accounts, with AI.',
            copy: 'While an invoice stays open, Cord reminds your client of the balance before and after the due date, with the button to pay. Once an account is late, the collections agent drafts an email for each one with the real balance and the payment link.',
            puntos: [
                'Before and after the due date; each notice goes out once and stops when it is paid',
                'The agent writes in the tone you choose: friendly, professional or firm',
                'You approve each email before it goes out, or leave it on automatic',
                'It never offers discounts on the principal; if it proposes installments on a quote, Cord computes the amounts',
            ],
            plan: 'Reminders on every plan. Collections agent from Professional.',
        },
        conciliacion: {
            eyebrow: 'RECONCILIATION',
            titulo: 'From payment to the books without typing it twice.',
            copy: 'What is done by hand today, next to what Cord already does for you. This is how it works today, not in a slide deck.',
            colTarea: 'Task',
            colSin: 'Without Cord',
            colCon: 'With Cord',
            manual: 'Manual',
            estados: { auto: 'Automatic', click: 'One click', soon: 'Coming soon' },
            filas: [
                { tarea: 'Send the invoice and its reminders', detalle: 'Email with the PDF and the link; notices before and after the due date.', estado: 'auto' },
                { tarea: 'Detect an online payment and apply it to its invoice', detalle: 'Card with Cord Payments or Mercado Pago: the payment lowers that invoice’s balance.', estado: 'auto' },
                { tarea: 'Mark it paid and tell your team', detalle: 'It is marked paid when settled; your systems get invoice.paid and a workflow posts to Slack.', estado: 'auto' },
                { tarea: 'Issue the payment complement in Mexico', detalle: 'One for each payment on a CFDI issued to be paid later.', estado: 'auto' },
                { tarea: 'Send the invoice to your books', detalle: 'In Xero, the invoice as a draft for your accountant; sending each payment is being rolled out. QuickBooks Online, coming soon.', estado: 'auto' },
                { tarea: 'Match a bank transfer to its invoice', detalle: 'Record payment on the invoice: it lowers the same balance and can never exceed it. In Mexico, SPEI to a CLABE of each invoice that reconciles itself is being rolled out.', estado: 'click' },
            ],
        },
        integraciones: {
            eyebrow: 'INTEGRATIONS',
            titulo: 'Connected to what your team already uses.',
            copy: 'Your invoices reach your books, your spreadsheets and your channels; whatever is not connected directly, you wire up with Zapier, Make or n8n.',
            proximamente: 'Coming soon',
            logos: [
                { nombre: 'Xero', slug: 'xero', tipo: 'Accounting' },
                { nombre: 'QuickBooks Online', slug: 'quickbooks', tipo: 'Accounting', proximamente: true },
                { nombre: 'Google Sheets', slug: 'google-sheets', tipo: 'Spreadsheet' },
                { nombre: 'Excel', slug: 'excel', tipo: 'Spreadsheet' },
                { nombre: 'HubSpot', slug: 'hubspot', tipo: 'CRM' },
                { nombre: 'Shopify', slug: 'shopify', tipo: 'Online store' },
                { nombre: 'Gmail', slug: 'gmail', tipo: 'Email' },
                { nombre: 'Slack', slug: 'slack', tipo: 'Team alerts' },
                { nombre: 'WhatsApp Business', slug: 'whatsapp', tipo: 'Client messages' },
                { nombre: 'Zapier', slug: 'zapier', tipo: 'Automation' },
                { nombre: 'Make', slug: 'make', tipo: 'Automation' },
                { nombre: 'n8n', slug: 'n8n', tipo: 'Self-hosted' },
            ],
            cta: 'See every integration',
        },
    },
};

const PORTAL: Record<Lang, PortalCopy> = {
    es: {
        eyebrow: 'PORTAL DEL CLIENTE',
        // docs/estado/pendientes-integraciones.md: construido el 8 oct 2026; falta
        // encenderlo en la plataforma de pagos (eventos del webhook y métodos).
        badge: 'Próximamente',
        titulo: 'Un enlace donde tu cliente paga todas sus facturas de una vez.',
        sub: 'Cada cliente tiene su propio portal con su saldo, sus facturas y la opción de pagar varias en un solo cargo o dejar activo el cobro automático. Ya está construido y lo estamos activando.',
        puntos: [
            // src/lib/cobros/portal.ts saldoPorDivisa + src/pages/portal/[token].astro.
            { titulo: 'Su saldo, por divisa', texto: 'Lo que debe en cada moneda y cuánto ya venció, sin pedirte un estado de cuenta.' },
            // portal/[token].astro: selección de una sola divisa → payment-intent agrupado.
            { titulo: 'Varias facturas, un solo pago', texto: 'Elige las que quiera de la misma divisa y las paga juntas; cada una baja su propio saldo.' },
            // portal/[token].astro: enlaces Ver y PDF en abiertas y pagadas.
            { titulo: 'Sus PDF, siempre a mano', texto: 'Cada factura abierta o pagada con su PDF, sin buscar el correo.' },
            // src/lib/cobros/automatico.ts: cobra en el vencimiento, solo lo que vence
            // desde el día de la autorización, una divisa por cargo.
            { titulo: 'Cobro automático', texto: 'Autoriza un método y cada factura se cobra en su fecha de vencimiento. Lo que ya debía antes de autorizarlo no se le carga por sorpresa.' },
        ],
        reintentos: {
            titulo: 'Si un cargo no pasa, la regla está escrita.',
            // src/lib/cobros/reintentos.ts decidirReintento().
            copy: 'Nada de reintentos a ciegas: cada rechazo tiene su respuesta.',
            colCaso: 'Si el cargo no pasa por',
            colRegla: 'Cord',
            filas: [
                // MAX_INTENTOS_TARJETA = 4.
                { caso: 'Cualquier rechazo de tarjeta', regla: 'Lo intenta hasta 4 veces en total; después, tu cliente paga desde el portal.' },
                // proximoDiaDePago(ahora, 2): el siguiente 1 o 16 dentro de una semana.
                { caso: 'Fondos insuficientes', regla: 'Reintenta el siguiente día 1 o 16, justo después de los días de pago más comunes, si cae dentro de la semana.' },
                // ESCALERA_RECHAZO = [2, 4, 7]; TEMPORAL → diaUtc(ahora, 1).
                { caso: 'Otro rechazo del banco', regla: 'Reintenta a los 2, 4 y 7 días; una falla técnica del banco, al día siguiente.' },
                // BLOQUEADO y METODO → detener con desactivar: true.
                { caso: 'Tarjeta robada, extraviada, vencida o bloqueada', regla: 'No insiste: da de baja el método y le pide otro a tu cliente.' },
                // AUTENTICACION → detener sin desactivar.
                { caso: 'Su banco pide autenticación', regla: 'No lo cobra sin él: le pide pagar desde el portal y el cobro automático sigue activo.' },
                // MAX_INTENTOS_DOMICILIACION = 3; VENTANA_DOMICILIACION sepa 30, ach 40.
                { caso: 'Domiciliación bancaria', regla: 'Solo reintenta por fondos insuficientes: hasta 3 intentos, dentro de 30 días en SEPA y 40 en ACH.' },
            ],
        },
        // src/lib/cobros/metodos.ts DOMICILIACION: sepa_debit EUR (ES, DE, FR); us_bank_account USD (US).
        domiciliacion: {
            titulo: 'Domiciliación SEPA y ACH',
            texto: 'Cargo a cuenta bancaria en euros para negocios en España, Alemania y Francia, y en dólares en Estados Unidos. Tu cliente firma la autorización desde el portal o desde la factura.',
        },
    },
    en: {
        eyebrow: 'CLIENT PORTAL',
        badge: 'Coming soon',
        titulo: 'One link where your client pays all their invoices at once.',
        sub: 'Each client gets their own portal with their balance, their invoices and the option to pay several in a single charge or keep automatic payments on. It is built and we are switching it on.',
        puntos: [
            { titulo: 'Their balance, by currency', texto: 'What they owe in each currency and how much is already overdue, without asking you for a statement.' },
            { titulo: 'Several invoices, one payment', texto: 'They pick the ones they want in the same currency and pay them together; each one lowers its own balance.' },
            { titulo: 'Their PDFs, always at hand', texto: 'Every open or paid invoice with its PDF, no inbox search needed.' },
            { titulo: 'Automatic payments', texto: 'They authorize a method and each invoice is charged on its due date. Whatever they already owed before authorizing is never charged by surprise.' },
        ],
        reintentos: {
            titulo: 'When a charge fails, the rule is written down.',
            copy: 'No blind retries: every decline has its answer.',
            colCaso: 'If the charge fails because of',
            colRegla: 'Cord',
            filas: [
                { caso: 'Any card decline', regla: 'Tries up to 4 times in total; after that, your client pays from the portal.' },
                { caso: 'Insufficient funds', regla: 'Retries on the next 1st or 16th, right after the most common paydays, when it falls within the week.' },
                { caso: 'Another bank decline', regla: 'Retries after 2, 4 and 7 days; a technical failure at the bank, the next day.' },
                { caso: 'Stolen, lost, expired or blocked card', regla: 'Does not insist: removes the method and asks your client for another one.' },
                { caso: 'Their bank requires authentication', regla: 'Never charges without it: asks them to pay from the portal and automatic payments stay on.' },
                { caso: 'Bank debit', regla: 'Retries only for insufficient funds: up to 3 attempts, within 30 days for SEPA and 40 for ACH.' },
            ],
        },
        domiciliacion: {
            titulo: 'SEPA and ACH direct debit',
            texto: 'Bank debits in euros for businesses in Spain, Germany and France, and in dollars in the United States. Your client signs the mandate from the portal or from the invoice.',
        },
    },
};

const DEV: Record<Lang, DevCopy> = {
    es: {
        eyebrow: 'PARA DESARROLLADORES',
        titulo: 'Factura desde tu propio sistema.',
        // packages/node/CHANGELOG.md 1.0.0: Idempotency-Key automática en toda mutación.
        sub: 'La misma factura que emites en Cord, desde tu código: crea el borrador, emítelo y mándalo con tres llamadas. Cada escritura lleva su clave de idempotencia, así que un reintento nunca emite dos veces.',
        codigoTitulo: 'emitir-factura.ts',
        codigoPie: 'POST /api/v1/facturas · POST /api/v1/facturas/{id}',
        eventosTitulo: 'Webhooks de factura',
        eventosCopy: 'Nueve eventos firmados, con reintentos, para que tu ERP se entere sin preguntar.',
        // src/lib/webhooks.ts WEBHOOK_EVENT_LABELS (contrato en
        // packages/elements/src/contract/webhook-events.ts).
        eventos: [
            { nombre: 'invoice.issued', texto: 'Factura comercial emitida' },
            { nombre: 'invoice.stamped', texto: 'CFDI timbrado' },
            { nombre: 'invoice.finalized', texto: 'Factura emitida' },
            { nombre: 'invoice.sent', texto: 'Factura enviada al cliente' },
            { nombre: 'invoice.paid', texto: 'Factura pagada' },
            { nombre: 'invoice.payment_failed', texto: 'Pago de factura fallido' },
            { nombre: 'invoice.overdue', texto: 'Factura vencida' },
            { nombre: 'invoice.voided', texto: 'Factura anulada' },
            { nombre: 'invoice.marked_uncollectible', texto: 'Factura marcada incobrable' },
        ],
        sdksTitulo: 'SDK y herramientas',
        sdks: [
            // npm: @flouviahq/node 1.1.0 (verificado en el registro el 10 oct 2026).
            { nombre: 'Node', paquete: '@flouviahq/node', texto: 'Tipado, con reintentos y paginación por cursor.' },
            // npm: @flouviahq/cli 1.2.1.
            { nombre: 'CLI', paquete: '@flouviahq/cli', texto: 'Inicia sesión desde la terminal y prueba tus webhooks.' },
            // src/lib/mcp.ts: listar_facturas, detalle_factura, crear_factura_borrador.
            { nombre: 'Servidor MCP', paquete: 'listar_facturas · crear_factura_borrador', texto: 'Tu asistente de IA consulta facturas y prepara borradores; emitir sigue siendo tuyo.' },
            // packages/elements/src/element.ts CordInvoiceElement; npm 2.1.0.
            { nombre: 'Elements', paquete: '<cord-invoice>', texto: 'La factura dentro de tu sitio; el pago se abre en una ventana de Cord.' },
            // PyPI cord-sdk y Packagist flouviahq/cord responden 404
            // (docs/estado/hallazgos-auditoria-docs.md punto 27).
            { nombre: 'Python', paquete: 'cord-sdk', texto: 'Mismo contrato que el de Node.', proximamente: true },
            { nombre: 'PHP', paquete: 'flouviahq/cord', texto: 'Mismo contrato que el de Node.', proximamente: true },
        ],
        proximamente: 'Próximamente',
        // src/lib/docs-nav.ts: desarrolladores/funciones/facturas y herramientas/webhooks.
        links: [
            { label: 'API de Facturas', href: 'https://docs.cordhq.app/docs/desarrolladores/funciones/facturas' },
            { label: 'Webhooks', href: 'https://docs.cordhq.app/docs/desarrolladores/herramientas/webhooks' },
            { label: 'Cord para desarrolladores', href: '/desarrolladores/api' },
        ],
    },
    en: {
        eyebrow: 'FOR DEVELOPERS',
        titulo: 'Invoice from your own system.',
        sub: 'The same invoice you issue in Cord, from your code: create the draft, issue it and send it in three calls. Every write carries its idempotency key, so a retry never issues twice.',
        codigoTitulo: 'issue-invoice.ts',
        codigoPie: 'POST /api/v1/facturas · POST /api/v1/facturas/{id}',
        eventosTitulo: 'Invoice webhooks',
        eventosCopy: 'Nine signed events, with retries, so your ERP finds out without asking.',
        eventos: [
            { nombre: 'invoice.issued', texto: 'Commercial invoice issued' },
            { nombre: 'invoice.stamped', texto: 'CFDI stamped' },
            { nombre: 'invoice.finalized', texto: 'Invoice issued' },
            { nombre: 'invoice.sent', texto: 'Invoice sent to the client' },
            { nombre: 'invoice.paid', texto: 'Invoice paid' },
            { nombre: 'invoice.payment_failed', texto: 'Invoice payment failed' },
            { nombre: 'invoice.overdue', texto: 'Invoice overdue' },
            { nombre: 'invoice.voided', texto: 'Invoice voided' },
            { nombre: 'invoice.marked_uncollectible', texto: 'Invoice marked uncollectible' },
        ],
        sdksTitulo: 'SDKs and tools',
        sdks: [
            { nombre: 'Node', paquete: '@flouviahq/node', texto: 'Typed, with retries and cursor pagination.' },
            { nombre: 'CLI', paquete: '@flouviahq/cli', texto: 'Sign in from the terminal and test your webhooks.' },
            { nombre: 'MCP server', paquete: 'listar_facturas · crear_factura_borrador', texto: 'Your AI assistant reads invoices and prepares drafts; issuing stays with you.' },
            { nombre: 'Elements', paquete: '<cord-invoice>', texto: 'The invoice inside your site; payment opens in a Cord window.' },
            { nombre: 'Python', paquete: 'cord-sdk', texto: 'Same contract as the Node SDK.', proximamente: true },
            { nombre: 'PHP', paquete: 'flouviahq/cord', texto: 'Same contract as the Node SDK.', proximamente: true },
        ],
        proximamente: 'Coming soon',
        links: [
            { label: 'Invoices API', href: 'https://docs.cordhq.app/en/docs/desarrolladores/funciones/facturas' },
            { label: 'Webhooks', href: 'https://docs.cordhq.app/en/docs/desarrolladores/herramientas/webhooks' },
            { label: 'Cord for developers', href: '/en/desarrolladores/api' },
        ],
    },
};

export const facturacionFinanzas = (lang: Lang) => FINANZAS[lang];
export const facturacionPortal = (lang: Lang) => PORTAL[lang];
export const facturacionDev = (lang: Lang) => DEV[lang];
