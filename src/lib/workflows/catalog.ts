export type Lang = 'es' | 'en';
export type Text = Record<Lang, string>;
export type FieldType = 'text' | 'number' | 'enum' | 'boolean';

export interface WorkflowField {
    key: string;
    label: Text;
    type: FieldType;
    options?: { value: string; label: Text }[];
    live?: boolean;
}

export type TriggerCategory = 'quotes' | 'approvals' | 'payments' | 'invoices' | 'clients' | 'products' | 'tasks';

export interface WorkflowTrigger {
    type: string;
    category: TriggerCategory;
    label: Text;
    fields: WorkflowField[];
}

export const TRIGGER_CATEGORIES: { key: TriggerCategory; label: Text }[] = [
    { key: 'quotes', label: { es: 'Cotizaciones', en: 'Quotes' } },
    { key: 'approvals', label: { es: 'Aprobaciones', en: 'Approvals' } },
    { key: 'payments', label: { es: 'Pagos', en: 'Payments' } },
    { key: 'invoices', label: { es: 'Facturas', en: 'Invoices' } },
    { key: 'clients', label: { es: 'Clientes', en: 'Clients' } },
    { key: 'products', label: { es: 'Productos', en: 'Products' } },
    { key: 'tasks', label: { es: 'Tareas y promesas', en: 'Tasks and promises' } },
];

const opt = (value: string, es: string, en: string) => ({ value, label: { es, en } });

const QUOTE_STATUS = [
    opt('draft', 'Borrador', 'Draft'), opt('sent', 'Enviada', 'Sent'), opt('viewed', 'Vista', 'Viewed'),
    opt('approved', 'Aprobada', 'Approved'), opt('rejected', 'Rechazada', 'Rejected'), opt('expired', 'Vencida', 'Expired'),
    opt('paid', 'Pagada', 'Paid'), opt('invoiced', 'Facturada', 'Invoiced'),
];
const INVOICE_STATUS = [
    opt('draft', 'Borrador', 'Draft'), opt('open', 'Abierta', 'Open'), opt('paid', 'Pagada', 'Paid'),
    opt('void', 'Anulada', 'Void'), opt('uncollectible', 'Incobrable', 'Uncollectible'),
];
const ACTOR = [
    opt('cliente', 'El cliente', 'The client'), opt('usuario', 'Alguien del equipo', 'A team member'),
    opt('api', 'La API', 'The API'), opt('mcp', 'Un agente de IA (MCP)', 'An AI agent (MCP)'),
    opt('workflow', 'Otro workflow', 'Another workflow'), opt('sistema', 'Cord automáticamente', 'Cord automatically'),
];

const f = (key: string, es: string, en: string, type: FieldType, extra: Partial<WorkflowField> = {}): WorkflowField =>
    ({ key, label: { es, en }, type, ...extra });

const ACTOR_FIELD = f('actor_tipo', 'Quién lo originó', 'Who caused it', 'enum', { options: ACTOR });

const QUOTE_FIELDS: WorkflowField[] = [
    f('folio', 'Folio', 'Number', 'text'),
    f('cliente', 'Cliente', 'Client', 'text'),
    f('total', 'Total', 'Total', 'number'),
    f('moneda', 'Divisa', 'Currency', 'text'),
    f('status', 'Estado en el evento', 'Status at the event', 'enum', { options: QUOTE_STATUS }),
    f('estado_actual', 'Estado actual de la cotización', 'Current quote status', 'enum', { options: QUOTE_STATUS, live: true }),
    ACTOR_FIELD,
];

const INVOICE_FIELDS: WorkflowField[] = [
    f('numero', 'Número', 'Number', 'text'),
    f('cliente', 'Cliente', 'Client', 'text'),
    f('total', 'Total', 'Total', 'number'),
    f('saldo', 'Saldo pendiente', 'Balance due', 'number'),
    f('moneda', 'Divisa', 'Currency', 'text'),
    f('pais', 'País', 'Country', 'text'),
    f('estado', 'Estado en el evento', 'Status at the event', 'enum', { options: INVOICE_STATUS }),
    f('estado_actual', 'Estado actual de la factura', 'Current invoice status', 'enum', { options: INVOICE_STATUS, live: true }),
    ACTOR_FIELD,
];

