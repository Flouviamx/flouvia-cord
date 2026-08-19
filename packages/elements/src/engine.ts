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

/** Redondeo a `dp` decimales — SOLO para mostrar en pantalla. Nunca se aplica
 * dentro de `calculateTotals` (cambiar el redondeo ahí reescribiría en
 * silencio la aritmética de cotizaciones ya guardadas en producción). */
export function roundMoney(n: number, dp = 2): number {
    const f = 10 ** dp;
    return Math.round(n * f) / f;
}

export function calculateTotals(items: EngineItemInput[], ivaPct: number, ivaIncluido: boolean): EngineTotals {
    // `num(ivaPct, 0.16)` NO es la solución aquí: caer en silencio a 16% para
    // una org con IVA 0% (o cualquier NaN/fuera de rango) es un bug PEOR que
    // el que reemplaza — un 500 explícito le gana a un total incorrecto que
    // nadie audita. Este motor lo importa el servidor directamente
    // (src/lib/cotizaciones.ts) para escribir totales reales en producción.
    if (!Number.isFinite(ivaPct) || ivaPct < 0 || ivaPct > 1) {
        throw new RangeError(`calculateTotals: ivaPct debe ser un número entre 0 y 1 (recibido: ${ivaPct}).`);
    }

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

// ── Facturación: una tasa POR LÍNEA ─────────────────────────────────────────
// `calculateTotals` aplana una sola tasa para toda la cotización, que es lo
// correcto ahí: se está negociando un precio, no emitiendo un documento fiscal.
// Una factura es otra cosa. Vender mezclando tasas —un concepto exento junto a
// uno con IVA, o servicios y bienes con tratamiento distinto— es normal en
// cuanto sales de un solo país, y aplanarlo produce un documento que no cuadra
// con lo que la autoridad espera.
//
// Esta función NO reemplaza a la de arriba: la de arriba la usan cotizaciones y
// /api/v1 para escribir totales ya guardados en producción, y tocarla
// reescribiría su aritmética en silencio.

export interface InvoiceItemInput extends EngineItemInput {
    /** Fracción, no porcentaje: 0.16, nunca 16. */
    tax_rate?: number | string | null;
}

export interface InvoiceItem extends EngineItem {
    tax_rate: number;
    /** Precio efectivo por unidad: negociado si existe, si no el de lista. */
    precio_final: number;
    base: number;
    impuesto: number;
    total: number;
}

export interface TaxBreakdown {
    tasa: number;
    base: number;
    impuesto: number;
}

export interface InvoiceTotals {
    lineas: InvoiceItem[];
    subtotal: number;
    impuestos: number;
    total: number;
    /** Base imponible e impuesto agrupados por tasa — lo que imprime el PDF. */
    porTasa: TaxBreakdown[];
    ivaIncluido: boolean;
}

/**
 * Totales de una factura con impuesto por línea.
 *
 * `ivaIncluido = true` significa que los precios capturados YA traen el
 * impuesto dentro: cada línea se desagrega con su propia tasa
 * (`base = precio / (1 + tasa)`), no con una tasa promedio — promediar tasas
 * distintas devuelve una base que no corresponde a ninguna de ellas.
 */
export function calculateInvoiceTotals(
    items: InvoiceItemInput[],
    opts: { ivaIncluido?: boolean } = {},
): InvoiceTotals {
    const ivaIncluido = opts.ivaIncluido === true;
    const lineas: InvoiceItem[] = items.map((raw) => {
        const it = sanitizeItem(raw);
        const rate = Number(raw.tax_rate ?? 0);
        // Mismo criterio que calculateTotals: una tasa fuera de rango es un
        // error de programación, y un 500 explícito le gana a una factura con
        // impuestos mal calculados que nadie audita hasta la auditoría.
        if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
            throw new RangeError(`calculateInvoiceTotals: tax_rate debe estar entre 0 y 1 (recibido: ${raw.tax_rate}).`);
        }
        const precioFinal = it.precio_negociado ?? it.precio_unitario ?? 0;
        const bruto = precioFinal * it.cantidad;
        const base = ivaIncluido ? bruto / (1 + rate) : bruto;
        const impuesto = ivaIncluido ? bruto - base : base * rate;
        return {
            ...it,
            tax_rate: rate,
            precio_final: precioFinal,
            base,
            impuesto,
            total: base + impuesto,
        };
    });

    const subtotal = lineas.reduce((sum, l) => sum + l.base, 0);
    const impuestos = lineas.reduce((sum, l) => sum + l.impuesto, 0);

    // Agrupado por tasa, en orden ascendente: el exento primero, como se lee en
    // cualquier factura. Se agrupa sobre el número crudo, no sobre el
    // redondeado, para que el desglose sume exactamente el total.
    const mapa = new Map<number, TaxBreakdown>();
    for (const l of lineas) {
        const acc = mapa.get(l.tax_rate) ?? { tasa: l.tax_rate, base: 0, impuesto: 0 };
        acc.base += l.base;
        acc.impuesto += l.impuesto;
        mapa.set(l.tax_rate, acc);
    }

    return {
        lineas,
        subtotal,
        impuestos,
        total: subtotal + impuestos,
        porTasa: [...mapa.values()].sort((a, b) => a.tasa - b.tasa),
        ivaIncluido,
    };
}

