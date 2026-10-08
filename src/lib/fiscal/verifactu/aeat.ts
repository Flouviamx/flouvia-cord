// Cliente SOAP del servicio de remisión VERI*FACTU (RegFactuSistemaFacturacion).
//
// Endpoint, namespaces y estructura del XML verificados contra el WSDL y los
// XSD REALES descargados de la AEAT (no una fuente secundaria):
//   https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SistemaFacturacion.wsdl
//   .../SuministroInformacion.xsd · .../SuministroLR.xsd · .../RespuestaSuministro.xsd
// y contra el ejemplo oficial completo de "Descripción de los servicios web"
// (AEAT, v1.0.3, §9.1.1.1). El `<soapenv:Header/>` del ejemplo oficial va
// VACÍO: la autenticación es 100% mTLS (certificado cliente en el handshake
// TLS), sin cabecera WS-Security. Copia de los XSD vendorizada en
// scripts/fixtures/aeat/ — verifactu-check.mjs valida contra ellos cada
// variante de registro que este archivo sabe generar.
//
// El ORDEN de los elementos es el de la <sequence> del XSD, no el que parezca
// lógico: un elemento fuera de sitio rompe el esquema y la AEAT rechaza el
// MENSAJE COMPLETO (SoapFault), no solo ese registro.
//
// Lo que este archivo NO puede verificar sin un certificado real de una
// empresa española: el comportamiento del servicio real ante un envío real.
import { Agent, fetch as undiciFetch } from 'undici';
import { parseStringPromise } from 'xml2js';
import type { AltaRegistroXmlExtra, AnulacionRegistroXmlExtra } from './chain';
import type { DesgloseLinea, DestinatarioXml } from './desglose';
import type { SistemaInformaticoIdentity } from './sif';

const NS_SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
const NS_LR = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';
const NS_INFO = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';

const ENDPOINT = {
    // Remisión voluntaria (VERI*FACTU) — NO el carril "RequerimientoSOAP", que
    // es para remisión bajo requerimiento expreso de la AEAT, un caso distinto.
    // Los hosts www10/prewww10 del WSDL son para certificados de SELLO de
    // entidad; Cord usa el certificado de persona o representante (www1).
    produccion: 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
    pruebas: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
} as const;

export type EntornoAeat = keyof typeof ENDPOINT;

/** `sandbox` booleano por compatibilidad: true = portal de pruebas externas. */
export function verifactuEndpoint(entorno: EntornoAeat | boolean): string {
    if (typeof entorno === 'boolean') return entorno ? ENDPOINT.pruebas : ENDPOINT.produccion;
    return ENDPOINT[entorno];
}

// Última barrera: un carácter inválido en XML 1.0 rompe el mensaje entero
// (error 4103). Los registros nuevos ya llegan limpios (validacion.ts); esto
// cubre los encadenados antes, sin tocar ningún campo que entre en la huella
// (NIF, número, fecha, importes son ASCII validado).
const XML_INVALID = /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

