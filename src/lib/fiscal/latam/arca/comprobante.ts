// Traducción de un documento de Cord al comprobante de WSFEv1 (FECAEDetRequest).
//
// Todas las decisiones salen del manual del desarrollador (RG 4291, v4.7) y de
// las tablas oficiales; las referencias [MAN nnnnn] son los códigos de
// validación del manual que cada regla evita disparar:
//
//   - Clase A/B/C: la del EMISOR manda (monotributo y exento emiten C) y, para
//     un Responsable Inscripto, la condición del RECEPTOR decide A o B según
//     la tabla del anexo "Condición frente al IVA del receptor".
//   - CondicionIVAReceptorId es obligatorio (RG 5616/2024) [MAN 10242/10243/10246].
//   - DocTipo/DocNro: CUIT (80) si el cliente tiene CUIT; DNI (96); sin
//     identificar (99/0) solo para B y C a consumidor final y por debajo del
//     umbral de RG 5700/2025 [MAN 10013, 10015].
//   - IVA por alícuota en AlicIva, lo exento en ImpOpEx; en C no hay IVA ni
//     array Iva [MAN 10018, 10061, 10071].
//   - ImpTotal = ImpTotConc + ImpNeto + ImpOpEx + ImpTrib + ImpIVA [MAN 10048].
//   - Servicios (concepto 2 y 3) llevan FchServDesde/Hasta/VtoPago [MAN 10049, 10036].
//   - Nota de crédito: misma clase, receptor y moneda que la factura que
//     ajusta, con CbtesAsoc [MAN 10040, 10197].
//   - Descuento de documento (bonificación): WSFEv1 no lleva conceptos, solo
//     totales, y ImpNeto es el "importe neto gravado" [MAN, FECAEDetRequest].
//     Cada concepto llega con su base YA neta (`subtotal`) y su parte del
//     descuento aparte (`discount`, motor de Cord): el neto, las bases de
//     AlicIva y el IVA se informan sobre lo neto, y la bonificación queda
//     registrada en la solicitud para imprimirla.
//
// Lo que no se puede armar bien NO se manda: se lanza RailDatosError con un
// mensaje para el dueño del negocio. Puro (sin red ni base): scripts/arca-check.mjs
// lo prueba con Node plano.

import type { FiscalLineItem, FiscalTotals } from '../../index';
// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { RailDatosError } from '../errores.ts';
import { validateTaxId } from '../../../../../packages/elements/src/fiscal/tax-id.ts';
import {
    ALICUOTAS_IVA, CONDICION_RECEPTOR_CONSUMIDOR_FINAL, CONDICIONES_IVA_RECEPTOR, CUIT_NO_CATEGORIZADO,
    DESCRIPCION_COMPROBANTE, DOC_TIPO, MARGEN_ABSOLUTO, MARGEN_RELATIVO, TIPO_COMPROBANTE,
    UMBRAL_IDENTIFICACION_CF_ARS,
    type ClaseComprobante, type CondicionEmisor, type ConceptoArca,
} from './constantes.ts';

export interface CbteAsociado {
    Tipo: number;
    PtoVta: number;
    Nro: number;
    Cuit: string;
    CbteFch: string;
}

export interface AlicIva {
    Id: number;
    BaseImp: string;
    Importe: string;
}

/** FECAEDetRequest, en el orden de la <sequence> del WSDL. Importes como texto decimal exacto. */
export interface DetalleArca {
    Concepto: ConceptoArca;
    DocTipo: number;
    DocNro: string;
    CbteDesde: number;
    CbteHasta: number;
    CbteFch: string;
    ImpTotal: string;
    ImpTotConc: string;
    ImpNeto: string;
    ImpOpEx: string;
    ImpTrib: string;
    ImpIVA: string;
    FchServDesde?: string;
    FchServHasta?: string;
    FchVtoPago?: string;
    MonId: string;
    MonCotiz: string;
    CondicionIVAReceptorId: number;
    CbtesAsoc?: CbteAsociado[];
    Iva?: AlicIva[];
}

