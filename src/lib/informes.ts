import type { PermKey } from './permissions';

export const REPORT_IDS = [
    'resumen', 'comercial', 'finanzas', 'flujo', 'cobranza', 'clientes', 'productos',
] as const;

export type ReportId = typeof REPORT_IDS[number];
export type ReportScope = 'rango' | 'snapshot';

export interface ReportDef {
    id: ReportId;
    label: string;
    labelEn: string;
    group: 'Dirección' | 'Operación';
    scope: ReportScope;
    perm: PermKey;
    icon: 'overview' | 'pulse' | 'finance' | 'flow' | 'collection' | 'clients' | 'products';
}

export const REPORTS: readonly ReportDef[] = [
    { id: 'resumen', label: 'Resumen', labelEn: 'Overview', group: 'Dirección', scope: 'rango', perm: 'analitica', icon: 'overview' },
    { id: 'comercial', label: 'Diagnóstico comercial', labelEn: 'Commercial diagnosis', group: 'Dirección', scope: 'rango', perm: 'analitica', icon: 'pulse' },
    { id: 'finanzas', label: 'Finanzas', labelEn: 'Finance', group: 'Dirección', scope: 'snapshot', perm: 'analitica', icon: 'finance' },
    { id: 'flujo', label: 'Flujo de caja · 90 días', labelEn: 'Cash flow · 90 days', group: 'Dirección', scope: 'snapshot', perm: 'analitica', icon: 'flow' },
    { id: 'cobranza', label: 'Cobranza y cartera', labelEn: 'Collections and receivables', group: 'Operación', scope: 'snapshot', perm: 'cobranza', icon: 'collection' },
    { id: 'clientes', label: 'Clientes', labelEn: 'Clients', group: 'Operación', scope: 'rango', perm: 'analitica', icon: 'clients' },
    { id: 'productos', label: 'Productos', labelEn: 'Products', group: 'Operación', scope: 'rango', perm: 'analitica', icon: 'products' },
] as const;

export const REPORT_BY_ID = Object.fromEntries(REPORTS.map((report) => [report.id, report])) as Record<ReportId, ReportDef>;

export function parseReportId(value: string | null | undefined): ReportId {
    return REPORT_IDS.includes(value as ReportId) ? value as ReportId : 'resumen';
}

export function reportLabel(report: ReportDef, locale: 'es' | 'en') {
    return locale === 'en' ? report.labelEn : report.label;
}

/** Destinos temporales para redirects 302 y migración de pins. */
export const LEGACY_ROUTES = {
    '/app/analitica': '/app/informes?r=resumen',
    '/app/cfo': '/app/informes?r=finanzas',
    '/app/tesoreria/flujo': '/app/informes?r=flujo',
} as const;

