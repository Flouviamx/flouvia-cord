// Clientes de los servicios del SII:
//
//   - CrSeed.getSeed / GetTokenFromSeed.getToken (manual "Autenticación
//     automática", OI2007_AUTAUTOM_MDE 1.9): semilla → semilla firmada → token;
//   - DTEUpload (manual "Envío automático de DTE", OI2003_UPDTE_MDE 1.5):
//     multipart con rutSender/dvSender/rutCompany/dvCompany/archivo y la cookie
//     TOKEN; responde <RECEPCIONDTE> con STATUS y TRACKID;
//   - QueryEstUp.getEstUp (OI2004_CEUPDTE_MDE 1.10): estado del envío por trackid;
//   - QueryEstDte.getEstDte (OI2004_CEDTE_MDE 1.10): estado de un DTE por sus datos.
//
// Los servicios son Apache Axis rpc/encoded: el cuerpo lleva la operación en
// el espacio de nombres del WSDL vigente y los parámetros con xsi:type, en el
// orden de parameterOrder. La respuesta es un string con un XML <SII:RESPUESTA>
// escapado dentro (los fixtures en scripts/fixtures/sii/ son respuestas reales
// de maullin).
//
// Tres desenlaces que no se confunden:
//   - SiiTransporteError: red, timeout o algo que no es la respuesta del
//     servicio. En el upload, INCIERTO: el SII pudo haber recibido el envío.
//   - una respuesta legible con un estado de error: la interpreta el llamador;
//   - SiiFaultError: soap:Fault (el servicio no entendió el pedido).
//
// Puro salvo las funciones que llaman a fetch. scripts/sii-check.mjs prueba los
// sobres contra los WSDL y los parsers contra las respuestas reales.

import { parseStringPromise, processors } from 'xml2js';
// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { NS_WS_SII, siiEndpoints } from './constantes.ts';
import { partesRut } from './texto.ts';
import type { EntornoRail } from '../rieles.ts';

export class SiiTransporteError extends Error {
    readonly detalle: string;
    constructor(detalle: string) {
        super('No hubo una respuesta legible del SII.');
        this.name = 'SiiTransporteError';
        this.detalle = detalle.slice(0, 500);
    }
}