/** Lo que se le pide a ARCA para UN comprobante (CantReg = 1). Se persiste tal cual en `solicitud`. */
export interface SolicitudArca {
    cuit: string;
    ptoVta: number;
    cbteTipo: number;
    clase: ClaseComprobante;
    detalle: DetalleArca;
    /**
     * Bonificación (descuento de documento) ya deducida de ImpNeto/ImpOpEx,
     * texto decimal. No viaja a ARCA (WSFEv1 no tiene campo para ella): es
     * para la representación impresa. Ausente = sin descuento.
     */
    bonificacion?: string;
}

export interface EntradaComprobante {
    /** CUIT del emisor (11 dígitos, con o sin guiones). */
    cuitEmisor: string;
    condicionEmisor: CondicionEmisor;
    puntoVenta: number;
    concepto: ConceptoArca;
    /** Instante de emisión: CbteFch es su día en Argentina. */
    fecha: Date;
    receptor: {
        taxId?: string | null;
        /** País del cliente (ISO alfa-2). Fuera de Argentina es exportación (Factura E): no se emite aquí. */
        pais?: string | null;
        /** CondicionIVAReceptorId capturado en el cliente. */
        condicionIva?: number | null;
    };
    lineas: FiscalLineItem[];
    totales: FiscalTotals;
    /** Fecha (y fin) de prestación del documento, aaaa-mm-dd. */
    servicio?: { desde?: string | null; hasta?: string | null };
    /** Vencimiento del pago del documento, aaaa-mm-dd. */
    vencimientoPago?: string | null;
    /** Moneda del comprobante en códigos de ARCA y su cotización en pesos. */
    moneda: { id: string; cotizacion: number };
    /** Nota de crédito: la solicitud ORIGINAL (de la factura que ajusta) tal como se autorizó. */
    notaCreditoDe?: SolicitudArca | null;
}

// ── Fechas ───────────────────────────────────────────────────────────────────

const ZONA_AR = 'America/Argentina/Buenos_Aires';

/** aaaammdd del día en Argentina (CbteFch y demás fechas de WSFEv1). */
export function fechaArca(instante: Date): string {
    const partes = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_AR, year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(instante);
    const v = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
    return `${v('year')}${v('month')}${v('day')}`;
}

/** 'aaaa-mm-dd' → 'aaaammdd'. Lanza con un mensaje si la fecha no existe. */
export function isoAFechaArca(iso: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
    const d = m ? new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`) : null;
    if (!m || !d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}`) {
        throw new RailDatosError('Una de las fechas del documento no es válida.');
    }
    return `${m[1]}${m[2]}${m[3]}`;
}

/** 'aaaammdd' → 'aaaa-mm-dd' (para el QR y la impresión). */
export function fechaArcaAIso(f: string): string {
    return /^\d{8}$/.test(f) ? `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}` : '';
}

// ── Importes ─────────────────────────────────────────────────────────────────

const centavos = (v: number) => {
    const n = Number(v) || 0;
    return Math.round((n + Math.sign(n) * Number.EPSILON) * 100);
};
const importe = (c: number) => (c / 100).toFixed(2);

/** ¿Dentro del margen de error del manual? Relativo ≤ 0,01 % o absoluto ≤ 0,01 × n. */
export function dentroDelMargen(calculado: number, informado: number, n = 1): boolean {
    const abs = Math.abs(calculado - informado);
    if (abs <= MARGEN_ABSOLUTO * Math.max(1, n) + 1e-9) return true;
    const base = Math.abs(informado);
    return base > 0 && abs / base <= MARGEN_RELATIVO + 1e-12;
}

function alicuota(tasa: number): number | null {
    const t = Number(tasa) || 0;
    return ALICUOTAS_IVA.find((a) => Math.abs(a.tasa - t) < 1e-6)?.id ?? null;
}

// ── Partes ───────────────────────────────────────────────────────────────────

export function normalizarCuit(value: unknown): string {
    return String(value ?? '').replace(/\D/g, '');
}

/** CUIT válido (prefijo y dígito verificador), sin guiones; o null. */
export function cuitValido(value: unknown): string | null {
    const v = validateTaxId('AR', normalizarCuit(value));
    return v.ok && v.kind === 'cuit' ? v.normalized : null;
}

