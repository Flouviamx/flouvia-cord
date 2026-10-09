// QR de los comprobantes electrónicos de ARCA (RG 4892/2020).
//
// Especificación: "Especificaciones del QR incluido en las facturas
// electrónicas" (https://www.afip.gob.ar/fe/qr/documentos/QRespecificaciones.pdf,
// versión 1 del JSON):
//
//   {URL}?p={DATOS CMPBASE64}   con {URL} = https://www.arca.gob.ar/fe/qr/
//
// y el JSON con estos campos, en este orden: ver, fecha (aaaa-mm-dd), cuit,
// ptoVta, tipoCmp, nroCmp, importe, moneda, ctz, tipoDocRec y nroDocRec ("DE
// CORRESPONDER"), tipoCodAut ("E" = CAE, "A" = CAEA) y codAut. El ejemplo
// oficial del documento (JSON y su base64) es un vector de scripts/arca-check.mjs:
// este módulo lo reproduce byte a byte.
//
// Nota sobre la URL: el texto normativo del documento dice
// https://www.arca.gob.ar/fe/qr/ y su ejemplo, anterior al cambio de nombre
// del organismo, muestra https://www.afip.gob.ar/fe/qr/. Se usa la del texto.
//
// Puro: lo cargan los scripts de contrato con Node plano.

// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { ARCA_QR_URL, DOC_TIPO } from './constantes.ts';

export interface DatosQrArca {
    /** Fecha de emisión, aaaa-mm-dd (full-date RFC 3339). */
    fecha: string;
    cuit: string | number;
    ptoVta: number;
    tipoCmp: number;
    nroCmp: number;
    /** Importe total en la moneda del comprobante; hasta 2 decimales. */
    importe: number | string;
    /** Código de moneda de ARCA ("PES", "DOL"…). */
    moneda: string;
    /** Cotización en pesos (1 si es PES); hasta 6 decimales. */
    ctz: number | string;
    /** Tipo y número de documento del receptor, si fue identificado. */
    tipoDocRec?: number;
    nroDocRec?: string | number;
    /** 'E' = autorizado por CAE, 'A' = por CAEA. */
    tipoCodAut: 'E' | 'A';
    codAut: string | number;
}

const num = (v: string | number) => {
    const n = typeof v === 'number' ? v : Number(String(v).trim());
    if (!Number.isFinite(n)) throw new Error(`QR de ARCA: valor numérico inválido (${v})`);
    return n;
};

/** El JSON del QR (versión 1), con los campos en el orden de la especificación. */
export function arcaQrJson(d: DatosQrArca): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) throw new Error('QR de ARCA: la fecha debe ser aaaa-mm-dd');
    const cuit = String(d.cuit).replace(/\D/g, '');
    if (!/^\d{11}$/.test(cuit)) throw new Error('QR de ARCA: la CUIT del emisor debe tener 11 dígitos');
    if (!/^\d{14}$/.test(String(d.codAut))) throw new Error('QR de ARCA: el código de autorización debe tener 14 dígitos');
    const obj: Record<string, string | number> = {
        ver: 1,
        fecha: d.fecha,
        cuit: Number(cuit),
        ptoVta: num(d.ptoVta),
        tipoCmp: num(d.tipoCmp),
        nroCmp: num(d.nroCmp),
        importe: Math.round(num(d.importe) * 100) / 100,
        moneda: d.moneda,
        ctz: Math.round(num(d.ctz) * 1e6) / 1e6,
    };
    // "De corresponder": un consumidor final sin identificar (DocTipo 99) no
    // tiene documento que informar.
    if (d.tipoDocRec !== undefined && d.tipoDocRec !== DOC_TIPO.SIN_IDENTIFICAR && d.nroDocRec !== undefined && Number(d.nroDocRec) > 0) {
        obj.tipoDocRec = num(d.tipoDocRec);
        obj.nroDocRec = num(d.nroDocRec);
    }
    obj.tipoCodAut = d.tipoCodAut;
    obj.codAut = num(d.codAut);
    return JSON.stringify(obj);
}

/** Contenido completo del QR: `https://www.arca.gob.ar/fe/qr/?p=<base64>`. */
export function arcaQrUrl(d: DatosQrArca, base = ARCA_QR_URL): string {
    return `${base}?p=${Buffer.from(arcaQrJson(d), 'utf8').toString('base64')}`;
}
