// Contrato de los webhooks salientes de Cord: fuente única para la app
// (src/lib/webhooks.ts) y para los SDK. Agregar un evento aquí sin su etiqueta
// en la app, o al revés, no compila; test/webhook-contract.test.ts compara
// además contra el catálogo de eventos de dominio.

export const WEBHOOK_EVENT_OBJECTS = {
    'quote.sent': 'quote',
    'quote.viewed': 'quote',
    'quote.approved': 'quote',
    'quote.rejected': 'quote',
    'quote.updated': 'quote',
    'quote.expired': 'quote',
    'quote.deleted': 'quote',
    'quote.paid': 'quote',
    'payment.partial': 'quote',
    'payment.failed': 'quote',
    'invoice.issued': 'quote',
    'invoice.stamped': 'quote',
    'invoice.finalized': 'invoice',
    'invoice.sent': 'invoice',
    'invoice.paid': 'invoice',
    'invoice.payment_failed': 'invoice',
    'invoice.voided': 'invoice',
    'invoice.marked_uncollectible': 'invoice',
    'invoice.overdue': 'invoice',
    'quote.created': 'quote',
    'quote.approval_requested': 'quote',
    'quote.approval_decided': 'quote',
    'quote.comment_added': 'quote',
    'client.created': 'client',
    'client.updated': 'client',
    'client.deleted': 'client',
    'product.created': 'product',
    'product.updated': 'product',
    'product.deleted': 'product',
    'task.created': 'task',
    'task.completed': 'task',
    'promise.created': 'promise',
    'promise.kept': 'promise',
    'promise.broken': 'promise',
    'dispute.created': 'dispute',
    'dispute.closed': 'dispute',
    'refund.succeeded': 'refund',
    'refund.failed': 'refund',
    'payout.paid': 'payout',
    'payout.failed': 'payout',
    'account.updated': 'account',
} as const;

export type CordWebhookEventType = keyof typeof WEBHOOK_EVENT_OBJECTS;
export type CordWebhookObject = (typeof WEBHOOK_EVENT_OBJECTS)[CordWebhookEventType];

export const WEBHOOK_EVENT_TYPES = Object.keys(WEBHOOK_EVENT_OBJECTS) as CordWebhookEventType[];

export function isWebhookEventType(value: string): value is CordWebhookEventType {
    return Object.prototype.hasOwnProperty.call(WEBHOOK_EVENT_OBJECTS, value);
}

/** Resumen de cotización (src/lib/webhooks.ts `dispatchToSubscribers`). */
export interface CordWebhookQuoteData {
    id: string;
    folio: string;
    status: string;
    /** Divisa de venta (ISO 4217). Todo importe viaja con su divisa. */
    moneda: string | null;
    total: number;
    cliente: string | null;
    cliente_id: string | null;
    link_publico: string;
}

/** `payment.partial`: un anticipo, saldo o cuota que no cubre el total. */
export interface CordWebhookPaymentPartialData extends CordWebhookQuoteData {
    tipo: 'anticipo' | 'saldo' | 'cuota' | string;
    /** Monto de ESTE cobro, no el total de la cotización. */
    monto: number;
    /** Mayor que 0 solo cuando `tipo === 'cuota'`. */
    numero_cuota: number;
    saldo_pendiente: number;
    payment_method: string | null;
}

export interface CordWebhookApprovalRequestedData extends CordWebhookQuoteData { motivo?: string | null }
export interface CordWebhookApprovalDecidedData extends CordWebhookQuoteData { decision: 'approved' | 'rejected' }
export interface CordWebhookCommentData extends CordWebhookQuoteData {
    autor: 'vendedor' | 'cliente' | string;
    mensaje: string;
    /** Presente cuando el comentario es sobre una línea. */
    item_id?: string;
}

/** src/lib/webhooks.ts `dispatchInvoiceEvent`. */
export interface CordWebhookInvoiceData {
    id: string;
    object: 'invoice';
    numero: string | null;
    folio_fiscal: string | null;
    estado: string;
    estado_fiscal: string;
    pais: string;
    tipo: string;
    moneda: string | null;
    total: number;
    pagado: number;
    saldo: number;
    vence: string | null;
    cliente: string | null;
    cotizacion_id: string | null;
    link_publico: string | null;
}

