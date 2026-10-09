// Cliente SOAP 1.2 de los web services 4.00 de la NF-e.
//
// Contrato [MOC 4.2 y 5; WSDL de la SEFAZ-MT vendorizados en
// scripts/fixtures/nfe/wsdl/]:
//   - SOAP 1.2, document/literal; el mensaje va como único hijo de
//     <nfeDadosMsg> en el namespace del servicio, y la respuesta vuelve en
//     <nfeResultMsg>. Los WSDL 4.00 no declaran cabecera (nfeCabecMsg).
//   - Content-Type application/soap+xml con el parámetro `action` = la
//     soapAction de la operación.
//   - TLS 1.2 con autenticación mutua: el certificado ICP-Brasil del
//     contribuyente, y la cadena del servidor verificada contra las raíces
//     estándar MÁS las de la ICP-Brasil (icp-raizes.ts).
//
// El sobre no usa prefijos: Envelope y Body van con el namespace por defecto
// de SOAP 1.2, y el mensaje redeclara el suyo. Así el elemento firmado
// (infNFe, infEvento, infInut) no hereda ningún namespace ajeno, y su forma
// canónica es la misma dentro y fuera del sobre.
//
// Dos desenlaces de transporte que NO se confunden, porque de eso depende si
// se puede entrar en contingencia:
//   - `enviado: false`: la conexión TLS nunca se estableció (DNS, conexión
//     rechazada, handshake). La SEFAZ no recibió nada.
//   - `enviado: true`: el pedido pudo llegar y la respuesta se perdió. Para la
//     autorización es INCIERTO: se consulta, nunca se reenvía.

import { request } from 'node:https';
import { rootCertificates } from 'node:tls';
import type { TLSSocket } from 'node:tls';
// Extensión .ts explícita: este módulo también se carga desde Node plano.
import type { EntornoRail } from '../rieles.ts';
import { NS_SOAP12, SERVICOS, URL_SERVICO, type Autorizador, type ServicoNfe } from './constantes.ts';
import { RAICES_ICP_BRASIL } from './icp-raizes.ts';
import { bloco } from '../nfse/xml.ts';

export class NfeTransporteError extends Error {
    readonly detalle: string;
    /** ¿Pudo llegar el pedido? false = la conexión ni siquiera se abrió. */
    readonly enviado: boolean;
    constructor(detalle: string, enviado: boolean) {
        super('No hubo una respuesta legible de la SEFAZ.');
        this.name = 'NfeTransporteError';
        this.detalle = detalle.slice(0, 500);
        this.enviado = enviado;
    }
}

export interface CredencialTls {
    certPem: string;
    keyPem: string;
}

export interface RespuestaSoap {
    status: number;
    /** Contenido de <nfeResultMsg> (el XML de retorno del servicio). */
    resultado: string | null;
    /** Cuerpo completo, recortado (para el log de un fallo). */
    cuerpo: string;
}

export interface OpcoesSoap {
    timeoutMs?: number;
    /** Solo pruebas: otra URL para el servicio. */
    url?: string;
}

/** Sobre SOAP 1.2 del mensaje de un servicio. */
export function sobre(servico: ServicoNfe, mensagem: string): string {
    return '<?xml version="1.0" encoding="utf-8"?>'
        + `<Envelope xmlns="${NS_SOAP12}"><Body>`
        + `<nfeDadosMsg xmlns="${SERVICOS[servico].ns}">${mensagem}</nfeDadosMsg>`
        + '</Body></Envelope>';
}

export function urlServico(entorno: EntornoRail, autorizador: Autorizador, servico: ServicoNfe): string | null {
    return URL_SERVICO[entorno][autorizador]?.[servico] ?? null;
}

let caCache: string[] | null = null;
function ca(): string[] {
    caCache ??= [...rootCertificates, ...RAICES_ICP_BRASIL.map((r) => r.pem)];
    return caCache;
}

/**
 * Llama a un servicio. Devuelve status + resultado, o lanza
 * NfeTransporteError (con `enviado`) si no hubo respuesta HTTP.
 */
export function chamarSefaz(entorno: EntornoRail, autorizador: Autorizador, servico: ServicoNfe, mensagem: string, credencial: CredencialTls, opts: OpcoesSoap = {}): Promise<RespuestaSoap> {
    const destino = opts.url ?? urlServico(entorno, autorizador, servico);
    if (!destino) return Promise.reject(new NfeTransporteError(`${autorizador} no ofrece ${servico}`, false));
    const url = new URL(destino);
    const payload = Buffer.from(sobre(servico, mensagem), 'utf8');
    return new Promise((resolve, reject) => {
        let conectado = false;
        const req = request({
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || 443,
            path: `${url.pathname}${url.search}`,
            method: 'POST',
            key: credencial.keyPem,
            cert: credencial.certPem,
            ca: ca(),
            minVersion: 'TLSv1.2',
            // Conexión nueva por llamada: `secureConnect` marca con certeza que
            // el pedido pudo salir.
            agent: false,
            headers: {
                'Content-Type': `application/soap+xml; charset=utf-8; action="${SERVICOS[servico].acao}"`,
                'Content-Length': String(payload.length),
            },
            timeout: opts.timeoutMs ?? 60_000,
        }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
                const cuerpo = Buffer.concat(chunks).toString('utf8');
                resolve({ status: res.statusCode ?? 0, resultado: bloco(cuerpo, 'nfeResultMsg'), cuerpo: cuerpo.slice(0, 4000) });
            });
            res.on('error', (error) => reject(new NfeTransporteError(`${servico}: ${error.message}`, true)));
        });
        req.on('socket', (socket) => {
            (socket as TLSSocket).on('secureConnect', () => { conectado = true; });
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', (error) => reject(new NfeTransporteError(`${servico}: ${error.message}`, conectado)));
        req.write(payload);
        req.end();
    });
}
