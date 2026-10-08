// Núcleo del editor de documentos (cotización, factura y nueva versión).
//
// Hasta oct 2026 esta lógica vivía copiada en tres páginas —cotizaciones/nueva,
// facturas/nueva y cotizaciones/[id]/editar— y cada copia tenía bugs distintos:
// una aplicaba el descuento del cliente sobre la lista y otra sobre el precio
// negociado, una perdía el descuento al cruzar un tramo de volumen, una
// redondeaba "a centavos" una divisa sin decimales, una solo admitía
// cantidades enteras. Aquí vive UNA vez, sin DOM, y se prueba en
// test/editor-core.test.ts. La página solo pinta y escucha.
//
// Sin imports de servidor: este módulo se bundlea en el navegador.

import { calculateDocumentTotals, type DocumentTotals } from '../../../packages/elements/src/engine';
import { roundDocumentTotals, roundTo } from '../document-rounding';

export interface VolTier { min: number; precio: number }

export interface CatalogProduct {
    id: string;
    nombre: string;
    sku?: string | null;
    unidad: string;
    precio: number;
    costo?: number | null;
    preciosVolumen?: VolTier[] | null;
    existencias?: number | null;
}

export interface KitItemDef {
    productoId: string | null;
    descripcion: string;
    cantidad: number;
    precio: number | null;
    unidad: string | null;
}

export interface KitDef {
    id: string;
    nombre: string;
    precioCombo: number | null;
    items: KitItemDef[];
}

export interface Line {
    /** Identidad estable de la fila en pantalla (no es un id de base de datos). */
    key: string;
    productoId: string | null;
    nombre: string;
    unidad: string;
    /** Precio de lista del catálogo, sin volumen ni descuento. */
    baseLista: number;
    /** Precio de lista vigente para la cantidad (tramo de volumen incluido). */
    lista: number;
    vol: VolTier[];
    costo: number;
    /** Precio pactado. `null` = se cobra el de lista. */
    negociado: number | null;
    /** El vendedor escribió el precio: nada automático lo vuelve a tocar. */
    negoTouched: boolean;
    cantidad: number;
    taxRate: number;
    /** Línea libre que llegó sin precio (renglón de un kit): no se guarda en $0 sin que alguien lo decida. */
    precioPendiente?: boolean;
    existencias?: number | null;
    /** El precio vino de la lista B2B del cliente. */
    b2b?: boolean;
    pricing?: PricingSuggestion | null;
}

export interface PricingSuggestion {
    suggestedPrice: number | null;
    suggestedDiscountPct?: number | null;
    bands?: { band: number; winRate: number }[];
}

/** Cómo se fija el precio automático de una línea de catálogo. */
export interface PricingContext {
    /** Descuento por nivel del cliente, en porcentaje (10 = 10%). */
    discountPct: number;
    /** Decimales de la divisa del documento (0 para JPY/CLP). */
    decimals: number;
    /** Precio de la lista B2B del cliente para ese producto, si aplica. */
    b2b?: (productoId: string) => number | null;
}

let seq = 0;
export const newKey = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

