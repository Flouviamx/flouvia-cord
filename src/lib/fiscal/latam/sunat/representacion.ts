// Lo que la representación impresa de un comprobante aceptado por SUNAT
// lleva además de lo que el PDF de Cord ya dibuja (emisor, receptor,
// conceptos, totales), según la columna "Representación impresa" del Anexo
// N.° 1 [RS 123-2022] y el Anexo N.° 6 [RS 113-2018]:
//
//   - la denominación "Factura electrónica" (o "Nota de crédito
//     electrónica"), RUC del emisor, serie y número, fecha, moneda y el
//     adquirente con la denominación de su documento (campos 6, 7, 8, 9, 11);
//   - los totales por tipo de operación: Op. gravada, exonerada, inafecta y
//     exportación, e IGV (campos 33-39, 48);
//   - la forma de pago y, al crédito, el monto neto pendiente y las cuotas
//     (campos 49-A, 64-A, 64-B);
//   - la leyenda "Representación impresa de la factura electrónica" (campo 62);
//   - el código QR (§6.4: nivel de corrección Q, en la parte inferior) con
//     RUC | TIPO | SERIE | NÚMERO | IGV | TOTAL | FECHA | TIPO DOC ADQUIRENTE |
//     NÚMERO DOC ADQUIRENTE | VALOR RESUMEN, "con el mismo formato empleado en
//     el comprobante"; el valor resumen también impreso fuera del QR (§6.4.3).
//
// Se arma UNA vez al aceptarse y se guarda en provider_data (latam/representacion.ts).
// Puro: lo prueba scripts/sunat-check.mjs con Node plano.

// Extensión .ts explícita: este módulo también se carga desde Node plano.
import type { FilaRepresentacion, RepresentacionImpresa } from '../representacion.ts';
import { AFECTACION, DOC_IDENTIDAD, FORMA_PAGO, QR_NIVEL, TIPO_DOC, TIPO_OPERACION } from './constantes.ts';
import { idComprobante, numeroDocumento, type SolicitudSunat } from './comprobante.ts';

export const LEYENDA_REPRESENTACION = { factura: 'Representación impresa de la factura electrónica', notaCredito: 'Representación impresa de la nota de crédito electrónica' } as const;

/** Contenido del QR [RS 113-2018, anexo 6, §6.4.3]. Campos vacíos se conservan. */
export function sunatQr(s: SolicitudSunat, resumen: string): string {
    return [
        s.ruc,
        s.tipo,
        s.serie,
        String(s.numero),
        s.totales.igv,
        s.totales.importeTotal,
        s.fecha,
        s.receptor.tipoDoc,
        s.receptor.numDoc,
        resumen,
    ].join('|');
}

const fechaDma = (iso: string | null | undefined) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

function dinero(valor: string, moneda: string): string {
    const n = Number(valor) || 0;
    const txt = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    return moneda === 'PEN' ? `S/ ${txt}` : `${moneda} ${txt}`;
}

const DOCUMENTO: Record<string, string> = {
    [DOC_IDENTIDAD.RUC]: 'RUC',
    [DOC_IDENTIDAD.DNI]: 'DNI',
    [DOC_IDENTIDAD.NO_DOMICILIADO]: 'Doc. tributario no domiciliado',
};

const TIPOS_NOTA: Record<string, string> = { '01': 'Anulación de la operación', '09': 'Disminución en el valor' };

export interface DatosRepresentacionSunat {
    solicitud: SolicitudSunat;
    /** Valor resumen (DigestValue) del XML aceptado. */
    resumen: string;
    /** Número del proceso de recepción de la CDR, si se conoce. */
    constancia?: string | null;
    homologacion: boolean;
}

