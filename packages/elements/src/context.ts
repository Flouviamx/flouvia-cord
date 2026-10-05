// Contexto + hooks compartidos por los componentes de React. El estado y la red
// viven en el núcleo headless (src/headless); aquí solo se conectan a React.
import { createElement, createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type * as React from 'react';
import { CordError } from './api.js';
import { createCordClient, newIdempotencyKey, type CordClient } from './headless/client.js';
import type { ReadableStore } from './headless/store.js';
import { sanitizeAppearance } from './appearance.js';
import type { CordProviderProps, CordAppearance, CordProduct, CordClient as CordClientRecord, CreateQuoteInput, CreateQuoteResponse } from './types.js';

// ==== i18n ====
// `{tax}` se sustituye por el nombre del impuesto del país (IVA, VAT, GST…),
// que viene de la configuración de la organización.
export const en = {
    clientData: 'Client',
    nameCompany: 'Name / Company',
    namePlaceholder: 'E.g. John Doe',
    emailOptional: 'Email (optional)',
    emailPlaceholder: 'client@company.com',
    config: 'Terms',
    currency: 'Currency',
    terms: 'Payment terms',
    cash: 'Due on receipt',
    net30: 'Net 30',
    net60: 'Net 60',
    validityDays: 'Valid for (days)',
    notes: 'Notes',
    notesPlaceholder: 'E.g. Delivery in 3 to 5 business days',
    items: 'Line items',
    pricesInclude: 'Prices include {tax}',
    addArticle: 'Add item',
    description: 'Description',
    searchProduct: 'Search product',
    qty: 'Qty.',
    unitPrice: 'Unit price',
    tax: 'Tax',
    remove: 'Remove line',
    subtotal: 'Subtotal',
    total: 'Total',
    creating: 'Creating…',
    generateQuote: 'Create quote',
    freeItemAdd: 'Add as a free-text line',
    loading: 'Loading…',
    fiscalData: 'Tax details',
    errorToken: 'A quote token is required.',
    issue: {
        required: 'Required.',
        invalid_email: 'Enter a valid email.',
        no_items: 'Add at least one line.',
        invalid_quantity: 'Quantity must be greater than zero.',
        invalid_price: 'Enter a valid price.',
        invalid_tax_rate: 'Choose a tax rate from the list.',
        unsupported_currency: 'That currency is not available.',
        invalid_validity: 'Between 1 and 365 days.',
        too_many_items: 'Too many lines.',
    } as Record<string, string>,
};

export const es: typeof en = {
    clientData: 'Cliente',
    nameCompany: 'Nombre / Empresa',
    namePlaceholder: 'Ej. Juan Pérez',
    emailOptional: 'Correo (opcional)',
    emailPlaceholder: 'cliente@empresa.com',
    config: 'Condiciones',
    currency: 'Moneda',
    terms: 'Términos de pago',
    cash: 'Contado',
    net30: 'Neto 30',
    net60: 'Neto 60',
    validityDays: 'Vigencia (días)',
    notes: 'Notas',
    notesPlaceholder: 'Ej. Entrega de 3 a 5 días hábiles',
    items: 'Partidas',
    pricesInclude: 'Precios incluyen {tax}',
    addArticle: 'Agregar partida',
    description: 'Descripción',
    searchProduct: 'Buscar producto',
    qty: 'Cant.',
    unitPrice: 'Precio unit.',
    tax: 'Impuesto',
    remove: 'Quitar partida',
    subtotal: 'Subtotal',
    total: 'Total',
    creating: 'Creando…',
    generateQuote: 'Crear cotización',
    freeItemAdd: 'Agregar como línea libre',
    loading: 'Cargando…',
    fiscalData: 'Datos fiscales',
    errorToken: 'Falta el token de la cotización.',
    issue: {
        required: 'Obligatorio.',
        invalid_email: 'Escribe un correo válido.',
        no_items: 'Agrega al menos una partida.',
        invalid_quantity: 'La cantidad debe ser mayor a cero.',
        invalid_price: 'Escribe un precio válido.',
        invalid_tax_rate: 'Elige una tasa de la lista.',
        unsupported_currency: 'Esa moneda no está disponible.',
        invalid_validity: 'Entre 1 y 365 días.',
        too_many_items: 'Demasiadas partidas.',
    },
};

export const dictionaries = { en, es };

// ==== Contexto ====

export interface CordContextValue {
    baseUrl?: string;
    proxyUrl?: string;
    publishableKey?: string;
    token?: string;
    locale?: 'en' | 'es';
    appearance?: CordAppearance;
    debug?: boolean;
    onAnalyticsEvent?: (event: string, payload?: any) => void;
    /** Cliente HTTP del navegador; null en modo solo visor. */
    client: CordClient | null;
}

export const CordContext = createContext<CordContextValue | null>(null);

export function useCordContext(): CordContextValue {
    const context = useContext(CordContext);
    if (!context) throw new Error('Cord hooks and components must be used within a <CordProvider>');
    return context;
}

export function useCordTranslations() {
    return dictionaries[useCordContext().locale || 'es'];
}

/** Conecta un store del núcleo headless a React (17+). */
export function useStore<T>(store: ReadableStore<T>): T {
    const [state, setState] = useState(store.get());
    useEffect(() => {
        setState(store.get());
        return store.subscribe(setState);
    }, [store]);
    return state;
}

const DARK: Record<string, string> = { '--cord-color-text': '#e5e7eb', '--cord-color-background': '#111827' };

/**
 * Variables `--cord-*` de un appearance, ya validadas, como estilo inline. Se
 * aplican en la raíz de cada componente: nunca en `:root` de tu página.
 */
export function appearanceStyle(appearance: CordAppearance | undefined, prefersDark = false): React.CSSProperties {
    if (!appearance) return {};
    const a = sanitizeAppearance(appearance);
    const dark = a.theme === 'dark' || (a.theme === 'auto' && prefersDark);
    return { ...(dark ? DARK : {}), ...Object.fromEntries(a.variables) } as React.CSSProperties;
}

export function usePrefersDark(): boolean {
    const query = useMemo(
        () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null),
        [],
    );
    const [dark, setDark] = useState(!!query?.matches);
    useEffect(() => {
        if (!query) return;
        const on = () => setDark(query.matches);
        query.addEventListener('change', on);
        return () => query.removeEventListener('change', on);
    }, [query]);
    return dark;
}

