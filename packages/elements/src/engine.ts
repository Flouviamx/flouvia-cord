/**
 * Motor Matemático de Cord.
 * Se comparte entre el frontend (CordBuilder) y el backend (/api/cotizaciones)
 * para asegurar 100% de paridad en el cálculo de subtotales, IVA y totales.
 */

// Número FINITO y no-negativo, o el fallback. Cierra el hueco de montos negativos,
// NaN (string basura) o Infinity (JSON 1e999) que envenenarían subtotal/IVA/total.
export const num = (v: unknown, fallback = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export interface EngineItemInput {
    producto_id?: string | null;
    descripcion?: string;
    cantidad?: number | string;
    precio_unitario?: number | string;
    precio_negociado?: number | string | null;
    costo_unitario?: number | string | null;
}

export interface EngineItem {
    producto_id: string | null;
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    precio_negociado: number | null;
    costo_unitario: number | null;
}

// Sanea una línea: números finitos no-negativos y descripción acotada. Se aplica
// UNA vez y el arreglo saneado alimenta todo (subtotal, aprobación, inserts, snapshot).
export function sanitizeItem(it: EngineItemInput): EngineItem {
    const nego = it.precio_negociado;
    const q = num(it.cantidad, 1);
    return {
        producto_id: it.producto_id || null,
        descripcion: String(it.descripcion ?? '').slice(0, 500),
        cantidad: q > 0 ? q : 1,
        precio_unitario: num(it.precio_unitario, 0),
        precio_negociado: (nego === null || nego === undefined) ? null : num(nego, 0),
        costo_unitario: (it.costo_unitario === null || it.costo_unitario === undefined) ? null : num(it.costo_unitario, 0),
    };
}

export interface EngineTotals {
    subtotal: number;
    iva: number;
    total: number;
    sumPrecios: number;
    ivaIncluido: boolean;
    ivaPct: number;
}

export function calculateTotals(items: EngineItemInput[], ivaPct: number, ivaIncluido: boolean): EngineTotals {
    const sanitized = items.map(sanitizeItem);
    
    let sumPrecios = 0;
    for (const it of sanitized) {
        const p = it.precio_negociado ?? it.precio_unitario ?? 0;
        sumPrecios += num(p) * num(it.cantidad, 1);
    }

    let subtotal = 0;
    let iva = 0;
    let total = 0;

    if (ivaIncluido) {
        total = sumPrecios;
        subtotal = total / (1 + ivaPct);
        iva = total - subtotal;
    } else {
        subtotal = sumPrecios;
        iva = subtotal * ivaPct;
        total = subtotal + iva;
    }

    return { subtotal, iva, total, sumPrecios, ivaIncluido, ivaPct };
}
