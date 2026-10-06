// Contrato de la API pública v1 en un solo lugar: de aquí sale public/openapi.json
// (scripts/openapi.mjs) y test/openapi-contract.test.ts verifica que cada ruta
// real de src/pages/api/v1 esté descrita, con sus métodos, y que los webhooks
// coincidan con el contrato del SDK. Las respuestas son objetos abiertos: un
// campo nuevo no rompe a nadie (ver versiones de la API).
import { z } from 'zod';
import { WEBHOOK_EVENT_OBJECTS } from '../../packages/elements/src/contract/webhook-events.ts';

const id = z.string().describe('Identificador (UUID).');
const money = z.number().describe('Importe en la divisa indicada por `moneda`.');
const currency = z.string().nullable().describe('Divisa ISO 4217.');
const date = z.string().nullable().describe('Fecha ISO 8601.');
const open = <T extends z.ZodRawShape>(shape: T) => z.looseObject(shape);

// ── Objetos ─────────────────────────────────────────────────────────────────

export const Quote = open({
    id, folio: z.string(), cliente: z.string().nullable(), status: z.string(), total: money, moneda: currency,
    terminos: z.string().nullable(), vigencia: date, creada: date,
    link_publico: z.string().describe('Link público absoluto de la cotización.'),
});

export const QuoteDetail = Quote.extend({
    notas: z.string().nullable(),
    aprobacion: open({ estado: z.string(), motivo: z.string().nullable() }).nullable(),
    items: z.array(open({ descripcion: z.string(), cantidad: z.number(), unidad: z.string().nullable(), precio_lista: money, precio_negociado: money.nullable() })),
    eventos: z.array(open({ tipo: z.string(), detalle: z.string().nullable(), cuando: z.string() })),
});

export const CreatedQuote = open({
    id, token: z.string(), folio: z.string(), link_publico: z.string(),
    needs_approval: z.boolean(), motivo: z.string().nullable(),
    email: open({ sent: z.boolean(), skipped: z.string().optional() }).optional(),
});

export const Client = open({
    id, empresa: z.string(), contacto: z.string(), email: z.string(), telefono: z.string(), rfc: z.string(),
    terminos: z.string().describe('Etiqueta legible de los términos.'), terminosCode: z.string(),
    limite: z.number(), nivel: z.string(), descuentoPct: z.number(),
    regimenFiscal: z.string(), usoCfdi: z.string(), cpFiscal: z.string(), countryCode: z.string(),
}).describe('Forma actual en camelCase; candidata a normalizarse a snake_case en una versión nueva de la API.');

export const Product = open({
    id, sku: z.string(), nombre: z.string(), unidad: z.string(), descripcion: z.string(),
    precio: money, costo: money.optional().describe('Nunca se expone a una llave publicable.'),
    activo: z.boolean(), createdAt: date,
    preciosVolumen: z.array(open({ min: z.number(), precio: money })),
    existencias: z.number().nullable(),
});

export const Invoice = open({
    id, numero: z.string().nullable(), folio_fiscal: z.string().nullable(), cliente: z.string().nullable(),
    estado: z.string(), estado_fiscal: z.string(), pais: z.string(), tipo: z.string(), moneda: currency,
    total: money, pagado: money, saldo: money, vence: date, vencida: z.boolean(), cotizacion_id: z.string().nullable(), creada: date,
});

export const InvoiceDetail = Invoice.extend({
    subtotal: money, impuestos: money, moneda_contable: currency, tipo_cambio: z.number().nullable(), total_contable: money.nullable(),
    notas: z.string().nullable(), nota_credito_de: z.string().nullable(),
    emisor: z.unknown(), receptor: z.unknown(),
    conceptos: z.array(open({ descripcion: z.string(), cantidad: z.number(), precio_unitario: money, subtotal: money, impuesto: money, total: money })),
    pagos: z.array(open({ monto: money, moneda: currency, metodo: z.string().nullable(), referencia: z.string().nullable(), cuando: z.string() })),
});

export const DomainEvent = open({
    id, type: z.string(), object: z.string(), object_id: z.string().nullable(), data: z.record(z.string(), z.unknown()),
    actor: z.string().nullable(), created_at: z.string(),
});

export const WebhookEndpoint = open({ id, url: z.string(), eventos: z.array(z.string()), activo: z.boolean(), created_at: z.string() });

