// Editor de documentos en el navegador: cotización nueva, borrador, versión
// nueva de una cotización enviada, factura nueva y borrador de factura.
//
// Reemplaza tres scripts que hacían lo mismo con bugs distintos (ver
// core.ts). La aritmética y las reglas de precio viven en core.ts, sin DOM; aquí
// solo se pinta, se escucha y se guarda. El markup lo dibuja
// src/components/app/DocumentEditor.astro y llega con el `boot` en JSON.

import {
    firstInvalidLine, freeLine, lineAmount, lineFromProduct, linesFromKit, margenPct,
    normalizeTiers, parseAmount, payloadItems, repriceForClient, setPrice, setQuantity, summarize,
    unitPrice, volumePrice, newKey,
    type CatalogProduct, type KitDef, type Line, type PricingContext,
} from './core';
import { createMoney, decimalsFor } from '../money-client';
import { iconSvg } from '../icons';
import type { DocumentEditorText } from '../../i18n/app';

export type EditorKind = 'quote' | 'invoice';
export type EditorMode = 'new' | 'draft' | 'version';

export interface BootLine {
    productoId: string | null;
    nombre: string;
    unidad?: string | null;
    cantidad: number;
    lista: number;
    negociado: number | null;
    taxRate: number | null;
}

export interface EditorBoot {
    kind: EditorKind;
    mode: EditorMode;
    T: DocumentEditorText;
    orgCurrency: string;
    orgCountry: string;
    catalogo: CatalogProduct[];
    kits: KitDef[];
    taxOptions: { rate: number; label: string }[];
    defaultTaxRate: number;
    retenciones: { nombre: string; tasa: number; tipo?: string; base?: 'subtotal' | 'impuesto' }[];
    taxLabel: string;
    multiTax: boolean;
    aprobMargenMin: number;
    doc: {
        id: string | null;
        folio: string | null;
        version: number | null;
        clienteId: string | null;
        lines: BootLine[];
        /** Factura: borrador con folio ya reservado tras un rechazo cierto. */
        reservedFolio?: string | null;
    };
}

const tpl = (s: string, vars: Record<string, string | number>) =>
    Object.keys(vars).reduce((r, k) => r.split(`{${k}}`).join(String(vars[k])), s);
const escapeHtml = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const norm = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Una respuesta que no es JSON (413, 502 de la plataforma) no puede terminar
// en un "Unexpected token" en pantalla.
const readJson = async (res: Response): Promise<any> => { try { return await res.json(); } catch { return {}; } };
const toast = (msg: string, type: 'ok' | 'error' | 'info' = 'info', ms?: number) => (window as any).cordToast?.(msg, type, ms);
const isMobile = () => window.matchMedia('(max-width: 880px)').matches;