export function representacionSunat(d: DatosRepresentacionSunat): RepresentacionImpresa {
    const s = d.solicitud;
    const nc = s.tipo === TIPO_DOC.NOTA_CREDITO;
    const t = s.totales;
    const filas: FilaRepresentacion[] = [
        { k: 'RUC', v: s.ruc },
        { k: 'Serie y número', v: idComprobante(s) },
        { k: 'Fecha de emisión', v: fechaDma(s.fecha) },
        { k: 'Moneda', v: s.moneda },
        { k: 'Adquirente', v: `${DOCUMENTO[s.receptor.tipoDoc] ?? `Doc. ${s.receptor.tipoDoc}`} ${s.receptor.numDoc}` },
    ];
    if (s.tipoOperacion && s.tipoOperacion !== TIPO_OPERACION.VENTA_INTERNA) {
        filas.push({ k: 'Tipo de operación', v: s.tipoOperacion === TIPO_OPERACION.EXPORTACION_SERVICIOS ? 'Exportación de servicios' : 'Exportación de bienes' });
    }
    if (s.notaCredito) {
        const r = s.notaCredito.referencia;
        filas.push({ k: 'Factura que modifica', v: `${r.serie}-${r.numero}` });
        filas.push({ k: 'Tipo de nota', v: `${s.notaCredito.tipoNota} - ${TIPOS_NOTA[s.notaCredito.tipoNota] ?? ''}`.trim() });
    }
    const presentes = (af: string) => s.lineas.some((l) => l.afectacion === af);
    if (presentes(AFECTACION.GRAVADO)) filas.push({ k: 'Op. gravada', v: dinero(t.gravadas, s.moneda) });
    if (presentes(AFECTACION.EXONERADO)) filas.push({ k: 'Op. exonerada', v: dinero(t.exoneradas, s.moneda) });
    if (presentes(AFECTACION.INAFECTO)) filas.push({ k: 'Op. inafecta', v: dinero(t.inafectas, s.moneda) });
    if (presentes(AFECTACION.EXPORTACION)) filas.push({ k: 'Op. exportación', v: dinero(t.exportacion, s.moneda) });
    const tasa = s.lineas.find((l) => l.afectacion === AFECTACION.GRAVADO)?.porcentaje;
    filas.push({ k: tasa ? `IGV ${Number(tasa).toLocaleString('es-PE')} %` : 'IGV', v: dinero(t.igv, s.moneda) });
    filas.push({ k: 'Importe total', v: dinero(t.importeTotal, s.moneda) });
    if (s.formaPago) {
        filas.push({ k: 'Forma de pago', v: s.formaPago.tipo === FORMA_PAGO.CONTADO ? 'Contado' : 'Crédito' });
        if (s.formaPago.tipo === FORMA_PAGO.CREDITO) {
            filas.push({ k: 'Monto neto pendiente de pago', v: dinero(s.formaPago.montoNeto, s.moneda) });
            s.formaPago.cuotas.forEach((c, i) => filas.push({ k: `Cuota ${i + 1}`, v: `${dinero(c.monto, s.moneda)}, vence ${fechaDma(c.vence)}` }));
        }
    }
    if (s.retencion) filas.push({ k: 'Retención del IGV (3 %)', v: dinero(s.retencion.monto, s.moneda) });
    if (d.constancia) filas.push({ k: 'Constancia de recepción', v: d.constancia });

    const leyendas: string[] = [];
    if (d.homologacion) leyendas.push('Comprobante enviado al servicio de pruebas (beta) de SUNAT: no tiene validez fiscal.');
    leyendas.push(`SON: ${s.leyendaLetras}`);
    leyendas.push(`Valor resumen: ${d.resumen}`);
    if (s.notaCredito?.motivo) leyendas.push(`Motivo: ${s.notaCredito.motivo}`);
    const leyenda = nc ? LEYENDA_REPRESENTACION.notaCredito : LEYENDA_REPRESENTACION.factura;
    leyendas.push(leyenda);

    return {
        rail: 'sunat',
        titulo: nc ? 'NOTA DE CRÉDITO ELECTRÓNICA' : 'FACTURA ELECTRÓNICA',
        codigo: `RUC ${s.ruc}`,
        filas,
        qrUrl: sunatQr(s, d.resumen),
        qrLeyenda: d.resumen,
        qrNivel: QR_NIVEL,
        qrPosicion: 'inferior',
        leyendas,
        pie: d.homologacion
            ? `${leyenda}. Comprobante de prueba (${numeroDocumento(s, true)}) enviado al servicio beta de SUNAT: sin validez fiscal.`
            : `${leyenda}. Aceptada por SUNAT${d.constancia ? ` (constancia de recepción ${d.constancia})` : ''}. Valor resumen: ${d.resumen}.`,
        ...(d.homologacion ? { prueba: true } : {}),
    };
}
