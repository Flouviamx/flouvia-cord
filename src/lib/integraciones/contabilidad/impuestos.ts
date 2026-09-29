// El impuesto de Cord, traducido al catálogo de tasas de cada contabilidad. Si
// no hay una tasa idéntica no se aproxima: la factura no se asienta.

import type { LineaConta } from './tipos';

export interface TasaExterna {
    id: string;
    /** Porcentaje, como lo guardan QuickBooks y Xero: 16, no 0.16. */
    pct: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function buscarTasa(opciones: TasaExterna[], tasa: number): string | null {
    const pct = tasa * 100;
    return opciones.find((o) => Math.abs(o.pct - pct) < 0.0001)?.id ?? null;
}

export function tasasDe(lineas: LineaConta[]): number[] {
    return [...new Set(lineas.map((l) => Math.round(l.tasa * 1e6) / 1e6))];
}

export const subtotalDe = (lineas: LineaConta[]) => r2(lineas.reduce((s, l) => s + l.importe, 0));
export const impuestoDe = (lineas: LineaConta[]) => r2(lineas.reduce((s, l) => s + l.impuesto, 0));

/** Un centavo de holgura por línea: cada contabilidad redondea el impuesto a su manera. */
export function cuadra(totalExterno: unknown, esperado: number, lineas: number): boolean {
    const n = Number(totalExterno);
    return Number.isFinite(n) && Math.abs(n - esperado) <= 0.01 * Math.max(1, lineas) + 1e-9;
}
