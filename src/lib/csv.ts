// Helpers compartidos para exportar CSV (productos/clientes) — mismo formato que la importación.

export function csvCell(value: unknown): string {
    const s = String(value ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvFilename(base: string): string {
    const fecha = new Date().toISOString().slice(0, 10);
    return `${base}-${fecha}.csv`;
}
