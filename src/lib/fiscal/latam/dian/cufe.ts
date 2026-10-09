// Mecanismos de control de la factura electrónica [AT Suplemento B, 11]:
//
//   - CUFE (factura): SHA-384 de NumFac + FecFac + HorFac + ValFac + 01 +
//     ValImp1 + 04 + ValImp2 + 03 + ValImp3 + ValTot + NitOFE + NumAdq +
//     ClTec + TipoAmbiente [AT 11.2].
//   - CUDE (notas): la misma cadena con el PIN del software en lugar de la
//     clave técnica [AT 11.4.3].
//   - Código de seguridad del software: SHA-384(Id software + PIN + número
//     del documento) [AT 11.8].
//   - QR de la representación gráfica [AT 11.7] y su URL [AT 11.7.1].
//
// Los valores van "con punto decimal, con decimales a dos (2) dígitos
// truncados, sin separadores de miles". Cord ya los redondea a dos decimales
// al armar el documento; aquí se TRUNCAN (no se redondean) por si llegara uno
// con más, que es lo que dice la norma.
//
// scripts/dian-check.mjs reproduce byte a byte los ejemplos oficiales del
// Anexo (CUFE de factura, CUDE de nota crédito y de documento de
// transmisión).
//
// Puro.

import { createHash } from 'node:crypto';
import { DIAN_QR_BASE } from './constantes.ts';
import type { EntornoRail } from '../rieles.ts';

/** Importe con dos decimales TRUNCADOS, sin separadores [AT 11.2]. */
export function valorCufe(v: number | string): string {
    const s = typeof v === 'number' ? v.toFixed(6) : String(v).trim();
    const m = /^(-?)(\d+)(?:\.(\d*))?$/.exec(s);
    if (!m) throw new Error(`cufe: importe ilegible ${s}`);
    return `${m[1]}${m[2]}.${((m[3] ?? '') + '00').slice(0, 2)}`;
}

export interface DatosCufe {
    /** Prefijo + número (cbc:ID). */
    numero: string;
    /** cbc:IssueDate, aaaa-mm-dd. */
    fecha: string;
    /** cbc:IssueTime, hh:mm:ss-05:00. */
    hora: string;
    /** LegalMonetaryTotal/LineExtensionAmount. */
    valorBruto: number | string;
    /** TaxTotal del tributo 01 (IVA), 04 (INC) y 03 (ICA); 0 si no se informa. */
    iva: number | string;
    inc: number | string;
    ica: number | string;
    /** LegalMonetaryTotal/PayableAmount. */
    total: number | string;
    /** NIT del emisor, sin DV. */
    nitEmisor: string;
    /** Identificación del adquiriente, sin DV. */
    numAdquiriente: string;
    /** Clave técnica del rango (CUFE) o PIN del software (CUDE). */
    clave: string;
    /** cbc:ProfileExecutionID: '1' producción, '2' pruebas. */
    tipoAmbiente: '1' | '2';
}

/** La cadena que se resume (útil para soporte: es lo que la DIAN recalcula). */
export function cadenaCufe(d: DatosCufe): string {
    return d.numero + d.fecha + d.hora + valorCufe(d.valorBruto)
        + '01' + valorCufe(d.iva) + '04' + valorCufe(d.inc) + '03' + valorCufe(d.ica)
        + valorCufe(d.total) + d.nitEmisor + d.numAdquiriente + d.clave + d.tipoAmbiente;
}

const sha384 = (s: string) => createHash('sha384').update(s, 'utf8').digest('hex');

/** CUFE (con la clave técnica) o CUDE (con el PIN del software): la misma fórmula. */
export function cufe(d: DatosCufe): string {
    return sha384(cadenaCufe(d));
}

/** sts:SoftwareSecurityCode [AT 11.8]. */
export function codigoSeguridadSoftware(softwareId: string, pin: string, numeroDocumento: string): string {
    return sha384(softwareId + pin + numeroDocumento);
}

/** sts:QRCode y destino del QR impreso: la consulta pública por CUFE/CUDE [AT 11.7.1, FAB36]. */
export function urlQr(clave: string, entorno: EntornoRail): string {
    return DIAN_QR_BASE[entorno] + clave;
}

export interface DatosQr {
    numero: string;
    fecha: string;
    hora: string;
    nitEmisor: string;
    docAdquiriente: string;
    valorBruto: number | string;
    iva: number | string;
    otrosImpuestos: number | string;
    total: number | string;
    cufe: string;
    url: string;
}

/**
 * Contenido del código QR de la representación gráfica [AT 11.7]: una línea
 * por dato, en el orden y con los rótulos del Anexo, y al final la URL de
 * consulta.
 */
export function textoQr(d: DatosQr): string {
    const dos = (v: number | string) => (Number(v) || 0).toFixed(2);
    return [
        `NumFac: ${d.numero}`,
        `FecFac: ${d.fecha}`,
        `HorFac: ${d.hora}`,
        `NitFac: ${d.nitEmisor}`,
        `DocAdq: ${d.docAdquiriente}`,
        `ValFac: ${dos(d.valorBruto)}`,
        `ValIva: ${dos(d.iva)}`,
        `ValOtroIm: ${dos(d.otrosImpuestos)}`,
        `ValTolFac: ${dos(d.total)}`,
        `CUFE: ${d.cufe}`,
        `QRCode: ${d.url}`,
    ].join('\n');
}