export const ElementsConfig = open({
    object: z.literal('elements_config'),
    org: open({ nombre: z.string(), pais: z.string(), locale: z.enum(['es', 'en']), moneda: z.string(), color_primario: z.string().nullable(), logo_url: z.string().nullable() }),
    monedas: z.array(z.string()),
    impuestos: open({
        etiqueta: z.string(),
        opciones: z.array(open({ id: z.string().nullable(), label: z.string(), rate: z.number(), kind: z.enum(['consumo', 'retencion', 'exento']) })),
        tasa_default: z.number(),
        retenciones: z.array(open({ nombre: z.string(), tasa: z.number(), base: z.enum(['subtotal', 'impuesto']) })),
        precios_incluyen_impuesto: z.boolean(),
    }),
    terminos: z.array(z.enum(['contado', 'net30', 'net60'])),
    terminos_default: z.enum(['contado', 'net30', 'net60']),
    vigencia_dias_default: z.number(),
    fiscal: open({ pais: z.string(), reglas_propias: z.boolean() }),
});

export const ApiError = open({
    error: z.string().describe('Mensaje legible.'),
    code: z.string().describe('Código estable para tu lógica.'),
    request_id: z.string().optional(),
    doc_url: z.string().optional(),
});

const Ack = open({ id: z.string().optional() });
const SetupPlan = open({
    object: z.literal('setup_plan'), id,
    estado: z.enum(['generando', 'propuesto', 'aplicado', 'descartado', 'fallido']).describe('propuesto espera la aprobación de una persona en review_url.'),
    review_url: z.string().describe('Página donde una persona con sesión revisa y aplica la propuesta. La API nunca la aplica.'),
});

// ── Entradas ────────────────────────────────────────────────────────────────

const FiscalReceptorInput = z.object({
    country: z.string(), tax_id: z.string(), legal_name: z.string().optional(),
    regimen_fiscal: z.string().optional(), uso_cfdi: z.string().optional(), cp_fiscal: z.string().optional(),
});

const QuoteItemInput = z.object({
    descripcion: z.string(), cantidad: z.number(), precio_unitario: z.number(),
    precio_negociado: z.number().optional(), costo_unitario: z.number().optional(), producto_id: z.string().optional(),
    tax_rate: z.number().optional().describe('Fracción 0–1, validada contra el catálogo de impuestos.'),
});

export const CreateQuoteInput = z.object({
    items: z.array(QuoteItemInput).min(1),
    cliente_id: z.string().optional(),
    cliente: z.object({
        empresa: z.string(), email: z.string().optional(), contacto: z.string().optional(),
        telefono: z.string().optional(), rfc: z.string().optional(), fiscal: FiscalReceptorInput.optional(),
    }).optional(),
    terminos: z.enum(['contado', 'net30', 'net60']).optional(),
    vigencia_dias: z.number().int().optional(),
    notas: z.string().optional(),
    base_currency: z.string().optional(),
    fiscal_currency: z.string().optional(),
    iva_incluido: z.boolean().optional(),
    send: z.boolean().optional().describe('Solo con Secret Key.'),
});

// ── Operaciones ─────────────────────────────────────────────────────────────

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface Operation {
    method: Method;
    path: string;
    summary: string;
    tag: string;
    scope: 'read' | 'write';
    publishable?: boolean;
    testOnly?: boolean;
    query?: Record<string, z.ZodType>;
    body?: z.ZodType;
    multipart?: boolean;
    response: z.ZodType | 'stream';
    page?: 'offset' | 'cursor';
}

const listQ = { limit: z.number().int().min(1).max(200), offset: z.number().int().min(0) };
const cursorQ = { limit: z.number().int().min(1).max(200), cursor: z.string() };
const action = (actions: string[], extra: z.ZodRawShape = {}) => z.object({ action: z.enum(actions as [string, ...string[]]), ...extra });