// ── Retenciones ─────────────────────────────────────────────────────────────
// Un impuesto de consumo se SUMA a la base; una retención se RESTA del total.
// Es el mismo dato con signo contrario, y confundirlos no produce un error
// visible: produce una factura que cuadra consigo misma y no con lo que el
// cliente realmente debe pagar.
//
// Base de cálculo: el SUBTOTAL del documento (suma de bases gravables). Es lo
// correcto para el caso que originó esto —en México la retención de IVA es
// 10.667% del valor de los actos, que es exactamente 2/3 del IVA del 16%— y es
// el criterio que cualquier negocio puede verificar en su propia factura. Cord
// no modela la base especial de cada régimen de cada país: si un negocio
// necesita otra base, ajusta la tasa con su contador.

export interface RetencionInput {
    /** Nombre en el vocabulario del país: 'Retención IVA 10.667%', 'ReteFuente 2,5%'. */
    nombre: string;
    /** Fracción, no porcentaje: 0.10667, nunca 10.667. */
    tasa: number | string;
    /** Subcódigo del país. Solo México lo usa (lo mapea el CFDI). */
    tipo?: string;
}

export interface RetencionApplied {
    nombre: string;
    tipo: string;
    tasa: number;
    base: number;
    monto: number;
}

export interface DocumentTotals extends InvoiceTotals {
    retenciones: RetencionApplied[];
    retencionTotal: number;
}

/**
 * Totales completos de un documento comercial: impuesto por línea + retenciones.
 *
 * Es el motor ÚNICO de cotizaciones y facturas nuevas. `calculateTotals` queda
 * como camino heredado porque escribió los totales que hoy viven en producción
 * y cambiar su aritmética los reescribiría en silencio; `calculateInvoiceTotals`
 * sigue siendo el caso sin retenciones y esta función lo envuelve, no lo repite.
 *
 * `total = subtotal + impuestos − retenciones`.
 */
export function calculateDocumentTotals(
    items: InvoiceItemInput[],
    opts: { ivaIncluido?: boolean; retenciones?: RetencionInput[] } = {},
): DocumentTotals {
    const base = calculateInvoiceTotals(items, { ivaIncluido: opts.ivaIncluido });

    const retenciones: RetencionApplied[] = (opts.retenciones ?? []).map((r) => {
        const tasa = Number(r.tasa);
        // Mismo criterio que el resto del motor: una tasa fuera de rango es un
        // error de programación, y un 500 explícito le gana a un documento con
        // una retención mal calculada que nadie audita hasta la auditoría.
        if (!Number.isFinite(tasa) || tasa < 0 || tasa > 1) {
            throw new RangeError(`calculateDocumentTotals: la tasa de retención debe estar entre 0 y 1 (recibido: ${r.tasa}).`);
        }
        return {
            nombre: String(r.nombre ?? '').slice(0, 80),
            tipo: String(r.tipo ?? 'ret_iva'),
            tasa,
            base: base.subtotal,
            monto: base.subtotal * tasa,
        };
    }).filter((r) => r.tasa > 0);

    const retencionTotal = retenciones.reduce((sum, r) => sum + r.monto, 0);

    return {
        ...base,
        total: base.total - retencionTotal,
        retenciones,
        retencionTotal,
    };
}
