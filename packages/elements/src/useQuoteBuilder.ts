// Estado del cotizador extraído a un hook standalone — la coexistencia
// headless/styled estilo Clerk (`useSignIn()` + `<SignIn/>`). `<CordBuilder>`
// (react.tsx) es ahora un consumidor DELGADO de este hook; un consumidor que
// necesite su propia UI (como el editor de líneas que André tuvo que
// reescribir en El Zarco) puede llamar `useQuoteBuilder()` directo, sin
// `<CordBuilder>` de por medio — solo necesita estar bajo un <CordProvider>.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { calculateTotals } from './engine.js';
import { useCordContext, useCordTranslations, useCreateQuote, useCordCatalog, useCordClients, en } from './context.js';
import type { CordProduct, CordClient, CreateQuoteInput, CreateQuoteResponse, Terminos } from './types.js';

export interface QuoteBuilderItem {
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
}

export interface UseQuoteBuilderOptions {
    onQuoteCreated?: (quote: CreateQuoteResponse) => void;
    /** Catálogo de productos. Si se pasa, NO se hace fetch (ver useCordCatalog). */
    catalog?: CordProduct[];
    /** Clientes conocidos. Si se pasa, NO se hace fetch (ver useCordClients). */
    clients?: CordClient[];
    /** % de IVA (0.16 = 16%). Default 0.16 — idealmente el mismo que tu org en Cord. */
    ivaPct?: number;
}

export interface BuilderContextType {
    cliente: string; setCliente: (v: string) => void;
    clienteId: string | undefined; setClienteId: (v: string | undefined) => void;
    email: string; setEmail: (v: string) => void;
    notas: string; setNotas: (v: string) => void;
    terminos: Terminos; setTerminos: (v: Terminos) => void;
    vigenciaDias: number; setVigenciaDias: (v: number) => void;
    moneda: string; setMoneda: (v: string) => void;
    ivaIncluido: boolean; setIvaIncluido: (v: boolean) => void;

    items: QuoteBuilderItem[]; setItems: (v: QuoteBuilderItem[]) => void;
    products: CordProduct[];
    clients: CordClient[];
    subtotal: number;
    iva: number;
    total: number;
    isLoading: boolean;
    t: typeof en;
    handleSubmit: (e: FormEvent) => void;
    updateItem: (idx: number, updates: Partial<QuoteBuilderItem>) => void;
    removeItem: (idx: number) => void;
    submitError: string | null;
}

/** Requiere estar bajo un <CordProvider> (usa useCordContext internamente). */
export function useQuoteBuilder(opts: UseQuoteBuilderOptions = {}): BuilderContextType {
    const { onQuoteCreated, catalog, clients: propClients } = opts;
    const context = useCordContext();
    // Precedencia: ivaPct de ESTA instancia > <CordProvider> > 0.16. Configurarlo
    // en el Provider (no por instancia) evita que el total del Builder
    // diverja del que termina calculando el servidor para tu org.
    const ivaPct = opts.ivaPct ?? context.ivaPct ?? 0.16;
    const t = useCordTranslations();
    const { createQuote, isLoading } = useCreateQuote();
    // Estos dos hooks se llaman SIEMPRE (regla de hooks — nunca
    // condicionalmente); `skip` apaga su fetch interno cuando el consumidor
    // YA trajo `catalog`/`clients` como prop — antes esto disparaba 2 fetches
    // desperdiciados (y en El Zarco, 2 404 reales) en cada mount.
    const { products: fetchedProducts } = useCordCatalog({ skip: !!catalog });
    const { clients: fetchedClients } = useCordClients({ skip: !!propClients });
    const products = catalog || fetchedProducts || [];
    const clients = propClients || fetchedClients || [];

    const [cliente, setCliente] = useState('');
    const [clienteId, setClienteId] = useState<string | undefined>();
    const [email, setEmail] = useState('');
    const [notas, setNotas] = useState('');
    const [terminos, setTerminos] = useState<Terminos>('contado');
    const [vigenciaDias, setVigenciaDias] = useState(15);
    const [moneda, setMoneda] = useState('MXN');
    const [ivaIncluido, setIvaIncluido] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const [items, setItems] = useState<QuoteBuilderItem[]>([{ descripcion: '', cantidad: 1, precio_unitario: 0 }]);

    const { subtotal, iva, total } = useMemo(
        () => calculateTotals(items, ivaPct, ivaIncluido),
        [items, ivaPct, ivaIncluido],
    );

    useEffect(() => {
        context.onAnalyticsEvent?.('QUOTE_BUILDER_MOUNTED', { items: items.length });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        if (items.some((i) => !i.descripcion)) {
            setSubmitError(t.errorDesc);
            return;
        }

        context.onAnalyticsEvent?.('CHECKOUT_STARTED', { subtotal, itemsCount: items.length, moneda });

        // Sin `clienteId` (no hizo match con el datalist) mandamos el bloque
        // `cliente` — el servidor hace find-or-create (nunca actualiza uno
        // existente, ver createCotizacion en src/lib/cotizaciones.ts). Con
        // `clienteId` ya resuelto, no hay nada que crear.
        const payload: CreateQuoteInput = {
            cliente_id: clienteId,
            cliente: !clienteId && cliente ? { empresa: cliente, email: email || undefined } : undefined,
            notas,
            terminos,
            vigencia_dias: vigenciaDias,
            base_currency: moneda,
            iva_incluido: ivaIncluido,
            items,
        };

        const res = await createQuote(payload);
        if (res && onQuoteCreated) {
            onQuoteCreated(res);
        } else if (!res) {
            context.onAnalyticsEvent?.('API_ERROR', { action: 'create_quote' });
        }
    };

    const updateItem = (index: number, updates: Partial<QuoteBuilderItem>) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], ...updates };
        setItems(newItems);
        context.onAnalyticsEvent?.('ITEM_UPDATED', { index, updates });
    };

    const removeItem = (index: number) => {
        if (items.length === 1) return;
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
        context.onAnalyticsEvent?.('ITEM_REMOVED', { index });
    };

    return {
        cliente, setCliente, clienteId, setClienteId, email, setEmail,
        notas, setNotas, terminos, setTerminos, vigenciaDias, setVigenciaDias,
        moneda, setMoneda, ivaIncluido, setIvaIncluido,
        items, setItems, products, clients, subtotal, iva, total, isLoading, t,
        handleSubmit, updateItem, removeItem, submitError,
    };
}

// ==== Contexto para el patrón compound (<CordBuilder.Header/> etc.) ====

export const BuilderContext = createContext<BuilderContextType | null>(null);

export function useBuilderContext(): BuilderContextType {
    const ctx = useContext(BuilderContext);
    if (!ctx) throw new Error('Builder components must be used within a <CordBuilder>');
    return ctx;
}
