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
 * Opciones de redondeo del documento.
 *
 * `roundLines` = decimales de la divisa (2 para MXN/EUR, 0 para JPY/CLP, 3 para
 * KWD). Cuando viene, CADA línea se redondea —base e impuesto— y los totales
 * del documento son la SUMA de los valores ya redondeados. Es la regla de
 * cualquier documento fiscal: el CFDI exige que el subtotal sea la suma de los
 * importes de sus conceptos, y la AEAT valida la cuota contra la base por
 * línea. Sin ella, tres líneas de 1.5 × 33.33 al 16% daban un subtotal de
 * documento de 149.98 contra 150.00 de las líneas: el timbrado fallaba y una
 * nota de crédito por el total era imposible de cuadrar.
 *
 * Sin la opción el motor conserva la aritmética sin redondeo de siempre: es la
 * que usan los integradores del paquete publicado y no se cambia por debajo.
 */
export interface RoundingOptions {
    roundLines?: number;
}

const roundTo = (n: number, decimals: number): number => {
    const f = 10 ** decimals;
    return Math.round((n + Number.EPSILON) * f) / f;
};

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
    opts: { ivaIncluido?: boolean } & RoundingOptions = {},
): InvoiceTotals {
    const ivaIncluido = opts.ivaIncluido === true;
    const decimals = opts.roundLines;
    if (decimals !== undefined && !(Number.isInteger(decimals) && decimals >= 0 && decimals <= 4)) {
        throw new RangeError(`calculateInvoiceTotals: roundLines debe ser un entero entre 0 y 4 (recibido: ${decimals}).`);
    }
    const r = (n: number) => (decimals === undefined ? n : roundTo(n, decimals));
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
        let base: number;
        let impuesto: number;
        if (decimals === undefined) {
            base = ivaIncluido ? bruto / (1 + rate) : bruto;
            impuesto = ivaIncluido ? bruto - base : base * rate;
        } else {
            // Con redondeo, el impuesto SIEMPRE es base × tasa redondeado —
            // también con precio con impuesto incluido—, que es lo que el PAC y
            // la AEAT recalculan por su cuenta. Desagregar `bruto − base`
            // podía dejar el impuesto un centavo distinto del que el proveedor
            // fiscal calcula para esa misma base.
            base = ivaIncluido ? r(r(bruto) / (1 + rate)) : r(bruto);
            impuesto = r(base * rate);
        }
        return {
            ...it,
            tax_rate: rate,
            precio_final: precioFinal,
            base,
            impuesto,
            total: r(base + impuesto),
        };
    });

    const subtotal = r(lineas.reduce((sum, l) => sum + l.base, 0));
    const impuestos = r(lineas.reduce((sum, l) => sum + l.impuesto, 0));

    // Agrupado por tasa, en orden ascendente: el exento primero, como se lee en
    // cualquier factura. Se agrupa sobre el número crudo, no sobre el
    // redondeado, para que el desglose sume exactamente el total.
    //
    // La CLAVE del mapa sí se redondea a 9 decimales (misma tolerancia que
    // `close()` en impuestos.ts e impuestos-db.ts): dos líneas con 0.10667 y
    // 0.106670000000001 —el mismo 10.667% mexicano, uno capturado a mano y
    // otro venido de `tasa/100` sobre un `numeric` de Neon— son la MISMA tasa
    // y deben sumar en la misma fila del desglose, no separarse en dos filas
    // que impriman el mismo porcentaje.
    const mapa = new Map<number, TaxBreakdown>();
    for (const l of lineas) {
        const key = Math.round(l.tax_rate * 1e9) / 1e9;
        const acc = mapa.get(key) ?? { tasa: l.tax_rate, base: 0, impuesto: 0 };
        acc.base = r(acc.base + l.base);
        acc.impuesto = r(acc.impuesto + l.impuesto);
        mapa.set(key, acc);
    }

    return {
        lineas,
        subtotal,
        impuestos,
        total: r(subtotal + impuestos),
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
    /**
     * Sobre qué se calcula esta retención. `'subtotal'` (default) es correcto
     * para México, donde la Retención de IVA (10.667%) es 2/3 del IVA del 16%
     * calculado sobre el mismo subtotal — pero no es una ley universal. La
     * ReteIVA colombiana es 15% DEL IVA, no del subtotal: modelarla como
     * 'subtotal' calcula 5.26× de más (15% de 1,000 = 150, cuando la DIAN
     * espera 15% de 190 = 28.50). Cord no reimplementa el régimen especial de
     * cada país — esto es la única bifurcación que necesita para no mentir.
     */
    base?: 'subtotal' | 'impuesto';
}

export interface RetencionApplied {
    nombre: string;
    tipo: string;
    tasa: number;
    /** Monto BASE sobre el que se calculó esta retención (no el tipo — ver baseTipo). */
    base: number;
    monto: number;
    /**
     * Sobre qué se calculó: 'subtotal' o 'impuesto' (ver RetencionInput.base).
     * Viaja en el resultado para que un snapshot guardado (retenciones_snapshot)
     * pueda recalcularse en vivo contra un subtotal nuevo SIN perder de vista
     * si esta retención era del tipo "sobre el IVA" — sin esto, recomputar la
     * ReteIVA colombiana desde su propio snapshot volvía a calcularla sobre el
     * subtotal por default.
     */
    baseTipo: 'subtotal' | 'impuesto';
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
    opts: { ivaIncluido?: boolean; retenciones?: RetencionInput[] } & RoundingOptions = {},
): DocumentTotals {
    const base = calculateInvoiceTotals(items, { ivaIncluido: opts.ivaIncluido, roundLines: opts.roundLines });
    const rnd = (n: number) => (opts.roundLines === undefined ? n : roundTo(n, opts.roundLines));

    const retenciones: RetencionApplied[] = (opts.retenciones ?? []).map((r) => {
        const tasa = Number(r.tasa);
        // Mismo criterio que el resto del motor: una tasa fuera de rango es un
        // error de programación, y un 500 explícito le gana a un documento con
        // una retención mal calculada que nadie audita hasta la auditoría.
        if (!Number.isFinite(tasa) || tasa < 0 || tasa > 1) {
            throw new RangeError(`calculateDocumentTotals: la tasa de retención debe estar entre 0 y 1 (recibido: ${r.tasa}).`);
        }
        const baseTipo: 'subtotal' | 'impuesto' = r.base === 'impuesto' ? 'impuesto' : 'subtotal';
        const baseAmount = baseTipo === 'impuesto' ? base.impuestos : base.subtotal;
        return {
            nombre: String(r.nombre ?? '').slice(0, 80),
            tipo: String(r.tipo ?? 'ret_iva'),
            tasa,
            base: baseAmount,
            monto: rnd(baseAmount * tasa),
            baseTipo,
        };
    }).filter((ret) => ret.tasa > 0);

    const retencionTotal = rnd(retenciones.reduce((sum, ret) => sum + ret.monto, 0));

    return {
        ...base,
        total: rnd(base.total - retencionTotal),
        retenciones,
        retencionTotal,
    };
}
