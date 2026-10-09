// Francia: qué se transmite de cada documento y cómo, sacado SOLO del snapshot
// congelado de la factura y de su modelo EN 16931 (einvoice/model.ts). Sin
// base de datos ni red: lo usan la cola (cola.ts), la pantalla y las pruebas.
//
//   B2B     factura entre empresas establecidas en Francia → se TRANSMITE
//           (flujo 2) y sus cobros, si la TVA es exigible al cobro, se
//           comunican como estado 212 "Encaissée" (flujo 6).
//   B2BINT  factura con una empresa establecida fuera de Francia → bloque 10.1
//           del e-reporting, y sus cobros en el 10.2.
//   B2C     venta a un particular → agregado diario por divisa y categoría
//           (bloque 10.3), y lo cobrado en el día (10.4).
//
// Fuentes: DGFiP, Dossier général v3.2, §3.7 (e-reporting) y nota 119 ("les
// données de paiement ne doivent être transmises qu'en cas de prestations de
// services, hors opérations donnant lieu à autoliquidation de la TVA et
// option de TVA sur les débits"); Annexe 7 v1.9, G2.19 (identificadores de las
// partes: 0002 SIREN, 0223 TVA intracomunitaria, 0227 fuera de la UE) y G7.45
// (el cobro se reparte por tasa); FAQ de la DGFiP (ago 2026): los pagos solo
// cuando la TVA es exigible al cobro. Categorías del 10.3 (TLB1, TPS1, TNT1)
// y límites de campos: OpenAPI del operador de Iopole, scripts/fixtures/iopole/.

import type { FiscalLineItem } from '../index';
import type { EInvoiceSource, En16931Invoice, EnLine, EnParty } from '../einvoice/model';
import { cadreDe, fluxFr, sirenDe, tasaFrancesa, type CadreFacturation, type FluxFr } from '../einvoice/fr-ctc';
import { isEuCountry } from '../../countries';
import type {
    CategoriaTransaccion, FechaExigibilidad, ParteReporte, ReporteFactura, ReportePagoTransacciones, ReporteTransacciones,
} from './proveedor';

const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const cents = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100);
const clean = (v: unknown) => String(v ?? '').trim();

/** Por qué un documento no se puede transmitir o reportar, para quien lo puede arreglar. */
export interface Bloqueo {
    codigo: string;
    es: string;
    en: string;
}

const b = (codigo: string, es: string, en: string): Bloqueo => ({ codigo, es, en });

export const esNotaCredito = (src: Pick<EInvoiceSource, 'documentType' | 'creditNoteOf'>) =>
    !!src.creditNoteOf || /credit_note|egreso/.test(String(src.documentType || ''));

export interface Clasificacion {
    flux: FluxFr;
    cadre: CadreFacturation | null;
    notaCredito: boolean;
    siren: string | null;
}

/** El tratamiento del documento de un emisor francés, o null si el emisor no está en Francia. */
export function clasificar(src: EInvoiceSource): Clasificacion | null {
    const flux = fluxFr(src.issuer, src.recipient);
    if (!flux) return null;
    return {
        flux,
        cadre: cadreDe(Array.isArray(src.lines) ? src.lines : []),
        notaCredito: esNotaCredito(src),
        siren: sirenDe(src.issuer)?.siren ?? null,
    };
}

// ── Cobros: qué parte de un pago se comunica y a qué tasa ───────────────────

/** Categorías cuya TVA es francesa y exigible: ni autoliquidación, ni fuera de ámbito, ni exportación. */
const CATEGORIAS_COBRO = new Set(['S', 'E', 'Z']);

/**
 * Lo que de un pago (positivo) o de una devolución (negativa) se comunica,
 * repartido por tasa (G7.45). Solo las prestaciones de servicios sin la
 * opción por los débitos tienen la TVA exigible al cobro; si el documento no
 * tiene ninguna, `null`: ese pago no se comunica. En una factura mixta el pago
 * se reparte en proporción al importe con impuesto de cada grupo, así que solo
 * viaja la parte que corresponde a los servicios.
 */
