// Quote Builder headless: todo el estado y las reglas de armar una cotización,
// sin una sola línea de UI. <CordBuilder>, el Web Component y tu propia interfaz
// son consumidores de esto. Los totales salen del mismo motor que usa el
// servidor y las opciones (divisas, impuestos, términos) de su configuración.
import { calculateDocumentTotals, type DocumentTotals } from '../engine.js';
import { validateFiscalReceptor, type FiscalIssue, type FiscalReceptorInput } from '../fiscal/receptor.js';
import type { CordElementsConfig, CordTerminos } from '../contract/elements-config.js';
import type { CordProduct, CreateQuoteInput, CreateQuoteResponse } from '../types.js';
import { CordError } from '../api.js';
import { createStore, type ReadableStore } from './store.js';
import { newIdempotencyKey, type CordClient, type AiDraftInput } from './client.js';

export interface BuilderItem {
    key: string;
    producto_id: string | null;
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    /** Fracción 0–1, elegida de config.impuestos.opciones. */
    tax_rate: number;
    /** Línea propuesta por la IA, para que tu UI la distinga hasta que se revise. */
    sugerida?: { origen: 'ai'; precio_mencionado: number | null };
}

export interface BuilderCliente {
    empresa: string;
    email: string;
    contacto: string;
    telefono: string;
}

export type BuilderIssueCode =
    | 'required' | 'invalid_email' | 'no_items' | 'invalid_quantity' | 'invalid_price'
    | 'invalid_tax_rate' | 'unsupported_currency' | 'invalid_validity' | 'too_many_items';

export interface BuilderIssue { field: string; code: BuilderIssueCode | FiscalIssue['code'] }

export interface QuoteBuilderState {
    status: 'loading' | 'ready' | 'submitting' | 'success' | 'error';
    config: CordElementsConfig | null;
    products: CordProduct[];
    cliente: BuilderCliente;
    fiscal: FiscalReceptorInput | null;
    moneda: string;
    terminos: CordTerminos;
    vigencia_dias: number;
    notas: string;
    precios_incluyen_impuesto: boolean;
    /**
     * Código de cupón que capturó el comprador. Lo valida y aplica el servidor
     * al crear la cotización: `totals` no lo incluye porque su valor no se
     * conoce de este lado, y el total de `result` sí.
     */
    cupon: string;
    items: BuilderItem[];
    totals: DocumentTotals;
    issues: BuilderIssue[];
    result: CreateQuoteResponse | null;
    error: CordError | null;
    ai: { status: 'idle' | 'streaming' | 'done' | 'error'; count: number; error: CordError | null };
}

export interface QuoteBuilder extends ReadableStore<QuoteBuilderState> {
    /** Carga configuración y catálogo. Se llama sola al crear el builder. */
    load(): Promise<void>;
    setCliente(patch: Partial<BuilderCliente>): void;
    setFiscal(input: FiscalReceptorInput | null): void;
    setMoneda(moneda: string): void;
    setTerminos(terminos: CordTerminos): void;
    setVigencia(dias: number): void;
    setNotas(notas: string): void;
    setPreciosIncluyenImpuesto(value: boolean): void;
    /** Código de cupón; vacío lo quita. Se normaliza a mayúsculas. */
    setCupon(codigo: string): void;
    addItem(item?: Partial<Omit<BuilderItem, 'key'>>): string;
    addProduct(product: CordProduct, cantidad?: number): string;
    updateItem(key: string, patch: Partial<Omit<BuilderItem, 'key'>>): void;
    removeItem(key: string): void;
    searchProducts(query: string, limit?: number): CordProduct[];
    validate(): BuilderIssue[];
    submit(): Promise<CreateQuoteResponse | null>;
    reset(): void;
    /** Llena las partidas con IA desde un pedido escrito, una foto o un PDF, línea por línea. */
    draftWithAi(input: AiDraftInput, opts?: { signal?: AbortSignal }): Promise<number>;
}

export interface QuoteBuilderOptions {
    client: CordClient;
    /** Catálogo propio; si se pasa, no se pide a Cord. */
    catalog?: CordProduct[];
    /** Se emite cada vez que se crea una cotización. */
    onCreated?: (quote: CreateQuoteResponse) => void;
    /** Analítica propia; los nombres son estables entre versiones. */
    onEvent?: (event: QuoteBuilderEvent, payload: Record<string, unknown>) => void;
}

