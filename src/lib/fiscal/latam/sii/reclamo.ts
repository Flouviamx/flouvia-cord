// Registro de aceptación o reclamo de un DTE recibido ante el SII (Ley 19.983
// modificada por la Ley 20.956): "Web Service de Consulta y Registro de
// Aceptación/Reclamo a DTE recibido", v1.2 (07/08/2017), www.sii.cl. WSDL
// vendorizados en scripts/fixtures/sii/registroreclamodte-*.wsdl.
//
//   - SOAP 1.1 rpc/literal, espacio de nombres
//     http://ws.registroreclamodte.diii.sdi.sii.cl, SOAPAction vacío; los
//     parámetros sin calificar y en el orden de parameterOrder (ejemplo del
//     anexo del manual: <ws:ingresarAceptacionReclamoDoc><rutEmisor>…);
//   - autenticado con el token del SII en la cookie TOKEN (el mismo de
//     CrSeed/GetTokenFromSeed, autorizacion.ts);
//   - acciones: ACD acepta el contenido, RCD reclama el contenido, ERM otorga
//     el recibo de mercaderías o servicios, RFP/RFT reclaman la falta parcial
//     o total de mercaderías; solo para 33, 34 y 43 y dentro de los 8 días
//     corridos desde que el SII recibió el documento;
//   - respuesta <return><codResp/><descResp/></return>: 0 "Acción Completada
//     OK"; 7 "Evento registrado previamente" (idempotente: ya estaba); el
//     resto, un motivo que se traduce para el dueño del negocio (regla 14).
//
// Puro salvo `llamarReclamo` (fetch).

import { parseStringPromise, processors } from 'xml2js';
// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { NS_WS_RECLAMO, siiReclamoEndpoint, type AccionReclamo } from './constantes.ts';
import { partesRut } from './texto.ts';
import { SiiFaultError, SiiTransporteError } from './ws.ts';
import type { EntornoRail } from '../rieles.ts';

export type OperacionReclamo = 'ingresarAceptacionReclamoDoc' | 'listarEventosHistDoc' | 'consultarDocDteCedible' | 'consultarFechaRecepcionSii';

export interface DocumentoReclamo {
    rutEmisor: string;
    tipo: number;
    folio: number;
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Sobre de una operación del servicio, con los parámetros en el orden del WSDL. */
export function sobreReclamo(op: OperacionReclamo, d: DocumentoReclamo, accion?: AccionReclamo): string {
    const { cuerpo, dv } = partesRut(d.rutEmisor);
    const params: [string, string][] = [['rutEmisor', cuerpo], ['dvEmisor', dv.toUpperCase()], ['tipoDoc', String(d.tipo)], ['folio', String(d.folio)]];
    if (op === 'ingresarAceptacionReclamoDoc') {
        if (!accion) throw new Error('sii: falta la acción del reclamo');
        params.push(['accionDoc', accion]);
    }
    return '<?xml version="1.0" encoding="UTF-8"?>'
        + `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="${NS_WS_RECLAMO}">`
        + '<soapenv:Header/><soapenv:Body>'
        + `<ws:${op}>${params.map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('')}</ws:${op}>`
        + '</soapenv:Body></soapenv:Envelope>';
}

export interface RespuestaReclamo {
    codigo: number;
    descripcion: string;
    eventos: { codigo: string; descripcion: string; fecha: string }[];
}

type N = Record<string, unknown>;
const hijo = (n: unknown, k: string): unknown => (n && typeof n === 'object' ? (n as N)[k] : undefined);
const texto = (n: unknown): string => (n === undefined || n === null ? '' : typeof n === 'object' ? String((n as N)._ ?? '').trim() : String(n).trim());
const lista = (n: unknown): unknown[] => (Array.isArray(n) ? n : n === undefined ? [] : [n]);

export async function parsearRespuestaReclamo(xml: string, op: OperacionReclamo): Promise<RespuestaReclamo> {
    let raiz: N;
    try {
        raiz = await parseStringPromise(xml, { explicitArray: false, ignoreAttrs: true, tagNameProcessors: [processors.stripPrefix] }) as N;
    } catch {
        throw new SiiTransporteError('La respuesta del registro de reclamos no es un XML legible.');
    }
    const body = hijo(hijo(raiz, 'Envelope'), 'Body');
    const fault = hijo(body, 'Fault');
    if (fault) throw new SiiFaultError(texto(hijo(fault, 'faultcode')).replace(/^.*:/, '') || 'desconocido', texto(hijo(fault, 'faultstring')));
    const ret = hijo(hijo(body, `${op}Response`), 'return');
    if (ret === undefined) throw new SiiTransporteError(`Respuesta sin ${op}Response.`);
    const codigo = Number(texto(hijo(ret, 'codResp')));
    if (!Number.isInteger(codigo)) throw new SiiTransporteError('Respuesta del registro de reclamos sin codResp.');
    return {
        codigo,
        descripcion: texto(hijo(ret, 'descResp')),
        eventos: lista(hijo(ret, 'listaEventosDoc')).map((e) => ({
            codigo: texto(hijo(e, 'codEvento')), descripcion: texto(hijo(e, 'descEvento')), fecha: texto(hijo(e, 'fechaEvento')),
        })),
    };
}

/** ¿El evento quedó registrado (ahora o antes)? */
export const reclamoRegistrado = (codigo: number) => codigo === 0 || codigo === 7;
/** Error interno del SII: reintentar más tarde (manual, código -1). */
export const reclamoTransitorio = (codigo: number) => codigo === -1;

/** Mensaje para el dueño del negocio por cada código del manual (sin la glosa cruda). */
export function mensajeReclamo(codigo: number): string {
    switch (codigo) {
        case 0: case 7: return 'Registrado en el SII.';
        case 1: case 2: case 9: case 10: case 18:
            return 'El SII no tiene registrado este documento (todavía no lo recibe, o el RUT, el tipo o el folio no coinciden).';
        case 3: return 'El SII solo registra aceptaciones y reclamos de facturas (33 y 34) y liquidaciones-factura.';
        case 5: case 6: case 12: return 'El documento ya tiene un reclamo registrado en el SII: no se puede aceptar ni dar acuse de recibo.';
        case 8: return 'Pasaron los 8 días desde que el SII recibió el documento: ya no se pueden registrar aceptaciones ni reclamos.';
        case 11: case 13: return 'El documento ya fue aceptado o recibido conforme en el SII: no se puede reclamar.';
        case 14: case 17: return 'Solo el receptor del documento puede registrarlo. Revisa que el certificado sea de una persona autorizada por tu negocio ante el SII.';
        case 19: return 'El reclamo por mercaderías ya está registrado en el SII.';
        default: return 'El SII no pudo registrar la acción en este momento. Reintenta en unos minutos.';
    }
}

/** POST al servicio de reclamos con la cookie del token. */
export async function llamarReclamo(entorno: EntornoRail, token: string, sobre: string, opts: { timeoutMs?: number; url?: string } = {}): Promise<string> {
    let cuerpo = '';
    let status = 0;
    try {
        const r = await fetch(opts.url ?? siiReclamoEndpoint(entorno), {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""', Cookie: `TOKEN=${token}` },
            body: sobre,
            signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
            redirect: 'error',
        });
        status = r.status;
        cuerpo = await r.text();
    } catch (error) {
        throw new SiiTransporteError(`registroreclamodte: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!/<(\w+:)?Envelope[\s>]/.test(cuerpo)) throw new SiiTransporteError(`registroreclamodte: HTTP ${status} sin mensaje SOAP`);
    return cuerpo;
}