function esc(value: unknown): string {
    return String(value ?? '')
        .replace(XML_INVALID, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function tag(name: string, value: string | number | undefined | null): string {
    if (value === undefined || value === null || value === '') return '';
    return `<sum1:${name}>${esc(value)}</sum1:${name}>`;
}

function idFacturaXml(f: { idEmisorFactura: string; numSerieFactura: string; fechaExpedicionFactura: string }): string {
    return tag('IDEmisorFactura', f.idEmisorFactura)
        + tag('NumSerieFactura', f.numSerieFactura)
        + tag('FechaExpedicionFactura', f.fechaExpedicionFactura);
}

function idOtroXml(o: { codigoPais?: string; idType: string; id: string }): string {
    return `<sum1:IDOtro>${tag('CodigoPais', o.codigoPais)}${tag('IDType', o.idType)}${tag('ID', o.id)}</sum1:IDOtro>`;
}

function desgloseXml(lineas: DesgloseLinea[]): string {
    // DetalleType: Impuesto?, ClaveRegimen?, (CalificacionOperacion |
    // OperacionExenta), TipoImpositivo?, BaseImponibleOimporteNoSujeto,
    // BaseImponibleACoste?, CuotaRepercutida?, TipoRecargo?, CuotaRecargo?
    const detalles = lineas.map((d) => [
        '<sum1:DetalleDesglose>',
        tag('ClaveRegimen', d.claveRegimen),
        d.calificacionOperacion ? tag('CalificacionOperacion', d.calificacionOperacion) : tag('OperacionExenta', d.operacionExenta),
        tag('TipoImpositivo', d.tipoImpositivo),
        tag('BaseImponibleOimporteNoSujeto', d.baseImponibleOimporteNoSujeto),
        tag('CuotaRepercutida', d.cuotaRepercutida),
        '</sum1:DetalleDesglose>',
    ].join('')).join('');
    return `<sum1:Desglose>${detalles}</sum1:Desglose>`;
}

function destinatarioXml(d: DestinatarioXml | null | undefined): string {
    if (!d) return '';
    const id = d.nif ? tag('NIF', d.nif) : d.idOtro ? idOtroXml(d.idOtro) : '';
    return `<sum1:Destinatarios><sum1:IDDestinatario>${tag('NombreRazon', d.nombreRazon)}${id}</sum1:IDDestinatario></sum1:Destinatarios>`;
}

function sistemaInformaticoXml(s: SistemaInformaticoIdentity): string {
    // Registros anteriores a IDOtro solo traen `nif`.
    const id = s.nif ? tag('NIF', s.nif) : s.idOtro ? idOtroXml(s.idOtro) : '';
    return [
        '<sum1:SistemaInformatico>',
        tag('NombreRazon', s.nombreRazon),
        id,
        tag('NombreSistemaInformatico', s.nombreSistemaInformatico),
        tag('IdSistemaInformatico', s.idSistemaInformatico),
        tag('Version', s.version),
        tag('NumeroInstalacion', s.numeroInstalacion),
        tag('TipoUsoPosibleSoloVerifactu', s.tipoUsoPosibleSoloVerifactu),
        tag('TipoUsoPosibleMultiOT', s.tipoUsoPosibleMultiOT),
        tag('IndicadorMultiplesOT', s.indicadorMultiplesOT),
        '</sum1:SistemaInformatico>',
    ].join('');
}

/** Payload tal como lo persiste chain.ts: campos de la huella + AltaRegistroXmlExtra + huella/huellaAnterior/seq. */
export interface AltaPayload extends AltaRegistroXmlExtra {
    idEmisorFactura: string;
    numSerieFactura: string;
    fechaExpedicionFactura: string;
    tipoFactura: string;
    cuotaTotal: string;
    importeTotal: string;
    huella: string;
    huellaAnterior: string;
    fechaHoraHusoGenRegistro: string;
}

export interface AnulacionPayload extends AnulacionRegistroXmlExtra {
    idEmisorFacturaAnulada: string;
    numSerieFacturaAnulada: string;
    fechaExpedicionFacturaAnulada: string;
    huella: string;
    huellaAnterior: string;
    fechaHoraHusoGenRegistro: string;
}

function encadenamientoXml(p: { huellaAnterior: string }, previous: RegistroIdentity | null): string {
    const inner = previous
        ? `<sum1:RegistroAnterior>${idFacturaXml(previous)}${tag('Huella', p.huellaAnterior)}</sum1:RegistroAnterior>`
        : '<sum1:PrimerRegistro>S</sum1:PrimerRegistro>';
    return `<sum1:Encadenamiento>${inner}</sum1:Encadenamiento>`;
}

function registroAltaXml(p: AltaPayload, previous: RegistroIdentity | null): string {
    // Orden de RegistroFacturacionAltaType (SuministroInformacion.xsd).
    const rectificadas = p.facturasRectificadas?.length
        ? `<sum1:FacturasRectificadas>${p.facturasRectificadas.map((f) => `<sum1:IDFacturaRectificada>${idFacturaXml(f)}</sum1:IDFacturaRectificada>`).join('')}</sum1:FacturasRectificadas>`
        : '';
    return [
        '<sum1:RegistroAlta>',
        tag('IDVersion', '1.0'),
        `<sum1:IDFactura>${idFacturaXml(p)}</sum1:IDFactura>`,
        tag('NombreRazonEmisor', p.nombreRazonEmisor),
        tag('Subsanacion', p.subsanacion),
        tag('RechazoPrevio', p.rechazoPrevio),
        tag('TipoFactura', p.tipoFactura),
        tag('TipoRectificativa', p.tipoRectificativa),
        rectificadas,
        tag('DescripcionOperacion', p.descripcionOperacion),
        tag('FacturaSinIdentifDestinatarioArt61d', p.facturaSinIdentifDestinatarioArt61d),
        tag('Macrodato', p.macrodato),
        destinatarioXml(p.destinatario),
        desgloseXml(p.desglose),
        tag('CuotaTotal', p.cuotaTotal),
        tag('ImporteTotal', p.importeTotal),
        encadenamientoXml(p, previous),
        sistemaInformaticoXml(p.sistemaInformatico),
        tag('FechaHoraHusoGenRegistro', p.fechaHoraHusoGenRegistro),
        tag('TipoHuella', '01'),
        tag('Huella', p.huella),
        '</sum1:RegistroAlta>',
    ].join('');
}

function registroAnulacionXml(p: AnulacionPayload, previous: RegistroIdentity | null): string {
    // Orden de RegistroFacturacionAnulacionType.
    return [
        '<sum1:RegistroAnulacion>',
        tag('IDVersion', '1.0'),
        `<sum1:IDFactura>${tag('IDEmisorFacturaAnulada', p.idEmisorFacturaAnulada)}${tag('NumSerieFacturaAnulada', p.numSerieFacturaAnulada)}${tag('FechaExpedicionFacturaAnulada', p.fechaExpedicionFacturaAnulada)}</sum1:IDFactura>`,
        tag('SinRegistroPrevio', p.sinRegistroPrevio),
        tag('RechazoPrevio', p.rechazoPrevio),
        encadenamientoXml(p, previous),
        sistemaInformaticoXml(p.sistemaInformatico),
        tag('FechaHoraHusoGenRegistro', p.fechaHoraHusoGenRegistro),
        tag('TipoHuella', '01'),
        tag('Huella', p.huella),
        '</sum1:RegistroAnulacion>',
    ].join('');
}

/** Identidad (NIF+serie+fecha) de UN registro de la cadena, sin importar si fue alta o anulación. */
export interface RegistroIdentity {
    idEmisorFactura: string;
    numSerieFactura: string;
    fechaExpedicionFactura: string;
}

export interface BatchRegistro {
    tipo: 'alta' | 'anulacion';
    payload: AltaPayload | AnulacionPayload;
    /**
     * Identidad del registro INMEDIATAMENTE ANTERIOR en la cadena de esta org
     * (`seq - 1`) — `null` solo en el primer registro del SIF. NO se deriva
     * del propio `payload` (que describe la factura DE ESTE registro, no la
     * del anterior): el llamador debe resolverlo leyendo la fila `seq - 1` de
     * `verifactu_registros` antes de construir el lote.
     */
    previous: RegistroIdentity | null;
}

/** NIF y razón social del obligado, leídos del PROPIO registro (no de `orgs`). */
export function emisorDeRegistro(r: BatchRegistro): { nif: string; nombreRazon: string } {
    return r.tipo === 'alta'
        ? { nif: (r.payload as AltaPayload).idEmisorFactura, nombreRazon: (r.payload as AltaPayload).nombreRazonEmisor }
        : { nif: (r.payload as AnulacionPayload).idEmisorFacturaAnulada, nombreRazon: String((r.payload as AnulacionPayload).nombreRazonEmisor ?? '') };
}

/**
 * Construye el sobre SOAP completo para un lote de registros del MISMO
 * obligado. La Cabecera/ObligadoEmision admite un solo NIF por envío, y la
 * AEAT exige que coincida con el IDEmisorFactura de cada registro (error 1108):
 * por eso el emisor sale de los registros, y el llamador agrupa por NIF.
 * Máximo 1000 RegistroFactura por envío (SuministroLR.xsd).
 */
export function buildEnvelope(emisor: { nombreRazon: string; nif: string }, registros: BatchRegistro[]): string {
    if (!registros.length) throw new Error('buildEnvelope: no hay registros que enviar.');
    if (registros.length > 1000) throw new Error('buildEnvelope: máximo 1000 registros por envío (límite del esquema).');
    for (const r of registros) {
        if (emisorDeRegistro(r).nif !== emisor.nif) {
            throw new Error('buildEnvelope: todos los registros de un envío deben ser del mismo obligado (NIF de la cabecera).');
        }
    }
    const cuerpos = registros.map((r) => {
        const inner = r.tipo === 'alta'
            ? registroAltaXml(r.payload as AltaPayload, r.previous)
            : registroAnulacionXml(r.payload as AnulacionPayload, r.previous);
        return `<sum:RegistroFactura>${inner}</sum:RegistroFactura>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>`
        + `<soapenv:Envelope xmlns:soapenv="${NS_SOAP}" xmlns:sum="${NS_LR}" xmlns:sum1="${NS_INFO}">`
        + `<soapenv:Header/>`
        + `<soapenv:Body><sum:RegFactuSistemaFacturacion>`
        + `<sum:Cabecera><sum1:ObligadoEmision>${tag('NombreRazon', emisor.nombreRazon)}${tag('NIF', emisor.nif)}</sum1:ObligadoEmision></sum:Cabecera>`
        + cuerpos
        + `</sum:RegFactuSistemaFacturacion></soapenv:Body></soapenv:Envelope>`;
}

export type EstadoRegistro = 'Correcto' | 'AceptadoConErrores' | 'Incorrecto';

export interface RespuestaLinea {
    idEmisorFactura: string;
    numSerieFactura: string;
    fechaExpedicionFactura: string;
    /** Alta | Anulacion — sin él, una factura y su anulación en el mismo lote se pisaban. */
    tipoOperacion: 'Alta' | 'Anulacion';
    estado: EstadoRegistro;
    codigoError?: number;
    descripcionError?: string;
    /** Solo con error 3000: lo que la AEAT ya tiene registrado para esa factura. */
    registroDuplicado?: {
        idPeticion?: string;
        estado: 'Correcta' | 'AceptadaConErrores' | 'Anulada' | string;
        codigoError?: number;
        descripcionError?: string;
    };
}

export interface RespuestaEnvio {
    estadoEnvio: 'Correcto' | 'ParcialmenteCorrecto' | 'Incorrecto';
    csv?: string;
    /** Segundos que hay que esperar antes del siguiente envío (control de flujo, art. 16.2 de la Orden). */
    tiempoEsperaEnvio?: number;
    lineas: RespuestaLinea[];
    raw: unknown;
}

/**
 * La AEAT rechazó el MENSAJE completo (SoapFault): esquema roto, cabecera
 * inválida, certificado sin permisos… `faultcode` "Server" es un fallo suyo
 * (reenviar); "Client" es del mensaje (corregir antes de reenviar).
 * `codigo` es el número de "Codigo[4102]" del faultstring, si viene.
 */
export class AeatFaultError extends Error {
    readonly faultcode: string;
    readonly codigo?: number;
    readonly faultstring: string;
    constructor(faultcode: string, faultstring: string) {
        const codigo = /Codigo\[(\d+)\]/i.exec(faultstring)?.[1];
        super(`La AEAT rechazó el envío completo (${faultcode}${codigo ? ` ${codigo}` : ''}): ${faultstring.slice(0, 500)}`);
        this.name = 'AeatFaultError';
        this.faultcode = faultcode;
        this.codigo = codigo ? Number(codigo) : undefined;
        this.faultstring = faultstring;
    }
}

/**
 * La AEAT no identificó el certificado de cliente: en vez de un SoapFault
 * redirige a su página "403 Error de identificación. No se detecta
 * certificado electrónico" (/Sede/errores/erro403*.html). Comprobado contra
 * el portal de pruebas externas (oct 2026). No es un fallo de red: reenviar
 * con el mismo certificado nunca va a funcionar, así que se trata como fallo
 * de cabecera (se pausa la organización y no se toca ningún registro).
 */
export class AeatCertificadoError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AeatCertificadoError';
    }
}

/** Fallo de red o respuesta inesperada: no dice nada de los registros, se reintenta. */
export class AeatTransitoryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AeatTransitoryError';
    }
}

