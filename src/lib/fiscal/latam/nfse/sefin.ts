// Cliente de la API de la Sefin Nacional NFS-e (emisor público nacional).
//
// Contrato [Swagger "API NFS-e - Sefin Nacional v1", scripts/fixtures/nfse/
// sefin-nacional.swagger.json] [Manual dos Contribuintes v1.2]:
//   - mTLS con el certificado ICP-Brasil del contribuyente ("Autenticação
//     Cliente"); mensajes JSON UTF-8; los documentos XML viajan GZip + base64
//     (`dpsXmlGZipB64`, `nfseXmlGZipB64`, `pedidoRegistroEventoXmlGZipB64`,
//     `eventoXmlGZipB64`).
//   - POST /nfse: 201 NFSePostResponseSucesso | 400/403/500 NFSePostResponseErro
//     (`erros[]` de MensagemProcessamento: codigo, descricao, complemento).
//   - GET /dps/{id}: 200 DpsGetResponse (chaveAcesso) | 404 no se generó NFS-e.
//   - GET /nfse/{chave}: 200 NFSeGetResponseSucesso.
//   - POST /nfse/{chave}/eventos: 201 EventosPostResponseSucesso | 400 ResponseErro.
//   - GET /nfse/{chave}/eventos/{tipo}/{nSeq}: 200 con el evento | 404.
//
// HTTP/1.1 (node:https, que no negocia HTTP/2): la Sefin pide el certificado
// del cliente por renegociación y responde HTTP_1_1_REQUIRED a HTTP/2. TLS se
// verifica con el almacén de confianza estándar; nunca se desactiva.
//
// Tres desenlaces que no se confunden, porque de eso depende si una NFS-e
// puede existir sin que Cord lo sepa:
//   - NfseTransporteError: red, timeout o una respuesta que no es el JSON del
//     contrato. Para POST /nfse es INCIERTO.
//   - status + json: la Sefin respondió; el llamador interpreta.
//
// Puro salvo `chamarSefin` (red). Los codificadores y parsers los carga el
// script de contrato con Node plano.

import { request } from 'node:https';
import { gunzipSync, gzipSync } from 'node:zlib';
// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { SEFIN_URL } from './constantes.ts';
import type { EntornoRail } from '../rieles.ts';

export class NfseTransporteError extends Error {
    readonly detalle: string;
    constructor(detalle: string) {
        super('No hubo una respuesta legible del Sistema Nacional NFS-e.');
        this.name = 'NfseTransporteError';
        this.detalle = detalle.slice(0, 500);
    }
}

export interface MensagemProcessamento {
    codigo: string;
    descricao?: string;
    complemento?: string;
}

export interface RespostaSefin {
    status: number;
    /** Cuerpo JSON, si lo hubo. */
    json: Record<string, any> | null;
}

export interface CredencialTls {
    certPem: string;
    keyPem: string;
}

export interface OpcoesChamada {
    timeoutMs?: number;
    /** Solo pruebas: otra URL base. */
    baseUrl?: string;
}

/** XML → GZip → base64 (el formato de los campos *XmlGZipB64). */
export function compactar(xml: string): string {
    return gzipSync(Buffer.from(xml, 'utf8')).toString('base64');
}

/** base64 → GZip → XML. Lanza NfseTransporteError si no se puede leer. */
export function descompactar(b64: unknown): string {
    if (typeof b64 !== 'string' || !b64) throw new NfseTransporteError('documento comprimido ausente');
    try {
        return gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
    } catch (error) {
        throw new NfseTransporteError(`documento comprimido ilegible: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Llamada a la Sefin con mTLS. Devuelve status + JSON (si lo hubo) o lanza
 * NfseTransporteError si no hubo respuesta HTTP.
 */
export function chamarSefin(entorno: EntornoRail, credencial: CredencialTls, metodo: 'GET' | 'POST' | 'HEAD', caminho: string, corpo?: Record<string, unknown>, opts: OpcoesChamada = {}): Promise<RespostaSefin> {
    const url = new URL(`${opts.baseUrl ?? SEFIN_URL[entorno]}${caminho}`);
    const payload = corpo ? Buffer.from(JSON.stringify(corpo), 'utf8') : null;
    return new Promise((resolve, reject) => {
        const req = request({
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || 443,
            path: `${url.pathname}${url.search}`,
            method: metodo,
            key: credencial.keyPem,
            cert: credencial.certPem,
            headers: {
                Accept: 'application/json',
                ...(payload ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(payload.length) } : {}),
            },
            timeout: opts.timeoutMs ?? 60_000,
        }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
                const status = res.statusCode ?? 0;
                const texto = Buffer.concat(chunks).toString('utf8');
                let json: Record<string, any> | null = null;
                if (texto.trim()) {
                    try { json = JSON.parse(texto); } catch { json = null; }
                }
                resolve({ status, json });
            });
            res.on('error', (error) => reject(new NfseTransporteError(`${metodo} ${caminho}: ${error.message}`)));
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', (error) => reject(new NfseTransporteError(`${metodo} ${caminho}: ${error.message}`)));
        if (payload) req.write(payload);
        req.end();
    });
}

/** Errores de un cuerpo de la Sefin (`erros[]` del POST o `erro` de ResponseErro). */
export function mensagens(json: Record<string, any> | null | undefined): MensagemProcessamento[] {
    if (!json || typeof json !== 'object') return [];
    const lista = Array.isArray(json.erros) ? json.erros : json.erro ? [json.erro] : [];
    return lista
        .filter((m: unknown) => m && typeof m === 'object')
        .map((m: Record<string, unknown>) => ({
            codigo: String(m.codigo ?? m.Codigo ?? '').trim(),
            ...(m.descricao || m.Descricao ? { descricao: String(m.descricao ?? m.Descricao).slice(0, 1000) } : {}),
            ...(m.complemento || m.Complemento ? { complemento: String(m.complemento ?? m.Complemento).slice(0, 1000) } : {}),
        }));
}

/** Alertas con las que la Sefin generó la NFS-e. */
export function alertas(json: Record<string, any> | null | undefined): MensagemProcessamento[] {
    return Array.isArray(json?.alertas) ? mensagens({ erros: json!.alertas }) : [];
}

/** ¿La respuesta vino del entorno configurado? tipoAmbiente: 1 producción, 2 homologación. */
export function ambienteCoincide(json: Record<string, any> | null | undefined, entorno: EntornoRail): boolean {
    const t = Number(json?.tipoAmbiente);
    if (!t) return true; // el contrato lo declara obligatorio, pero su ausencia no prueba otro entorno
    return entorno === 'produccion' ? t === 1 : t === 2;
}

/** Chave de acceso (50 posiciones) válida según TSIdNFSe: 9 dígitos + 14 (CNPJ, admite alfanumérico) + 27 dígitos. */
export function chaveValida(chave: unknown): chave is string {
    return typeof chave === 'string' && /^[0-9]{9}[0-9A-Z]{14}[0-9]{27}$/.test(chave);
}