export function mountDocumentEditor(root: HTMLElement, boot: EditorBoot) {
    const { T, kind, mode } = boot;
    const isQuote = kind === 'quote';
    const isVersion = mode === 'version';
    const q = <E extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as E | null;
    const $ = <E extends Element = HTMLElement>(id: string) => document.getElementById(id) as E | null;

    const catalogMap = new Map(boot.catalogo.map((p) => [p.id, p]));
    const kitMap = new Map(boot.kits.map((k) => [k.id, k]));

    // ── Divisa y formato ────────────────────────────────────────────────────
    const $currency = $<HTMLSelectElement>('deCurrency');
    let currency = ($currency?.value || boot.orgCurrency).toUpperCase();
    let fmt = createMoney({ currency, locale: T.intl });
    const decimals = () => decimalsFor(currency);

    // ── Cliente y precio automático ─────────────────────────────────────────
    const $client = $<HTMLSelectElement>('deClient');
    let lastClient = $client?.value || '';
    const clientOption = () => {
        const o = $client?.selectedOptions[0];
        return o && o.value && o.value !== '__NEW__' ? o : null;
    };
    const clientDiscount = () => Number(clientOption()?.dataset.desc || 0) || 0;
    let b2bList: { moneda: string; precios: Record<string, number> } | null = null;
    const ctx = (): PricingContext => ({
        discountPct: clientDiscount(),
        decimals: decimals(),
        b2b: (id) => (b2bList && b2bList.moneda === currency && typeof b2bList.precios[id] === 'number' ? b2bList.precios[id] : null),
    });

    // ── Estado ──────────────────────────────────────────────────────────────
    const fromBoot = (b: BootLine): Line => {
        const p = b.productoId ? catalogMap.get(b.productoId) : undefined;
        const taxRate = b.taxRate ?? boot.defaultTaxRate;
        if (!p) {
            const l = freeLine(taxRate, { nombre: b.nombre, cantidad: b.cantidad, unidad: b.unidad || 'pieza', precio: b.negociado ?? b.lista });
            l.precioPendiente = false;
            return l;
        }
        // La lista GUARDADA manda al reabrir: repreciar con el catálogo de hoy
        // cambiaba en silencio un borrador viejo. El volumen se recalcula solo
        // si cambia la cantidad.
        const vol = normalizeTiers(p.preciosVolumen);
        return {
            key: newKey(), productoId: p.id, nombre: b.nombre || p.nombre, unidad: b.unidad || p.unidad || 'pieza',
            baseLista: Number(p.precio) || b.lista, lista: b.lista, vol, costo: Number(p.costo) || 0,
            negociado: b.negociado, negoTouched: b.negociado !== null, cantidad: b.cantidad, taxRate,
            existencias: p.existencias ?? null,
        };
    };
    const lines: Line[] = boot.doc.lines.map(fromBoot);
    let dirty = false;
    const markDirty = () => { dirty = true; };

    // ── Render de líneas ────────────────────────────────────────────────────
    const $lines = $('deLines')!;
    const $empty = $('deLinesEmpty');
    const $head = $('deLinesHead');

    const taxSelect = (l: Line) => {
        if (!boot.multiTax) return '';
        const opts = boot.taxOptions.map((o) =>
            `<option value="${o.rate}"${Math.abs(o.rate - l.taxRate) < 1e-9 ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
        return `<select class="lr-tax${l.taxRate === 0 ? ' is-exento' : ''}" data-f="tax" aria-label="${escapeHtml(T.taxAria)}">${opts}</select>`;
    };

    const stockNote = (l: Line) => {
        if (!l.productoId || l.existencias === null || l.existencias === undefined) return '';
        if (l.existencias <= 0) return ` · <b class="lr-stock is-out">${escapeHtml(T.outOfStock)}</b>`;
        if (l.cantidad > l.existencias) return ` · <b class="lr-stock is-low">${escapeHtml(tpl(T.onlyStockTpl, { n: l.existencias }))}</b>`;
        return ` · <span class="lr-stock">${escapeHtml(tpl(T.inStockTpl, { n: l.existencias }))}</span>`;
    };

    const pricingNote = (l: Line) => {
        const p = l.pricing;
        if (!isQuote || !p || p.suggestedPrice === null || p.suggestedPrice === undefined) return '';
        if (Math.abs(unitPrice(l) - p.suggestedPrice) < 0.01) return '';
        const band = p.bands?.find((b) => b.band === p.suggestedDiscountPct);
        const label = band
            ? tpl(T.suggestedWinTpl, { precio: fmt(p.suggestedPrice), pct: Math.round(band.winRate * 100) })
            : tpl(T.suggestedTpl, { precio: fmt(p.suggestedPrice) });
        return ` · <button type="button" class="lr-pricing-hint" data-act="suggested" title="${escapeHtml(T.suggestedTitle)}">${escapeHtml(label)}</button>`;
    };

    const nameNote = (l: Line) => {
        const vm = l.productoId ? volumePrice(l.baseLista, l.vol, l.cantidad).min : 0;
        let html = escapeHtml(l.unidad);
        if (vm) html += ` · <b class="lr-volnote">${escapeHtml(tpl(T.volNoteTpl, { min: vm }))}</b>`;
        if (l.b2b && !l.negoTouched) html += ` · <b class="lr-b2b">${escapeHtml(T.b2bPrice)}</b>`;
        return html + stockNote(l) + pricingNote(l);
    };

    const marginCell = (l: Line) => {
        if (!isQuote) return '';
        const m = margenPct(l);
        if (m === null) return '<span class="lr-margen lr-margen-na">—</span>';
        const low = boot.aprobMargenMin > 0 && m < boot.aprobMargenMin;
        return `<span class="lr-margen${low ? ' lr-margen-low' : ''}" title="${escapeHtml(T.marginTitle)}">${Math.round(m)}%</span>`;
    };

    const numText = (n: number | null, d = 6) => (n === null || !Number.isFinite(n) ? '' : String(Math.round(n * 10 ** d) / 10 ** d));

    const rowHtml = (l: Line) => {
        const name = l.productoId
            ? `<span class="lr-name"><span class="lr-name-text">${escapeHtml(l.nombre)}</span><small>${nameNote(l)}</small></span>`
            : `<input type="text" class="lr-input lr-desc-input" data-f="desc" value="${escapeHtml(l.nombre)}" placeholder="${escapeHtml(T.descPlaceholder)}" maxlength="500" />`;
        const price = l.productoId ? unitPrice(l) : (l.precioPendiente ? null : l.lista);
        const deal = l.productoId && l.negociado !== null && l.negociado < l.lista;
        return `
            ${name}
            <input type="text" inputmode="decimal" class="lr-input lr-qty" data-f="qty" value="${numText(l.cantidad, 3)}" aria-label="${escapeHtml(T.qtyAria)}" />
            <span class="lr-lista${deal ? ' is-struck' : ''}">${l.productoId ? fmt(l.lista) : ''}</span>
            <input type="text" inputmode="decimal" class="lr-input lr-nego${deal ? ' is-deal' : ''}" data-f="price" value="${numText(price)}" aria-label="${escapeHtml(T.priceAria)}" />
            ${taxSelect(l)}
            <span class="editorial lr-importe">${fmt(lineAmount(l))}</span>
            ${marginCell(l)}
            <button type="button" class="lr-del" data-act="remove" aria-label="${escapeHtml(T.removeLine)}">${iconSvg('x', '', 1.5, 14)}</button>`;
    };

    const rowOf = (key: string) => $lines.querySelector<HTMLElement>(`[data-key="${key}"]`);
    const lineOf = (el: Element | null) => {
        const key = (el?.closest('[data-key]') as HTMLElement | null)?.dataset.key;
        return key ? lines.find((l) => l.key === key) ?? null : null;
    };

    function render(flashKeys: string[] = []) {
        if ($empty) $empty.hidden = lines.length > 0;
        if ($head) $head.hidden = lines.length === 0;
        $lines.innerHTML = lines.map((l) =>
            `<div class="line-row${flashKeys.includes(l.key) ? ' line-added' : ''}" data-key="${l.key}" role="group">${rowHtml(l)}</div>`).join('');
        recalc();
    }

    /** Actualiza una fila sin re-renderizar (no pierde el foco del input activo). */
    function refreshRow(l: Line, except?: HTMLElement) {
        const row = rowOf(l.key);
        if (!row) return;
        const lista = row.querySelector('.lr-lista');
        const deal = l.productoId && l.negociado !== null && l.negociado < l.lista;
        if (lista) { lista.textContent = l.productoId ? fmt(l.lista) : ''; lista.classList.toggle('is-struck', !!deal); }
        const price = row.querySelector<HTMLInputElement>('.lr-nego');
        if (price && price !== except) price.value = numText(l.productoId ? unitPrice(l) : (l.precioPendiente ? null : l.lista));
        price?.classList.toggle('is-deal', !!deal);
        const imp = row.querySelector('.lr-importe');
        if (imp) imp.textContent = fmt(lineAmount(l));
        const small = row.querySelector('.lr-name small');
        if (small) small.innerHTML = nameNote(l);
        const marg = row.querySelector('.lr-margen');
        if (marg) marg.outerHTML = marginCell(l);
    }

    // ── Totales ─────────────────────────────────────────────────────────────
    const $ivaIncl = $<HTMLInputElement>('deIvaIncluido');
    const $docMode = $<HTMLSelectElement>('deDocumentMode');
    let lastTotal = 0;
    const roundLinesTo = () => {
        if (isQuote) return null;
        // El CFDI se valida a centavos; el resto, a los decimales de su divisa.
        return boot.orgCountry === 'MX' && $docMode?.value === 'fiscal' ? 2 : decimals();
    };

    function recalc() {
        const s = summarize(lines, { ivaIncluido: !!$ivaIncl?.checked, retenciones: boot.retenciones, roundLinesTo: roundLinesTo() });
        lastTotal = s.total;
        const set = (id: string, v: string) => { const el = $(id); if (el) el.textContent = v; };
        set('deSubtotal', fmt(s.subtotal));
        set('deTotal', fmt(s.total));
        set('deCount', s.lineCount
            ? tpl(T.countTpl, { n: s.lineCount, lineas: s.lineCount === 1 ? T.line : T.lines, p: Math.round(s.pieces * 1000) / 1000, unidades: s.pieces === 1 ? T.unit : T.units })
            : T.addLinesHint);
        const $saved = $('deSavedLine');
        if ($saved) {
            $saved.hidden = !(isQuote && s.saved > 0.004);
            set('deSaved', '−' + fmt(s.saved));
        }
        const $taxes = $('deTaxes');
        if ($taxes) {
            $taxes.innerHTML = [
                ...s.taxes.map((t) => `<div class="sum-line sum-tax"><span>${escapeHtml(boot.taxLabel)} ${Math.round(t.tasa * 10000) / 100}%</span><span class="editorial">${fmt(t.impuesto)}</span></div>`),
                ...s.retenciones.map((r) => `<div class="sum-line sum-ret"><span>${escapeHtml(r.nombre)}</span><span class="editorial">−${fmt(r.monto)}</span></div>`),
            ].join('');
        }
        syncDeposit();
        syncRecurring();
        scheduleFx();
    }

    // ── Edición en la fila ──────────────────────────────────────────────────
    $lines.addEventListener('input', (e) => {
        const el = e.target as HTMLInputElement;
        const l = lineOf(el);
        if (!l) return;
        markDirty();
        el.classList.remove('is-invalid');
        el.removeAttribute('aria-invalid');
        if (el.dataset.f === 'desc') { l.nombre = el.value; return; }
        if (el.dataset.f === 'qty') {
            const n = parseAmount(el.value);
            setQuantity(l, n ?? 0, ctx());
        } else if (el.dataset.f === 'price') {
            setPrice(l, parseAmount(el.value));
        }
        refreshRow(l, el);
        recalc();
    });
    $lines.addEventListener('change', (e) => {
        const el = e.target as HTMLSelectElement;
        if (el.dataset.f !== 'tax') return;
        const l = lineOf(el);
        if (!l) return;
        l.taxRate = Number(el.value) || 0;
        el.classList.toggle('is-exento', l.taxRate === 0);
        markDirty();
        recalc();
    });
    // Al salir del campo se normaliza lo escrito ("1,5" → "1.5").
    $lines.addEventListener('focusout', (e) => {
        const el = e.target as HTMLInputElement;
        const l = lineOf(el);
        if (!l || (el.dataset.f !== 'qty' && el.dataset.f !== 'price')) return;
        if (el.dataset.f === 'qty') el.value = numText(l.cantidad > 0 ? l.cantidad : null, 3);
        else el.value = numText(l.productoId ? unitPrice(l) : (l.precioPendiente ? null : l.lista));
    });
    $lines.addEventListener('focusin', (e) => {
        const el = e.target as HTMLInputElement;
        if (el.dataset.f === 'qty' || el.dataset.f === 'price') el.select();
    });
    $lines.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
        if (!btn) return;
        const l = lineOf(btn);
        if (!l) return;
        if (btn.dataset.act === 'remove') {
            lines.splice(lines.indexOf(l), 1);
            markDirty();
            render();
        } else if (btn.dataset.act === 'suggested' && l.pricing?.suggestedPrice != null) {
            setPrice(l, l.pricing.suggestedPrice);
            markDirty();
            refreshRow(l);
            recalc();
        }
    });

    // ── Precio sugerido y existencias (solo enriquecen; nunca bloquean) ─────
    function loadPricing(l: Line) {
        if (!isQuote || !l.productoId) return;
        const qs = new URLSearchParams({ producto_id: l.productoId, precio_lista: String(l.lista) });
        if (clientOption()) qs.set('cliente_id', clientOption()!.value);
        fetch('/api/pricing/suggest?' + qs.toString())
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (!data || !lines.includes(l)) return;
                l.pricing = data;
                refreshRow(l);
            })
            .catch(() => {});
    }
    function refreshStock(ids: string[]) {
        if (!ids.length) return;
        fetch('/api/integraciones/shopify/existencias', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
        })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                const ex = data?.existencias;
                if (!ex) return;
                for (const id of Object.keys(ex)) {
                    const p = catalogMap.get(id);
                    if (p) p.existencias = ex[id];
                    lines.forEach((l) => { if (l.productoId === id) { l.existencias = ex[id]; refreshRow(l); } });
                }
            })
            .catch(() => {});
    }
    const stockIdsOf = (ls: Line[]) => [...new Set(ls.filter((l) => l.productoId && l.existencias !== null && l.existencias !== undefined).map((l) => l.productoId!))];

    function addLines(newLines: Line[]) {
        lines.push(...newLines);
        markDirty();
        render(newLines.map((l) => l.key));
        newLines.forEach(loadPricing);
        refreshStock(stockIdsOf(newLines));
    }

    // ── Buscador de catálogo (combobox) ─────────────────────────────────────
    const $search = $<HTMLInputElement>('deSearch');
    const $drop = $('deSearchDrop');
    let results: CatalogProduct[] = [];
    let active = -1;
    const searchFor = (text: string) => {
        const n = norm(text.trim());
        const pool = boot.catalogo;
        return (n ? pool.filter((p) => norm(p.nombre).includes(n) || norm(p.sku).includes(n)) : pool).slice(0, 8);
    };
    function paintDrop() {
        if (!$drop || !$search) return;
        if (!results.length) {
            $drop.innerHTML = `<div class="prod-empty"><span>${escapeHtml(T.noMatches)}</span><small>${escapeHtml(T.noMatchesHint)}</small></div>`;
            $search.removeAttribute('aria-activedescendant');
        } else {
            $drop.innerHTML = results.map((p, i) => `
                <button type="button" class="prod-item${i === active ? ' is-active' : ''}" id="deOpt${i}" role="option" aria-selected="${i === active}" data-pid="${escapeHtml(p.id)}" tabindex="-1">
                    <span class="prod-item-name">${escapeHtml(p.nombre)}${p.sku ? `<small>${escapeHtml(p.sku)}</small>` : ''}${p.existencias === null || p.existencias === undefined ? '' : `<small class="prod-stock${p.existencias <= 0 ? ' is-out' : ''}">${escapeHtml(p.existencias <= 0 ? T.outOfStock : tpl(T.inStockTpl, { n: p.existencias }))}</small>`}</span>
                    <span class="prod-item-price editorial">${fmt(p.precio)} <small>/ ${escapeHtml(p.unidad)}</small></span>
                </button>`).join('');
            if (active >= 0) $search.setAttribute('aria-activedescendant', `deOpt${active}`);
        }
        $drop.hidden = false;
        $search.setAttribute('aria-expanded', 'true');
    }
    const closeDrop = () => {
        if ($drop) $drop.hidden = true;
        $search?.setAttribute('aria-expanded', 'false');
        $search?.removeAttribute('aria-activedescendant');
        active = -1;
    };
    const pick = (p: CatalogProduct | undefined) => {
        if (!p || !$search) return;
        addLines([lineFromProduct(p, ctx(), boot.defaultTaxRate)]);
        $search.value = '';
        results = searchFor('');
        active = results.length ? 0 : -1;
        paintDrop();
    };
    if ($search && $drop) {
        const open = () => { results = searchFor($search.value); active = results.length ? 0 : -1; paintDrop(); };
        $search.addEventListener('focus', open);
        $search.addEventListener('input', () => { $search.classList.remove('is-invalid'); $search.removeAttribute('aria-invalid'); open(); });
        $search.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); if ($drop.hidden) open(); else { active = Math.min(active + 1, results.length - 1); paintDrop(); } }
            else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); paintDrop(); }
            // Enter con el buscador vacío no agrega "el primero de la lista":
            // solo agrega lo que la persona buscó.
            else if (e.key === 'Enter') { e.preventDefault(); if ($search.value.trim() && active >= 0) pick(results[active]); }
            else if (e.key === 'Escape') { closeDrop(); $search.blur(); }
        });
        $drop.addEventListener('mousedown', (e) => e.preventDefault());
        $drop.addEventListener('click', (e) => {
            const btn = (e.target as HTMLElement).closest<HTMLElement>('.prod-item');
            if (btn) pick(catalogMap.get(btn.dataset.pid || ''));
        });
        document.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('.prod-search')) closeDrop(); });
    }

    // ── Línea libre ─────────────────────────────────────────────────────────
    $('deFreeLine')?.addEventListener('click', () => {
        const l = freeLine(boot.defaultTaxRate);
        addLines([l]);
        rowOf(l.key)?.querySelector<HTMLInputElement>('.lr-desc-input')?.focus();
    });

    // ── Kits ────────────────────────────────────────────────────────────────
    const $kitBtn = $('deKitBtn');
    const $kitDrop = $('deKitDrop');
    const closeKits = () => { if ($kitDrop) $kitDrop.hidden = true; $kitBtn?.setAttribute('aria-expanded', 'false'); };
    $kitBtn?.addEventListener('click', () => {
        const open = !!$kitDrop?.hidden;
        closeDrop();
        if ($kitDrop) $kitDrop.hidden = !open;
        $kitBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('.kit-insert-wrap')) closeKits(); });
    $kitDrop?.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-kit-add]');
        if (!btn) return;
        const kit = kitMap.get(btn.dataset.kitAdd || '');
        if (!kit || !kit.items.length) return;
        const row = btn.closest('.kit-insert-row');
        const mult = Number(row?.querySelector<HTMLInputElement>('.kit-insert-qty')?.value) || 1;
        const { lines: nuevas, ahorro } = linesFromKit(kit, mult, catalogMap, ctx(), boot.defaultTaxRate);
        addLines(nuevas);
        closeKits();
        toast(ahorro > 0.004
            ? tpl(T.kitComboTpl, { nombre: kit.nombre, ahorro: fmt(ahorro) })
            : tpl(T.kitInsertedTpl, { nombre: kit.nombre, n: nuevas.length, lineas: nuevas.length === 1 ? T.line : T.lines }), 'ok');
        (window as any).cordTrack?.('kit_used', { kit_id: kit.id, item_count: kit.items.length, multiplier: mult });
    });

    // ── Cliente ─────────────────────────────────────────────────────────────
    const $descNote = $('deDescNote');
    const reflectDiscount = () => {
        const d = clientDiscount();
        if ($descNote) { $descNote.textContent = d > 0 ? tpl(T.clientDiscountTpl, { d }) : ''; $descNote.hidden = !(d > 0); }
    };
    function loadB2B(clienteId: string, apply: boolean) {
        b2bList = null;
        if (!clienteId) return;
        fetch('/api/integraciones/shopify/precios?cliente=' + encodeURIComponent(clienteId))
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (!data?.moneda || $client?.value !== clienteId) return;
                b2bList = { moneda: String(data.moneda).toUpperCase(), precios: data.precios || {} };
                if (apply) { repriceForClient(lines, ctx()); render(); }
            })
            .catch(() => {});
    }
    const $terms = $('deTerms');
    const setTerm = (code: string | undefined) => {
        if (!code || !$terms) return;
        const chips = [...$terms.querySelectorAll<HTMLElement>('.chip')];
        if (!chips.some((c) => c.dataset.term === code)) return;
        chips.forEach((c) => { c.classList.toggle('active', c.dataset.term === code); c.setAttribute('aria-pressed', String(c.dataset.term === code)); });
        onTermChange(code);
    };
    const currentTerm = () => $terms?.querySelector<HTMLElement>('.chip.active')?.dataset.term || 'contado';

    $client?.addEventListener('change', () => {
        if ($client.value === '__NEW__') {
            $client.value = lastClient; // Se queda el cliente que había; el modal decide.
            document.dispatchEvent(new CustomEvent('clientmodal:open'));
            return;
        }
        lastClient = $client.value;
        $client.classList.remove('is-invalid');
        $client.removeAttribute('aria-invalid');
        markDirty();
        repriceForClient(lines, ctx());
        setTerm(clientOption()?.dataset.term);
        reflectDiscount();
        refreshRecipient();
        render();
        lines.forEach(loadPricing);
        loadB2B($client.value, true);
    });
    document.addEventListener('clientmodal:saved', ((e: CustomEvent) => {
        const { id, cliente = {} } = e.detail || {};
        if (!id || !$client) return;
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = cliente.contacto ? `${cliente.empresa} — ${cliente.contacto}` : (cliente.empresa || '');
        opt.dataset.desc = String(Number(cliente.descuento_pct) || 0);
        opt.dataset.term = cliente.terminos || 'contado';
        opt.dataset.email = String(cliente.email || '').trim();
        $client.insertBefore(opt, $client.querySelector('option[value="__NEW__"]'));
        $client.value = id;
        $client.dispatchEvent(new Event('change'));
        toast(tpl(T.clientCreatedTpl, { empresa: cliente.empresa || '' }), 'ok');
    }) as EventListener);

    $terms?.addEventListener('click', (e) => {
        const chip = (e.target as HTMLElement).closest<HTMLElement>('.chip');
        if (!chip || chip.hasAttribute('disabled')) return;
        markDirty();
        setTerm(chip.dataset.term);
    });

    // ── Factura: vencimiento y entrega ──────────────────────────────────────
    const $due = $<HTMLInputElement>('deDueDate');
    const DIAS: Record<string, number> = { contado: 0, net30: 30, net60: 60 };
    const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    function onTermChange(code: string) {
        syncRecurring();
        if (!$due) return;
        // Local, no UTC: con toISOString() "contado" fijaba mañana a partir de
        // las 18:00 en México.
        $due.value = isoLocal(new Date(Date.now() + (DIAS[code] ?? 0) * 86400000));
        $due.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const clientEmail = () => String(clientOption()?.dataset.email || '').trim();
    function refreshRecipient() {
        const el = $('deRecipient');
        if (!el) return;
        el.textContent = clientEmail() || (clientOption() ? T.noEmail : T.chooseClientDelivery);
        el.classList.toggle('is-missing', !!clientOption() && !clientEmail());
    }

    // ── Cotización: anticipo e iguala ───────────────────────────────────────
    const $deposit = $<HTMLInputElement>('deDeposit');
    const $recurring = $<HTMLInputElement>('deRecurring');
    function syncDeposit() {
        const note = $('deDepositNote');
        if (!$deposit || !note) return;
        const pct = Math.min(99, Math.max(0, Math.round(Number($deposit.value) || 0)));
        if (pct >= 1 && lastTotal > 0) {
            const ant = Math.round(lastTotal * pct) / 100;
            note.textContent = tpl(T.depositNoteTpl, { ant: fmt(ant), resto: fmt(lastTotal - ant) });
            note.hidden = false;
        } else note.hidden = true;
    }
    function syncRecurring() {
        const field = $('deRecurringField');
        const note = $('deRecurringNote');
        const depField = $('deDepositField');
        if (!$recurring || !field) return;
        // La iguala solo aplica a contado y excluye el anticipo.
        const contado = currentTerm() === 'contado';
        if (!contado) $recurring.checked = false;
        field.hidden = !contado;
        if (depField) depField.hidden = $recurring.checked;
        if (note) {
            note.hidden = !$recurring.checked;
            note.textContent = lastTotal > 0 ? tpl(T.recurringNoteTpl, { total: fmt(lastTotal) }) : T.recurringNoteEmpty;
        }
    }
    $deposit?.addEventListener('input', () => { markDirty(); syncDeposit(); });
    $recurring?.addEventListener('change', () => { markDirty(); syncRecurring(); });
    $ivaIncl?.addEventListener('change', () => { markDirty(); recalc(); });
    $docMode?.addEventListener('change', () => { markDirty(); recalc(); });
    root.querySelectorAll<HTMLElement>('#deNotes, #deValidity').forEach((el) => el.addEventListener('input', markDirty));
    $due?.addEventListener('change', markDirty);

    // ── Divisa y tipo de cambio ─────────────────────────────────────────────
    const $fxCover = $('deFx');
    const $fxBuffer = $<HTMLInputElement>('deFxBuffer');
    const $relabel = $('deCurrencyNote');
    let fxTimer = 0;
    let fxAbort: AbortController | null = null;
    function scheduleFx() {
        if (!$fxCover || currency === boot.orgCurrency) { if ($fxCover) $fxCover.hidden = true; return; }
        clearTimeout(fxTimer);
        fxTimer = window.setTimeout(refreshFx, 250);
    }
    async function refreshFx() {
        if (!$fxCover) return;
        const base = currency;
        const fiscal = boot.orgCurrency;
        $fxCover.hidden = base === fiscal;
        if (base === fiscal) return;
        const set = (id: string, v: string) => { const el = $(id); if (el) el.textContent = v; };
        let fiscalName = fiscal;
        try { fiscalName = new Intl.DisplayNames([T.intl], { type: 'currency' }).of(fiscal) || fiscal; } catch { /* nombre opcional */ }
        set('deFxExplain', tpl(T.fxExplainTpl, { base, fiscal: `${fiscalName} (${fiscal})` }));
        const buffer = Number($fxBuffer?.value) || 0;
        set('deFxBufLbl', `+${buffer}%`);
        // Respuestas fuera de orden no pisan la vista previa: solo cuenta la última.
        fxAbort?.abort();
        fxAbort = new AbortController();
        try {
            const res = await fetch(`/api/fx/quote?base=${base}&fiscal=${fiscal}&amount=${lastTotal}&buffer=${buffer}`, { signal: fxAbort.signal });
            const fx = await readJson(res);
            if (!res.ok) throw new Error(fx.error || T.fxUnavailable);
            const rateFmt = new Intl.NumberFormat(T.intl, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
            set('deFxSpot', rateFmt.format(Number(fx.spotRate) || 0));
            set('deFxApplied', rateFmt.format(Number(fx.appliedRate) || 0));
            const libros = lastTotal * (Number(fx.appliedRate) || 0);
            set('deFxPreview', lastTotal > 0
                ? tpl(T.clientPaysTpl, { monto: fmt(lastTotal), libros: createMoney({ currency: fiscal, locale: T.intl })(libros) })
                : tpl(T.addLinesCurrencyTpl, { base }));
        } catch (err) {
            if ((err as Error)?.name === 'AbortError') return;
            // Regla 22: sin tasa real no se pinta una vista previa inventada.
            set('deFxSpot', '—');
            set('deFxApplied', '—');
            set('deFxPreview', err instanceof Error && err.message ? err.message : T.fxUnavailable);
        }
    }
    $currency?.addEventListener('change', () => {
        const prev = currency;
        currency = ($currency.value || boot.orgCurrency).toUpperCase();
        fmt = createMoney({ currency, locale: T.intl });
        markDirty();
        // Los precios NO se convierten: se dice, en vez de que una venta de
        // MXN 1,000 se lea en silencio como USD 1,000.
        if ($relabel) {
            $relabel.hidden = !(lines.length > 0 && prev !== currency);
            $relabel.textContent = tpl(T.currencyRelabelTpl, { currency });
        }
        repriceForClient(lines, ctx()); // la lista B2B solo aplica en su divisa
        render();
    });
    root.querySelectorAll<HTMLElement>('.fx-cush-chip').forEach((chip) => chip.addEventListener('click', () => {
        root.querySelectorAll('.fx-cush-chip').forEach((c) => { c.classList.remove('active'); c.setAttribute('aria-pressed', 'false'); });
        chip.classList.add('active');
        chip.setAttribute('aria-pressed', 'true');
        if ($fxBuffer) $fxBuffer.value = chip.dataset.buf || '2';
        markDirty();
        refreshFx();
    }));

    // ── Armar con IA ────────────────────────────────────────────────────────
    const $aiText = $<HTMLTextAreaElement>('deAiText');
    const $aiFile = $<HTMLInputElement>('deAiFile');
    const $aiChip = $('deAiChip');
    const $aiStatus = $('deAiStatus');
    const $aiBtn = $<HTMLButtonElement>('deAiBtn');
    let aiFile: { mediaType: string; data: string; name: string } | null = null;
    const MAX_PDF_BYTES = 3 * 1024 * 1024;
    const IMG_MAX_DIM = 1600;
    const b64 = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1);
    // Las fotos se reducen y recomprimen antes de subir: una foto de celular
    // pesa 5-10 MB, muy por encima del límite del cuerpo de la función.
    const readImage = (file: File) => new Promise<{ mediaType: string; data: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error(T.cantReadImage));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error(T.cantReadImage));
            img.onload = () => {
                const scale = Math.min(1, IMG_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
                const c = document.createElement('canvas');
                c.width = Math.round(img.naturalWidth * scale);
                c.height = Math.round(img.naturalHeight * scale);
                c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
                resolve({ mediaType: 'image/jpeg', data: b64(c.toDataURL('image/jpeg', 0.82)) });
            };
            img.src = String(reader.result);
        };
        reader.readAsDataURL(file);
    });
    const readPdf = (file: File) => new Promise<{ mediaType: string; data: string }>((resolve, reject) => {
        if (file.size > MAX_PDF_BYTES) { reject(new Error(T.pdfTooHeavy)); return; }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error(T.cantReadPdf));
        reader.onload = () => resolve({ mediaType: 'application/pdf', data: b64(String(reader.result)) });
        reader.readAsDataURL(file);
    });
    const clearAiFile = () => {
        aiFile = null;
        if ($aiFile) $aiFile.value = '';
        if ($aiChip) $aiChip.hidden = true;
    };
    $('deAiAttach')?.addEventListener('click', () => $aiFile?.click());
    $('deAiRemove')?.addEventListener('click', clearAiFile);
    $aiFile?.addEventListener('change', async () => {
        const file = $aiFile.files?.[0];
        if (!file) return;
        if ($aiStatus) $aiStatus.textContent = T.readingFile;
        try {
            const isImage = file.type.startsWith('image/');
            if (!isImage && file.type !== 'application/pdf') throw new Error(T.unsupportedFile);
            const r = isImage ? await readImage(file) : await readPdf(file);
            aiFile = { ...r, name: file.name };
            const name = $('deAiFileName');
            if (name) name.textContent = file.name;
            if ($aiChip) $aiChip.hidden = false;
            if ($aiStatus) $aiStatus.textContent = '';
        } catch (err) {
            clearAiFile();
            if ($aiStatus) $aiStatus.textContent = err instanceof Error ? err.message : T.cantProcessFile;
        }
    });
    $aiBtn?.addEventListener('click', async () => {
        const text = ($aiText?.value || '').trim();
        if (!text && !aiFile) { if ($aiStatus) $aiStatus.textContent = T.writeOrAttach; return; }
        const label = $aiBtn.querySelector('.ai-btn-label');
        const prev = label?.textContent || '';
        $aiBtn.disabled = true;
        if (label) label.textContent = aiFile ? T.readingDocument : T.building;
        if ($aiStatus) $aiStatus.textContent = '';
        try {
            const res = await fetch('/api/cotizaciones/ai-draft', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, file: aiFile }),
            });
            const data = await readJson(res);
            if (!res.ok) throw new Error(data.error || T.cantBuild);
            const items: any[] = Array.isArray(data.items) ? data.items : [];
            (window as any).cordTrack?.('ai_draft_used', { has_file: !!aiFile, has_text: !!text, item_count: items.length, ...(isQuote ? {} : { surface: 'invoice' }) });
            const validRate = (r: unknown) => (r !== null && r !== undefined && boot.taxOptions.some((o) => Math.abs(o.rate - Number(r)) < 1e-9) ? Number(r) : boot.defaultTaxRate);
            const nuevas = items.map((it) => {
                const p = it.id ? catalogMap.get(String(it.id)) : undefined;
                const qty = Number(it.cantidad) > 0 ? Number(it.cantidad) : 1;
                if (p) {
                    const l = lineFromProduct(p, ctx(), validRate(it.taxRate), qty);
                    // El precio que la IA leyó del documento es una propuesta
                    // pactada; sin él, aplica el automático del cliente.
                    if (it.negociado !== null && it.negociado !== undefined && Number(it.negociado) >= 0) setPrice(l, Number(it.negociado));
                    return l;
                }
                const l = freeLine(validRate(it.taxRate), { nombre: String(it.nombre || it.descripcion || ''), cantidad: qty, unidad: it.unidad || 'pieza', precio: Number(it.lista) > 0 ? Number(it.lista) : null });
                return l;
            });
            let replace = true;
            if (lines.length && nuevas.length) {
                replace = await (window as any).cordConfirm?.({
                    title: T.replaceTitle,
                    body: tpl(T.replaceBodyTpl, { n: nuevas.length, lineas: nuevas.length === 1 ? T.line : T.lines, m: lines.length }),
                    confirmText: T.replace,
                    cancelText: T.appendInstead,
                }) ?? true;
            }
            if (replace) lines.length = 0;
            addLines(nuevas);
            clearAiFile();
            if ($aiStatus) $aiStatus.textContent = tpl(T.builtTpl, { n: nuevas.length, lineas: nuevas.length === 1 ? T.line : T.lines });
        } catch (err) {
            if ($aiStatus) $aiStatus.textContent = err instanceof Error && err.message ? err.message : T.errorNetwork;
        } finally {
            $aiBtn.disabled = false;
            if (label) label.textContent = prev;
        }
    });

    // ── Validación ──────────────────────────────────────────────────────────
    const fieldError = (el: HTMLElement | null | undefined, msg: string) => {
        toast(msg, 'error', 4200);
        if (!el) return;
        el.classList.add('is-invalid');
        el.setAttribute('aria-invalid', 'true');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => el.focus(), 250);
    };
    function validate(opts: { needClient: boolean }): boolean {
        if (opts.needClient && !clientOption()) {
            fieldError($client, isQuote ? T.needClientQuote : T.needClientInvoice);
            return false;
        }
        if (!lines.length) { fieldError($search, T.needLines); return false; }
        const bad = firstInvalidLine(lines);
        if (bad) {
            const row = rowOf(bad.key);
            const sel = bad.problem === 'descripcion' ? '.lr-desc-input' : bad.problem === 'cantidad' ? '.lr-qty' : '.lr-nego';
            fieldError(row?.querySelector<HTMLElement>(sel), bad.problem === 'descripcion' ? T.needDescription : bad.problem === 'cantidad' ? T.needQuantity : T.needPrice);
            return false;
        }
        return true;
    }

    // ── Guardado (un solo vuelo) ────────────────────────────────────────────
    // Antes solo se deshabilitaba el botón pulsado: Enviar y luego "Guardar
    // borrador" (o ⌘Enter) durante la petición creaban dos documentos.
    let busy = false;
    const actionButtons = () => [...root.querySelectorAll<HTMLButtonElement>('[data-save]'), ...[$('deIssueOk')].filter(Boolean) as HTMLButtonElement[]];
    const lock = (on: boolean) => { busy = on; actionButtons().forEach((b) => { b.disabled = on; }); root.toggleAttribute('aria-busy', on); };
    let docId = boot.doc.id;

    function quotePayload(send: boolean) {
        const recurring = !!$recurring?.checked;
        const dep = Math.min(99, Math.max(0, Math.round(Number($deposit?.value) || 0)));
        return {
            send,
            cliente_id: clientOption()?.value || null,
            terminos: recurring ? 'contado' : currentTerm(),
            vigencia_dias: Number($<HTMLSelectElement>('deValidity')?.value) || 30,
            es_recurrente: recurring,
            anticipo_pct: !recurring && dep >= 1 ? dep : null,
            notas: ($<HTMLTextAreaElement>('deNotes')?.value || '').trim(),
            base_currency: currency,
            fiscal_currency: boot.orgCurrency,
            fx_buffer_pct: currency === boot.orgCurrency ? 0 : Number($fxBuffer?.value) || 0,
            iva_incluido: !!$ivaIncl?.checked,
            items: payloadItems(lines),
        };
    }
    function invoicePayload() {
        return {
            cliente_id: clientOption()?.value || '',
            document_mode: $docMode?.value,
            currency,
            due_date: $due?.value || undefined,
            notas: ($<HTMLTextAreaElement>('deNotes')?.value || '').trim() || undefined,
            iva_incluido: !!$ivaIncl?.checked,
            fx_buffer_pct: currency === boot.orgCurrency ? 0 : Number($fxBuffer?.value) || 0,
            items: payloadItems(lines),
        };
    }
    const goTo = (url: string, msg?: string) => {
        dirty = false;
        if (msg) { try { sessionStorage.setItem('cord.flash', JSON.stringify({ msg, type: 'ok' })); } catch { /* sin flash */ } }
        window.location.href = url;
    };

    async function saveQuote(send: boolean) {
        if (busy) return;
        if (!validate({ needClient: send })) return;
        lock(true);
        toast(send ? T.sending : T.saving, 'info', 2500);
        try {
            let res: Response;
            if (isVersion) {
                res = await fetch(`/api/cotizaciones/${docId}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'resend', iva_incluido: !!$ivaIncl?.checked, items: payloadItems(lines) }),
                });
            } else if (docId) {
                res = await fetch(`/api/cotizaciones/${docId}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...quotePayload(send), action: send ? 'send' : 'update_draft' }),
                });
            } else {
                res = await fetch('/api/cotizaciones', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(quotePayload(send)),
                });
            }
            const data = await readJson(res);
            if (!res.ok) throw new Error(data.error || T.errorSave);
            const id = data.id || docId;
            const folio = data.folio || boot.doc.folio || '';
            const msg = data.needsApproval ? tpl(T.approvalRequestedTpl, { folio })
                : isVersion ? T.versionSentOk
                : send ? (folio ? tpl(T.sentFolioTpl, { folio }) : T.sentOk)
                : (folio ? tpl(T.draftFolioTpl, { folio }) : T.saved);
            goTo(`/app/cotizaciones/${id}`, msg);
        } catch (err) {
            lock(false);
            toast(err instanceof Error && err.message ? err.message : T.errorNetwork, 'error', 4200);
        }
    }

    async function persistInvoice(): Promise<string> {
        const res = docId
            ? await fetch(`/api/facturas/${docId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'update_draft', ...invoicePayload() }),
            })
            : await fetch('/api/facturas', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invoicePayload()),
            });
        const data = await readJson(res);
        if (!res.ok) throw new Error(data.error || T.errorSave);
        docId = data.id || docId;
        if (!docId) throw new Error(T.errorSave);
        // A partir de aquí recargar edita ESTE borrador, no crea otro.
        try { history.replaceState(null, '', `/app/facturas/nueva?draft=${docId}`); } catch { /* sin history */ }
        return docId;
    }

    async function saveInvoiceDraft() {
        if (busy || !validate({ needClient: true })) return;
        lock(true);
        toast(T.saving, 'info', 2500);
        try {
            await persistInvoice();
            goTo('/app/facturas', T.saved);
        } catch (err) {
            lock(false);
            toast(err instanceof Error && err.message ? err.message : T.errorNetwork, 'error', 4200);
        }
    }

    const $dialog = $<HTMLDialogElement>('deIssueConfirm');
    let pendingSend = true;
    function openIssue(sendEmail: boolean) {
        if (busy || $dialog?.open) return;
        if (!validate({ needClient: true })) return;
        if (sendEmail && !clientEmail()) { fieldError($client, T.needEmail); return; }
        pendingSend = sendEmail;
        const set = (id: string, v: string) => { const el = $(id); if (el) el.textContent = v; };
        set('deConfirmClient', clientOption()?.textContent?.trim() || '…');
        set('deConfirmTotal', fmt(lastTotal));
        let due = T.noDate;
        if ($due?.value) {
            const [y, m, d] = $due.value.split('-').map(Number);
            due = new Intl.DateTimeFormat(T.intl, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d));
        }
        set('deConfirmDue', due);
        set('deConfirmDelivery', sendEmail ? clientEmail() : T.noDelivery);
        set('deIssueOk', sendEmail ? T.issueSend : T.issueInvoice);
        $dialog?.showModal();
    }
    $('deIssueOk')?.addEventListener('click', async () => {
        if (busy) return;
        lock(true);
        toast(T.issuing, 'info', 12000);
        try {
            const id = await persistInvoice();
            const res = await fetch(`/api/facturas/${id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: pendingSend ? 'finalize_and_send' : 'finalize' }),
            });
            const data = await readJson(res);
            if (!res.ok) throw new Error(data.error || T.errorSave);
            goTo(`/app/facturas/${id}${data.sent === false ? '?delivery=failed' : ''}`, T.issuedOk);
        } catch (err) {
            lock(false);
            toast(err instanceof Error && err.message ? err.message : T.errorNetwork, 'error', 6000);
        }
    });

    root.querySelectorAll<HTMLButtonElement>('[data-save]').forEach((btn) => btn.addEventListener('click', () => {
        const action = btn.dataset.save;
        if (action === 'send') saveQuote(true);
        else if (action === 'draft') saveQuote(false);
        else if (action === 'issue') openIssue(true);
        else if (action === 'issue-only') openIssue(false);
        else if (action === 'invoice-draft') saveInvoiceDraft();
    }));

    // ⌘/Ctrl+Enter = la acción principal. Regla 16: en móvil no hay atajos.
    document.addEventListener('keydown', (e) => {
        if (isMobile() || !(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return;
        if (document.querySelector('dialog[open]')) return;
        e.preventDefault();
        root.querySelector<HTMLButtonElement>('[data-save][data-primary]')?.click();
    });

    // Salir con cambios sin guardar pregunta antes (el navegador pone el texto).
    window.addEventListener('beforeunload', (e) => {
        if (!dirty || busy) return;
        e.preventDefault();
        e.returnValue = T.leaveWarning;
    });

    // ── Arranque ────────────────────────────────────────────────────────────
    if (boot.doc.clienteId && $client && [...$client.options].some((o) => o.value === boot.doc.clienteId)) {
        $client.value = boot.doc.clienteId;
        lastClient = boot.doc.clienteId;
        // B2B sin repreciar: los precios del borrador ya son los que se guardaron.
        loadB2B(boot.doc.clienteId, false);
    }
    reflectDiscount();
    refreshRecipient();
    render();
    syncRecurring();
    lines.forEach(loadPricing);
    refreshStock(stockIdsOf(lines));
    if (currency !== boot.orgCurrency) refreshFx();
    // Si llegó con un cliente preseleccionado (desde su ficha), se aplica su
    // descuento y términos como si se hubiera elegido a mano.
    if (!boot.doc.id && boot.doc.clienteId) $client?.dispatchEvent(new Event('change'));
    dirty = false;
}

// Pequeño helper para el `<script>` del componente.
export function bootDocumentEditor() {
    const root = document.querySelector<HTMLElement>('[data-editor][data-document-editor]');
    const raw = document.getElementById('deBoot')?.textContent;
    if (!root || !raw) return;
    mountDocumentEditor(root, JSON.parse(raw));
}