export function cobroPorTasa(src: EInvoiceSource, inv: En16931Invoice, importe: number): { tasa: number; importe: number }[] | null {
    if (src.issuer?.vatOnDebits) return null;
    const lines = Array.isArray(src.lines) ? src.lines : [];
    const total = Number(inv.totals.payable) || 0;
    if (!(total > 0) || lines.length !== inv.lines.length) return null;
    const grupos = new Map<number, number>(); // tasa → importe con impuesto, en céntimos
    inv.lines.forEach((en, i) => {
        if (lines[i]?.nature !== 'services' || !CATEGORIAS_COBRO.has(en.category)) return;
        grupos.set(en.rate, (grupos.get(en.rate) ?? 0) + cents(en.taxable + en.tax));
    });
    if (!grupos.size) return null;
    const totalCents = cents(total);
    const elegibles = [...grupos.values()].reduce((s, x) => s + x, 0);
    const objetivo = Math.round((cents(importe) * elegibles) / totalCents);
    const reparto = [...grupos.entries()].map(([tasa, ttc]) => ({ tasa, c: Math.round((cents(importe) * ttc) / totalCents) }));
    // El redondeo por grupo puede dejar un céntimo suelto: va al grupo mayor.
    const resto = objetivo - reparto.reduce((s, r) => s + r.c, 0);
    if (resto) reparto.sort((x, y) => Math.abs(y.c) - Math.abs(x.c))[0].c += resto;
    return reparto
        .filter((r) => r.c !== 0)
        .sort((x, y) => y.tasa - x.tasa)
        .map((r) => ({ tasa: r.tasa, importe: r.c / 100 }));
}

/**
 * Un importe en euros para el e-reporting de pagos, que no lleva divisa: el
 * de la factura si ya es en euros o con el tipo de cambio CONGELADO del
 * documento (regla 22: una tasa con fecha, no una inventada). Sin él, null.
 */
export function enEuros(importe: number, src: Pick<EInvoiceSource, 'currency' | 'ledgerCurrency' | 'fxRate'>): number | null {
    if (clean(src.currency).toUpperCase() === 'EUR') return round2(importe);
    const fx = Number(src.fxRate);
    if (clean(src.ledgerCurrency).toUpperCase() === 'EUR' && Number.isFinite(fx) && fx > 0) return round2(importe * fx);
    return null;
}

// ── Bloque 10.1: factura con una empresa establecida fuera de Francia ───────

/** Iopole acota el número de factura del e-reporting a 20 caracteres (BT-1, `maxLength: 20`). */
export const MAX_NUMERO_REPORTE = 20;

function identificadorComprador(p: EnParty): { esquema: string; valor: string } {
    // G2.19: dentro de la UE, su TVA intracomunitaria (0223); fuera, el código
    // del país y los 16 primeros caracteres de la razón social (0227).
    if (isEuCountry(p.address.country) && p.vatId) return { esquema: '0223', valor: p.vatId.slice(0, 18) };
    return { esquema: '0227', valor: `${p.address.country}${p.name}`.slice(0, 18) };
}

function parte(p: EnParty, identificador: { esquema: string; valor: string }): ParteReporte {
    return {
        nombre: p.name,
        tva: p.vatId ?? null,
        pais: p.address.country,
        direccion: { linea1: p.address.line1 ?? null, ciudad: p.address.city ?? null, cp: p.address.postalCode ?? null },
        identificador,
    };
}

function exigibilidadDe(cadre: CadreFacturation, debitos: boolean): FechaExigibilidad | null {
    if (cadre === 'B1') return 'entrega';
    if (debitos) return 'factura';
    return cadre === 'S1' ? 'cobro' : null;
}

