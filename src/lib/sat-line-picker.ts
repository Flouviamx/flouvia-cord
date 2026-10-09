// Clave SAT por línea en los editores de cotización y factura (solo México).
//
// Antes una línea solo podía timbrarse con claves reales si venía de un
// producto clasificado en el catálogo: una línea libre ("Consultoría de marzo",
// "Flete") salía siempre como 01010101, sin que el editor lo dijera. Esta
// sub-fila bajo cada concepto muestra la clave con la que se va a timbrar,
// avisa cuando caería en la genérica y deja elegirla con la misma búsqueda del
// catálogo del SAT que usa el modal de producto (/api/fiscal/catalogo-sat).
//
// Un solo constructor para los tres editores (nueva factura, nueva cotización,
// editar cotización): con uno por pantalla, tarde o temprano alguno se queda
// sin el aviso o manda la clave con otro nombre. El editor guarda en cada línea
// `productKey`/`unitKey` y los manda como `clave_sat`/`clave_unidad_sat`; el
// servidor las valida y la de la línea gana sobre la del producto al timbrar.

import { DEFAULT_PRODUCT_KEY, SAT_UNITS, isProductKey, isUnitKey, satUnitForUnit } from './fiscal/sat-claves';

export interface SatLineFields {
    productKey?: string | null;
    unitKey?: string | null;
}

export interface SatPickerI18n {
    etiqueta: string;
    sinClave: string;
    avisoGenerica: string;
    editar: string;
    producto: string;
    unidad: string;
    placeholder: string;
    buscando: string;
    sinResultados: string;
    noDisponible: string;
    formatoProducto: string;
    formatoUnidad: string;
    aplicar: string;
    quitar: string;
}

/** Claves con las que nace una línea agregada desde un producto del catálogo. */
export function satKeysFromProduct(p: { claveSat?: unknown; claveUnidadSat?: unknown; unidad?: unknown } | null | undefined): { productKey: string | null; unitKey: string | null } {
    const pk = typeof p?.claveSat === 'string' && isProductKey(p.claveSat) ? p.claveSat : null;
    const uk = typeof p?.claveUnidadSat === 'string' && isUnitKey(p.claveUnidadSat)
        ? p.claveUnidadSat
        : satUnitForUnit(p?.unidad);
    return { productKey: pk, unitKey: uk && isUnitKey(uk) ? uk : null };
}

/** Cuántas líneas se timbrarían con la clave genérica 01010101. */
export function genericKeyCount(lines: SatLineFields[]): number {
    return lines.filter((l) => !l.productKey || l.productKey === DEFAULT_PRODUCT_KEY).length;
}

/** Campos del contrato HTTP. `undefined` = la línea no trae clave propia. */
export function satPayload(l: SatLineFields): { clave_sat?: string; clave_unidad_sat?: string } {
    return {
        ...(l.productKey ? { clave_sat: l.productKey } : {}),
        ...(l.unitKey ? { clave_unidad_sat: l.unitKey } : {}),
    };
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);

const DATALIST_ID = 'cordSatUnits';

function ensureUnitsDatalist(): void {
    if (typeof document === 'undefined' || document.getElementById(DATALIST_ID)) return;
    const dl = document.createElement('datalist');
    dl.id = DATALIST_ID;
    dl.innerHTML = SAT_UNITS.map((u) => `<option value="${esc(u.clave)}">${esc(u.nombre)}</option>`).join('');
    document.body.appendChild(dl);
}

/**
 * Crea el selector sobre el contenedor de líneas del editor. `rowHtml` se llama
 * desde el render del editor, justo después de cada `.line-row`; los eventos se
 * delegan en el contenedor, así que sobreviven a cada re-render.
 */
