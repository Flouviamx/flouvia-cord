// Cliente SOAP de WSFEv1 (factura electrónica de ARCA, RG 4291).
//
// El XML se arma a mano, como el envío de Verifactu (verifactu/aeat.ts), y
// sigue el WSDL REAL descargado de la autoridad (scripts/fixtures/arca/
// wsfev1-*.wsdl): namespace http://ar.gov.afip.dif.FEV1/, SOAP 1.1,
// soapAction = namespace + nombre de la operación, y los elementos en el orden
// de cada <s:sequence>. scripts/arca-check.mjs valida con xmllint cada sobre
// que este archivo sabe generar contra el esquema embebido en ese WSDL.
//
// Respuestas: xml2js sin prefijos. Tres desenlaces que NO se confunden, porque
// de eso depende si una factura puede quedar autorizada sin que Cord lo sepa:
//   - ArcaFaultError: soap:Fault. El servidor no pudo leer el pedido; no se
//     procesó nada (ver respuesta-fault-request-ilegible.xml, capturada del
//     ambiente de homologación). Definitivo para ese pedido.
//   - ArcaTransporteError: red, timeout o una respuesta que no es SOAP. Para
//     FECAESolicitar es INCIERTO: ARCA pudo haber autorizado.
//   - Errors / Observaciones dentro del resultado: datos que el llamador
//     interpreta (rechazo, token vencido, numeración).
//
// Puro salvo `llamarWsfe` (fetch). scripts/arca-check.mjs carga los
// constructores y los parsers con Node plano.

import { parseStringPromise, processors } from 'xml2js';
// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { ARCA_ENDPOINTS, NS_WSFE } from './constantes.ts';
import type { DetalleArca } from './comprobante.ts';
import type { CodigoArca } from './errores.ts';
import type { EntornoRail } from '../rieles.ts';

export interface AuthArca {
    token: string;
    sign: string;
    cuit: string;
}

export type OperacionWsfe =
    | 'FECAESolicitar' | 'FECompUltimoAutorizado' | 'FECompConsultar' | 'FEParamGetPtosVenta'
    | 'FEParamGetCotizacion' | 'FEParamGetTiposMonedas' | 'FEParamGetTiposIva' | 'FEParamGetTiposCbte'
    | 'FEParamGetTiposDoc' | 'FEParamGetCondicionIvaReceptor' | 'FEDummy';

export class ArcaFaultError extends Error {
    readonly faultcode: string;
    readonly faultstring: string;
    constructor(faultcode: string, faultstring: string) {
        super(`ARCA rechazó el mensaje completo (${faultcode}).`);
        this.name = 'ArcaFaultError';
        this.faultcode = faultcode;
        this.faultstring = faultstring.slice(0, 2000);
    }
}

export class ArcaTransporteError extends Error {
    readonly detalle: string;
    constructor(detalle: string) {
        super('No hubo una respuesta legible de ARCA.');
        this.name = 'ArcaTransporteError';
        this.detalle = detalle.slice(0, 500);
    }
}

// ── XML ──────────────────────────────────────────────────────────────────────

// Caracteres inválidos en XML 1.0: rompen el mensaje entero.
const XML_INVALID = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu;