/**
 * Recorre el XML de respuesta ya parseado por xml2js (`explicitArray:false`)
 * localizando el primer nodo cuyo nombre local (sin prefijo de namespace)
 * coincida — los prefijos que usa la AEAT en la respuesta (`soapenv:`,
 * `env:`, `sfR:`…) no están garantizados letra por letra.
 */
function findByLocalName(node: unknown, localName: string): unknown {
    if (!node || typeof node !== 'object') return undefined;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        const bare = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
        if (bare === localName) return value;
    }
    return undefined;
}

function textOf(node: unknown): string | undefined {
    if (node === undefined || node === null) return undefined;
    if (typeof node === 'string' || typeof node === 'number') return String(node).trim();
    const inner = (node as Record<string, unknown>)._;
    return inner !== undefined ? String(inner).trim() : undefined;
}

function numberOf(node: unknown): number | undefined {
    const t = textOf(node);
    if (t === undefined || t === '') return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
}

export async function parseRespuesta(xml: string): Promise<RespuestaEnvio> {
    let parsed: unknown;
    try {
        parsed = await parseStringPromise(xml, { explicitArray: false, ignoreAttrs: true, tagNameProcessors: [] });
    } catch {
        throw new AeatTransitoryError('La respuesta de la AEAT no es un XML legible.');
    }
    const envelope = findByLocalName(parsed, 'Envelope');
    const body = findByLocalName(envelope, 'Body');
    const fault = findByLocalName(body, 'Fault');
    if (fault) {
        const faultcode = String(textOf(findByLocalName(fault, 'faultcode')) ?? '').replace(/^.*:/, '') || 'desconocido';
        const faultstring = String(textOf(findByLocalName(fault, 'faultstring')) ?? textOf(findByLocalName(fault, 'Reason')) ?? JSON.stringify(fault));
        throw new AeatFaultError(faultcode, faultstring);
    }
    const respuesta = findByLocalName(body, 'RespuestaRegFactuSistemaFacturacion');
    if (!respuesta) throw new AeatTransitoryError('Respuesta de la AEAT sin el nodo esperado (RespuestaRegFactuSistemaFacturacion).');

    const estadoEnvio = String(textOf(findByLocalName(respuesta, 'EstadoEnvio')) ?? 'Incorrecto') as RespuestaEnvio['estadoEnvio'];
    const csv = textOf(findByLocalName(respuesta, 'CSV'));
    const tiempoEsperaEnvio = numberOf(findByLocalName(respuesta, 'TiempoEsperaEnvio'));
    let lineasRaw = findByLocalName(respuesta, 'RespuestaLinea');
    if (lineasRaw && !Array.isArray(lineasRaw)) lineasRaw = [lineasRaw];
    const lineas: RespuestaLinea[] = ((lineasRaw as Record<string, unknown>[] | undefined) ?? []).map((l) => {
        const idFactura = findByLocalName(l, 'IDFactura') as Record<string, unknown>;
        const operacion = findByLocalName(l, 'Operacion') as Record<string, unknown> | undefined;
        const dup = findByLocalName(l, 'RegistroDuplicado') as Record<string, unknown> | undefined;
        const tipoOperacion = textOf(findByLocalName(operacion, 'TipoOperacion')) === 'Anulacion' ? 'Anulacion' : 'Alta';
        return {
            idEmisorFactura: String(textOf(findByLocalName(idFactura, 'IDEmisorFactura')) ?? ''),
            numSerieFactura: String(textOf(findByLocalName(idFactura, 'NumSerieFactura')) ?? ''),
            fechaExpedicionFactura: String(textOf(findByLocalName(idFactura, 'FechaExpedicionFactura')) ?? ''),
            tipoOperacion,
            estado: String(textOf(findByLocalName(l, 'EstadoRegistro')) ?? 'Incorrecto') as EstadoRegistro,
            codigoError: numberOf(findByLocalName(l, 'CodigoErrorRegistro')),
            descripcionError: textOf(findByLocalName(l, 'DescripcionErrorRegistro')),
            ...(dup ? {
                registroDuplicado: {
                    idPeticion: textOf(findByLocalName(dup, 'IdPeticionRegistroDuplicado')),
                    estado: String(textOf(findByLocalName(dup, 'EstadoRegistroDuplicado')) ?? ''),
                    codigoError: numberOf(findByLocalName(dup, 'CodigoErrorRegistro')),
                    descripcionError: textOf(findByLocalName(dup, 'DescripcionErrorRegistro')),
                },
            } : {}),
        };
    });
    return { estadoEnvio, csv, tiempoEsperaEnvio, lineas, raw: parsed };
}

