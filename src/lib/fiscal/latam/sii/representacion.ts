// Representación impresa de un DTE aceptado por el SII, según el "Manual de
// muestras impresas" (v4.0, julio 2014) y el instructivo técnico (Anexo 2,
// A.2.5):
//
//   - recuadro arriba a la derecha con el RUT del emisor (con puntos), el
//     nombre del documento en mayúsculas y el N° de folio; debajo, la
//     dirección regional o unidad del SII (1.1.4);
//   - arriba a la izquierda, bajo la razón social destacada: el giro sin
//     abreviar, la casa matriz y la sucursal, en ese orden (1.1.7);
//   - fecha de emisión, receptor (razón social, RUT, giro, dirección),
//     referencias (tipo en palabras, folio, fecha, motivo) (1.1.7);
//   - descuentos de línea en monto, en su línea (1.4, "Descuentos");
//   - en la zona de totales: "Monto Neto", "Monto Exento" (si hay ítems
//     exentos) e "IVA (19%)" con su tasa; la factura exenta solo informa el
//     exento y el total (1.4, "Montos Exentos" y "Tasa de Impuesto");
//   - timbre PDF417 al pie, a no menos de 2 cm del borde izquierdo, con
//     "Timbre Electrónico SII", "Res. XX de AAAA" y "Verifique documento:
//     www.sii.cl" debajo (1.5);
//   - copia cedible (33 y 34): recuadro de acuse de recibo con nombre, RUT,
//     fecha, recinto y firma, el texto de la Res. Ex. SII N° 51 de 2005 y la
//     leyenda "CEDIBLE" abajo a la derecha (1.4). Las notas de crédito y de
//     débito no llevan copia cedible ni acuse.
//
// Se arma UNA vez, al quedar aceptado, y se guarda en provider_data
// (latam/representacion.ts). Puro: lo prueba scripts/sii-check.mjs.

// Extensión .ts explícita: este módulo también se carga desde Node plano.
import type { FilaRepresentacion, RepresentacionImpresa } from '../representacion.ts';
import { TASA_IVA_PCT, TIPOS_DTE, TPO_DOC_REF_SET, type TipoDte } from './constantes.ts';
import { referenciasDe, type BorradorSii } from './dte.ts';
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
    /**
     * Muestra impresa para el SII (etapa "Documentos impresos" de la
     * certificación): el documento se dibuja como uno real, sin el aviso de
     * documento de prueba — el SII revisa la representación que tendrán los
     * documentos de verdad. La resolución "0" ya dice que es de certificación.
     */
    muestra?: boolean;
}

