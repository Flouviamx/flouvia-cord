// Periodos de análisis de Cord Ops. Un solo vocabulario para todas las
// pantallas: el valor viaja en `?range=` y nunca se interpola en SQL sin pasar
// por aquí (se convierte a un número de días de una lista cerrada).
export type OpsRange = '7d' | '30d' | '90d';

export const OPS_RANGES: { id: OpsRange; days: number; label: string; title: string }[] = [
    { id: '7d', days: 7, label: '7 días', title: 'Últimos 7 días' },
    { id: '30d', days: 30, label: '30 días', title: 'Últimos 30 días' },
    { id: '90d', days: 90, label: '90 días', title: 'Últimos 90 días' },
];

export function parseOpsRange(value: string | null | undefined): { id: OpsRange; days: number; label: string } {
    return OPS_RANGES.find((range) => range.id === value) ?? OPS_RANGES[1];
}

/**
 * Parte una serie de 2N días en el periodo actual y el inmediatamente
 * anterior, para comparar sin una segunda consulta.
 */
export function splitPeriods<T>(rows: T[], days: number): { current: T[]; previous: T[] } {
    const current = rows.slice(-days);
    const previous = rows.slice(-2 * days, -days);
    return { current, previous: previous.length === current.length ? previous : [] };
}
