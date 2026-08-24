// Cliente SOAP del servicio de remisión VERI*FACTU (RegFactuSistemaFacturacion).
//
// Endpoint, namespaces y estructura del XML verificados el 24-ago-2026 contra
// el WSDL y los XSD REALES descargados directamente de la AEAT (no una fuente
// secundaria):
//   https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SistemaFacturacion.wsdl
//   .../SuministroInformacion.xsd · .../SuministroLR.xsd · .../RespuestaSuministro.xsd
// y contra el ejemplo oficial completo de "Descripción de los servicios web"
// (AEAT, v1.0.3, §9.1.1.1 — alta inicial normal). El `<soapenv:Header/>` del
// ejemplo oficial va VACÍO: la autenticación es 100% mTLS (certificado
// cliente en el handshake TLS), sin cabecera WS-Security.
//
// Lo que este archivo NO puede verificar sin un certificado real de una
// empresa española (ver Fase 7.7 del plan): el comportamiento del servicio
// real ante un envío real. La estructura del XML sí es del propio WSDL/XSD
// oficial, byte a byte — no una reconstrucción de memoria.
import { Agent, fetch as undiciFetch } from 'undici';
import { parseStringPromise } from 'xml2js';
import type { AltaRegistroXmlExtra, AnulacionRegistroXmlExtra } from './chain';
import type { DesgloseLinea, DestinatarioXml } from './desglose';

const NS_SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
const NS_LR = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';
const NS_INFO = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';

const ENDPOINT = {
    // Remisión voluntaria (VERI*FACTU) — NO el carril "RequerimientoSOAP", que
    // es para remisión bajo requerimiento expreso de la AEAT, un caso distinto.
    production: 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
    sandbox: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
} as const;

export function verifactuEndpoint(sandbox: boolean): string {
    return sandbox ? ENDPOINT.sandbox : ENDPOINT.production;
}