export function reporteFactura(src: EInvoiceSource, inv: En16931Invoice): { reporte: ReporteFactura } | { bloqueo: Bloqueo } {
    const c = clasificar(src);
    if (!c || c.flux !== 'B2BINT') return { bloqueo: b('no_aplica', 'Esta factura no se reporta como operación con el extranjero.', 'This invoice is not reported as an international transaction.') };
    if (!c.siren) return { bloqueo: b('sin_siren', 'Falta el SIREN de tu negocio en Ajustes › Perfil fiscal.', 'Your business SIREN is missing in Settings › Tax profile.') };
    if (!c.cadre) return { bloqueo: b('sin_categoria', 'Falta decir si cada concepto es un bien o un servicio.', 'Each line must say whether it is goods or a service.') };
    if (inv.number.length > MAX_NUMERO_REPORTE) {
        return { bloqueo: b('numero_largo', `El número de factura pasa de ${MAX_NUMERO_REPORTE} caracteres, el máximo del e-reporting. Acorta el prefijo en Ajustes › Perfil fiscal.`, `The invoice number is longer than ${MAX_NUMERO_REPORTE} characters, the e-reporting maximum. Shorten the prefix in Settings › Tax profile.`) };
    }
    const monedaImpuesto = inv.taxCurrency ?? inv.currency;
    if (monedaImpuesto !== 'EUR') {
        return { bloqueo: b('tva_sin_euros', 'Una factura en otra divisa debe declarar la TVA en euros: lleva tu contabilidad en EUR.', 'An invoice in another currency must state the VAT in euros: keep your books in EUR.') };
    }
    const debitos = !!src.issuer?.vatOnDebits;
    return {
        reporte: {
            numero: inv.number,
            fecha: inv.issueDate,
            tipo: inv.typeCode,
            cadre: c.cadre,
            vencimiento: inv.dueDate ?? null,
            moneda: inv.currency,
            base: inv.totals.taxExclusive,
            impuesto: inv.totals.taxInAccounting ?? inv.totals.tax,
            monedaImpuesto,
            desglose: inv.vat.map((v) => ({ base: v.taxable, impuesto: v.tax, tasa: v.rate, categoria: v.category })),
            exigibilidad: exigibilidadDe(c.cadre, debitos),
            debitos,
            vendedor: parte(inv.seller, { esquema: '0002', valor: c.siren }),
            comprador: parte(inv.buyer, identificadorComprador(inv.buyer)),
            facturaPrevia: inv.preceding?.issueDate ? { numero: inv.preceding.number, fecha: inv.preceding.issueDate } : null,
        },
    };
}

// ── Bloque 10.3: operaciones con particulares del día ───────────────────────

/** Categoría de una línea: TVA francesa (bien o servicio) o fuera del ámbito francés. */
export function categoriaLinea(line: FiscalLineItem, en: EnLine): CategoriaTransaccion | null {
    const francesa = (en.category === 'S' && tasaFrancesa(Number(line.taxRate) || 0)) || en.category === 'E' || en.category === 'Z';
    if (!francesa) return 'TNT1';
    if (line.nature === 'goods') return 'TLB1';
    if (line.nature === 'services') return 'TPS1';
    return null;
}

export interface DocumentoDelDia {
    src: EInvoiceSource;
    inv: En16931Invoice;
}

/**
 * El agregado de un día y una divisa (10.3). Una nota de crédito resta. Un
 * documento con un concepto sin naturaleza no se puede clasificar: se aparta
 * con su motivo y el resto del día se reporta.
 */
