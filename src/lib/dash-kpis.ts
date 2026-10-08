// KPIs del dashboard que siguen al selector de fechas, calculados sobre la MISMA
// serie diaria del hero (getSerieDiaria, días en la zona del negocio). Lo usan el
// SSR (primer render) y el cliente (cambio de rango), así que nunca difieren.
//
// Definiciones:
//   cobrado / cerrado / cotizado: suma del rango.
//   tasa:   de lo que SALIÓ en el rango (por fecha de creación), cuánto se ganó.
//           Cohorte: comparable entre periodos sin mezclar fechas de cierre.
//   ticket: cerrado del rango entre las ventas que lo forman (por fecha de cierre).

export type SerieDia = {
    fecha: string; cotizado: number; cerrado: number; cobrado: number;
    enviadas?: number; ganadas?: number; ganadasCreadas?: number;
};

export type KpiTotals = {
    cotizado: number; cerrado: number; cobrado: number;
    enviadas: number; ganadas: number; ganadasCreadas: number;
    /** 0–100, o null sin cotizaciones enviadas en el rango. */
    tasa: number | null;
    /** null sin ventas cerradas en el rango. */
    ticket: number | null;
};

export function totalsFor(dias: SerieDia[], desde: string, hasta: string): KpiTotals {
    const t = { cotizado: 0, cerrado: 0, cobrado: 0, enviadas: 0, ganadas: 0, ganadasCreadas: 0 };
    for (const d of dias) {
        if (d.fecha < desde || d.fecha > hasta) continue;
        t.cotizado += d.cotizado; t.cerrado += d.cerrado; t.cobrado += d.cobrado;
        t.enviadas += d.enviadas ?? 0; t.ganadas += d.ganadas ?? 0; t.ganadasCreadas += d.ganadasCreadas ?? 0;
    }
    return {
        ...t,
        tasa: t.enviadas ? Math.round((t.ganadasCreadas / t.enviadas) * 100) : null,
        ticket: t.ganadas ? t.cerrado / t.ganadas : null,
    };
}

/** Variación porcentual; null cuando no hay base (un "+100%" contra cero no dice nada). */
export function deltaPct(current: number | null, previous: number | null): number | null {
    if (current === null || previous === null || previous <= 0) return null;
    return Math.round(((current - previous) / previous) * 100);
}

/** Variación en puntos para tasas (38% → 43% = +5 pts, no "+13%"). */
export function deltaPts(current: number | null, previous: number | null): number | null {
    if (current === null || previous === null) return null;
    return current - previous;
}

/** Serie para la sparkline: por día hasta ~45 puntos; más largo, por semana. */
export function sparkValues(dias: SerieDia[], desde: string, hasta: string, key: 'cobrado' | 'cerrado' | 'cotizado'): number[] {
    const rows = dias.filter((d) => d.fecha >= desde && d.fecha <= hasta);
    if (rows.length <= 45) return rows.map((d) => d[key]);
    const out: number[] = [];
    for (let i = 0; i < rows.length; i += 7) out.push(rows.slice(i, i + 7).reduce((s, d) => s + d[key], 0));
    return out;
}
