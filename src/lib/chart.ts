// Motor de gráficas interactivas — sin librerías externas (Chart.js/Recharts/D3 no están
// instaladas en el proyecto). SVG en píxeles reales + vanilla TS. La app NO carga GSAP dentro
// de /app/** (regla del proyecto) — toda animación aquí es CSS transitions o rAF directo.
//
// 9 tipos: mountLineChart (línea/área + serie de comparación punteada), mountComboChart
// (barras + línea, tendencia mensual), mountBarChart (barras verticales con ejes),
// mountHBarChart (barras horizontales, rankings), mountFunnel (embudo de conversión),
// mountDonut (dona con leyenda), mountSegBar (barra 100% segmentada), mountSparkline (mini
// línea sin ejes) y mountGauge (anillo de progreso).
//
// Reglas de diseño que este motor respeta al pie:
// - Colores SIEMPRE via var(--...) — nunca hex hardcodeado — así el modo oscuro es gratis.
// - "Cero degradados en gráficas": el área de un line chart usa un solo tono con
//   fill-opacity baja, NUNCA un <linearGradient> de dos stops. Las barras son 100% planas.
// - DOM inyectado en runtime (tooltip, tal cual el SVG) no lleva data-astro-cid-*, así que
//   sus estilos viven en <style is:global> en la página que lo usa (ver sistema-de-diseno.md).

export type ChartPoint = { x: string; y: number };

export interface ChartHandle {
    destroy(): void;
}

// ── Helpers compartidos ─────────────────────────────────────────────────────

export function reducedMotion(): boolean {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
}

function clear(el: HTMLElement) {
    el.querySelectorAll(':scope > svg, :scope > .chx-hbar, :scope > .chx-empty').forEach((n) => n.remove());
}

/** Un solo nodo de tooltip por contenedor de gráfica (se reutiliza, nunca se recrea por evento). */
function ensureTooltip(host: HTMLElement): HTMLElement {
    let tip = host.querySelector<HTMLElement>(':scope > .cd-tooltip');
    if (!tip) {
        tip = document.createElement('div');
        tip.className = 'cd-tooltip';
        host.appendChild(tip);
    }
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    tip.style.opacity = '0';
    return tip;
}

/** Posiciona el tooltip centrado sobre (px,py) relativo al host, con clamping a los bordes. */
function placeTooltip(tooltip: HTMLElement, host: HTMLElement, px: number, py: number, above = true) {
    const hostRect = host.getBoundingClientRect();
    // Medimos el tooltip ya con su contenido puesto (offsetWidth/Height reales).
    const tw = tooltip.offsetWidth || 120;
    const th = tooltip.offsetHeight || 40;
    let left = px - tw / 2;
    left = Math.max(4, Math.min(hostRect.width - tw - 4, left));
    let top = above ? py - th - 12 : py + 12;
    if (top < 4) top = py + 12; // si no cabe arriba, cae abajo
    if (top + th > hostRect.height - 4 && above) top = Math.max(4, py - th - 12);
    tooltip.style.transform = `translate(${left}px, ${top}px)`;
    tooltip.style.opacity = '1';
}

function hideTooltip(tooltip: HTMLElement) {
    tooltip.style.opacity = '0';
}

/** "Nice numbers" (Heckbert) — dominio y ticks redondos para el eje Y. Fuerza mínimo en 0
 * (convención de dashboards financieros: nunca truncar el eje para exagerar variación). */
function niceScale(maxRaw: number, tickCount = 4): { min: number; max: number; ticks: number[] } {
    // Serie enteramente en cero (ej. un rango de fechas sin cotizaciones): un solo tick en 0.
    // Así la gráfica se dibuja igual — ejes, fechas y línea plana en el piso — en vez de
    // quedar en blanco, y sin inventar un eje "0 / 0.5 / 1" que no significa nada.
    if (!(maxRaw > 0)) return { min: 0, max: 1, ticks: [0] };
    const max = Math.max(maxRaw, 1);
    const rawStep = max / (tickCount - 1);
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
    const norm = rawStep / mag;
    let niceNorm: number;
    if (norm <= 1) niceNorm = 1;
    else if (norm <= 2) niceNorm = 2;
    else if (norm <= 5) niceNorm = 5;
    else niceNorm = 10;
    const step = niceNorm * mag;
    const niceMax = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    for (let v = 0; v <= niceMax + step * 1e-6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    return { min: 0, max: niceMax, ticks };
}

/** Tangentes de Hermite con la corrección Fritsch–Carlson: garantiza que la curva NUNCA
 * rebasa (overshoot) los valores de sus puntos — a diferencia de Catmull-Rom, que dibujaría
 * una serie de dinero "bajando" por debajo de 0 entre dos puntos altos. */
function monotoneTangents(xs: number[], ys: number[]): number[] {
    const n = xs.length;
    const d: number[] = new Array(n - 1);
    const m: number[] = new Array(n);
    for (let i = 0; i < n - 1; i++) {
        const h = xs[i + 1] - xs[i];
        d[i] = h !== 0 ? (ys[i + 1] - ys[i]) / h : 0;
    }
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
        if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
        const a = m[i] / d[i], b = m[i + 1] / d[i];
        const s = a * a + b * b;
        if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return m;
}

/** Path SVG con curva monotone-cubic (Hermite→Bézier) — "montañitas" redondeadas en vez de
 * picos rectos, sin nunca cruzar por debajo/arriba de los valores reales. */
function smoothPath(xs: number[], ys: number[]): string {
    const n = xs.length;
    if (n === 0) return '';
    if (n === 1) return `M${xs[0].toFixed(2)},${ys[0].toFixed(2)}`;
    if (n === 2) return `M${xs[0].toFixed(2)},${ys[0].toFixed(2)} L${xs[1].toFixed(2)},${ys[1].toFixed(2)}`;
    const m = monotoneTangents(xs, ys);
    let d = `M${xs[0].toFixed(2)},${ys[0].toFixed(2)} `;
    for (let i = 0; i < n - 1; i++) {
        const h = xs[i + 1] - xs[i];
        const c1x = xs[i] + h / 3, c1y = ys[i] + (m[i] * h) / 3;
        const c2x = xs[i + 1] - h / 3, c2y = ys[i + 1] - (m[i + 1] * h) / 3;
        d += `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${xs[i + 1].toFixed(2)},${ys[i + 1].toFixed(2)} `;
    }
    return d.trim();
}

/** Marca el elemento activo con `is-focus` y sus hermanos con `is-dim` — el resto de la
 * gráfica se atenúa al pasar el cursor por una parte (patrón Stripe/Shopify). `clearAll`
 * quita ambas clases de todos. */
function makeDimGroup<T extends Element>(all: T[]) {
    return {
        focus(active: T) { all.forEach((el) => el.classList.toggle('is-dim', el !== active)); active.classList.add('is-focus'); },
        clear() { all.forEach((el) => el.classList.remove('is-dim', 'is-focus')); },
    };
}

function compactNumber(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1) + 'M';
    if (abs >= 1_000) return (n / 1000).toFixed(abs % 1000 === 0 ? 0 : 1) + 'k';
    return String(Math.round(n));
}

