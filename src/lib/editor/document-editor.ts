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
    unitPrice, volumePrice, newKey, autoPrice, parseQuery,
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
    /** Costo guardado en el documento. Sin él, reabrir tomaba el del catálogo de
     *  hoy (o 0 en una línea libre) y el reenvío pisaba el snapshot: con costo 0
     *  la aprobación por margen mínimo no se evalúa. */
    costo?: number | null;
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
    /** Para la vista previa: cómo se ve el documento con la marca del negocio. */
    brand?: { nombre: string; logoUrl: string | null; color: string | null; taxIdLabel?: string; taxId?: string | null };
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
    const clientOption = () => {
        const o = $client?.selectedOptions[0];
        return o && o.value ? o : null;
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
        const savedCost = b.costo != null && Number.isFinite(Number(b.costo)) ? Number(b.costo) : null;
        if (!b.productoId) {
            const l = freeLine(taxRate, { nombre: b.nombre, cantidad: b.cantidad, unidad: b.unidad || 'pieza', precio: b.negociado ?? b.lista });
            l.precioPendiente = false;
            if (savedCost !== null) l.costo = savedCost;
            return l;
        }
        // La lista GUARDADA manda al reabrir: repreciar con el catálogo de hoy
        // cambiaba en silencio un borrador viejo. El volumen se recalcula solo
        // si cambia la cantidad. Un producto que ya no está en el catálogo
        // activo sigue siendo ese producto: convertirlo en línea libre perdía
        // el vínculo y el descuento mostrado.
        const vol = p ? normalizeTiers(p.preciosVolumen) : [];
        // Un precio guardado que coincide con el automático del cliente sigue
        // siendo automático: si se cambia de cliente, se reprecia. Solo el que
        // difiere se trató como escrito a mano.
        const auto = autoPrice({ productoId: b.productoId, lista: b.lista }, ctx()).negociado;
        const touched = b.negociado !== null && (auto === null || Math.abs(b.negociado - auto) > 1e-9);
        return {
            key: newKey(), productoId: b.productoId, nombre: b.nombre || p?.nombre || '', unidad: b.unidad || p?.unidad || 'pieza',
            baseLista: p ? Number(p.precio) || b.lista : b.lista, lista: b.lista, vol,
            costo: savedCost ?? (Number(p?.costo) || 0),
            negociado: b.negociado, negoTouched: touched, cantidad: b.cantidad, taxRate,
            existencias: p?.existencias ?? null,
        };
    };
    const lines: Line[] = boot.doc.lines.map(fromBoot);
    let dirty = false;
    // Cada cambio marca el documento como pendiente y agenda el autoguardado
    // (borradores ya creados) o la copia local (documentos nuevos).
    const markDirty = () => { dirty = true; scheduleAutosave(); };

    // ── Render de líneas ────────────────────────────────────────────────────
    const $lines = $('deLines')!;
    const $empty = $('deLinesEmpty');
    const $head = $('deLinesHead');

    const taxSelect = (l: Line) => {
        if (!boot.multiTax) return '';
        const known = boot.taxOptions.some((o) => Math.abs(o.rate - l.taxRate) < 1e-9);
        // Una tasa guardada que ya no está en el catálogo (documento anterior,
        // tasa retirada) se muestra como es: si no, el selector enseñaba la
        // primera opción mientras el total se calculaba con la guardada.
        const legacy = known ? '' : `<option value="${l.taxRate}" selected>${escapeHtml(boot.taxLabel)} ${Math.round(l.taxRate * 10000) / 100}%</option>`;
        const opts = legacy + boot.taxOptions.map((o) =>
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
        const price = (l.precioPendiente ? null : l.productoId ? unitPrice(l) : l.lista);
        const deal = l.productoId && l.negociado !== null && l.negociado < l.lista;
        // En móvil la cabecera de columnas se oculta: cada campo lleva su
        // etiqueta (`data-label`), que en escritorio no ocupa lugar.
        return `
            <span class="lr-grip" draggable="true" title="${escapeHtml(T.moveLine)}" aria-hidden="true">${iconSvg('grip', '', 1.5, 14)}</span>
            ${name}
            <label class="lr-field lr-f-qty" data-label="${escapeHtml(T.thQty)}"><input type="text" inputmode="decimal" class="lr-input lr-qty" data-f="qty" value="${numText(l.cantidad)}" aria-label="${escapeHtml(T.qtyAria)}" /></label>
            <span class="lr-lista${deal ? ' is-struck' : ''}">${l.productoId ? fmt(l.lista) : ''}</span>
            <label class="lr-field lr-f-price" data-label="${escapeHtml(T.thPrice)}"><input type="text" inputmode="decimal" class="lr-input lr-nego${deal ? ' is-deal' : ''}" data-f="price" value="${numText(price)}" aria-label="${escapeHtml(T.priceAria)}" /></label>
            ${taxSelect(l)}
            <span class="editorial lr-importe">${fmt(lineAmount(l))}</span>
            ${marginCell(l)}
            <span class="lr-actions">
                <button type="button" class="lr-act" data-act="duplicate" aria-label="${escapeHtml(T.duplicateLine)}" title="${escapeHtml(T.duplicateLine)}">${iconSvg('copy', '', 1.5, 14)}</button>
                <button type="button" class="lr-act lr-del" data-act="remove" aria-label="${escapeHtml(T.removeLine)}" title="${escapeHtml(T.removeLine)}">${iconSvg('x', '', 1.5, 14)}</button>
            </span>`;
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
            `<div class="line-row${flashKeys.includes(l.key) ? ' line-added' : ''}" data-key="${l.key}" role="listitem">${rowHtml(l)}</div>`).join('');
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
        if (price && price !== except) price.value = numText((l.precioPendiente ? null : l.productoId ? unitPrice(l) : l.lista));
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
        set('deMobileTotal', fmt(s.total));
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
        syncSumTerms();
        scheduleFx();
    }

    /** Debajo del total: en qué condiciones se paga, en una línea. */
    function syncSumTerms() {
        const el = $('deSumTerms');
        if (!el) return;
        const chip = $('deTerms')?.querySelector<HTMLElement>('.chip.active');
        const term = chip?.textContent?.trim() || '';
        if (isQuote) {
            const n = Number($<HTMLSelectElement>('deValidity')?.value) || 30;
            el.textContent = term ? tpl(T.sumTermsQuoteTpl, { term, n }) : '';
        } else {
            el.textContent = term && dueText() ? tpl(T.sumTermsInvoiceTpl, { term, fecha: dueText() }) : '';
        }
    }
    function dueText() {
        const v = $<HTMLInputElement>('deDueDate')?.value;
        if (!v) return '';
        const [y, m, d] = v.split('-').map(Number);
        try { return new Intl.DateTimeFormat(T.intl, { day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d)); }
        catch { return v; }
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
        else el.value = numText((l.precioPendiente ? null : l.productoId ? unitPrice(l) : l.lista));
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
            removeLine(l);
        } else if (btn.dataset.act === 'duplicate') {
            const copy: Line = { ...l, key: newKey(), vol: [...l.vol], pricing: l.pricing ?? null };
            lines.splice(lines.indexOf(l) + 1, 0, copy);
            markDirty();
            render([copy.key]);
            rowOf(copy.key)?.querySelector<HTMLInputElement>('.lr-qty')?.focus();
        } else if (btn.dataset.act === 'suggested' && l.pricing?.suggestedPrice != null) {
            setPrice(l, l.pricing.suggestedPrice);
            markDirty();
            refreshRow(l);
            recalc();
        }
    });

    // ── Quitar con deshacer ─────────────────────────────────────────────────
    // Quitar una línea es un clic; recuperarla también. Sin esto, un clic de
    // más obligaba a recapturar la línea completa.
    const $undo = $('deUndo');
    let undoTimer = 0;
    let removed: { line: Line; index: number } | null = null;
    function removeLine(l: Line) {
        const index = lines.indexOf(l);
        if (index < 0) return;
        lines.splice(index, 1);
        removed = { line: l, index };
        markDirty();
        render();
        if ($undo) {
            const text = $('deUndoText');
            if (text) text.textContent = tpl(T.lineRemovedTpl, { nombre: l.nombre.trim() || T.lineUnnamed });
            $undo.hidden = false;
            clearTimeout(undoTimer);
            undoTimer = window.setTimeout(() => { $undo.hidden = true; removed = null; }, 6000);
        }
        // El foco no se pierde en el vacío: pasa a la línea que ocupó su lugar.
        const next = lines[Math.min(index, lines.length - 1)];
        (next ? rowOf(next.key)?.querySelector<HTMLElement>('.lr-qty') : $search)?.focus();
    }
    $('deUndoBtn')?.addEventListener('click', () => {
        if (!removed) return;
        lines.splice(Math.min(removed.index, lines.length), 0, removed.line);
        const key = removed.line.key;
        removed = null;
        if ($undo) $undo.hidden = true;
        markDirty();
        render([key]);
    });

    // ── Reordenar: arrastrar en escritorio, Alt + flechas con teclado ───────
    function moveLine(l: Line, to: number) {
        const from = lines.indexOf(l);
        const dest = Math.max(0, Math.min(lines.length - 1, to));
        if (from < 0 || from === dest) return;
        lines.splice(from, 1);
        lines.splice(dest, 0, l);
        markDirty();
        render();
    }
    $lines.addEventListener('keydown', (e) => {
        if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
        const el = e.target as HTMLElement;
        const l = lineOf(el);
        if (!l) return;
        e.preventDefault();
        const field = el.dataset.f;
        moveLine(l, lines.indexOf(l) + (e.key === 'ArrowUp' ? -1 : 1));
        rowOf(l.key)?.querySelector<HTMLElement>(field ? `[data-f="${field}"]` : '.lr-qty')?.focus();
    });
    let dragKey: string | null = null;
    $lines.addEventListener('dragstart', (e) => {
        const grip = (e.target as HTMLElement).closest('.lr-grip');
        const row = grip?.closest<HTMLElement>('.line-row');
        if (!grip || !row) { e.preventDefault(); return; }
        dragKey = row.dataset.key || null;
        row.classList.add('is-dragging');
        e.dataTransfer?.setData('text/plain', dragKey || '');
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer?.setDragImage(row, 24, 24);
    });
    $lines.addEventListener('dragover', (e) => {
        if (!dragKey) return;
        e.preventDefault();
        const row = (e.target as HTMLElement).closest<HTMLElement>('.line-row');
        $lines.querySelectorAll('.drop-before, .drop-after').forEach((r) => r.classList.remove('drop-before', 'drop-after'));
        if (!row || row.dataset.key === dragKey) return;
        const r = row.getBoundingClientRect();
        row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
    });
    $lines.addEventListener('drop', (e) => {
        if (!dragKey) return;
        e.preventDefault();
        const row = (e.target as HTMLElement).closest<HTMLElement>('.line-row');
        const moving = lines.find((l) => l.key === dragKey);
        const target = row ? lines.find((l) => l.key === row.dataset.key) : null;
        if (moving && target && moving !== target) {
            const r = row!.getBoundingClientRect();
            const after = e.clientY >= r.top + r.height / 2;
            const without = lines.filter((l) => l !== moving);
            const ti = without.indexOf(target) + (after ? 1 : 0);
            moveLine(moving, ti);
        }
    });
    $lines.addEventListener('dragend', () => {
        dragKey = null;
        $lines.querySelectorAll('.is-dragging, .drop-before, .drop-after').forEach((r) => r.classList.remove('is-dragging', 'drop-before', 'drop-after'));
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
    let pendingQty = 1;
    const searchFor = (text: string) => {
        // "40 tubo", "40x tubo" o "tubo x40": la cantidad viaja con la búsqueda.
        // Si lo escrito tal cual ya nombra un producto ("Foco 100 W", "2 x 4"),
        // el número es parte del nombre y no una cantidad.
        const pool = boot.catalogo;
        const match = (text: string) => {
            const n = norm(text.trim());
            return n ? pool.filter((p) => norm(p.nombre).includes(n) || norm(p.sku).includes(n)) : pool;
        };
        const { qty, term } = parseQuery(text);
        const literal = qty !== 1 ? match(text) : [];
        pendingQty = literal.length ? 1 : qty;
        return (literal.length ? literal : match(term)).slice(0, 8);
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
                    <span class="prod-item-price editorial">${pendingQty !== 1 ? `<b class="prod-item-qty">×${escapeHtml(pendingQty)}</b> ` : ''}${fmt(p.precio)} <small>/ ${escapeHtml(p.unidad)}</small></span>
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
        addLines([lineFromProduct(p, ctx(), boot.defaultTaxRate, pendingQty)]);
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
    $kitDrop?.parentElement?.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || $kitDrop.hidden) return;
        e.preventDefault();
        closeKits();
        $kitBtn?.focus();
    });
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
        $clientInput?.classList.remove('is-invalid');
        $clientInput?.removeAttribute('aria-invalid');
        if ($clientInput) $clientInput.value = clientOption()?.textContent?.trim() || '';
        reflectClientMeta();
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
        opt.dataset.rfc = String(cliente.rfc || '').trim();
        $client.appendChild(opt);
        $client.value = id;
        $client.dispatchEvent(new Event('change'));
        toast(tpl(T.clientCreatedTpl, { empresa: cliente.empresa || '' }), 'ok');
    }) as EventListener);

    // ── Buscador de clientes ────────────────────────────────────────────────
    // Un <select> nativo con cientos de clientes no se puede usar: no busca, no
    // muestra el correo y en móvil abre una rueda interminable. El combobox
    // filtra por empresa, contacto, correo y RFC; el <select> oculto sigue
    // siendo la fuente de datos (valor, descuento, términos, correo).
    const $clientInput = $<HTMLInputElement>('deClientInput');
    const $clientDrop = $('deClientDrop');
    const $clientMeta = $('deClientMeta');
    let clientResults: HTMLOptionElement[] = [];
    let clientActive = -1;
    function reflectClientMeta() {
        if (!$clientMeta) return;
        const o = clientOption();
        const email = o?.dataset.email || '';
        const rfc = o?.dataset.rfc ? `${boot.brand?.taxIdLabel || ''} ${o.dataset.rfc}`.trim() : '';
        $clientMeta.textContent = o ? tpl(T.clientMetaTpl, { email, sep: email && rfc ? ' · ' : '', taxId: rfc }) : '';
        $clientMeta.hidden = !o || (!email && !rfc);
    }
    const clientSearch = (text: string) => {
        const n = norm(text.trim());
        const all = [...($client?.options || [])].filter((o) => o.value);
        if (!n) return all.slice(0, 8);
        return all.filter((o) => norm(o.textContent).includes(n) || norm(o.dataset.email).includes(n) || norm(o.dataset.rfc).includes(n)).slice(0, 8);
    };
    function paintClients() {
        if (!$clientDrop || !$clientInput) return;
        const rows = clientResults.map((o, i) => `
            <button type="button" class="prod-item${i === clientActive ? ' is-active' : ''}" id="deCli${i}" role="option" aria-selected="${i === clientActive}" data-cid="${escapeHtml(o.value)}" tabindex="-1">
                <span class="prod-item-name">${escapeHtml(o.textContent?.trim())}${o.dataset.email || o.dataset.rfc ? `<small>${escapeHtml([o.dataset.email, o.dataset.rfc].filter(Boolean).join(' · '))}</small>` : ''}</span>
                ${Number(o.dataset.desc) > 0 ? `<span class="prod-item-price"><small>−${escapeHtml(o.dataset.desc)}%</small></span>` : ''}
            </button>`).join('');
        const empty = clientResults.length ? '' : `<div class="prod-empty"><span>${escapeHtml(T.noClientMatches)}</span></div>`;
        const create = `<button type="button" class="prod-item prod-create${clientActive === clientResults.length ? ' is-active' : ''}" id="deCli${clientResults.length}" role="option" aria-selected="${clientActive === clientResults.length}" data-cid="__NEW__" tabindex="-1">
                <span class="prod-item-name">${escapeHtml(T.createClient)}</span></button>`;
        $clientDrop.innerHTML = rows + empty + create;
        $clientDrop.hidden = false;
        $clientInput.setAttribute('aria-expanded', 'true');
        if (clientActive >= 0) $clientInput.setAttribute('aria-activedescendant', `deCli${clientActive}`);
        else $clientInput.removeAttribute('aria-activedescendant');
    }
    const closeClients = () => {
        if ($clientDrop) $clientDrop.hidden = true;
        $clientInput?.setAttribute('aria-expanded', 'false');
        $clientInput?.removeAttribute('aria-activedescendant');
        // Lo escrito sin elegir no cambia el cliente: el campo vuelve a decir cuál es.
        if ($clientInput) $clientInput.value = clientOption()?.textContent?.trim() || '';
    };
    const chooseClient = (id: string | undefined) => {
        if (!id || !$client) return;
        closeClients();
        if (id === '__NEW__') { document.dispatchEvent(new CustomEvent('clientmodal:open')); return; }
        if ($client.value !== id) {
            $client.value = id;
            $client.dispatchEvent(new Event('change'));
        }
        $clientInput?.blur();
    };
    if ($clientInput && $clientDrop) {
        const openClients = (all = false) => {
            clientResults = clientSearch(all ? '' : $clientInput.value);
            clientActive = clientResults.length ? 0 : -1;
            paintClients();
        };
        $clientInput.addEventListener('focus', () => { $clientInput.select(); openClients(true); });
        $clientInput.addEventListener('input', () => openClients());
        $clientInput.addEventListener('keydown', (e) => {
            const max = clientResults.length; // la fila "crear" es el índice max
            if (e.key === 'ArrowDown') { e.preventDefault(); if ($clientDrop.hidden) openClients(); else { clientActive = Math.min(clientActive + 1, max); paintClients(); } }
            else if (e.key === 'ArrowUp') { e.preventDefault(); clientActive = Math.max(clientActive - 1, 0); paintClients(); }
            else if (e.key === 'Enter') {
                e.preventDefault();
                if (clientActive >= 0) chooseClient(clientActive === max ? '__NEW__' : clientResults[clientActive]?.value);
            } else if (e.key === 'Escape' || e.key === 'Tab') closeClients();
        });
        $clientDrop.addEventListener('mousedown', (e) => e.preventDefault());
        $clientDrop.addEventListener('click', (e) => {
            const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-cid]');
            if (btn) chooseClient(btn.dataset.cid);
        });
        document.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('.client-combo') && !$clientDrop.hidden) closeClients(); });
    }

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
    $due?.addEventListener('change', () => { markDirty(); syncSumTerms(); });
    $<HTMLSelectElement>('deValidity')?.addEventListener('change', syncSumTerms);

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
            fieldError($clientInput, isQuote ? T.needClientQuote : T.needClientInvoice);
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
        clearTimeout(autosaveTimer);
        clearLocal();
        if (msg) { try { sessionStorage.setItem('cord.flash', JSON.stringify({ msg, type: 'ok' })); } catch { /* sin flash */ } }
        window.location.href = url;
    };

    async function saveQuote(send: boolean) {
        if (busy) return;
        if (!validate({ needClient: send })) return;
        lock(true);
        clearTimeout(autosaveTimer);
        await autosaving;
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
        clearTimeout(autosaveTimer);
        await autosaving;
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
        if (sendEmail && !clientEmail()) { fieldError($clientInput, T.needEmail); return; }
        pendingSend = sendEmail;
        const set = (id: string, v: string) => { const el = $(id); if (el) el.textContent = v; };
        set('deConfirmClient', clientOption()?.textContent?.trim() || '…');
        set('deConfirmTotal', fmt(lastTotal));
        let due = T.noDate;
        if ($due?.value) {
            const [y, m, d] = $due.value.split('-').map(Number);
            try { due = new Intl.DateTimeFormat(T.intl, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d)); }
            catch { due = $due.value; }
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

    // Atajos (regla 16: en móvil no hay atajos).
    //   ⌘/Ctrl+Enter → la acción principal · ⌘/Ctrl+S → guardar borrador
    //   /            → al buscador del catálogo, si no se está escribiendo
    const typing = (el: Element | null) => !!el && (el.matches('input, textarea, select') || (el as HTMLElement).isContentEditable);
    document.addEventListener('keydown', (e) => {
        // El confirm de la app no es un <dialog>: se mira aparte, o ⌘Enter
        // enviaba el documento con la pregunta todavía en pantalla.
        if (isMobile() || document.querySelector('dialog[open]') || document.querySelector('#cordConfirm:not([hidden])')) return;
        const mod = e.metaKey || e.ctrlKey;
        if (mod && e.key === 'Enter') {
            e.preventDefault();
            root.querySelector<HTMLButtonElement>('[data-save][data-primary]')?.click();
        } else if (mod && (e.key === 's' || e.key === 'S')) {
            const draftBtn = root.querySelector<HTMLButtonElement>('[data-save="draft"], [data-save="invoice-draft"]');
            if (!draftBtn) return;
            e.preventDefault();
            draftBtn.click();
        } else if (e.key === '/' && !mod && !e.altKey && !typing(document.activeElement)) {
            e.preventDefault();
            $search?.focus();
        }
    });

    // Móvil: la barra fija replica la acción principal.
    root.querySelector('[data-proxy-primary]')?.addEventListener('click', () => {
        root.querySelector<HTMLButtonElement>('[data-save][data-primary]')?.click();
    });
    // Se retira cuando el resumen ya está a la vista: dos botones iguales a la
    // vez se leen como dos acciones distintas.
    const $mobilebar = root.querySelector<HTMLElement>('.de-mobilebar');
    const $summary = root.querySelector('.ed-summary');
    if ($mobilebar && $summary && 'IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => {
            $mobilebar.toggleAttribute('data-off', entry.isIntersecting);
        }, { threshold: 0.35 }).observe($summary);
    }

    // ── IA plegable ─────────────────────────────────────────────────────────
    const $ai = $('deAi');
    $('deAiToggle')?.addEventListener('click', () => {
        if (!$ai) return;
        const open = $ai.hasAttribute('data-collapsed');
        $ai.toggleAttribute('data-collapsed', !open);
        // Una vez abierta a mano, el botón se queda para volver a plegarla.
        $ai.setAttribute('data-expanded-once', '');
        $('deAiToggle')?.setAttribute('aria-expanded', String(open));
        if (open) $aiText?.focus();
    });

    // ── Vista previa ────────────────────────────────────────────────────────
    // Lo que verá el cliente, con la marca del negocio, desde el estado actual
    // (sin guardar nada). El PDF final lo arma el servidor con la plantilla.
    const $preview = $<HTMLDialogElement>('dePreview');
    function previewHtml() {
        const b = boot.brand || { nombre: '', logoUrl: null, color: null };
        const s = summarize(lines, { ivaIncluido: !!$ivaIncl?.checked, retenciones: boot.retenciones, roundLinesTo: roundLinesTo() });
        const cliente = clientOption();
        const today = new Intl.DateTimeFormat(T.intl, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
        const folio = boot.doc.reservedFolio || boot.doc.folio || T.previewDraft;
        const cond = isQuote
            ? tpl(T.previewValidTpl, { n: Number($<HTMLSelectElement>('deValidity')?.value) || 30 })
            : (dueText() ? tpl(T.previewDueTpl, { fecha: dueText() }) : '');
        const color = /^#[0-9a-f]{3,8}$/i.test(String(b.color || '')) ? String(b.color) : '';
        const logo = b.logoUrl
            ? `<img class="dd-logo" src="${escapeHtml(b.logoUrl)}" alt="" />`
            : `<span class="dd-initial" aria-hidden="true">${escapeHtml((b.nombre || '·').trim().charAt(0).toUpperCase())}</span>`;
        const rows = lines.map((l) => {
            const p = unitPrice(l);
            const struck = l.productoId && l.negociado !== null && l.negociado < l.lista;
            return `<tr>
                <td><b>${escapeHtml(l.nombre || T.lineUnnamed)}</b><small>${escapeHtml(l.unidad)}</small></td>
                <td class="num">${escapeHtml(numText(l.cantidad))}</td>
                <td class="num">${struck ? `<s>${fmt(l.lista)}</s> ` : ''}${fmt(p)}</td>
                <td class="num">${fmt(lineAmount(l))}</td>
            </tr>`;
        }).join('');
        const notas = ($<HTMLTextAreaElement>('deNotes')?.value || '').trim();
        return `
            <header class="dd-head"${color ? ` style="--dd-accent:${color}"` : ''}>
                <div class="dd-brand">${logo}<span><b>${escapeHtml(b.nombre)}</b>${b.taxId ? `<small>${escapeHtml(`${b.taxIdLabel || ''} ${b.taxId}`.trim())}</small>` : ''}</span></div>
                <div class="dd-meta"><span>${escapeHtml(isQuote ? T.docQuote : T.docInvoice)}</span><b>${escapeHtml(folio)}</b><small>${escapeHtml(today)}</small></div>
            </header>
            <section class="dd-parties">
                <div><small>${escapeHtml(T.previewFor)}</small><b>${escapeHtml(cliente?.textContent?.trim() || T.previewNoClient)}</b>${cliente?.dataset.email ? `<span>${escapeHtml(cliente.dataset.email)}</span>` : ''}</div>
                ${cond ? `<div class="dd-cond"><small>${escapeHtml(isQuote ? T.validity : T.dueDate)}</small><b>${escapeHtml(cond)}</b></div>` : ''}
            </section>
            <table class="dd-lines">
                <thead><tr><th>${escapeHtml(T.thConcept)}</th><th class="num">${escapeHtml(T.thQty)}</th><th class="num">${escapeHtml(T.thPrice)}</th><th class="num">${escapeHtml(T.thAmount)}</th></tr></thead>
                <tbody>${rows || `<tr><td colspan="4" class="dd-empty">${escapeHtml(T.addLinesHint)}</td></tr>`}</tbody>
            </table>
            <dl class="dd-totals">
                <div><dt>${escapeHtml(T.subtotal)}</dt><dd>${fmt(s.subtotal)}</dd></div>
                ${s.taxes.map((t) => `<div><dt>${escapeHtml(boot.taxLabel)} ${Math.round(t.tasa * 10000) / 100}%</dt><dd>${fmt(t.impuesto)}</dd></div>`).join('')}
                ${s.retenciones.map((r) => `<div><dt>${escapeHtml(r.nombre)}</dt><dd>−${fmt(r.monto)}</dd></div>`).join('')}
                <div class="dd-total"><dt>${escapeHtml(T.total)}</dt><dd>${fmt(s.total)} <small>${escapeHtml(currency)}</small></dd></div>
            </dl>
            ${notas ? `<p class="dd-notes">${escapeHtml(notas)}</p>` : ''}`;
    }
    $('dePreviewBtn')?.addEventListener('click', () => {
        const doc = $('dePreviewDoc');
        if (!doc || !$preview) return;
        doc.innerHTML = previewHtml();
        // Sin logo servible (organización de prueba, archivo dañado) queda la inicial.
        doc.querySelector<HTMLImageElement>('.dd-logo')?.addEventListener('error', (e) => {
            const img = e.currentTarget as HTMLImageElement;
            const initial = document.createElement('span');
            initial.className = 'dd-initial';
            initial.textContent = (boot.brand?.nombre || '·').trim().charAt(0).toUpperCase();
            img.replaceWith(initial);
        }, { once: true });
        $preview.showModal();
    });
    $preview?.addEventListener('click', (e) => {
        // Cerrar con la X o tocando fuera de la hoja.
        if ((e.target as HTMLElement).closest('[data-close]') || e.target === $preview) $preview.close();
    });

    // ── Autoguardado y copia local ──────────────────────────────────────────
    // Un borrador que ya existe se guarda solo, unos segundos después del
    // último cambio. Un documento nuevo NO se crea por su cuenta (cada
    // cotización cuenta contra el límite del plan): se guarda una copia en
    // este navegador y se ofrece recuperarla si la pestaña se cerró.
    const $saveState = $('deSaveState');
    const LOCAL_KEY = `cord.editor.${kind}.new`;
    let autosaveTimer = 0;
    let autosaving: Promise<void> | null = null;
    const setSaveState = (text: string, tone: 'ok' | 'busy' | 'warn' = 'ok') => {
        if (!$saveState) return;
        $saveState.textContent = text;
        $saveState.dataset.tone = tone;
        $saveState.hidden = !text;
    };
    const canAutosave = () => !!docId && mode === 'draft' && !busy && lines.length > 0
        && !firstInvalidLine(lines) && (isQuote || !!clientOption());
    function scheduleAutosave() {
        clearTimeout(autosaveTimer);
        if (mode === 'new') { autosaveTimer = window.setTimeout(saveLocal, 800); return; }
        if (mode !== 'draft') return;
        autosaveTimer = window.setTimeout(() => { autosaving = autosave(); }, 2500);
    }
    async function autosave() {
        if (!canAutosave()) return;
        setSaveState(T.autosaving, 'busy');
        try {
            const res = await fetch(isQuote ? `/api/cotizaciones/${docId}` : `/api/facturas/${docId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(isQuote ? { ...quotePayload(false), action: 'update_draft' } : { action: 'update_draft', ...invoicePayload() }),
            });
            if (!res.ok) throw new Error();
            dirty = false;
            setSaveState(tpl(T.autosavedTpl, { hora: new Intl.DateTimeFormat(T.intl, { hour: 'numeric', minute: '2-digit' }).format(new Date()) }));
        } catch {
            setSaveState(T.autosaveFailed, 'warn');
        } finally {
            autosaving = null;
        }
    }
    const snapshotLines = (): BootLine[] => lines.map((l) => ({
        productoId: l.productoId, nombre: l.nombre, unidad: l.unidad, cantidad: l.cantidad,
        lista: l.lista, negociado: l.productoId ? l.negociado : null, taxRate: l.taxRate,
    }));
    function saveLocal() {
        try {
            if (!lines.length) { localStorage.removeItem(LOCAL_KEY); return; }
            localStorage.setItem(LOCAL_KEY, JSON.stringify({
                ts: Date.now(), clienteId: clientOption()?.value || null, term: currentTerm(),
                notas: $<HTMLTextAreaElement>('deNotes')?.value || '', lines: snapshotLines(),
            }));
        } catch { /* sin almacenamiento local: no hay copia, nada se rompe */ }
    }
    const clearLocal = () => { try { localStorage.removeItem(LOCAL_KEY); } catch { /* nada */ } };
    async function offerLocalRestore() {
        if (mode !== 'new' || boot.doc.lines.length) return;
        let saved: any = null;
        try { saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch { return; }
        if (!saved || !Array.isArray(saved.lines) || !saved.lines.length) return;
        if (Date.now() - Number(saved.ts) > 7 * 86400000) { clearLocal(); return; }
        const fecha = new Intl.DateTimeFormat(T.intl, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(saved.ts));
        const ok = await (window as any).cordConfirm?.({
            title: T.restoreTitle,
            body: tpl(T.restoreBodyTpl, { n: saved.lines.length, lineas: saved.lines.length === 1 ? T.line : T.lines, fecha }),
            confirmText: T.restore, cancelText: T.discard,
        });
        if (!ok) { clearLocal(); return; }
        if (saved.clienteId && $client && [...$client.options].some((o) => o.value === saved.clienteId)) {
            $client.value = saved.clienteId;
            $client.dispatchEvent(new Event('change'));
        }
        if (saved.term) setTerm(saved.term);
        const notes = $<HTMLTextAreaElement>('deNotes');
        if (notes && saved.notas) notes.value = saved.notas;
        lines.push(...saved.lines.map(fromBoot));
        render();
        lines.forEach(loadPricing);
        markDirty();
    }

    // Salir con cambios sin guardar pregunta antes (el navegador pone el texto).
    window.addEventListener('beforeunload', (e) => {
        if (!dirty || busy) return;
        e.preventDefault();
        e.returnValue = T.leaveWarning;
    });

    // ── Arranque ────────────────────────────────────────────────────────────
    if (boot.doc.clienteId && $client && [...$client.options].some((o) => o.value === boot.doc.clienteId)) {
        $client.value = boot.doc.clienteId;
        // B2B sin repreciar: los precios del borrador ya son los que se guardaron.
        loadB2B(boot.doc.clienteId, false);
    }
    reflectDiscount();
    reflectClientMeta();
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
    clearTimeout(autosaveTimer);
    offerLocalRestore();
}

// Pequeño helper para el `<script>` del componente.
export function bootDocumentEditor() {
    const root = document.querySelector<HTMLElement>('[data-editor][data-document-editor]');
    const raw = document.getElementById('deBoot')?.textContent;
    if (!root || !raw) return;
    mountDocumentEditor(root, JSON.parse(raw));
}
