'use client';
// Componentes de React. Todo el estado vive en el núcleo headless; estos
// componentes solo lo dibujan. Next.js App Router necesita 'use client'.
import React, { useRef, useEffect, useMemo, useContext, useState, type ReactNode } from 'react';
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
    useStore,
    appearanceStyle,
    usePrefersDark,
    dictionaries,
} from './context.js';
import { useQuoteBuilder, useBuilderContext, BuilderContext, useFiscalForm, useLinkFiscalForm, formatMoney } from './useQuoteBuilder.js';
import type { UseQuoteBuilderOptions, UseQuoteBuilderResult } from './useQuoteBuilder.js';
import { fiscalText } from './fiscal/messages.js';
import type { FiscalReceptor, FiscalReceptorInput, FiscalField } from './fiscal/receptor.js';
import type { QuoteViewState } from './headless/quote-view.js';
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
    CordUpdatedDetail,
    CordStatusChangedDetail,
} from './types.js';

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
    useFiscalForm,
    useStore,
    formatMoney,
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
    CordUpdatedDetail,
    CordStatusChangedDetail,
} from './types.js';
export type { CordElements, CordElementKey } from './elements.js';
export type { UseQuoteBuilderOptions, UseQuoteBuilderResult, BuilderContextType } from './useQuoteBuilder.js';
export type { QuoteViewState } from './headless/quote-view.js';

type SlotProps = { className?: string; style?: React.CSSProperties };

// ==== Builder (compound) ====

export interface CordBuilderProps extends UseQuoteBuilderOptions {
    className?: string;
    style?: React.CSSProperties;
    /** Muestra la sección de datos fiscales del receptor. */
    fiscal?: boolean;
    /** Muestra la zona para llenar las partidas con IA desde un pedido, foto o PDF. */
    ai?: boolean;
    children?: ReactNode;
}