const pesos = (n: number) => `$ ${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(n)}`;
const pct = (n: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(n);

/** Codifica una fila de módulos ('0'/'1') en hexadecimal para guardarla compacta. */
export function filaAHex(fila: string): string {
    const relleno = fila.padEnd(Math.ceil(fila.length / 4) * 4, '0');
    let out = '';
    for (let i = 0; i < relleno.length; i += 4) out += parseInt(relleno.slice(i, i + 4), 2).toString(16);
    return out;
}

/** Filas de referencia: tipo en palabras, folio, fecha y motivo (manual, 1.1.7 y 1.4). */
export function filasReferencias(b: Pick<BorradorSii, 'referencias' | 'referencia'>): FilaRepresentacion[] {
    const filas: FilaRepresentacion[] = [];
    for (const r of referenciasDe(b)) {
        if (r.tipo === TPO_DOC_REF_SET) {
            filas.push({ k: 'Set de pruebas', v: r.razon });
            continue;
        }
        const nombre = TIPOS_DTE[r.tipo as TipoDte]?.nombre ?? `DOCUMENTO TIPO ${r.tipo}`;
        filas.push({ k: 'Referencia', v: `${nombre} N° ${r.folio} del ${fechaDma(r.fecha)}` });
        if (r.razon) filas.push({ k: 'Motivo', v: r.razon });
    }
    return filas;
}

/** Totalizadores del SII en la zona de totales (manual, 1.4). */
export function totalesSii(b: BorradorSii): FilaRepresentacion[] {
    const filas: FilaRepresentacion[] = [];
    if (b.descuentoGlobal && b.descuentoGlobal.monto > 0) {
        filas.push({ k: `Descuento global ${pct(b.descuentoGlobal.pct)}% (ítems afectos)`, v: `-${pesos(b.descuentoGlobal.monto)}` });
    }
    const conIva = b.tipo !== 34 && (b.neto > 0 || b.iva > 0);
    if (conIva) filas.push({ k: 'Monto neto', v: pesos(b.neto) });
    if (b.exento > 0 || b.tipo === 34) filas.push({ k: 'Monto exento', v: pesos(b.exento) });
    if (conIva) filas.push({ k: `IVA (${TASA_IVA_PCT}%)`, v: pesos(b.iva) });
    return filas;
}

export function representacionSii(d: DatosRepresentacionSii): RepresentacionImpresa {
    const b = d.borrador;
    const tipo = TIPOS_DTE[b.tipo as TipoDte];
    // El PDF de Cord ya imprime las razones sociales, el RUT del cliente, los
    // conceptos y el total; aquí va lo que la norma exige y ese PDF no trae.
    const filas: FilaRepresentacion[] = [{ k: 'Fecha de emisión', v: fechaDma(b.fechaEmision) }];
    if (b.formaPago) filas.push({ k: 'Forma de pago', v: b.formaPago === 1 ? 'Contado' : 'Crédito' });
    if (b.vencimiento) filas.push({ k: 'Vencimiento', v: fechaDma(b.vencimiento) });
    if (b.periodo) filas.push({ k: 'Período', v: `${fechaDma(b.periodo.desde)} al ${fechaDma(b.periodo.hasta)}` });
    filas.push(...filasReferencias(b));

    const em = b.emisor;
    const emisor = [
        `Giro: ${em.giro}`,
        `Casa matriz: ${[em.direccion, em.comuna, em.ciudad].filter(Boolean).join(', ')}`,
        ...(em.sucursal ? [`Sucursal: ${em.sucursal}`] : []),
    ];
    const re = b.receptor;
    const receptor = [
        ...(re.giro ? [`Giro: ${re.giro}`] : []),
        ...(re.direccion ? [`Dirección: ${re.direccion}`] : []),
        ...(re.comuna ? [`Comuna: ${re.comuna}${re.ciudad ? ` · Ciudad: ${re.ciudad}` : ''}`] : []),
    ];

    const bytes = bytesLatin1(d.timbre);
    const medidas = medidasTimbre(bytes);
    const simbolo = codificarPdf417(bytes, medidas.columnas);
    const anioRes = d.resolucion.fecha.slice(0, 4);
    const prueba = d.certificacion && !d.muestra;

    const leyendas: string[] = [];
    if (prueba) leyendas.push('Documento emitido en el ambiente de certificación (pruebas) del SII: no tiene validez tributaria.');

    return {
        rail: 'sii',
        titulo: tipo.nombre,
        recuadro: {
            lineas: [`R.U.T.: ${rutConPuntos(em.rut)}`, tipo.nombre, `N° ${d.folio}`],
            pie: `S.I.I. - ${d.unidadSii.toUpperCase()}`,
        },
        filas,
        emisor,
        ...(receptor.length ? { receptor } : {}),
        totales: totalesSii(b),
        totalEtiqueta: 'Monto total',
        descuentoPorLinea: true,
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
        pie: prueba
            ? `Documento de prueba emitido en certificación del SII (${tipo.nombre} N° ${d.folio}). Sin validez tributaria.`
            : `Documento tributario electrónico${d.muestra ? '' : ' aceptado por el SII'}. ${tipo.nombre} N° ${d.folio}. ${LEYENDA_VERIFIQUE}`,
        ...(prueba ? { prueba: true } : {}),
    };
}