export const OPERATIONS: Operation[] = [
    { method: 'GET', path: '/me', summary: 'Organización y alcance de la llave', tag: 'Cuenta', scope: 'read', response: open({ org: open({ id, nombre: z.string(), plan: z.string() }), scope: z.string(), mode: z.enum(['live', 'test']) }) },

    { method: 'GET', path: '/cotizaciones', summary: 'Listar cotizaciones', tag: 'Cotizaciones', scope: 'read', page: 'offset', query: { ...listQ, status: z.string(), folio: z.string(), cliente_id: z.string() }, response: Quote },
    { method: 'POST', path: '/cotizaciones', summary: 'Crear cotización', tag: 'Cotizaciones', scope: 'write', publishable: true, body: CreateQuoteInput, response: CreatedQuote },
    { method: 'GET', path: '/cotizaciones/{id}', summary: 'Detalle de cotización', tag: 'Cotizaciones', scope: 'read', response: QuoteDetail },
    { method: 'POST', path: '/cotizaciones/{id}', summary: 'Enviar, reenviar, aprobar, rechazar o marcar pagada', tag: 'Cotizaciones', scope: 'write', body: action(['send', 'resend', 'approve', 'reject', 'mark_paid'], { payment_method: z.string().optional() }), response: Ack },
    { method: 'DELETE', path: '/cotizaciones/{id}', summary: 'Borrar un borrador', tag: 'Cotizaciones', scope: 'write', response: Ack },
    { method: 'POST', path: '/cotizaciones/ia', summary: 'Proponer líneas a partir del texto de un pedido', tag: 'Cotizaciones', scope: 'write', body: z.object({ texto: z.string().max(6000) }), response: open({ items: z.array(z.unknown()), moneda: z.string() }) },

    { method: 'GET', path: '/clientes', summary: 'Listar clientes', tag: 'Clientes', scope: 'read', page: 'offset', query: { ...listQ, q: z.string(), email: z.string() }, response: Client },
    { method: 'POST', path: '/clientes', summary: 'Crear cliente', tag: 'Clientes', scope: 'write', body: z.looseObject({ empresa: z.string() }), response: Ack },
    { method: 'GET', path: '/clientes/{id}', summary: 'Detalle de cliente', tag: 'Clientes', scope: 'read', response: Client },
    { method: 'PATCH', path: '/clientes/{id}', summary: 'Actualizar datos de contacto', tag: 'Clientes', scope: 'write', body: z.looseObject({}), response: Ack },

    { method: 'GET', path: '/productos', summary: 'Listar productos', tag: 'Productos', scope: 'read', publishable: true, page: 'offset', query: listQ, response: Product },
    { method: 'POST', path: '/productos', summary: 'Crear producto', tag: 'Productos', scope: 'write', body: z.looseObject({ nombre: z.string() }), response: Ack },

    { method: 'GET', path: '/facturas', summary: 'Listar facturas', tag: 'Facturas', scope: 'read', page: 'cursor', query: { ...cursorQ, estado: z.string(), cliente: z.string(), q: z.string() }, response: Invoice },
    { method: 'POST', path: '/facturas', summary: 'Crear factura en borrador', tag: 'Facturas', scope: 'write', body: z.object({ cliente_id: z.string(), items: z.array(QuoteItemInput).min(1), currency: z.string().optional(), due_date: z.string().optional(), notas: z.string().optional() }), response: Ack },
    { method: 'GET', path: '/facturas/{id}', summary: 'Detalle de factura', tag: 'Facturas', scope: 'read', response: InvoiceDetail },
    { method: 'POST', path: '/facturas/{id}', summary: 'Emitir, enviar, anular, registrar pago o nota de crédito', tag: 'Facturas', scope: 'write', body: action(['finalize', 'send', 'void', 'payment', 'credit_note'], { monto: z.number().optional(), moneda: z.string().optional(), metodo: z.string().optional(), referencia: z.string().optional(), motivo: z.string().optional() }), response: Ack },

    { method: 'GET', path: '/cobranza', summary: 'Cartera por cobrar', tag: 'Cobranza', scope: 'read', response: open({ resumen: z.unknown(), aging: z.unknown(), items: z.array(z.unknown()), clientes: z.unknown() }) },
    { method: 'GET', path: '/events', summary: 'Historial de eventos', tag: 'Eventos', scope: 'read', page: 'cursor', query: { ...cursorQ, type: z.string(), object_id: z.string() }, response: DomainEvent },
    { method: 'POST', path: '/tareas', summary: 'Crear tarea', tag: 'Tareas', scope: 'write', body: z.object({ titulo: z.string(), due_date: z.string().optional(), cotizacion_id: z.string().optional() }), response: Ack },

    { method: 'GET', path: '/webhooks', summary: 'Endpoints creados por esta llave', tag: 'Webhooks', scope: 'read', response: z.array(WebhookEndpoint) },
    { method: 'POST', path: '/webhooks', summary: 'Crear endpoint (el secreto se devuelve una vez)', tag: 'Webhooks', scope: 'write', body: z.object({ url: z.string(), eventos: z.array(z.string()).optional() }), response: WebhookEndpoint.extend({ secret: z.string() }) },
    { method: 'DELETE', path: '/webhooks/{id}', summary: 'Borrar endpoint', tag: 'Webhooks', scope: 'write', response: Ack },

    { method: 'GET', path: '/elements/config', summary: 'Configuración que dibuja Cord Elements', tag: 'Elements', scope: 'read', publishable: true, response: ElementsConfig },
    { method: 'POST', path: '/elements/ai-draft', summary: 'Líneas con IA en streaming (text/event-stream)', tag: 'Elements', scope: 'write', publishable: true, multipart: true, body: z.object({ texto: z.string().max(4000).optional(), archivo: z.string().describe('JPG, PNG o PDF, máx 4 MB.').optional() }), response: 'stream' },

    { method: 'POST', path: '/test_helpers/fiscal', summary: 'Forzar el resultado de la próxima emisión', tag: 'Modo prueba', scope: 'write', testOnly: true, body: z.object({ siguiente_resultado: z.enum(['exito', 'pac_caido', 'receptor_invalido', 'certificado_vencido', 'timbre_duplicado']) }), response: open({ siguiente_resultado: z.string() }) },
    { method: 'POST', path: '/test_helpers/cotizaciones/{id}', summary: 'Simular apertura o vencimiento', tag: 'Modo prueba', scope: 'write', testOnly: true, body: z.object({ accion: z.enum(['vista', 'vencer']) }), response: Ack },
    { method: 'POST', path: '/test_helpers/webhooks', summary: 'Disparar un webhook', tag: 'Modo prueba', scope: 'write', testOnly: true, body: z.object({ evento: z.string(), objeto_id: z.string().optional() }), response: open({ evento: z.string(), datos: z.enum(['real', 'ejemplo']) }) },
    { method: 'POST', path: '/test_helpers/listen', summary: 'Abrir sesión de cord listen', tag: 'Modo prueba', scope: 'write', testOnly: true, body: z.object({ eventos: z.array(z.string()).optional() }), response: open({ id, secret: z.string(), eventos: z.array(z.string()), expira: z.string() }) },
    { method: 'GET', path: '/test_helpers/listen/{id}', summary: 'Recoger eventos de la sesión', tag: 'Modo prueba', scope: 'write', testOnly: true, response: z.array(open({ event_id: z.string(), evento: z.string(), body: z.string(), headers: z.record(z.string(), z.string()) })) },
    { method: 'DELETE', path: '/test_helpers/listen/{id}', summary: 'Cerrar sesión de cord listen', tag: 'Modo prueba', scope: 'write', testOnly: true, response: Ack },

    { method: 'POST', path: '/setup/plans', summary: 'Proponer una configuración de la cuenta (una persona la aprueba en review_url)', tag: 'Configuración', scope: 'write', body: z.object({
        sitio: z.string().max(300).optional().describe('Sitio web del negocio, por ejemplo tunegocio.com.'),
        descripcion: z.string().max(4000).optional().describe('Descripción del negocio: giro, plazos de pago, impuestos que cobra o retiene.'),
        archivo: z.object({ nombre: z.string(), base64: z.string() }).optional().describe('Lista de precios (Excel, CSV, PDF o foto) en base64, hasta 3 MB.'),
    }), response: SetupPlan },
    { method: 'GET', path: '/setup/plans/{id}', summary: 'Estado de una propuesta de configuración', tag: 'Configuración', scope: 'read', response: SetupPlan },
];