export function esc(value: unknown): string {
    return String(value ?? '')
        .replace(XML_INVALID, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** Elemento opcional: un valor vacío no se envía (minOccurs="0"), nunca como etiqueta vacía. */
function el(name: string, value: string | number | undefined | null): string {
    if (value === undefined || value === null || value === '') return '';
    return `<ar:${name}>${esc(value)}</ar:${name}>`;
}

function authXml(a: AuthArca): string {
    return `<ar:Auth>${el('Token', a.token)}${el('Sign', a.sign)}${el('Cuit', a.cuit)}</ar:Auth>`;
}

export function sobre(operacion: OperacionWsfe, inner: string): string {
    return '<?xml version="1.0" encoding="UTF-8"?>'
        + `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${NS_WSFE}">`
        + '<soapenv:Header/>'
        + `<soapenv:Body><ar:${operacion}>${inner}</ar:${operacion}></soapenv:Body>`
        + '</soapenv:Envelope>';
}

/** FECAEDetRequest en el orden de FEDetRequest del WSDL. */
export function detalleXml(d: DetalleArca): string {
    const asoc = d.CbtesAsoc?.length
        ? `<ar:CbtesAsoc>${d.CbtesAsoc.map((c) => `<ar:CbteAsoc>${el('Tipo', c.Tipo)}${el('PtoVta', c.PtoVta)}${el('Nro', c.Nro)}${el('Cuit', c.Cuit)}${el('CbteFch', c.CbteFch)}</ar:CbteAsoc>`).join('')}</ar:CbtesAsoc>`
        : '';
    const iva = d.Iva?.length
        ? `<ar:Iva>${d.Iva.map((a) => `<ar:AlicIva>${el('Id', a.Id)}${el('BaseImp', a.BaseImp)}${el('Importe', a.Importe)}</ar:AlicIva>`).join('')}</ar:Iva>`
        : '';
    return [
        '<ar:FECAEDetRequest>',
        el('Concepto', d.Concepto),
        el('DocTipo', d.DocTipo),
        el('DocNro', d.DocNro),
        el('CbteDesde', d.CbteDesde),
        el('CbteHasta', d.CbteHasta),
        el('CbteFch', d.CbteFch),
        el('ImpTotal', d.ImpTotal),
        el('ImpTotConc', d.ImpTotConc),
        el('ImpNeto', d.ImpNeto),
        el('ImpOpEx', d.ImpOpEx),
        el('ImpTrib', d.ImpTrib),
        el('ImpIVA', d.ImpIVA),
        el('FchServDesde', d.FchServDesde),
        el('FchServHasta', d.FchServHasta),
        el('FchVtoPago', d.FchVtoPago),
        el('MonId', d.MonId),
        el('MonCotiz', d.MonCotiz),
        el('CondicionIVAReceptorId', d.CondicionIVAReceptorId),
        asoc,
        iva,
        '</ar:FECAEDetRequest>',
    ].join('');
}

export function sobreCAESolicitar(auth: AuthArca, cab: { ptoVta: number; cbteTipo: number }, detalle: DetalleArca): string {
    return sobre('FECAESolicitar', authXml(auth)
        + `<ar:FeCAEReq><ar:FeCabReq>${el('CantReg', 1)}${el('PtoVta', cab.ptoVta)}${el('CbteTipo', cab.cbteTipo)}</ar:FeCabReq>`
        + `<ar:FeDetReq>${detalleXml(detalle)}</ar:FeDetReq></ar:FeCAEReq>`);
}

export function sobreUltimoAutorizado(auth: AuthArca, ptoVta: number, cbteTipo: number): string {
    return sobre('FECompUltimoAutorizado', authXml(auth) + el('PtoVta', ptoVta) + el('CbteTipo', cbteTipo));
}

export function sobreCompConsultar(auth: AuthArca, ptoVta: number, cbteTipo: number, numero: number): string {
    return sobre('FECompConsultar', authXml(auth)
        + `<ar:FeCompConsReq>${el('CbteTipo', cbteTipo)}${el('CbteNro', numero)}${el('PtoVta', ptoVta)}</ar:FeCompConsReq>`);
}

export function sobreCotizacion(auth: AuthArca, monId: string, fecha?: string): string {
    return sobre('FEParamGetCotizacion', authXml(auth) + el('MonId', monId) + el('FchCotiz', fecha));
}

export function sobreSoloAuth(operacion: OperacionWsfe, auth: AuthArca): string {
    return sobre(operacion, authXml(auth));
}

export function sobreDummy(): string {
    return sobre('FEDummy', '');
}

// ── Transporte ───────────────────────────────────────────────────────────────

export interface OpcionesLlamada {
    timeoutMs?: number;
    /** Solo pruebas: sustituye el endpoint de ARCA. */
    url?: string;
}

/**
 * POST al web service. Devuelve el cuerpo si es un mensaje SOAP (también los
 * HTTP 500 con soap:Fault, que es como ASMX responde un pedido ilegible);
 * cualquier otra cosa es ArcaTransporteError.
 */
export async function llamarWsfe(entorno: EntornoRail, operacion: OperacionWsfe, envelope: string, opts: OpcionesLlamada = {}): Promise<string> {
    let status = 0;
    let body = '';
    try {
        const response = await fetch(opts.url ?? ARCA_ENDPOINTS[entorno].wsfe, {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${NS_WSFE}${operacion}"` },
            body: envelope,
            signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
            redirect: 'error',
        });
        status = response.status;
        body = await response.text();
    } catch (error) {
        throw new ArcaTransporteError(`${operacion}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!/<(\w+:)?Envelope[\s>]/.test(body)) throw new ArcaTransporteError(`${operacion}: HTTP ${status} sin mensaje SOAP`);
    return body;
}

// ── Lectura de respuestas ────────────────────────────────────────────────────

type Nodo = Record<string, unknown>;

async function leer(xml: string): Promise<Nodo> {
    try {
        return await parseStringPromise(xml, { explicitArray: false, ignoreAttrs: true, tagNameProcessors: [processors.stripPrefix] }) as Nodo;
    } catch {
        throw new ArcaTransporteError('La respuesta de ARCA no es un XML legible.');
    }
}

const hijo = (n: unknown, k: string): unknown => (n && typeof n === 'object' ? (n as Nodo)[k] : undefined);
const lista = <T = Nodo>(n: unknown): T[] => (n === undefined || n === null || n === '' ? [] : Array.isArray(n) ? n as T[] : [n as T]);
const texto = (n: unknown): string => {
    if (n === undefined || n === null) return '';
    if (typeof n === 'string' || typeof n === 'number') return String(n).trim();
    const inner = (n as Nodo)._;
    return inner !== undefined ? String(inner).trim() : '';
};
const entero = (n: unknown): number => {
    const t = texto(n);
    return /^-?\d+$/.test(t) ? Number(t) : NaN;
};

function codigos(n: unknown, item: string): CodigoArca[] {
    return lista(hijo(n, item)).map((e) => ({ code: entero(hijo(e, 'Code')), msg: texto(hijo(e, 'Msg')).slice(0, 500) }))
        .filter((c) => Number.isFinite(c.code));
}

/** Cuerpo de la respuesta de `operacion` o el Fault. */
async function resultado(xml: string, operacion: OperacionWsfe): Promise<{ result: Nodo; ambiente: string }> {
    const doc = await leer(xml);
    const env = hijo(doc, 'Envelope');
    const body = hijo(env, 'Body');
    const fault = hijo(body, 'Fault');
    if (fault) {
        throw new ArcaFaultError(texto(hijo(fault, 'faultcode')).replace(/^.*:/, '') || 'desconocido', texto(hijo(fault, 'faultstring')));
    }
    const resp = hijo(body, `${operacion}Response`);
    const result = hijo(resp, `${operacion}Result`);
    if (!result || typeof result !== 'object') throw new ArcaTransporteError(`Respuesta de ARCA sin ${operacion}Result.`);
    const ambiente = texto(hijo(hijo(hijo(env, 'Header'), 'FEHeaderInfo'), 'ambiente'));
    return { result: result as Nodo, ambiente };
}

export interface RespuestaComun {
    errores: CodigoArca[];
    eventos: CodigoArca[];
    /** FEHeaderInfo/ambiente ("HomologacionExterno - srt", "Produccion - Pto"): de qué ambiente vino. */
    ambiente: string;
}

export interface UltimoAutorizado extends RespuestaComun {
    numero: number | null;
}

export async function parsearUltimoAutorizado(xml: string): Promise<UltimoAutorizado> {
    const { result, ambiente } = await resultado(xml, 'FECompUltimoAutorizado');
    const errores = codigos(hijo(result, 'Errors'), 'Err');
    const nro = entero(hijo(result, 'CbteNro'));
    return { numero: errores.length || !Number.isFinite(nro) ? null : nro, errores, eventos: codigos(hijo(result, 'Events'), 'Evt'), ambiente };
}

export interface RespuestaCAE extends RespuestaComun {
    /** Resultado de la cabecera: A aprobado, R rechazado, P parcial. */
    resultadoCabecera: string;
    /** Resultado del comprobante (FECAEDetResponse), si vino. */
    resultado: string;
    numero: number | null;
    cae: string;
    caeVence: string;
    cbteFch: string;
    observaciones: CodigoArca[];
}

export async function parsearCAESolicitar(xml: string): Promise<RespuestaCAE> {
    const { result, ambiente } = await resultado(xml, 'FECAESolicitar');
    const det = lista(hijo(hijo(result, 'FeDetResp'), 'FECAEDetResponse'))[0];
    const obsNodo = hijo(det, 'Observaciones');
    return {
        resultadoCabecera: texto(hijo(hijo(result, 'FeCabResp'), 'Resultado')).toUpperCase(),
        resultado: texto(hijo(det, 'Resultado')).toUpperCase(),
        numero: Number.isFinite(entero(hijo(det, 'CbteDesde'))) ? entero(hijo(det, 'CbteDesde')) : null,
        cae: texto(hijo(det, 'CAE')),
        caeVence: texto(hijo(det, 'CAEFchVto')),
        cbteFch: texto(hijo(det, 'CbteFch')),
        observaciones: codigos(obsNodo, 'Obs'),
        errores: codigos(hijo(result, 'Errors'), 'Err'),
        eventos: codigos(hijo(result, 'Events'), 'Evt'),
        ambiente,
    };
}

export interface ComprobanteConsultado extends RespuestaComun {
    /** null = ARCA no tiene ese comprobante (o respondió solo con errores). */
    comprobante: null | {
        resultado: string;
        codAutorizacion: string;
        emisionTipo: string;
        fchVto: string;
        cbteFch: string;
        docTipo: number;
        docNro: string;
        impTotal: number;
        monId: string;
        numero: number;
        ptoVta: number;
        cbteTipo: number;
        observaciones: CodigoArca[];
    };
}

export async function parsearCompConsultar(xml: string): Promise<ComprobanteConsultado> {
    const { result, ambiente } = await resultado(xml, 'FECompConsultar');
    const r = hijo(result, 'ResultGet');
    const errores = codigos(hijo(result, 'Errors'), 'Err');
    const cae = texto(hijo(r, 'CodAutorizacion'));
    return {
        comprobante: r && cae ? {
            resultado: texto(hijo(r, 'Resultado')).toUpperCase(),
            codAutorizacion: cae,
            emisionTipo: texto(hijo(r, 'EmisionTipo')),
            fchVto: texto(hijo(r, 'FchVto')),
            cbteFch: texto(hijo(r, 'CbteFch')),
            docTipo: entero(hijo(r, 'DocTipo')),
            docNro: texto(hijo(r, 'DocNro')),
            impTotal: Number(texto(hijo(r, 'ImpTotal'))),
            monId: texto(hijo(r, 'MonId')),
            numero: entero(hijo(r, 'CbteDesde')),
            ptoVta: entero(hijo(r, 'PtoVta')),
            cbteTipo: entero(hijo(r, 'CbteTipo')),
            observaciones: codigos(hijo(r, 'Observaciones'), 'Obs'),
        } : null,
        errores,
        eventos: codigos(hijo(result, 'Events'), 'Evt'),
        ambiente,
    };
}

export interface PuntoVenta {
    numero: number;
    emisionTipo: string;
    bloqueado: boolean;
    baja: string;
}

export async function parsearPtosVenta(xml: string): Promise<RespuestaComun & { puntos: PuntoVenta[] }> {
    const { result, ambiente } = await resultado(xml, 'FEParamGetPtosVenta');
    const puntos = lista(hijo(hijo(result, 'ResultGet'), 'PtoVenta')).map((p) => ({
        numero: entero(hijo(p, 'Nro')),
        emisionTipo: texto(hijo(p, 'EmisionTipo')),
        bloqueado: texto(hijo(p, 'Bloqueado')).toUpperCase() === 'S',
        baja: texto(hijo(p, 'FchBaja')),
    })).filter((p) => Number.isFinite(p.numero));
    return { puntos, errores: codigos(hijo(result, 'Errors'), 'Err'), eventos: codigos(hijo(result, 'Events'), 'Evt'), ambiente };
}

export async function parsearCotizacion(xml: string): Promise<RespuestaComun & { cotizacion: number | null; fecha: string }> {
    const { result, ambiente } = await resultado(xml, 'FEParamGetCotizacion');
    const r = hijo(result, 'ResultGet');
    const c = Number(texto(hijo(r, 'MonCotiz')));
    return {
        cotizacion: Number.isFinite(c) && c > 0 ? c : null,
        fecha: texto(hijo(r, 'FchCotiz')),
        errores: codigos(hijo(result, 'Errors'), 'Err'),
        eventos: codigos(hijo(result, 'Events'), 'Evt'),
        ambiente,
    };
}

/** Parámetros genéricos (FEParamGetTipos*) para el script de homologación: Id + Desc. */
export async function parsearParametros(xml: string, operacion: OperacionWsfe, item: string): Promise<RespuestaComun & { valores: { id: string; desc: string; clase?: string }[] }> {
    const { result, ambiente } = await resultado(xml, operacion);
    const valores = lista(hijo(hijo(result, 'ResultGet'), item)).map((v) => ({
        id: texto(hijo(v, 'Id')), desc: texto(hijo(v, 'Desc')), ...(texto(hijo(v, 'Cmp_Clase')) ? { clase: texto(hijo(v, 'Cmp_Clase')) } : {}),
    }));
    return { valores, errores: codigos(hijo(result, 'Errors'), 'Err'), eventos: codigos(hijo(result, 'Events'), 'Evt'), ambiente };
}

export async function parsearDummy(xml: string): Promise<{ app: string; db: string; auth: string; ambiente: string }> {
    const { result, ambiente } = await resultado(xml, 'FEDummy');
    return { app: texto(hijo(result, 'AppServer')), db: texto(hijo(result, 'DbServer')), auth: texto(hijo(result, 'AuthServer')), ambiente };
}

/**
 * ¿La respuesta vino del ambiente esperado? FEHeaderInfo/ambiente dice
 * "Homologacion…" o "Produccion…" [MAN "Estructura general del mensaje de
 * respuesta"]. Un comprobante de producción nunca se da por autorizado con una
 * respuesta de homologación (endpoint mal configurado, proxy, etc.).
 */
export function ambienteCoincide(ambiente: string, entorno: EntornoRail): boolean {
    if (!ambiente) return true; // el header es opcional: su ausencia no prueba nada
    const a = ambiente.toLowerCase();
    return entorno === 'produccion' ? a.startsWith('produccion') : a.startsWith('homologacion');
}