const finite = (v: unknown, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

/** Tramos de volumen limpios y ordenados por mínimo ascendente. */
export function normalizeTiers(tiers: unknown): VolTier[] {
    if (!Array.isArray(tiers)) return [];
    return tiers
        .map((t: any) => ({ min: finite(t?.min), precio: finite(t?.precio) }))
        .filter((t) => t.min > 0 && t.precio > 0)
        .sort((a, b) => a.min - b.min);
}

/**
 * Precio de lista para una cantidad: el del tramo más alto que la cantidad ya
 * alcanzó, o el base. Al BAJAR la cantidad vuelve al tramo que corresponde
 * (antes se quedaba con el precio del tramo alto para siempre).
 */
export function volumePrice(base: number, tiers: VolTier[], qty: number): { price: number; min: number } {
    let price = base;
    let min = 0;
    for (const t of tiers) {
        if (qty >= t.min) { price = t.precio; min = t.min; }
    }
    return { price, min };
}

/** Precio con el descuento del cliente, redondeado a los decimales de la divisa. */
export function discounted(price: number, pct: number, decimals: number): number | null {
    if (!(pct > 0)) return null;
    return roundTo(price * (1 - pct / 100), decimals);
}

/**
 * Precio automático de una línea de catálogo: la lista B2B del cliente manda;
 * si no hay, su descuento por nivel sobre la lista VIGENTE (con volumen); si
 * tampoco, `null` (se cobra la lista). Un precio que el vendedor escribió no
 * pasa por aquí.
 */
export function autoPrice(line: Pick<Line, 'productoId' | 'lista'>, ctx: PricingContext): { negociado: number | null; b2b: boolean } {
    if (!line.productoId) return { negociado: null, b2b: false };
    const b2b = ctx.b2b?.(line.productoId) ?? null;
    if (b2b !== null) return { negociado: b2b, b2b: true };
    return { negociado: discounted(line.lista, ctx.discountPct, ctx.decimals), b2b: false };
}

function applyAuto(line: Line, ctx: PricingContext): Line {
    if (line.negoTouched || !line.productoId) return line;
    const { negociado, b2b } = autoPrice(line, ctx);
    line.negociado = negociado;
    line.b2b = b2b;
    return line;
}

export function lineFromProduct(p: CatalogProduct, ctx: PricingContext, taxRate: number, cantidad = 1): Line {
    const vol = normalizeTiers(p.preciosVolumen);
    const base = finite(p.precio);
    const line: Line = {
        key: newKey(),
        productoId: p.id,
        nombre: p.nombre,
        unidad: p.unidad || 'pieza',
        baseLista: base,
        lista: volumePrice(base, vol, cantidad).price,
        vol,
        costo: finite(p.costo),
        negociado: null,
        negoTouched: false,
        cantidad,
        taxRate,
        existencias: p.existencias ?? null,
    };
    return applyAuto(line, ctx);
}

export function freeLine(taxRate: number, init: Partial<Pick<Line, 'nombre' | 'cantidad' | 'unidad'>> & { precio?: number | null } = {}): Line {
    const precio = init.precio ?? null;
    return {
        key: newKey(),
        productoId: null,
        nombre: init.nombre ?? '',
        unidad: init.unidad || 'pieza',
        baseLista: precio ?? 0,
        lista: precio ?? 0,
        vol: [],
        costo: 0,
        negociado: null,
        negoTouched: false,
        cantidad: init.cantidad ?? 1,
        taxRate,
        precioPendiente: precio === null,
    };
}

/**
 * Renglones de un kit, multiplicados. Con precio de combo, el precio fijo del
 * kit se reparte entre las líneas de catálogo en proporción a su lista y queda
 * como precio pactado (`negoTouched`), para que cambiar de cliente no lo pise.
 * Las partidas libres no tienen lista contra qué repartir: llegan con el precio
 * pendiente en vez de un $0 que nadie decidió.
 */
export function linesFromKit(
    kit: KitDef,
    mult: number,
    catalog: Map<string, CatalogProduct>,
    ctx: PricingContext,
    taxRate: number,
): { lines: Line[]; ahorro: number } {
    const m = Math.max(1, Math.floor(finite(mult, 1)));
    const lines: Line[] = [];
    const catalogLines: { line: Line; unitQty: number }[] = [];
    let sumaUno = 0;
    for (const it of kit.items) {
        const unitQty = finite(it.cantidad, 1) || 1;
        const p = it.productoId ? catalog.get(it.productoId) : undefined;
        if (p) {
            const line = lineFromProduct(p, ctx, taxRate, unitQty * m);
            lines.push(line);
            catalogLines.push({ line, unitQty });
            sumaUno += unitQty * line.baseLista;
        } else {
            lines.push(freeLine(taxRate, { nombre: it.descripcion, cantidad: unitQty * m, unidad: it.unidad || 'pieza' }));
        }
    }
    let ahorro = 0;
    if (kit.precioCombo != null && kit.precioCombo > 0 && sumaUno > 0) {
        const ratio = kit.precioCombo / sumaUno;
        for (const { line } of catalogLines) {
            line.negociado = roundTo(line.baseLista * ratio, ctx.decimals);
            line.negoTouched = true;
            line.b2b = false;
        }
        ahorro = (sumaUno - kit.precioCombo) * m;
    }
    return { lines, ahorro };
}

/** Cantidad nueva: recalcula el tramo de volumen y, si el precio no se tocó, el automático. */
export function setQuantity(line: Line, qty: number, ctx: PricingContext): Line {
    line.cantidad = qty;
    if (line.productoId) {
        line.lista = volumePrice(line.baseLista, line.vol, qty > 0 ? qty : 1).price;
        applyAuto(line, ctx);
    }
    return line;
}

/** Precio escrito por el vendedor. `null` = campo vacío (se valida al guardar). */
export function setPrice(line: Line, value: number | null): Line {
    line.negoTouched = true;
    line.b2b = false;
    line.precioPendiente = false;
    if (line.productoId) {
        line.negociado = value;
        // Vacío no es "volver a la lista": es un precio que falta, y se marca
        // igual que en una línea libre en vez de cobrar la lista en silencio.
        line.precioPendiente = value === null;
    } else {
        // Una línea libre no tiene lista: el precio que se escribe ES su lista.
        line.lista = value ?? 0;
        line.baseLista = line.lista;
        line.negociado = null;
        line.precioPendiente = value === null;
    }
    return line;
}

/**
 * Cambio de cliente (o de divisa): recalcula el precio automático de cada línea
 * de catálogo que el vendedor NO tocó. Antes se reseteaban todas, y un precio
 * negociado a mano, un combo de kit o un precio de la IA se perdían al elegir
 * otro cliente.
 */
export function repriceForClient(lines: Line[], ctx: PricingContext): Line[] {
    for (const l of lines) applyAuto(l, ctx);
    return lines;
}

export const unitPrice = (l: Pick<Line, 'negociado' | 'lista'>) => l.negociado ?? l.lista;
export const lineAmount = (l: Pick<Line, 'negociado' | 'lista' | 'cantidad'>) => unitPrice(l) * l.cantidad;

/** Margen bruto en %, o `null` si la línea no tiene costo o precio. */
export function margenPct(l: Pick<Line, 'costo' | 'negociado' | 'lista'>): number | null {
    const precio = unitPrice(l);
    return l.costo > 0 && precio > 0 ? (precio - l.costo) / precio * 100 : null;
}

export type LineProblem = 'descripcion' | 'cantidad' | 'precio';

/** Primera línea que no se puede guardar, y por qué. */
export function firstInvalidLine(lines: Line[]): { key: string; index: number; problem: LineProblem } | null {
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (!l.nombre.trim()) return { key: l.key, index: i, problem: 'descripcion' };
        if (!(l.cantidad > 0) || !Number.isFinite(l.cantidad)) return { key: l.key, index: i, problem: 'cantidad' };
        const p = unitPrice(l);
        if (l.precioPendiente || p === null || !Number.isFinite(p) || p < 0) return { key: l.key, index: i, problem: 'precio' };
    }
    return null;
}

