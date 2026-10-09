// Representación gráfica de un documento validado por la DIAN: lo que el PDF
// de Cord imprime además de lo que ya dibuja (emisor, cliente, conceptos,
// totales con el IVA discriminado).
//
//   - Título del documento y su número (prefijo + consecutivo).
//   - La autorización de numeración: resolución, prefijo, rango y vigencia
//     (Estatuto Tributario art. 617, lit. f — el número "con la autorización").
//   - Fecha y hora de generación y la de validación de la DIAN.
//   - NIT del emisor con su DV y sus responsabilidades fiscales (entre ellas
//     la calidad de agente de retención del IVA, art. 617 lit. g).
//   - El CUFE (factura) o CUDE (notas), en el pie de TODAS las páginas.
//   - El código QR con el contenido del numeral 11.7 del Anexo Técnico, que la
//     representación "debe incluir … en todas las páginas" con un tamaño
//     mínimo de 2 cm [AT 11.7, "La Representación Gráfica"].
//
// Se arma UNA vez al validar y se guarda en provider_data (latam/representacion.ts).
// Puro: lo prueban scripts/dian-check.mjs y test/dian-comprobante.test.ts.

// Extensión .ts explícita: este módulo también se carga desde Node plano.
import type { FilaRepresentacion, RepresentacionImpresa } from '../representacion.ts';
import { CONCEPTOS_NOTA_CREDITO, CONCEPTOS_NOTA_DEBITO } from './constantes.ts';
import { documentoAdquiriente, type SolicitudDian } from './comprobante.ts';
import { textoQr } from './cufe.ts';

const TITULOS: Record<SolicitudDian['clase'], string> = {
    factura: 'FACTURA ELECTRÓNICA DE VENTA',
    nota_credito: 'NOTA CRÉDITO ELECTRÓNICA',
    nota_debito: 'NOTA DÉBITO ELECTRÓNICA',
};

const fechaDma = (iso: string | null | undefined) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

const hora = (h: string | null | undefined) => String(h ?? '').slice(0, 8);

export interface DatosRepresentacionDian {
    solicitud: SolicitudDian;
    /** Fecha y hora de validación de la DIAN (ApplicationResponse), si se conocen. */
    validado?: { fecha: string; hora: string } | null;
    homologacion: boolean;
}

export function representacionDian(d: DatosRepresentacionDian): RepresentacionImpresa {
    const s = d.solicitud;
    const nombreCodigo = s.clase === 'factura' ? 'CUFE' : 'CUDE';
    const filas: FilaRepresentacion[] = [
        { k: 'Número', v: s.id },
        { k: 'Generada', v: `${fechaDma(s.fecha)} ${hora(s.hora)}` },
    ];
    if (d.validado) filas.push({ k: 'Validada por la DIAN', v: `${fechaDma(d.validado.fecha)} ${hora(d.validado.hora)}` });
    filas.push({ k: 'NIT del emisor', v: `${s.emisor.nit}-${s.emisor.dv}` });
    if (s.emisor.responsabilidades.length) filas.push({ k: 'Responsabilidades', v: s.emisor.responsabilidades.join(', ') });
    if (s.emisor.matriculaMercantil) filas.push({ k: 'Matrícula mercantil', v: s.emisor.matriculaMercantil });
    filas.push({ k: 'Adquiriente', v: documentoAdquiriente(s.adquiriente) });
    if (s.resolucion) {
        const r = s.resolucion;
        filas.push({
            k: 'Autorización de numeración',
            v: `Resolución DIAN ${r.numero}, ${r.prefijo ? `prefijo ${r.prefijo}, ` : ''}del ${r.desde} al ${r.hasta}, vigente del ${fechaDma(r.vigenteDesde)} al ${fechaDma(r.vigenteHasta)}`,
        });
    }
    if (s.clase === 'factura') {
        filas.push({ k: 'Forma de pago', v: s.formaPago === '2' ? `Crédito, vence ${fechaDma(s.vencimiento)}` : 'Contado' });
    }
    if (s.referencia) {
        filas.push({ k: 'Factura que ajusta', v: `${s.referencia.id} del ${fechaDma(s.referencia.fecha)}` });
        const conceptos = s.clase === 'nota_debito' ? CONCEPTOS_NOTA_DEBITO : CONCEPTOS_NOTA_CREDITO;
        filas.push({ k: 'Concepto', v: (conceptos[s.referencia.concepto] ?? s.referencia.descripcion).replace(/\s+/g, ' ') });
    }
    if (s.tasaCambio) filas.push({ k: 'Moneda / tasa a COP', v: `${s.moneda} · ${s.tasaCambio.tasa} (${fechaDma(s.tasaCambio.fecha)})` });

    const leyendas: string[] = [];
    if (d.homologacion) leyendas.push('Documento validado en el ambiente de habilitación (pruebas) de la DIAN: no tiene validez fiscal.');

    return {
        rail: 'dian',
        titulo: TITULOS[s.clase],
        filas,
        qrUrl: textoQr({
            numero: s.id,
            fecha: s.fecha,
            hora: s.hora,
            nitEmisor: s.emisor.nit,
            docAdquiriente: s.adquiriente.numero,
            valorBruto: s.totales.bruto,
            iva: s.iva.length ? s.totales.iva : '0.00',
            otrosImpuestos: '0.00',
            total: s.totales.pagar,
            cufe: s.cufe,
            url: s.qrUrl,
        }),
        qrLeyenda: 'Consulta este documento en la DIAN',
        qrCadaPagina: true,
        leyendas,
        pie: d.homologacion
            ? `Documento de prueba validado en habilitación de la DIAN, sin validez fiscal. ${nombreCodigo}: ${s.cufe}`
            : `Representación gráfica del documento electrónico validado por la DIAN. ${nombreCodigo}: ${s.cufe}`,
        ...(d.homologacion ? { prueba: true } : {}),
    };
}
