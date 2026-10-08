// Datos de demo de los mockups de Informes (DmReports, DmReportTable,
// DmReportExplorer, DmSaveReport, DmScheduledReportEmail, DmHome).
//
// No es un módulo de la app: solo lo leen los mockups (index.ts registra
// únicamente Dm*.astro). Un solo universo con dm-gestion.ts: Materiales del
// Valle vende en MXN a clientes de México, Estados Unidos, España, Colombia y
// Canadá; lo que se vendió en USD o EUR se reexpresa en MXN (la nota de divisa
// de MonedaNota lo dice), como hace la analítica real.
//
// Las cifras de los últimos 30 días cuadran con el Inicio (DmHome): cerrado
// $1,284,500 MXN en 24 ventas, +18 % contra el periodo anterior.

import { t } from '../../../i18n/app';
import type { DmLang } from './format';

const LOCALE: Record<DmLang, string> = { es: 'es-MX', en: 'en-US' };

/** Formato de columna, el mismo vocabulario que ColFormat de src/lib/informes-tabla.ts. */
export type DmColFormat = 'text' | 'money' | 'number' | 'pct' | 'days' | 'date';
export type DmCol = { key: string; label: string; format: DmColFormat };
export type DmKpi = { label: string; format: DmColFormat; value: number | null; prev: number | null };
export type DmRow = Record<string, string | number | null>;

/** Cerrado de los últimos 30 días: el mismo número del indicador del Inicio. */
export const CERRADO_30 = 1284500;
export const CERRADO_30_PREV = 1088560;
export const VENTAS_30 = 24;
export const TICKET_30 = CERRADO_30 / VENTAS_30;
export const TICKET_30_PREV = 50490;

/** Divisas que la nota de divisa dice que se convirtieron. */
export const CONVERTIDAS = ['USD', 'EUR'];

/** Texto de MonedaNota (src/components/app/MonedaNota.astro) con su plantilla real. */
export function monedaNota(lang: DmLang, moneda = 'MXN', convertidas = CONVERTIDAS): string {
    const lista = new Intl.ListFormat(lang, { type: 'conjunction' }).format(convertidas);
    return t(lang, 'moneda.nota').replace('{moneda}', moneda).replace('{lista}', lista);
}