export type QuoteBuilderEvent =
    | 'builder.loaded' | 'builder.item_added' | 'builder.item_removed'
    | 'builder.submitted' | 'builder.created' | 'builder.failed' | 'builder.ai_drafted';

const MAX_ITEMS = 500;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;
const EMPTY_TOTALS = calculateDocumentTotals([]);
let keySeq = 0;
const nextKey = () => `it_${Date.now().toString(36)}_${(keySeq++).toString(36)}`;

export function createQuoteBuilder(opts: QuoteBuilderOptions): QuoteBuilder {
    const store = createStore<QuoteBuilderState>(initialState(null));
    // Una cotización por intención de envío: la misma clave viaja en cada
    // reintento y en un doble clic, así que el servidor nunca crea dos.
    let pendingKey: string | null = null;

    const emit = (event: QuoteBuilderEvent, payload: Record<string, unknown> = {}) => {
        try { opts.onEvent?.(event, payload); } catch { /* la analítica del host no rompe el builder */ }
    };

    const commit = (patch: Partial<QuoteBuilderState>) => {
        store.set((prev) => {
            const next = { ...prev, ...patch };
            next.totals = computeTotals(next);
            if (prev.issues.length) next.issues = validateState(next);
            if (prev.status === 'success' || prev.status === 'error') {
                next.status = next.config ? 'ready' : prev.status;
                next.error = null;
            }
            return next;
        });
        pendingKey = null;
    };

    async function load() {
        try {
            const [config, products] = await Promise.all([
                opts.client.config(),
                opts.catalog ? Promise.resolve(opts.catalog) : opts.client.products().catch(() => [] as CordProduct[]),
            ]);
            store.set((prev) => {
                const next = { ...initialState(config), ...keepUserInput(prev, config), config, products, status: 'ready' as const };
                next.totals = computeTotals(next);
                return next;
            });
            emit('builder.loaded', { items: store.get().items.length });
        } catch (err) {
            store.set((prev) => ({ ...prev, status: 'error', error: asCordError(err) }));
        }
    }

    const builder: QuoteBuilder = {
        get: store.get,
        subscribe: store.subscribe,
        load,
        setCliente: (patch) => commit({ cliente: { ...store.get().cliente, ...clip(patch) } }),
        setFiscal: (input) => commit({ fiscal: input }),
        setMoneda: (moneda) => commit({ moneda: String(moneda).toUpperCase() }),
        setTerminos: (terminos) => commit({ terminos }),
        setVigencia: (dias) => commit({ vigencia_dias: Math.round(Number(dias)) }),
        setNotas: (notas) => commit({ notas: String(notas).slice(0, 5000) }),
        setPreciosIncluyenImpuesto: (value) => commit({ precios_incluyen_impuesto: !!value }),
        setCupon: (codigo) => commit({ cupon: String(codigo ?? '').trim().toUpperCase().slice(0, 32) }),
        addItem(item = {}) {
            const s = store.get();
            const key = nextKey();
            commit({ items: [...s.items, { key, producto_id: null, descripcion: '', cantidad: 1, precio_unitario: 0, tax_rate: s.config?.impuestos.tasa_default ?? 0, ...item }] });
            emit('builder.item_added', { items: store.get().items.length });
            return key;
        },
        addProduct(product, cantidad = 1) {
            return builder.addItem({
                producto_id: product.id,
                descripcion: product.nombre_web || product.nombre,
                cantidad,
                precio_unitario: Number(product.precio_final ?? product.precio ?? 0),
            });
        },
        updateItem(key, patch) {
            commit({ items: store.get().items.map((it) => (it.key === key ? { ...it, ...patch, key } : it)) });
        },
        removeItem(key) {
            commit({ items: store.get().items.filter((it) => it.key !== key) });
            emit('builder.item_removed', { items: store.get().items.length });
        },
        searchProducts(query, limit = 15) {
            const q = query.trim().toLowerCase();
            const all = store.get().products;
            if (!q) return all.slice(0, limit);
            return all.filter((p) => `${p.nombre_web || p.nombre} ${p.sku ?? ''}`.toLowerCase().includes(q)).slice(0, limit);
        },
        validate() {
            const issues = validateState(store.get());
            store.set((prev) => ({ ...prev, issues }));
            return issues;
        },
        async submit() {
            const s = store.get();
            if (s.status === 'submitting') return null;
            const issues = builder.validate();
            if (issues.length) return null;
            pendingKey = pendingKey ?? newIdempotencyKey();
            const key = pendingKey;
            store.set((prev) => ({ ...prev, status: 'submitting', error: null }));
            emit('builder.submitted', { items: s.items.length, moneda: s.moneda });
            try {
                const result = await opts.client.createQuote(toPayload(store.get()), { idempotencyKey: key });
                store.set((prev) => ({ ...prev, status: 'success', result }));
                pendingKey = null;
                emit('builder.created', { folio: result.folio ?? null });
                opts.onCreated?.(result);
                return result;
            } catch (err) {
                const error = asCordError(err);
                store.set((prev) => ({ ...prev, status: 'error', error }));
                emit('builder.failed', { code: error.code, request_id: error.requestId });
                return null;
            }
        },
        async draftWithAi(input, { signal } = {}) {
            if (store.get().ai.status === 'streaming') return 0;
            store.set((prev) => ({ ...prev, ai: { status: 'streaming', count: 0, error: null } }));
            const isBlank = (it: { descripcion: string; precio_unitario: number }) => !it.descripcion.trim() && !it.precio_unitario;
            try {
                const { count } = await opts.client.aiDraft(input, (item) => {
                    const s = store.get();
                    const line = {
                        key: nextKey(),
                        producto_id: item.id,
                        descripcion: item.nombre,
                        cantidad: item.cantidad,
                        precio_unitario: item.lista,
                        tax_rate: s.config?.impuestos.tasa_default ?? 0,
                        sugerida: { origen: 'ai' as const, precio_mencionado: item.negociado },
                    };
                    const base = s.items.length === 1 && isBlank(s.items[0]) ? [] : s.items;
                    commit({ items: [...base, line].slice(0, MAX_ITEMS) });
                    store.set((prev) => ({ ...prev, ai: { ...prev.ai, count: prev.ai.count + 1 } }));
                }, { signal });
                store.set((prev) => ({ ...prev, ai: { status: 'done', count, error: null } }));
                emit('builder.ai_drafted', { count });
                return count;
            } catch (err) {
                const error = asCordError(err);
                store.set((prev) => ({ ...prev, ai: { ...prev.ai, status: 'error', error } }));
                return 0;
            }
        },
        reset() {
            pendingKey = null;
            const s = store.get();
            const next = { ...initialState(s.config), config: s.config, products: s.products, status: s.config ? 'ready' as const : 'loading' as const };
            next.totals = computeTotals(next);
            store.set(next);
        },
    };

    void load();
    return builder;
}

