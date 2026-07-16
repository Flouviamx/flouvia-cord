// Contexto + hooks compartidos por CordBuilder (react.tsx) y useQuoteBuilder
// (headless). Vive en su propio módulo para que ninguno de los dos importe
// del otro — evita el ciclo react.tsx ⇄ useQuoteBuilder.ts.
import { createElement, createContext, useContext, useState, useCallback, useEffect } from 'react';
import { resolveApiBase } from './config.js';
import { CordError } from './api.js';
import type { CordProviderProps, CordAppearance, CordProduct, CordClient, CreateQuoteResponse } from './types.js';

// El servidor envuelve TODA respuesta en `{ data }` (ver src/lib/apiv1.ts
// `ok()`); un proxy propio (como el de El Zarco) puede no hacerlo — por eso
// el unwrap es defensivo (si no hay `.data`, usa el body tal cual).
function unwrapEnvelope<T>(body: any): T {
    return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T;
}

async function parseErrorBody(res: Response): Promise<any> {
    try {
        return await res.json();
    } catch {
        return { error: res.statusText };
    }
}

// ==== i18n ====
export const en = {
    clientData: 'Client Data',
    nameCompany: 'Name / Company',
    namePlaceholder: 'E.g. John Doe',
    emailOptional: 'Email (Optional)',
    emailPlaceholder: 'client@company.com',
    config: 'Configuration',
    currency: 'Currency',
    terms: 'Payment Terms',
    cash: 'Cash',
    validityDays: 'Validity (days)',
    notes: 'Notes / Conditions',
    notesPlaceholder: 'E.g. Delivery time 3 to 5 business days...',
    items: 'Line Items',
    pricesIncludeIva: 'Prices include Tax (VAT)',
    addArticle: '+ Add Item',
    description: 'Description',
    searchProduct: 'Search product...',
    qty: 'Qty.',
    unitPrice: 'Unit Price',
    subtotal: 'Subtotal',
    iva: 'Tax (VAT)',
    total: 'Total',
    creating: 'Creating...',
    generateQuote: 'Generate Quote',
    errorDesc: 'All items must have a description.',
    errorToken: 'Error: Quote token required.',
    freeItemAdd: 'Add as free-text item...',
};

export const es: typeof en = {
    clientData: 'Datos del Cliente',
    nameCompany: 'Nombre / Empresa',
    namePlaceholder: 'Ej. Juan Pérez',
    emailOptional: 'Email (Opcional)',
    emailPlaceholder: 'cliente@empresa.com',
    config: 'Configuración',
    currency: 'Moneda',
    terms: 'Términos',
    cash: 'Contado',
    validityDays: 'Vigencia (días)',
    notes: 'Notas / Condiciones',
    notesPlaceholder: 'Ej. Tiempo de entrega de 3 a 5 días hábiles...',
    items: 'Partidas',
    pricesIncludeIva: 'Precios incluyen IVA',
    addArticle: '+ Agregar Artículo',
    description: 'Descripción',
    searchProduct: 'Buscar producto...',
    qty: 'Cant.',
    unitPrice: 'Precio Unit.',
    subtotal: 'Subtotal',
    iva: 'IVA',
    total: 'Total',
    creating: 'Creando...',
    generateQuote: 'Generar Cotización',
    errorDesc: 'Todos los artículos deben tener una descripción.',
    errorToken: 'Error: Token de cotización requerido.',
    freeItemAdd: 'Agregar como línea libre...',
};

export const dictionaries = { en, es };

// ==== Context ====

// A propósito NO es `CordProviderProps` (esa es la unión discriminada
// pk_/proxy que valida el llamador de <CordProvider> en tiempo de
// compilación). Una vez adentro del Provider, tras desestructurar props,
// se pierde el discriminante — internamente solo necesitamos campos
// opcionales planos; los hooks ya gatean por presencia (`if (context.proxyUrl)`).
export interface CordContextValue {
    baseUrl?: string;
    proxyUrl?: string;
    publishableKey?: string;
    token?: string;
    locale?: 'en' | 'es';
    ivaPct?: number;
    appearance?: CordAppearance;
    onAnalyticsEvent?: (event: string, payload?: any) => void;
}

export const CordContext = createContext<CordContextValue | null>(null);

export function useCordContext(): CordContextValue {
    const context = useContext(CordContext);
    if (!context) {
        throw new Error('Cord hooks and components must be used within a <CordProvider>');
    }
    return context;
}

/** Traducciones del locale activo. Requiere <CordProvider> (usa useCordContext). */
export function useCordTranslations() {
    const context = useCordContext();
    return dictionaries[context.locale || 'es'];
}

// ==== Provider ====

type CordAppearanceVariablesInternal = Record<string, string | undefined>;

