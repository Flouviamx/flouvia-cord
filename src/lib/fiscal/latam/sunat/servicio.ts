// Cliente SOAP de los servicios web de SUNAT para el SEE - Del contribuyente.
//
// Se arma a mano, como el de ARCA (latam/arca/wsfe.ts), siguiendo los WSDL
// REALES descargados de SUNAT (scripts/fixtures/sunat/): SOAP 1.1, namespace
// http://service.sunat.gob.pe, soapAction "urn:<operación>" y los elementos
// del cuerpo SIN namespace (el XSD no declara elementFormDefault).
// scripts/sunat-check.mjs valida cada sobre contra ese XSD con xmllint.
//
// Autenticación [MAN §2.2]: WS-Security UsernameToken con RUC + usuario SOL
// (secundario, perfil de envío) y su clave. En beta, [RUC]MODDATOS/MODDATOS.
//
// Tres desenlaces que NO se confunden, porque de eso depende si una factura
// puede quedar registrada sin que Cord lo sepa:
//   - SunatFaultError: soap:Fault con código. Una excepción [MAN §4.1]: el
//     documento "se considera como no informado". Aun así el llamador
//     CONSULTA antes de liberar el número (un código de duplicado significa
//     que el número ya existe en SUNAT).
//   - SunatTransporteError: red, timeout o algo que no es SOAP. Para sendBill
//     es INCIERTO: SUNAT pudo haberlo registrado.
//   - Respuesta: la CDR (aceptada, con observaciones o rechazada).
//
// Puro salvo `llamar` (fetch).

import { parseStringPromise, processors } from 'xml2js';
// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { NS_SERVICIO, NS_WSSE, SUNAT_ENDPOINTS } from './constantes.ts';
import { escTexto } from './ubl.ts';
import type { EntornoRail } from '../rieles.ts';

export type OperacionSunat = 'sendBill' | 'getStatus' | 'getStatusCdr' | 'getStatusAR';

export class SunatFaultError extends Error {
    readonly faultcode: string;
    readonly faultstring: string;
    /** Código numérico de SUNAT (0100–1999 son excepciones), si lo trae. */
    readonly codigo: number | null;
    constructor(faultcode: string, faultstring: string) {
        const codigo = codigoDeFault(faultcode, faultstring);
        super(`SUNAT respondió una excepción${codigo !== null ? ` (${codigo})` : ''}.`);
        this.name = 'SunatFaultError';
        this.faultcode = faultcode;
        this.faultstring = faultstring.slice(0, 2000);
        this.codigo = codigo;
    }
}

export class SunatTransporteError extends Error {
    readonly detalle: string;
    constructor(detalle: string) {
        super('No hubo una respuesta legible de SUNAT.');
        this.name = 'SunatTransporteError';
        this.detalle = detalle.slice(0, 500);
    }
}

/** "soap-env:Client.1033" → 1033; si el código va en el texto ("0109 …" o "… 2335"), de ahí. */
export function codigoDeFault(faultcode: string, faultstring: string): number | null {
    const enCodigo = /(?:^|[.:])(\d{3,4})$/.exec(String(faultcode).trim());
    if (enCodigo) return Number(enCodigo[1]);
    const enTexto = /^\s*(\d{3,4})\b/.exec(String(faultstring)) ?? /\b(\d{4})\s*$/.exec(String(faultstring));
    return enTexto ? Number(enTexto[1]) : null;
}

export interface CredencialSol {
    /** RUC + usuario SOL, concatenados [MAN §2.2]. */
    usuario: string;
    clave: string;
}

function sobre(operacion: OperacionSunat, sol: CredencialSol, cuerpo: string): string {
    return '<?xml version="1.0" encoding="UTF-8"?>'
        + `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="${NS_SERVICIO}" xmlns:wsse="${NS_WSSE}">`
        + '<soapenv:Header><wsse:Security><wsse:UsernameToken>'
        + `<wsse:Username>${escTexto(sol.usuario)}</wsse:Username><wsse:Password>${escTexto(sol.clave)}</wsse:Password>`
        + '</wsse:UsernameToken></wsse:Security></soapenv:Header>'
        + `<soapenv:Body><ser:${operacion}>${cuerpo}</ser:${operacion}></soapenv:Body>`
        + '</soapenv:Envelope>';
}

/** sendBill: nombre del ZIP y su contenido en base64 [WSDL billService, xsd sendBill]. */
export function sobreSendBill(sol: CredencialSol, archivoZip: string, zipBase64: string): string {
    return sobre('sendBill', sol, `<fileName>${escTexto(archivoZip)}</fileName><contentFile>${zipBase64}</contentFile>`);
}

export interface ClaveComprobante {
    ruc: string;
    tipo: string;
    serie: string;
    numero: number;
}

/**
 * Consulta por comprobante: getStatus y getStatusCdr de billConsultService
 * (producción) y getStatusAR de billService (beta) reciben lo mismo [WSDL].
 */