/** Clase del comprobante según emisor y receptor (tabla del anexo del manual). */
export function claseComprobante(emisor: CondicionEmisor, condicionReceptor: number): ClaseComprobante {
    if (emisor === 'monotributo' || emisor === 'exento') return 'C';
    const cond = CONDICIONES_IVA_RECEPTOR.find((c) => c.id === condicionReceptor);
    if (!cond) throw new RailDatosError('La condición frente al IVA del cliente no es válida.');
    return cond.clases.includes('A') ? 'A' : 'B';
}

export function tipoComprobante(clase: ClaseComprobante, notaCredito: boolean): number {
    return notaCredito ? TIPO_COMPROBANTE[clase].notaCredito : TIPO_COMPROBANTE[clase].factura;
}

/** DocTipo/DocNro del receptor a partir de su identificador fiscal. */
export function documentoReceptor(taxId: unknown): { DocTipo: number; DocNro: string } {
    const raw = String(taxId ?? '').trim();
    if (!raw) return { DocTipo: DOC_TIPO.SIN_IDENTIFICAR, DocNro: '0' };
    const v = validateTaxId('AR', raw, { persona: 'fisica' });
    if (!v.ok) {
        throw new RailDatosError(`El identificador fiscal del cliente (${raw}) no es una CUIT ni un DNI válido. Corrígelo en la ficha del cliente.`);
    }
    return v.kind === 'cuit'
        ? { DocTipo: DOC_TIPO.CUIT, DocNro: v.normalized }
        : { DocTipo: DOC_TIPO.DNI, DocNro: v.normalized };
}

/**
 * CondicionIVAReceptorId. Sin dato capturado se infiere SOLO lo que no admite
 * duda: quien no tiene CUIT no está inscripto en ningún impuesto, así que es
 * consumidor final. Con CUIT puede ser inscripto, monotributista o exento —
 * eso no se adivina.
 */
export function condicionReceptor(condicion: number | null | undefined, doc: { DocTipo: number }): number {
    if (condicion !== null && condicion !== undefined && String(condicion) !== '') {
        const id = Number(condicion);
        if (!CONDICIONES_IVA_RECEPTOR.some((c) => c.id === id)) throw new RailDatosError('La condición frente al IVA del cliente no es válida.');
        return id;
    }
    if (doc.DocTipo !== DOC_TIPO.CUIT) return CONDICION_RECEPTOR_CONSUMIDOR_FINAL;
    throw new RailDatosError('Indica la condición frente al IVA de este cliente (responsable inscripto, monotributo, exento o consumidor final) en su ficha: ARCA la exige en cada factura.');
}

// ── Armado ───────────────────────────────────────────────────────────────────

interface Desglose {
    neto: number;
    iva: number;
    exento: number;
    alicuotas: AlicIva[];
}

/** Descuento repartido a un concepto, en centavos. Negativo o no numérico: error. */
function descuentoDe(l: FiscalLineItem): number {
    if (l.discount === undefined || l.discount === null) return 0;
    const d = Number(l.discount);
    if (!Number.isFinite(d) || d < 0) throw new RailDatosError('El descuento de un concepto no es válido.');
    return centavos(d);
}

function desglose(lineas: FiscalLineItem[], clase: ClaseComprobante): Desglose {
    if (clase === 'C') {
        if (lineas.some((l) => centavos(l.taxAmount) !== 0)) {
            throw new RailDatosError('En una Factura C no se discrimina el IVA. Quita el IVA de los conceptos (usa "Exento" o 0 %) y vuelve a emitirla.');
        }
        return { neto: lineas.reduce((s, l) => s + centavos(l.subtotal), 0), iva: 0, exento: 0, alicuotas: [] };
    }
    const grupos = new Map<number, { base: number; importe: number; tasa: number }>();
    let exento = 0;
    for (const l of lineas) {
        const base = centavos(l.subtotal);
        const tax = centavos(l.taxAmount);
        if (base < 0 || tax < 0) throw new RailDatosError('Un concepto tiene un importe negativo.');
        const tasa = Number(l.taxRate) || 0;
        if (tasa === 0) {
            if (tax !== 0) throw new RailDatosError('Un concepto exento no puede llevar IVA.');
            exento += base;
            continue;
        }
        const id = alicuota(tasa);
        if (id === null) {
            throw new RailDatosError(`La tasa de IVA del ${(tasa * 100).toLocaleString('es-AR', { maximumFractionDigits: 3 })} % no es una alícuota vigente en Argentina. Usa 2,5 %, 5 %, 10,5 %, 21 %, 27 % o Exento.`);
        }
        const g = grupos.get(id) ?? { base: 0, importe: 0, tasa };
        g.base += base;
        g.importe += tax;
        grupos.set(id, g);
    }
    const alicuotas: AlicIva[] = [];
    let neto = 0;
    let iva = 0;
    for (const [id, g] of [...grupos.entries()].sort((a, b) => a[0] - b[0])) {
        // Un concepto que el descuento dejó en cero no aporta base ni IVA: no
        // se informa una alícuota vacía.
        if (g.base === 0 && g.importe === 0) continue;
        // [MAN 10051] el importe de cada alícuota debe corresponder a su base.
        if (!dentroDelMargen(g.base * g.tasa / 100, g.importe / 100)) {
            throw new RailDatosError('El IVA de los conceptos no cuadra con su base por redondeo. Revisa los precios unitarios y vuelve a emitir.');
        }
        alicuotas.push({ Id: id, BaseImp: importe(g.base), Importe: importe(g.importe) });
        neto += g.base;
        iva += g.importe;
    }
    return { neto, iva, exento, alicuotas };
}

