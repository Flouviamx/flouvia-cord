// Cliente del web service de validación previa de la DIAN
// (WcfDianCustomerServices, SOAP 1.2).
//
// El contrato sale del WSDL REAL descargado de la DIAN (scripts/fixtures/dian/
// wsdl/{habilitacion,produccion}/, idénticos salvo el host) y de su WS-Policy
// (wsdl0.wsdl, WSHttpBinding_IWcfDianCustomerServices_policy):
//
//   - TransportBinding sobre HTTPS con `RequireClientCertificate="false"`: no
//     hay TLS mutuo; la identidad viaja en la cabecera WS-Security;
//   - AlgorithmSuite Basic256Sha256Rsa15: RSA-SHA256, resúmenes SHA-256 y
//     canonicalización exclusiva;
//   - IncludeTimestamp + Layout Strict: wsu:Timestamp primero en la cabecera;
//   - EndorsingSupportingTokens con un X509 incluido siempre
//     (BinarySecurityToken) cuya firma cubre el encabezado wsa:To
//     (SignedParts) y, como toda firma de respaldo en un TransportBinding, el
//     Timestamp;
//   - UsingAddressing: wsa:Action y wsa:To en la cabecera.
//
// Es la misma configuración que la DIAN describe para SoapUI en su guía de
// consumo de los servicios web, y la que verifica scripts/dian-check.mjs con
// el validador XMLDSig del JDK sobre un sobre armado aquí.
//
// Respuestas (xml2js sin prefijos). Tres desenlaces que no se confunden:
//   - DianFaultError: soap:Fault. Si es del remitente y de seguridad, el
//     servicio no procesó nada (definitivo para ese pedido); si no, el
//     resultado del envío se CONSULTA.
//   - DianTransporteError: red, timeout o algo que no es SOAP. Para un envío
//     es INCIERTO: la DIAN pudo haberlo validado.
//   - DianResponse: el resultado de la validación (IsValid, StatusCode, las
//     reglas incumplidas y el ApplicationResponse).
//
// Puro salvo `llamarDian` (fetch).

import { createHash, createSign, randomUUID } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import forge from 'node-forge';
import { parseStringPromise, processors } from 'xml2js';
// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { ALG, DIAN_ENDPOINTS, NS_WCF, SOAP_ACTION_BASE, type OperacionDian } from './constantes.ts';
import { E, serializar, type Nodo } from './xml.ts';
import type { EntornoRail } from '../rieles.ts';

export const NS_SOAP12 = 'http://www.w3.org/2003/05/soap-envelope';
export const NS_WSA = 'http://www.w3.org/2005/08/addressing';
export const NS_WSSE = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
export const NS_WSU = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
const NS_DS = 'http://www.w3.org/2000/09/xmldsig#';
const BST_ENCODING = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary';
const BST_X509 = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3';

/** Vigencia del Timestamp: la que muestra la DIAN en sus respuestas de ejemplo [AT 7.8.3]. */
export const VIGENCIA_TIMESTAMP_MS = 5 * 60_000;

export class DianFaultError extends Error {
    readonly codigo: string;
    readonly subcodigo: string;
    readonly razon: string;
    constructor(codigo: string, subcodigo: string, razon: string) {
        super(`La DIAN rechazó el mensaje completo (${subcodigo || codigo}).`);
        this.name = 'DianFaultError';
        this.codigo = codigo;
        this.subcodigo = subcodigo;
        this.razon = razon.slice(0, 2000);
    }

    /**
     * El servicio rechazó el mensaje antes de procesarlo: falla de seguridad
     * del remitente (WCF) o el `s:Client` sin motivo con que el ambiente de
     * habilitación responde a un certificado que no emitió una entidad
     * avalada (fixture respuesta-fault-certificado-no-confiable.xml,
     * capturado el 2026-10-09).
     */
    get noProcesado(): boolean {
        if (/Client$/i.test(this.codigo)) return true;
        return /Sender$/i.test(this.codigo) && /(InvalidSecurity|FailedAuthentication|MessageExpired|InvalidSecurityToken|SecurityTokenUnavailable|ActionNotSupported|DestinationUnreachable)/i.test(this.subcodigo);
    }
}

export class DianTransporteError extends Error {
    readonly detalle: string;
    constructor(detalle: string) {
        super('No hubo una respuesta legible de la DIAN.');
        this.name = 'DianTransporteError';
        this.detalle = detalle.slice(0, 500);
    }
}

// ── Cuerpos de cada operación [WSDL xsd0] ────────────────────────────────────

