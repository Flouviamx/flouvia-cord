export type Lang = 'es' | 'en';
export type Text = Record<Lang, string>;
export type FieldType = 'text' | 'number' | 'enum' | 'boolean';

export interface WorkflowField {
    key: string;
    label: Text;
    type: FieldType;
    options?: { value: string; label: Text }[];
    live?: boolean;
    /**
     * El evento trae también el valor ANTERIOR, en `<key>_anterior`. Habilita
     * los operadores de cambio: una condición sobre el valor actual no
     * distingue "siempre fue 20%" de "acaba de subir a 20%".
     */
    prev?: boolean;
}

export type TriggerCategory = 'schedule' | 'quotes' | 'approvals' | 'payments' | 'invoices' | 'clients' | 'products' | 'tasks';

/**
 * Objeto sobre el que el disparador puede ACTUAR, no el objeto del evento. Un
 * evento de contracargo trae el folio de la cotización, pero su `cotizacion_id`
 * puede venir nulo: ahí una acción que muta la cotización fallaría en ejecución
 * en vez de avisarse al publicar.
 */
export type TriggerObject = 'quote' | 'invoice';

export interface WorkflowTrigger {
    type: string;
    category: TriggerCategory;
    label: Text;
    fields: WorkflowField[];
    object?: TriggerObject;
}

