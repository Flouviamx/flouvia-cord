// Lo que un comprobante autorizado por ARCA lleva impreso, además de lo que
// el PDF de Cord ya dibuja (emisor, receptor, conceptos, totales):
//
//   - letra, código y título del comprobante ("FACTURA A", "COD. 01");
//   - punto de venta y número, CAE y su vencimiento (RG 4291, arts. 14 y 15:
//     el comprobante "deberá contener el C.A.E."; al pie, "en reemplazo del
//     logo CF");
//   - el QR (RG 4892/2020, arcaQrUrl);
//   - las leyendas que corresponden según emisor y receptor:
//       · "A CONSUMIDOR FINAL" cuando el receptor es consumidor final
//         (https://www.arca.gob.ar/fe/emision-autorizacion/datos-comprobantes.asp);
//       · "Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)" con el
//         "IVA Contenido" y "Otros Impuestos Nacionales Indirectos" en las
//         facturas B (RG 5614/2024, art. 2°, punto 7: Anexo II, apartado B,
//         inciso g); Cord no liquida otros impuestos indirectos, así que van
//         en cero;
//       · la del crédito fiscal en una Factura A a un monotributista (texto
//         de la observación 10217 del manual del desarrollador v4.7).
//
// Se arma UNA vez al autorizar y se guarda en provider_data (latam/representacion.ts).
// Puro: lo prueba scripts/arca-check.mjs con Node plano.

// Extensión .ts explícita: este módulo también se carga desde Node plano.
import type { RepresentacionImpresa, FilaRepresentacion } from '../representacion.ts';
import { CONDICIONES_EMISOR, CONDICIONES_IVA_RECEPTOR, CONDICION_RECEPTOR_CONSUMIDOR_FINAL, DESCRIPCION_COMPROBANTE, DOC_TIPO, type CondicionEmisor } from './constantes.ts';
import { fechaArcaAIso, numeroLegal, type SolicitudArca } from './comprobante.ts';
import { arcaQrUrl } from './qr.ts';

export const LEYENDA_CONSUMIDOR_FINAL = 'A CONSUMIDOR FINAL';
export const LEYENDA_TRANSPARENCIA = 'Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)';
export const LEYENDA_CREDITO_FISCAL_MONOTRIBUTO = 'El crédito fiscal discriminado en el presente comprobante, sólo podrá ser computado a efectos del Procedimiento permanente de transición al Régimen General.';
/** Condiciones del receptor que son monotributo (obs. 10217 del manual). */
const RECEPTOR_MONOTRIBUTO = new Set([6, 13, 16]);

export interface DatosRepresentacionArca {
    solicitud: SolicitudArca;
    cae: string;
    /** aaaa-mm-dd */
    caeVence: string | null;
    condicionEmisor: CondicionEmisor;
    homologacion: boolean;
    /** Factura que ajusta, si es nota de crédito. */
    asociado?: { cbteTipo: number; ptoVta: number; numero: number } | null;
    ingresosBrutos?: string | null;
    /** aaaa-mm-dd */
    inicioActividades?: string | null;
}

const fechaDma = (iso: string | null | undefined) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

const cuitConGuiones = (c: string) => (/^\d{11}$/.test(c) ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);

function importe(valor: string | number, monId: string): string {
    const n = Number(valor) || 0;
    const txt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    return monId === 'PES' ? `$ ${txt}` : `${txt} (${monId})`;
}

