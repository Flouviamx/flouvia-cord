import {
    mountBarChart, mountComboChart, mountDonut, mountFunnel, mountGauge,
    mountHBarChart, mountLineChart, mountSegBar, mountSparkline, onVisible,
    type ChartHandle,
} from './chart';
import { intlLocale, money } from './fmt';

type ChartData = Record<string, unknown>;
const handles = new WeakMap<HTMLElement, ChartHandle>();

function json<T>(value: string | undefined, fallback: T): T {
    try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

function formatter(el: HTMLElement): (value: number) => string {
    const locale = intlLocale();
    if (el.dataset.format === 'pct') return (value) => `${Math.round(value)}%`;
    if (el.dataset.format === 'number') return (value) => new Intl.NumberFormat(locale).format(value);
    return (value) => money(value, locale);
}

export function remount(el: HTMLElement, data: ChartData = {}): ChartHandle | null {
    handles.get(el)?.destroy();
    const kind = el.dataset.chart;
    const formatY = formatter(el);
    const emptyMessage = el.dataset.emptyMsg || '';
    let handle: ChartHandle | null = null;
    const source = { ...json<ChartData>(el.dataset.chartOptions, {}), ...data } as any;

    if (kind === 'line') handle = mountLineChart(el, { points: source.points ?? json(el.dataset.points, []), comparePoints: source.comparePoints ?? json(el.dataset.comparePoints, []), formatY, emptyMessage, ...source });
    else if (kind === 'combo') handle = mountComboChart(el, { labels: source.labels ?? json(el.dataset.labels, []), barValues: source.barValues ?? json(el.dataset.barValues, []), lineValues: source.lineValues ?? json(el.dataset.lineValues, []), formatY, formatYAxis: formatY, emptyMessage, ...source });
    else if (kind === 'bar') handle = mountBarChart(el, { items: source.items ?? json(el.dataset.items, []), formatY, formatYAxis: formatY, emptyMessage, ...source });
    else if (kind === 'hbar') handle = mountHBarChart(el, { items: source.items ?? json(el.dataset.items, []), formatY, color: el.dataset.color, emptyMessage, ...source });
    else if (kind === 'funnel') handle = mountFunnel(el, { steps: source.steps ?? json(el.dataset.steps, []), formatY, emptyMessage, ...source });
    else if (kind === 'donut') handle = mountDonut(el, { slices: source.slices ?? json(el.dataset.slices, []), formatY, emptyMessage, ...source });
    else if (kind === 'segbar') handle = mountSegBar(el, { segments: source.segments ?? json(el.dataset.segments, []), formatY, emptyMessage, ...source });
    else if (kind === 'sparkline') handle = mountSparkline(el, { values: source.values ?? json(el.dataset.values, []), ...source });
    else if (kind === 'gauge') handle = mountGauge(el, { value: source.value ?? Number(el.dataset.value || 0), max: source.max ?? Number(el.dataset.max || 100), tone: source.tone ?? el.dataset.tone, ...source });

    if (handle) handles.set(el, handle);
    return handle;
}

export function mountAll(root: ParentNode = document): void {
    root.querySelectorAll<HTMLElement>('[data-chart]').forEach((el) => {
        if (handles.has(el)) return;
        onVisible(el, () => { if (!handles.has(el)) remount(el); });
    });
}

