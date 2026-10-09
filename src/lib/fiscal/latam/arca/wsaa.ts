// WSAA: autenticación ante ARCA con el certificado del contribuyente.
//
// Flujo de la "Especificación Técnica del WSAA" 1.2.2 y del "Manual del
// Desarrollador" (publicación 20.2.19):
//   1. TRA (LoginTicketRequest.xml): header { uniqueId, generationTime,
//      expirationTime } + service. Sin source/destination: el manual (FAQ
//      10.5) recomienda omitirlos para no depender de los DN.
//   2. CMS SignedData con el TRA ADJUNTO (no detached), la firma y el
//      certificado del firmante. El ejemplo oficial del manual (openssl cms
//      -sign … -nodetach) usa SHA-256 —su digestAlgorithm decodificado es
//      2.16.840.1.101.3.4.2.1—; la especificación 1.2.2 todavía nombra
//      SHA1+RSA. Se usa SHA-256, el del ejemplo oficial vigente.
//   3. loginCms(in0 = CMS en base64) → loginTicketResponse con token, sign y
//      expirationTime (12 horas).
//
// Errores: SoapFault con faultcode "ns1:<código>" (ver
// scripts/fixtures/arca/respuesta-wsaa-cms-bad.xml, capturada del WSAA de
// homologación). La especificación pide no pedir otro ticket mientras uno siga
// vigente (coe.alreadyAuthenticated) y esperar 60 s tras errores wsaa.*.
//
// Puro salvo `loginCms` (fetch). La firma usa node-forge, como el resto de la
// criptografía de certificados del repo (el runtime no garantiza openssl).

import forge from 'node-forge';
import { parseStringPromise, processors } from 'xml2js';
// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { ARCA_ENDPOINTS, NS_WSAA } from './constantes.ts';
import { esc } from './wsfe.ts';
import type { EntornoRail } from '../rieles.ts';

export interface TicketAcceso {
    token: string;
    sign: string;
    /** Instante en que vence el ticket (expirationTime del TA). */
    expira: Date;
    generado: Date;
}

export class ArcaWsaaError extends Error {
    /** Código sin el prefijo de namespace: 'cms.bad', 'coe.alreadyAuthenticated'… */
    readonly faultcode: string;
    readonly faultstring: string;
    constructor(faultcode: string, faultstring: string) {
        super(`El WSAA rechazó la solicitud de acceso (${faultcode}).`);
        this.name = 'ArcaWsaaError';
        this.faultcode = faultcode;
        this.faultstring = faultstring.slice(0, 1000);
    }
}

export class ArcaWsaaTransporteError extends Error {
    readonly detalle: string;
    constructor(detalle: string) {
        super('No hubo una respuesta legible del WSAA.');
        this.name = 'ArcaWsaaTransporteError';
        this.detalle = detalle.slice(0, 500);
    }
}

/**
 * Fecha-hora con el desplazamiento de Argentina ("2026-10-08T01:23:45-03:00"),
 * el formato de los ejemplos oficiales. El desplazamiento sale de la base de
 * zonas horarias, no de una constante: si el país volviera a tener horario de
 * verano, seguiría siendo correcto.
 */
