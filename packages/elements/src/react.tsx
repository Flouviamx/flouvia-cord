import React, { useRef, useEffect, createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { calculateTotals } from './engine';
import { mountCotizador } from './core';
import type { 
    CordElementOptions, 
    CordEventDetail, 
    CordProviderProps,
    CreateQuoteInput,
    CreateQuoteResponse,
    CordProduct,
    CordClient,
    Terminos
} from './types';

// ==== i18n ====
const en = {
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
    iva: 'Tax (VAT 16%)',
    total: 'Total',
    creating: 'Creating...',
    generateQuote: 'Generate Quote',
    errorDesc: 'All items must have a description.',
    errorToken: 'Error: Quote token required.'
};

const es: typeof en = {
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
    iva: 'IVA (16%)',
    total: 'Total',
    creating: 'Creando...',
    generateQuote: 'Generar Cotización',
    errorDesc: 'Todos los artículos deben tener una descripción.',
    errorToken: 'Error: Token de cotización requerido.'
};

const dictionaries = { en, es };

export function useCordTranslations() {
    const context = useCordContext();
    return dictionaries[context.locale || 'es'];
}

// ==== Context ====

const CordContext = createContext<CordProviderProps & { onAnalyticsEvent?: (event: string, payload?: any) => void } | null>(null);

export function CordProvider({ proxyUrl, publishableKey, token, locale = 'es', appearance, onAnalyticsEvent, children }: CordProviderProps & { onAnalyticsEvent?: (event: string, payload?: any) => void }) {
    useEffect(() => {
        if (!appearance) return;
        const rootId = 'cord-appearance-styles';
        let style = document.getElementById(rootId) as HTMLStyleElement;
        if (!style) {
            style = document.createElement('style');
            style.id = rootId;
            document.head.appendChild(style);
        }

        let css = '';
        if (appearance.fonts) {
            appearance.fonts.forEach(f => {
                css += `@import url('${f.cssSrc}');\n`;
            });
            const fontFamily = appearance.variables?.fontFamily || appearance.fonts[0].cssSrc.split('family=')[1]?.split('&')[0];
            if (fontFamily) {
                css += `:root { --cord-font-family: ${fontFamily.replace(/\+/g, ' ')}; }\n`;
            }
        }

        if (appearance.variables) {
            css += ':root {\n';
            for (const [key, value] of Object.entries(appearance.variables)) {
                if (value && key !== 'fontFamily') {
                    const cssVar = `--cord-${key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`;
                    css += `  ${cssVar}: ${value};\n`;
                }
            }
            css += '}\n';
        }
        style.textContent = css;

        return () => {
            if (style && style.parentNode) {
                style.parentNode.removeChild(style);
            }
        };
    }, [appearance]);

    return (
        <CordContext.Provider value={{ proxyUrl, publishableKey, token, locale, appearance, onAnalyticsEvent, children }}>
            {children}
        </CordContext.Provider>
    );
}

export function useCordContext() {
    const context = useContext(CordContext);
    if (!context) {
        throw new Error('Cord hooks and components must be used within a <CordProvider>');
    }
    return context;
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

/**
 * Obtiene la lista de productos (catálogo) de la organización.
 * Usa `proxyUrl` o `publishableKey` según la configuración del CordProvider.
 * @returns `products` (arreglo), `isLoading`, `error`, y `refetch` para recargar.
 */
export function useCordCatalog() {
    const context = useCordContext();
    const [products, setProducts] = useState<CordProduct[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const fetchCatalog = useCallback(async () => {
        if (!context.proxyUrl && !context.publishableKey) return;
        setIsLoading(true);
        try {
            let url = '';
            if (context.proxyUrl) {
                const endpoint = context.proxyUrl.replace(/\/$/, '');
                url = endpoint.endsWith('/create') ? endpoint.substring(0, endpoint.length - 7) + '/productos' : `${endpoint}/productos`;
            } else {
                url = 'https://cord.flouvia.com/api/v1/productos';
            }

            const headers: Record<string, string> = {};
            if (context.publishableKey) {
                headers['Authorization'] = `Bearer ${context.publishableKey}`;
            }

            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error('Failed to fetch catalog');
            const data = await res.json();
            setProducts(data.data || data);
        } catch (err: any) {
            setError(err);
        } finally {
            setIsLoading(false);
        }
    }, [context.proxyUrl]);

    useEffect(() => {
        fetchCatalog();
    }, [fetchCatalog]);

    return { products, isLoading, error, refetch: fetchCatalog };
}

/**
 * Obtiene la lista de clientes de la organización.
 * Usa `proxyUrl` o `publishableKey` según la configuración del CordProvider.
 * @returns `clients` (arreglo), `isLoading`, `error`, y `refetch` para recargar.
 */
export function useCordClients() {
    const context = useCordContext();
    const [clients, setClients] = useState<CordClient[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const fetchClients = useCallback(async () => {
        if (!context.proxyUrl && !context.publishableKey) return;
        setIsLoading(true);
        try {
            let url = '';
            if (context.proxyUrl) {
                const endpoint = context.proxyUrl.replace(/\/$/, '');
                url = endpoint.endsWith('/create') ? endpoint.substring(0, endpoint.length - 7) + '/clientes' : `${endpoint}/clientes`;
            } else {
                url = 'https://cord.flouvia.com/api/v1/clientes';
            }

            const headers: Record<string, string> = {};
            if (context.publishableKey) {
                headers['Authorization'] = `Bearer ${context.publishableKey}`;
            }

            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error('Failed to fetch clients');
            const data = await res.json();
            setClients(data.data || data);
        } catch (err: any) {
            setError(err);
        } finally {
            setIsLoading(false);
        }
    }, [context.proxyUrl]);

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
    const [error, setError] = useState<Error | null>(null);

    const createQuote = async (data: any): Promise<CreateQuoteResponse | null> => {
        setIsLoading(true);
        setError(null);
        try {
            const endpoint = context.proxyUrl || 'https://cord.flouvia.com/api/v1/cotizaciones';
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (context.publishableKey) {
                headers['Authorization'] = `Bearer ${context.publishableKey}`;
            }

            const res = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(data),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'No se pudo crear la cotización');
            return d as CreateQuoteResponse;
        } catch (err: any) {
            setError(err);
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    return { createQuote, isLoading, error };
}

// ==== Native Components (Compound Pattern) ====

interface BuilderContextType {
    cliente: string; setCliente: (v: string) => void;
    clienteId: string | undefined; setClienteId: (v: string | undefined) => void;
    email: string; setEmail: (v: string) => void;
    mensaje: string; setMensaje: (v: string) => void;
    notas: string; setNotas: (v: string) => void;
    terminos: Terminos; setTerminos: (v: Terminos) => void;
    vigenciaDias: number; setVigenciaDias: (v: number) => void;
    moneda: string; setMoneda: (v: string) => void;
    ivaIncluido: boolean; setIvaIncluido: (v: boolean) => void;
    
    items: any[]; setItems: (v: any[]) => void;
    products: CordProduct[];
    clients: CordClient[];
    subtotal: number;
    iva: number;
    total: number;
    isLoading: boolean;
    t: typeof en;
    handleSubmit: (e: React.FormEvent) => void;
    updateItem: (idx: number, updates: any) => void;
    removeItem: (idx: number) => void;
    submitError: string | null;
}

const BuilderContext = createContext<BuilderContextType | null>(null);

export function useBuilderContext() {
    const ctx = useContext(BuilderContext);
    if (!ctx) throw new Error('Builder components must be used within a <CordBuilder>');
    return ctx;
}

export interface CordBuilderProps {
    onQuoteCreated?: (quote: CreateQuoteResponse) => void;
    className?: string;
    style?: React.CSSProperties;
    catalog?: CordProduct[];
    clients?: CordClient[];
    children?: ReactNode; // Supports composable UI
    ivaPct?: number; // IVA percentage, defaults to 0.16
}

export function CordBuilder({ onQuoteCreated, className, style, catalog, clients: propClients, children, ivaPct = 0.16 }: CordBuilderProps) {
    const context = useCordContext();
    const t = useCordTranslations();
    const { createQuote, isLoading } = useCreateQuote();
    const { products: fetchedProducts } = useCordCatalog();
    const { clients: fetchedClients } = useCordClients();
    const products = catalog || fetchedProducts || [];
    const clients = propClients || fetchedClients || [];

    const [cliente, setCliente] = useState('');
    const [clienteId, setClienteId] = useState<string | undefined>();
    const [email, setEmail] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [notas, setNotas] = useState('');
    const [terminos, setTerminos] = useState<Terminos>('contado');
    const [vigenciaDias, setVigenciaDias] = useState(15);
    const [moneda, setMoneda] = useState('MXN');
    const [ivaIncluido, setIvaIncluido] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const [items, setItems] = useState([{ descripcion: '', cantidad: 1, precio_unitario: 0 }]);

    const { subtotal, iva, total } = calculateTotals(items as any[], ivaPct, ivaIncluido);

    useEffect(() => {
        context.onAnalyticsEvent?.('QUOTE_BUILDER_MOUNTED', { items: items.length });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        if (items.some(i => !i.descripcion)) {
            setSubmitError(t.errorDesc);
            return;
        }
        
        context.onAnalyticsEvent?.('CHECKOUT_STARTED', { subtotal, itemsCount: items.length, moneda });
        
        const payload: CreateQuoteInput = {
            cliente_id: clienteId,
            notas,
            terminos,
            vigencia_dias: vigenciaDias,
            base_currency: moneda,
            iva_incluido: ivaIncluido,
            items,
        };
        (payload as any).negocio = cliente;
        (payload as any).email = email;
        (payload as any).mensaje = mensaje;

        const res = await createQuote(payload);
        if (res && onQuoteCreated) {
            onQuoteCreated(res);
        } else if (!res) {
            context.onAnalyticsEvent?.('API_ERROR', { action: 'create_quote' });
        }
    };

    const updateItem = (index: number, updates: any) => {
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

    const builderStyles: React.CSSProperties = {
        fontFamily: 'var(--cord-font-family, system-ui, sans-serif)',
        color: 'var(--cord-color-text, #0A2240)',
        backgroundColor: 'var(--cord-color-background, #ffffff)',
        borderRadius: 'var(--cord-border-radius, 16px)',
        padding: '24px',
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 4px 6px rgba(0,0,0,0.04)',
        maxWidth: '100%',
        boxSizing: 'border-box',
        ...style
    };

    const value: BuilderContextType = {
        cliente, setCliente, clienteId, setClienteId, email, setEmail, mensaje, setMensaje,
        notas, setNotas, terminos, setTerminos, vigenciaDias, setVigenciaDias,
        moneda, setMoneda, ivaIncluido, setIvaIncluido,
        items, setItems, products, clients, subtotal, iva, total, isLoading, t,
        handleSubmit, updateItem, removeItem, submitError
    };

    return (
        <BuilderContext.Provider value={value}>
            <div className={`cord-builder ${className || ''}`} style={builderStyles}>
                <form onSubmit={handleSubmit}>
                    {children ? children : (
                        <>
                            <CordBuilder.Header />
                            <CordBuilder.Config />
                            <CordBuilder.Items />
                            <CordBuilder.Notes />
                            <CordBuilder.Summary />
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px' }}>
                                {submitError && (
                                    <div style={{ color: '#dc2626', fontSize: '13px', backgroundColor: '#fef2f2', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(220, 38, 38, 0.2)', fontWeight: 500 }}>
                                        {submitError}
                                    </div>
                                )}
                                <CordBuilder.SubmitButton />
                            </div>
                        </>
                    )}
                </form>
            </div>
        </BuilderContext.Provider>
    );
}

const inputStyles: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: '8px',
    border: '1px solid rgba(0,0,0,0.15)', fontFamily: 'inherit',
    fontSize: '14px', boxSizing: 'border-box', marginTop: '6px',
    backgroundColor: '#ffffff'
};

const labelStyles: React.CSSProperties = {
    display: 'block', fontSize: '13px', fontWeight: 600,
    color: 'inherit', opacity: 0.8
};

CordBuilder.Header = function CordBuilderHeader({ className, style }: { className?: string; style?: React.CSSProperties }) {
    const { cliente, setCliente, setClienteId, email, setEmail, clients, setTerminos, t } = useBuilderContext();
    return (
        <div className={className} style={{ marginBottom: '24px', ...style }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>{t.clientData}</h3>
            <datalist id="cord-clientes-list">
                {clients.map((c, i) => (
                    <option key={i} value={c.empresa} />
                ))}
            </datalist>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div>
                    <label style={labelStyles}>{t.nameCompany}</label>
                    <input required list="cord-clientes-list" style={inputStyles} value={cliente} 
                        onChange={e => {
                            const val = e.target.value;
                            setCliente(val);
                            const matched = clients.find(c => c.empresa === val);
                            if (matched) {
                                setClienteId(matched.id);
                                if (matched.email) setEmail(matched.email);
                                if (matched.terminos) setTerminos(matched.terminos);
                            } else {
                                setClienteId(undefined);
                            }
                        }} 
                        placeholder={t.namePlaceholder} 
                    />
                </div>
                <div>
                    <label style={labelStyles}>{t.emailOptional}</label>
                    <input type="email" style={inputStyles} value={email} onChange={e => setEmail(e.target.value)} placeholder={t.emailPlaceholder} />
                </div>
            </div>
        </div>
    );
};

CordBuilder.Config = function CordBuilderConfig({ className, style }: { className?: string; style?: React.CSSProperties }) {
    const { terminos, setTerminos, vigenciaDias, setVigenciaDias, moneda, setMoneda, t } = useBuilderContext();
    return (
        <div className={className} style={{ marginBottom: '24px', ...style }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>{t.config}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
                <div>
                    <label style={labelStyles}>{t.currency}</label>
                    <select style={inputStyles} value={moneda} onChange={e => setMoneda(e.target.value)}>
                        <option value="MXN">MXN (Pesos)</option>
                        <option value="USD">USD (Dólares)</option>
                    </select>
                </div>
                <div>
                    <label style={labelStyles}>{t.terms}</label>
                    <select style={inputStyles} value={terminos} onChange={e => setTerminos(e.target.value as Terminos)}>
                        <option value="contado">{t.cash}</option>
                        <option value="net30">Net 30</option>
                        <option value="net60">Net 60</option>
                    </select>
                </div>
                <div>
                    <label style={labelStyles}>{t.validityDays}</label>
                    <input required type="number" min="1" style={inputStyles} value={vigenciaDias} onChange={e => setVigenciaDias(Number(e.target.value))} />
                </div>
            </div>
        </div>
    );
};

CordBuilder.Notes = function CordBuilderNotes({ className, style }: { className?: string; style?: React.CSSProperties }) {
    const { notas, setNotas, t } = useBuilderContext();
    return (
        <div className={className} style={{ marginBottom: '24px', ...style }}>
            <label style={labelStyles}>{t.notes}</label>
            <textarea style={{ ...inputStyles, minHeight: '80px', resize: 'vertical' }} value={notas} onChange={e => setNotas(e.target.value)} placeholder={t.notesPlaceholder} />
        </div>
    );
};

CordBuilder.Items = function CordBuilderItems({ className, style }: { className?: string; style?: React.CSSProperties }) {
    const { items, setItems, products, updateItem, removeItem, ivaIncluido, setIvaIncluido, t } = useBuilderContext();
    const ctx = useCordContext();
    return (
        <div className={className} style={{ marginBottom: '24px', ...style }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '18px' }}>{t.items}</h3>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer', opacity: 0.8, userSelect: 'none' }}>
                        <div style={{
                            position: 'relative', width: '36px', height: '20px', 
                            backgroundColor: ivaIncluido ? 'var(--cord-color-primary, #dc2626)' : '#cbd5e1', 
                            borderRadius: '20px', transition: 'background-color 0.2s ease'
                        }}>
                            <div style={{
                                position: 'absolute', top: '2px', left: ivaIncluido ? '18px' : '2px',
                                width: '16px', height: '16px', backgroundColor: 'white',
                                borderRadius: '50%', transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                            }} />
                        </div>
                        <input type="checkbox" checked={ivaIncluido} onChange={e => setIvaIncluido(e.target.checked)} style={{ display: 'none' }} />
                        {t.pricesIncludeIva}
                    </label>
                    <button type="button" onClick={() => {
                        setItems([...items, { descripcion: '', cantidad: 1, precio_unitario: 0 }]);
                        ctx.onAnalyticsEvent?.('ITEM_ADDED', { itemsCount: items.length + 1 });
                    }} 
                        style={{ background: 'transparent', border: 'none', color: 'var(--cord-color-primary, #0A2240)', fontWeight: 600, cursor: 'pointer' }}>
                        {t.addArticle}
                    </button>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {items.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', background: 'rgba(0,0,0,0.02)', padding: '16px', borderRadius: '12px', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 200px', position: 'relative' }}>
                            <label style={labelStyles}>{t.description}</label>
                            <input required 
                                style={{
                                    width: '100%',
                                    border: 'none',
                                    borderBottom: '2px solid rgba(0,0,0,0.1)',
                                    borderRadius: '0',
                                    padding: '8px 4px',
                                    backgroundColor: 'transparent',
                                    boxShadow: 'none',
                                    fontSize: '15px',
                                    fontFamily: 'inherit',
                                    outline: 'none',
                                    transition: 'border-color 0.2s ease',
                                    marginTop: '6px'
                                }}
                                onFocus={(e) => e.target.style.borderBottom = '2px solid var(--cord-color-primary, #0A2240)'}
                                onBlur={(e) => e.target.style.borderBottom = '2px solid rgba(0,0,0,0.1)'}
                                value={item.descripcion} 
                                onChange={(e) => {
                                    const val = e.target.value;
                                    updateItem(idx, { descripcion: val });
                                }} 
                                placeholder={t.searchProduct} 
                            />
                            {item.descripcion && !products.find((p) => (p.nombre_web || p.nombre) === item.descripcion) && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                    marginTop: '4px', background: 'rgba(40,40,40,0.95)', backdropFilter: 'blur(12px)',
                                    borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    maxHeight: '300px', overflowY: 'auto'
                                }}>
                                    {products.filter(p => (p.nombre_web || p.nombre || '').toLowerCase().includes(item.descripcion.toLowerCase())).slice(0, 15).map((p, i) => (
                                        <div key={i}
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                updateItem(idx, {
                                                    descripcion: p.nombre_web || p.nombre,
                                                    precio_unitario: p.precio_final || p.precio || 0
                                                });
                                            }}
                                            style={{
                                                padding: '12px 16px', color: 'white', fontSize: '13px',
                                                cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                transition: 'background-color 0.1s ease'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                <svg style={{ opacity: 0.5, flexShrink: 0 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                <span style={{ fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{p.nombre_web || p.nombre}</span>
                                            </div>
                                            <span style={{ opacity: 0.7, whiteSpace: 'nowrap', marginLeft: '12px' }}>
                                                ${Number(p.precio_final || p.precio || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                                {p.categoria ? ` / ${p.categoria}` : ''}
                                            </span>
                                        </div>
                                    ))}
                                    {products.filter(p => (p.nombre_web || p.nombre || '').toLowerCase().includes(item.descripcion.toLowerCase())).length === 0 && (
                                        <div style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.5)', fontSize: '13px', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ opacity: 0.5 }}>+</span> Agregar línea libre...
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div style={{ width: '80px', flex: '0 0 80px' }}>
                            <label style={labelStyles}>{t.qty}</label>
                            <input required type="number" min="1" style={inputStyles} value={item.cantidad} onChange={e => updateItem(idx, { cantidad: Number(e.target.value) })} />
                        </div>
                        <div style={{ width: '120px', flex: '0 0 120px' }}>
                            <label style={labelStyles}>{t.unitPrice}</label>
                            <input required type="number" min="0" step="0.01" style={inputStyles} value={item.precio_unitario} onChange={e => updateItem(idx, { precio_unitario: Number(e.target.value) })} />
                        </div>
                        <button type="button" disabled={items.length === 1} onClick={() => removeItem(idx)}
                            style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: items.length === 1 ? 'not-allowed' : 'pointer', padding: '10px', opacity: items.length === 1 ? 0.3 : 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.2s ease, opacity 0.2s ease' }}
                            onMouseEnter={(e) => { if (items.length > 1) { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.opacity = '1'; } }}
                            onMouseLeave={(e) => { if (items.length > 1) { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.opacity = '0.8'; } }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

CordBuilder.Summary = function CordBuilderSummary({ className, style }: { className?: string; style?: React.CSSProperties }) {
    const { subtotal, iva, total, moneda, t } = useBuilderContext();
    return (
        <div className={className} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px', ...style }}>
            <div style={{ width: '250px', fontSize: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', opacity: 0.8 }}>
                    <span>{t.subtotal}:</span>
                    <span>${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {moneda}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', opacity: 0.8 }}>
                    <span>{t.iva}:</span>
                    <span>${iva.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {moneda}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.1)', fontWeight: 'bold', fontSize: '16px' }}>
                    <span>{t.total}:</span>
                    <span>${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {moneda}</span>
                </div>
            </div>
        </div>
    );
};

CordBuilder.SubmitButton = function CordBuilderSubmitButton({ className, style, children }: { className?: string; style?: React.CSSProperties, children?: ReactNode }) {
    const { isLoading, t } = useBuilderContext();
    const btnStyles: React.CSSProperties = {
        backgroundColor: 'var(--cord-color-primary, #0A2240)',
        color: '#ffffff', padding: '12px 24px', borderRadius: 'var(--cord-border-radius, 12px)',
        border: 'none', fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer',
        opacity: isLoading ? 0.7 : 1, fontFamily: 'inherit', fontSize: '15px', ...style
    };
    return (
        <button type="submit" disabled={isLoading} className={className} style={className ? undefined : btnStyles}>
            {children ? children : (isLoading ? t.creating : t.generateQuote)}
        </button>
    );
};

// ==== Iframe Viewer (CordCotizador) ====

export interface CordCotizadorProps {
    token?: string; 
    baseUrl?: string;
    minHeight?: number;
    className?: string;
    style?: React.CSSProperties;
    onReady?: () => void;
    onApproved?: (detail: CordEventDetail) => void;
    onRejected?: (detail: CordEventDetail) => void;
    onMessage?: (detail: CordEventDetail) => void;
    onPay?: (detail: CordEventDetail) => void;
    onEvent?: (type: string, detail: CordEventDetail) => void;
}

export function CordCotizador(props: CordCotizadorProps) {
    const context = useContext(CordContext);
    const t = useCordTranslations();
    
    const token = props.token || context?.token;
    const baseUrl = props.baseUrl || (context?.proxyUrl ? undefined : undefined); 
    
    const ref = useRef<HTMLDivElement>(null);
    const cbs = useRef(props);
    cbs.current = props;

    useEffect(() => {
        if (!ref.current || !token) return;
        const opts: CordElementOptions = {
            token,
            baseUrl,
            minHeight: props.minHeight,
            appearance: context?.appearance,
            onReady: () => cbs.current.onReady?.(),
            onApproved: (d) => cbs.current.onApproved?.(d),
            onRejected: (d) => cbs.current.onRejected?.(d),
            onMessage: (d) => cbs.current.onMessage?.(d),
            onPay: (d) => cbs.current.onPay?.(d),
            onEvent: (t, d) => cbs.current.onEvent?.(t, d),
        };
        const controller = mountCotizador(ref.current, opts);
        return () => controller.destroy();
    }, [token, baseUrl, props.minHeight]);

    if (!token) {
        return <div style={{ padding: '20px', color: 'red' }}>{t.errorToken}</div>;
    }

    return <div ref={ref} className={props.className} style={props.style} />;
}

export default CordCotizador;
export type { CordEventDetail } from './types';