const CLIENT_FIELDS: WorkflowField[] = [
    f('empresa', 'Empresa', 'Company', 'text'),
    f('email', 'Correo', 'Email', 'text'),
    f('country_code', 'País', 'Country', 'text'),
    f('terminos', 'Términos de pago', 'Payment terms', 'enum', {
        options: [opt('contado', 'Contado', 'Upfront'), opt('net30', '30 días', 'Net 30'), opt('net60', '60 días', 'Net 60')],
    }),
    ACTOR_FIELD,
];

const PRODUCT_FIELDS: WorkflowField[] = [
    f('nombre', 'Nombre', 'Name', 'text'),
    f('precio_lista', 'Precio de lista', 'List price', 'number'),
    f('activo', 'Activo', 'Active', 'boolean'),
    ACTOR_FIELD,
];

const trigger = (type: string, category: TriggerCategory, es: string, en: string, fields: WorkflowField[]): WorkflowTrigger =>
    ({ type, category, label: { es, en }, fields });

export const WORKFLOW_TRIGGERS: WorkflowTrigger[] = [
    trigger('quote.created', 'quotes', 'Se crea una cotización', 'A quote is created', QUOTE_FIELDS),
    trigger('quote.sent', 'quotes', 'Se envía una cotización', 'A quote is sent', QUOTE_FIELDS),
    trigger('quote.viewed', 'quotes', 'El cliente abre la cotización', 'The client opens the quote', QUOTE_FIELDS),
    trigger('quote.approved', 'quotes', 'Se aprueba una cotización', 'A quote is approved', QUOTE_FIELDS),
    trigger('quote.rejected', 'quotes', 'Se rechaza una cotización', 'A quote is rejected', QUOTE_FIELDS),
    trigger('quote.updated', 'quotes', 'Se modifica y reenvía una cotización', 'A quote is edited and resent', QUOTE_FIELDS),
    trigger('quote.expired', 'quotes', 'Vence una cotización', 'A quote expires', QUOTE_FIELDS),
    trigger('quote.deleted', 'quotes', 'Se elimina un borrador', 'A draft is deleted', QUOTE_FIELDS.filter((x) => !x.live)),
    trigger('quote.comment_added', 'quotes', 'Llega un mensaje en una cotización', 'A message is posted on a quote', [
        ...QUOTE_FIELDS,
        f('autor', 'Quién escribió', 'Who wrote it', 'enum', { options: [opt('cliente', 'El cliente', 'The client'), opt('vendedor', 'El equipo', 'The team')] }),
        f('mensaje', 'Mensaje', 'Message', 'text'),
    ]),
    trigger('quote.approval_requested', 'approvals', 'Una cotización pide aprobación interna', 'A quote requests internal approval', [
        ...QUOTE_FIELDS, f('motivo', 'Motivo', 'Reason', 'text'),
    ]),
    trigger('quote.approval_decided', 'approvals', 'Se decide una aprobación interna', 'An internal approval is decided', [
        ...QUOTE_FIELDS,
        f('decision', 'Decisión', 'Decision', 'enum', { options: [opt('approved', 'Aprobada', 'Approved'), opt('rejected', 'Rechazada', 'Rejected')] }),
    ]),
    trigger('quote.paid', 'payments', 'Se paga por completo una cotización', 'A quote is paid in full', QUOTE_FIELDS),
    trigger('payment.partial', 'payments', 'Llega un pago parcial', 'A partial payment arrives', [
        ...QUOTE_FIELDS,
        f('monto', 'Monto pagado', 'Amount paid', 'number'),
        f('saldo_pendiente', 'Saldo pendiente', 'Balance due', 'number'),
        f('tipo', 'Tipo de pago', 'Payment type', 'enum', { options: [opt('anticipo', 'Anticipo', 'Deposit'), opt('saldo', 'Saldo', 'Balance'), opt('cuota', 'Cuota', 'Installment')] }),
    ]),
    trigger('payment.failed', 'payments', 'Falla un cobro recurrente', 'A recurring charge fails', QUOTE_FIELDS),
    trigger('invoice.issued', 'invoices', 'Se factura una cotización', 'A quote is invoiced', QUOTE_FIELDS),
    trigger('invoice.stamped', 'invoices', 'Se timbra el CFDI de una cotización', 'A quote CFDI is stamped', QUOTE_FIELDS),
    trigger('invoice.finalized', 'invoices', 'Se emite una factura', 'An invoice is issued', INVOICE_FIELDS),
    trigger('invoice.sent', 'invoices', 'Se envía una factura', 'An invoice is sent', INVOICE_FIELDS),
    trigger('invoice.paid', 'invoices', 'Se paga una factura', 'An invoice is paid', INVOICE_FIELDS),
    trigger('invoice.payment_failed', 'invoices', 'Falla el pago de una factura', 'An invoice payment fails', INVOICE_FIELDS),
    trigger('invoice.overdue', 'invoices', 'Vence una factura', 'An invoice becomes overdue', INVOICE_FIELDS),
    trigger('invoice.voided', 'invoices', 'Se anula una factura', 'An invoice is voided', INVOICE_FIELDS),
    trigger('invoice.marked_uncollectible', 'invoices', 'Se marca una factura como incobrable', 'An invoice is marked uncollectible', INVOICE_FIELDS),
    trigger('client.created', 'clients', 'Se crea un cliente', 'A client is created', CLIENT_FIELDS),
    trigger('client.updated', 'clients', 'Se actualiza un cliente', 'A client is updated', CLIENT_FIELDS),
    trigger('client.deleted', 'clients', 'Se elimina un cliente', 'A client is deleted', [f('empresa', 'Empresa', 'Company', 'text'), ACTOR_FIELD]),
    trigger('product.created', 'products', 'Se crea un producto', 'A product is created', PRODUCT_FIELDS),
    trigger('product.updated', 'products', 'Se actualiza un producto', 'A product is updated', PRODUCT_FIELDS),
    trigger('product.deleted', 'products', 'Se elimina un producto', 'A product is deleted', [f('nombre', 'Nombre', 'Name', 'text'), ACTOR_FIELD]),
    trigger('task.created', 'tasks', 'Se crea una tarea', 'A task is created', [f('titulo', 'Título', 'Title', 'text'), ACTOR_FIELD]),
    trigger('task.completed', 'tasks', 'Se completa una tarea', 'A task is completed', [f('titulo', 'Título', 'Title', 'text'), ACTOR_FIELD]),
    trigger('promise.created', 'tasks', 'Se registra una promesa de pago', 'A payment promise is recorded', [
        f('monto', 'Monto prometido', 'Promised amount', 'number'), f('fecha_promesa', 'Fecha prometida', 'Promised date', 'text'), ACTOR_FIELD,
    ]),
    trigger('promise.kept', 'tasks', 'Se cumple una promesa de pago', 'A payment promise is kept', [f('monto', 'Monto prometido', 'Promised amount', 'number'), ACTOR_FIELD]),
    trigger('promise.broken', 'tasks', 'Se incumple una promesa de pago', 'A payment promise is broken', [f('monto', 'Monto prometido', 'Promised amount', 'number'), ACTOR_FIELD]),
];

