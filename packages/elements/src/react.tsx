'use client';
// Todo este módulo es hooks + DOM del navegador — sin esta directiva, Next.js
// App Router (Server Components por default) rompe con "You're importing a
// component that needs useState/useEffect..." en cuanto alguien importa
// CordProvider/CordBuilder/CordCotizador desde un Server Component.
import React, { useRef, useEffect, useMemo, useContext, ReactNode } from 'react';
import { mountCotizador } from './core.js';
import { getCordConfig } from './config.js';
import { injectBaseStyles } from './styles.js';
import { resolveElement } from './elements.js';
import {
    CordContext,
    CordProvider,
    useCordContext,
    useCordTranslations,
    useCord,
    useCordCatalog,
    useCordClients,
    useCreateQuote,
    dictionaries,
} from './context.js';
import { useQuoteBuilder, useBuilderContext, BuilderContext } from './useQuoteBuilder.js';
import type { QuoteBuilderItem, UseQuoteBuilderOptions } from './useQuoteBuilder.js';
import type {
    CordAppearance,
    CordElementOptions,
    CordEvent,
    CordViewedDetail,
    CordApprovedDetail,
    CordSignedDetail,
    CordRejectedDetail,
    CordMessageDetail,
    CordItemCommentDetail,
    CordPayDetail,
    Terminos,
} from './types.js';

// Re-exports — mismo API pública que antes de extraer context.ts/useQuoteBuilder.ts.
export {
    CordProvider,
    useCordContext,
    useCordTranslations,
    useCord,
    useCordCatalog,
    useCordClients,
    useCreateQuote,
    useQuoteBuilder,
    useBuilderContext,
};
export { configureCord, getCordConfig } from './config.js';
export type { CordGlobalConfig } from './config.js';
export { CordError } from './api.js';
export type { CordErrorCode } from './api.js';
export type {
    CordAppearance,
    CordEventDetail,
    CordEvent,
    CordReadyDetail,
    CordViewedDetail,
    CordApprovedDetail,
    CordSignedDetail,
    CordRejectedDetail,
    CordMessageDetail,
    CordItemCommentDetail,
    CordPayDetail,
} from './types.js';
export type { CordElements, CordElementKey } from './elements.js';
export type { BuilderContextType, UseQuoteBuilderOptions, QuoteBuilderItem } from './useQuoteBuilder.js';

// ==== Native Components (Compound Pattern) ====

export interface CordBuilderProps extends UseQuoteBuilderOptions {
    className?: string;
    style?: React.CSSProperties;
    children?: ReactNode; // Supports composable UI
}

export function CordBuilder({ onQuoteCreated, className, style, catalog, clients, children, ivaPct }: CordBuilderProps) {
    const context = useCordContext();
    const state = useQuoteBuilder({ onQuoteCreated, catalog, clients, ivaPct });

    useEffect(() => {
        if (context.appearance?.baseTheme === 'none') return; // headless real: sin CSS de Cord
        injectBaseStyles();
    }, [context.appearance?.baseTheme]);

    const root = resolveElement('builderRoot', context.appearance?.elements, className, style);

    return (
        <BuilderContext.Provider value={state}>
            <div className={root.className} style={root.style}>
                <form onSubmit={state.handleSubmit}>
                    {children ? children : (
                        <>
                            <CordBuilder.Header />
                            <CordBuilder.Config />
                            <CordBuilder.Items />
                            <CordBuilder.Notes />
                            <CordBuilder.Summary />
                            <SubmitRow />
                        </>
                    )}
                </form>
            </div>
        </BuilderContext.Provider>
    );
}

/** Fila de envío default (error + botón) — usada cuando <CordBuilder> no recibe children. */
function SubmitRow() {
    const { submitError } = useBuilderContext();
    const { appearance } = useCordContext();
    const row = resolveElement('submitRow', appearance?.elements);
    const err = resolveElement('errorText', appearance?.elements);
    return (
        <div className={row.className} style={row.style}>
            {submitError && (
                <div className={err.className} style={err.style}>
                    {submitError}
                </div>
            )}
            <CordBuilder.SubmitButton />
        </div>
    );
}