export const TRIGGER_CATEGORIES: { key: TriggerCategory; label: Text }[] = [
    { key: 'schedule', label: { es: 'Programado', en: 'Scheduled' } },
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

/**
 * Datos del NEGOCIO, disponibles en todos los disparadores. Antes el vocabulario
 * era fijo por evento, así que un correo al cliente no podía firmar con el
 * nombre del negocio sin escribirlo a mano en cada workflow — y al cambiar el
 * nombre había que editarlos todos.
 *
 * Solo campos que la organización ya tiene en Ajustes: nada que se pida "para
 * el workflow" y quede sin consumidor en el resto de la app (regla 15).
 */
export const ORG_FIELDS: WorkflowField[] = [
    f('negocio', 'Nombre de tu negocio', 'Your business name', 'text'),
    f('negocio_correo', 'Correo de contacto de tu negocio', "Your business's contact email", 'text'),
    f('negocio_telefono', 'Teléfono de tu negocio', "Your business's phone", 'text'),
    f('negocio_moneda', 'Divisa de tu negocio', "Your business's currency", 'text'),
    f('hoy', 'Fecha de hoy', "Today's date", 'text'),
];

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

const withPrev = (fields: WorkflowField[], keys: string[]): WorkflowField[] =>
    fields.map((f) => (keys.includes(f.key) ? { ...f, prev: true } : f));

const prevField = (source: WorkflowField[], key: string, es: string, en: string): WorkflowField => {
    const base = source.find((f) => f.key === key)!;
    return { ...base, key: `${key}_anterior`, label: { es, en }, live: false, prev: false };
};

const QUOTE_UPDATED_FIELDS: WorkflowField[] = [
    ...withPrev(QUOTE_FIELDS, ['total']),
    prevField(QUOTE_FIELDS, 'total', 'Total anterior', 'Previous total'),
];

const QUOTE_EXPIRING_FIELDS: WorkflowField[] = [
    ...QUOTE_FIELDS,
    f('dias_para_vencer', 'Días para que venza', 'Days until it expires', 'number'),
    f('vence', 'Fecha de vigencia', 'Expiration date', 'text'),
];

const INVOICE_DUE_FIELDS: WorkflowField[] = [
    ...INVOICE_FIELDS,
    f('dias_para_vencer', 'Días para que venza', 'Days until due', 'number'),
    f('vence', 'Fecha de vencimiento', 'Due date', 'text'),
];

const INVOICE_PAST_DUE_FIELDS: WorkflowField[] = [
    ...INVOICE_FIELDS,
    f('dias_vencida', 'Días de vencida', 'Days past due', 'number'),
    f('vence', 'Fecha de vencimiento', 'Due date', 'text'),
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

const CLIENT_UPDATED_FIELDS = (base: WorkflowField[]): WorkflowField[] => [
    ...withPrev(base, ['empresa', 'email', 'terminos']),
    prevField(base, 'empresa', 'Empresa anterior', 'Previous company'),
    prevField(base, 'email', 'Correo anterior', 'Previous email'),
    prevField(base, 'terminos', 'Términos anteriores', 'Previous payment terms'),
];

const PRODUCT_FIELDS: WorkflowField[] = [
    f('nombre', 'Nombre', 'Name', 'text'),
    f('precio_lista', 'Precio de lista', 'List price', 'number'),
    f('activo', 'Activo', 'Active', 'boolean'),
    ACTOR_FIELD,
];

const PRODUCT_UPDATED_FIELDS: WorkflowField[] = [
    ...withPrev(PRODUCT_FIELDS, ['precio_lista', 'activo']),
    prevField(PRODUCT_FIELDS, 'precio_lista', 'Precio de lista anterior', 'Previous list price'),
    prevField(PRODUCT_FIELDS, 'activo', 'Activo antes', 'Active before'),
];

const QUOTE_REF_FIELDS: WorkflowField[] = [
    f('folio', 'Folio de la cotización', 'Quote number', 'text'),
    f('cliente', 'Cliente', 'Client', 'text'),
];

const DISPUTE_FIELDS: WorkflowField[] = [
    ...QUOTE_REF_FIELDS,
    f('monto', 'Monto en disputa', 'Disputed amount', 'number'),
    f('moneda', 'Divisa', 'Currency', 'text'),
    f('motivo', 'Motivo', 'Reason', 'text'),
    f('fecha_limite', 'Fecha límite para responder', 'Response deadline', 'text'),
];

const REFUND_FIELDS: WorkflowField[] = [
    ...QUOTE_REF_FIELDS,
    f('monto', 'Monto reembolsado', 'Refunded amount', 'number'),
    f('moneda', 'Divisa', 'Currency', 'text'),
    f('motivo', 'Motivo', 'Reason', 'text'),
];

const PAYOUT_FIELDS: WorkflowField[] = [
    f('monto', 'Monto del depósito', 'Payout amount', 'number'),
    f('moneda', 'Divisa', 'Currency', 'text'),
    f('llegada', 'Fecha de llegada', 'Arrival date', 'text'),
];

const ACCOUNT_FIELDS: WorkflowField[] = [
    f('puede_cobrar', 'Puede cobrar en línea', 'Can accept online payments', 'boolean'),
    f('puede_depositar', 'Puede recibir depósitos', 'Can receive payouts', 'boolean'),
    f('pendientes', 'Datos pendientes de verificación', 'Pending verification items', 'number'),
    f('motivo_bloqueo', 'Motivo del bloqueo', 'Restriction reason', 'text'),
];

const trigger = (type: string, category: TriggerCategory, es: string, en: string, fields: WorkflowField[], object?: TriggerObject): WorkflowTrigger =>
    // Los datos del negocio se agregan a TODOS los disparadores en un solo
    // lugar: repetirlos en cada lista era garantía de que alguno se quedara sin
    // ellos y de que la diferencia no se notara hasta ejecutar.
    ({ type, category, label: { es, en }, fields: [...fields, ...ORG_FIELDS], ...(object ? { object } : {}) });

const SCHEDULE_FIELDS: WorkflowField[] = [
    f('fecha', 'Fecha', 'Date', 'text'),
    f('dia_semana', 'Día de la semana', 'Day of the week', 'text'),
    f('dia_mes', 'Día del mes', 'Day of the month', 'number'),
    f('hora', 'Hora', 'Hour', 'number'),
];

export const SCHEDULE_TRIGGER = 'schedule.tick';

export const WORKFLOW_TRIGGERS: WorkflowTrigger[] = [
    trigger(SCHEDULE_TRIGGER, 'schedule', 'En un horario fijo', 'On a fixed schedule', SCHEDULE_FIELDS),
    trigger('quote.created', 'quotes', 'Se crea una cotización', 'A quote is created', QUOTE_FIELDS, 'quote'),
    trigger('quote.sent', 'quotes', 'Se envía una cotización', 'A quote is sent', QUOTE_FIELDS, 'quote'),
    trigger('quote.viewed', 'quotes', 'El cliente abre la cotización', 'The client opens the quote', QUOTE_FIELDS, 'quote'),
    trigger('quote.approved', 'quotes', 'Se aprueba una cotización', 'A quote is approved', QUOTE_FIELDS, 'quote'),
    trigger('quote.rejected', 'quotes', 'Se rechaza una cotización', 'A quote is rejected', QUOTE_FIELDS, 'quote'),
    trigger('quote.updated', 'quotes', 'Se modifica y reenvía una cotización', 'A quote is edited and resent', QUOTE_UPDATED_FIELDS, 'quote'),
    trigger('quote.expired', 'quotes', 'Vence una cotización', 'A quote expires', QUOTE_FIELDS, 'quote'),
    trigger('quote.expiring', 'quotes', 'Se acerca el vencimiento de una cotización', 'A quote is about to expire', QUOTE_EXPIRING_FIELDS, 'quote'),
    trigger('quote.deleted', 'quotes', 'Se elimina un borrador', 'A draft is deleted', QUOTE_FIELDS.filter((x) => !x.live)),
    trigger('quote.comment_added', 'quotes', 'Llega un mensaje en una cotización', 'A message is posted on a quote', [
        ...QUOTE_FIELDS,
        f('autor', 'Quién escribió', 'Who wrote it', 'enum', { options: [opt('cliente', 'El cliente', 'The client'), opt('vendedor', 'El equipo', 'The team')] }),
        f('mensaje', 'Mensaje', 'Message', 'text'),
    ], 'quote'),
    trigger('quote.approval_requested', 'approvals', 'Una cotización pide aprobación interna', 'A quote requests internal approval', [
        ...QUOTE_FIELDS, f('motivo', 'Motivo', 'Reason', 'text'),
    ], 'quote'),
    trigger('quote.approval_decided', 'approvals', 'Se decide una aprobación interna', 'An internal approval is decided', [
        ...QUOTE_FIELDS,
        f('decision', 'Decisión', 'Decision', 'enum', { options: [opt('approved', 'Aprobada', 'Approved'), opt('rejected', 'Rechazada', 'Rejected')] }),
    ], 'quote'),
    trigger('quote.paid', 'payments', 'Se paga por completo una cotización', 'A quote is paid in full', QUOTE_FIELDS, 'quote'),
    trigger('payment.partial', 'payments', 'Llega un pago parcial', 'A partial payment arrives', [
        ...QUOTE_FIELDS,
        f('monto', 'Monto pagado', 'Amount paid', 'number'),
        f('saldo_pendiente', 'Saldo pendiente', 'Balance due', 'number'),
        f('tipo', 'Tipo de pago', 'Payment type', 'enum', { options: [opt('anticipo', 'Anticipo', 'Deposit'), opt('saldo', 'Saldo', 'Balance'), opt('cuota', 'Cuota', 'Installment')] }),
    ], 'quote'),
    trigger('payment.failed', 'payments', 'Falla un cobro recurrente', 'A recurring charge fails', QUOTE_FIELDS, 'quote'),
    trigger('dispute.created', 'payments', 'Abren un contracargo', 'A dispute is opened', DISPUTE_FIELDS),
    trigger('dispute.closed', 'payments', 'Se cierra un contracargo', 'A dispute is closed', [
        ...DISPUTE_FIELDS,
        f('estado', 'Resultado', 'Outcome', 'enum', { options: [opt('won', 'Ganado', 'Won'), opt('lost', 'Perdido', 'Lost'), opt('warning_closed', 'Cerrado sin disputa', 'Closed without dispute')] }),
    ]),
    trigger('refund.succeeded', 'payments', 'Se completa un reembolso', 'A refund succeeds', REFUND_FIELDS),
    trigger('refund.failed', 'payments', 'Falla un reembolso', 'A refund fails', [...REFUND_FIELDS, f('motivo_falla', 'Motivo de la falla', 'Failure reason', 'text')]),
    trigger('payout.paid', 'payments', 'Se paga un depósito a tu banco', 'A payout is paid to your bank', PAYOUT_FIELDS),
    trigger('payout.failed', 'payments', 'Falla un depósito', 'A payout fails', [...PAYOUT_FIELDS, f('motivo_falla', 'Motivo de la falla', 'Failure reason', 'text')]),
    trigger('account.updated', 'payments', 'Cambia tu cuenta de cobros', 'Your payments account changes', ACCOUNT_FIELDS),
    trigger('invoice.issued', 'invoices', 'Se factura una cotización', 'A quote is invoiced', QUOTE_FIELDS, 'quote'),
    trigger('invoice.stamped', 'invoices', 'Se timbra el CFDI de una cotización', 'A quote CFDI is stamped', QUOTE_FIELDS, 'quote'),
    trigger('invoice.finalized', 'invoices', 'Se emite una factura', 'An invoice is issued', INVOICE_FIELDS, 'invoice'),
    trigger('invoice.sent', 'invoices', 'Se envía una factura', 'An invoice is sent', INVOICE_FIELDS, 'invoice'),
    trigger('invoice.paid', 'invoices', 'Se paga una factura', 'An invoice is paid', INVOICE_FIELDS, 'invoice'),
    trigger('invoice.payment_failed', 'invoices', 'Falla el pago de una factura', 'An invoice payment fails', INVOICE_FIELDS, 'invoice'),
    trigger('invoice.overdue', 'invoices', 'Vence una factura', 'An invoice becomes overdue', INVOICE_FIELDS, 'invoice'),
    trigger('invoice.due_soon', 'invoices', 'Se acerca el vencimiento de una factura', 'An invoice is about to be due', INVOICE_DUE_FIELDS, 'invoice'),
    trigger('invoice.past_due', 'invoices', 'Una factura lleva días vencida', 'An invoice has been past due for days', INVOICE_PAST_DUE_FIELDS, 'invoice'),
    trigger('invoice.voided', 'invoices', 'Se anula una factura', 'An invoice is voided', INVOICE_FIELDS, 'invoice'),
    trigger('invoice.marked_uncollectible', 'invoices', 'Se marca una factura como incobrable', 'An invoice is marked uncollectible', INVOICE_FIELDS, 'invoice'),
    trigger('client.created', 'clients', 'Se crea un cliente', 'A client is created', CLIENT_FIELDS),
    trigger('client.updated', 'clients', 'Se actualiza un cliente', 'A client is updated', CLIENT_UPDATED_FIELDS(CLIENT_FIELDS)),
    trigger('client.deleted', 'clients', 'Se elimina un cliente', 'A client is deleted', [f('empresa', 'Empresa', 'Company', 'text'), ACTOR_FIELD]),
    trigger('product.created', 'products', 'Se crea un producto', 'A product is created', PRODUCT_FIELDS),
    trigger('product.updated', 'products', 'Se actualiza un producto', 'A product is updated', PRODUCT_UPDATED_FIELDS),
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

export type Operator =
    | 'eq' | 'neq' | 'contains' | 'not_contains' | 'empty' | 'not_empty'
    | 'gt' | 'gte' | 'lt' | 'lte' | 'is_true' | 'is_false'
    | 'changed' | 'unchanged';

export interface OperatorDef { op: Operator; label: Text; needsValue: boolean }

/** Operadores de TRANSICIÓN. Solo se ofrecen donde el evento trae el valor anterior. */
export const CHANGE_OPERATORS: OperatorDef[] = [
    { op: 'changed', label: { es: 'cambió', en: 'changed' }, needsValue: false },
    { op: 'unchanged', label: { es: 'no cambió', en: 'did not change' }, needsValue: false },
];

export const OPERATORS: Record<FieldType, OperatorDef[]> = {
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

/** Operadores que aplican a un campo concreto, con los de cambio cuando los hay. */
export function operatorsFor(field: WorkflowField): OperatorDef[] {
    return field.prev ? [...OPERATORS[field.type], ...CHANGE_OPERATORS] : OPERATORS[field.type];
}

export type ActionKey =
    | 'create_task' | 'notify_team' | 'slack_message' | 'hubspot_note'
    | 'send_client_email' | 'expire_quote' | 'approve_quote_request' | 'void_invoice' | 'http_webhook'
    | 'teams_message' | 'whatsapp_client';
export type ActionBrand = 'cord' | 'slack' | 'teams' | 'hubspot' | 'whatsapp';

export interface ActionParam {
    key: string;
    label: Text;
    hint?: Text;
    kind: 'template' | 'template_long' | 'days' | 'choice' | 'url';
    required: boolean;
    max?: number;
    options?: { value: string; label: Text }[];
}

/**
 * Familia de la acción en el buscador de pasos. Es de NAVEGACIÓN, no de
 * permisos: agrupa por "a quién afecta" —tu equipo, tu cliente, el documento,
 * otra herramienta— porque es lo que alguien tiene en la cabeza al buscar.
 */
export type ActionGroup = 'equipo' | 'cliente' | 'documento' | 'externo';

export const ACTION_GROUPS: { key: ActionGroup; label: Text }[] = [
    { key: 'equipo', label: { es: 'Tu equipo', en: 'Your team' } },
    { key: 'cliente', label: { es: 'Tu cliente', en: 'Your client' } },
    { key: 'documento', label: { es: 'El documento', en: 'The document' } },
    { key: 'externo', label: { es: 'Otras herramientas', en: 'Other tools' } },
];

export interface WorkflowActionDef {
    key: ActionKey;
    brand: ActionBrand;
    group: ActionGroup;
    label: Text;
    description: Text;
    requires?: Text;
    /** Objeto que la acción MUTA o al que le escribe; se valida contra el disparador al publicar. */
    needs?: TriggerObject;
    params: ActionParam[];
}

export const WORKFLOW_ACTIONS: WorkflowActionDef[] = [
    {
        key: 'create_task',
        group: 'equipo',
        brand: 'cord',
        label: { es: 'Crear una tarea', en: 'Create a task' },
        description: { es: 'Agrega una tarea de seguimiento para el equipo. Si el evento es de una cotización, queda ligada a ella.', en: 'Adds a follow-up task for the team. If the event is about a quote, the task is linked to it.' },
        params: [
            { key: 'titulo', label: { es: 'Título de la tarea', en: 'Task title' }, kind: 'template', required: true, max: 200 },
            { key: 'dias', label: { es: 'Vence en (días)', en: 'Due in (days)' }, hint: { es: 'Déjalo vacío para una tarea sin fecha.', en: 'Leave empty for a task without a date.' }, kind: 'days', required: false, max: 365 },
        ],
    },
    {
        key: 'notify_team',
        group: 'equipo',
        brand: 'cord',
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
        key: 'send_client_email',
        group: 'cliente',
        brand: 'cord',
        label: { es: 'Escribirle al cliente', en: 'Email the client' },
        description: {
            es: 'Manda un correo con tu marca al contacto del cliente, con el botón para ver y pagar el documento.',
            en: "Sends a branded email to the client's contact, with the button to view and pay the document.",
        },
        requires: { es: 'El cliente necesita correo registrado', en: 'The client needs an email on file' },
        params: [
            { key: 'asunto', label: { es: 'Asunto', en: 'Subject' }, kind: 'template', required: true, max: 150 },
            {
                key: 'mensaje', label: { es: 'Mensaje', en: 'Message' },
                hint: { es: 'Lo lee tu cliente. El enlace y el botón los agrega Cord.', en: 'Your client reads this. Cord adds the link and the button.' },
                kind: 'template_long', required: true, max: 2000,
            },
        ],
    },
    {
        key: 'whatsapp_client',
        group: 'cliente',
        brand: 'whatsapp',
        label: { es: 'Mandarle un WhatsApp al cliente', en: 'Send the client a WhatsApp' },
        description: {
            es: 'Manda tu plantilla aprobada de WhatsApp al teléfono del cliente, con los datos del evento en sus variables.',
            en: "Sends your approved WhatsApp template to the client's phone, with the event data in its variables.",
        },
        requires: { es: 'Requiere WhatsApp conectado y el cliente con teléfono', en: 'Requires WhatsApp connected and a client with a phone' },
        params: [
            {
                key: 'var1', label: { es: 'Variable 1 de la plantilla', en: 'Template variable 1' },
                hint: { es: 'Rellena {{1}} de tu plantilla aprobada. Meta no permite texto libre para iniciar la conversación.', en: 'Fills {{1}} of your approved template. Meta does not allow free text to start the conversation.' },
                kind: 'template', required: false, max: 200,
            },
            { key: 'var2', label: { es: 'Variable 2', en: 'Variable 2' }, kind: 'template', required: false, max: 200 },
            { key: 'var3', label: { es: 'Variable 3', en: 'Variable 3' }, kind: 'template', required: false, max: 200 },
            { key: 'var4', label: { es: 'Variable 4', en: 'Variable 4' }, kind: 'template', required: false, max: 200 },
        ],
    },
    {
        key: 'expire_quote',
        group: 'documento',
        brand: 'cord',
        label: { es: 'Caducar la cotización', en: 'Expire the quote' },
        description: {
            es: 'Marca la cotización como vencida para que el cliente ya no pueda aprobarla desde el link.',
            en: 'Marks the quote as expired so the client can no longer approve it from the link.',
        },
        needs: 'quote',
        params: [],
    },
    {
        key: 'approve_quote_request',
        group: 'documento',
        brand: 'cord',
        label: { es: 'Aprobar la solicitud interna', en: 'Approve the internal request' },
        description: {
            es: 'Aprueba la solicitud de aprobación interna pendiente y envía la cotización al cliente.',
            en: 'Approves the pending internal approval request and sends the quote to the client.',
        },
        requires: { es: 'Requiere aprobaciones en tu plan', en: 'Requires approvals in your plan' },
        needs: 'quote',
        params: [],
    },
    {
        key: 'void_invoice',
        group: 'documento',
        brand: 'cord',
        label: { es: 'Anular la factura', en: 'Void the invoice' },
        description: {
            es: 'Anula la factura si todavía no tiene pagos aplicados. Con pagos, Cord pide una nota de crédito y no la anula.',
            en: 'Voids the invoice if it has no payments applied. With payments, Cord asks for a credit note instead.',
        },
        needs: 'invoice',
        params: [
            { key: 'motivo', label: { es: 'Motivo', en: 'Reason' }, kind: 'template', required: false, max: 200 },
        ],
    },
    {
        key: 'http_webhook',
        group: 'externo',
        brand: 'cord',
        label: { es: 'Mandar los datos a una URL', en: 'Send the data to a URL' },
        description: {
            es: 'Hace un POST con los datos del evento a la URL que pegues: Zapier, Make, n8n o tu propio servidor.',
            en: 'POSTs the event data to the URL you paste: Zapier, Make, n8n or your own server.',
        },
        params: [
            {
                key: 'url', label: { es: 'URL de destino', en: 'Destination URL' },
                hint: { es: 'Tiene que ser https y de un servidor público.', en: 'It must be https and on a public server.' },
                kind: 'url', required: true, max: 300,
            },
            { key: 'mensaje', label: { es: 'Mensaje (opcional)', en: 'Message (optional)' }, kind: 'template_long', required: false, max: 1000 },
        ],
    },
    {
        key: 'slack_message',
        group: 'externo',
        brand: 'slack',
        label: { es: 'Enviar un mensaje a Slack', en: 'Send a Slack message' },
        description: { es: 'Publica en el canal de Slack que conectaste en Ajustes › Integraciones.', en: 'Posts to the Slack channel you connected in Settings › Integrations.' },
        requires: { es: 'Requiere Slack conectado', en: 'Requires Slack connected' },
        params: [
            { key: 'mensaje', label: { es: 'Mensaje', en: 'Message' }, kind: 'template_long', required: true, max: 1000 },
        ],
    },
    {
        key: 'teams_message',
        group: 'externo',
        brand: 'teams',
        label: { es: 'Enviar un mensaje a Teams', en: 'Send a Teams message' },
        description: {
            es: 'Publica una tarjeta en el canal de Microsoft Teams que conectaste en Ajustes › Integraciones.',
            en: 'Posts a card to the Microsoft Teams channel you connected in Settings › Integrations.',
        },
        requires: { es: 'Requiere Teams conectado', en: 'Requires Teams connected' },
        params: [
            { key: 'mensaje', label: { es: 'Mensaje', en: 'Message' }, kind: 'template_long', required: true, max: 1000 },
        ],
    },
    {
        key: 'hubspot_note',
        group: 'externo',
        brand: 'hubspot',
        label: { es: 'Agregar una nota en HubSpot', en: 'Add a note in HubSpot' },
        description: {
            es: 'Deja una nota en el Deal de la cotización o, si no hay Deal, en la Empresa del cliente.',
            en: "Adds a note to the quote's Deal or, if there is no Deal, to the client's Company.",
        },
        requires: { es: 'Requiere HubSpot conectado', en: 'Requires HubSpot connected' },
        params: [
            { key: 'mensaje', label: { es: 'Nota', en: 'Note' }, kind: 'template_long', required: true, max: 2000 },
        ],
    },
];

export const findAction = (key: string | null | undefined) => WORKFLOW_ACTIONS.find((a) => a.key === key);

/** ¿El disparador entrega el objeto que la acción necesita? */
export function actionFitsTrigger(action: WorkflowActionDef, trigger: WorkflowTrigger | undefined): boolean {
    if (!action.needs) return true;
    return trigger?.object === action.needs;
}

/**
 * URL de destino de `http_webhook`. Es una validación de FORMA, no de red: el
 * muro real es `safeFetch` (resuelve DNS en el momento de conectar). Aquí solo
 * se rechaza lo evidente para que el error salga al publicar y no en ejecución.
 */
export function isPublicHttpsUrl(value: string): boolean {
    let url: URL;
    try { url = new URL(value); } catch { return false; }
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host || host === 'localhost' || host.endsWith('.internal') || host.endsWith('.local')) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return false;
    return host.includes('.');
}

export const WAIT_MAX_DAYS = 30;
export const MAX_STEPS = 30;
export const MAX_NESTING = 4;
export const MAX_CONDITIONS = 5;