// Defaults de la paleta oscura para los componentes NATIVOS (CordBuilder). Un
// consumidor que pase sus propias `variables` las sigue ganando — el merge de
// abajo pone los defaults primero y las variables del usuario después, EN EL
// MISMO objeto, para que "gana el usuario" sea un hecho de JS y no un pulso
// de especificidad CSS entre selectores.
const DARK_DEFAULTS: CordAppearanceVariablesInternal = {
    colorText: '#e5e7eb',
    colorBackground: '#111827',
};

export function CordProvider(props: CordProviderProps) {
    const { baseUrl, proxyUrl, publishableKey, token, locale = 'es', ivaPct, appearance, onAnalyticsEvent, children } = props;

    // Una publishable key NUNCA debe ser una secret key mal pegada — es el
    // error más caro posible (una sk_ en el navegador es visible en el
    // código fuente de la página). Falla ruidoso e inmediato, en vez de
    // dejar que el 403/insufficient_scope del servidor lo revele después.
    if (typeof window !== 'undefined' && publishableKey && !publishableKey.startsWith('pk_')) {
        throw new Error(
            `[Cord] <CordProvider> recibió una llave que no empieza con "pk_" (recibió "${publishableKey.slice(0, 7)}…"). ` +
            'NUNCA pases una secret key (sk_...) al navegador — usa `proxyUrl` y guarda la sk_ en tu servidor.'
        );
    }

    useEffect(() => {
        const rootId = 'cord-appearance-styles';

        if (!appearance) {
            // Sin appearance: no tocar el DOM (deja lo que haya de una config previa).
            return;
        }

        let style = document.getElementById(rootId) as HTMLStyleElement;
        if (!style) {
            style = document.createElement('style');
            style.id = rootId;
            document.head.appendChild(style);
        }

        const mq = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia('(prefers-color-scheme: dark)')
            : null;

        const render = () => {
            const isDark = appearance.theme === 'dark' || (appearance.theme === 'auto' && !!mq?.matches);
            document.documentElement.setAttribute('data-cord-theme', isDark ? 'dark' : 'light');

            let css = '';
            if (appearance.fonts) {
                appearance.fonts.forEach((f) => {
                    css += `@import url('${f.cssSrc}');\n`;
                });
            }
            const fontFamily = appearance.variables?.fontFamily
                || appearance.fonts?.[0]?.cssSrc.split('family=')[1]?.split('&')[0];
            if (fontFamily) {
                css += `:root { --cord-font-family: ${fontFamily.replace(/\+/g, ' ')}; }\n`;
            }

            // Merge en JS (no en cascada CSS): los defaults del theme SIEMPRE
            // pierden contra lo que el consumidor haya puesto en `variables`,
            // sin depender de especificidad de selector ni orden de reglas.
            const merged: CordAppearanceVariablesInternal = { ...(isDark ? DARK_DEFAULTS : {}), ...(appearance.variables || {}) };
            css += ':root {\n';
            for (const [key, value] of Object.entries(merged)) {
                if (value && key !== 'fontFamily') {
                    const cssVar = `--cord-${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`;
                    css += `  ${cssVar}: ${value};\n`;
                }
            }
            css += '}\n';
            style!.textContent = css;
        };

        render();
        mq?.addEventListener('change', render);

        return () => {
            mq?.removeEventListener('change', render);
            if (style && style.parentNode) {
                style.parentNode.removeChild(style);
            }
            document.documentElement.removeAttribute('data-cord-theme');
        };
    }, [appearance]);

    return createElement(
        CordContext.Provider,
        { value: { baseUrl, proxyUrl, publishableKey, token, locale, ivaPct, appearance, onAnalyticsEvent } },
        children,
    );
}

// ==== Hooks (Headless UI) ====

/**
 * Obtiene el contexto actual de Cord.
 * @param quoteToken (Opcional) Token de cotización. Si se provee, sobrescribe el token del Provider.
 * @returns Un objeto con el `token` activo.
 */
export function useCord(quoteToken?: string) {
    const context = useCordContext();
    const activeToken = quoteToken || context.token;
    return { token: activeToken };
}

export interface UseCordFetchOptions {
    /**
     * No hace fetch (ni siquiera revisa la config). Úsalo cuando YA tienes
     * los datos por otra vía (ej. los pasaste como prop a `<CordBuilder
     * catalog={...} clients={...}>` — llamar al hook igual está bien, las
     * Reglas de Hooks exigen invocarlo siempre; esto solo apaga su efecto).
     */
    skip?: boolean;
}

/**
 * Obtiene el catálogo de productos. `GET /productos` SÍ está permitido para
 * publishable keys (el servidor oculta `costo`/margen) — funciona directo
 * contra la API pública, sin necesitar `proxyUrl`.
 *
 * En modo proxy (sin `publishableKey`) este hook NO fetchea — no hay una
 * sub-ruta de catálogo estandarizada que derivar de tu `proxyUrl` (que es,
 * por diseño, el endpoint de CREAR cotizaciones). Pasa `catalog` como prop
 * en su lugar.
 *
 * @returns `products` (arreglo), `isLoading`, `error`, y `refetch` para recargar.
 */
