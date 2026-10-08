// Una columna `date` de Postgres como "YYYY-MM-DD".
//
// El driver de Neon convierte `date` en un `Date` de JavaScript (medianoche
// local, como pg-types). `String(fecha).slice(0, 10)` sobre ese objeto no da
// la fecha: da "Sat Nov 07". Así llegaba el vencimiento a la exportación de
// facturas, a las anclas de tiempo y al editor, que al reabrir un borrador lo
// mandaba de vuelta y el servidor lo rechazaba como fecha inválida.
export function dateOnly(value: unknown): string {
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return '';
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }
    const s = String(value ?? '');
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}