export class SiiFaultError extends Error {
    readonly faultcode: string;
    readonly faultstring: string;
    constructor(faultcode: string, faultstring: string) {
        super(`El SII rechazó el mensaje completo (${faultcode}).`);
        this.name = 'SiiFaultError';
        this.faultcode = faultcode;
        this.faultstring = faultstring.slice(0, 1000);
    }
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type OperacionSii = 'getSeed' | 'getToken' | 'getEstUp' | 'getEstDte';

/** Sobre SOAP 1.1 rpc/encoded con los parámetros en orden. */
export function sobre(operacion: OperacionSii, parametros: [string, string][] = []): string {
    const params = parametros.map(([k, v]) => `<${k} xsi:type="xsd:string">${esc(v)}</${k}>`).join('');
    return '<?xml version="1.0" encoding="UTF-8"?>'
        + '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        + '<soapenv:Body>'
        + `<ns1:${operacion} soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:ns1="${NS_WS_SII}">${params}</ns1:${operacion}>`
        + '</soapenv:Body></soapenv:Envelope>';
}

export const sobreSemilla = () => sobre('getSeed');
export const sobreToken = (semillaFirmada: string) => sobre('getToken', [['pszXml', semillaFirmada]]);

export function sobreEstadoEnvio(rutEmisor: string, trackId: string, token: string): string {
    const { cuerpo, dv } = partesRut(rutEmisor);
    return sobre('getEstUp', [['RutCompania', cuerpo], ['DvCompania', dv], ['TrackId', trackId], ['Token', token]]);
}

export interface ConsultaDte {
    rutConsultante: string;
    rutEmisor: string;
    rutReceptor: string;
    tipo: number;
    folio: number;
    /** aaaa-mm-dd: viaja como DDMMAAAA (manual OI2004_CEDTE, tabla 3-2). */
    fechaEmision: string;
    monto: number;
}

export function sobreEstadoDte(c: ConsultaDte, token: string): string {
    const con = partesRut(c.rutConsultante);
    const emi = partesRut(c.rutEmisor);
    const rec = partesRut(c.rutReceptor);
    const [y, m, d] = c.fechaEmision.split('-');
    return sobre('getEstDte', [
        ['RutConsultante', con.cuerpo], ['DvConsultante', con.dv],
        ['RutCompania', emi.cuerpo], ['DvCompania', emi.dv],
        ['RutReceptor', rec.cuerpo], ['DvReceptor', rec.dv],
        ['TipoDte', String(c.tipo)], ['FolioDte', String(c.folio)],
        ['FechaEmisionDte', `${d}${m}${y}`], ['MontoDte', String(Math.round(c.monto))],
        ['Token', token],
    ]);
}

// ── Transporte ───────────────────────────────────────────────────────────────

export interface OpcionesLlamada {
    timeoutMs?: number;
    /** Solo pruebas: sustituye el endpoint. */
    url?: string;
}

async function post(url: string, body: string | Uint8Array, headers: Record<string, string>, opts: OpcionesLlamada, etiqueta: string): Promise<string> {
    let status = 0;
    let texto = '';
    try {
        const response = await fetch(opts.url ?? url, {
            method: 'POST',
            headers,
            body: body as BodyInit,
            signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
            redirect: 'error',
        });
        status = response.status;
        texto = await response.text();
    } catch (error) {
        throw new SiiTransporteError(`${etiqueta}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!texto) throw new SiiTransporteError(`${etiqueta}: HTTP ${status} sin cuerpo`);
    return texto;
}

const URL_DE: Record<OperacionSii, keyof ReturnType<typeof siiEndpoints>> = {
    getSeed: 'semilla', getToken: 'token', getEstUp: 'estadoEnvio', getEstDte: 'estadoDte',
};

/** POST a un servicio SOAP del SII. SOAPAction vacío, como declaran los WSDL. */
export async function llamarSii(entorno: EntornoRail, operacion: OperacionSii, envelope: string, opts: OpcionesLlamada = {}): Promise<string> {
    const body = await post(siiEndpoints(entorno)[URL_DE[operacion]], envelope,
        { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' }, opts, operacion);
    if (!/<(\w+:)?Envelope[\s>]/.test(body)) throw new SiiTransporteError(`${operacion}: respuesta sin mensaje SOAP`);
    return body;
}

// ── Lectura de respuestas ────────────────────────────────────────────────────

type Nodo = Record<string, unknown>;

async function leer(xml: string): Promise<Nodo> {
    try {
        return await parseStringPromise(xml, { explicitArray: false, ignoreAttrs: true, tagNameProcessors: [processors.stripPrefix] }) as Nodo;
    } catch {
        throw new SiiTransporteError('La respuesta del SII no es un XML legible.');
    }
}

const hijo = (n: unknown, k: string): unknown => (n && typeof n === 'object' ? (n as Nodo)[k] : undefined);
const texto = (n: unknown): string => {
    if (n === undefined || n === null) return '';
    if (typeof n === 'string' || typeof n === 'number') return String(n).trim();
    const inner = (n as Nodo)._;
    return inner !== undefined ? String(inner).trim() : '';
};

export interface RespuestaSii {
    estado: string;
    glosa: string;
    /** Cuerpo y cabecera planos (TRACKID, SEMILLA, TOKEN, ACEPTADOS…), por nombre de etiqueta. */
    campos: Record<string, string>;
}

/** Saca el XML <SII:RESPUESTA> del sobre SOAP y lo lee. */
export async function parsearRespuesta(xml: string, operacion: OperacionSii): Promise<RespuestaSii> {
    const body = hijo(hijo(await leer(xml), 'Envelope'), 'Body');
    const fault = hijo(body, 'Fault');
    if (fault) throw new SiiFaultError(texto(hijo(fault, 'faultcode')).replace(/^.*:/, '') || 'desconocido', texto(hijo(fault, 'faultstring')));
    const interno = texto(hijo(hijo(body, `${operacion}Response`), `${operacion}Return`));
    if (!interno) throw new SiiTransporteError(`Respuesta del SII sin ${operacion}Return.`);
    const resp = hijo(await leer(interno), 'RESPUESTA');
    if (!resp || typeof resp !== 'object') throw new SiiTransporteError('Respuesta del SII sin RESPUESTA.');
    const campos: Record<string, string> = {};
    for (const parte of ['RESP_HDR', 'RESP_BODY']) {
        const n = hijo(resp, parte);
        if (n && typeof n === 'object') for (const [k, v] of Object.entries(n as Nodo)) campos[k] = texto(Array.isArray(v) ? v[0] : v);
    }
    // NUM_ATENCION puede venir fuera de RESP_HDR (manual OI2004_CEUPDTE, 3.5.1.1).
    if (!campos.NUM_ATENCION && hijo(resp, 'NUM_ATENCION') !== undefined) campos.NUM_ATENCION = texto(hijo(resp, 'NUM_ATENCION'));
    return { estado: campos.ESTADO ?? '', glosa: campos.GLOSA ?? campos.GLOSA_ESTADO ?? '', campos };
}

/** Estados de las consultas que dicen que el token no sirve (tablas 3.5.2 de ambos manuales). */
export const ESTADOS_TOKEN = new Set(['001', '002', '003']);

// ── Upload ───────────────────────────────────────────────────────────────────

export interface RecepcionEnvio {
    status: number;
    trackId: string | null;
    detalle: string[];
    timestamp: string;
}

/** <RECEPCIONDTE> de DTEUpload (manual de envío, 2.1 y 2.2). */
export async function parsearRecepcion(xml: string): Promise<RecepcionEnvio> {
    const r = hijo(await leer(xml.replace(/<\s+/g, '<').replace(/<\/\s+/g, '</')), 'RECEPCIONDTE');
    const status = texto(hijo(r, 'STATUS'));
    if (!r || !/^\d+$/.test(status)) throw new SiiTransporteError('La respuesta del upload no trae STATUS.');
    const detalle = hijo(r, 'DETAIL');
    const errores = hijo(detalle, 'ERROR');
    const lista = Array.isArray(errores) ? errores : errores === undefined ? [] : [errores];
    const track = texto(hijo(r, 'TRACKID'));
    return {
        status: Number(status),
        trackId: /^\d+$/.test(track) ? track : null,
        detalle: lista.map((e) => texto(e).slice(0, 300)),
        timestamp: texto(hijo(r, 'TIMESTAMP')),
    };
}

/** Cuerpo multipart/form-data del upload, en bytes (el archivo ya va en ISO-8859-1). */
export function cuerpoUpload(rutEnvia: string, rutEmisor: string, nombreArchivo: string, archivo: Uint8Array, boundary: string): Buffer {
    const env = partesRut(rutEnvia);
    const emi = partesRut(rutEmisor);
    const campo = (k: string, v: string) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
    const cabecera = campo('rutSender', env.cuerpo) + campo('dvSender', env.dv) + campo('rutCompany', emi.cuerpo) + campo('dvCompany', emi.dv)
        + `--${boundary}\r\nContent-Disposition: form-data; name="archivo"; filename="${nombreArchivo}"\r\nContent-Type: text/xml\r\n\r\n`;
    return Buffer.concat([Buffer.from(cabecera, 'latin1'), Buffer.from(archivo), Buffer.from(`\r\n--${boundary}--\r\n`, 'latin1')]);
}

export async function subirEnvio(entorno: EntornoRail, token: string, rutEnvia: string, rutEmisor: string, nombreArchivo: string, archivo: Uint8Array, opts: OpcionesLlamada = {}): Promise<RecepcionEnvio> {
    const boundary = `----CordSii${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
    const body = await post(siiEndpoints(entorno).upload, cuerpoUpload(rutEnvia, rutEmisor, nombreArchivo, archivo, boundary), {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        // "PROG 1.0" hace que la respuesta sea XML (manual de envío, 2, figura 2.3).
        'User-Agent': 'Mozilla/4.0 (compatible; PROG 1.0; Cord)',
        Cookie: `TOKEN=${token}`,
    }, { timeoutMs: 60_000, ...opts }, 'DTEUpload');
    if (!/<\s*RECEPCIONDTE/.test(body)) throw new SiiTransporteError('DTEUpload: la respuesta no es <RECEPCIONDTE>');
    return parsearRecepcion(body);
}
