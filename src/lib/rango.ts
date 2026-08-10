export const RANGO_KEYS = [
    'todo', 'hoy', 'ayer', '7', '30', '90', 'mes', 'mes_pasado',
    'trimestre', 'ytd', 'custom',
] as const;

export type RangoKey = typeof RANGO_KEYS[number];
export type Rango = { key: RangoKey | 'compare'; desde: string; hasta: string };

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string | null | undefined): value is string {
    if (!value || !ISO_RE.test(value)) return false;
    const d = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDaysISO(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

export function spanDays(desde: string, hasta: string): number {
    const a = new Date(`${desde}T00:00:00Z`).getTime();
    const b = new Date(`${hasta}T00:00:00Z`).getTime();
    return Math.round((b - a) / 86_400_000) + 1;
}

export function clampISO(iso: string, minISO: string, maxISO: string): string {
    return iso < minISO ? minISO : iso > maxISO ? maxISO : iso;
}

export function computePreset(
    key: RangoKey,
    minISO: string,
    maxISO: string,
    anchorISO: string,
): Rango {
    const anchor = clampISO(anchorISO, minISO, maxISO);
    const now = new Date(`${anchor}T00:00:00Z`);
    let desde = minISO;
    let hasta = anchor;

    switch (key) {
        case 'todo': return { key, desde: minISO, hasta: maxISO };
        case 'hoy': desde = anchor; break;
        case 'ayer': desde = hasta = clampISO(addDaysISO(anchor, -1), minISO, maxISO); break;
        case '7': desde = addDaysISO(anchor, -6); break;
        case '30': desde = addDaysISO(anchor, -29); break;
        case '90': desde = addDaysISO(anchor, -89); break;
        case 'mes': desde = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10); break;
        case 'mes_pasado':
            desde = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
            hasta = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10);
            break;
        case 'trimestre': {
            const q = Math.floor(now.getUTCMonth() / 3) * 3;
            desde = new Date(Date.UTC(now.getUTCFullYear(), q, 1)).toISOString().slice(0, 10);
            break;
        }
        case 'ytd': desde = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10); break;
        case 'custom': return { key, desde: minISO, hasta: maxISO };
    }
    return { key, desde: clampISO(desde, minISO, maxISO), hasta: clampISO(hasta, minISO, maxISO) };
}

export function rangeFor(
    key: RangoKey,
    minISO: string,
    maxISO: string,
    anchorISO: string,
    customDesde?: string,
    customHasta?: string,
): Rango {
    if (key === 'custom' && isISODate(customDesde) && isISODate(customHasta)) {
        const desde = clampISO(customDesde, minISO, maxISO);
        const hasta = clampISO(customHasta, minISO, maxISO);
        return desde <= hasta ? { key, desde, hasta } : { key, desde: hasta, hasta: desde };
    }
    return computePreset(key === 'custom' ? '30' : key, minISO, maxISO, anchorISO);
}

export function compareRangeFor(range: Rango, minISO: string): Rango | null {
    if (range.key === 'todo') return null;
    const days = spanDays(range.desde, range.hasta);
    const hasta = addDaysISO(range.desde, -1);
    const desde = addDaysISO(hasta, -(days - 1));
    return desde < minISO ? null : { key: 'compare', desde, hasta };
}

export function parseRangoParams(
    params: URLSearchParams,
    opts: { minISO: string; maxISO: string; anchorISO: string; fallback?: RangoKey },
): Rango {
    const desde = params.get('desde');
    const hasta = params.get('hasta');
    if (isISODate(desde) && isISODate(hasta) && desde <= hasta && spanDays(desde, hasta) <= 366) {
        return rangeFor('custom', opts.minISO, opts.maxISO, opts.anchorISO, desde, hasta);
    }
    const requested = params.get('rango');
    const key = RANGO_KEYS.includes(requested as RangoKey) ? requested as RangoKey : (opts.fallback ?? '30');
    return rangeFor(key, opts.minISO, opts.maxISO, opts.anchorISO);
}