function initialState(config: CordElementsConfig | null): QuoteBuilderState {
    return {
        status: 'loading',
        config,
        products: [],
        cliente: { empresa: '', email: '', contacto: '', telefono: '' },
        fiscal: null,
        moneda: config?.org.moneda ?? '',
        terminos: config?.terminos_default ?? 'contado',
        vigencia_dias: config?.vigencia_dias_default ?? 30,
        notas: '',
        precios_incluyen_impuesto: config?.impuestos.precios_incluyen_impuesto ?? false,
        cupon: '',
        items: [{ key: nextKey(), producto_id: null, descripcion: '', cantidad: 1, precio_unitario: 0, tax_rate: config?.impuestos.tasa_default ?? 0 }],
        totals: EMPTY_TOTALS,
        issues: [],
        result: null,
        error: null,
        ai: { status: 'idle', count: 0, error: null },
    };
}

// Lo que el usuario ya escribió mientras cargaba la configuración no se pierde.
function keepUserInput(prev: QuoteBuilderState, config: CordElementsConfig): Partial<QuoteBuilderState> {
    const touched = prev.items.some((it) => it.descripcion || it.precio_unitario) || prev.cliente.empresa;
    if (!touched) return {};
    return {
        cliente: prev.cliente,
        fiscal: prev.fiscal,
        notas: prev.notas,
        cupon: prev.cupon,
        items: prev.items.map((it) => ({ ...it, tax_rate: config.impuestos.tasa_default })),
    };
}

