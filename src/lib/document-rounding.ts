// Redondeo de un documento que se factura: línea por línea, y el documento
// como SUMA de esas líneas ya redondeadas.
//
// `calculateDocumentTotals` (packages/elements) trabaja con números crudos a
// propósito: es el motor de la cotización, que negocia un precio y no emite
// nada. Una factura es otra cosa — cada concepto se imprime y se declara con su
// importe a centavos, y la autoridad (el SAT en México, y cualquier lector del
// PDF en el resto del mundo) espera que el total sea la suma de lo impreso.
//
// Redondear el total crudo por separado producía documentos que no cuadraban
// consigo mismos: 10 conceptos de $10.01 al 16% sumaban IVA 16.00 en sus líneas
// y 16.02 en el total, y el validador del CFDI (tolerancia de 1 centavo) los
// rechazaba. El documento quedaba en error con el folio ya asignado.
//
// Lo usan el servidor (fiscal/invoices.ts, fiscal/emit.ts) y el editor de
// facturas en el navegador: el total que ve quien captura y el que se guarda
// salen de la misma función. Sin imports a propósito: se bundlea en el cliente.

import type { DocumentTotals, TaxBreakdown } from '../../packages/elements/src/engine';

export interface RoundedLine {
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    subtotal: number;
    taxAmount: number;
    total: number;
}

export interface RoundedRetencion {
    nombre: string;
    tipo: string;
    tasa: number;
    base: number;
    baseTipo: 'subtotal' | 'impuesto';
    monto: number;
}

export interface RoundedDocument {
    lines: RoundedLine[];
    subtotal: number;
    taxes: number;
    total: number;
    byRate: TaxBreakdown[];
    retenciones: RoundedRetencion[];
    retencionTotal: number;
}

/** Redondeo half-up a `decimals` decimales (0 para JPY/CLP, 3 para KWD/BHD). */
export function roundTo(value: number, decimals = 2): number {
    const f = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * f) / f;
}

/**
 * Pasa los totales crudos del motor a importes de documento.
 *
 * Por línea: la base se redondea y el impuesto se calcula sobre esa base ya
 * redondeada (`base × tasa`), que es como lo recalcula el PAC al timbrar. Con
 * precios que ya incluyen el impuesto, el total de una línea puede diferir un
 * centavo del precio capturado: es el mismo centavo que aparecería en el CFDI.
 */
export function roundDocumentTotals(totals: DocumentTotals, decimals = 2): RoundedDocument {
    const r = (n: number) => roundTo(n, decimals);

    const lines: RoundedLine[] = totals.lineas.map((l) => {
        const subtotal = r(l.base);
        const taxAmount = r(subtotal * l.tax_rate);
        return {
            description: String(l.descripcion || 'Concepto').slice(0, 500),
            quantity: l.cantidad,
            unitPrice: r(l.cantidad ? l.base / l.cantidad : l.base),
            taxRate: l.tax_rate,
            subtotal,
            taxAmount,
            total: r(subtotal + taxAmount),
        };
    });

    const subtotal = r(lines.reduce((s, l) => s + l.subtotal, 0));
    const taxes = r(lines.reduce((s, l) => s + l.taxAmount, 0));

    // Mismo agrupado que el motor (clave a 9 decimales), pero sobre importes
    // redondeados: el desglose por tasa también tiene que sumar lo impreso.
    const mapa = new Map<number, TaxBreakdown>();
    for (const l of lines) {
        const key = Math.round(l.taxRate * 1e9) / 1e9;
        const acc = mapa.get(key) ?? { tasa: l.taxRate, base: 0, impuesto: 0 };
        acc.base = r(acc.base + l.subtotal);
        acc.impuesto = r(acc.impuesto + l.taxAmount);
        mapa.set(key, acc);
    }

    const retenciones: RoundedRetencion[] = totals.retenciones.map((ret) => {
        const base = ret.baseTipo === 'impuesto' ? taxes : subtotal;
        return {
            nombre: ret.nombre,
            tipo: ret.tipo,
            tasa: ret.tasa,
            base,
            baseTipo: ret.baseTipo,
            monto: r(base * ret.tasa),
        };
    });
    const retencionTotal = r(retenciones.reduce((s, x) => s + x.monto, 0));

    return {
        lines,
        subtotal,
        taxes,
        total: r(subtotal + taxes - retencionTotal),
        byRate: [...mapa.values()].sort((a, b) => a.tasa - b.tasa),
        retenciones,
        retencionTotal,
    };
}