export const findTrigger = (type: string | null | undefined) => WORKFLOW_TRIGGERS.find((t) => t.type === type);

export type Operator = 'eq' | 'neq' | 'contains' | 'not_contains' | 'empty' | 'not_empty' | 'gt' | 'gte' | 'lt' | 'lte' | 'is_true' | 'is_false';

export const OPERATORS: Record<FieldType, { op: Operator; label: Text; needsValue: boolean }[]> = {
    text: [
        { op: 'eq', label: { es: 'es igual a', en: 'is' }, needsValue: true },
        { op: 'neq', label: { es: 'no es igual a', en: 'is not' }, needsValue: true },
        { op: 'contains', label: { es: 'contiene', en: 'contains' }, needsValue: true },
        { op: 'not_contains', label: { es: 'no contiene', en: 'does not contain' }, needsValue: true },
        { op: 'empty', label: { es: 'está vacío', en: 'is empty' }, needsValue: false },
        { op: 'not_empty', label: { es: 'no está vacío', en: 'is not empty' }, needsValue: false },
    ],
    number: [
        { op: 'gte', label: { es: 'es mayor o igual a', en: 'is at least' }, needsValue: true },
        { op: 'gt', label: { es: 'es mayor que', en: 'is greater than' }, needsValue: true },
        { op: 'lte', label: { es: 'es menor o igual a', en: 'is at most' }, needsValue: true },
        { op: 'lt', label: { es: 'es menor que', en: 'is less than' }, needsValue: true },
        { op: 'eq', label: { es: 'es igual a', en: 'equals' }, needsValue: true },
        { op: 'neq', label: { es: 'no es igual a', en: 'does not equal' }, needsValue: true },
    ],
    enum: [
        { op: 'eq', label: { es: 'es', en: 'is' }, needsValue: true },
        { op: 'neq', label: { es: 'no es', en: 'is not' }, needsValue: true },
    ],
    boolean: [
        { op: 'is_true', label: { es: 'es sí', en: 'is yes' }, needsValue: false },
        { op: 'is_false', label: { es: 'es no', en: 'is no' }, needsValue: false },
    ],
};