/** Credenciales TLS del certificado del obligado, en la forma que acepte el runtime (ver cert.ts). */
export type TlsCredenciales = { pfx: Buffer; passphrase: string } | { key: string; cert: string };

export interface SubmitOptions {
    entorno: EntornoAeat;
    credenciales: TlsCredenciales;
    timeoutMs?: number;
    /** Solo pruebas: sustituye el endpoint de la AEAT por un servidor local. */
    url?: string;
}

/**
 * Envía un lote al servicio real de la AEAT vía mTLS (certificado cliente en
 * el handshake TLS — no hay cabecera de autenticación en el SOAP).
 *
 * El cuerpo de la respuesta se lee DENTRO del try y el agente se cierra
 * después: antes `agent.close()` se esperaba en el finally, antes de leer el
 * cuerpo, y `close()` espera a que terminen las peticiones en curso — con
 * respuestas de más de ~64 KB (el buffer del socket) la lectura nunca empezaba,
 * el envío colgaba hasta el timeout y la respuesta de la AEAT se perdía aunque
 * los registros SÍ hubieran quedado registrados.
 *
 * Lanza `AeatFaultError` (mensaje rechazado completo) o `AeatTransitoryError`
 * (red, timeout, HTTP sin SOAP). NO verificado end-to-end contra el servicio
 * real: confírmalo contra el portal de pruebas externas con un certificado
 * legítimo antes de depender de esto en producción.
 */