export function sobreConsulta(operacion: 'getStatus' | 'getStatusCdr' | 'getStatusAR', sol: CredencialSol, c: ClaveComprobante): string {
    return sobre(operacion, sol, `<rucComprobante>${escTexto(c.ruc)}</rucComprobante>`
        + `<tipoComprobante>${escTexto(c.tipo)}</tipoComprobante>`
        + `<serieComprobante>${escTexto(c.serie)}</serieComprobante>`
        + `<numeroComprobante>${c.numero}</numeroComprobante>`);
}

export interface OpcionesLlamada {
    timeoutMs?: number;
    /** Solo pruebas: sustituye el endpoint de SUNAT. */
    url?: string;
}

/** URL del servicio de cada operación en el entorno. */
export function urlDe(entorno: EntornoRail, operacion: OperacionSunat): string {
    const e = SUNAT_ENDPOINTS[entorno];
    if (operacion === 'sendBill' || operacion === 'getStatusAR') return e.bill;
    if (!e.consulta) throw new SunatTransporteError(`${operacion}: no existe en ${entorno}`);
    return e.consulta;
}

/**
 * POST al servicio. Devuelve el cuerpo si es un mensaje SOAP (también los
 * HTTP 500 con soap:Fault); cualquier otra cosa es SunatTransporteError.
 */
export async function llamar(entorno: EntornoRail, operacion: OperacionSunat, envelope: string, opts: OpcionesLlamada = {}): Promise<string> {
    let status = 0;
    let body = '';
    try {
        const response = await fetch(opts.url ?? urlDe(entorno, operacion), {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"urn:${operacion}"` },
            body: envelope,
            signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
            redirect: 'error',
        });
        status = response.status;
        body = await response.text();
    } catch (error) {
        throw new SunatTransporteError(`${operacion}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!/<([\w-]+:)?Envelope[\s>]/.test(body)) throw new SunatTransporteError(`${operacion}: HTTP ${status} sin mensaje SOAP`);
    return body;
}

// ── Lectura de respuestas ───────────────────────────────────────────────────

type Nodo = Record<string, unknown>;

async function leer(xml: string): Promise<Nodo> {
    try {
        return await parseStringPromise(xml, { explicitArray: false, ignoreAttrs: true, tagNameProcessors: [processors.stripPrefix] }) as Nodo;
    } catch {
        throw new SunatTransporteError('La respuesta de SUNAT no es un XML legible.');
    }
}

const hijo = (n: unknown, k: string): unknown => (n && typeof n === 'object' ? (n as Nodo)[k] : undefined);
const txt = (n: unknown): string => (typeof n === 'string' ? n.trim() : n && typeof n === 'object' && typeof (n as Nodo)._ === 'string' ? String((n as Nodo)._).trim() : '');

/** El cuerpo del sobre; lanza SunatFaultError si es un soap:Fault. */
async function cuerpo(xml: string): Promise<Nodo> {
    const doc = await leer(xml);
    const body = hijo(hijo(doc, 'Envelope'), 'Body') as Nodo | undefined;
    if (!body) throw new SunatTransporteError('La respuesta de SUNAT no trae un cuerpo SOAP.');
    const fault = hijo(body, 'Fault');
    if (fault) throw new SunatFaultError(txt(hijo(fault, 'faultcode')), txt(hijo(fault, 'faultstring')) || txt(hijo(hijo(fault, 'detail'), 'message')));
    return body;
}

/** sendBill → la CDR (ZIP) en base64. */
export async function parsearSendBill(xml: string): Promise<Uint8Array> {
    const body = await cuerpo(xml);
    const b64 = txt(hijo(hijo(body, 'sendBillResponse'), 'applicationResponse'));
    if (!b64) throw new SunatTransporteError('sendBill: la respuesta no trae la constancia de recepción.');
    return new Uint8Array(Buffer.from(b64, 'base64'));
}

export interface RespuestaConsulta {
    /** statusCode de SUNAT ("0001", "0011"…). */
    codigo: string;
    mensaje: string;
    /** CDR (ZIP), si la respuesta la trae. */
    cdr: Uint8Array | null;
}

/** getStatus / getStatusCdr / getStatusAR → código, mensaje y CDR si viene. */
export async function parsearConsulta(xml: string, operacion: 'getStatus' | 'getStatusCdr' | 'getStatusAR'): Promise<RespuestaConsulta> {
    const body = await cuerpo(xml);
    const resp = hijo(body, operacion === 'getStatusAR' ? 'getStatusResponseAR' : `${operacion}Response`)
        ?? hijo(body, `${operacion}Response`);
    const status = hijo(resp, operacion === 'getStatusCdr' ? 'statusCdr' : 'status') ?? hijo(resp, 'status') ?? hijo(resp, 'statusCdr');
    if (!status) throw new SunatTransporteError(`${operacion}: la respuesta no trae un estado.`);
    const content = txt(hijo(status, 'content'));
    return {
        codigo: txt(hijo(status, 'statusCode')),
        mensaje: txt(hijo(status, 'statusMessage')).slice(0, 500),
        cdr: content ? new Uint8Array(Buffer.from(content, 'base64')) : null,
    };
}