/**
 * Arma la solicitud de UN comprobante. El número (CbteDesde/CbteHasta) queda
 * en 0: lo asigna `conNumero()` con el último autorizado + 1, ya dentro del
 * lease de la secuencia.
 */
export function armarSolicitud(e: EntradaComprobante): SolicitudArca {
    const cuit = cuitValido(e.cuitEmisor);
    if (!cuit) throw new RailDatosError('La CUIT de tu negocio no es válida. Corrígela en Ajustes › Datos fiscales.');
    if (!Number.isInteger(e.puntoVenta) || e.puntoVenta < 1 || e.puntoVenta > 99998) {
        throw new RailDatosError('El punto de venta debe ser un número entre 1 y 99998.');
    }
    if (Number(e.totales.retencionTotal) > 0) {
        throw new RailDatosError('Una factura electrónica de ARCA no lleva retenciones: las practica quien paga. Quita las retenciones del documento.');
    }
    if (!e.lineas.length) throw new RailDatosError('La factura necesita al menos un concepto.');

    const original = e.notaCreditoDe ?? null;
    const cbteFch = fechaArca(e.fecha);
    let clase: ClaseComprobante;
    let receptor: { DocTipo: number; DocNro: string };
    let condicion: number;
    let concepto: ConceptoArca;
    if (original) {
        // Una nota de crédito ajusta UN comprobante: misma clase, mismo
        // receptor y misma condición que se informaron al autorizarlo.
        clase = original.clase;
        receptor = { DocTipo: original.detalle.DocTipo, DocNro: original.detalle.DocNro };
        condicion = original.detalle.CondicionIVAReceptorId;
        concepto = original.detalle.Concepto;
    } else {
        const pais = String(e.receptor.pais || 'AR').toUpperCase();
        if (pais !== 'AR') {
            throw new RailDatosError('Las facturas a clientes del exterior se emiten como Factura E de exportación, que Cord todavía no autoriza ante ARCA.');
        }
        receptor = documentoReceptor(e.receptor.taxId);
        condicion = condicionReceptor(e.receptor.condicionIva, receptor);
        clase = claseComprobante(e.condicionEmisor, condicion);
        concepto = e.concepto;
    }
    if (![1, 2, 3].includes(concepto)) throw new RailDatosError('Indica si vendes productos, servicios o ambos en los ajustes de ARCA.');
    const cond = CONDICIONES_IVA_RECEPTOR.find((c) => c.id === condicion);
    if (!cond || !cond.clases.includes(clase)) {
        throw new RailDatosError('La condición frente al IVA del cliente no corresponde a este tipo de comprobante. Revísala en su ficha.');
    }
    if (receptor.DocNro === CUIT_NO_CATEGORIZADO) {
        throw new RailDatosError('Las facturas a "Sujeto No Categorizado" exigen percibir IVA, y Cord todavía no lo calcula. Identifica al cliente con su CUIT o DNI.');
    }
    if (receptor.DocNro === cuit) throw new RailDatosError('El cliente no puede tener la misma CUIT que tu negocio.');
    if (clase === 'A' && receptor.DocTipo !== DOC_TIPO.CUIT) {
        throw new RailDatosError('Una Factura A necesita la CUIT del cliente. Agrégala en su ficha.');
    }

    const d = desglose(e.lineas, clase);
    const total = d.neto + d.iva + d.exento;
    // El descuento de cada concepto ya bajó su base; el del documento es su
    // suma. Si el documento declara otro, los importes no son los que se
    // imprimen.
    const bonificacion = e.lineas.reduce((sum, l) => sum + descuentoDe(l), 0);
    if (e.totales.discountTotal !== undefined && e.totales.discountTotal !== null
        && !dentroDelMargen(bonificacion / 100, Number(e.totales.discountTotal), e.lineas.length)) {
        throw new RailDatosError('El descuento del documento no cuadra con el de sus conceptos. Vuelve a guardarlo antes de emitir.');
    }
    // [MAN 10048] y coherencia con el documento: lo que ARCA autoriza es lo
    // que el cliente ve impreso.
    const totalDoc = centavos(Number(e.totales.subtotal) + Number(e.totales.taxes));
    if (!dentroDelMargen(total / 100, totalDoc / 100)) {
        throw new RailDatosError('Los importes del documento no cuadran entre sí. Vuelve a guardarlo antes de emitir.');
    }
    if (!(total > 0)) throw new RailDatosError('El importe del comprobante debe ser mayor a cero.');

    const cotizacion = Number(e.moneda.cotizacion);
    if (!(cotizacion > 0)) throw new RailDatosError('Falta el tipo de cambio de la moneda del comprobante.');
    if (e.moneda.id === 'PES' && cotizacion !== 1) throw new RailDatosError('Un comprobante en pesos lleva cotización 1.');
    // [RG 5700/2025] Consumidor final sin identificar: solo debajo del umbral.
    if (receptor.DocTipo === DOC_TIPO.SIN_IDENTIFICAR && (total / 100) * cotizacion >= UMBRAL_IDENTIFICACION_CF_ARS) {
        throw new RailDatosError('Desde $ 10.000.000 hay que identificar al consumidor final. Agrega su DNI o CUIT en la ficha del cliente.');
    }

    const detalle: DetalleArca = {
        Concepto: concepto,
        DocTipo: receptor.DocTipo,
        DocNro: receptor.DocNro,
        CbteDesde: 0,
        CbteHasta: 0,
        CbteFch: cbteFch,
        ImpTotal: importe(total),
        ImpTotConc: importe(0),
        ImpNeto: importe(d.neto),
        ImpOpEx: importe(d.exento),
        ImpTrib: importe(0),
        ImpIVA: importe(d.iva),
        MonId: e.moneda.id,
        MonCotiz: formatoCotizacion(cotizacion),
        CondicionIVAReceptorId: condicion,
    };

    if (concepto === 2 || concepto === 3) {
        if (original && original.detalle.FchServDesde && original.detalle.FchServHasta) {
            detalle.FchServDesde = original.detalle.FchServDesde;
            detalle.FchServHasta = original.detalle.FchServHasta;
        } else {
            const desde = e.servicio?.desde ? isoAFechaArca(e.servicio.desde) : cbteFch;
            const hasta = e.servicio?.hasta ? isoAFechaArca(e.servicio.hasta) : desde;
            if (hasta < desde) throw new RailDatosError('El periodo de prestación termina antes de empezar.');
            detalle.FchServDesde = desde;
            detalle.FchServHasta = hasta;
        }
        // [MAN 10036] no puede ser anterior a la fecha del comprobante.
        const venc = original?.detalle.FchVtoPago || (e.vencimientoPago ? isoAFechaArca(e.vencimientoPago) : cbteFch);
        detalle.FchVtoPago = venc < cbteFch ? cbteFch : venc;
    }

    if (original) {
        detalle.CbtesAsoc = [{
            Tipo: original.cbteTipo,
            PtoVta: original.ptoVta,
            Nro: original.detalle.CbteDesde,
            Cuit: original.cuit,
            CbteFch: original.detalle.CbteFch,
        }];
        if (original.detalle.MonId !== e.moneda.id) throw new RailDatosError('La nota de crédito debe ir en la misma moneda que la factura.');
    }
    if (d.alicuotas.length) detalle.Iva = d.alicuotas;

    return {
        cuit,
        ptoVta: e.puntoVenta,
        cbteTipo: tipoComprobante(clase, !!original),
        clase,
        detalle,
        ...(bonificacion > 0 ? { bonificacion: importe(bonificacion) } : {}),
    };
}

