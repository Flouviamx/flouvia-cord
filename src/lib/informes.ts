import type { PermKey } from './permissions';

export const REPORT_IDS = [
    'resumen', 'comercial', 'finanzas', 'flujo', 'cobranza', 'clientes', 'productos',
    'ventas', 'ventas-cliente', 'ventas-producto', 'pagos', 'impuestos', 'recompra', 'vendedores',
] as const;

export type ReportId = typeof REPORT_IDS[number];
export type ReportScope = 'rango' | 'snapshot';
/** `widgets`: tablero personalizable. `tabla`: KPIs + gráfica + tabla exportable (src/lib/informes-tabla.ts). */
export type ReportKind = 'widgets' | 'tabla';
/** Categorías de la biblioteca de informes (estilo Shopify). */
export type ReportGroup = 'resumen' | 'ventas' | 'clientes' | 'productos' | 'finanzas' | 'equipo';

export interface ReportDef {
    id: ReportId;
    label: string;
    labelEn: string;
    group: ReportGroup;
    scope: ReportScope;
    kind: ReportKind;
    perm: PermKey;
    icon: 'overview' | 'pulse' | 'finance' | 'flow' | 'collection' | 'clients' | 'products' | 'sales' | 'payments' | 'tax' | 'cohort' | 'team';
}

export const REPORT_GROUPS: readonly ReportGroup[] = ['resumen', 'ventas', 'clientes', 'productos', 'finanzas', 'equipo'];

export const REPORTS: readonly ReportDef[] = [
    { id: 'resumen', label: 'Resumen', labelEn: 'Overview', group: 'resumen', scope: 'rango', kind: 'widgets', perm: 'analitica', icon: 'overview' },
    { id: 'comercial', label: 'Diagnóstico comercial', labelEn: 'Commercial diagnosis', group: 'resumen', scope: 'rango', kind: 'widgets', perm: 'analitica', icon: 'pulse' },
    { id: 'ventas', label: 'Ventas en el tiempo', labelEn: 'Sales over time', group: 'ventas', scope: 'rango', kind: 'tabla', perm: 'analitica', icon: 'sales' },
    { id: 'ventas-cliente', label: 'Ventas por cliente', labelEn: 'Sales by client', group: 'ventas', scope: 'rango', kind: 'tabla', perm: 'analitica', icon: 'clients' },
    { id: 'ventas-producto', label: 'Ventas por producto', labelEn: 'Sales by product', group: 'ventas', scope: 'rango', kind: 'tabla', perm: 'analitica', icon: 'products' },
    { id: 'clientes', label: 'Clientes', labelEn: 'Clients', group: 'clientes', scope: 'rango', kind: 'widgets', perm: 'analitica', icon: 'clients' },
    { id: 'recompra', label: 'Recompra por cohorte', labelEn: 'Repeat purchase by cohort', group: 'clientes', scope: 'snapshot', kind: 'tabla', perm: 'analitica', icon: 'cohort' },
    { id: 'productos', label: 'Productos', labelEn: 'Products', group: 'productos', scope: 'rango', kind: 'widgets', perm: 'analitica', icon: 'products' },
    { id: 'pagos', label: 'Pagos recibidos', labelEn: 'Payments received', group: 'finanzas', scope: 'rango', kind: 'tabla', perm: 'cobranza', icon: 'payments' },
    { id: 'impuestos', label: 'Impuestos facturados', labelEn: 'Invoiced taxes', group: 'finanzas', scope: 'rango', kind: 'tabla', perm: 'analitica', icon: 'tax' },
    { id: 'finanzas', label: 'Finanzas', labelEn: 'Finance', group: 'finanzas', scope: 'snapshot', kind: 'widgets', perm: 'analitica', icon: 'finance' },
    { id: 'flujo', label: 'Flujo de caja · 90 días', labelEn: 'Cash flow · 90 days', group: 'finanzas', scope: 'snapshot', kind: 'widgets', perm: 'analitica', icon: 'flow' },
    { id: 'cobranza', label: 'Cobranza y cartera', labelEn: 'Collections and receivables', group: 'finanzas', scope: 'snapshot', kind: 'widgets', perm: 'cobranza', icon: 'collection' },
    { id: 'vendedores', label: 'Ventas por vendedor', labelEn: 'Sales by team member', group: 'equipo', scope: 'rango', kind: 'tabla', perm: 'analitica', icon: 'team' },
] as const;

export const REPORT_BY_ID = Object.fromEntries(REPORTS.map((report) => [report.id, report])) as Record<ReportId, ReportDef>;

export function parseReportId(value: string | null | undefined): ReportId {
    return REPORT_IDS.includes(value as ReportId) ? value as ReportId : 'resumen';
}

export function reportLabel(report: ReportDef, locale: 'es' | 'en') {
    return locale === 'en' ? report.labelEn : report.label;
}

/** Granularidad pedida por URL (?g=) para "Ventas en el tiempo"; inválida = automática. */
export function parseGranularity(value: string | null | undefined): 'day' | 'week' | 'month' | undefined {
    return value === 'day' || value === 'week' || value === 'month' ? value : undefined;
}

/** Destinos temporales para redirects 302 y migración de pins. */
export const LEGACY_ROUTES = {
    '/app/analitica': '/app/informes?r=resumen',
    '/app/cfo': '/app/informes?r=finanzas',
    '/app/tesoreria/flujo': '/app/informes?r=flujo',
    // La cobranza con IA salió de tesoreria/ (esa carpeta ya no existe: flujo se
    // fue a informes en ago 2026 y el agente vive ahora junto a Cobranza).
    '/app/tesoreria/cobranza': '/app/cobranza/agente',
} as const;