/** Variación como la calcula TablaReport.astro: puntos para tasas, % para lo demás. */
export function kpiDelta(k: DmKpi): { text: string; dir: 'up' | 'down' | 'flat' } | null {
    if (k.value === null || k.prev === null) return null;
    if (k.format === 'pct') {
        const d = k.value - k.prev;
        return { text: `${Math.abs(d)} pts`, dir: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' };
    }
    if (k.prev <= 0) return null;
    const pct = Math.round(((k.value - k.prev) / k.prev) * 100);
    return { text: `${Math.abs(pct)}%`, dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

/** Fecha de columna (fmtDate de TablaReport) según la granularidad del informe. */
export function fmtTablaDate(iso: string, lang: DmLang, granularity?: 'day' | 'week' | 'month'): string {
    const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
    const opts: Intl.DateTimeFormatOptions = granularity === 'month'
        ? { month: 'short', year: 'numeric', timeZone: 'UTC' }
        : granularity === 'week'
            ? { day: 'numeric', month: 'short', timeZone: 'UTC' }
            : { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
    return new Intl.DateTimeFormat(LOCALE[lang], opts).format(d).replace(/\./g, '');
}

/**
 * Celda formateada como fmt() de TablaReport, separando el código de divisa para
 * pintarlo atenuado (regla 21: el importe siempre lleva su divisa).
 */
export function fmtCell(value: unknown, format: DmColFormat, lang: DmLang, currency = 'MXN', granularity?: 'day' | 'week' | 'month'): { value: string; code?: string } {
    if (value === null || value === undefined || value === '') return { value: '—' };
    const n = Number(value);
    switch (format) {
        case 'money':
            return {
                value: new Intl.NumberFormat(LOCALE[lang], { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(n),
                code: currency,
            };
        case 'number': return { value: new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 1 }).format(n) };
        case 'pct': return { value: `${n}%` };
        case 'days': return { value: t(lang, 'inf.t.n_dias').replace('{n}', new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 1 }).format(n)) };
        case 'date': return { value: fmtTablaDate(String(value), lang, granularity) };
        default: return { value: String(value) };
    }
}

// ── Ventas por cliente · últimos 30 días ─────────────────────────────────────
// Suma de "Vendido" = CERRADO_30 y de "Ventas" = VENTAS_30.
export const VENTAS_CLIENTE: DmRow[] = [
    { cliente: 'Distribuidora El Zarco', cotizaciones: 7, ventas: 5, vendido: 386200, ultima: '2026-10-06', desde: '2024-02-14', saldo: 41620 },
    { cliente: 'Constructora GAMA', cotizaciones: 6, ventas: 4, vendido: 248900, ultima: '2026-10-02', desde: '2023-11-08', saldo: 20000 },
    { cliente: 'Northline Builders', cotizaciones: 3, ventas: 2, vendido: 196300, ultima: '2026-09-29', desde: '2026-03-19', saldo: 0 },
    { cliente: 'Grupo Edificador Norte', cotizaciones: 5, ventas: 3, vendido: 141800, ultima: '2026-10-01', desde: '2024-07-22', saldo: 64380 },
    { cliente: 'Obras Levante S.L.', cotizaciones: 2, ventas: 1, vendido: 118900, ultima: '2026-09-24', desde: '2026-05-06', saldo: 0 },
    { cliente: 'Ferretera Industrial del Bajío', cotizaciones: 6, ventas: 4, vendido: 96300, ultima: '2026-10-05', desde: '2025-01-30', saldo: 52000 },
    { cliente: 'Constructora Apex', cotizaciones: 3, ventas: 2, vendido: 74200, ultima: '2026-09-24', desde: '2025-04-17', saldo: 0 },
    { cliente: 'Acabados Monterrey', cotizaciones: 4, ventas: 3, vendido: 21900, ultima: '2026-09-28', desde: '2024-10-11', saldo: 10000 },
    { cliente: 'Inmobiliaria Altavista', cotizaciones: 2, ventas: 0, vendido: 0, ultima: '2026-08-21', desde: '2025-08-02', saldo: 87310 },
    { cliente: 'Desarrollos Sierra Madre', cotizaciones: 3, ventas: 0, vendido: 0, ultima: null, desde: '2025-06-12', saldo: 0 },
].map((r) => ({ ...r, ticket: Number(r.ventas) > 0 ? Math.round(Number(r.vendido) / Number(r.ventas)) : null }));

export const VENTAS_CLIENTE_COLS: DmCol[] = [
    { key: 'cliente', label: 'inf.t.cliente', format: 'text' },
    { key: 'cotizaciones', label: 'inf.t.cotizaciones', format: 'number' },
    { key: 'ventas', label: 'inf.t.ventas', format: 'number' },
    { key: 'vendido', label: 'inf.t.vendido', format: 'money' },
    { key: 'ticket', label: 'inf.t.ticket', format: 'money' },
    { key: 'ultima', label: 'inf.t.ultima_venta', format: 'date' },
    { key: 'desde', label: 'inf.t.cliente_desde', format: 'date' },
    { key: 'saldo', label: 'inf.t.saldo_hoy', format: 'money' },
];

const sum = (rows: DmRow[], key: string) => rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);

export const VENTAS_CLIENTE_KPIS: DmKpi[] = [
    { label: 'inf.t.clientes_compraron', format: 'number', value: 8, prev: 7 },
    { label: 'inf.t.vendido', format: 'money', value: CERRADO_30, prev: CERRADO_30_PREV },
    { label: 'inf.t.ticket', format: 'money', value: TICKET_30, prev: TICKET_30_PREV },
    { label: 'inf.t.recurrencia', format: 'pct', value: 63, prev: 58 },
];

export const VENTAS_CLIENTE_TOTALS: DmRow = {
    cotizaciones: sum(VENTAS_CLIENTE, 'cotizaciones'),
    ventas: sum(VENTAS_CLIENTE, 'ventas'),
    vendido: CERRADO_30,
    ticket: TICKET_30,
    saldo: sum(VENTAS_CLIENTE, 'saldo'),
};

// ── Ventas en el tiempo · últimos 90 días, por semana ─────────────────────────
// 91 días → granularidad automática "Semana" (autoGranularity de informes-tabla.ts).
// Cada periodo es el lunes de su semana, como date_trunc('week').
const SEMANAS: [string, number, number, number, number, number][] = [
    // periodo, cotizaciones, cotizado, ventas, vendido, cobrado
    ['2026-07-06', 9, 512400, 4, 198600, 176300],
    ['2026-07-13', 11, 604900, 5, 254100, 231800],
    ['2026-07-20', 8, 455200, 4, 221300, 240100],
    ['2026-07-27', 12, 688300, 6, 312400, 265900],
    ['2026-08-03', 10, 571600, 5, 268900, 281300],
    ['2026-08-10', 9, 498700, 5, 247500, 236200],
    ['2026-08-17', 13, 742100, 7, 356800, 302400],
    ['2026-08-24', 11, 619300, 6, 289700, 271500],
    ['2026-08-31', 10, 566800, 5, 276200, 248700],
    ['2026-09-07', 12, 701500, 6, 318900, 296100],
    ['2026-09-14', 9, 528400, 5, 262300, 251600],
    ['2026-09-21', 11, 634700, 6, 301700, 268900],
    ['2026-09-28', 10, 587200, 5, 282600, 247800],
    ['2026-10-05', 5, 302600, 2, 151800, 118200],
];
export const VENTAS_TIEMPO: DmRow[] = SEMANAS.map(([periodo, cotizaciones, cotizado, ventas, vendido, cobrado]) => ({
    periodo, cotizaciones, cotizado, ventas, vendido, ticket: Math.round(vendido / ventas), cobrado,
}));
export const VENTAS_TIEMPO_COLS: DmCol[] = [
    { key: 'periodo', label: 'inf.t.periodo', format: 'date' },
    { key: 'cotizaciones', label: 'inf.t.cotizaciones', format: 'number' },
    { key: 'cotizado', label: 'inf.t.cotizado', format: 'money' },
    { key: 'ventas', label: 'inf.t.ventas', format: 'number' },
    { key: 'vendido', label: 'inf.t.vendido', format: 'money' },
    { key: 'ticket', label: 'inf.t.ticket', format: 'money' },
    { key: 'cobrado', label: 'inf.t.cobrado', format: 'money' },
];
const VT_VENDIDO = sum(VENTAS_TIEMPO, 'vendido');
const VT_VENTAS = sum(VENTAS_TIEMPO, 'ventas');
const VT_COBRADO = sum(VENTAS_TIEMPO, 'cobrado');
export const VENTAS_TIEMPO_KPIS: DmKpi[] = [
    { label: 'inf.t.vendido', format: 'money', value: VT_VENDIDO, prev: 3341800 },
    { label: 'inf.t.ventas', format: 'number', value: VT_VENTAS, prev: 65 },
    { label: 'inf.t.ticket', format: 'money', value: VT_VENDIDO / VT_VENTAS, prev: 51412 },
    { label: 'inf.t.cobrado', format: 'money', value: VT_COBRADO, prev: 2988500 },
];
export const VENTAS_TIEMPO_TOTALS: DmRow = {
    cotizaciones: sum(VENTAS_TIEMPO, 'cotizaciones'),
    cotizado: sum(VENTAS_TIEMPO, 'cotizado'),
    ventas: VT_VENTAS,
    vendido: VT_VENDIDO,
    ticket: VT_VENDIDO / VT_VENTAS,
    cobrado: VT_COBRADO,
};

// ── Informe personalizado · Agrupar por País ─────────────────────────────────
// Cohorte: cotizaciones CREADAS en los últimos 30 días y lo que pasó con ellas.
// El orden es el de getExplorer(): primera métrica descendente.
export const EXPLORER_METRICS = ['cotizaciones', 'ganadas', 'vendido', 'tasa', 'ticket'] as const;
export const EXPLORER_PAISES: { code: string; cotizaciones: number; ganadas: number; vendido: number }[] = [
    { code: 'MX', cotizaciones: 31, ganadas: 17, vendido: 889400 },
    { code: 'US', cotizaciones: 6, ganadas: 3, vendido: 251700 },
    { code: 'ES', cotizaciones: 4, ganadas: 2, vendido: 163500 },
    { code: 'CO', cotizaciones: 3, ganadas: 1, vendido: 46800 },
    { code: 'CA', cotizaciones: 2, ganadas: 1, vendido: 38900 },
    { code: 'CL', cotizaciones: 1, ganadas: 0, vendido: 0 },
];
export function explorerRows(lang: DmLang): DmRow[] {
    const names = new Intl.DisplayNames([lang], { type: 'region' });
    return EXPLORER_PAISES.map((p) => ({
        label: names.of(p.code) ?? p.code,
        cotizaciones: p.cotizaciones,
        ganadas: p.ganadas,
        vendido: p.vendido,
        tasa: Math.round((p.ganadas / p.cotizaciones) * 100),
        ticket: p.ganadas ? Math.round(p.vendido / p.ganadas) : null,
    }));
}
const EX_COT = EXPLORER_PAISES.reduce((s, p) => s + p.cotizaciones, 0);
const EX_GAN = EXPLORER_PAISES.reduce((s, p) => s + p.ganadas, 0);
const EX_VEN = EXPLORER_PAISES.reduce((s, p) => s + p.vendido, 0);
export const EXPLORER_COLS: DmCol[] = [
    { key: 'label', label: 'inf.x.pais', format: 'text' },
    { key: 'cotizaciones', label: 'inf.t.cotizaciones', format: 'number' },
    { key: 'ganadas', label: 'inf.t.ventas', format: 'number' },
    { key: 'vendido', label: 'inf.t.vendido', format: 'money' },
    { key: 'tasa', label: 'inf.t.tasa_cierre', format: 'pct' },
    { key: 'ticket', label: 'inf.t.ticket', format: 'money' },
];
/** KPIs: las cuatro primeras métricas (getExplorer hace config.m.slice(0, 4)). */
export const EXPLORER_KPIS: DmKpi[] = [
    { label: 'inf.t.cotizaciones', format: 'number', value: EX_COT, prev: 41 },
    { label: 'inf.t.ventas', format: 'number', value: EX_GAN, prev: 21 },
    { label: 'inf.t.vendido', format: 'money', value: EX_VEN, prev: 1176400 },
    { label: 'inf.t.tasa_cierre', format: 'pct', value: Math.round((EX_GAN / EX_COT) * 100), prev: 48 },
];
/** Totales del rango completo (no la suma de filas: una tasa no se suma). */
export const EXPLORER_TOTALS: DmRow = {
    cotizaciones: EX_COT, ganadas: EX_GAN, vendido: EX_VEN,
    tasa: Math.round((EX_GAN / EX_COT) * 100), ticket: Math.round(EX_VEN / EX_GAN),
};

/** Informe guardado de la demo (DmReportExplorer saved, DmSaveReport, el correo programado). */
export const SAVED_REPORT = {
    es: 'Ventas por país',
    en: 'Sales by country',
} as const;