/** La misma solicitud con su número de comprobante. */
export function conNumero(s: SolicitudArca, numero: number): SolicitudArca {
    if (!Number.isInteger(numero) || numero < 1 || numero > 99_999_999) throw new RailDatosError('Número de comprobante fuera de rango.');
    return { ...s, detalle: { ...s.detalle, CbteDesde: numero, CbteHasta: numero } };
}

export function formatoCotizacion(c: number): string {
    // Double (4+6) [MAN MonCotiz]: hasta 6 decimales, sin ceros de relleno.
    return String(Math.round(c * 1e6) / 1e6);
}

/** Número legal impreso: "00001-00000042" (punto de venta de 5 dígitos desde 2018 [MAN v2.12]). */
export function numeroLegal(ptoVta: number, numero: number): string {
    return `${String(ptoVta).padStart(5, '0')}-${String(numero).padStart(8, '0')}`;
}

/**
 * Número del documento en Cord: lleva el tipo para que factura y nota de
 * crédito (secuencias distintas en ARCA) nunca choquen en el índice único de
 * `documentos_fiscales`, y la marca H- en homologación para que un
 * comprobante de prueba no pueda confundirse ni chocar con uno real.
 */
export function numeroDocumento(cbteTipo: number, ptoVta: number, numero: number, homologacion: boolean): string {
    const desc = DESCRIPCION_COMPROBANTE[cbteTipo];
    const prefijo = desc ? `${desc.notaCredito ? 'NC' : 'FA'}-${desc.clase}` : `C${cbteTipo}`;
    return `${homologacion ? 'H-' : ''}${prefijo}-${numeroLegal(ptoVta, numero)}`;
}

