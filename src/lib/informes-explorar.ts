// Explorador de informes (fase 5): "agrupar por" una dimensión y elegir métricas,
// como el explorador de Shopify. La salida es un TablaReport, así que hereda la
// tabla ordenable, los totales, la comparativa y el CSV.
//
// Seguridad: dimensiones y métricas son LISTAS BLANCAS. La configuración que llega
// por URL (o de un informe guardado) solo elige claves; el SQL de cada clave está
// escrito aquí. Ningún texto del usuario se interpola en la consulta.
import { sql, withOrgTx, getActiveOrgId } from './db';
import { cached } from './cache';
import { currentLocale } from './context';
import { t } from '../i18n/app';
import { STATUS_GANADA, STATUS_PERDIDA, STATUS_SALIO } from './metrics';
import { compareRangeFor, type Rango } from './rango';
import { getReportScope, quoteFx, dayStart, dayEnd, scopeNote, type ReportScope } from './report-scope';
import type { ColFormat, TablaCol, TablaReport, TablaRow } from './informes-tabla';

export const DIMENSIONS = ['cliente', 'producto', 'vendedor', 'estado', 'mes', 'semana', 'dia', 'pais', 'nivel', 'divisa'] as const;
export const METRICS = ['cotizaciones', 'cotizado', 'ganadas', 'vendido', 'tasa', 'ticket', 'perdidas', 'dias_cierre', 'unidades', 'margen'] as const;
export type DimKey = typeof DIMENSIONS[number];
export type MetricKey = typeof METRICS[number];
export type ExplorerConfig = { dim: DimKey; m: MetricKey[] };

/** Métricas que solo existen por línea (producto) o solo por cotización. */
export const ITEM_ONLY: readonly MetricKey[] = ['unidades', 'margen'];
export const QUOTE_ONLY: readonly MetricKey[] = ['dias_cierre'];
export const DEFAULT_CONFIG: ExplorerConfig = { dim: 'cliente', m: ['cotizaciones', 'ganadas', 'vendido', 'tasa'] };
const MAX_METRICS = 6;

const FORMAT: Record<MetricKey, ColFormat> = {
    cotizaciones: 'number', cotizado: 'money', ganadas: 'number', vendido: 'money', tasa: 'pct',
    ticket: 'money', perdidas: 'number', dias_cierre: 'days', unidades: 'number', margen: 'money',
};
// Etiquetas como claves literales (regla 36: el contrato de i18n las ve vivas). Se
// reutiliza el vocabulario de los informes tabla para que una misma métrica se llame
// igual en "Ventas por cliente" y en el explorador.
export const METRIC_LABEL: Record<MetricKey, string> = {
    cotizaciones: 'inf.t.cotizaciones', cotizado: 'inf.t.cotizado', ganadas: 'inf.t.ventas', vendido: 'inf.t.vendido',
    tasa: 'inf.t.tasa_cierre', ticket: 'inf.t.ticket', perdidas: 'inf.x.perdidas', dias_cierre: 'inf.t.dias_cierre',
    unidades: 'inf.t.unidades', margen: 'inf.t.margen',
};
export const DIM_LABEL: Record<DimKey, string> = {
    cliente: 'inf.t.cliente', producto: 'inf.t.producto', vendedor: 'inf.t.vendedor', estado: 'inf.x.estado',
    mes: 'inf.t.mes', semana: 'inf.t.g_week', dia: 'inf.t.g_day', pais: 'inf.x.pais', nivel: 'inf.x.nivel', divisa: 'inf.t.divisa',
};
const TIME_UNIT: Partial<Record<DimKey, 'month' | 'week' | 'day'>> = { mes: 'month', semana: 'week', dia: 'day' };

/** Normaliza una configuración ajena (URL, JSON guardado): solo sobreviven claves conocidas. */
export function parseExplorerConfig(input: { dim?: unknown; m?: unknown } | null | undefined): ExplorerConfig {
    const dim = DIMENSIONS.includes(input?.dim as DimKey) ? input!.dim as DimKey : DEFAULT_CONFIG.dim;
    const raw = Array.isArray(input?.m) ? input!.m : typeof input?.m === 'string' ? String(input!.m).split(',') : [];
    const allowed = (k: MetricKey) => (dim === 'producto' ? !QUOTE_ONLY.includes(k) : !ITEM_ONLY.includes(k));
    const m = [...new Set(raw.map(String).filter((k): k is MetricKey => METRICS.includes(k as MetricKey)))].filter(allowed).slice(0, MAX_METRICS);
    return { dim, m: m.length ? m : DEFAULT_CONFIG.m.filter(allowed) };
}

export function configFromSearch(params: URLSearchParams): ExplorerConfig {
    const m = params.getAll('m').flatMap((v) => v.split(','));
    return parseExplorerConfig({ dim: params.get('dim'), m });
}