CordBuilder.Header = function CordBuilderHeader({ className, style }: { className?: string; style?: React.CSSProperties }) {
    const { cliente, setCliente, setClienteId, email, setEmail, clients, setTerminos, t } = useBuilderContext();
    const { appearance } = useCordContext();
    const el = appearance?.elements;
    const field = resolveElement('formField', el, className, style);
    const title = resolveElement('sectionTitle', el);
    const grid = resolveElement('formFieldGrid', el);
    const label = resolveElement('formFieldLabel', el);
    const input = resolveElement('formFieldInput', el);

    return (
        <div className={field.className} style={field.style}>
            <h3 className={title.className} style={title.style}>{t.clientData}</h3>
            <datalist id="cord-clientes-list">
                {clients.map((c, i) => (
                    <option key={i} value={c.empresa} />
                ))}
            </datalist>
            <div className={grid.className} style={grid.style}>
                <div>
                    <label className={label.className} style={label.style}>{t.nameCompany}</label>
                    <input
                        required
                        list="cord-clientes-list"
                        className={input.className}
                        style={input.style}
                        value={cliente}
                        onChange={(e) => {
                            const val = e.target.value;
                            setCliente(val);
                            const matched = clients.find((c) => c.empresa === val);
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
                    <label className={label.className} style={label.style}>{t.emailOptional}</label>
                    <input
                        type="email"
                        className={input.className}
                        style={input.style}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t.emailPlaceholder}
                    />
                </div>
            </div>
        </div>
    );
};

CordBuilder.Config = function CordBuilderConfig({ className, style }: { className?: string; style?: React.CSSProperties }) {
    const { terminos, setTerminos, vigenciaDias, setVigenciaDias, moneda, setMoneda, t } = useBuilderContext();
    const { appearance } = useCordContext();
    const el = appearance?.elements;
    const field = resolveElement('formField', el, className, style);
    const title = resolveElement('sectionTitle', el);
    const grid = resolveElement('formFieldGrid', el);
    const label = resolveElement('formFieldLabel', el);
    const select = resolveElement('formFieldSelect', el);
    const input = resolveElement('formFieldInput', el);

    return (
        <div className={field.className} style={field.style}>
            <h3 className={title.className} style={title.style}>{t.config}</h3>
            <div className={grid.className} style={grid.style}>
                <div>
                    <label className={label.className} style={label.style}>{t.currency}</label>
                    <select className={select.className} style={select.style} value={moneda} onChange={(e) => setMoneda(e.target.value)}>
                        <option value="MXN">MXN (Pesos)</option>
                        <option value="USD">USD (Dólares)</option>
                    </select>
                </div>
                <div>
                    <label className={label.className} style={label.style}>{t.terms}</label>
                    <select className={select.className} style={select.style} value={terminos} onChange={(e) => setTerminos(e.target.value as Terminos)}>
                        <option value="contado">{t.cash}</option>
                        <option value="net30">Net 30</option>
                        <option value="net60">Net 60</option>
                    </select>
                </div>
                <div>
                    <label className={label.className} style={label.style}>{t.validityDays}</label>
                    <input required type="number" min="1" className={input.className} style={input.style} value={vigenciaDias} onChange={(e) => setVigenciaDias(Number(e.target.value))} />
                </div>
            </div>
        </div>
    );
};

CordBuilder.Notes = function CordBuilderNotes({ className, style }: { className?: string; style?: React.CSSProperties }) {
    const { notas, setNotas, t } = useBuilderContext();
    const { appearance } = useCordContext();
    const el = appearance?.elements;
    const field = resolveElement('formField', el, className, style);
    const label = resolveElement('formFieldLabel', el);
    const textarea = resolveElement('formFieldTextarea', el);

    return (
        <div className={field.className} style={field.style}>
            <label className={label.className} style={label.style}>{t.notes}</label>
            <textarea className={textarea.className} style={textarea.style} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder={t.notesPlaceholder} />
        </div>
    );
};

CordBuilder.Items = function CordBuilderItems({ className, style }: { className?: string; style?: React.CSSProperties }) {
    const { items, setItems, products, updateItem, removeItem, ivaIncluido, setIvaIncluido, t } = useBuilderContext();
    const ctx = useCordContext();
    const el = ctx.appearance?.elements;
    const field = resolveElement('formField', el, className, style);
    const title = resolveElement('sectionTitle', el);
    const header = resolveElement('itemsHeader', el);
    const headerActions = resolveElement('itemsHeaderActions', el);
    const toggleLabel = resolveElement('ivaToggleLabel', el);
    const toggleTrack = resolveElement('ivaToggleTrack', el);
    const toggleThumb = resolveElement('ivaToggleThumb', el);
    const addBtn = resolveElement('addItemButton', el);
    const row = resolveElement('itemRow', el);
    const descField = resolveElement('itemDescriptionField', el);
    const label = resolveElement('formFieldLabel', el);
    const descInput = resolveElement('itemDescriptionInput', el);
    const dropdown = resolveElement('productDropdown', el);
    const dropdownItem = resolveElement('productDropdownItem', el);
    const dropdownEmpty = resolveElement('productDropdownEmpty', el);
    const qtyField = resolveElement('itemQtyField', el);
    const input = resolveElement('formFieldInput', el);
    const priceField = resolveElement('itemPriceField', el);
    const removeBtn = resolveElement('itemRemoveButton', el);

    return (
        <div className={field.className} style={field.style}>
            <div className={header.className} style={header.style}>
                <h3 className={title.className} style={title.style}>{t.items}</h3>
                <div className={headerActions.className} style={headerActions.style}>
                    <label className={toggleLabel.className} style={toggleLabel.style}>
                        <span className={toggleTrack.className} style={toggleTrack.style} data-checked={ivaIncluido}>
                            <span className={toggleThumb.className} style={toggleThumb.style} />
                        </span>
                        <input type="checkbox" checked={ivaIncluido} onChange={(e) => setIvaIncluido(e.target.checked)} style={{ display: 'none' }} />
                        {t.pricesIncludeIva}
                    </label>
                    <button
                        type="button"
                        className={addBtn.className}
                        style={addBtn.style}
                        onClick={() => {
                            setItems([...items, { descripcion: '', cantidad: 1, precio_unitario: 0 }]);
                            ctx.onAnalyticsEvent?.('ITEM_ADDED', { itemsCount: items.length + 1 });
                        }}
                    >
                        {t.addArticle}
                    </button>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {items.map((item: QuoteBuilderItem, idx: number) => {
                    const matchQuery = item.descripcion.toLowerCase();
                    const matches = products.filter((p) => (p.nombre_web || p.nombre || '').toLowerCase().includes(matchQuery));
                    const exactMatch = products.find((p) => (p.nombre_web || p.nombre) === item.descripcion);
                    const showDropdown = !!item.descripcion && !exactMatch;
                    return (
                        <div key={idx} className={row.className} style={row.style}>
                            <div className={descField.className} style={descField.style}>
                                <label className={label.className} style={label.style}>{t.description}</label>
                                <input
                                    required
                                    className={descInput.className}
                                    style={descInput.style}
                                    value={item.descripcion}
                                    onChange={(e) => updateItem(idx, { descripcion: e.target.value })}
                                    placeholder={t.searchProduct}
                                />
                                {showDropdown && (
                                    <div className={dropdown.className} style={dropdown.style}>
                                        {matches.slice(0, 15).map((p, i) => (
                                            <div
                                                key={i}
                                                className={dropdownItem.className}
                                                style={dropdownItem.style}
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    updateItem(idx, {
                                                        descripcion: p.nombre_web || p.nombre,
                                                        precio_unitario: p.precio_final || p.precio || 0,
                                                    });
                                                }}
                                            >
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                    <svg style={{ opacity: 0.5, flexShrink: 0 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                    <span style={{ fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{p.nombre_web || p.nombre}</span>
                                                </span>
                                                <span style={{ opacity: 0.7, whiteSpace: 'nowrap', marginLeft: '12px' }}>
                                                    ${Number(p.precio_final || p.precio || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        ))}
                                        {matches.length === 0 && (
                                            <div className={dropdownEmpty.className} style={dropdownEmpty.style}>
                                                <span style={{ opacity: 0.5 }}>+</span> {t.freeItemAdd}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className={qtyField.className} style={qtyField.style}>
                                <label className={label.className} style={label.style}>{t.qty}</label>
                                <input required type="number" min="1" className={input.className} style={input.style} value={item.cantidad} onChange={(e) => updateItem(idx, { cantidad: Number(e.target.value) })} />
                            </div>
                            <div className={priceField.className} style={priceField.style}>
                                <label className={label.className} style={label.style}>{t.unitPrice}</label>
                                <input required type="number" min="0" step="0.01" className={input.className} style={input.style} value={item.precio_unitario} onChange={(e) => updateItem(idx, { precio_unitario: Number(e.target.value) })} />
                            </div>
                            <button type="button" disabled={items.length === 1} className={removeBtn.className} style={removeBtn.style} onClick={() => removeItem(idx)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

CordBuilder.Summary = function CordBuilderSummary({ className, style }: { className?: string; style?: React.CSSProperties }) {
    const { subtotal, iva, total, moneda, t } = useBuilderContext();
    const { appearance } = useCordContext();
    const el = appearance?.elements;
    const root = resolveElement('summaryRoot', el, className, style);
    const inner = resolveElement('summaryInner', el);
    const row = resolveElement('summaryRow', el);
    const totalRow = resolveElement('summaryTotalRow', el);
    const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${moneda}`;

    return (
        <div className={root.className} style={root.style}>
            <div className={inner.className} style={inner.style}>
                <div className={row.className} style={row.style}>
                    <span>{t.subtotal}:</span>
                    <span>{fmt(subtotal)}</span>
                </div>
                <div className={row.className} style={row.style}>
                    <span>{t.iva}:</span>
                    <span>{fmt(iva)}</span>
                </div>
                <div className={totalRow.className} style={totalRow.style}>
                    <span>{t.total}:</span>
                    <span>{fmt(total)}</span>
                </div>
            </div>
        </div>
    );
};

CordBuilder.SubmitButton = function CordBuilderSubmitButton({ className, style, children }: { className?: string; style?: React.CSSProperties; children?: ReactNode }) {
    const { isLoading, t } = useBuilderContext();
    const { appearance } = useCordContext();
    const btn = resolveElement('submitButton', appearance?.elements, className, style);
    return (
        <button type="submit" disabled={isLoading} className={btn.className} style={btn.style}>
            {children ? children : (isLoading ? t.creating : t.generateQuote)}
        </button>
    );
};

// ==== Iframe Viewer (CordCotizador) ====

export interface CordCotizadorProps {
    token?: string;
    baseUrl?: string;
    /** Appearance de ESTA instancia. Si no se pasa, hereda del <CordProvider> y luego de configureCord(). */
    appearance?: CordAppearance;
    minHeight?: number;
    className?: string;
    style?: React.CSSProperties;
    onReady?: () => void;
    onViewed?: (detail: CordViewedDetail) => void;
    onApproved?: (detail: CordApprovedDetail) => void;
    onSigned?: (detail: CordSignedDetail) => void;
    onRejected?: (detail: CordRejectedDetail) => void;
    onMessage?: (detail: CordMessageDetail) => void;
    onItemComment?: (detail: CordItemCommentDetail) => void;
    onPay?: (detail: CordPayDetail) => void;
    /** Catch-all tipado: habilita un `switch` exhaustivo sobre `event.type`. */
    onEvent?: (event: CordEvent) => void;
}

// CordCotizador debe funcionar SIN <CordProvider> en el árbol (uso suelto,
// ej. dentro de un panel admin que solo necesita el iframe). Por eso lee el
// contexto con `useContext` crudo (nunca `useCordContext()`, que LANZA sin
// Provider) y resuelve sus propias traducciones sin depender de él.
export function CordCotizador(props: CordCotizadorProps) {
    const context = useContext(CordContext);
    const t = dictionaries[context?.locale || 'es'];

    const token = props.token || context?.token;
    // Precedencia: prop de ESTA instancia > <CordProvider> > configureCord() > default.
    const explicitBase = props.baseUrl ?? context?.baseUrl;
    const appearance = props.appearance ?? context?.appearance ?? getCordConfig().appearance;
    const appearanceKey = useMemo(() => JSON.stringify(appearance ?? null), [appearance]);

    const ref = useRef<HTMLDivElement>(null);
    const cbs = useRef(props);
    cbs.current = props;

    useEffect(() => {
        if (!ref.current || !token) return;
        const isDev = typeof process === 'undefined' || process.env?.NODE_ENV !== 'production';
        if (isDev && !appearance) {
            console.warn(
                '[Cord] <CordCotizador> se montó sin `appearance` (ni por prop, ni por <CordProvider>, ni por ' +
                'configureCord()) — el cotizador saldrá con la marca genérica de Cord. Pasa `appearance` a este ' +
                'componente o envuelve tu app en `<CordProvider appearance={{...}}>`.'
            );
        }
        const opts: CordElementOptions = {
            token,
            baseUrl: explicitBase,
            minHeight: props.minHeight,
            appearance,
            onReady: () => cbs.current.onReady?.(),
            onViewed: (d) => cbs.current.onViewed?.(d),
            onApproved: (d) => cbs.current.onApproved?.(d),
            onSigned: (d) => cbs.current.onSigned?.(d),
            onRejected: (d) => cbs.current.onRejected?.(d),
            onMessage: (d) => cbs.current.onMessage?.(d),
            onItemComment: (d) => cbs.current.onItemComment?.(d),
            onPay: (d) => cbs.current.onPay?.(d),
            onEvent: (event) => cbs.current.onEvent?.(event),
        };
        const controller = mountCotizador(ref.current, opts);
        return () => controller.destroy();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- appearanceKey serializa `appearance` a propósito
    }, [token, explicitBase, props.minHeight, appearanceKey]);

    if (!token) {
        return <div style={{ padding: '20px', color: 'red' }}>{t.errorToken}</div>;
    }

    return <div ref={ref} className={props.className} style={props.style} />;
}

export default CordCotizador;