/** Observa tamaño real (px) del contenedor; llama a `draw(w,h)` en el primer layout y en
 * cada resize (vía rAF, sin apilar). Devuelve `disconnect()`. */
function observeSize(container: HTMLElement, draw: (w: number, h: number) => void): () => void {
    let raf = 0;
    const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const w = entry.contentRect.width;
        const h = entry.contentRect.height || container.clientHeight;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => { if (w > 0 && h > 0) draw(w, h); });
    });
    ro.observe(container);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
}

/** Difiere el montaje de una gráfica hasta que su contenedor entra en viewport — evita que
 * ~10 gráficas hagan trabajo de layout al cargar la página entera de una sola vez. */
export function onVisible(el: Element, cb: () => void) {
    if (typeof IntersectionObserver === 'undefined') { cb(); return; }
    const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { io.disconnect(); cb(); }
    }, { rootMargin: '120px' });
    io.observe(el);
}

function tooltipRow(dotColor: string | null, label: string, value: string, dashed = false): string {
    const dot = dotColor
        ? `<span class="cd-tt-dot${dashed ? ' cd-tt-dot-dash' : ''}" style="background:${dotColor}"></span>`
        : '';
    return `<div class="cd-tt-row">${dot}<span class="cd-tt-lbl">${label}</span><span class="cd-tt-val editorial">${value}</span></div>`;
}

function emptyState(container: HTMLElement, msg: string) {
    const div = document.createElement('div');
    div.className = 'chx-empty';
    div.textContent = msg;
    container.appendChild(div);
}

const isEmptySeries = (vals: number[]) => vals.every((v) => !v);

// ── 1. Line / Area chart — hero de ingreso ─────────────────────────────────

export interface LineChartOptions {
    points: ChartPoint[];
    comparePoints?: ChartPoint[]; // mismo largo que points, alineado por índice (día N de este periodo vs día N del anterior)
    height?: number;
    formatY?: (v: number) => string;
    formatYAxis?: (v: number) => string;
    formatX?: (x: string) => string;
    valueLabel?: string;
    compareLabel?: string;
    color?: string;
    ariaLabel?: string;
    emptyMessage?: string;
}
export interface LineChartHandle extends ChartHandle {
    setPoints(points: ChartPoint[], comparePoints?: ChartPoint[]): void;
}