// ── Webhooks ────────────────────────────────────────────────────────────────

const QuoteWebhookData = open({ id: z.string(), folio: z.string(), status: z.string(), moneda: currency, total: money, cliente: z.string().nullable(), cliente_id: z.string().nullable(), link_publico: z.string() });

export const WEBHOOK_DATA_BY_OBJECT: Record<string, z.ZodType> = {
    quote: QuoteWebhookData,
    invoice: Invoice.omit({ vencida: true, creada: true }).extend({ object: z.literal('invoice'), link_publico: z.string().nullable() }),
    client: open({ id: z.string(), object: z.literal('client'), empresa: z.string() }),
    product: open({ id: z.string(), object: z.literal('product'), nombre: z.string() }),
    task: open({ id: z.string(), object: z.literal('task'), titulo: z.string(), done: z.boolean() }),
    promise: open({ id: z.string(), object: z.literal('promise'), cotizacion_id: z.string(), monto: money.nullable(), moneda: currency }),
    dispute: open({ object: z.literal('dispute'), monto: money, moneda: z.string(), estado: z.string(), referencia: z.string() }),
    refund: open({ object: z.literal('refund'), monto: money, moneda: z.string(), referencia: z.string() }),
    payout: open({ object: z.literal('payout'), monto: money, moneda: z.string(), referencia: z.string() }),
    account: open({ object: z.literal('account'), puede_cobrar: z.boolean(), puede_depositar: z.boolean(), pendientes: z.number() }),
};

export function webhookEnvelope(event: string, data: z.ZodType) {
    return z.object({ id: z.string().describe('evt_…, estable entre reintentos.'), event: z.literal(event), created_at: z.string(), data });
}

export function webhookEvents(): Array<[string, string]> {
    return Object.entries(WEBHOOK_EVENT_OBJECTS);
}
