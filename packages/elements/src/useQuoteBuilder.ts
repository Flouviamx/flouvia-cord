// Hooks de React sobre el núcleo headless. `useQuoteBuilder` es el estado
// completo del Builder sin UI (como `useSignIn()` frente a `<SignIn/>`);
// `<CordBuilder>` es un consumidor delgado de este hook.
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { createQuoteBuilder, type QuoteBuilder, type QuoteBuilderState, type QuoteBuilderEvent } from './headless/quote-builder.js';
import { createFiscalForm, type FiscalForm, type FiscalFormState } from './headless/fiscal-form.js';
import type { FiscalReceptorInput } from './fiscal/receptor.js';
import { useCordContext, useCordTranslations, useStore, en } from './context.js';
import type { CordProduct, CordClient, CreateQuoteResponse } from './types.js';

export interface UseQuoteBuilderOptions {
    onQuoteCreated?: (quote: CreateQuoteResponse) => void;
    /** Catálogo propio; si se pasa, no se pide a Cord. */
    catalog?: CordProduct[];
    /** Clientes conocidos (modo proxy o tu propio CRM). */
    clients?: CordClient[];
}

export interface UseQuoteBuilderResult extends QuoteBuilderState {
    builder: QuoteBuilder;
    clients: CordClient[];
    t: typeof en;
    /** Nombre del impuesto del país (IVA, VAT, GST). */
    taxLabel: string;
    /** Formatea un importe en la divisa elegida y el locale del Provider. */
    formatMoney: (amount: number) => string;
    /** Mensaje traducido del primer problema de un campo, o null. */
    issueFor: (field: string) => string | null;
}

export type BuilderContextType = UseQuoteBuilderResult;

export function formatMoney(amount: number, currency: string, locale: 'es' | 'en'): string {
    const intl = locale === 'en' ? 'en-US' : 'es-MX';
    try {
        return new Intl.NumberFormat(intl, { style: 'currency', currency: currency || 'MXN' }).format(Number(amount) || 0);
    } catch {
        return `${(Number(amount) || 0).toFixed(2)} ${currency}`;
    }
}

/** Requiere estar bajo un <CordProvider> con publishableKey o proxyUrl. */
export function useQuoteBuilder(opts: UseQuoteBuilderOptions = {}): UseQuoteBuilderResult {
    const context = useCordContext();
    const t = useCordTranslations();
    const optsRef = useRef(opts);
    optsRef.current = opts;
    const analyticsRef = useRef(context.onAnalyticsEvent);
    analyticsRef.current = context.onAnalyticsEvent;

    if (!context.client) {
        throw new Error('useQuoteBuilder necesita <CordProvider publishableKey="pk_…"> o <CordProvider proxyUrl="/api/cord">.');
    }
    const client = context.client;

    const builder = useMemo(() => createQuoteBuilder({
        client,
        catalog: opts.catalog,
        onCreated: (q) => optsRef.current.onQuoteCreated?.(q),
        onEvent: (event: QuoteBuilderEvent, payload) => analyticsRef.current?.(event, payload),
    // El catálogo inicial se toma al crear; para cambiarlo, remonta con otra key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [client]);

    const state = useStore(builder);
    const locale = context.locale || 'es';
    const taxLabel = state.config?.impuestos.etiqueta ?? t.tax;

    return {
        ...state,
        builder,
        clients: opts.clients ?? [],
        t,
        taxLabel,
        formatMoney: (amount) => formatMoney(amount, state.moneda, locale),
        issueFor: (field) => {
            const issue = state.issues.find((i) => i.field === field);
            return issue ? (t.issue[issue.code] ?? issue.code) : null;
        },
    };
}

/** Formulario fiscal headless conectado a React. */
export function useFiscalForm(initial?: FiscalReceptorInput): FiscalFormState & { form: FiscalForm } {
    const form = useMemo(() => createFiscalForm(initial),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [initial?.country]);
    const state = useStore(form);
    return { ...state, form };
}

// ==== Contexto para el patrón compound (<CordBuilder.Header/> etc.) ====

export const BuilderContext = createContext<UseQuoteBuilderResult | null>(null);

export function useBuilderContext(): UseQuoteBuilderResult {
    const ctx = useContext(BuilderContext);
    if (!ctx) throw new Error('Builder components must be used within a <CordBuilder>');
    return ctx;
}

/** Sincroniza un FiscalForm con el builder: el receptor válido viaja con la cotización. */
export function useLinkFiscalForm(builder: QuoteBuilder, form: FiscalForm) {
    useEffect(() => form.subscribe((s) => {
        builder.setFiscal(s.validation.value.tax_id ? { ...s.values } : null);
    }), [builder, form]);
}

export type { QuoteBuilderState, QuoteBuilder };