/** src/lib/event-payloads.ts `clientEventData`. */
export interface CordWebhookClientData {
    id: string;
    object: 'client';
    empresa: string;
    contacto: string | null;
    email: string | null;
    telefono: string | null;
    rfc: string | null;
    terminos: string | null;
    country_code: string | null;
}
export interface CordWebhookClientUpdatedData extends CordWebhookClientData {
    empresa_anterior?: string | null;
    email_anterior?: string | null;
    terminos_anterior?: string | null;
}
export interface CordWebhookClientDeletedData { id: string; object: 'client'; empresa: string }

/** src/lib/event-payloads.ts `productEventData`. */
export interface CordWebhookProductData {
    id: string;
    object: 'product';
    sku: string | null;
    nombre: string;
    unidad: string | null;
    precio_lista: number | null;
    activo: boolean;
}
export interface CordWebhookProductUpdatedData extends CordWebhookProductData {
    precio_lista_anterior?: number | null;
    activo_anterior?: boolean;
}
export interface CordWebhookProductDeletedData { id: string; object: 'product'; nombre: string }

export interface CordWebhookTaskData {
    id: string;
    object: 'task';
    titulo: string;
    due_date: string | null;
    done: boolean;
    cotizacion_id: string | null;
}

export interface CordWebhookPromiseData {
    id: string;
    object: 'promise';
    cotizacion_id: string;
    fecha_promesa: string | null;
    /** null = el saldo completo de la cotización. */
    monto: number | null;
    moneda: string | null;
    estado: string | null;
}

interface CordWebhookQuoteRef {
    cotizacion_id: string | null;
    folio: string | null;
    cliente: string | null;
    /** Id del objeto en el proveedor de pagos; estable para deduplicar. */
    referencia: string;
}

export interface CordWebhookDisputeData extends CordWebhookQuoteRef {
    id: string | null;
    object: 'dispute';
    monto: number;
    moneda: string;
    motivo: string | null;
    estado: string;
    fecha_limite: string | null;
}

export interface CordWebhookRefundData extends CordWebhookQuoteRef {
    object: 'refund';
    monto: number;
    moneda: string;
    motivo: string | null;
    motivo_falla?: string | null;
}

export interface CordWebhookPayoutData {
    id: string | null;
    object: 'payout';
    monto: number;
    moneda: string;
    llegada: string | null;
    metodo: string | null;
    motivo_falla?: string | null;
    referencia: string;
}

export interface CordWebhookAccountData {
    object: 'account';
    puede_cobrar: boolean;
    puede_depositar: boolean;
    motivo_bloqueo: string | null;
    pendientes: number;
}

interface DataByObject {
    quote: CordWebhookQuoteData;
    invoice: CordWebhookInvoiceData;
    client: CordWebhookClientData;
    product: CordWebhookProductData;
    task: CordWebhookTaskData;
    promise: CordWebhookPromiseData;
    dispute: CordWebhookDisputeData;
    refund: CordWebhookRefundData;
    payout: CordWebhookPayoutData;
    account: CordWebhookAccountData;
}

interface DataOverrides {
    'payment.partial': CordWebhookPaymentPartialData;
    'quote.approval_requested': CordWebhookApprovalRequestedData;
    'quote.approval_decided': CordWebhookApprovalDecidedData;
    'quote.comment_added': CordWebhookCommentData;
    'client.updated': CordWebhookClientUpdatedData;
    'client.deleted': CordWebhookClientDeletedData;
    'product.updated': CordWebhookProductUpdatedData;
    'product.deleted': CordWebhookProductDeletedData;
}

export type CordWebhookData<E extends CordWebhookEventType> =
    E extends keyof DataOverrides ? DataOverrides[E] : DataByObject[(typeof WEBHOOK_EVENT_OBJECTS)[E]];

interface CordWebhookEnvelope<E extends string, D> {
    /** `evt_…`: estable entre reintentos y replays. Deduplica con este campo. */
    id: string;
    event: E;
    created_at: string;
    data: D;
}

/** Evento de prueba de Ajustes › Developers. */
export type CordWebhookPingEvent = CordWebhookEnvelope<'ping', CordWebhookQuoteData & { mensaje: string }>;

/** Unión discriminada por `event`: revisa `event` y TypeScript te da el `data` exacto. */
export type CordWebhookEvent =
    | { [E in CordWebhookEventType]: CordWebhookEnvelope<E, CordWebhookData<E>> }[CordWebhookEventType]
    | CordWebhookPingEvent;