export function representacionArca(d: DatosRepresentacionArca): RepresentacionImpresa {
    const s = d.solicitud;
    const det = s.detalle;
    const desc = DESCRIPCION_COMPROBANTE[s.cbteTipo];
    const titulo = `${desc?.titulo ?? 'COMPROBANTE'} ${s.clase}`;
    const condicionReceptor = CONDICIONES_IVA_RECEPTOR.find((c) => c.id === det.CondicionIVAReceptorId);
    const receptor = det.DocTipo === DOC_TIPO.CUIT ? `CUIT ${cuitConGuiones(det.DocNro)}`
        : det.DocTipo === DOC_TIPO.DNI ? `DNI ${det.DocNro}`
        : 'Sin identificar';

    const filas: FilaRepresentacion[] = [
        { k: 'Punto de venta', v: String(s.ptoVta).padStart(5, '0') },
        { k: 'Comp. Nro', v: String(det.CbteDesde).padStart(8, '0') },
        { k: 'Fecha de emisión', v: fechaDma(fechaArcaAIso(det.CbteFch)) },
        { k: 'CUIT del emisor', v: cuitConGuiones(s.cuit) },
        { k: 'Condición frente al IVA', v: CONDICIONES_EMISOR.find((c) => c.id === d.condicionEmisor)?.nombre ?? '' },
    ];
    if (d.ingresosBrutos) filas.push({ k: 'Ingresos Brutos', v: d.ingresosBrutos });
    if (d.inicioActividades) filas.push({ k: 'Inicio de actividades', v: fechaDma(d.inicioActividades) });
    filas.push({ k: 'Receptor', v: receptor });
    if (condicionReceptor) filas.push({ k: 'Condición IVA del receptor', v: condicionReceptor.nombre });
    if (d.asociado) {
        const a = DESCRIPCION_COMPROBANTE[d.asociado.cbteTipo];
        filas.push({ k: 'Comprobante asociado', v: `${a ? `${a.titulo} ${a.clase}` : `Tipo ${d.asociado.cbteTipo}`} ${numeroLegal(d.asociado.ptoVta, d.asociado.numero)}` });
    }
    // Descuento de documento: los importes autorizados ya son netos de él.
    if (s.bonificacion && Number(s.bonificacion) > 0) filas.push({ k: 'Bonificación', v: importe(s.bonificacion, det.MonId) });
    if (det.MonId !== 'PES') filas.push({ k: 'Moneda / cotización', v: `${det.MonId} · ${det.MonCotiz}` });
    filas.push({ k: 'CAE N°', v: d.cae });
    if (d.caeVence) filas.push({ k: 'Fecha de Vto. de CAE', v: fechaDma(d.caeVence) });

    const leyendas: string[] = [];
    if (d.homologacion) leyendas.push('Comprobante autorizado en el ambiente de homologación (pruebas) de ARCA: no tiene validez fiscal.');
    if (det.CondicionIVAReceptorId === CONDICION_RECEPTOR_CONSUMIDOR_FINAL) leyendas.push(LEYENDA_CONSUMIDOR_FINAL);
    if (s.clase === 'B') {
        leyendas.push(`${LEYENDA_TRANSPARENCIA}. IVA Contenido: ${importe(det.ImpIVA, det.MonId)}. Otros Impuestos Nacionales Indirectos: ${importe(0, det.MonId)}.`);
    }
    if (s.clase === 'A' && RECEPTOR_MONOTRIBUTO.has(det.CondicionIVAReceptorId)) leyendas.push(LEYENDA_CREDITO_FISCAL_MONOTRIBUTO);

    return {
        rail: 'arca',
        titulo,
        letra: s.clase,
        codigo: `COD. ${String(s.cbteTipo).padStart(2, '0')}`,
        filas,
        qrUrl: arcaQrUrl({
            fecha: fechaArcaAIso(det.CbteFch),
            cuit: s.cuit,
            ptoVta: s.ptoVta,
            tipoCmp: s.cbteTipo,
            nroCmp: det.CbteDesde,
            importe: det.ImpTotal,
            moneda: det.MonId,
            ctz: det.MonCotiz,
            tipoDocRec: det.DocTipo,
            nroDocRec: det.DocNro,
            tipoCodAut: 'E',
            codAut: d.cae,
        }),
        qrLeyenda: 'Comprobante autorizado por ARCA',
        leyendas,
        pie: d.homologacion
            ? `Comprobante de prueba autorizado en homologación de ARCA (CAE ${d.cae}). Sin validez fiscal.`
            : `Comprobante electrónico autorizado por ARCA. CAE N° ${d.cae}${d.caeVence ? `, vencimiento ${fechaDma(d.caeVence)}` : ''}.`,
        ...(d.homologacion ? { prueba: true } : {}),
    };
}
