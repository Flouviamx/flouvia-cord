// Información electrónica de compras y ventas (IECV): el libro de ventas y el
// de compras que el SII pide en el set de pruebas de la certificación.
//
//   <LibroCompraVenta version="1.0"><EnvioLibro ID="…"><Caratula/>
//     <ResumenPeriodo><TotalesPeriodo/>…</ResumenPeriodo><Detalle/>…<TmstFirma/>
//   </EnvioLibro><Signature/></LibroCompraVenta>
//
// Fuentes primarias (www.sii.cl/factura_electronica/factura_mercado):
//   - "Formato de información electrónica de compras y ventas" v3.0, marzo de
//     2016 (formato_iecv.pdf): carátula (2.1 y 3.1), resumen del período (2.3
//     y 3.3), detalle (2.4 y 3.4), códigos de documento (4) y de impuesto (7);
//   - LibroCV_v10.xsd (schema_iecv.zip): orden y tipo de cada elemento;
//     scripts/sii-check.mjs valida contra él con xmllint;
//   - "Instrucciones para la construcción de DTE con los datos del set de
//     pruebas" (inst_set_pruebas.pdf), III y IV: libro ESPECIAL, envío TOTAL,
//     folio de notificación 1 (ventas) y 2 (compras), el período tributario de
//     los documentos del set, y en el resumen los campos totalizados por tipo
//     de documento.
//
// Reglas que salen de esas fuentes:
//   - Un envío TOTAL lleva el resumen del período y el detalle, sin resumen de
//     segmento (formato, 1.3 a y 1.5 b).
//   - Montos en pesos, enteros y positivos; el tipo de documento dice si suma o
//     resta (una nota de crédito se informa con montos positivos).
//   - Monto IVA y tasa son obligatorios en el detalle (obligatoriedad 1). En
//     compras, "Tasa IVA * Monto neto = IVA recuperable + IVA no recuperable +
//     IVA uso común" (3.4, campo 15): el IVA de uso común y el no recuperable no
//     van en el IVA recuperable.
//   - Monto total de compras (3.4, campo 25): neto + exento + IVA recuperable +
//     IVA de uso común + IVA no recuperable − IVA retenido (total o parcial).
//   - Crédito del IVA de uso común = factor de proporcionalidad × total del IVA
//     de uso común (3.3, campos 18 y 19), con un solo factor en el libro (cambio
//     de 2016).
//   - Nota de crédito que anula un documento completo: tipo y folio del
//     documento anulado (2.4, campos 16 y 17).
//   - Firma: la del EnvioDTE (RSA-SHA1 sobre el C14N del <EnvioLibro> en el
//     contexto del documento, envio.ts).
//
// El SII ya no exige estos libros fuera de la certificación: desde el período
// de agosto de 2017 el Registro de Compras y Ventas los reemplaza (Resolución
// Exenta SII N° 61 de 2017, resolutivos 9, 12 y 13). Cord los arma solo para el
// set de pruebas.
//
// Puro: lo cargan los scripts de contrato con Node plano.

import { RailDatosError } from '../errores.ts';
import {
    COD_IVA_RETENIDO_TOTAL, DOCUMENTOS_NO_ELECTRONICOS, FOLIO_NOTIFICACION_SET, NS_SII_DTE, NS_XSI, SCHEMA_LOCATION_LIBRO, TASA_IVA, TASA_IVA_PCT,
} from './constantes.ts';
import type { BorradorSii } from './dte.ts';
import { referenciasDe } from './dte.ts';
import { DECLARACION_XML } from './envio.ts';
import { firmar, type ClaveFirma } from './firma.ts';
import type { FilaCompraSet } from './set-pruebas.ts';
import { campo, fechaHoraChile, rutValido } from './texto.ts';
import { c14n, el, formatear, opt, serializar, type Nodo } from './xml.ts';

export type OperacionLibro = 'VENTA' | 'COMPRA';