export function CordBuilder({ onQuoteCreated, className, style, catalog, clients, fiscal, ai, children }: CordBuilderProps) {
    const context = useCordContext();
    const state = useQuoteBuilder({ onQuoteCreated, catalog, clients });
    const dark = usePrefersDark();

    useEffect(() => {
        if (context.appearance?.baseTheme === 'none') return;
        injectBaseStyles();
    }, [context.appearance?.baseTheme]);

    const root = resolveElement('builderRoot', context.appearance?.elements, className, { ...appearanceStyle(context.appearance, dark), ...style });
    const onSubmit = (e: React.FormEvent) => { e.preventDefault(); void state.builder.submit(); };

    return (
        <BuilderContext.Provider value={state}>
            <div className={root.className} style={root.style} aria-busy={state.status === 'loading' || state.status === 'submitting'}>
                <form onSubmit={onSubmit} noValidate>
                    {children ? children : (
                        <>
                            {ai && <CordBuilder.AiDrop />}
                            <CordBuilder.Header />
                            {fiscal && <CordBuilder.Fiscal />}
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

function SubmitRow() {
    const { error, t, issues } = useBuilderContext();
    const { appearance } = useCordContext();
    const row = resolveElement('submitRow', appearance?.elements);
    const err = resolveElement('errorText', appearance?.elements);
    const message = error ? error.message : issues.length ? t.issue[issues[0].code] ?? issues[0].code : null;
    return (
        <div className={row.className} style={row.style}>
            {message && <div className={err.className} style={err.style} role="alert">{message}{error?.requestId ? ` (${error.requestId})` : ''}</div>}
            <CordBuilder.SubmitButton />
        </div>
    );
}

function FieldIssue({ field }: { field: string }) {
    const { issueFor } = useBuilderContext();
    const { appearance } = useCordContext();
    const msg = issueFor(field);
    if (!msg) return null;
    const el = resolveElement('fieldError', appearance?.elements);
    return <div id={`cord-issue-${field}`} className={el.className} style={el.style}>{msg}</div>;
}

CordBuilder.Header = function CordBuilderHeader({ className, style }: SlotProps) {
    const { cliente, builder, clients, t, issueFor } = useBuilderContext();
    const { appearance } = useCordContext();
    const el = appearance?.elements;
    const field = resolveElement('formField', el, className, style);
    const title = resolveElement('sectionTitle', el);
    const grid = resolveElement('formFieldGrid', el);
    const label = resolveElement('formFieldLabel', el);
    const input = resolveElement('formFieldInput', el);
    const listId = 'cord-clientes-list';

    return (
        <div className={field.className} style={field.style}>
            <h3 className={title.className} style={title.style}>{t.clientData}</h3>
            {clients.length > 0 && (
                <datalist id={listId}>
                    {clients.map((c) => <option key={c.id} value={c.empresa} />)}
                </datalist>
            )}
            <div className={grid.className} style={grid.style}>
                <div>
                    <label className={label.className} style={label.style} htmlFor="cord-cliente-empresa">{t.nameCompany}</label>
                    <input
                        id="cord-cliente-empresa"
                        list={clients.length ? listId : undefined}
                        className={input.className}
                        style={input.style}
                        value={cliente.empresa}
                        maxLength={200}
                        autoComplete="organization"
                        aria-invalid={!!issueFor('cliente.empresa')}
                        aria-describedby="cord-issue-cliente.empresa"
                        onChange={(e) => {
                            const value = e.target.value;
                            const match = clients.find((c) => c.empresa === value);
                            builder.setCliente({ empresa: value, ...(match?.email ? { email: match.email } : {}) });
                            if (match?.terminos) builder.setTerminos(match.terminos);
                        }}
                        placeholder={t.namePlaceholder}
                    />
                    <FieldIssue field="cliente.empresa" />
                </div>
                <div>
                    <label className={label.className} style={label.style} htmlFor="cord-cliente-email">{t.emailOptional}</label>
                    <input
                        id="cord-cliente-email"
                        type="email"
                        className={input.className}
                        style={input.style}
                        value={cliente.email}
                        maxLength={254}
                        autoComplete="email"
                        aria-invalid={!!issueFor('cliente.email')}
                        aria-describedby="cord-issue-cliente.email"
                        onChange={(e) => builder.setCliente({ email: e.target.value })}
                        placeholder={t.emailPlaceholder}
                    />
                    <FieldIssue field="cliente.email" />
                </div>
            </div>
        </div>
    );
};

CordBuilder.Fiscal = function CordBuilderFiscal({ className, style, country }: SlotProps & { country?: string }) {
    const { builder, config, t } = useBuilderContext();
    const { appearance, locale = 'es' } = useCordContext();
    return (
        <CordFiscalForm
            country={country ?? config?.fiscal.pais ?? 'MX'}
            title={t.fiscalData}
            className={resolveElement('fiscalSection', appearance?.elements, className).className}
            style={style}
            locale={locale}
            builder={builder}
        />
    );
};

CordBuilder.Config = function CordBuilderConfig({ className, style }: SlotProps) {
    const { terminos, vigencia_dias, moneda, config, builder, t } = useBuilderContext();
    const { appearance } = useCordContext();
    const el = appearance?.elements;
    const field = resolveElement('formField', el, className, style);
    const title = resolveElement('sectionTitle', el);
    const grid = resolveElement('formFieldGrid', el);
    const label = resolveElement('formFieldLabel', el);
    const select = resolveElement('formFieldSelect', el);
    const input = resolveElement('formFieldInput', el);
    const termLabel: Record<string, string> = { contado: t.cash, net30: t.net30, net60: t.net60 };

    return (
        <div className={field.className} style={field.style}>
            <h3 className={title.className} style={title.style}>{t.config}</h3>
            <div className={grid.className} style={grid.style}>
                <div>
                    <label className={label.className} style={label.style} htmlFor="cord-moneda">{t.currency}</label>
                    <select id="cord-moneda" className={select.className} style={select.style} value={moneda} onChange={(e) => builder.setMoneda(e.target.value)} disabled={!config}>
                        {(config?.monedas ?? [moneda]).filter(Boolean).map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <FieldIssue field="moneda" />
                </div>
                <div>
                    <label className={label.className} style={label.style} htmlFor="cord-terminos">{t.terms}</label>
                    <select id="cord-terminos" className={select.className} style={select.style} value={terminos} onChange={(e) => builder.setTerminos(e.target.value as typeof terminos)}>
                        {(config?.terminos ?? ['contado']).map((term) => <option key={term} value={term}>{termLabel[term] ?? term}</option>)}
                    </select>
                </div>
                <div>
                    <label className={label.className} style={label.style} htmlFor="cord-vigencia">{t.validityDays}</label>
                    <input id="cord-vigencia" type="number" inputMode="numeric" min={1} max={365} className={input.className} style={input.style} value={vigencia_dias} onChange={(e) => builder.setVigencia(Number(e.target.value))} />
                    <FieldIssue field="vigencia_dias" />
                </div>
            </div>
        </div>
    );
};

CordBuilder.Notes = function CordBuilderNotes({ className, style }: SlotProps) {
    const { notas, builder, t } = useBuilderContext();
    const { appearance } = useCordContext();
    const el = appearance?.elements;
    const field = resolveElement('formField', el, className, style);
    const label = resolveElement('formFieldLabel', el);
    const textarea = resolveElement('formFieldTextarea', el);
    return (
        <div className={field.className} style={field.style}>
            <label className={label.className} style={label.style} htmlFor="cord-notas">{t.notes}</label>
            <textarea id="cord-notas" maxLength={5000} className={textarea.className} style={textarea.style} value={notas} onChange={(e) => builder.setNotas(e.target.value)} placeholder={t.notesPlaceholder} />
        </div>
    );
};

CordBuilder.Items = function CordBuilderItems({ className, style }: SlotProps) {
    const { items, builder, precios_incluyen_impuesto, config, t, taxLabel, formatMoney: fmt } = useBuilderContext();
    const { appearance } = useCordContext();
    const el = appearance?.elements;
    const r = (key: Parameters<typeof resolveElement>[0], cn?: string, st?: React.CSSProperties) => resolveElement(key, el, cn, st);
    const field = r('formField', className, style);
    const [openKey, setOpenKey] = useState<string | null>(null);
    const taxOptions = config?.impuestos.opciones ?? [];

    return (
        <div className={field.className} style={field.style}>
            <div {...r('itemsHeader')}>
                <h3 {...r('sectionTitle')}>{t.items}</h3>
                <div {...r('itemsHeaderActions')}>
                    <label {...r('ivaToggleLabel')}>
                        <span {...r('ivaToggleTrack')} data-checked={precios_incluyen_impuesto}>
                            <span {...r('ivaToggleThumb')} />
                        </span>
                        <input type="checkbox" checked={precios_incluyen_impuesto} onChange={(e) => builder.setPreciosIncluyenImpuesto(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
                        {t.pricesInclude.replace('{tax}', taxLabel)}
                    </label>
                    <button type="button" {...r('addItemButton')} onClick={() => builder.addItem()}>{t.addArticle}</button>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {items.map((item, idx) => {
                    const matches = openKey === item.key && item.descripcion ? builder.searchProducts(item.descripcion) : [];
                    const showDropdown = openKey === item.key && !!item.descripcion && !item.producto_id;
                    const id = (f: string) => `cord-${item.key}-${f}`;
                    return (
                        <div key={item.key} {...r('itemRow')} data-ai={item.sugerida ? 'true' : undefined}>
                            <div {...r('itemDescriptionField')}>
                                <label {...r('formFieldLabel')} htmlFor={id('desc')}>{t.description}{item.sugerida && <span {...r('aiBadge')}>{t.aiSuggested}</span>}</label>
                                <input
                                    id={id('desc')}
                                    {...r('itemDescriptionInput')}
                                    value={item.descripcion}
                                    maxLength={500}
                                    role="combobox"
                                    aria-expanded={showDropdown}
                                    aria-autocomplete="list"
                                    aria-invalid={!!builder.get().issues.find((i) => i.field === `items.${idx}.descripcion`)}
                                    onFocus={() => setOpenKey(item.key)}
                                    onBlur={() => setTimeout(() => setOpenKey((k) => (k === item.key ? null : k)), 120)}
                                    onChange={(e) => builder.updateItem(item.key, { descripcion: e.target.value, producto_id: null })}
                                    placeholder={t.searchProduct}
                                />
                                {showDropdown && (
                                    <div {...r('productDropdown')} role="listbox">
                                        {matches.map((p) => (
                                            <div
                                                key={p.id}
                                                role="option"
                                                aria-selected={false}
                                                {...r('productDropdownItem')}
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    builder.updateItem(item.key, { producto_id: p.id, descripcion: p.nombre_web || p.nombre, precio_unitario: Number(p.precio_final ?? p.precio ?? 0) });
                                                    setOpenKey(null);
                                                }}
                                            >
                                                <span style={{ fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{p.nombre_web || p.nombre}</span>
                                                <span style={{ opacity: 0.7, whiteSpace: 'nowrap', marginLeft: '12px' }}>{fmt(Number(p.precio_final ?? p.precio ?? 0))}</span>
                                            </div>
                                        ))}
                                        {matches.length === 0 && <div {...r('productDropdownEmpty')}>{t.freeItemAdd}</div>}
                                    </div>
                                )}
                                <FieldIssue field={`items.${idx}.descripcion`} />
                            </div>
                            <div {...r('itemQtyField')}>
                                <label {...r('formFieldLabel')} htmlFor={id('qty')}>{t.qty}</label>
                                <input id={id('qty')} type="number" inputMode="decimal" min={0} step="any" {...r('formFieldInput')} value={item.cantidad} onChange={(e) => builder.updateItem(item.key, { cantidad: Number(e.target.value) })} />
                                <FieldIssue field={`items.${idx}.cantidad`} />
                            </div>
                            <div {...r('itemPriceField')}>
                                <label {...r('formFieldLabel')} htmlFor={id('price')}>{t.unitPrice}</label>
                                <input id={id('price')} type="number" inputMode="decimal" min={0} step="0.01" {...r('formFieldInput')} value={item.precio_unitario} onChange={(e) => builder.updateItem(item.key, { precio_unitario: Number(e.target.value), producto_id: item.producto_id })} />
                                <FieldIssue field={`items.${idx}.precio_unitario`} />
                            </div>
                            <div {...r('itemTaxField')}>
                                <label {...r('formFieldLabel')} htmlFor={id('tax')}>{taxLabel}</label>
                                <select id={id('tax')} {...r('formFieldSelect')} value={String(item.tax_rate)} onChange={(e) => builder.updateItem(item.key, { tax_rate: Number(e.target.value) })} disabled={!config}>
                                    {taxOptions.map((o) => <option key={`${o.id}-${o.rate}`} value={String(o.rate)}>{o.label}</option>)}
                                </select>
                                <FieldIssue field={`items.${idx}.tax_rate`} />
                            </div>
                            <button type="button" aria-label={t.remove} disabled={items.length === 1} {...r('itemRemoveButton')} onClick={() => builder.removeItem(item.key)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                </svg>
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

CordBuilder.Summary = function CordBuilderSummary({ className, style }: SlotProps) {
    const { totals, t, taxLabel, formatMoney: fmt } = useBuilderContext();
    const { appearance } = useCordContext();
    const el = appearance?.elements;
    const r = (key: Parameters<typeof resolveElement>[0], cn?: string, st?: React.CSSProperties) => resolveElement(key, el, cn, st);
    const pct = (rate: number) => `${Math.round(rate * 10000) / 100}%`;

    return (
        <div {...r('summaryRoot', className, style)}>
            <div {...r('summaryInner')} aria-live="polite">
                <div {...r('summaryRow')}><span>{t.subtotal}</span><span>{fmt(totals.subtotal)}</span></div>
                {totals.porTasa.filter((b) => b.tasa > 0).map((b) => (
                    <div key={b.tasa} {...r('summaryTaxRow')}><span>{taxLabel} {pct(b.tasa)}</span><span>{fmt(b.impuesto)}</span></div>
                ))}
                {totals.retenciones.map((ret) => (
                    <div key={ret.nombre} {...r('summaryRetRow')}><span>{ret.nombre}</span><span>−{fmt(ret.monto)}</span></div>
                ))}
                <div {...r('summaryTotalRow')}><span>{t.total}</span><span>{fmt(totals.total)}</span></div>
            </div>
        </div>
    );
};

const ACCEPT = 'image/jpeg,image/png,application/pdf';

CordBuilder.AiDrop = function CordBuilderAiDrop({ className, style }: SlotProps) {
    const { builder, ai, t } = useBuilderContext();
    const { appearance } = useCordContext();
    const el = appearance?.elements;
    const [texto, setTexto] = useState('');
    const [over, setOver] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const ctrl = useRef<AbortController | null>(null);
    useEffect(() => () => ctrl.current?.abort(), []);

    const run = (archivo?: File) => {
        if (!archivo && !texto.trim()) return;
        ctrl.current?.abort();
        ctrl.current = new AbortController();
        void builder.draftWithAi({ texto: texto.trim() || undefined, archivo }, { signal: ctrl.current.signal });
    };
    const root = resolveElement('aiDrop', el, className, style);
    const active = over ? resolveElement('aiDropActive', el) : null;
    const busy = ai.status === 'streaming';

    return (
        <div
            className={[root.className, active?.className].filter(Boolean).join(' ')}
            style={root.style}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) run(file);
            }}
            aria-busy={busy}
        >
            <h3 {...resolveElement('sectionTitle', el)}>{t.aiTitle}</h3>
            <p {...resolveElement('aiStatus', el)}>{t.aiHint}</p>
            <textarea
                {...resolveElement('formFieldTextarea', el)}
                value={texto}
                maxLength={4000}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={t.aiPlaceholder}
                aria-label={t.aiTitle}
            />
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f); e.target.value = ''; }} />
                <button type="button" {...resolveElement('addItemButton', el)} onClick={() => fileRef.current?.click()} disabled={busy}>{t.aiChoose}</button>
                <button type="button" {...resolveElement('submitButton', el)} onClick={() => run()} disabled={busy || !texto.trim()}>{t.aiRun}</button>
            </div>
            <div {...resolveElement('aiStatus', el)} role="status" aria-live="polite">
                {busy && t.aiReading.replace('{n}', String(ai.count))}
                {ai.status === 'done' && t.aiDone.replace('{n}', String(ai.count))}
                {ai.status === 'error' && ai.error && `${ai.error.message}${ai.error.requestId ? ` (${ai.error.requestId})` : ''}`}
            </div>
        </div>
    );
};

CordBuilder.SubmitButton = function CordBuilderSubmitButton({ className, style, children }: SlotProps & { children?: ReactNode }) {
    const { status, t } = useBuilderContext();
    const { appearance } = useCordContext();
    const btn = resolveElement('submitButton', appearance?.elements, className, style);
    const busy = status === 'submitting' || status === 'loading';
    return (
        <button type="submit" disabled={busy} aria-disabled={busy} className={btn.className} style={btn.style}>
            {children ? children : status === 'submitting' ? t.creating : status === 'loading' ? t.loading : t.generateQuote}
        </button>
    );
};

// ==== Fiscal Form ====

export interface CordFiscalFormProps {
    country?: string;
    initial?: FiscalReceptorInput;
    locale?: 'es' | 'en';
    title?: string;
    className?: string;
    style?: React.CSSProperties;
    /** Se llama con el receptor normalizado cada vez que queda válido. */
    onValid?: (value: FiscalReceptor) => void;
    /** Uso interno de <CordBuilder.Fiscal>: el receptor viaja con la cotización. */
    builder?: UseQuoteBuilderResult['builder'];
}

const FISCAL_FIELD_INPUT: Partial<Record<FiscalField, keyof FiscalReceptorInput>> = {
    tax_id: 'tax_id', legal_name: 'legal_name', regimen_fiscal: 'regimen_fiscal', uso_cfdi: 'uso_cfdi', cp_fiscal: 'cp_fiscal',
};

export function CordFiscalForm({ country = 'MX', initial, locale, title, className, style, onValid, builder }: CordFiscalFormProps) {
    const ctx = useContext(CordContext);
    const lang = locale ?? ctx?.locale ?? 'es';
    const t = fiscalText(lang);
    const fiscal = useFiscalForm({ ...initial, country });
    const el = ctx?.appearance?.elements;
    const r = (key: Parameters<typeof resolveElement>[0], cn?: string, st?: React.CSSProperties) => resolveElement(key, el, cn, st);
    const noopBuilder = useMemo(() => ({ setFiscal: () => undefined }), []);
    useLinkFiscalForm((builder ?? noopBuilder) as any, fiscal.form);
    const lastValid = useRef<string>('');
    useEffect(() => {
        if (!fiscal.validation.ok || !onValid) return;
        const key = JSON.stringify(fiscal.validation.value);
        if (key === lastValid.current) return;
        lastValid.current = key;
        onValid(fiscal.validation.value);
    }, [fiscal.validation, onValid]);

    return (
        <div {...r('formField', className, style)}>
            {title && <h3 {...r('sectionTitle')}>{title}</h3>}
            <div {...r('formFieldGrid')}>
                {fiscal.fields.map((field) => {
                    const key = FISCAL_FIELD_INPUT[field];
                    if (!key) return null;
                    const id = `cord-fiscal-${field}`;
                    const error = fiscal.visibleErrors.find((e) => e.field === field);
                    const warning = fiscal.validation.warnings.find((w) => w.field === field);
                    const common = {
                        id,
                        name: field,
                        value: fiscal.values[key],
                        'aria-invalid': !!error,
                        'aria-describedby': `${id}-msg`,
                        onBlur: () => fiscal.form.touch(field),
                    };
                    const options = field === 'regimen_fiscal' ? fiscal.regimenes : field === 'uso_cfdi' ? fiscal.usosCfdi : null;
                    return (
                        <div key={field}>
                            <label {...r('formFieldLabel')} htmlFor={id}>{t.label(field, fiscal.values.country)}</label>
                            {options ? (
                                <select {...common} {...r('formFieldSelect')} onChange={(e) => fiscal.form.set(key, e.target.value)}>
                                    <option value="">{t.choose}</option>
                                    {options.map((o) => <option key={o.codigo} value={o.codigo}>{o.nombre}</option>)}
                                </select>
                            ) : (
                                <input
                                    {...common}
                                    {...r('formFieldInput')}
                                    maxLength={field === 'legal_name' ? 300 : 20}
                                    inputMode={field === 'cp_fiscal' ? 'numeric' : undefined}
                                    autoComplete={field === 'cp_fiscal' ? 'postal-code' : field === 'legal_name' ? 'organization' : 'off'}
                                    spellCheck={false}
                                    onChange={(e) => fiscal.form.set(key, e.target.value)}
                                />
                            )}
                            <div id={`${id}-msg`} aria-live="polite">
                                {error && <div {...r('fieldError')}>{t.issue(error.code)}</div>}
                                {!error && warning && <div {...r('fieldWarning')}>{t.issue(warning.code)}</div>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

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
    onUpdated?: (detail: CordUpdatedDetail) => void;
    onStatusChanged?: (detail: CordStatusChangedDetail) => void;
    /** Estado en vivo de la cotización (estado, total, aprobada, pagada). */
    onStateChange?: (state: QuoteViewState) => void;
    /** Catch-all tipado: habilita un `switch` exhaustivo sobre `event.type`. */
    onEvent?: (event: CordEvent) => void;
}

// Funciona SIN <CordProvider>: lee el contexto con useContext crudo.
export function CordCotizador(props: CordCotizadorProps) {
    const context = useContext(CordContext);
    const t = dictionaries[context?.locale || 'es'];
    const token = props.token || context?.token;
    const explicitBase = props.baseUrl ?? context?.baseUrl;
    const appearance = props.appearance ?? context?.appearance ?? getCordConfig().appearance;
    const appearanceKey = useMemo(() => JSON.stringify(appearance ?? null), [appearance]);

    const ref = useRef<HTMLDivElement>(null);
    const cbs = useRef(props);
    cbs.current = props;

    useEffect(() => {
        if (!ref.current || !token) return;
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
            onUpdated: (d) => cbs.current.onUpdated?.(d),
            onStatusChanged: (d) => cbs.current.onStatusChanged?.(d),
            onEvent: (event) => cbs.current.onEvent?.(event),
        };
        const controller = mountCotizador(ref.current, opts);
        const unsubscribe = controller.state.subscribe((s) => cbs.current.onStateChange?.(s));
        return () => { unsubscribe(); controller.destroy(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- appearanceKey serializa `appearance` a propósito
    }, [token, explicitBase, props.minHeight, appearanceKey]);

    if (!token) return <div role="alert">{t.errorToken}</div>;
    return <div ref={ref} className={props.className} style={props.style} />;
}

export default CordCotizador;