const wcf = (n: string, v: string) => E(`wcf:${n}`, null, v);

export const cuerpoSendBillSync = (fileName: string, zipB64: string) =>
    E('wcf:SendBillSync', null, wcf('fileName', fileName), wcf('contentFile', zipB64));
export const cuerpoSendTestSetAsync = (fileName: string, zipB64: string, testSetId: string) =>
    E('wcf:SendTestSetAsync', null, wcf('fileName', fileName), wcf('contentFile', zipB64), wcf('testSetId', testSetId));
export const cuerpoGetStatus = (trackId: string) => E('wcf:GetStatus', null, wcf('trackId', trackId));
export const cuerpoGetStatusZip = (trackId: string) => E('wcf:GetStatusZip', null, wcf('trackId', trackId));
/** accountCode: NIT del facturador; accountCodeT: NIT de quien consulta (el mismo, con software propio). */
export const cuerpoGetNumberingRange = (nit: string, nitConsulta: string, softwareId: string) =>
    E('wcf:GetNumberingRange', null, wcf('accountCode', nit), wcf('accountCodeT', nitConsulta), wcf('softwareCode', softwareId));

/** Un zip con un solo XML [AT 6.5.8: "si se transmitirá … sincrónico, la cantidad de documentos será igual a uno"]. */
export function zipDocumento(nombreXml: string, xml: string, fecha = new Date()): Uint8Array {
    return zipSync({ [nombreXml]: [strToU8(xml), { mtime: fecha }] }, { level: 6 });
}

// ── Sobre con WS-Security ────────────────────────────────────────────────────

export interface FirmanteSoap {
    /** Certificado del titular (PEM). */
    certPem: string;
    llavePem: string;
}

const sha256b64 = (s: string) => createHash('sha256').update(s, 'utf8').digest('base64');
const iso = (d: Date) => d.toISOString();

/**
 * Sobre SOAP 1.2 firmado. El orden de la cabecera wsse:Security es el que
 * exige Layout Strict: Timestamp, el token y la firma que lo usa. Las partes
 * firmadas se canonicalizan con C14N exclusiva, cuya forma es la
 * serialización del subárbol con SOLO los namespaces que usa visiblemente
 * (wsu:Timestamp → wsu; wsa:To → wsa y wsu; ds:SignedInfo → ds).
 */
export function sobreDian(entorno: EntornoRail, operacion: OperacionDian, cuerpo: Nodo, firmante: FirmanteSoap,
    opts: { ahora?: Date; url?: string } = {}): string {
    const ahora = opts.ahora ?? new Date();
    const id = randomUUID().replace(/-/g, '').toUpperCase();
    const ids = { ts: `TS-${id}`, bst: `X509-${id}`, to: `ID-${id}`, sig: `SIG-${id}`, ki: `KI-${id}`, str: `STR-${id}` };
    const der = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(forge.pki.certificateFromPem(firmante.certPem))).getBytes(), 'binary');

    const timestamp = E('wsu:Timestamp', { 'wsu:Id': ids.ts },
        E('wsu:Created', null, iso(ahora)),
        E('wsu:Expires', null, iso(new Date(ahora.getTime() + VIGENCIA_TIMESTAMP_MS))));
    const to = E('wsa:To', { 'xmlns:wsu': NS_WSU, 'wsu:Id': ids.to }, opts.url ?? DIAN_ENDPOINTS[entorno]);

    const resumenTs = sha256b64(serializar({ ...timestamp, a: { 'xmlns:wsu': NS_WSU, ...timestamp.a } }));
    const resumenTo = sha256b64(serializar({ ...to, a: { 'xmlns:wsa': NS_WSA, ...to.a } }));
    const referencia = (uri: string, resumen: string) => E('ds:Reference', { URI: uri },
        E('ds:Transforms', null, E('ds:Transform', { Algorithm: ALG.excC14n })),
        E('ds:DigestMethod', { Algorithm: ALG.sha256 }),
        E('ds:DigestValue', null, resumen));
    const signedInfo = E('ds:SignedInfo', null,
        E('ds:CanonicalizationMethod', { Algorithm: ALG.excC14n }),
        E('ds:SignatureMethod', { Algorithm: ALG.rsaSha256 }),
        referencia(`#${ids.ts}`, resumenTs),
        referencia(`#${ids.to}`, resumenTo));
    const valor = createSign('RSA-SHA256').update(serializar({ ...signedInfo, a: { 'xmlns:ds': NS_DS } }), 'utf8').sign(firmante.llavePem, 'base64');

    const sobre = E('soap:Envelope', { 'xmlns:soap': NS_SOAP12, 'xmlns:wcf': NS_WCF },
        E('soap:Header', { 'xmlns:wsa': NS_WSA },
            E('wsse:Security', { 'xmlns:wsse': NS_WSSE, 'xmlns:wsu': NS_WSU, 'soap:mustUnderstand': 'true' },
                timestamp,
                E('wsse:BinarySecurityToken', { EncodingType: BST_ENCODING, ValueType: BST_X509, 'wsu:Id': ids.bst }, der.toString('base64')),
                E('ds:Signature', { 'xmlns:ds': NS_DS, Id: ids.sig },
                    signedInfo,
                    E('ds:SignatureValue', null, valor),
                    E('ds:KeyInfo', { Id: ids.ki },
                        E('wsse:SecurityTokenReference', { 'wsu:Id': ids.str },
                            E('wsse:Reference', { URI: `#${ids.bst}`, ValueType: BST_X509 }))))),
            E('wsa:Action', null, `${SOAP_ACTION_BASE}${operacion}`),
            to),
        E('soap:Body', null, cuerpo));
    return `<?xml version="1.0" encoding="UTF-8"?>${serializar(sobre)}`;
}