export function mountLineChart(container: HTMLElement, opts: LineChartOptions): LineChartHandle {
    const height = opts.height ?? 240;
    const formatY = opts.formatY ?? ((v: number) => String(Math.round(v)));
    const formatYAxis = opts.formatYAxis ?? ((v: number) => compactNumber(v));
    const formatX = opts.formatX ?? ((x: string) => x);
    const color = opts.color ?? 'var(--chart-fill)';
    const valueLabel = opts.valueLabel ?? '';
    const compareLabel = opts.compareLabel ?? '';

    container.classList.add('cd-chart-wrap');
    clear(container);
    container.style.height = height + 'px';

    let points = opts.points.slice();
    let comparePoints = opts.comparePoints?.slice() ?? [];
    let disconnectRO = () => {};
    const tooltip = ensureTooltip(container);
    let activeIndex = -1;

    const PAD = { top: 14, right: 10, bottom: 24, left: 46 };
    const FLOOR = 5; // px que separan visualmente el valor 0 del borde inferior del plot
    let svg: SVGSVGElement | null = null;
    let gridG!: SVGGElement, areaPath!: SVGPathElement, linePath!: SVGPathElement, comparePath!: SVGPathElement,
        crosshair!: SVGLineElement, dotMain!: SVGCircleElement, dotCompare!: SVGCircleElement, xAxisG!: SVGGElement;
    let xs: number[] = [];
    let plotW = 0, plotH = 0;
    // Consolidados aquí (antes `showAt` recalculaba niceScale + reimplementaba yAt a mano en
    // cada movimiento del cursor — con la escala y el FLOOR nuevos eso habría desalineado el
    // crosshair/dot respecto a la curva real).
    let scaleMax = 1;
    let yAt = (v: number) => 0;

    function buildSkeleton() {
        svg = svgEl('svg', { role: 'img', tabindex: '0' });
        svg.style.display = 'block';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.touchAction = 'pan-y';
        gridG = svgEl('g', { class: 'chx-grid' });
        areaPath = svgEl('path', { fill: color, 'fill-opacity': 'var(--chart-area-opacity, 0.1)', stroke: 'none' });
        comparePath = svgEl('path', {
            fill: 'none', stroke: 'var(--chart-compare, var(--color-text-muted))', 'stroke-width': '1.75',
            'stroke-dasharray': '4 4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: '0.4',
        });
        linePath = svgEl('path', {
            fill: 'none', stroke: color, 'stroke-width': '2.25',
            'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        });
        crosshair = svgEl('line', { stroke: 'var(--color-border)', 'stroke-width': '1' });
        crosshair.style.opacity = '0';
        dotMain = svgEl('circle', { r: '4', fill: color, stroke: 'var(--surface)', 'stroke-width': '2' });
        dotMain.style.opacity = '0';
        dotCompare = svgEl('circle', { r: '3.5', fill: 'var(--surface)', stroke: 'var(--chart-compare, var(--color-text-muted))', 'stroke-width': '2' });
        dotCompare.style.opacity = '0';
        xAxisG = svgEl('g', { class: 'chx-xaxis' });
        svg.append(gridG, areaPath, comparePath, linePath, xAxisG, crosshair, dotMain, dotCompare);
        container.appendChild(svg);
        wireEvents();
    }

    function draw(w: number, h: number) {
        if (!svg) buildSkeleton();
        svg!.setAttribute('width', String(w));
        svg!.setAttribute('height', String(h));
        svg!.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svg!.setAttribute('aria-label', opts.ariaLabel ?? '');

        const n = points.length;
        // Solo se considera "vacío" cuando NO hay puntos. Una serie con puntos pero todos en
        // cero SÍ se dibuja (línea plana en el piso) — antes caía aquí y dejaba la tarjeta en
        // blanco, que es justo lo que se veía al elegir un rango sin cotizaciones.
        if (!n) {
            gridG.innerHTML = ''; xAxisG.innerHTML = '';
            areaPath.setAttribute('d', ''); linePath.setAttribute('d', ''); comparePath.setAttribute('d', '');
            if (!container.querySelector('.chx-empty')) emptyState(container, opts.emptyMessage ?? '');
            return;
        }
        container.querySelector('.chx-empty')?.remove();

        const maxY = Math.max(...points.map((p) => p.y), ...comparePoints.map((p) => p.y));
        const scale = niceScale(maxY, 4);
        scaleMax = scale.max;
        plotW = w - PAD.left - PAD.right;
        plotH = h - PAD.top - PAD.bottom;
        const usableH = plotH - FLOOR;

        const xAt = (i: number) => PAD.left + (n <= 1 ? plotW : (i / (n - 1)) * plotW);
        yAt = (v: number) => PAD.top + plotH - FLOOR - (v / scaleMax) * usableH;
        xs = points.map((_, i) => xAt(i));

        // Gridlines + labels de eje Y
        gridG.innerHTML = '';
        scale.ticks.forEach((t) => {
            const y = yAt(t);
            const line = svgEl('line', { x1: String(PAD.left), x2: String(w - PAD.right), y1: String(y), y2: String(y), stroke: 'var(--chart-grid)', 'stroke-width': '1' });
            gridG.appendChild(line);
            const label = svgEl('text', { x: String(PAD.left - 8), y: String(y), 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 'chx-axis-label' });
            label.textContent = formatYAxis(t);
            gridG.appendChild(label);
        });

        // Eje X: ~6 labels máximo
        xAxisG.innerHTML = '';
        const step = Math.max(1, Math.ceil(n / 6));
        for (let i = 0; i < n; i += step) {
            const label = svgEl('text', { x: String(xAt(i)), y: String(h - 6), 'text-anchor': i === 0 ? 'start' : i >= n - step ? 'end' : 'middle', class: 'chx-axis-label' });
            label.textContent = formatX(points[i].x);
            xAxisG.appendChild(label);
        }

        const pathFor = (vals: ChartPoint[]) => smoothPath(vals.map((_, i) => xAt(i)), vals.map((p) => yAt(p.y)));
        const mainD = pathFor(points);
        linePath.setAttribute('d', mainD);
        const baseY = PAD.top + plotH;
        areaPath.setAttribute('d', `${mainD} L${xAt(n - 1).toFixed(2)},${baseY} L${xAt(0).toFixed(2)},${baseY} Z`);
        comparePath.setAttribute('d', comparePoints.length ? pathFor(comparePoints) : '');

        if (!reducedMotion()) {
            const len = linePath.getTotalLength();
            linePath.style.transition = 'none';
            linePath.style.strokeDasharray = String(len);
            linePath.style.strokeDashoffset = String(len);
            linePath.getBoundingClientRect();
            linePath.style.transition = 'stroke-dashoffset 0.9s var(--ease-spring, cubic-bezier(0.22,1,0.36,1))';
            linePath.style.strokeDashoffset = '0';
        } else {
            linePath.style.strokeDasharray = 'none';
        }
        crosshair.setAttribute('y1', String(PAD.top));
        crosshair.setAttribute('y2', String(baseY));
        hide();
    }

    function nearestIndex(vbX: number): number {
        let lo = 0, hi = xs.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] < vbX) lo = mid + 1; else hi = mid; }
        if (lo > 0 && Math.abs(xs[lo - 1] - vbX) < Math.abs(xs[lo] - vbX)) return lo - 1;
        return lo;
    }

    function showAt(i: number) {
        if (i < 0 || i >= points.length) return;
        activeIndex = i;
        const p = points[i];
        const y = yAt(p.y);
        crosshair.setAttribute('x1', String(xs[i])); crosshair.setAttribute('x2', String(xs[i]));
        crosshair.style.opacity = '1';
        dotMain.setAttribute('cx', String(xs[i])); dotMain.setAttribute('cy', String(y));
        dotMain.style.opacity = '1';

        let html = `<div class="cd-tt-x">${formatX(p.x)}</div>`;
        html += tooltipRow(color, valueLabel, formatY(p.y));
        const cp = comparePoints[i];
        if (cp) {
            const cy2 = yAt(cp.y);
            dotCompare.setAttribute('cx', String(xs[i])); dotCompare.setAttribute('cy', String(cy2));
            dotCompare.style.opacity = '1';
            html += tooltipRow('var(--chart-compare, var(--color-text-muted))', compareLabel, formatY(cp.y), true);
            if (cp.y > 0) {
                const delta = Math.round(((p.y - cp.y) / cp.y) * 100);
                html += `<div class="cd-tt-delta ${delta >= 0 ? 'is-up' : 'is-down'}">${delta >= 0 ? '+' : ''}${delta}%</div>`;
            }
        } else {
            dotCompare.style.opacity = '0';
        }
        tooltip.innerHTML = html;
        placeTooltip(tooltip, container, xs[i], y);
    }
    function hide() {
        activeIndex = -1;
        crosshair.style.opacity = '0'; dotMain.style.opacity = '0'; dotCompare.style.opacity = '0';
        hideTooltip(tooltip);
    }

    let raf = 0;
    function onMove(clientX: number) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
            const rect = container.getBoundingClientRect();
            if (rect.width === 0 || !xs.length) return;
            const vbX = clientX - rect.left;
            showAt(nearestIndex(Math.max(PAD.left, Math.min(rect.width - PAD.right, vbX))));
        });
    }

    function wireEvents() {
        svg!.addEventListener('pointermove', (e) => onMove(e.clientX));
        svg!.addEventListener('pointerdown', (e) => onMove(e.clientX));
        svg!.addEventListener('pointerleave', hide);
        svg!.addEventListener('focus', () => showAt(points.length - 1));
        svg!.addEventListener('blur', hide);
        svg!.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') { e.preventDefault(); showAt(Math.min(points.length - 1, activeIndex < 0 ? 0 : activeIndex + 1)); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); showAt(Math.max(0, activeIndex < 0 ? points.length - 1 : activeIndex - 1)); }
            else if (e.key === 'Escape') hide();
        });
    }

    disconnectRO = observeSize(container, draw);

    return {
        setPoints(next, nextCompare) {
            points = next.slice();
            comparePoints = (nextCompare ?? []).slice();
            const rect = container.getBoundingClientRect();
            if (rect.width > 0) draw(rect.width, rect.height || height);
        },
        destroy() { disconnectRO(); container.innerHTML = ''; },
    };
}