function metricSql(S: ReportScope, key: MetricKey, itemBase: boolean) {
    const fx = quoteFx(S);
    const ganada = sql`c.status = any(${STATUS_GANADA})`;
    if (itemBase) {
        const linea = sql`coalesce(it.precio_negociado, it.precio_unitario) * it.cantidad`;
        switch (key) {
            case 'cotizaciones': return sql`count(distinct c.id)`;
            case 'cotizado': return sql`coalesce(sum(${linea} * ${fx}), 0)`;
            case 'ganadas': return sql`count(distinct c.id) filter (where ${ganada})`;
            case 'vendido': return sql`coalesce(sum(${linea} * ${fx}) filter (where ${ganada}), 0)`;
            case 'tasa': return sql`round(100.0 * count(distinct c.id) filter (where ${ganada}) / nullif(count(distinct c.id) filter (where c.status = any(${STATUS_SALIO})), 0))`;
            case 'ticket': return sql`(sum(${linea} * ${fx}) filter (where ${ganada}) / nullif(count(distinct c.id) filter (where ${ganada}), 0))`;
            case 'perdidas': return sql`count(distinct c.id) filter (where c.status = any(${STATUS_PERDIDA}))`;
            case 'unidades': return sql`coalesce(sum(it.cantidad) filter (where ${ganada}), 0)`;
            // Margen solo con costo capturado: un costo 0 es "no lo sé".
            case 'margen': return sql`sum((${linea} - it.costo_unitario * it.cantidad) * ${fx}) filter (where ${ganada} and it.costo_unitario > 0)`;
            default: return sql`null`;
        }
    }
    switch (key) {
        case 'cotizaciones': return sql`count(*)`;
        case 'cotizado': return sql`coalesce(sum(c.total * ${fx}), 0)`;
        case 'ganadas': return sql`count(*) filter (where ${ganada})`;
        case 'vendido': return sql`coalesce(sum(c.total * ${fx}) filter (where ${ganada}), 0)`;
        case 'tasa': return sql`round(100.0 * count(*) filter (where ${ganada}) / nullif(count(*) filter (where c.status = any(${STATUS_SALIO})), 0))`;
        case 'ticket': return sql`(sum(c.total * ${fx}) filter (where ${ganada}) / nullif(count(*) filter (where ${ganada} and ${fx} is not null), 0))`;
        case 'perdidas': return sql`count(*) filter (where c.status = any(${STATUS_PERDIDA}))`;
        case 'dias_cierre': return sql`round((avg(extract(epoch from (c.approved_at - c.created_at)) / 86400) filter (where ${ganada} and c.approved_at is not null))::numeric, 1)`;
        default: return sql`null`;
    }
}

function dimSql(S: ReportScope, dim: DimKey) {
    const unit = TIME_UNIT[dim];
    if (unit) {
        const u = sql.unsafe(`'${unit}'`);
        return { key: sql`to_char(date_trunc(${u}, c.created_at at time zone ${S.tz}), 'YYYY-MM-DD')`, label: sql`to_char(date_trunc(${u}, c.created_at at time zone ${S.tz}), 'YYYY-MM-DD')` };
    }
    switch (dim) {
        case 'cliente': return { key: sql`cl.id::text`, label: sql`coalesce(cl.empresa, '')` };
        case 'producto': return { key: sql`coalesce(it.producto_id::text, it.descripcion)`, label: sql`coalesce(p.nombre, it.descripcion)` };
        case 'vendedor': return { key: sql`c.creado_por::text`, label: sql`coalesce(m.nombre, m.email, '')` };
        case 'estado': return { key: sql`c.status`, label: sql`c.status` };
        case 'pais': return { key: sql`coalesce(cl.country_code, '')`, label: sql`coalesce(cl.country_code, '')` };
        case 'nivel': return { key: sql`coalesce(cl.nivel, '')`, label: sql`coalesce(cl.nivel, '')` };
        case 'divisa': return { key: sql`upper(c.base_currency)`, label: sql`upper(c.base_currency)` };
        default: return { key: sql`null`, label: sql`null` };
    }
}

// Constructor: devuelve el fragmento; quien lo ejecuta lo mete en withOrgTx.
function fromSql(orgId: string, itemBase: boolean) {
    if (itemBase) return sql`from cotizacion_items it
              join cotizaciones c on c.id = it.cotizacion_id
              left join productos p on p.id = it.producto_id
              left join clientes cl on cl.id = c.cliente_id
              left join org_members m on m.user_id::text = c.creado_por and m.org_id = ${orgId}`;
    return sql`from cotizaciones c
              left join clientes cl on cl.id = c.cliente_id
              left join org_members m on m.user_id::text = c.creado_por and m.org_id = ${orgId}`;
}

function whereSql(S: ReportScope, orgId: string, itemBase: boolean, desde: string, hasta: string) {
    // Cohorte del rango: cotizaciones CREADAS en él. Así una fila responde a
    // "de lo que se cotizó en este periodo, ¿qué pasó?" sin mezclar fechas.
    return sql`where c.org_id = ${orgId} and c.status <> 'draft'
                 and c.created_at >= ${dayStart(S, desde)} and c.created_at < ${dayEnd(S, hasta)}
                 ${itemBase ? sql`and coalesce(it.aprobado, true)` : sql``}`;
}