export async function submitToAeat(
    emisor: { nombreRazon: string; nif: string },
    registros: BatchRegistro[],
    options: SubmitOptions,
): Promise<RespuestaEnvio> {
    const envelope = buildEnvelope(emisor, registros);
    const timeoutMs = options.timeoutMs ?? 30_000;
    const agent = new Agent({
        connect: options.credenciales,
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
    });
    let status = 0;
    let ok = false;
    let body = '';
    try {
        const response = await undiciFetch(options.url ?? verifactuEndpoint(options.entorno), {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                // SOAP 1.1 exige la cabecera; el WSDL declara soapAction="".
                SOAPAction: '""',
            },
            body: envelope,
            dispatcher: agent,
            signal: AbortSignal.timeout(timeoutMs),
            // Sin seguir redirecciones: la AEAT responde a un certificado no
            // reconocido con un 30x a una página HTML, y seguirla convertía el
            // rechazo en un 200 "sin mensaje SOAP" que se reintentaba para siempre.
            redirect: 'manual',
        });
        status = response.status;
        ok = response.ok;
        const destino = response.headers.get('location') || '';
        if (status >= 300 && status < 400) {
            await response.body?.cancel().catch(() => {});
            if (/\/errores\/erro403/i.test(destino)) {
                throw new AeatCertificadoError('La AEAT no reconoció el certificado electrónico (error 403 de identificación). Comprueba que es un certificado cualificado vigente del obligado o de su representante.');
            }
            throw new AeatTransitoryError(`La AEAT redirigió el envío (${status}) a ${destino.slice(0, 200)}`);
        }
        body = await response.text();
    } catch (error) {
        if (error instanceof AeatCertificadoError || error instanceof AeatTransitoryError) throw error;
        throw new AeatTransitoryError(`No se pudo completar el envío a la AEAT: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        // Sin await bloqueante sobre una petición viva: el cuerpo ya se leyó.
        agent.close().catch(() => {});
    }
    if (body.includes('Fault') || body.includes('RespuestaRegFactuSistemaFacturacion')) {
        return parseRespuesta(body);
    }
    throw new AeatTransitoryError(`La AEAT respondió ${status}${ok ? '' : ' (error)'} sin un mensaje SOAP: ${body.slice(0, 300)}`);
}