export type ActionKey = 'create_task' | 'notify_team' | 'slack_message';

export interface ActionParam {
    key: string;
    label: Text;
    hint?: Text;
    kind: 'template' | 'template_long' | 'days' | 'choice';
    required: boolean;
    max?: number;
    options?: { value: string; label: Text }[];
}

export interface WorkflowActionDef {
    key: ActionKey;
    label: Text;
    description: Text;
    params: ActionParam[];
}

export const WORKFLOW_ACTIONS: WorkflowActionDef[] = [
    {
        key: 'create_task',
        label: { es: 'Crear una tarea', en: 'Create a task' },
        description: { es: 'Agrega una tarea de seguimiento para el equipo. Si el evento es de una cotización, queda ligada a ella.', en: 'Adds a follow-up task for the team. If the event is about a quote, the task is linked to it.' },
        params: [
            { key: 'titulo', label: { es: 'Título de la tarea', en: 'Task title' }, kind: 'template', required: true, max: 200 },
            { key: 'dias', label: { es: 'Vence en (días)', en: 'Due in (days)' }, hint: { es: 'Déjalo vacío para una tarea sin fecha.', en: 'Leave empty for a task without a date.' }, kind: 'days', required: false, max: 365 },
        ],
    },
    {
        key: 'notify_team',
        label: { es: 'Avisar al equipo por correo', en: 'Email the team' },
        description: { es: 'Envía un correo a personas de tu organización. Nunca le escribe al cliente.', en: 'Sends an email to people in your organization. It never writes to the client.' },
        params: [
            {
                key: 'destinatarios', label: { es: 'Para', en: 'To' }, kind: 'choice', required: true,
                options: [opt('owner', 'El dueño de la cuenta', 'The account owner'), opt('all', 'Todo el equipo', 'The whole team')],
            },
            { key: 'asunto', label: { es: 'Asunto', en: 'Subject' }, kind: 'template', required: true, max: 150 },
            { key: 'mensaje', label: { es: 'Mensaje', en: 'Message' }, kind: 'template_long', required: true, max: 2000 },
        ],
    },
    {
        key: 'slack_message',
        label: { es: 'Enviar un mensaje a Slack', en: 'Send a Slack message' },
        description: { es: 'Publica en el canal de Slack que conectaste en Ajustes › Integraciones.', en: 'Posts to the Slack channel you connected in Settings › Integrations.' },
        params: [
            { key: 'mensaje', label: { es: 'Mensaje', en: 'Message' }, kind: 'template_long', required: true, max: 1000 },
        ],
    },
];

export const findAction = (key: string | null | undefined) => WORKFLOW_ACTIONS.find((a) => a.key === key);

export const WAIT_MAX_DAYS = 30;
export const MAX_STEPS = 30;
export const MAX_NESTING = 4;
export const MAX_CONDITIONS = 5;
