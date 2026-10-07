// Recursos de la API v1. Cada método corresponde a una ruta real de
// src/pages/api/v1; los campos conservan los nombres del servidor.
import type { HttpClient, RequestOptions } from './http.js';
import type { FiscalReceptorInput } from '../../elements/src/fiscal/receptor.js';

type Obj = Record<string, unknown>;

export interface QuoteItemInput {
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    precio_negociado?: number;
    costo_unitario?: number;
    producto_id?: string;
    /** Fracción 0–1, validada contra el catálogo de impuestos de la organización. */
    tax_rate?: number;
}

export interface CreateQuoteParams {
    items: QuoteItemInput[];
    cliente_id?: string;
    cliente?: { empresa: string; email?: string; contacto?: string; telefono?: string; rfc?: string; fiscal?: FiscalReceptorInput };
    terminos?: 'contado' | 'net30' | 'net60';
    vigencia_dias?: number;
    notas?: string;
    base_currency?: string;
    fiscal_currency?: string;
    iva_incluido?: boolean;
    /** Envía la cotización por correo al crearla. */
    send?: boolean;
}

export interface CreatedQuote {
    id: string;
    token: string;
    folio: string;
    link_publico: string;
    needs_approval: boolean;
    motivo: string | null;
    email?: { sent: boolean; skipped?: string };
}

/** Listas que aceptan offset y cursor: con `cursor`, `offset` viene null. */
export interface OffsetPage<T> { data: T[]; meta: { limit: number; offset: number | null; total: number; next_cursor: string | null } }
export interface CursorPage<T> { data: T[]; meta: { next_cursor: string | null } }

/** Recorre todas las páginas de una lista por cursor. */
async function* cursorIterator<T>(fetchPage: (cursor: string | undefined) => Promise<CursorPage<T>>): AsyncGenerator<T> {
    let cursor: string | undefined;
    for (;;) {
        const page = await fetchPage(cursor);
        for (const item of page.data) yield item;
        if (!page.meta.next_cursor) return;
        cursor = page.meta.next_cursor;
    }
}