function esc(value: unknown): string {
    return String(value ?? '')
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

function desgloseXml(lineas: DesgloseLinea[]): string {
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

function destinatarioXml(d: DestinatarioXml | null): string {
    if (!d) return '';
    const id = d.nif
        ? tag('NIF', d.nif)
        : `<sum1:IDOtro>${tag('CodigoPais', d.idOtro?.codigoPais)}${tag('IDType', d.idOtro?.idType)}${tag('ID', d.idOtro?.id)}</sum1:IDOtro>`;
    return `<sum1:Destinatarios><sum1:IDDestinatario>${tag('NombreRazon', d.nombreRazon)}${id}</sum1:IDDestinatario></sum1:Destinatarios>`;
}

function sistemaInformaticoXml(s: AltaRegistroXmlExtra['sistemaInformatico']): string {
    return [
        '<sum1:SistemaInformatico>',
        tag('NombreRazon', s.nombreRazon),
        tag('NIF', s.nif),
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

function registroAltaXml(p: AltaPayload, previous: RegistroIdentity | null): string {
    const encadenamiento = previous
        ? `<sum1:RegistroAnterior>${tag('IDEmisorFactura', previous.idEmisorFactura)}${tag('NumSerieFactura', previous.numSerieFactura)}${tag('FechaExpedicionFactura', previous.fechaExpedicionFactura)}${tag('Huella', p.huellaAnterior)}</sum1:RegistroAnterior>`
        : '<sum1:PrimerRegistro>S</sum1:PrimerRegistro>';
    return [
        '<sum1:RegistroAlta>',
        tag('IDVersion', '1.0'),
        `<sum1:IDFactura>${tag('IDEmisorFactura', p.idEmisorFactura)}${tag('NumSerieFactura', p.numSerieFactura)}${tag('FechaExpedicionFactura', p.fechaExpedicionFactura)}</sum1:IDFactura>`,
        tag('NombreRazonEmisor', p.nombreRazonEmisor),
        tag('TipoFactura', p.tipoFactura),
        tag('DescripcionOperacion', p.descripcionOperacion),
        destinatarioXml(p.destinatario),
        desgloseXml(p.desglose),
        tag('CuotaTotal', p.cuotaTotal),
        tag('ImporteTotal', p.importeTotal),
        `<sum1:Encadenamiento>${encadenamiento}</sum1:Encadenamiento>`,
        sistemaInformaticoXml(p.sistemaInformatico),
        tag('FechaHoraHusoGenRegistro', p.fechaHoraHusoGenRegistro),
        tag('TipoHuella', '01'),
        tag('Huella', p.huella),
        '</sum1:RegistroAlta>',
    ].join('');
}

function registroAnulacionXml(p: AnulacionPayload, previous: RegistroIdentity | null): string {
    const encadenamiento = previous
        ? `<sum1:RegistroAnterior>${tag('IDEmisorFactura', previous.idEmisorFactura)}${tag('NumSerieFactura', previous.numSerieFactura)}${tag('FechaExpedicionFactura', previous.fechaExpedicionFactura)}${tag('Huella', p.huellaAnterior)}</sum1:RegistroAnterior>`
        : '<sum1:PrimerRegistro>S</sum1:PrimerRegistro>';
    return [
        '<sum1:RegistroAnulacion>',
        tag('IDVersion', '1.0'),
        `<sum1:IDFactura>${tag('IDEmisorFacturaAnulada', p.idEmisorFacturaAnulada)}${tag('NumSerieFacturaAnulada', p.numSerieFacturaAnulada)}${tag('FechaExpedicionFacturaAnulada', p.fechaExpedicionFacturaAnulada)}</sum1:IDFactura>`,
        `<sum1:Encadenamiento>${encadenamiento}</sum1:Encadenamiento>`,
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

/**
 * Construye el sobre SOAP completo para un lote de registros de la MISMA
 * org (misma Cabecera/ObligadoEmision — el esquema solo admite una por
 * envío). Máximo 1000 RegistroFactura por envío (SuministroLR.xsd).
 */
export function buildEnvelope(emisor: { nombreRazon: string; nif: string }, registros: BatchRegistro[]): string {
    if (!registros.length) throw new Error('buildEnvelope: no hay registros que enviar.');
    if (registros.length > 1000) throw new Error('buildEnvelope: máximo 1000 registros por envío (límite del esquema).');
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
    numSerieFactura: string;
    fechaExpedicionFactura: string;
    estado: EstadoRegistro;
    codigoError?: number;
    descripcionError?: string;
}

export interface RespuestaEnvio {
    estadoEnvio: 'Correcto' | 'ParcialmenteCorrecto' | 'Incorrecto';
    csv?: string;
    lineas: RespuestaLinea[];
    raw: unknown;
}

/**
 * Recorre el XML de respuesta ya parseado por xml2js (`explicitArray:false`)
 * localizando el primer nodo cuyo nombre local (sin prefijo de namespace)
 * coincida — los prefijos que usa la AEAT en la respuesta (`soapenv:`,
 * `sfR:`…) no están garantizados letra por letra, así que emparejar por
 * nombre local es más robusto que hardcodear un prefijo.
 */
function findByLocalName(node: unknown, localName: string): unknown {
    if (!node || typeof node !== 'object') return undefined;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        const bare = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
        if (bare === localName) return value;
    }
    return undefined;
}

export async function parseRespuesta(xml: string): Promise<RespuestaEnvio> {
    const parsed = await parseStringPromise(xml, { explicitArray: false, ignoreAttrs: true, tagNameProcessors: [] });
    const envelope = findByLocalName(parsed, 'Envelope');
    const body = findByLocalName(envelope, 'Body');
    const respuesta = findByLocalName(body, 'RespuestaRegFactuSistemaFacturacion') ?? findByLocalName(body, 'Fault');
    if (!respuesta) throw new Error('Respuesta de la AEAT sin el nodo esperado (RespuestaRegFactuSistemaFacturacion).');
    if (findByLocalName(body, 'Fault')) {
        const faultString = findByLocalName(respuesta, 'faultstring') ?? findByLocalName(respuesta, 'Reason');
        throw new Error(`La AEAT rechazó el envío a nivel SOAP: ${JSON.stringify(faultString ?? respuesta)}`);
    }

    const estadoEnvio = String(findByLocalName(respuesta, 'EstadoEnvio') ?? 'Incorrecto') as RespuestaEnvio['estadoEnvio'];
    const csv = findByLocalName(respuesta, 'CSV') as string | undefined;
    let lineasRaw = findByLocalName(respuesta, 'RespuestaLinea');
    if (lineasRaw && !Array.isArray(lineasRaw)) lineasRaw = [lineasRaw];
    const lineas: RespuestaLinea[] = ((lineasRaw as Record<string, unknown>[] | undefined) ?? []).map((l) => {
        const idFactura = findByLocalName(l, 'IDFactura') as Record<string, unknown>;
        return {
            numSerieFactura: String(findByLocalName(idFactura, 'NumSerieFactura') ?? ''),
            fechaExpedicionFactura: String(findByLocalName(idFactura, 'FechaExpedicionFactura') ?? ''),
            estado: String(findByLocalName(l, 'EstadoRegistro') ?? 'Incorrecto') as EstadoRegistro,
            codigoError: findByLocalName(l, 'CodigoErrorRegistro') !== undefined ? Number(findByLocalName(l, 'CodigoErrorRegistro')) : undefined,
            descripcionError: findByLocalName(l, 'DescripcionErrorRegistro') as string | undefined,
        };
    });
    return { estadoEnvio, csv, lineas, raw: parsed };
}

export interface SubmitOptions {
    sandbox: boolean;
    /** PKCS#12 sin cifrar (ya desencriptado con decryptSecret antes de llegar aquí) + su contraseña. */
    p12: Buffer;
    p12Password: string;
    timeoutMs?: number;
}

/**
 * Envía un lote al servicio real de la AEAT vía mTLS (certificado cliente en
 * el handshake TLS — no hay cabecera de autenticación en el SOAP).
 *
 * NO verificado end-to-end contra el servicio real (Fase 7.7 del plan): el
 * envoltorio SOAP y el endpoint sí están confirmados contra el WSDL/XSD
 * oficiales, pero ningún certificado real de prueba estuvo disponible en esta
 * sesión. Antes de depender de esto en producción, confirma un envío real
 * contra el entorno de preproducción (`sandbox: true`) con un certificado de
 * pruebas legítimo.
 */
export async function submitToAeat(
    emisor: { nombreRazon: string; nif: string },
    registros: BatchRegistro[],
    options: SubmitOptions,
): Promise<RespuestaEnvio> {
    const envelope = buildEnvelope(emisor, registros);
    const agent = new Agent({
        connect: { pfx: options.p12, passphrase: options.p12Password },
        headersTimeout: options.timeoutMs ?? 30_000,
    });
    let response: Response;
    try {
        response = await undiciFetch(verifactuEndpoint(options.sandbox), {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml; charset=utf-8' },
            body: envelope,
            dispatcher: agent,
            signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
        }) as unknown as Response;
    } catch (error) {
        throw new Error(`No se pudo conectar con el servicio de la AEAT: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        await agent.close();
    }
    const body = await response.text();
    if (!response.ok && !body.includes('RespuestaRegFactuSistemaFacturacion')) {
        throw new Error(`La AEAT respondió ${response.status}: ${body.slice(0, 500)}`);
    }
    return parseRespuesta(body);
}