export function useCordCatalog(opts: UseCordFetchOptions = {}) {
    const context = useCordContext();
    const [products, setProducts] = useState<CordProduct[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<CordError | null>(null);

    const fetchCatalog = useCallback(async () => {
        if (opts.skip || !context.publishableKey) return;
        setIsLoading(true);
        setError(null);
        try {
            const url = `${resolveApiBase(context.baseUrl)}/productos`;
            let res: Response;
            try {
                res = await fetch(url, { headers: { Authorization: `Bearer ${context.publishableKey}` } });
            } catch (err: any) {
                throw new CordError(0, { error: err?.message || 'Error de red' }, 'network_error');
            }
            if (!res.ok) throw new CordError(res.status, await parseErrorBody(res));
            const body = await res.json();
            setProducts(unwrapEnvelope<CordProduct[]>(body));
        } catch (err: any) {
            setError(err instanceof CordError ? err : new CordError(0, { error: err?.message }, 'unknown'));
        } finally {
            setIsLoading(false);
        }
    }, [context.publishableKey, context.baseUrl, opts.skip]);

    useEffect(() => {
        fetchCatalog();
    }, [fetchCatalog]);

    return { products, isLoading, error, refetch: fetchCatalog };
}

/**
 * Obtiene la lista de clientes de la organización. **Solo funciona en modo
 * proxy** — es una decisión de seguridad DELIBERADA, no un bug: una
 * publishable key vive en el código fuente de la página, así que jamás puede
 * leer el CRM (filtraría email/RFC/límite de crédito de todos tus clientes a
 * quien vea el código fuente). En modo publishable este hook NO intenta la
 * red — antes hacía un fetch real que el servidor rechazaba con 403 y el
 * error se tragaba en silencio (bug real, ver historial del SDK).
 *
 * @returns `clients` (arreglo), `isLoading`, `error`, y `refetch` para recargar.
 */
export function useCordClients(opts: UseCordFetchOptions = {}) {
    const context = useCordContext();
    const [clients, setClients] = useState<CordClient[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<CordError | null>(null);

    const fetchClients = useCallback(async () => {
        if (opts.skip) return;
        if (!context.proxyUrl) {
            if (context.publishableKey) {
                setError(new CordError(
                    403,
                    { error: 'Una publishable key no puede leer el CRM por diseño. Pasa `clients` como prop a <CordBuilder>/useQuoteBuilder, o configura `proxyUrl` en el <CordProvider>.' },
                    'clients_require_proxy',
                ));
            }
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const url = `${context.proxyUrl.replace(/\/$/, '')}/clientes`;
            let res: Response;
            try {
                res = await fetch(url);
            } catch (err: any) {
                throw new CordError(0, { error: err?.message || 'Error de red' }, 'network_error');
            }
            if (!res.ok) throw new CordError(res.status, await parseErrorBody(res));
            const body = await res.json();
            setClients(unwrapEnvelope<CordClient[]>(body));
        } catch (err: any) {
            setError(err instanceof CordError ? err : new CordError(0, { error: err?.message }, 'unknown'));
        } finally {
            setIsLoading(false);
        }
    }, [context.proxyUrl, context.publishableKey, opts.skip]);

    useEffect(() => {
        fetchClients();
    }, [fetchClients]);

    return { clients, isLoading, error, refetch: fetchClients };
}

/**
 * Hook para crear una nueva cotización programáticamente.
 * Usa `proxyUrl` o `publishableKey` según la configuración del CordProvider.
 * @returns Función `createQuote`, estado `isLoading` y `error`.
 */
export function useCreateQuote() {
    const context = useCordContext();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<CordError | null>(null);

    const createQuote = async (data: any): Promise<CreateQuoteResponse | null> => {
        setIsLoading(true);
        setError(null);
        try {
            const endpoint = context.proxyUrl || `${resolveApiBase(context.baseUrl)}/cotizaciones`;
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (context.publishableKey) {
                headers['Authorization'] = `Bearer ${context.publishableKey}`;
            }

            let res: Response;
            try {
                res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(data) });
            } catch (err: any) {
                throw new CordError(0, { error: err?.message || 'Error de red' }, 'network_error');
            }
            const body = await res.json();
            if (!res.ok) throw new CordError(res.status, body);
            // El servidor envuelve en `{ data }` (ver /api/v1/cotizaciones.ts) —
            // sin este unwrap, `result.folio`/`result.token` siempre venían undefined.
            return unwrapEnvelope<CreateQuoteResponse>(body);
        } catch (err: any) {
            setError(err instanceof CordError ? err : new CordError(0, { error: err?.message }, 'unknown'));
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    return { createQuote, isLoading, error };
}