function selectMetrics(S: ReportScope, config: ExplorerConfig, itemBase: boolean) {
    // Los alias salen de la lista blanca (METRICS), nunca de la entrada.
    return config.m.map((k) => sql`${metricSql(S, k, itemBase)} as ${sql.unsafe(k)}`)
        .reduce((acc, frag, i) => (i ? sql`${acc}, ${frag}` : frag));
}

async function totals(S: ReportScope, orgId: string, config: ExplorerConfig, desde: string, hasta: string) {
    const itemBase = config.dim === 'producto';
    const [[row]] = await withOrgTx(orgId, sql`select ${selectMetrics(S, config, itemBase)} ${fromSql(orgId, itemBase)} ${whereSql(S, orgId, itemBase, desde, hasta)}`);
    return Object.fromEntries(config.m.map((k) => [k, row?.[k] === null || row?.[k] === undefined ? null : Number(row[k])])) as Record<MetricKey, number | null>;
}

function dimLabel(dim: DimKey, raw: string, locale: 'es' | 'en'): string {
    if (dim === 'estado') {
        const key = 'cmdk.st.' + raw;
        const out = t(locale, key as any);
        return out === key ? raw : out;
    }
    if (dim === 'pais' && raw) {
        try { return new Intl.DisplayNames([locale], { type: 'region' }).of(raw) ?? raw; } catch { return raw; }
    }
    if (!raw) return t(locale, dim === 'vendedor' ? 'inf.x.sin_vendedor' : dim === 'cliente' ? 'inf.x.sin_cliente' : 'inf.x.sin_dato');
    return raw;
}

export async function getExplorer(r: Rango, config: ExplorerConfig): Promise<TablaReport> {
    const orgId = await getActiveOrgId();
    const locale = currentLocale();
    return cached(`inf-explorar:${orgId}:${r.desde}:${r.hasta}:${config.dim}:${config.m.join(',')}:${locale}`, 60, async () => {
        const S = await getReportScope(orgId);
        const itemBase = config.dim === 'producto';
        const isTime = !!TIME_UNIT[config.dim];
        const d = dimSql(S, config.dim);
        const first = sql.unsafe(config.m[0]);
        const order = isTime ? sql`order by k asc` : sql`order by ${first} desc nulls last, (coalesce(${d.label}, '') = '') asc, 2 asc`;
        const [rows] = await withOrgTx(orgId, sql`
            select ${d.key} as k, ${d.label} as label, ${selectMetrics(S, config, itemBase)}
            ${fromSql(orgId, itemBase)}
            ${whereSql(S, orgId, itemBase, r.desde, r.hasta)}
            group by 1, 2 ${order} limit 500`);
        const cmp = compareRangeFor(r, '0000-01-01');
        const [cur, prev] = await Promise.all([
            totals(S, orgId, config, r.desde, r.hasta),
            cmp ? totals(S, orgId, config, cmp.desde, cmp.hasta) : Promise.resolve(null),
        ]);
        const href = (k: string | null) => !k ? null
            : config.dim === 'cliente' ? `/app/clientes/${k}`
            : config.dim === 'producto' && /^[0-9a-f-]{36}$/.test(k) ? `/app/productos/${k}` : null;
        const out: TablaRow[] = rows.map((row) => ({
            _href: href(row.k as string | null),
            label: isTime ? String(row.label) : dimLabel(config.dim, String(row.label ?? ''), locale),
            ...Object.fromEntries(config.m.map((k) => [k, row[k] === null || row[k] === undefined ? null : Number(row[k])])),
        }));
        const columns: TablaCol[] = [
            { key: 'label', label: DIM_LABEL[config.dim], format: isTime ? 'date' : 'text' },
            ...config.m.map((k) => ({ key: k, label: METRIC_LABEL[k], format: FORMAT[k] })),
        ];
        const chartMetric = config.m.find((k) => FORMAT[k] === 'money') ?? config.m[0];
        return {
            kpis: config.m.slice(0, 4).map((k) => ({ key: k, label: METRIC_LABEL[k], format: FORMAT[k], value: cur[k], prev: prev?.[k] ?? null })),
            chart: {
                kind: isTime ? 'bar' : 'hbar', label: METRIC_LABEL[chartMetric], format: FORMAT[chartMetric],
                items: (isTime ? out : out.slice(0, 10)).filter((x) => x[chartMetric] !== null).map((x) => ({ label: String(x.label), value: Number(x[chartMetric]), href: x._href ?? undefined })),
            },
            columns,
            rows: out,
            // Los totales de la tabla son los del rango completo (no la suma de filas):
            // una tasa o un ticket no se suman.
            totals: cur,
            granularity: TIME_UNIT[config.dim],
            moneda: scopeNote(S),
            rango: { desde: r.desde, hasta: r.hasta, compare: cmp ? { desde: cmp.desde, hasta: cmp.hasta } : null },
        };
    });
}