// Las fuentes son lo único que se carga a nivel documento: un <link> por URL ya
// validada (proveedores conocidos, https), sin estilos que afecten tu página.
function useAppearanceFonts(appearance: CordAppearance | undefined) {
    const key = useMemo(() => (appearance ? sanitizeAppearance(appearance).fontImports.join('|') : ''), [appearance]);
    useEffect(() => {
        if (typeof document === 'undefined' || !key) return;
        const added: HTMLLinkElement[] = [];
        for (const href of key.split('|')) {
            const exists = Array.from(document.querySelectorAll<HTMLLinkElement>('link[data-cord-font]')).some((l) => l.dataset.cordFont === href);
            if (exists) continue;
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.dataset.cordFont = href;
            link.referrerPolicy = 'no-referrer';
            document.head.appendChild(link);
            added.push(link);
        }
        return () => { for (const l of added) l.remove(); };
    }, [key]);
}

export function CordProvider(props: CordProviderProps) {
    const { baseUrl, proxyUrl, publishableKey, token, locale = 'es', appearance, onAnalyticsEvent, debug, children } = props;

    if (typeof window !== 'undefined' && publishableKey && !publishableKey.startsWith('pk_')) {
        throw new Error(
            `[Cord] <CordProvider> recibió una llave que no empieza con "pk_" (recibió "${publishableKey.slice(0, 7)}…"). ` +
            'Una secret key nunca va en el navegador: usa `proxyUrl` y guarda la sk_ en tu servidor.',
        );
    }
    const legacyIvaPct = (props as { ivaPct?: number }).ivaPct;
    useEffect(() => {
        if (legacyIvaPct !== undefined && (typeof process === 'undefined' || process.env?.NODE_ENV !== 'production')) {
            console.warn('[Cord] `ivaPct` ya no se usa: las tasas por línea vienen de la configuración de tu organización en Cord.');
        }
    }, [legacyIvaPct]);

    useAppearanceFonts(appearance);

    const client = useMemo(() => {
        if (!publishableKey && !proxyUrl) return null;
        return createCordClient({ publishableKey, proxyUrl, baseUrl, debug });
    }, [publishableKey, proxyUrl, baseUrl, debug]);

    const value = useMemo<CordContextValue>(
        () => ({ baseUrl, proxyUrl, publishableKey, token, locale, appearance, onAnalyticsEvent, debug, client }),
        [baseUrl, proxyUrl, publishableKey, token, locale, appearance, onAnalyticsEvent, debug, client],
    );
    return createElement(CordContext.Provider, { value }, children);
}