export function createResources(http: HttpClient) {
    const get = async <T>(path: string, query?: Obj, opts?: RequestOptions) => (await http.request<T>('GET', path, { query, ...opts })).data;
    const post = async <T>(path: string, body: unknown, opts?: RequestOptions) => (await http.request<T>('POST', path, { body, ...opts })).data;
    const page = async <T>(path: string, query: Obj) => {
        const r = await http.request<T[]>('GET', path, { query });
        return { data: r.data ?? [], meta: r.meta } as any;
    };

    const quotes = {
        list: (params: { status?: string; folio?: string; cliente_id?: string; limit?: number; offset?: number; cursor?: string } = {}): Promise<OffsetPage<Obj>> =>
            page('/cotizaciones', params),
        /** `for await (const q of cord.quotes.listAll())`. Usa cursor: no salta ni repite aunque haya escrituras. */
        listAll: (params: { status?: string; cliente_id?: string } = {}) =>
            cursorIterator<Obj>((cursor) => page('/cotizaciones', { ...params, limit: 200, cursor })),
        retrieve: (id: string) => get<Obj>(`/cotizaciones/${encodeURIComponent(id)}`),
        create: (params: CreateQuoteParams, opts?: RequestOptions) => post<CreatedQuote>('/cotizaciones', params, opts),
        send: (id: string, opts?: RequestOptions) => post<Obj>(`/cotizaciones/${encodeURIComponent(id)}`, { action: 'send' }, opts),
        resend: (id: string, opts?: RequestOptions) => post<Obj>(`/cotizaciones/${encodeURIComponent(id)}`, { action: 'resend' }, opts),
        approve: (id: string, opts?: RequestOptions) => post<Obj>(`/cotizaciones/${encodeURIComponent(id)}`, { action: 'approve' }, opts),
        reject: (id: string, opts?: RequestOptions) => post<Obj>(`/cotizaciones/${encodeURIComponent(id)}`, { action: 'reject' }, opts),
        markPaid: (id: string, params: { payment_method?: string } = {}, opts?: RequestOptions) =>
            post<Obj>(`/cotizaciones/${encodeURIComponent(id)}`, { action: 'mark_paid', ...params }, opts),
        /** Solo borradores. */
        del: async (id: string, opts?: RequestOptions) => (await http.request<Obj>('DELETE', `/cotizaciones/${encodeURIComponent(id)}`, opts)).data,
        /** Propone líneas a partir del texto de un pedido; no crea nada. Consume IA del plan. */
        draftFromText: (texto: string, opts?: RequestOptions) =>
            post<{ items: QuoteItemInput[]; moneda: string }>('/cotizaciones/ia', { texto }, opts),
    };

    const clients = {
        list: (params: { q?: string; email?: string; limit?: number; offset?: number; cursor?: string } = {}): Promise<OffsetPage<Obj>> => page('/clientes', params),
        listAll: () => cursorIterator<Obj>((cursor) => page('/clientes', { limit: 200, cursor })),
        retrieve: (id: string) => get<Obj>(`/clientes/${encodeURIComponent(id)}`),
        create: (params: Obj, opts?: RequestOptions) => post<{ id: string }>('/clientes', params, opts),
        update: async (id: string, params: Obj, opts?: RequestOptions) =>
            (await http.request<Obj>('PATCH', `/clientes/${encodeURIComponent(id)}`, { body: params, ...opts })).data,
    };

    const products = {
        list: (params: { limit?: number; offset?: number; cursor?: string } = {}): Promise<OffsetPage<Obj>> => page('/productos', params),
        listAll: () => cursorIterator<Obj>((cursor) => page('/productos', { limit: 200, cursor })),
        create: (params: Obj, opts?: RequestOptions) => post<{ id: string }>('/productos', params, opts),
    };

    const invoices = {
        list: (params: { estado?: string; cliente?: string; q?: string; limit?: number; cursor?: string } = {}): Promise<CursorPage<Obj>> =>
            page('/facturas', params),
        listAll: (params: { estado?: string; cliente?: string } = {}) =>
            cursorIterator<Obj>((cursor) => page('/facturas', { ...params, limit: 200, cursor })),
        retrieve: (id: string) => get<Obj>(`/facturas/${encodeURIComponent(id)}`),
        /** Crea un BORRADOR; emitirlo es `finalize`. */
        create: (params: { cliente_id: string; items: QuoteItemInput[]; currency?: string; due_date?: string; notas?: string }, opts?: RequestOptions) =>
            post<{ id: string }>('/facturas', params, opts),
        /** Emite la factura. Irreversible y consume medidor. */
        finalize: (id: string, opts?: RequestOptions) => post<Obj>(`/facturas/${encodeURIComponent(id)}`, { action: 'finalize' }, opts),
        send: (id: string, opts?: RequestOptions) => post<Obj>(`/facturas/${encodeURIComponent(id)}`, { action: 'send' }, opts),
        void: (id: string, params: { motivo?: string } = {}, opts?: RequestOptions) =>
            post<Obj>(`/facturas/${encodeURIComponent(id)}`, { action: 'void', ...params }, opts),
        /** Registra un pago recibido por fuera de Cord. Importe y divisa siempre juntos. */
        recordPayment: (id: string, params: { monto: number; moneda: string; metodo?: string; referencia?: string }, opts?: RequestOptions) =>
            post<Obj>(`/facturas/${encodeURIComponent(id)}`, { action: 'payment', ...params }, opts),
        creditNote: (id: string, params: { monto?: number; motivo?: string } = {}, opts?: RequestOptions) =>
            post<Obj>(`/facturas/${encodeURIComponent(id)}`, { action: 'credit_note', ...params }, opts),
    };

    const events = {
        list: (params: { type?: string; object_id?: string; limit?: number; cursor?: string } = {}): Promise<CursorPage<Obj>> => page('/events', params),
        listAll: (params: { type?: string; object_id?: string } = {}) =>
            cursorIterator<Obj>((cursor) => page('/events', { ...params, limit: 200, cursor })),
    };

    const webhookEndpoints = {
        list: () => get<Obj[]>('/webhooks'),
        /** Devuelve el `secret` UNA vez: guárdalo para verificar las entregas. */
        create: (params: { url: string; eventos?: string[] }, opts?: RequestOptions) =>
            post<{ id: string; url: string; eventos: string[]; secret: string }>('/webhooks', params, opts),
        del: async (id: string, opts?: RequestOptions) => (await http.request<Obj>('DELETE', `/webhooks/${encodeURIComponent(id)}`, opts)).data,
    };

    const testOnly = () => {
        if (http.mode !== 'test') throw new Error('[Cord] testHelpers solo funciona con una llave de prueba (sk_test_).');
    };
    const testHelpers = {
        fiscal: {
            /** Fuerza el resultado de la próxima emisión fiscal de la sandbox. */
            setNextOutcome: (siguiente_resultado: 'exito' | 'pac_caido' | 'receptor_invalido' | 'certificado_vencido' | 'timbre_duplicado') => {
                testOnly();
                return post<Obj>('/test_helpers/fiscal', { siguiente_resultado });
            },
        },
        quotes: {
            /** El cliente abre el link (quote.viewed). */
            view: (id: string) => { testOnly(); return post<Obj>(`/test_helpers/cotizaciones/${encodeURIComponent(id)}`, { accion: 'vista' }); },
            /** La cotización vence (quote.expired). */
            expire: (id: string) => { testOnly(); return post<Obj>(`/test_helpers/cotizaciones/${encodeURIComponent(id)}`, { accion: 'vencer' }); },
        },
        webhooks: {
            /** Dispara un evento a tus endpoints de prueba por el outbox real. */
            trigger: (evento: string, objeto_id?: string) => { testOnly(); return post<Obj>('/test_helpers/webhooks', { evento, objeto_id }); },
        },
    };

    return {
        testHelpers,
        me: () => get<{ org: { id: string; nombre: string; plan: string }; scope: string; mode: 'live' | 'test' }>('/me'),
        quotes,
        clients,
        products,
        invoices,
        collections: { retrieve: () => get<Obj>('/cobranza') },
        events,
        tasks: { create: (params: { titulo: string; due_date?: string; cotizacion_id?: string }, opts?: RequestOptions) => post<{ id: string }>('/tareas', params, opts) },
        webhookEndpoints,
        elements: { config: () => get<Obj>('/elements/config') },
    };
}