export function agregarTransacciones(fecha: string, cierre: string, moneda: string, docs: DocumentoDelDia[]): {
    reporte: ReporteTransacciones | null;
    incluidos: number[];
    bloqueados: { indice: number; bloqueo: Bloqueo }[];
} {
    type Acum = { base: number; impuesto: number; desglose: Map<string, { base: number; impuesto: number; tasa: number; categoria: string }> };
    const porCategoria = new Map<CategoriaTransaccion, Acum>();
    const incluidos: number[] = [];
    const bloqueados: { indice: number; bloqueo: Bloqueo }[] = [];
    let debitos = false;
    docs.forEach(({ src, inv }, indice) => {
        const lines = Array.isArray(src.lines) ? src.lines : [];
        if (lines.length !== inv.lines.length) {
            bloqueados.push({ indice, bloqueo: b('lineas', 'Los conceptos no cuadran con la factura.', 'The lines do not match the invoice.') });
            return;
        }
        const cats = inv.lines.map((en, i) => categoriaLinea(lines[i], en));
        if (cats.some((c) => c === null)) {
            bloqueados.push({ indice, bloqueo: b('sin_categoria', 'Un concepto no dice si es un bien o un servicio: la operación no se puede clasificar.', 'A line does not say whether it is goods or a service: the transaction cannot be classified.') });
            return;
        }
        const signo = esNotaCredito(src) ? -1 : 1;
        if (src.issuer?.vatOnDebits) debitos = true;
        inv.lines.forEach((en, i) => {
            const cat = cats[i]!;
            const a = porCategoria.get(cat) ?? { base: 0, impuesto: 0, desglose: new Map() };
            a.base += signo * cents(en.taxable);
            a.impuesto += signo * cents(en.tax);
            const k = `${en.rate}|${en.category}`;
            const d = a.desglose.get(k) ?? { base: 0, impuesto: 0, tasa: en.rate, categoria: en.category };
            d.base += signo * cents(en.taxable);
            d.impuesto += signo * cents(en.tax);
            a.desglose.set(k, d);
            porCategoria.set(cat, a);
        });
        incluidos.push(indice);
    });
    if (!incluidos.length) return { reporte: null, incluidos, bloqueados };
    const orden: CategoriaTransaccion[] = ['TLB1', 'TPS1', 'TNT1'];
    const categorias = orden.filter((c) => porCategoria.has(c)).map((categoria) => {
        const a = porCategoria.get(categoria)!;
        return {
            categoria,
            base: a.base / 100,
            impuesto: a.impuesto / 100,
            desglose: [...a.desglose.values()].map((d) => ({ base: d.base / 100, impuesto: d.impuesto / 100, tasa: d.tasa, categoria: d.categoria })),
            exigibilidad: categoria === 'TLB1' ? 'entrega' as const : categoria === 'TPS1' ? (debitos ? 'factura' as const : 'cobro' as const) : null,
            ...(categoria === 'TPS1' && debitos ? { debitos: true } : {}),
        };
    });
    return { reporte: { fecha, cierre, moneda, categorias }, incluidos, bloqueados };
}

// ── Bloque 10.4: lo cobrado en el día de operaciones con particulares ────────

/**
 * Suma por tasa los cobros (en euros) del día. Una devolución resta; si el
 * neto de una tasa queda negativo, la plataforma no lo admite (el importe
 * cobrado es un decimal positivo en su API) y el día se aparta con su motivo.
 */
export function agregarPagos(fechaPago: string, partes: { tasa: number; importe: number }[][]): { reporte: ReportePagoTransacciones } | { bloqueo: Bloqueo } | null {
    const porTasa = new Map<number, number>();
    for (const p of partes) for (const x of p) porTasa.set(x.tasa, (porTasa.get(x.tasa) ?? 0) + cents(x.importe));
    const filas = [...porTasa.entries()].filter(([, c]) => c !== 0).sort((x, y) => y[0] - x[0]);
    if (!filas.length) return null;
    if (filas.some(([, c]) => c < 0)) {
        return { bloqueo: b('devolucion_neta', 'Las devoluciones del día superan lo cobrado y la plataforma no admite importes negativos en el e-reporting de pagos: regulariza ese día desde su consola.', "The day's refunds exceed what was collected and the platform does not accept negative amounts in payment e-reporting: settle that day from its console.") };
    }
    return { reporte: { fechaPago, porTasa: filas.map(([tasa, c]) => ({ tasa, importe: c / 100 })) } };
}

export const BLOQUEO_DEVOLUCION_REPORTE: Bloqueo = b('devolucion_reporte',
    'Una devolución de una factura con el extranjero no se puede declarar en el e-reporting de pagos (la plataforma no admite importes negativos): regularízala desde su consola.',
    'A refund on an international invoice cannot be declared in payment e-reporting (the platform does not accept negative amounts): settle it from its console.');

export const BLOQUEO_SIN_EUROS: Bloqueo = b('pago_sin_euros',
    'El cobro está en otra divisa y la factura no tiene tipo de cambio a euros: el e-reporting de pagos se declara en euros.',
    'The payment is in another currency and the invoice has no exchange rate to euros: payment e-reporting is declared in euros.');