/** Lo que viaja al servidor: el mismo shape para cotización y factura. */
export function payloadItems(lines: Line[]) {
    return lines.map((l) => ({
        producto_id: l.productoId,
        descripcion: l.nombre.trim(),
        cantidad: l.cantidad,
        unidad: l.unidad,
        precio_unitario: l.lista,
        precio_negociado: l.productoId ? l.negociado : null,
        costo_unitario: l.costo || 0,
        tax_rate: l.taxRate,
    }));
}

export interface Summary {
    subtotal: number;
    total: number;
    taxes: { tasa: number; impuesto: number }[];
    retenciones: { nombre: string; monto: number }[];
    lineCount: number;
    pieces: number;
    /** Cuánto se le descontó al cliente contra la lista. */
    saved: number;
}

/**
 * Totales del documento con el MISMO motor que el servidor. La factura además
 * redondea línea por línea (document-rounding.ts) porque así se emite; la
 * cotización guarda los totales crudos del motor.
 */
export function summarize(
    lines: Line[],
    opts: { ivaIncluido: boolean; retenciones: { nombre: string; tasa: number; tipo?: string; base?: 'subtotal' | 'impuesto' }[]; roundLinesTo: number | null },
): Summary {
    const totals: DocumentTotals = calculateDocumentTotals(
        lines.map((l) => ({
            descripcion: l.nombre,
            cantidad: l.cantidad > 0 ? l.cantidad : 0,
            precio_unitario: l.lista,
            precio_negociado: l.productoId ? l.negociado : null,
            tax_rate: l.taxRate,
        })),
        { ivaIncluido: opts.ivaIncluido, retenciones: opts.retenciones },
    );
    let subtotal = totals.subtotal;
    let total = totals.total;
    let taxes = totals.porTasa.map((t) => ({ tasa: t.tasa, impuesto: t.impuesto }));
    let retenciones = totals.retenciones.map((r) => ({ nombre: r.nombre, monto: r.monto }));
    if (opts.roundLinesTo !== null) {
        const r = roundDocumentTotals(totals, opts.roundLinesTo);
        subtotal = r.subtotal;
        total = r.total;
        taxes = r.byRate.map((t) => ({ tasa: t.tasa, impuesto: t.impuesto }));
        retenciones = r.retenciones.map((x) => ({ nombre: x.nombre, monto: x.monto }));
    }
    const saved = lines.reduce((s, l) => {
        const p = unitPrice(l);
        return s + (l.productoId && l.lista > p ? (l.lista - p) * Math.max(0, l.cantidad) : 0);
    }, 0);
    return {
        subtotal,
        total,
        taxes: taxes.filter((t) => t.impuesto > 0),
        retenciones,
        lineCount: lines.length,
        pieces: lines.reduce((s, l) => s + (l.cantidad > 0 ? l.cantidad : 0), 0),
        saved,
    };
}

