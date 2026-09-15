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
];