// ── 2. Combo chart (barras + línea) — tendencia mensual ────────────────────

export interface ComboChartOptions {
    labels: string[];
    barValues: number[];
    lineValues: number[];
    barLabel: string;
    lineLabel: string;
    height?: number;
    formatY?: (v: number) => string;
    formatYAxis?: (v: number) => string;
    barColor?: string;
    lineColor?: string;
    emptyMessage?: string;
}

export function mountComboChart(container: HTMLElement, opts: ComboChartOptions): ChartHandle {
    const height = opts.height ?? 240;
    const formatY = opts.formatY ?? ((v: number) => String(Math.round(v)));
    const formatYAxis = opts.formatYAxis ?? ((v: number) => compactNumber(v));
    const barColor = opts.barColor ?? 'var(--chart-track-strong, var(--chart-track))';
    const lineColor = opts.lineColor ?? 'var(--chart-fill)';

    container.classList.add('cd-chart-wrap');
    clear(container);
    container.style.height = height + 'px';
    const tooltip = ensureTooltip(container);

    const PAD = { top: 14, right: 10, bottom: 24, left: 46 };
    const n = opts.labels.length;

    let svg: SVGSVGElement;
    const hitRects: SVGRectElement[] = [];

    function draw(w: number, h: number) {
        container.querySelectorAll('svg').forEach((s) => s.remove());
        hitRects.length = 0;
        // Igual que en mountLineChart: con datos en cero se dibuja la gráfica en el piso, no
        // un hueco en blanco. Solo sin ninguna columna se muestra el estado vacío.
        if (!n) {
            if (!container.querySelector('.chx-empty')) emptyState(container, opts.emptyMessage ?? '');
            return;
        }
        container.querySelector('.chx-empty')?.remove();

        svg = svgEl('svg', { width: String(w), height: String(h), viewBox: `0 0 ${w} ${h}` });
        svg.style.display = 'block'; svg.style.width = '100%'; svg.style.height = '100%';
        const plotW = w - PAD.left - PAD.right;
        const plotH = h - PAD.top - PAD.bottom;
        const maxY = Math.max(...opts.barValues, ...opts.lineValues);
        const scale = niceScale(maxY, 4);
        const yAt = (v: number) => PAD.top + plotH - (v / scale.max) * plotH;
        const colW = plotW / n;
        const barW = Math.min(28, colW * 0.5);

        const gridG = svgEl('g');
        scale.ticks.forEach((t) => {
            const y = yAt(t);
            gridG.appendChild(svgEl('line', { x1: String(PAD.left), x2: String(w - PAD.right), y1: String(y), y2: String(y), stroke: 'var(--chart-grid)', 'stroke-width': '1' }));
            const label = svgEl('text', { x: String(PAD.left - 8), y: String(y), 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 'chx-axis-label' });
            label.textContent = formatYAxis(t);
            gridG.appendChild(label);
        });
        svg.appendChild(gridG);

        const barsG = svgEl('g');
        const centers: number[] = [];
        const barRects: SVGRectElement[] = [];
        opts.barValues.forEach((v, i) => {
            const cx = PAD.left + colW * (i + 0.5);
            centers.push(cx);
            // Un valor 0 no dibuja barra (ni el mínimo de 2px): un muñón se leería como dato.
            const barH = v > 0 ? Math.max(2, (v / scale.max) * plotH) : 0;
            const rect = svgEl('rect', {
                x: String(cx - barW / 2), y: String(PAD.top + plotH - barH),
                width: String(barW), height: String(barH), rx: '4', fill: barColor, class: 'chx-bar',
            });
            barsG.appendChild(rect);
            barRects.push(rect);
            const label = svgEl('text', { x: String(cx), y: String(h - 6), 'text-anchor': 'middle', class: 'chx-axis-label' });
            label.textContent = opts.labels[i];
            barsG.appendChild(label);
        });
        svg.appendChild(barsG);

        const lineD = smoothPath(centers, opts.lineValues.map((v) => yAt(v)));
        const linePath = svgEl('path', { d: lineD, fill: 'none', stroke: lineColor, 'stroke-width': '2.25', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
        svg.appendChild(linePath);
        const lineDots: SVGCircleElement[] = opts.lineValues.map((v, i) => {
            const dot = svgEl('circle', { cx: String(centers[i]), cy: String(yAt(v)), r: '3.5', fill: lineColor, stroke: 'var(--surface)', 'stroke-width': '1.5' });
            svg.appendChild(dot);
            return dot;
        });

        const dimBars = makeDimGroup(barRects);
        const dimDots = makeDimGroup(lineDots);

        // Hit areas por columna (hover muestra ambos valores del mes y atenúa las demás)
        opts.labels.forEach((_, i) => {
            const hit = svgEl('rect', { x: String(PAD.left + colW * i), y: String(PAD.top), width: String(colW), height: String(plotH), fill: 'transparent', style: 'cursor:pointer' });
            const focus = () => { show(i, centers[i]); dimBars.focus(barRects[i]); dimDots.focus(lineDots[i]); };
            const blur = () => { hideTooltip(tooltip); dimBars.clear(); dimDots.clear(); };
            hit.addEventListener('pointerenter', focus);
            hit.addEventListener('pointermove', focus);
            hit.addEventListener('pointerleave', blur);
            hit.addEventListener('focus', focus);
            hit.addEventListener('blur', blur);
            hit.setAttribute('tabindex', '0');
            hitRects.push(hit);
            svg.appendChild(hit);
        });

        function show(i: number, cx: number) {
            let html = `<div class="cd-tt-x">${opts.labels[i]}</div>`;
            html += tooltipRow(barColor, opts.barLabel, formatY(opts.barValues[i]));
            html += tooltipRow(lineColor, opts.lineLabel, formatY(opts.lineValues[i]));
            tooltip.innerHTML = html;
            placeTooltip(tooltip, container, cx, yAt(opts.lineValues[i]));
        }

        container.appendChild(svg);
    }

    const disconnect = observeSize(container, draw);
    return { destroy() { disconnect(); container.innerHTML = ''; } };
}

// ── 3. Bar chart vertical con ejes — flujo esperado ─────────────────────────

export interface BarItem { label: string; value: number; sub?: string }
export interface BarChartOptions {
    items: BarItem[];
    height?: number;
    formatY?: (v: number) => string;
    formatYAxis?: (v: number) => string;
    color?: string;
    emptyMessage?: string;
}

export function mountBarChart(container: HTMLElement, opts: BarChartOptions): ChartHandle {
    const height = opts.height ?? 200;
    const formatY = opts.formatY ?? ((v: number) => String(Math.round(v)));
    const formatYAxis = opts.formatYAxis ?? ((v: number) => compactNumber(v));
    const color = opts.color ?? 'var(--chart-fill)';

    container.classList.add('cd-chart-wrap');
    clear(container);
    container.style.height = height + 'px';
    const tooltip = ensureTooltip(container);

    const PAD = { top: 12, right: 8, bottom: 30, left: 46 };
    const n = opts.items.length;

    function draw(w: number, h: number) {
        container.querySelectorAll('svg').forEach((s) => s.remove());
        // Igual que line/combo: valores en cero se dibujan en el piso, no en blanco.
        if (!n) {
            if (!container.querySelector('.chx-empty')) emptyState(container, opts.emptyMessage ?? '');
            return;
        }
        container.querySelector('.chx-empty')?.remove();

        const svg = svgEl('svg', { width: String(w), height: String(h), viewBox: `0 0 ${w} ${h}` });
        svg.style.display = 'block'; svg.style.width = '100%'; svg.style.height = '100%';
        const plotW = w - PAD.left - PAD.right;
        const plotH = h - PAD.top - PAD.bottom;
        const maxY = Math.max(...opts.items.map((i) => i.value));
        const scale = niceScale(maxY, 4);
        const colW = plotW / n;
        const barW = Math.min(40, colW * 0.55);

        const gridG = svgEl('g');
        scale.ticks.forEach((t) => {
            const y = PAD.top + plotH - (t / scale.max) * plotH;
            gridG.appendChild(svgEl('line', { x1: String(PAD.left), x2: String(w - PAD.right), y1: String(y), y2: String(y), stroke: 'var(--chart-grid)', 'stroke-width': '1' }));
            const label = svgEl('text', { x: String(PAD.left - 8), y: String(y), 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 'chx-axis-label' });
            label.textContent = formatYAxis(t);
            gridG.appendChild(label);
        });
        svg.appendChild(gridG);

        const bars: SVGRectElement[] = [];
        opts.items.forEach((it, i) => {
            const cx = PAD.left + colW * (i + 0.5);
            const barH = it.value > 0 ? Math.max(3, (it.value / scale.max) * plotH) : 0;
            const rect = svgEl('rect', {
                x: String(cx - barW / 2), y: String(PAD.top + plotH - barH),
                width: String(barW), height: String(barH), rx: '5', fill: color, class: 'chx-bar',
            });
            rect.style.transition = reducedMotion() ? 'none' : 'fill 0.2s var(--ease-ios, ease), opacity 0.2s var(--ease-ios, ease)';
            rect.style.cursor = 'pointer';
            rect.setAttribute('tabindex', '0');
            bars.push(rect);
            svg.appendChild(rect);

            const label = svgEl('text', { x: String(cx), y: String(h - 6), 'text-anchor': 'middle', class: 'chx-axis-label' });
            label.textContent = it.label;
            svg.appendChild(label);
        });

        const dim = makeDimGroup(bars);
        opts.items.forEach((it, i) => {
            const rect = bars[i];
            const cx = PAD.left + colW * (i + 0.5);
            const barH = it.value > 0 ? Math.max(3, (it.value / scale.max) * plotH) : 0;
            const show = () => {
                tooltip.innerHTML = `<div class="cd-tt-x">${it.label}${it.sub ? ` · ${it.sub}` : ''}</div>` + tooltipRow(color, '', formatY(it.value));
                placeTooltip(tooltip, container, cx, PAD.top + plotH - barH);
                rect.style.fill = 'var(--chart-fill-2)';
                dim.focus(rect);
            };
            const unshow = () => { hideTooltip(tooltip); rect.style.fill = color; dim.clear(); };
            rect.addEventListener('pointerenter', show);
            rect.addEventListener('pointermove', show);
            rect.addEventListener('pointerleave', unshow);
            rect.addEventListener('focus', show);
            rect.addEventListener('blur', unshow);
        });

        container.appendChild(svg);
    }

    const disconnect = observeSize(container, draw);
    return { destroy() { disconnect(); container.innerHTML = ''; } };
}

// ── 4. Barras horizontales — rankings ───────────────────────────────────────
// Implementadas como filas HTML/CSS (no SVG): el texto de nombre/valor a ambos lados de una
// barra se lee mejor y responde mejor a distintos anchos que <text> de SVG, y el patrón de
// "track+fill animado" ya es el lenguaje visual establecido del proyecto — solo le faltaba
// esta capa de interacción real con tooltip clamped y destroy().

export interface HBarItem { label: string; value: number; color?: string }
export interface HBarChartOptions {
    items: HBarItem[];
    formatY?: (v: number) => string;
    color?: string;
    maxValue?: number;
    emptyMessage?: string;
}

export function mountHBarChart(container: HTMLElement, opts: HBarChartOptions): ChartHandle {
    const formatY = opts.formatY ?? ((v: number) => String(Math.round(v)));
    const color = opts.color ?? 'var(--chart-fill)';

    container.classList.add('cd-chart-wrap', 'chx-hbar-host');
    clear(container);
    const tooltip = ensureTooltip(container);

    if (!opts.items.length) { emptyState(container, opts.emptyMessage ?? ''); return { destroy() { container.innerHTML = ''; } }; }

    const max = opts.maxValue ?? Math.max(1, ...opts.items.map((i) => i.value));
    const wrap = document.createElement('div');
    wrap.className = 'chx-hbar';
    const listeners: Array<() => void> = [];
    const fills: HTMLElement[] = [];

    opts.items.forEach((it) => {
        const row = document.createElement('div');
        row.className = 'chx-hbar-row';
        const name = document.createElement('span');
        name.className = 'chx-hbar-name';
        name.textContent = it.label;
        const track = document.createElement('div');
        track.className = 'chx-hbar-track';
        const fill = document.createElement('div');
        fill.className = 'chx-hbar-fill';
        fill.style.background = it.color ?? color;
        fill.style.width = '0%';
        fill.tabIndex = 0;
        requestAnimationFrame(() => { fill.style.width = Math.max(3, (it.value / max) * 100) + '%'; });
        track.appendChild(fill);
        fills.push(fill);
        const val = document.createElement('span');
        val.className = 'chx-hbar-val editorial';
        val.textContent = formatY(it.value);

        row.append(name, track, val);
        wrap.appendChild(row);
    });

    const dim = makeDimGroup(fills);
    opts.items.forEach((it, idx) => {
        const fill = fills[idx];
        const show = () => {
            tooltip.innerHTML = tooltipRow(it.color ?? color, it.label, formatY(it.value));
            const fillRect = fill.getBoundingClientRect();
            const hostRect = container.getBoundingClientRect();
            placeTooltip(tooltip, container, fillRect.right - hostRect.left, fillRect.top - hostRect.top);
            dim.focus(fill);
        };
        const unshow = () => { hideTooltip(tooltip); dim.clear(); };
        fill.addEventListener('pointerenter', show);
        fill.addEventListener('pointermove', show);
        fill.addEventListener('pointerleave', unshow);
        fill.addEventListener('focus', show);
        fill.addEventListener('blur', unshow);
        listeners.push(() => {
            fill.removeEventListener('pointerenter', show);
            fill.removeEventListener('pointermove', show);
            fill.removeEventListener('pointerleave', unshow);
            fill.removeEventListener('focus', show);
            fill.removeEventListener('blur', unshow);
        });
    });
    container.appendChild(wrap);

    return { destroy() { listeners.forEach((fn) => fn()); container.innerHTML = ''; } };
}

// ── 5. Embudo de conversión ──────────────────────────────────────────────────

export interface FunnelStep { label: string; value: number }
export interface FunnelOptions {
    steps: FunnelStep[];
    formatY?: (v: number) => string;
    color?: string;
    emptyMessage?: string;
}

export function mountFunnel(container: HTMLElement, opts: FunnelOptions): ChartHandle {
    const formatY = opts.formatY ?? ((v: number) => String(Math.round(v)));
    const color = opts.color ?? 'var(--chart-fill)';
    container.classList.add('cd-chart-wrap');
    clear(container);
    const tooltip = ensureTooltip(container);

    const steps = opts.steps;
    // Con todos los pasos en 0 el embudo SÍ se dibuja (estructura visible + "0"), no en blanco.
    if (!steps.length) { emptyState(container, opts.emptyMessage ?? ''); return { destroy() { container.innerHTML = ''; } }; }
    const total = steps[0].value || 1;

    const wrap = document.createElement('div');
    wrap.className = 'chx-funnel';
    const listeners: Array<() => void> = [];
    const bars: HTMLElement[] = [];

    steps.forEach((s, i) => {
        const row = document.createElement('div');
        row.className = 'chx-funnel-row';
        const bar = document.createElement('div');
        bar.className = 'chx-funnel-bar';
        bar.style.background = color;
        bar.style.opacity = String(1 - i * (0.55 / Math.max(1, steps.length - 1)));
        bar.style.width = '0%';
        bar.tabIndex = 0;
        requestAnimationFrame(() => { bar.style.width = Math.max(8, (s.value / total) * 100) + '%'; });
        bars.push(bar);

        const label = document.createElement('span');
        label.className = 'chx-funnel-label';
        label.textContent = s.label;
        const val = document.createElement('span');
        val.className = 'chx-funnel-val editorial';
        val.textContent = formatY(s.value);
        bar.append(label, val);
        row.appendChild(bar);

        if (i > 0) {
            const prev = steps[i - 1].value || 1;
            const convPrev = Math.round((s.value / prev) * 100);
            const note = document.createElement('span');
            note.className = 'chx-funnel-note';
            note.textContent = `${convPrev}%`;
            row.appendChild(note);
        }

        wrap.appendChild(row);
    });

    // Dimming propio (no makeDimGroup): cada barra ya lleva su propia opacity inline
    // (el degradado 1→0.45 del embudo) — una clase CSS `.is-dim{opacity:X}` nunca le ganaría
    // a ese estilo inline, así que el atenuado también se aplica sobre `style.opacity`.
    const baseOpacity = steps.map((_, i) => 1 - i * (0.55 / Math.max(1, steps.length - 1)));
    const focusBar = (idx: number) => bars.forEach((b, j) => {
        b.style.opacity = String(j === idx ? baseOpacity[j] : baseOpacity[j] * 0.4);
        b.classList.toggle('is-focus', j === idx);
    });
    const clearBars = () => bars.forEach((b, j) => { b.style.opacity = String(baseOpacity[j]); b.classList.remove('is-focus'); });

    steps.forEach((s, i) => {
        const bar = bars[i];
        const show = () => {
            const pctTotal = Math.round((s.value / total) * 100);
            let html = tooltipRow(color, s.label, formatY(s.value));
            html += `<div class="cd-tt-delta">${pctTotal}% del total</div>`;
            tooltip.innerHTML = html;
            const r = bar.getBoundingClientRect(); const hr = container.getBoundingClientRect();
            placeTooltip(tooltip, container, r.left - hr.left + r.width / 2, r.top - hr.top);
            focusBar(i);
        };
        const unshow = () => { hideTooltip(tooltip); clearBars(); };
        bar.addEventListener('pointerenter', show); bar.addEventListener('pointermove', show);
        bar.addEventListener('pointerleave', unshow); bar.addEventListener('focus', show); bar.addEventListener('blur', unshow);
        listeners.push(() => {
            bar.removeEventListener('pointerenter', show); bar.removeEventListener('pointermove', show);
            bar.removeEventListener('pointerleave', unshow); bar.removeEventListener('focus', show); bar.removeEventListener('blur', unshow);
        });
    });
    container.appendChild(wrap);

    return { destroy() { listeners.forEach((fn) => fn()); container.innerHTML = ''; } };
}

// ── 6. Dona (aging de cartera) ───────────────────────────────────────────────

export interface DonutSlice { key: string; label: string; value: number; color: string }
export interface DonutOptions {
    slices: DonutSlice[];
    formatY?: (v: number) => string;
    centerLabel?: string;
    size?: number;
    emptyMessage?: string;
}

export function mountDonut(container: HTMLElement, opts: DonutOptions): ChartHandle {
    const formatY = opts.formatY ?? ((v: number) => String(Math.round(v)));
    const size = opts.size ?? 168;
    container.classList.add('cd-chart-wrap');
    clear(container);
    const tooltip = ensureTooltip(container);

    const slices = opts.slices.filter((s) => s.value > 0);
    const total = slices.reduce((s, sl) => s + sl.value, 0);
    if (!slices.length || total <= 0) { emptyState(container, opts.emptyMessage ?? ''); return { destroy() { container.innerHTML = ''; } }; }

    const r = size / 2 - 14;
    const cx = size / 2, cy = size / 2;
    const circumference = 2 * Math.PI * r;

    const wrap = document.createElement('div');
    wrap.className = 'chx-donut-wrap';
    const svg = svgEl('svg', { width: String(size), height: String(size), viewBox: `0 0 ${size} ${size}` });
    svg.style.transform = 'rotate(-90deg)';

    const bg = svgEl('circle', { cx: String(cx), cy: String(cy), r: String(r), fill: 'none', stroke: 'var(--chart-track)', 'stroke-width': '18' });
    svg.appendChild(bg);

    let acc = 0;
    const listeners: Array<() => void> = [];
    const circles: SVGCircleElement[] = [];
    const fracs: number[] = [];
    slices.forEach((sl) => {
        const frac = sl.value / total;
        fracs.push(frac);
        const dash = frac * circumference;
        const circle = svgEl('circle', {
            cx: String(cx), cy: String(cy), r: String(r), fill: 'none', stroke: sl.color, 'stroke-width': '18',
            'stroke-dasharray': `${dash} ${circumference - dash}`, 'stroke-dashoffset': String(-acc),
            'stroke-linecap': 'butt',
        });
        circle.style.cursor = 'pointer';
        circle.style.transition = reducedMotion() ? 'none' : 'stroke-width 0.15s var(--ease-ios, ease), opacity 0.2s var(--ease-ios, ease)';
        circle.tabIndex = 0;
        circles.push(circle);
        svg.appendChild(circle);
        acc += dash;
    });

    const center = document.createElement('div');
    center.className = 'chx-donut-center';
    center.innerHTML = `<span class="chx-donut-total editorial">${formatY(total)}</span>${opts.centerLabel ? `<span class="chx-donut-sub">${opts.centerLabel}</span>` : ''}`;

    const stage = document.createElement('div');
    stage.className = 'chx-donut-stage';
    stage.style.width = size + 'px'; stage.style.height = size + 'px';
    stage.append(svg, center);

    const legend = document.createElement('div');
    legend.className = 'chx-donut-legend';
    const legendItems: HTMLElement[] = [];
    slices.forEach((sl) => {
        const item = document.createElement('div');
        item.className = 'chx-legend-item';
        item.tabIndex = 0;
        item.innerHTML = `<span class="chx-legend-dot" style="background:${sl.color}"></span><span class="chx-legend-label">${sl.label}</span><span class="chx-legend-val editorial">${formatY(sl.value)}</span>`;
        legend.appendChild(item);
        legendItems.push(item);
    });

    // Foco al hover DENTRO de la gráfica + sincronía con la leyenda (señalar un segmento
    // resalta su fila de leyenda y viceversa) — pedido explícito de André.
    const dimCircles = makeDimGroup(circles);
    const dimLegend = makeDimGroup(legendItems);
    slices.forEach((sl, i) => {
        const circle = circles[i], legendItem = legendItems[i];
        const show = () => {
            const pct = Math.round(fracs[i] * 100);
            tooltip.innerHTML = tooltipRow(sl.color, sl.label, formatY(sl.value)) + `<div class="cd-tt-delta">${pct}%</div>`;
            placeTooltip(tooltip, container, cx, cy - r, false);
            circle.setAttribute('stroke-width', '22');
            dimCircles.focus(circle); dimLegend.focus(legendItem);
        };
        const unshow = () => { hideTooltip(tooltip); circle.setAttribute('stroke-width', '18'); dimCircles.clear(); dimLegend.clear(); };
        [circle, legendItem].forEach((el) => {
            el.addEventListener('pointerenter', show); el.addEventListener('pointermove', show);
            el.addEventListener('pointerleave', unshow); el.addEventListener('focus', show); el.addEventListener('blur', unshow);
            listeners.push(() => {
                el.removeEventListener('pointerenter', show); el.removeEventListener('pointermove', show);
                el.removeEventListener('pointerleave', unshow); el.removeEventListener('focus', show); el.removeEventListener('blur', unshow);
            });
        });
    });

    wrap.append(stage, legend);
    container.appendChild(wrap);

    return { destroy() { listeners.forEach((fn) => fn()); container.innerHTML = ''; } };
}

// ── 7. Barra 100% segmentada + leyenda — pipeline por estado ────────────────

export interface SegBarSegment { key: string; label: string; value: number; color: string }
export interface SegBarOptions {
    segments: SegBarSegment[];
    formatY?: (v: number) => string;
    emptyMessage?: string;
}

export function mountSegBar(container: HTMLElement, opts: SegBarOptions): ChartHandle {
    const formatY = opts.formatY ?? ((v: number) => String(Math.round(v)));
    container.classList.add('cd-chart-wrap');
    clear(container);
    const tooltip = ensureTooltip(container);

    const segs = opts.segments;
    const total = segs.reduce((s, sg) => s + sg.value, 0);
    if (!segs.length || total <= 0) { emptyState(container, opts.emptyMessage ?? ''); return { destroy() { container.innerHTML = ''; } }; }

    const wrap = document.createElement('div');
    wrap.className = 'chx-segbar-wrap';
    const bar = document.createElement('div');
    bar.className = 'chx-segbar';
    const legend = document.createElement('div');
    legend.className = 'chx-segbar-legend';
    const listeners: Array<() => void> = [];
    const segEls: HTMLElement[] = [];
    const legendItems: HTMLElement[] = [];

    segs.forEach((sg) => {
        const pct = (sg.value / total) * 100;
        const seg = document.createElement('div');
        seg.className = 'chx-segbar-seg';
        seg.style.background = sg.color;
        seg.style.flex = '0 0 0%';
        seg.tabIndex = 0;
        requestAnimationFrame(() => { seg.style.flex = `0 0 ${Math.max(pct, sg.value > 0 ? 1.5 : 0)}%`; });
        bar.appendChild(seg);
        segEls.push(seg);

        const item = document.createElement('div');
        item.className = 'chx-legend-item';
        item.tabIndex = 0;
        item.innerHTML = `<span class="chx-legend-dot" style="background:${sg.color}"></span><span class="chx-legend-label">${sg.label}</span><span class="chx-legend-val editorial">${formatY(sg.value)}</span>`;
        legend.appendChild(item);
        legendItems.push(item);
    });

    // Foco al hover + sincronía con la leyenda (mismo patrón que la dona).
    const dimSegs = makeDimGroup(segEls);
    const dimLegend = makeDimGroup(legendItems);
    segs.forEach((sg, i) => {
        const seg = segEls[i], legendItem = legendItems[i];
        const pct = (sg.value / total) * 100;
        const show = () => {
            tooltip.innerHTML = tooltipRow(sg.color, sg.label, formatY(sg.value)) + `<div class="cd-tt-delta">${Math.round(pct)}%</div>`;
            const r = seg.getBoundingClientRect(); const hr = container.getBoundingClientRect();
            placeTooltip(tooltip, container, r.left - hr.left + r.width / 2, r.top - hr.top);
            dimSegs.focus(seg); dimLegend.focus(legendItem);
        };
        const unshow = () => { hideTooltip(tooltip); dimSegs.clear(); dimLegend.clear(); };
        [seg, legendItem].forEach((el) => {
            el.addEventListener('pointerenter', show); el.addEventListener('pointermove', show);
            el.addEventListener('pointerleave', unshow); el.addEventListener('focus', show); el.addEventListener('blur', unshow);
            listeners.push(() => {
                el.removeEventListener('pointerenter', show); el.removeEventListener('pointermove', show);
                el.removeEventListener('pointerleave', unshow); el.removeEventListener('focus', show); el.removeEventListener('blur', unshow);
            });
        });
    });

    wrap.append(bar, legend);
    container.appendChild(wrap);

    return { destroy() { listeners.forEach((fn) => fn()); container.innerHTML = ''; } };
}

// ── 8. Sparkline — mini línea sin ejes (dentro de KPI tiles) ────────────────

export interface SparklineOptions {
    values: number[];
    height?: number;
    color?: string;
}

export function mountSparkline(container: HTMLElement, opts: SparklineOptions): ChartHandle {
    const height = opts.height ?? 36;
    const color = opts.color ?? 'var(--chart-fill)';
    container.classList.add('cd-chart-wrap');
    clear(container);
    container.style.height = height + 'px';

    const vals = opts.values;
    function draw(w: number, h: number) {
        container.querySelectorAll('svg').forEach((s) => s.remove());
        if (!vals.length || isEmptySeries(vals)) return;
        const svg = svgEl('svg', { width: String(w), height: String(h), viewBox: `0 0 ${w} ${h}` });
        svg.style.display = 'block'; svg.style.width = '100%'; svg.style.height = '100%';
        const max = Math.max(...vals, 1);
        const n = vals.length;
        const pad = 3;
        const usableH = h - pad * 2;
        const xs = vals.map((_, i) => (n <= 1 ? w / 2 : (i / (n - 1)) * w));
        const ys = vals.map((v) => pad + usableH - (v / max) * usableH);
        svg.appendChild(svgEl('path', { d: smoothPath(xs, ys), fill: 'none', stroke: color, 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
        container.appendChild(svg);
    }
    const disconnect = observeSize(container, draw);
    return { destroy() { disconnect(); container.innerHTML = ''; } };
}

// ── 9. Gauge — anillo de progreso (margen, tasa de cierre) ──────────────────

export interface GaugeOptions {
    value: number;
    max?: number;
    formatValue?: (v: number) => string;
    label?: string;
    tone?: 'ok' | 'warn' | 'danger' | 'neutral';
    size?: number;
}

export function mountGauge(container: HTMLElement, opts: GaugeOptions): ChartHandle {
    const max = opts.max ?? 100;
    const size = opts.size ?? 88;
    const formatValue = opts.formatValue ?? ((v: number) => `${Math.round(v)}%`);
    const toneVar = opts.tone === 'ok' ? 'var(--color-ok)' : opts.tone === 'warn' ? 'var(--color-warn)' : opts.tone === 'danger' ? 'var(--color-danger)' : 'var(--chart-fill)';

    container.classList.add('cd-chart-wrap', 'chx-gauge-host');
    clear(container);

    const r = size / 2 - 8;
    const cx = size / 2, cy = size / 2;
    const circumference = 2 * Math.PI * r;
    const frac = Math.max(0, Math.min(1, opts.value / max));

    const svg = svgEl('svg', { width: String(size), height: String(size), viewBox: `0 0 ${size} ${size}` });
    svg.style.transform = 'rotate(-90deg)';
    svg.appendChild(svgEl('circle', { cx: String(cx), cy: String(cy), r: String(r), fill: 'none', stroke: 'var(--chart-track)', 'stroke-width': '9' }));
    const progress = svgEl('circle', {
        cx: String(cx), cy: String(cy), r: String(r), fill: 'none', stroke: toneVar, 'stroke-width': '9', 'stroke-linecap': 'round',
        'stroke-dasharray': String(circumference), 'stroke-dashoffset': String(circumference),
    });
    svg.appendChild(progress);

    const wrap = document.createElement('div');
    wrap.className = 'chx-gauge-stage';
    wrap.style.width = size + 'px'; wrap.style.height = size + 'px';
    const center = document.createElement('div');
    center.className = 'chx-gauge-center';
    center.innerHTML = `<span class="chx-gauge-val editorial">${formatValue(opts.value)}</span>${opts.label ? `<span class="chx-gauge-label">${opts.label}</span>` : ''}`;
    wrap.append(svg, center);
    container.appendChild(wrap);

    if (!reducedMotion()) {
        requestAnimationFrame(() => {
            progress.style.transition = 'stroke-dashoffset 0.9s var(--ease-spring, cubic-bezier(0.22,1,0.36,1))';
            progress.setAttribute('stroke-dashoffset', String(circumference * (1 - frac)));
        });
    } else {
        progress.setAttribute('stroke-dashoffset', String(circumference * (1 - frac)));
    }

    return { destroy() { container.innerHTML = ''; } };
}