/** Una línea del detalle del libro (formato IECV, 2.4 y 3.4), con los montos ya calculados. */
export interface DetalleLibro {
    tpoDoc: number;
    nroDoc: number;
    tasaImp: number;
    fchDoc: string;
    rutDoc: string;
    rznSoc: string | null;
    /** Ventas: tipo y folio del documento que la nota de crédito anula completo. */
    tpoDocRef?: number;
    folioDocRef?: number;
    mntExe: number;
    mntNeto: number;
    /** IVA recuperable (compras) o IVA del documento (ventas). */
    mntIva: number;
    ivaNoRec?: { codigo: 1 | 2 | 3 | 4 | 9; monto: number }[];
    ivaUsoComun?: number;
    otrosImp?: { codigo: number; tasa: number; monto: number }[];
    mntTotal: number;
}

export interface CaratulaLibro {
    rutEmisor: string;
    rutEnvia: string;
    /** aaaa-mm */
    periodo: string;
    resolucion: { numero: number; fecha: string };
    operacion: OperacionLibro;
    /** Folio de notificación del libro ESPECIAL (1 ventas, 2 compras en el set). */
    folioNotificacion?: number;
}

/** Totales de un tipo de documento en el resumen del período (formato IECV, 2.3 y 3.3). */
export interface TotalPeriodo {
    tpoDoc: number;
    totDoc: number;
    totMntExe: number;
    totMntNeto: number;
    totMntIva: number;
    totIvaNoRec: { codigo: number; operaciones: number; monto: number }[];
    totOpIvaUsoComun: number;
    totIvaUsoComun: number;
    fctProp: number | null;
    totCredIvaUsoComun: number;
    totOtrosImp: { codigo: number; monto: number }[];
    totMntTotal: number;
}

const iva = (neto: number) => Math.round(neto * TASA_IVA);
const RAZON_SOCIAL = 50;

/** Un documento del set ya emitido por Cord, como lo informa el libro de ventas. */
export function detalleVenta(d: { tipo: number; folio: number; borrador: BorradorSii }): DetalleLibro {
    const b = d.borrador;
    if (b.neto + b.exento + b.iva !== b.total) throw new Error(`iecv: el documento ${d.tipo}-${d.folio} no cuadra`);
    // Campos 16 y 17: la nota de crédito que anula un documento completo (CodRef 1).
    const anula = d.tipo === 61 ? referenciasDe(b).find((r) => r.codigo === 1 && r.tipo !== 'SET') : undefined;
    return {
        tpoDoc: d.tipo,
        nroDoc: d.folio,
        tasaImp: TASA_IVA_PCT,
        fchDoc: b.fechaEmision,
        rutDoc: b.receptor.rut,
        rznSoc: campo(b.receptor.razonSocial, RAZON_SOCIAL) || null,
        ...(anula && typeof anula.tipo === 'number' ? { tpoDocRef: anula.tipo, folioDocRef: anula.folio } : {}),
        mntExe: b.exento,
        mntNeto: b.neto,
        mntIva: b.iva,
        mntTotal: b.total,
    };
}

/**
 * Un documento del set de libro de compras, con el proveedor que el negocio
 * agrega ("Agregar datos del emisor del documento para lo cual se deberán usar
 * Rut válidos", instrucciones del set, IV.3). `fecha` es la de los documentos
 * del período del libro.
 */
export function detalleCompra(f: FilaCompraSet, proveedor: { rut: string; razonSocial?: string | null }, fecha: string, factor: number | null): DetalleLibro {
    const rut = rutValido(proveedor.rut);
    if (!rut) throw new RailDatosError(`Escribe un RUT válido para el proveedor de ${f.tipoDocumento} ${f.folio}.`);
    const rznSoc = campo(proveedor.razonSocial ?? '', RAZON_SOCIAL) || null;
    if (!rznSoc && DOCUMENTOS_NO_ELECTRONICOS.includes(f.tpoDoc)) {
        throw new RailDatosError(`Escribe la razón social del proveedor de ${f.tipoDocumento} ${f.folio}: el libro la exige en los documentos en papel.`);
    }
    const impuesto = iva(f.afecto);
    const base = { tpoDoc: f.tpoDoc, nroDoc: f.folio, tasaImp: TASA_IVA_PCT, fchDoc: fecha, rutDoc: rut, rznSoc, mntExe: f.exento, mntNeto: f.afecto };
    switch (f.tratamiento.tipo) {
        case 'credito':
            return { ...base, mntIva: impuesto, mntTotal: f.exento + f.afecto + impuesto };
        case 'uso_comun':
            if (!factor) throw new RailDatosError('El libro de compras trae IVA de uso común sin factor de proporcionalidad.');
            return { ...base, mntIva: 0, ivaUsoComun: impuesto, mntTotal: f.exento + f.afecto + impuesto };
        case 'no_recuperable':
            return { ...base, mntIva: 0, ivaNoRec: [{ codigo: f.tratamiento.codigo, monto: impuesto }], mntTotal: f.exento + f.afecto + impuesto };
        case 'retencion_total':
            // El comprador retiene el IVA completo: lo informa con el código 15 a la
            // tasa del impuesto, y el total del documento lo descuenta.
            return {
                ...base, mntIva: impuesto,
                otrosImp: [{ codigo: COD_IVA_RETENIDO_TOTAL, tasa: TASA_IVA_PCT, monto: impuesto }],
                mntTotal: f.exento + f.afecto,
            };
    }
}

