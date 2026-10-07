// Miniaturas de la biblioteca de widgets.
//
// Antes la biblioteca clonaba la tarjeta viva y la encogía a 0.22–0.34×: el texto
// salía borroso y las gráficas que todavía no se habían montado (o estaban ocultas)
// salían en blanco. Aquí la miniatura se DIBUJA a partir de los mismos datos que
// la tarjeta ya trae en su markup (data-items, data-points, data-steps, …), así
// que es nítida, se ve aunque el widget esté oculto y nunca hereda ids ni
// bindings de la página.
//
// Todo texto que viene de datos del negocio entra con textContent; el SVG se arma
// con createElementNS y solo recibe números y colores validados.

const NS = 'http://www.w3.org/2000/svg';
const W = 160;
const H = 84;
const COLOR_RE = /^(#[0-9a-f]{3,8}|var\(--[a-z0-9-]+(,\s*[^()]+)?\)|rgba?\([\d.,\s%]+\))$/i;

type Row = { label: string; value: number; color?: string };

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
}
function root(): SVGSVGElement {
    return svg('svg', { viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', preserveAspectRatio: 'none', class: 'wlib-svg' }) as SVGSVGElement;
}
function json<T>(raw: string | undefined, fallback: T): T {
    if (!raw) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
}
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const safeColor = (c: unknown, fallback = 'var(--wlib-accent)') => (typeof c === 'string' && COLOR_RE.test(c.trim()) ? c.trim() : fallback);
const div = (cls: string, text?: string) => { const el = document.createElement('div'); el.className = cls; if (text !== undefined) el.textContent = text; return el; };

/** Muestra hasta `n` puntos repartidos, para que 365 días quepan en 160 px. */
function sample(values: number[], n: number) {
    if (values.length <= n) return values;
    const step = values.length / n;
    return Array.from({ length: n }, (_, i) => values[Math.floor(i * step)]);
}

function line(values: number[], area = true): SVGSVGElement {
    const s = root();
    const v = sample(values.length ? values : [2, 3, 2.5, 4, 3.5, 5, 4.6, 6], 40);
    const max = Math.max(1e-9, ...v), min = Math.min(0, ...v);
    const pts = v.map((y, i) => [6 + (i / Math.max(1, v.length - 1)) * (W - 12), H - 8 - ((y - min) / (max - min || 1)) * (H - 20)]);
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    if (area) s.appendChild(svg('path', { d: `${d} L${W - 6} ${H - 4} L6 ${H - 4} Z`, fill: 'var(--wlib-accent)', opacity: 0.12 }));
    s.appendChild(svg('path', { d, fill: 'none', stroke: 'var(--wlib-accent)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }));
    return s;
}

function bars(values: number[]): SVGSVGElement {
    const s = root();
    const v = sample(values.length ? values : [3, 5, 4, 7, 6, 8, 5], 12);
    const max = Math.max(1e-9, ...v);
    const gap = 4, bw = (W - 12 - gap * (v.length - 1)) / v.length;
    v.forEach((y, i) => {
        const h = Math.max(3, (y / max) * (H - 14));
        s.appendChild(svg('rect', { x: 6 + i * (bw + gap), y: H - 4 - h, width: bw, height: h, rx: Math.min(4, bw / 2), fill: 'var(--wlib-accent)', opacity: 0.35 + 0.65 * (y / max) }));
    });
    return s;
}

function combo(): SVGSVGElement {
    const s = bars([4, 6, 5, 7, 6, 8, 7, 9]);
    const v = [3, 4.5, 4, 6, 5.5, 7, 6.8, 8.2];
    const max = 9;
    const d = v.map((y, i) => `${i ? 'L' : 'M'}${(6 + (i + 0.5) * ((W - 12) / v.length)).toFixed(1)} ${(H - 4 - (y / max) * (H - 14)).toFixed(1)}`).join(' ');
    s.appendChild(svg('path', { d, fill: 'none', stroke: 'var(--color-text)', 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: 0.7, 'vector-effect': 'non-scaling-stroke' }));
    return s;
}

function funnel(rows: Row[]): SVGSVGElement {
    const s = root();
    const r = rows.length ? rows.slice(0, 4) : [10, 7, 4, 2].map((value) => ({ label: '', value }));
    const max = Math.max(1e-9, ...r.map((x) => x.value));
    const bh = (H - 8 - 4 * (r.length - 1)) / r.length;
    r.forEach((row, i) => {
        const w = Math.max(12, (row.value / max) * (W - 12));
        s.appendChild(svg('rect', { x: (W - w) / 2, y: 4 + i * (bh + 4), width: w, height: bh, rx: 4, fill: 'var(--wlib-accent)', opacity: 1 - i * 0.18 }));
    });
    return s;
}

function segbar(rows: Row[]): HTMLElement {
    const wrap = div('wlib-seg');
    const total = rows.reduce((a, r) => a + Math.max(0, r.value), 0);
    const bar = div('wlib-seg-bar');
    const list = total > 0 ? rows.filter((r) => r.value > 0) : [{ label: '', value: 1, color: 'var(--color-border)' }];
    list.forEach((r) => {
        const seg = div('wlib-seg-part');
        seg.style.flexGrow = String(total > 0 ? r.value : 1);
        seg.style.background = safeColor(r.color);
        bar.appendChild(seg);
    });
    wrap.appendChild(bar);
    const legend = div('wlib-seg-legend');
    rows.filter((r) => r.label).slice(0, 3).forEach((r) => {
        const item = div('wlib-seg-item');
        const dot = document.createElement('i'); dot.style.background = safeColor(r.color);
        const txt = document.createElement('span'); txt.textContent = r.label;
        item.append(dot, txt); legend.appendChild(item);
    });
    wrap.appendChild(legend);
    return wrap;
}

function donut(rows: Row[]): HTMLElement {
    const wrap = div('wlib-donut');
    const s = svg('svg', { viewBox: '0 0 42 42', 'aria-hidden': 'true', class: 'wlib-donut-svg' });
    const total = rows.reduce((a, r) => a + Math.max(0, r.value), 0);
    const C = 2 * Math.PI * 15.9;
    s.appendChild(svg('circle', { cx: 21, cy: 21, r: 15.9, fill: 'none', stroke: 'var(--wlib-track)', 'stroke-width': 6 }));
    let offset = 0;
    if (total > 0) rows.filter((r) => r.value > 0).forEach((r) => {
        const len = (r.value / total) * C;
        s.appendChild(svg('circle', { cx: 21, cy: 21, r: 15.9, fill: 'none', stroke: safeColor(r.color), 'stroke-width': 6, 'stroke-dasharray': `${len} ${C - len}`, 'stroke-dashoffset': -offset, transform: 'rotate(-90 21 21)' }));
        offset += len;
    });
    wrap.appendChild(s);
    const legend = div('wlib-seg-legend wlib-seg-legend-col');
    rows.filter((r) => r.label).slice(0, 3).forEach((r) => {
        const item = div('wlib-seg-item');
        const dot = document.createElement('i'); dot.style.background = safeColor(r.color);
        const txt = document.createElement('span'); txt.textContent = r.label;
        item.append(dot, txt); legend.appendChild(item);
    });
    wrap.appendChild(legend);
    return wrap;
}

function hbars(rows: Row[]): HTMLElement {
    const wrap = div('wlib-hbars');
    const r = rows.slice(0, 4);
    const max = Math.max(1e-9, ...r.map((x) => x.value));
    (r.length ? r : [4, 3, 2].map((value) => ({ label: '', value }))).forEach((row) => {
        const line = div('wlib-hbar');
        const label = div('wlib-hbar-label', row.label || '');
        const track = div('wlib-hbar-track');
        const fill = div('wlib-hbar-fill');
        fill.style.width = `${Math.max(6, (row.value / max) * 100)}%`;
        track.appendChild(fill);
        line.append(label, track);
        wrap.appendChild(line);
    });
    return wrap;
}

function gauges(items: { value: number; max: number }[]): HTMLElement {
    const wrap = div('wlib-gauges');
    items.slice(0, 4).forEach(({ value, max }) => {
        const s = svg('svg', { viewBox: '0 0 42 42', 'aria-hidden': 'true', class: 'wlib-gauge' });
        const C = 2 * Math.PI * 16;
        const pct = Math.max(0, Math.min(1, max ? value / max : 0));
        s.appendChild(svg('circle', { cx: 21, cy: 21, r: 16, fill: 'none', stroke: 'var(--wlib-track)', 'stroke-width': 5 }));
        s.appendChild(svg('circle', { cx: 21, cy: 21, r: 16, fill: 'none', stroke: 'var(--wlib-accent)', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-dasharray': `${pct * C} ${C}`, transform: 'rotate(-90 21 21)' }));
        wrap.appendChild(s);
    });
    return wrap;
}

function listRows(w: HTMLElement): HTMLElement | null {
    const host = w.querySelector<HTMLElement>('.report-list, .quote-list, .feed, .silence-list, .task-list, .eq-summary-list, .cia-threads, .cbz-table-wrap, table');
    if (!host) return null;
    const rows = Array.from(host.querySelectorAll<HTMLElement>(':scope > a, :scope > div:not(.t-head), :scope > li, :scope .t-row, :scope tbody tr, :scope .quote-row, :scope .feed-item, :scope .silence-row, :scope .task-row'))
        .filter((r) => (r.textContent || '').trim())
        .slice(0, 3);
    const wrap = div('wlib-rows');
    if (!rows.length) {
        for (let i = 0; i < 3; i++) { const r = div('wlib-row is-ghost'); r.append(div('wlib-row-t'), div('wlib-row-v')); wrap.appendChild(r); }
        return wrap;
    }
    rows.forEach((r) => {
        const title = (r.querySelector('strong, .t-client, .q-client, .feed-text, .task-title') || r).textContent?.trim().replace(/\s+/g, ' ') || '';
        const value = r.querySelector('b, .t-amount, .editorial, .q-amount')?.textContent?.trim() || '';
        const line = div('wlib-row');
        line.append(div('wlib-row-t', title.slice(0, 42)), div('wlib-row-v', value));
        wrap.appendChild(line);
    });
    return wrap;
}

function kpi(w: HTMLElement, numEl: HTMLElement): HTMLElement {
    const wrap = div('wlib-kpi');
    const label = w.querySelector('.kpi-label')?.textContent?.trim() || '';
    if (label) wrap.appendChild(div('wlib-kpi-label', label));
    wrap.appendChild(div('wlib-kpi-num editorial', (numEl.textContent || '').trim().replace(/\s+/g, ' ')));
    const spark = w.querySelector<HTMLElement>('.kpi-spark, [data-chart="sparkline"]');
    const gauge = w.querySelector<HTMLElement>('.kpi-gauge, [data-chart="gauge"]');
    if (spark) {
        const values = json<number[]>(spark.dataset.values, []).map(num);
        const s = line(values, true); s.classList.add('wlib-kpi-spark'); wrap.appendChild(s);
    } else if (gauge) {
        const g = gauges([{ value: num(gauge.dataset.value), max: num(gauge.dataset.max) || 100 }]);
        g.classList.add('wlib-kpi-gauge'); wrap.appendChild(g);
    }
    return wrap;
}

/** Miniatura nítida de un widget, construida con sus propios datos. */
export function buildWidgetPreview(w: HTMLElement): HTMLElement {
    const thumb = div('wlib-thumb');
    const accent = getComputedStyle(w).getPropertyValue('--widget-accent').trim();
    thumb.style.setProperty('--wlib-accent', accent && COLOR_RE.test(accent) ? accent : 'var(--color-blue-deep)');

    const healthGauges = Array.from(w.querySelectorAll<HTMLElement>('.health-gauge'));
    if (healthGauges.length > 1) {
        thumb.appendChild(gauges(healthGauges.map((g) => ({ value: num(g.dataset.value), max: num(g.dataset.max) || 100 }))));
        return thumb;
    }

    const host = w.querySelector<HTMLElement>('[data-chart]:not([data-chart="sparkline"]):not([data-chart="gauge"]), .chart-host');
    const numEl = w.querySelector<HTMLElement>('.kpi-num, .report-kpi-value');
    if (numEl && (!host || host.matches('.kpi-spark, .kpi-gauge'))) { thumb.appendChild(kpi(w, numEl)); return thumb; }

    if (host) {
        const kind = host.dataset.chart || '';
        const items = json<any[]>(host.dataset.items, []).map((r) => ({ label: String(r.label ?? ''), value: num(r.value), color: r.color }));
        const steps = json<any[]>(host.dataset.steps, []).map((r) => ({ label: String(r.label ?? ''), value: num(r.value) }));
        const segs = json<any[]>(host.dataset.segments, []).map((r) => ({ label: String(r.label ?? ''), value: num(r.value), color: r.color }));
        const slices = json<any[]>(host.dataset.slices, []).map((r) => ({ label: String(r.label ?? ''), value: num(r.value), color: r.color }));
        const points = json<any[]>(host.dataset.points, []);
        if (kind === 'funnel' || host.dataset.steps) thumb.appendChild(funnel(steps));
        else if (kind === 'segbar' || host.dataset.segments) thumb.appendChild(segbar(segs));
        else if (kind === 'donut' || host.dataset.slices) thumb.appendChild(donut(slices));
        else if (kind === 'line' || host.dataset.points) {
            // Algunos hosts (el hero) guardan días con varias métricas: se dibuja la primera numérica.
            thumb.appendChild(line(points.map((p) => num(p?.y ?? p?.cerrado ?? p?.value))));
        }
        else if (kind === 'hbar') thumb.appendChild(hbars(items));
        else if (kind === 'bar' || host.dataset.items) thumb.appendChild(items.length > 6 || kind === 'bar' ? bars(items.map((r) => r.value)) : hbars(items));
        else thumb.appendChild(combo());
        return thumb;
    }

    const list = listRows(w);
    if (list) { thumb.appendChild(list); return thumb; }
    if (numEl) { thumb.appendChild(kpi(w, numEl)); return thumb; }

    thumb.appendChild(combo());
    thumb.classList.add('is-generic');
    return thumb;
}