export function createSatLinePicker(opts: {
    container: HTMLElement;
    getLine: (idx: number) => SatLineFields | undefined;
    onChange?: (idx: number) => void;
    i18n: SatPickerI18n;
}) {
    const T = opts.i18n;
    let openIdx = -1;
    let timer = 0;
    let seq = 0;
    ensureUnitsDatalist();

    const rowHtml = (line: SatLineFields, idx: number): string => {
        const generica = !line.productKey || line.productKey === DEFAULT_PRODUCT_KEY;
        const chip = line.productKey
            ? `${esc(line.productKey)}${line.unitKey ? ` · ${esc(line.unitKey)}` : ''}`
            : `${esc(T.sinClave)}${line.unitKey ? ` · ${esc(line.unitKey)}` : ''}`;
        const panel = openIdx === idx ? `
            <div class="sat-edit" data-sat-idx="${idx}">
                <label class="sat-field">
                    <span>${esc(T.producto)}</span>
                    <input type="text" class="sat-pk" data-sat-idx="${idx}" value="${esc(line.productKey ?? '')}"
                        inputmode="search" autocomplete="off" placeholder="${esc(T.placeholder)}" />
                </label>
                <label class="sat-field sat-field-unit">
                    <span>${esc(T.unidad)}</span>
                    <input type="text" class="sat-uk" data-sat-idx="${idx}" value="${esc(line.unitKey ?? '')}"
                        list="${DATALIST_ID}" autocomplete="off" maxlength="3" placeholder="H87" />
                </label>
                <ul class="sat-sug" role="listbox" hidden></ul>
                <p class="sat-msg" aria-live="polite"></p>
                <div class="sat-actions">
                    <button type="button" class="sat-clear" data-sat-idx="${idx}">${esc(T.quitar)}</button>
                    <button type="button" class="sat-apply" data-sat-idx="${idx}">${esc(T.aplicar)}</button>
                </div>
            </div>` : '';
        return `<div class="sat-row${generica ? ' is-generic' : ''}" data-sat-idx="${idx}">
            <span class="sat-lbl">${esc(T.etiqueta)}</span>
            <button type="button" class="sat-chip" data-sat-idx="${idx}" aria-expanded="${openIdx === idx}" aria-label="${esc(T.editar)}">${chip}</button>
            ${generica ? `<span class="sat-warn">${esc(T.avisoGenerica)}</span>` : ''}
            ${panel}
        </div>`;
    };

    const repaint = (idx: number) => {
        const row = opts.container.querySelector<HTMLElement>(`.sat-row[data-sat-idx="${idx}"]`);
        const line = opts.getLine(idx);
        if (!row || !line) return;
        row.outerHTML = rowHtml(line, idx);
        if (openIdx === idx) opts.container.querySelector<HTMLInputElement>(`.sat-pk[data-sat-idx="${idx}"]`)?.focus();
    };

    const panelOf = (el: Element) => el.closest('.sat-edit') as HTMLElement | null;
    const say = (panel: HTMLElement | null, msg: string) => {
        const p = panel?.querySelector('.sat-msg');
        if (p) p.textContent = msg;
    };

    const search = async (panel: HTMLElement, q: string) => {
        const list = panel.querySelector<HTMLElement>('.sat-sug');
        if (!list) return;
        const mine = ++seq;
        list.hidden = false;
        list.innerHTML = `<li class="sat-sug-empty">${esc(T.buscando)}</li>`;
        try {
            const res = await fetch(`/api/fiscal/catalogo-sat?tipo=productos&q=${encodeURIComponent(q)}`);
            const body = await res.json().catch(() => ({}));
            if (mine !== seq) return;
            if (!res.ok || body.disponible === false) { list.innerHTML = `<li class="sat-sug-empty">${esc(T.noDisponible)}</li>`; return; }
            const data: { clave: string; descripcion: string }[] = Array.isArray(body.data) ? body.data : [];
            list.innerHTML = data.length
                ? data.slice(0, 8).map((r) => `<li><button type="button" class="sat-opt" data-clave="${esc(r.clave)}"><b>${esc(r.clave)}</b> ${esc(r.descripcion)}</button></li>`).join('')
                : `<li class="sat-sug-empty">${esc(T.sinResultados)}</li>`;
        } catch {
            if (mine === seq) list.innerHTML = `<li class="sat-sug-empty">${esc(T.noDisponible)}</li>`;
        }
    };

    opts.container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const chip = target.closest('.sat-chip') as HTMLElement | null;
        if (chip) {
            const idx = Number(chip.dataset.satIdx);
            const prev = openIdx;
            openIdx = openIdx === idx ? -1 : idx;
            if (prev >= 0 && prev !== idx) repaint(prev);
            repaint(idx);
            return;
        }
        const opt = target.closest('.sat-opt') as HTMLElement | null;
        if (opt) {
            const panel = panelOf(opt);
            const input = panel?.querySelector<HTMLInputElement>('.sat-pk');
            if (input) input.value = opt.dataset.clave ?? '';
            const list = panel?.querySelector<HTMLElement>('.sat-sug');
            if (list) list.hidden = true;
            return;
        }
        const apply = target.closest('.sat-apply') as HTMLElement | null;
        const clear = target.closest('.sat-clear') as HTMLElement | null;
        if (!apply && !clear) return;
        const idx = Number((apply || clear)!.dataset.satIdx);
        const line = opts.getLine(idx);
        if (!line) return;
        if (clear) {
            line.productKey = null;
            line.unitKey = null;
        } else {
            const panel = panelOf(apply!);
            const pk = String(panel?.querySelector<HTMLInputElement>('.sat-pk')?.value ?? '').replace(/\s/g, '');
            const uk = String(panel?.querySelector<HTMLInputElement>('.sat-uk')?.value ?? '').trim().toUpperCase();
            if (pk && !isProductKey(pk)) { say(panel, T.formatoProducto); return; }
            if (uk && !isUnitKey(uk)) { say(panel, T.formatoUnidad); return; }
            line.productKey = pk || null;
            line.unitKey = uk || null;
        }
        openIdx = -1;
        repaint(idx);
        opts.onChange?.(idx);
    });

    opts.container.addEventListener('input', (e) => {
        const el = e.target as HTMLInputElement;
        if (!el.classList?.contains('sat-pk')) return;
        const panel = panelOf(el);
        if (!panel) return;
        say(panel, '');
        window.clearTimeout(timer);
        const v = el.value.trim();
        const list = panel.querySelector<HTMLElement>('.sat-sug');
        // Ocho dígitos ya son una clave: no hay nada que buscar.
        if (v.length < 2 || /^\d+$/.test(v)) { if (list) list.hidden = true; seq++; return; }
        timer = window.setTimeout(() => search(panel, v), 250);
    });

    opts.container.addEventListener('keydown', (e) => {
        const el = e.target as HTMLElement;
        if (!el.closest('.sat-edit')) return;
        // Enter dentro del panel aplica, no envía el formulario del editor.
        if ((e as KeyboardEvent).key === 'Enter') {
            e.preventDefault();
            (panelOf(el)?.querySelector('.sat-apply') as HTMLButtonElement | null)?.click();
        } else if ((e as KeyboardEvent).key === 'Escape') {
            const idx = openIdx;
            openIdx = -1;
            if (idx >= 0) repaint(idx);
        }
    });

    return {
        rowHtml,
        /** Al quitar o reordenar líneas los índices se corren: el panel abierto se cierra. */
        close() { openIdx = -1; },
    };
}