// ==== Hooks ====

export function useCord(quoteToken?: string) {
    const context = useCordContext();
    return { token: quoteToken || context.token };
}

export interface UseCordFetchOptions {
    /** No hace fetch: úsalo cuando ya tienes los datos por otra vía. */
    skip?: boolean;
}

function asCordError(err: unknown): CordError {
    return err instanceof CordError ? err : new CordError(0, { error: (err as Error)?.message }, 'unknown');
}

/** Catálogo de productos (una pk_ lo puede leer; el servidor oculta el costo). */
export function useCordCatalog(opts: UseCordFetchOptions = {}) {
    const { client } = useCordContext();
    const [products, setProducts] = useState<CordProduct[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<CordError | null>(null);

    const refetch = useCallback(async () => {
        if (opts.skip || !client) return;
        setIsLoading(true);
        setError(null);
        try { setProducts(await client.products()); }
        catch (err) { setError(asCordError(err)); }
        finally { setIsLoading(false); }
    }, [client, opts.skip]);

    useEffect(() => { void refetch(); }, [refetch]);
    return { products, isLoading, error, refetch };
}

/**
 * Clientes de la organización. Solo en modo proxy, a propósito: una pk_ vive en
 * el código de la página y jamás puede leer el CRM.
 */
export function useCordClients(opts: UseCordFetchOptions = {}) {
    const context = useCordContext();
    const [clients, setClients] = useState<CordClientRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<CordError | null>(null);

    const refetch = useCallback(async () => {
        if (opts.skip) return;
        if (!context.proxyUrl) {
            if (context.publishableKey) {
                setError(new CordError(403, { error: 'Una publishable key no puede leer el CRM por diseño. Pasa `clients` como prop, o configura `proxyUrl`.' }, 'clients_require_proxy'));
            }
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(`${context.proxyUrl.replace(/\/+$/, '')}/clientes`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
            const body = await res.json().catch(() => ({ error: res.statusText }));
            if (!res.ok) throw new CordError(res.status, body, undefined, res.headers.get('cord-request-id'));
            setClients((body && typeof body === 'object' && 'data' in body ? body.data : body) as CordClientRecord[]);
        } catch (err) {
            setError(asCordError(err));
        } finally {
            setIsLoading(false);
        }
    }, [context.proxyUrl, context.publishableKey, opts.skip]);

    useEffect(() => { void refetch(); }, [refetch]);
    return { clients, isLoading, error, refetch };
}

/**
 * Crea una cotización. Una misma llamada (y sus reintentos) usa una sola clave
 * de idempotencia, y mientras está en vuelo un segundo clic devuelve la misma
 * promesa: no se crean dos cotizaciones.
 */
export function useCreateQuote() {
    const { client } = useCordContext();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<CordError | null>(null);
    const inFlight = useRef<Promise<CreateQuoteResponse | null> | null>(null);

    const createQuote = useCallback((data: CreateQuoteInput, opts: { idempotencyKey?: string } = {}): Promise<CreateQuoteResponse | null> => {
        if (inFlight.current) return inFlight.current;
        if (!client) {
            setError(new CordError(0, { error: 'Configura publishableKey o proxyUrl en <CordProvider>.' }, 'missing_key'));
            return Promise.resolve(null);
        }
        setIsLoading(true);
        setError(null);
        const run = client.createQuote(data, { idempotencyKey: opts.idempotencyKey ?? newIdempotencyKey() })
            .catch((err) => { setError(asCordError(err)); return null; })
            .finally(() => { setIsLoading(false); inFlight.current = null; });
        inFlight.current = run;
        return run;
    }, [client]);

    return { createQuote, isLoading, error };
}