/**
 * Lee un número escrito por una persona. Acepta coma decimal ("1,5") y
 * separadores de miles comunes ("1,234.50", "1.234,50"); devuelve `null` si el
 * campo está vacío o no es un número.
 */
export function parseAmount(raw: string): number | null {
    let s = String(raw ?? '').trim().replace(/\s/g, '');
    if (!s) return null;
    const commas = s.split(',').length - 1;
    const dots = s.split('.').length - 1;
    if (commas && dots) {
        // Los dos: el último separador es el decimal; el otro, de miles.
        s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (commas > 1 || dots > 1) {
        // El mismo separador repetido solo puede ser de miles: 1,234,567 o 1.234.567.
        if (!/^-?\d{1,3}([.,]\d{3})+$/.test(s)) return null;
        s = s.replace(/[.,]/g, '');
    } else if (commas === 1) {
        // Una sola coma es de miles solo con exactamente tres dígitos detrás y
        // una parte entera que no sea cero: 1,234 es mil doscientos; 0,125 y
        // 1,5 son decimales.
        const [int, frac] = s.split(',');
        s = frac.length === 3 && /^-?[1-9]\d{0,2}$/.test(int) ? int + frac : `${int}.${frac}`;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

/**
 * Cantidad escrita junto a la búsqueda: "40 tubo", "40x tubo" o "tubo x40"
 * agregan 40. Sin número (o con uno que no es positivo), la cantidad es 1 y el
 * texto se busca tal cual.
 */
export function parseQuery(text: string): { qty: number; term: string } {
    const t = String(text ?? '');
    const lead = /^\s*(\d+(?:[.,]\d+)?)\s*(?:x|×|\*)?\s+(.+)$/i.exec(t);
    const tail = /^(.+?)\s+(?:x|×|\*)\s*(\d+(?:[.,]\d+)?)\s*$/i.exec(t);
    const num = (v: string) => parseAmount(v) ?? 0;
    if (lead && num(lead[1]) > 0) return { qty: num(lead[1]), term: lead[2] };
    if (tail && num(tail[2]) > 0) return { qty: num(tail[2]), term: tail[1] };
    return { qty: 1, term: t };
}