/** Resumen del período: los campos totalizados por tipo de documento, en orden de tipo. */
export function resumenPeriodo(detalles: DetalleLibro[], factor: number | null = null): TotalPeriodo[] {
    const porTipo = new Map<number, TotalPeriodo>();
    for (const d of detalles) {
        const t = porTipo.get(d.tpoDoc) ?? {
            tpoDoc: d.tpoDoc, totDoc: 0, totMntExe: 0, totMntNeto: 0, totMntIva: 0, totIvaNoRec: [], totOpIvaUsoComun: 0,
            totIvaUsoComun: 0, fctProp: null, totCredIvaUsoComun: 0, totOtrosImp: [], totMntTotal: 0,
        };
        t.totDoc += 1;
        t.totMntExe += d.mntExe;
        t.totMntNeto += d.mntNeto;
        t.totMntIva += d.mntIva;
        for (const n of d.ivaNoRec ?? []) {
            const x = t.totIvaNoRec.find((y) => y.codigo === n.codigo);
            if (x) { x.operaciones += 1; x.monto += n.monto; } else t.totIvaNoRec.push({ codigo: n.codigo, operaciones: 1, monto: n.monto });
        }
        if (d.ivaUsoComun) { t.totOpIvaUsoComun += 1; t.totIvaUsoComun += d.ivaUsoComun; }
        for (const o of d.otrosImp ?? []) {
            const x = t.totOtrosImp.find((y) => y.codigo === o.codigo);
            if (x) x.monto += o.monto; else t.totOtrosImp.push({ codigo: o.codigo, monto: o.monto });
        }
        t.totMntTotal += d.mntTotal;
        porTipo.set(d.tpoDoc, t);
    }
    for (const t of porTipo.values()) {
        if (t.totIvaUsoComun > 0) {
            if (!factor) throw new RailDatosError('El libro de compras trae IVA de uso común sin factor de proporcionalidad.');
            t.fctProp = factor;
            t.totCredIvaUsoComun = Math.round(t.totIvaUsoComun * factor);
        }
        t.totIvaNoRec.sort((a, b) => a.codigo - b.codigo);
        t.totOtrosImp.sort((a, b) => a.codigo - b.codigo);
    }
    return [...porTipo.values()].sort((a, b) => a.tpoDoc - b.tpoDoc);
}

/** FctProp: decimal de hasta tres decimales (LibroCV_v10.xsd). */
const factorXml = (f: number) => String(Math.round(f * 1000) / 1000);
const positivo = (n: string, v: number) => (v > 0 ? el(n, null, String(v)) : null);

function nodoTotales(t: TotalPeriodo, compras: boolean): Nodo {
    return el('TotalesPeriodo', null,
        el('TpoDoc', null, String(t.tpoDoc)),
        el('TotDoc', null, String(t.totDoc)),
        el('TotMntExe', null, String(t.totMntExe)),
        el('TotMntNeto', null, String(t.totMntNeto)),
        el('TotMntIVA', null, String(t.totMntIva)),
        ...(compras ? t.totIvaNoRec.map((n) => el('TotIVANoRec', null,
            el('CodIVANoRec', null, String(n.codigo)), el('TotOpIVANoRec', null, String(n.operaciones)), el('TotMntIVANoRec', null, String(n.monto)))) : []),
        compras ? positivo('TotOpIVAUsoComun', t.totOpIvaUsoComun) : null,
        compras ? positivo('TotIVAUsoComun', t.totIvaUsoComun) : null,
        compras && t.fctProp ? el('FctProp', null, factorXml(t.fctProp)) : null,
        compras && t.fctProp ? el('TotCredIVAUsoComun', null, String(t.totCredIvaUsoComun)) : null,
        ...t.totOtrosImp.map((o) => el('TotOtrosImp', null, el('CodImp', null, String(o.codigo)), el('TotMntImp', null, String(o.monto)))),
        el('TotMntTotal', null, String(t.totMntTotal)),
    );
}