export function fechaHoraArgentina(instante: Date): string {
    const partes = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Argentina/Buenos_Aires', hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZoneName: 'longOffset',
    }).formatToParts(instante);
    const v = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
    const off = v('timeZoneName').replace('GMT', '') || '+00:00';
    return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}:${v('second')}${off}`;
}

/**
 * TRA (LoginTicketRequest.xml). La generación se adelanta y el vencimiento se
 * atrasa unos minutos para tolerar relojes desincronizados (manual del WSAA,
 * FAQ 10.9); la especificación admite hasta 24 h en cada sentido.
 */
export function construirTRA(servicio: string, ahora = new Date(), uniqueId?: number): string {
    const id = uniqueId ?? (Math.floor(ahora.getTime() / 1000) >>> 0);
    const gen = new Date(ahora.getTime() - 10 * 60_000);
    const exp = new Date(ahora.getTime() + 10 * 60_000);
    return '<?xml version="1.0" encoding="UTF-8"?>'
        + '<loginTicketRequest version="1.0">'
        + `<header><uniqueId>${id >>> 0}</uniqueId><generationTime>${fechaHoraArgentina(gen)}</generationTime>`
        + `<expirationTime>${fechaHoraArgentina(exp)}</expirationTime></header>`
        + `<service>${esc(servicio)}</service>`
        + '</loginTicketRequest>';
}

/** CMS SignedData (PKCS#7) con el TRA adjunto, firmado con SHA-256. Devuelve el DER en base64. */
export function firmarTRA(tra: string, certPem: string, keyPem: string, ahora = new Date()): string {
    const cert = forge.pki.certificateFromPem(certPem);
    const key = forge.pki.privateKeyFromPem(keyPem);
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(tra, 'utf8');
    p7.addCertificate(cert);
    p7.addSigner({
        key: key as forge.pki.rsa.PrivateKey,
        certificate: cert,
        digestAlgorithm: forge.pki.oids.sha256,
        authenticatedAttributes: [
            { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
            { type: forge.pki.oids.messageDigest },
            { type: forge.pki.oids.signingTime, value: ahora as unknown as string },
        ],
    });
    p7.sign({ detached: false });
    return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

export function sobreLoginCms(cmsBase64: string): string {
    return '<?xml version="1.0" encoding="UTF-8"?>'
        + `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="${NS_WSAA}">`
        + '<soapenv:Header/>'
        + `<soapenv:Body><wsaa:loginCms><wsaa:in0>${esc(cmsBase64)}</wsaa:in0></wsaa:loginCms></soapenv:Body>`
        + '</soapenv:Envelope>';
}

type Nodo = Record<string, unknown>;
const hijo = (n: unknown, k: string): unknown => (n && typeof n === 'object' ? (n as Nodo)[k] : undefined);
const texto = (n: unknown): string => {
    if (n === undefined || n === null) return '';
    if (typeof n === 'string' || typeof n === 'number') return String(n).trim();
    const inner = (n as Nodo)._;
    return inner !== undefined ? String(inner).trim() : '';
};

async function leer(xml: string): Promise<Nodo> {
    try {
        return await parseStringPromise(xml, { explicitArray: false, ignoreAttrs: true, tagNameProcessors: [processors.stripPrefix] }) as Nodo;
    } catch {
        throw new ArcaWsaaTransporteError('La respuesta del WSAA no es un XML legible.');
    }
}

/** Lee la respuesta de loginCms: el ticket, o el SoapFault como ArcaWsaaError. */
export async function parsearLoginCms(xml: string): Promise<TicketAcceso> {
    const body = hijo(hijo(await leer(xml), 'Envelope'), 'Body');
    const fault = hijo(body, 'Fault');
    if (fault) {
        throw new ArcaWsaaError(texto(hijo(fault, 'faultcode')).replace(/^.*:/, '') || 'desconocido', texto(hijo(fault, 'faultstring')));
    }
    const ret = texto(hijo(hijo(body, 'loginCmsResponse'), 'loginCmsReturn'));
    if (!ret) throw new ArcaWsaaTransporteError('Respuesta del WSAA sin loginCmsReturn.');
    const ta = hijo(await leer(ret), 'loginTicketResponse');
    const token = texto(hijo(hijo(ta, 'credentials'), 'token'));
    const sign = texto(hijo(hijo(ta, 'credentials'), 'sign'));
    const expira = new Date(texto(hijo(hijo(ta, 'header'), 'expirationTime')));
    const generado = new Date(texto(hijo(hijo(ta, 'header'), 'generationTime')));
    if (!token || !sign || Number.isNaN(expira.getTime())) throw new ArcaWsaaTransporteError('El ticket del WSAA vino incompleto.');
    return { token, sign, expira, generado: Number.isNaN(generado.getTime()) ? new Date() : generado };
}

/**
 * CUITs que el ticket autoriza a representar. El token es un XML en base64
 * (manual del WSAA §6.3) con <login entity=… service=…> y <relation key=…>.
 * Sirve para comprobar, con la palabra de ARCA, que el certificado puede
 * facturar por la CUIT del negocio.
 */
export function cuitsRepresentadas(token: string): string[] {
    let xml = '';
    try {
        xml = Buffer.from(token, 'base64').toString('utf8');
    } catch {
        return [];
    }
    return [...new Set([...xml.matchAll(/<relation\b[^>]*\bkey="(\d{11})"/g)].map((m) => m[1]))];
}

export interface OpcionesLogin {
    timeoutMs?: number;
    url?: string;
}

/** POST a loginCms. SOAPAction vacío, como declara el WSDL (soapAction=""). */
export async function loginCms(entorno: EntornoRail, cmsBase64: string, opts: OpcionesLogin = {}): Promise<TicketAcceso> {
    let body = '';
    let status = 0;
    try {
        const response = await fetch(opts.url ?? ARCA_ENDPOINTS[entorno].wsaa, {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
            body: sobreLoginCms(cmsBase64),
            signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
            redirect: 'error',
        });
        status = response.status;
        body = await response.text();
    } catch (error) {
        throw new ArcaWsaaTransporteError(error instanceof Error ? error.message : String(error));
    }
    if (!/<(\w+:)?Envelope[\s>]/.test(body)) throw new ArcaWsaaTransporteError(`HTTP ${status} sin mensaje SOAP`);
    return parsearLoginCms(body);
}