function computeTotals(s: QuoteBuilderState): DocumentTotals {
    try {
        return calculateDocumentTotals(
            s.items.map((it) => ({ descripcion: it.descripcion, cantidad: it.cantidad, precio_unitario: it.precio_unitario, tax_rate: it.tax_rate })),
            { ivaIncluido: s.precios_incluyen_impuesto, retenciones: s.config?.impuestos.retenciones ?? [] },
        );
    } catch {
        return EMPTY_TOTALS;
    }
}

export function validateState(s: QuoteBuilderState): BuilderIssue[] {
    const issues: BuilderIssue[] = [];
    if (!s.cliente.empresa.trim() && !s.fiscal) issues.push({ field: 'cliente.empresa', code: 'required' });
    if (s.cliente.email && !EMAIL_RE.test(s.cliente.email.trim())) issues.push({ field: 'cliente.email', code: 'invalid_email' });
    if (s.config && !s.config.monedas.includes(s.moneda)) issues.push({ field: 'moneda', code: 'unsupported_currency' });
    if (!Number.isInteger(s.vigencia_dias) || s.vigencia_dias < 1 || s.vigencia_dias > 365) issues.push({ field: 'vigencia_dias', code: 'invalid_validity' });
    if (!s.items.length) issues.push({ field: 'items', code: 'no_items' });
    if (s.items.length > MAX_ITEMS) issues.push({ field: 'items', code: 'too_many_items' });
    const rates = new Set((s.config?.impuestos.opciones ?? []).map((o) => o.rate));
    s.items.forEach((it, i) => {
        if (!it.descripcion.trim()) issues.push({ field: `items.${i}.descripcion`, code: 'required' });
        if (!(Number.isFinite(it.cantidad) && it.cantidad > 0)) issues.push({ field: `items.${i}.cantidad`, code: 'invalid_quantity' });
        if (!(Number.isFinite(it.precio_unitario) && it.precio_unitario >= 0)) issues.push({ field: `items.${i}.precio_unitario`, code: 'invalid_price' });
        if (s.config && ![...rates].some((r) => Math.abs(r - it.tax_rate) < 1e-9)) issues.push({ field: `items.${i}.tax_rate`, code: 'invalid_tax_rate' });
    });
    if (s.fiscal) {
        const r = validateFiscalReceptor({ ...s.fiscal, legal_name: s.fiscal.legal_name || s.cliente.empresa });
        for (const e of r.errors) issues.push({ field: `fiscal.${e.field}`, code: e.code });
    }
    return issues;
}

function toPayload(s: QuoteBuilderState): CreateQuoteInput {
    const cliente = s.cliente.empresa.trim() || s.fiscal
        ? {
            empresa: s.cliente.empresa.trim() || s.fiscal?.legal_name || '',
            email: s.cliente.email.trim() || undefined,
            contacto: s.cliente.contacto.trim() || undefined,
            telefono: s.cliente.telefono.trim() || undefined,
            fiscal: s.fiscal ?? undefined,
        }
        : undefined;
    return {
        cliente,
        terminos: s.terminos,
        vigencia_dias: s.vigencia_dias,
        notas: s.notas.trim() || undefined,
        base_currency: s.moneda,
        iva_incluido: s.precios_incluyen_impuesto,
        ...(s.cupon ? { cupon: s.cupon } : {}),
        items: s.items.map((it) => ({
            producto_id: it.producto_id ?? undefined,
            descripcion: it.descripcion.trim(),
            cantidad: it.cantidad,
            precio_unitario: it.precio_unitario,
            tax_rate: it.tax_rate,
        })),
    };
}

function clip(patch: Partial<BuilderCliente>): Partial<BuilderCliente> {
    const max: Record<keyof BuilderCliente, number> = { empresa: 200, email: 254, contacto: 120, telefono: 40 };
    const out: Partial<BuilderCliente> = {};
    for (const k of Object.keys(patch) as (keyof BuilderCliente)[]) out[k] = String(patch[k] ?? '').slice(0, max[k]);
    return out;
}

function asCordError(err: unknown): CordError {
    return err instanceof CordError ? err : new CordError(0, { error: (err as Error)?.message || 'Error desconocido' }, 'unknown');
}
