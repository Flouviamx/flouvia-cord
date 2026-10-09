// Representación impresa de un DTE aceptado por el SII, según el "Manual de
// muestras impresas" (v4.0, julio 2014) y el instructivo técnico (Anexo 2,
// A.2.5):
//
//   - recuadro arriba a la derecha con el RUT del emisor (con puntos), el
//     nombre del documento en mayúsculas y el N° de folio; debajo, la
//     dirección regional o unidad del SII (1.1.4);
//   - fecha de emisión, receptor (razón social, RUT, giro, dirección),
//     referencias (tipo en palabras, folio, fecha, motivo) (1.1.7);
//   - "Monto Exento" cuando hay ítems exentos y la tasa en el totalizador de
//     IVA (1.4);
//   - timbre PDF417 al pie, a no menos de 2 cm del borde izquierdo, con
//     "Timbre Electrónico SII", "Res. XX de AAAA" y "Verifique documento:
//     www.sii.cl" debajo (1.5);
//   - copia cedible (33 y 34): recuadro de acuse de recibo con nombre, RUT,
//     fecha, recinto y firma, el texto de la Res. Ex. SII N° 51 de 2005 y la
//     leyenda "CEDIBLE" abajo a la derecha (1.4). Las notas no llevan copia
//     cedible.
//
// Se arma UNA vez, al quedar aceptado, y se guarda en provider_data
// (latam/representacion.ts). Puro: lo prueba scripts/sii-check.mjs.

// Extensión .ts explícita: este módulo también se carga desde Node plano.
import type { FilaRepresentacion, RepresentacionImpresa } from '../representacion.ts';
import { TASA_IVA_PCT, TIPOS_DTE, type TipoDte } from './constantes.ts';
import type { BorradorSii } from './dte.ts';
import { codificarPdf417, medidasTimbre } from './pdf417.ts';
import { bytesLatin1, fechaDma, rutConPuntos } from './texto.ts';

export const LEYENDA_TIMBRE = 'Timbre Electrónico SII';
export const LEYENDA_VERIFIQUE = 'Verifique documento: www.sii.cl';
export const LEYENDA_CEDIBLE = 'CEDIBLE';
/** Texto obligatorio del acuse de recibo (Res. Ex. SII N° 51 de 2005; manual de muestras impresas, 1.4). */
export const TEXTO_ACUSE = 'El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en la letra b) del Art. 4°, y la letra c) del Art. 5° de la Ley 19.983, acredita que la entrega de mercaderías o servicio(s) prestado(s) ha(n) sido recibido(s).';
export const CAMPOS_ACUSE = ['Nombre', 'RUT', 'Fecha', 'Recinto', 'Firma'];

export interface DatosRepresentacionSii {
    borrador: BorradorSii;
    folio: number;
    /** <TED> aplanado (contenido del PDF417). */
    timbre: string;
    /** Dirección regional o unidad del SII del emisor ("SANTIAGO CENTRO"). */
    unidadSii: string;
    resolucion: { numero: number; fecha: string };
    certificacion: boolean;
    /** Número de envío (trackid) con que el SII lo aceptó, si se conoce. */
    trackId?: string | null;
}

const pesos = (n: number) => `$ ${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(n)}`;

/** Codifica una fila de módulos ('0'/'1') en hexadecimal para guardarla compacta. */
export function filaAHex(fila: string): string {
    const relleno = fila.padEnd(Math.ceil(fila.length / 4) * 4, '0');
    let out = '';
    for (let i = 0; i < relleno.length; i += 4) out += parseInt(relleno.slice(i, i + 4), 2).toString(16);
    return out;
}

export function representacionSii(d: DatosRepresentacionSii): RepresentacionImpresa {
    const b = d.borrador;
    const tipo = TIPOS_DTE[b.tipo as TipoDte];
    // El PDF de Cord ya imprime emisor, cliente (razón social, RUT, dirección),
    // conceptos y totales; aquí va lo que la norma exige y ese PDF no trae.
    const filas: FilaRepresentacion[] = [
        { k: 'Fecha de emisión', v: fechaDma(b.fechaEmision) },
        { k: 'Giro del emisor', v: b.emisor.giro },
    ];
    if (b.emisor.sucursal) filas.push({ k: 'Sucursal', v: b.emisor.sucursal });
    if (b.receptor.giro) filas.push({ k: 'Giro del cliente', v: b.receptor.giro });
    if (b.receptor.comuna) filas.push({ k: 'Comuna del cliente', v: b.receptor.comuna });
    if (b.formaPago) filas.push({ k: 'Forma de pago', v: b.formaPago === 1 ? 'Contado' : 'Crédito' });
    if (b.vencimiento) filas.push({ k: 'Vencimiento', v: fechaDma(b.vencimiento) });
    if (b.periodo) filas.push({ k: 'Período', v: `${fechaDma(b.periodo.desde)} al ${fechaDma(b.periodo.hasta)}` });
    if (b.referencia) {
        const ref = TIPOS_DTE[b.referencia.tipo];
        filas.push({ k: 'Referencia', v: `${ref.nombre} N° ${b.referencia.folio} del ${fechaDma(b.referencia.fecha)}` });
        filas.push({ k: 'Motivo', v: b.referencia.razon });
    }
    // Totalizadores del SII: el subtotal de Cord suma neto y exento juntos.
    if (b.tipo !== 34 && (b.neto > 0 || b.iva > 0)) filas.push({ k: 'Monto neto', v: pesos(b.neto) });
    if (b.exento > 0) filas.push({ k: 'Monto exento', v: pesos(b.exento) });
    if (b.tipo !== 34 && (b.neto > 0 || b.iva > 0)) filas.push({ k: `IVA ${TASA_IVA_PCT}%`, v: pesos(b.iva) });

    const bytes = bytesLatin1(d.timbre);
    const medidas = medidasTimbre(bytes);
    const simbolo = codificarPdf417(bytes, medidas.columnas);
    const anioRes = d.resolucion.fecha.slice(0, 4);

    const leyendas: string[] = [];
    if (d.certificacion) leyendas.push('Documento emitido en el ambiente de certificación (pruebas) del SII: no tiene validez tributaria.');

    return {
        rail: 'sii',
        titulo: tipo.nombre,
        recuadro: {
            lineas: [`R.U.T.: ${rutConPuntos(b.emisor.rut)}`, tipo.nombre, `N° ${d.folio}`],
            pie: `S.I.I. - ${d.unidadSii.toUpperCase()}`,
        },
        filas,
        timbre: {
            filas: simbolo.filas.map(filaAHex),
            modulos: simbolo.filas[0].length,
            moduloMm: medidas.moduloMm,
            altoFilaMm: medidas.altoFilaMm,
            leyendas: [LEYENDA_TIMBRE, `Res. ${d.resolucion.numero} de ${anioRes} - ${LEYENDA_VERIFIQUE}`],
        },
        ...(tipo.cedible ? {
            cedible: { leyenda: LEYENDA_CEDIBLE, acuseTitulo: 'Acuse de recibo', acuseCampos: CAMPOS_ACUSE, acuseTexto: TEXTO_ACUSE },
        } : {}),
        leyendas,
        pie: d.certificacion
            ? `Documento de prueba emitido en certificación del SII (${tipo.nombre} N° ${d.folio}). Sin validez tributaria.`
            : `Documento tributario electrónico aceptado por el SII. ${tipo.nombre} N° ${d.folio}. Verifique documento: www.sii.cl`,
        ...(d.certificacion ? { prueba: true } : {}),
    };
}