/** Recalcula los cuadres que el manual exige, sobre lo que se va a enviar. Lista vacía = cuadra. */
export function problemasDeCuadre(d: DetalleArca, clase: ClaseComprobante): string[] {
    const n = (s: string) => Number(s);
    const out: string[] = [];
    const suma = n(d.ImpTotConc) + n(d.ImpNeto) + n(d.ImpOpEx) + n(d.ImpTrib) + n(d.ImpIVA);
    if (!dentroDelMargen(suma, n(d.ImpTotal))) out.push('10048: ImpTotal ≠ ImpTotConc + ImpNeto + ImpOpEx + ImpTrib + ImpIVA');
    if (clase === 'C') {
        if (n(d.ImpIVA) !== 0 || n(d.ImpOpEx) !== 0 || n(d.ImpTotConc) !== 0) out.push('10043/10044/10047: en C, ImpTotConc, ImpOpEx e ImpIVA son 0');
        if (d.Iva?.length) out.push('10071: en C no se informa el array Iva');
        return out;
    }
    const iva = d.Iva ?? [];
    const k = Math.max(1, iva.length);
    if (!dentroDelMargen(iva.reduce((s, a) => s + n(a.Importe), 0), n(d.ImpIVA), k)) out.push('10023: Σ AlicIva.Importe ≠ ImpIVA');
    if (!dentroDelMargen(iva.reduce((s, a) => s + n(a.BaseImp), 0), n(d.ImpNeto), k)) out.push('10061: Σ AlicIva.BaseImp ≠ ImpNeto');
    if (n(d.ImpNeto) > 0 && !iva.length) out.push('10070: con ImpNeto > 0 el array Iva es obligatorio');
    if (new Set(iva.map((a) => a.Id)).size !== iva.length) out.push('10022: una alícuota repetida');
    for (const a of iva) {
        const tasa = ALICUOTAS_IVA.find((x) => x.id === a.Id)?.tasa;
        if (tasa === undefined) out.push(`10019: AlicIva ${a.Id} no es una alícuota válida`);
        else if (!dentroDelMargen(n(a.BaseImp) * tasa, n(a.Importe))) out.push(`10051: AlicIva ${a.Id} no corresponde a su base`);
    }
    return out;
}
