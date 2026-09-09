export type Cadencia = 'mensual' | 'trimestral' | 'anual';
const months: Record<Cadencia, number> = { mensual: 1, trimestral: 3, anual: 12 };

/** Valida un día ISO o una fecha de cálculo UTC. Para DATE de BD usar antes venceDia(). */
export function recurrenceDay(value: unknown): string {
    if (value instanceof Date) {
        if (!Number.isFinite(value.getTime())) throw new RangeError('Fecha de recurrencia inválida.');
        return value.toISOString().slice(0, 10);
    }
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError('Usa una fecha válida en formato AAAA-MM-DD.');
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new RangeError('La fecha no existe en el calendario.');
    return value;
}

export function proximaEmision(desde: Date, cadencia: Cadencia, diaMes: number): Date {
    recurrenceDay(desde);
    if (!months[cadencia]) throw new RangeError('Cadencia no admitida.');
    const day = Math.min(28, Math.max(1, Math.round(diaMes) || 1));
    return new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth() + months[cadencia], day));
}