function nodoDetalle(d: DetalleLibro): Nodo {
    return el('Detalle', null,
        el('TpoDoc', null, String(d.tpoDoc)),
        el('NroDoc', null, String(d.nroDoc)),
        el('TasaImp', null, String(d.tasaImp)),
        el('FchDoc', null, d.fchDoc),
        el('RUTDoc', null, d.rutDoc),
        opt('RznSoc', d.rznSoc),
        opt('TpoDocRef', d.tpoDocRef),
        opt('FolioDocRef', d.folioDocRef),
        positivo('MntExe', d.mntExe),
        positivo('MntNeto', d.mntNeto),
        el('MntIVA', null, String(d.mntIva)),
        ...(d.ivaNoRec ?? []).map((n) => el('IVANoRec', null, el('CodIVANoRec', null, String(n.codigo)), el('MntIVANoRec', null, String(n.monto)))),
        d.ivaUsoComun ? el('IVAUsoComun', null, String(d.ivaUsoComun)) : null,
        ...(d.otrosImp ?? []).map((o) => el('OtrosImp', null, el('CodImp', null, String(o.codigo)), el('TasaImp', null, String(o.tasa)), el('MntImp', null, String(o.monto)))),
        el('MntTotal', null, String(d.mntTotal)),
    );
}

/** Id del <EnvioLibro> que la firma referencia. */
export const idLibro = (operacion: OperacionLibro) => `IECV_${operacion}`;

/**
 * El libro firmado, como texto del archivo (ISO-8859-1 al codificarlo). Lleva
 * el resumen del período y el detalle de cada documento (envío TOTAL).
 */
export function armarLibro(c: CaratulaLibro, detalles: DetalleLibro[], resumen: TotalPeriodo[], firmadoEn: Date, clave: ClaveFirma): string {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(c.periodo)) throw new Error(`iecv: período inválido ${c.periodo}`);
    if (!detalles.length) throw new RailDatosError('El libro no tiene documentos que informar.');
    if (resumen.length > 40) throw new RailDatosError('El libro informa más de 40 tipos de documento.');
    const compras = c.operacion === 'COMPRA';
    const folioNotificacion = c.folioNotificacion ?? FOLIO_NOTIFICACION_SET[c.operacion];
    const caratula = el('Caratula', null,
        el('RutEmisorLibro', null, c.rutEmisor),
        el('RutEnvia', null, c.rutEnvia),
        el('PeriodoTributario', null, c.periodo),
        el('FchResol', null, c.resolucion.fecha),
        el('NroResol', null, String(c.resolucion.numero)),
        el('TipoOperacion', null, c.operacion),
        el('TipoLibro', null, 'ESPECIAL'),
        el('TipoEnvio', null, 'TOTAL'),
        el('FolioNotificacion', null, String(folioNotificacion)),
    );
    const id = idLibro(c.operacion);
    const envioLibro = formatear(el('EnvioLibro', [['ID', id]],
        caratula,
        el('ResumenPeriodo', null, ...resumen.map((t) => nodoTotales(t, compras))),
        ...detalles.map(nodoDetalle),
        el('TmstFirma', null, fechaHoraChile(firmadoEn)),
    ));
    const ns = { '': NS_SII_DTE, xsi: NS_XSI };
    const firma = firmar(c14n(envioLibro, ns), `#${id}`, clave, ns);
    const libro = formatear(el('LibroCompraVenta', [
        ['xmlns', NS_SII_DTE], ['xmlns:xsi', NS_XSI], ['xsi:schemaLocation', SCHEMA_LOCATION_LIBRO], ['version', '1.0'],
    ], envioLibro, firma));
    // Como el EnvioDTE: la codificación en la primera línea y el schemaLocation en la segunda.
    return `${DECLARACION_XML}\n${serializar(libro)}\n`;
}
