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
        key: 'seguimiento',
        nombre: { es: 'Seguimiento si el cliente no abre', en: 'Follow up if the client does not open' },
        descripcion: {
            es: 'Tres días después de enviar una cotización, si sigue sin abrirse, crea una tarea para llamar al cliente.',
            en: 'Three days after sending a quote, if it is still unopened, create a task to call the client.',
        },
        definicion: (lang) => ({
            trigger: 'quote.sent',
            steps: [
                { id: 'espera3', type: 'wait', days: 3 },
                {
                    id: 'sigueenviada', type: 'condition', match: 'all',
                    conditions: [{ field: 'estado_actual', op: 'eq', value: 'sent' }],
                    then: [{
                        id: 'tareallamar', type: 'action', action: 'create_task',
                        params: { titulo: lang === 'en' ? 'Call {{cliente}} about {{folio}}' : 'Llamar a {{cliente}} por {{folio}}', dias: 0 },
                    }],
                    else: [],
                },
            ],
        }),
    },
    {
        key: 'venta_grande',
        nombre: { es: 'Aviso de venta grande', en: 'Large deal alert' },
        descripcion: {
            es: 'Cuando se aprueba una cotización de 100,000 o más, avisa por correo al dueño de la cuenta.',
            en: 'When a quote of 100,000 or more is approved, email the account owner.',
        },
        definicion: (lang) => ({
            trigger: 'quote.approved',
            steps: [{
                id: 'montogrande', type: 'condition', match: 'all',
                conditions: [{ field: 'total', op: 'gte', value: 100000 }],
                then: [{
                    id: 'avisodueno', type: 'action', action: 'notify_team',
                    params: {
                        destinatarios: 'owner',
                        asunto: lang === 'en' ? '{{cliente}} approved {{folio}}' : '{{cliente}} aprobó {{folio}}',
                        mensaje: lang === 'en' ? 'Quote {{folio}} for {{total}} {{moneda}} was approved.' : 'Se aprobó la cotización {{folio}} por {{total}} {{moneda}}.',
                    },
                }],
                else: [],
            }],
        }),
    },
    {
        key: 'slack_pago',
        nombre: { es: 'Slack cuando entra un pago', en: 'Slack when a payment arrives' },
        descripcion: {
            es: 'Publica en tu canal de Slack cada vez que una cotización queda pagada.',
            en: 'Posts to your Slack channel every time a quote is paid.',
        },
        definicion: (lang) => ({
            trigger: 'quote.paid',
            steps: [{
                id: 'slackpago', type: 'action', action: 'slack_message',
                params: { mensaje: lang === 'en' ? '{{cliente}} paid {{folio}}: {{total}} {{moneda}}' : '{{cliente}} pagó {{folio}}: {{total}} {{moneda}}' },
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
        key: 'promesa_incumplida',
        nombre: { es: 'Promesa de pago incumplida', en: 'Broken payment promise' },
        descripcion: {
            es: 'Si un cliente no cumple su promesa de pago, crea una tarea de cobranza para hoy y avisa al equipo.',
            en: 'If a client breaks a payment promise, create a collections task for today and notify the team.',
        },
        definicion: (lang) => ({
            trigger: 'promise.broken',
            steps: [
                {
                    id: 'tareacobro', type: 'action', action: 'create_task',
                    params: { titulo: lang === 'en' ? 'Follow up on a broken promise of {{monto}}' : 'Dar seguimiento a promesa incumplida de {{monto}}', dias: 0 },
                },
                {
                    id: 'avisoequipo', type: 'action', action: 'notify_team',
                    params: {
                        destinatarios: 'all',
                        asunto: lang === 'en' ? 'Payment promise broken' : 'Promesa de pago incumplida',
                        mensaje: lang === 'en' ? 'A promised payment of {{monto}} was not received.' : 'No llegó el pago prometido de {{monto}}.',
                    },
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
        key: 'factura_vencida',
        nombre: { es: 'Cobranza de facturas vencidas', en: 'Collect overdue invoices' },
        descripcion: {
            es: 'Cuando vence una factura, crea la tarea de cobro; si una semana después sigue abierta, avisa al dueño de la cuenta.',
            en: 'When an invoice becomes overdue, create a collection task; if it is still open a week later, tell the account owner.',
        },
        definicion: (lang) => ({
            trigger: 'invoice.overdue',
            steps: [
                {
                    id: 'tareacobro', type: 'action', action: 'create_task',
                    params: { titulo: lang === 'en' ? 'Collect invoice {{numero}} from {{cliente}}' : 'Cobrar la factura {{numero}} de {{cliente}}', dias: 0 },
                },
                { id: 'espera7', type: 'wait', days: 7 },
                {
                    id: 'sigueabierta', type: 'condition', match: 'all',
                    conditions: [{ field: 'estado_actual', op: 'eq', value: 'open' }],
                    then: [{
                        id: 'avisovencida', type: 'action', action: 'notify_team',
                        params: {
                            destinatarios: 'owner',
                            asunto: lang === 'en' ? 'Invoice {{numero}} is still unpaid' : 'La factura {{numero}} sigue sin pagarse',
                            mensaje: lang === 'en' ? '{{cliente}} still owes {{saldo}} {{moneda}} a week after the due date.' : '{{cliente}} todavía debe {{saldo}} {{moneda}} una semana después del vencimiento.',
                        },
                    }],
                    else: [],
                },
            ],
        }),
    },
    {
        key: 'cotizacion_rechazada',
        nombre: { es: 'Recuperar una cotización rechazada', en: 'Win back a rejected quote' },
        descripcion: {
            es: 'Cuando un cliente rechaza una cotización, crea una tarea para llamarle mañana y avisa al dueño de la cuenta.',
            en: 'When a client rejects a quote, create a task to call them tomorrow and tell the account owner.',
        },
        definicion: (lang) => ({
            trigger: 'quote.rejected',
            steps: [
                {
                    id: 'tarearecuperar', type: 'action', action: 'create_task',
                    params: { titulo: lang === 'en' ? 'Ask {{cliente}} why they rejected {{folio}}' : 'Preguntar a {{cliente}} por qué rechazó {{folio}}', dias: 1 },
                },
                {
                    id: 'avisorechazo', type: 'action', action: 'notify_team',
                    params: {
                        destinatarios: 'owner',
                        asunto: lang === 'en' ? '{{cliente}} rejected {{folio}}' : '{{cliente}} rechazó {{folio}}',
                        mensaje: lang === 'en' ? 'The quote {{folio}} for {{total}} {{moneda}} was rejected. A follow-up task was created for tomorrow.' : 'La cotización {{folio}} por {{total}} {{moneda}} fue rechazada. Quedó una tarea de seguimiento para mañana.',
                    },
                },
            ],
        }),
    },
    {
        key: 'aprobacion_interna',
        nombre: { es: 'Avisar cuando una cotización pide aprobación', en: 'Alert when a quote needs approval' },
        descripcion: {
            es: 'Cuando una cotización necesita aprobación interna, avisa por correo a todo el equipo con el motivo para que nadie la deje esperando.',
            en: 'When a quote needs internal approval, email the whole team with the reason so nobody leaves it waiting.',
        },
        definicion: (lang) => ({
            trigger: 'quote.approval_requested',
            steps: [{
                id: 'avisoaprobacion', type: 'action', action: 'notify_team',
                params: {
                    destinatarios: 'all',
                    asunto: lang === 'en' ? '{{folio}} is waiting for approval' : '{{folio}} espera aprobación',
                    mensaje: lang === 'en' ? 'The quote {{folio}} for {{cliente}} ({{total}} {{moneda}}) needs internal approval. Reason: {{motivo}}' : 'La cotización {{folio}} para {{cliente}} ({{total}} {{moneda}}) necesita aprobación interna. Motivo: {{motivo}}',
                },
            }],
        }),
    },
];
