import type { Lang } from './catalog';
import type { WorkflowDefinition } from './definition';

export interface WorkflowTemplate {
    key: string;
    nombre: Record<Lang, string>;
    descripcion: Record<Lang, string>;
    definicion: (lang: Lang) => WorkflowDefinition;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
    {
        key: 'escalera_seguimiento',
        nombre: { es: 'Escalera de seguimiento de una cotización', en: 'Quote follow-up ladder' },
        descripcion: {
            es: 'Espera a que el cliente abra; si no abre en 2 días le escribe, y si a los 5 sigue sin decidir avisa al dueño con el saldo que ya te debe.',
            en: 'Waits for the client to open it; if they do not in 2 days it emails them, and if there is still no decision after 5 it tells the owner how much they already owe you.',
        },
        definicion: (lang) => ({
            trigger: 'quote.sent',
            steps: [{
                id: 'abrio2d', type: 'wait_until', match: 'any',
                conditions: [
                    { field: 'estado_actual', op: 'eq', value: 'viewed' },
                    { field: 'estado_actual', op: 'eq', value: 'approved' },
                ],
                days: 2,
                then: [{
                    id: 'tareacaliente', type: 'action', action: 'create_task',
                    params: { titulo: lang === 'en' ? 'Call {{cliente}} while {{folio}} is warm' : 'Llamar a {{cliente}} mientras {{folio}} está caliente', dias: 1 },
                }],
                else: [
                    {
                        id: 'reescribe', type: 'action', action: 'send_client_email',
                        params: {
                            asunto: lang === 'en' ? 'Any questions about {{folio}}?' : '¿Alguna duda sobre {{folio}}?',
                            mensaje: lang === 'en'
                                ? 'Hi, we are following up on quote {{folio}} for {{total}} {{moneda}}. If anything needs adjusting, reply to this email and we will sort it out.'
                                : 'Hola, damos seguimiento a la cotización {{folio}} por {{total}} {{moneda}}. Si hay algo que ajustar, responde este correo y lo vemos.',
                        },
                    },
                    {
                        id: 'decide5d', type: 'wait_until', match: 'any',
                        conditions: [
                            { field: 'estado_actual', op: 'eq', value: 'approved' },
                            { field: 'estado_actual', op: 'eq', value: 'rejected' },
                        ],
                        days: 5,
                        then: [],
                        else: [
                            { id: 'saldocli', type: 'query', dataset: 'saldo_cliente', params: {} },
                            {
                                id: 'avisofrio', type: 'action', action: 'notify_team',
                                params: {
                                    destinatarios: 'owner',
                                    asunto: lang === 'en' ? '{{folio}} went a week without a decision' : '{{folio}} lleva una semana sin decisión',
                                    mensaje: lang === 'en'
                                        ? '{{cliente}} has not decided on {{folio}} ({{total}} {{moneda}}). Open balance with you: {{cliente_saldo}}, of which {{cliente_vencido}} is overdue.'
                                        : '{{cliente}} no ha decidido {{folio}} ({{total}} {{moneda}}). Saldo abierto contigo: {{cliente_saldo}}, de los cuales {{cliente_vencido}} están vencidos.',
                                },
                            },
                        ],
                    },
                ],
            }],
        }),
    },
    {
        key: 'aprobacion_express',
        nombre: { es: 'Aprobar solo las cotizaciones chicas', en: 'Auto-approve only small quotes' },
        descripcion: {
            es: 'Cuando una cotización pide aprobación interna, aprueba sola las de menos de 50,000 y deja las grandes para una persona, avisando al equipo.',
            en: 'When a quote requests internal approval, it approves the ones under 50,000 on its own and leaves the big ones to a person, alerting the team.',
        },
        definicion: (lang) => ({
            trigger: 'quote.approval_requested',
            steps: [{
                id: 'eschica', type: 'condition', match: 'all',
                conditions: [{ field: 'total', op: 'lt', value: 50000 }],
                then: [{ id: 'apruebasola', type: 'action', action: 'approve_quote_request', params: {} }],
                else: [{
                    id: 'avisogrande', type: 'action', action: 'notify_team',
                    params: {
                        destinatarios: 'all',
                        asunto: lang === 'en' ? '{{folio}} needs a person: {{total}} {{moneda}}' : '{{folio}} necesita a una persona: {{total}} {{moneda}}',
                        mensaje: lang === 'en'
                            ? 'The quote {{folio}} for {{cliente}} is above the automatic limit. Reason: {{motivo}}'
                            : 'La cotización {{folio}} de {{cliente}} pasa el límite automático. Motivo: {{motivo}}',
                    },
                }],
            }],
        }),
    },
    {
        key: 'teams_aprobada',
        nombre: { es: 'Teams cuando el cliente aprueba', en: 'Teams when the client approves' },
        descripcion: {
            es: 'Publica una tarjeta en tu canal de Microsoft Teams cada vez que un cliente aprueba una cotización.',
            en: 'Posts a card to your Microsoft Teams channel every time a client approves a quote.',
        },
        definicion: (lang) => ({
            trigger: 'quote.approved',
            steps: [{
                id: 'teamsaprob', type: 'action', action: 'teams_message',
                params: { mensaje: lang === 'en' ? '{{cliente}} approved {{folio}}: {{total}} {{moneda}}' : '{{cliente}} aprobó {{folio}}: {{total}} {{moneda}}' },
            }],
        }),
    },
    {
        key: 'hubspot_aprobada',
        nombre: { es: 'Nota en HubSpot cuando el cliente aprueba', en: 'HubSpot note when the client approves' },
        descripcion: {
            es: 'Cuando un cliente aprueba una cotización, deja una nota en su Deal de HubSpot y avisa en Slack.',
            en: 'When a client approves a quote, add a note to its HubSpot Deal and post to Slack.',
        },
        definicion: (lang) => ({
            trigger: 'quote.approved',
            steps: [
                {
                    id: 'notahubspot', type: 'action', action: 'hubspot_note',
                    params: { mensaje: lang === 'en' ? '{{cliente}} approved {{folio}} for {{total}} {{moneda}} in Cord.' : '{{cliente}} aprobó {{folio}} por {{total}} {{moneda}} en Cord.' },
                },
                {
                    id: 'slackaprobada', type: 'action', action: 'slack_message',
                    params: { mensaje: lang === 'en' ? '{{cliente}} approved {{folio}}' : '{{cliente}} aprobó {{folio}}' },
                },
            ],
        }),
    },
    {
        key: 'cobranza_escalonada',
        nombre: { es: 'Cobranza escalonada de una factura vencida', en: 'Staged collection of an overdue invoice' },
        descripcion: {
            es: 'A los 3 días de vencida le escribe al cliente; si a los 15 sigue abierta, consulta su saldo y avisa al equipo para decidir si se detiene el crédito.',
            en: 'Three days past due it emails the client; if it is still open at 15, it looks up their balance and alerts the team to decide whether to stop credit.',
        },
        definicion: (lang) => ({
            trigger: 'invoice.past_due',
            steps: [
                {
                    id: 'dia3', type: 'condition', match: 'all',
                    conditions: [{ field: 'dias_vencida', op: 'eq', value: 3 }],
                    then: [{
                        id: 'cobrocliente', type: 'action', action: 'send_client_email',
                        params: {
                            asunto: lang === 'en' ? 'Invoice {{numero}} is past due' : 'La factura {{numero}} está vencida',
                            mensaje: lang === 'en'
                                ? 'Hi, invoice {{numero}} for {{saldo}} {{moneda}} was due on {{vence}}. You can pay it from the button below; if it is already paid, ignore this message.'
                                : 'Hola, la factura {{numero}} por {{saldo}} {{moneda}} venció el {{vence}}. Puedes pagarla desde el botón de abajo; si ya la pagaste, ignora este mensaje.',
                        },
                    }],
                    else: [],
                },
                {
                    id: 'dia15', type: 'condition', match: 'all',
                    conditions: [{ field: 'dias_vencida', op: 'eq', value: 15 }],
                    then: [
                        { id: 'saldocli2', type: 'query', dataset: 'saldo_cliente', params: {} },
                        {
                            id: 'avisocredito', type: 'action', action: 'notify_team',
                            params: {
                                destinatarios: 'owner',
                                asunto: lang === 'en' ? '{{cliente}}: 15 days past due' : '{{cliente}}: 15 días de vencido',
                                mensaje: lang === 'en'
                                    ? 'Invoice {{numero}} ({{saldo}} {{moneda}}) is 15 days past due. Total open with this client: {{cliente_saldo}}, overdue {{cliente_vencido}} across {{cliente_documentos}} documents.'
                                    : 'La factura {{numero}} ({{saldo}} {{moneda}}) lleva 15 días vencida. Total abierto con este cliente: {{cliente_saldo}}, vencido {{cliente_vencido}} en {{cliente_documentos}} documentos.',
                            },
                        },
                    ],
                    else: [],
                },
            ],
        }),
    },
    {
        key: 'anticipo_recibido',
        nombre: { es: 'Arrancar cuando llega el anticipo', en: 'Kick off when the deposit arrives' },
        descripcion: {
            es: 'Cuando el cliente paga el anticipo, crea la tarea para empezar el trabajo y avisa al dueño con el saldo pendiente.',
            en: 'When the client pays the deposit, create the task to start the work and tell the owner the remaining balance.',
        },
        definicion: (lang) => ({
            trigger: 'payment.partial',
            steps: [{
                id: 'esanticipo', type: 'condition', match: 'all',
                conditions: [{ field: 'tipo', op: 'eq', value: 'anticipo' }],
                then: [
                    {
                        id: 'tareaarranque', type: 'action', action: 'create_task',
                        params: { titulo: lang === 'en' ? 'Start the work for {{folio}} ({{cliente}})' : 'Arrancar el trabajo de {{folio}} ({{cliente}})', dias: 1 },
                    },
                    {
                        id: 'avisoanticipo', type: 'action', action: 'notify_team',
                        params: {
                            destinatarios: 'owner',
                            asunto: lang === 'en' ? '{{cliente}} paid the deposit for {{folio}}' : '{{cliente}} pagó el anticipo de {{folio}}',
                            mensaje: lang === 'en' ? 'A deposit of {{monto}} {{moneda}} arrived. Remaining balance: {{saldo_pendiente}} {{moneda}}.' : 'Llegó un anticipo de {{monto}} {{moneda}}. Saldo pendiente: {{saldo_pendiente}} {{moneda}}.',
                        },
                    },
                ],
                else: [],
            }],
        }),
    },
    {
        key: 'resumen_semanal',
        nombre: { es: 'Resumen de cobranza cada lunes', en: 'Collections summary every Monday' },
        descripcion: {
            es: 'Cada lunes a las 9 consulta tu cartera vencida y tu pipeline, y le manda el resumen al dueño de la cuenta.',
            en: 'Every Monday at 9 it looks up your overdue receivables and pipeline, and emails the summary to the account owner.',
        },
        definicion: (lang) => ({
            trigger: 'schedule.tick',
            schedule: { freq: 'weekly', hour: 9, weekday: 1 },
            steps: [
                { id: 'concart', type: 'query', dataset: 'cartera_vencida', params: {} },
                { id: 'conpipe', type: 'query', dataset: 'pipeline_abierto', params: {} },
                {
                    id: 'resumen', type: 'action', action: 'notify_team',
                    params: {
                        destinatarios: 'owner',
                        asunto: lang === 'en' ? 'Your week in Cord ({{fecha}})' : 'Tu semana en Cord ({{fecha}})',
                        mensaje: lang === 'en'
                            ? 'Overdue: {{vencido_total}} across {{vencido_cantidad}} documents, the oldest {{vencido_dias_max}} days past due.\nOpen pipeline: {{pipeline_total}} across {{pipeline_cantidad}} quotes.'
                            : 'Vencido: {{vencido_total}} en {{vencido_cantidad}} documentos, el más atrasado {{vencido_dias_max}} días.\nPipeline abierto: {{pipeline_total}} en {{pipeline_cantidad}} cotizaciones.',
                    },
                },
            ],
        }),
    },
    {
        key: 'recordatorio_antes_vencer',
        nombre: { es: 'Recordar al cliente 3 días antes del vencimiento', en: 'Remind the client 3 days before the due date' },
        descripcion: {
            es: 'Tres días antes de que venza una factura abierta, le escribe al cliente con el botón para pagarla.',
            en: 'Three days before an open invoice is due, emails the client with the button to pay it.',
        },
        definicion: (lang) => ({
            trigger: 'invoice.due_soon',
            steps: [{
                id: 'faltan3', type: 'condition', match: 'all',
                conditions: [{ field: 'dias_para_vencer', op: 'eq', value: 3 }],
                then: [{
                    id: 'avisocliente', type: 'action', action: 'send_client_email',
                    params: {
                        asunto: lang === 'en' ? 'Invoice {{numero}} is due on {{vence}}' : 'La factura {{numero}} vence el {{vence}}',
                        mensaje: lang === 'en'
                            ? 'Hi, a reminder that invoice {{numero}} for {{saldo}} {{moneda}} is due on {{vence}}. You can pay it from the button below.'
                            : 'Hola, te recordamos que la factura {{numero}} por {{saldo}} {{moneda}} vence el {{vence}}. Puedes pagarla desde el botón de abajo.',
                    },
                }],
                else: [],
            }],
        }),
    },
    {
        key: 'ultima_llamada_y_cierre',
        nombre: { es: 'Última llamada y cierre de la cotización', en: 'Last call and quote close-out' },
        descripcion: {
            es: 'Dos días antes de la vigencia le escribe al cliente y espera su decisión; si no llega, caduca la cotización y avisa al dueño.',
            en: 'Two days before it expires it emails the client and waits for a decision; if none arrives, it expires the quote and tells the owner.',
        },
        definicion: (lang) => ({
            trigger: 'quote.expiring',
            steps: [{
                id: 'faltan2', type: 'condition', match: 'all',
                conditions: [{ field: 'dias_para_vencer', op: 'eq', value: 2 }],
                then: [
                    {
                        id: 'ultimallamada', type: 'action', action: 'send_client_email',
                        params: {
                            asunto: lang === 'en' ? 'Quote {{folio}} expires on {{vence}}' : 'La cotización {{folio}} vence el {{vence}}',
                            mensaje: lang === 'en'
                                ? 'Hi, quote {{folio}} for {{total}} {{moneda}} is valid until {{vence}}. If it still works for you, you can approve it from the link below.'
                                : 'Hola, la cotización {{folio}} por {{total}} {{moneda}} tiene vigencia hasta el {{vence}}. Si te sigue funcionando, puedes aprobarla desde el enlace de abajo.',
                        },
                    },
                    {
                        id: 'decidio', type: 'wait_until', match: 'any',
                        conditions: [
                            { field: 'estado_actual', op: 'eq', value: 'approved' },
                            { field: 'estado_actual', op: 'eq', value: 'rejected' },
                        ],
                        days: 2,
                        then: [],
                        else: [
                            { id: 'caducar', type: 'action', action: 'expire_quote', params: {} },
                            {
                                id: 'avisocierre', type: 'action', action: 'notify_team',
                                params: {
                                    destinatarios: 'owner',
                                    asunto: lang === 'en' ? '{{folio}} expired without an answer' : '{{folio}} caducó sin respuesta',
                                    mensaje: lang === 'en'
                                        ? 'The quote {{folio}} for {{cliente}} ({{total}} {{moneda}}) expired without a decision and is now closed.'
                                        : 'La cotización {{folio}} de {{cliente}} ({{total}} {{moneda}}) caducó sin decisión y quedó cerrada.',
                                },
                            },
                        ],
                    },
                ],
                else: [],
            }],
        }),
    },
];