// ── Transporte ───────────────────────────────────────────────────────────────

export interface OpcionesLlamada {
    timeoutMs?: number;
    /** Solo pruebas: sustituye el endpoint de la DIAN. */
    url?: string;
}

/**
 * POST al servicio. Devuelve el cuerpo si es un mensaje SOAP (también un
 * HTTP 500 con soap:Fault); cualquier otra cosa es DianTransporteError.
 */
export async function llamarDian(entorno: EntornoRail, operacion: OperacionDian, envelope: string, opts: OpcionesLlamada = {}): Promise<string> {
    let status = 0;
    let body = '';
    try {
        const response = await fetch(opts.url ?? DIAN_ENDPOINTS[entorno], {
            method: 'POST',
            headers: { 'Content-Type': `application/soap+xml;charset=UTF-8;action="${SOAP_ACTION_BASE}${operacion}"` },
            body: envelope,
            signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
            redirect: 'error',
        });
        status = response.status;
        body = await response.text();
    } catch (error) {
        throw new DianTransporteError(`${operacion}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!/<(\w+:)?Envelope[\s>]/.test(body)) throw new DianTransporteError(`${operacion}: HTTP ${status} sin mensaje SOAP`);
    return body;
}

// ── Lectura de respuestas ────────────────────────────────────────────────────

type N = Record<string, unknown>;

async function leer(xml: string): Promise<N> {
    try {
        return await parseStringPromise(xml, { explicitArray: false, ignoreAttrs: true, tagNameProcessors: [processors.stripPrefix] }) as N;
    } catch {
        throw new DianTransporteError('La respuesta de la DIAN no es un XML legible.');
    }
}

const hijo = (n: unknown, k: string): unknown => (n && typeof n === 'object' ? (n as N)[k] : undefined);
const txt = (n: unknown): string => (typeof n === 'string' ? n.trim() : typeof n === 'number' || typeof n === 'boolean' ? String(n) : '');
const lista = <T>(n: unknown): T[] => (n === undefined || n === null || n === '' ? [] : Array.isArray(n) ? n as T[] : [n as T]);

/** Cuerpo del sobre; lanza DianFaultError si es un soap:Fault (SOAP 1.2). */
async function cuerpoDe(xml: string): Promise<N> {
    const raiz = await leer(xml);
    const body = hijo(hijo(raiz, 'Envelope'), 'Body') as N | undefined;
    if (!body) throw new DianTransporteError('La respuesta de la DIAN no trae el cuerpo del mensaje.');
    const fault = hijo(body, 'Fault');
    if (fault) {
        const code = hijo(fault, 'Code');
        const reason = hijo(hijo(fault, 'Reason'), 'Text');
        throw new DianFaultError(txt(hijo(code, 'Value')), txt(hijo(hijo(code, 'Subcode'), 'Value')), txt(Array.isArray(reason) ? reason[0] : reason));
    }
    return body;
}

export interface RespuestaDian {
    isValid: boolean;
    statusCode: string;
    statusDescription: string;
    statusMessage: string;
    /** Reglas incumplidas y notificaciones, tal como las redacta la DIAN. */
    mensajes: string[];
    /** ApplicationResponse (XML) con el resultado de la validación, si vino. */
    applicationResponse: string | null;
    documentKey: string;
    fileName: string;
}

function dianResponse(n: unknown): RespuestaDian {
    const b64 = txt(hijo(n, 'XmlBase64Bytes'));
    let applicationResponse: string | null = null;
    if (b64) {
        const xml = Buffer.from(b64, 'base64').toString('utf8');
        if (/ApplicationResponse/.test(xml)) applicationResponse = xml;
    }
    return {
        isValid: txt(hijo(n, 'IsValid')).toLowerCase() === 'true',
        statusCode: txt(hijo(n, 'StatusCode')),
        statusDescription: txt(hijo(n, 'StatusDescription')),
        statusMessage: txt(hijo(n, 'StatusMessage')),
        mensajes: lista<unknown>(hijo(hijo(n, 'ErrorMessage'), 'string')).map(txt).filter(Boolean),
        applicationResponse,
        documentKey: txt(hijo(n, 'XmlDocumentKey')),
        fileName: txt(hijo(n, 'XmlFileName')),
    };
}

export async function parsearSendBillSync(xml: string): Promise<RespuestaDian> {
    return dianResponse(hijo(hijo(await cuerpoDe(xml), 'SendBillSyncResponse'), 'SendBillSyncResult'));
}

export async function parsearGetStatus(xml: string): Promise<RespuestaDian> {
    return dianResponse(hijo(hijo(await cuerpoDe(xml), 'GetStatusResponse'), 'GetStatusResult'));
}

export async function parsearGetStatusZip(xml: string): Promise<RespuestaDian[]> {
    const r = hijo(hijo(await cuerpoDe(xml), 'GetStatusZipResponse'), 'GetStatusZipResult');
    return lista<unknown>(hijo(r, 'DianResponse')).map(dianResponse);
}

export interface RespuestaSetPruebas {
    zipKey: string;
    errores: { archivo: string; mensaje: string; exito: boolean }[];
}

export async function parsearSendTestSetAsync(xml: string): Promise<RespuestaSetPruebas> {
    const r = hijo(hijo(await cuerpoDe(xml), 'SendTestSetAsyncResponse'), 'SendTestSetAsyncResult');
    return {
        zipKey: txt(hijo(r, 'ZipKey')),
        errores: lista<unknown>(hijo(hijo(r, 'ErrorMessageList'), 'XmlParamsResponseTrackId')).map((e) => ({
            archivo: txt(hijo(e, 'XmlFileName')),
            mensaje: txt(hijo(e, 'ProcessedMessage')),
            exito: txt(hijo(e, 'Success')).toLowerCase() === 'true',
        })),
    };
}

export interface RangoNumeracion {
    resolucion: string;
    fechaResolucion: string;
    prefijo: string;
    desde: number;
    hasta: number;
    vigenteDesde: string;
    vigenteHasta: string;
    claveTecnica: string;
}

export async function parsearGetNumberingRange(xml: string): Promise<{ codigo: string; descripcion: string; rangos: RangoNumeracion[] }> {
    const r = hijo(hijo(await cuerpoDe(xml), 'GetNumberingRangeResponse'), 'GetNumberingRangeResult');
    return {
        codigo: txt(hijo(r, 'OperationCode')),
        descripcion: txt(hijo(r, 'OperationDescription')),
        rangos: lista<unknown>(hijo(hijo(r, 'ResponseList'), 'NumberRangeResponse')).map((x) => ({
            resolucion: txt(hijo(x, 'ResolutionNumber')),
            fechaResolucion: txt(hijo(x, 'ResolutionDate')).slice(0, 10),
            prefijo: txt(hijo(x, 'Prefix')),
            desde: Number(txt(hijo(x, 'FromNumber'))),
            hasta: Number(txt(hijo(x, 'ToNumber'))),
            vigenteDesde: txt(hijo(x, 'ValidDateFrom')).slice(0, 10),
            vigenteHasta: txt(hijo(x, 'ValidDateTo')).slice(0, 10),
            claveTecnica: txt(hijo(x, 'TechnicalKey')),
        })),
    };
}

/** Fecha y hora del ApplicationResponse (las del contenedor, ResultOfVerification). */
export function momentoRespuesta(applicationResponse: string): { fecha: string; hora: string } | null {
    const fecha = /<cbc:IssueDate>(\d{4}-\d{2}-\d{2})<\/cbc:IssueDate>/.exec(applicationResponse)?.[1];
    const hora = /<cbc:IssueTime>([0-9:.+-]+)<\/cbc:IssueTime>/.exec(applicationResponse)?.[1];
    return fecha && hora ? { fecha, hora } : null;
}
