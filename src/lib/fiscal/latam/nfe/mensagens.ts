// Mensajes de los web services de la NF-e (lo que va dentro de nfeDadosMsg)
// y lectura de sus retornos. Mismo criterio que el armado de la nota: forma
// canónica de C14N escrita a mano, firma con ../nfse/xml.ts, y lectura por
// etiqueta (sin parser DOM ni DTD de por medio).
//
// Estructuras [XSD]: enviNFe / retEnviNFe / consReciNFe / retConsReciNFe
// (leiauteNFe), consSitNFe / retConsSitNFe (leiauteConsSitNFe), consStatServ
// / retConsStatServ, envEvento / retEnvEvento con los detEvento específicos
// de cancelación (e110111) y Carta de Correção (e110110), inutNFe /
// retInutNFe, y los "proc" que se archivan: nfeProc, procEventoNFe y
// procInutNFe [MOC 5.x].
//
// Puro: scripts/nfe-check.mjs lo valida contra los XSD.

// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { assinar, atributo, bloco, el, escAtributo, texto } from '../nfse/xml.ts';
import type { EntornoRail } from '../rieles.ts';
import { CCE_COND_USO, EVENTO_CANCELAMENTO, EVENTO_CCE, MODELO_NFE, NS_NFE, TIPO_AMBIENTE, VERSAO_EVENTO, VERSAO_NFE } from './constantes.ts';
import { textoNfe } from './nfe.ts';

// ── Lote de autorización ─────────────────────────────────────────────────────

/** Lote de UNA NF-e con respuesta síncrona (indSinc = 1) [NT2025.001: rechazo 452]. */
export function enviNFe(idLote: string, nfeAssinada: string): string {
    return `<enviNFe xmlns="${NS_NFE}" versao="${VERSAO_NFE}">${el('idLote', idLote)}${el('indSinc', '1')}${nfeAssinada}</enviNFe>`;
}

export function consReciNFe(entorno: EntornoRail, nRec: string): string {
    return `<consReciNFe xmlns="${NS_NFE}" versao="${VERSAO_NFE}">${el('tpAmb', TIPO_AMBIENTE[entorno])}${el('nRec', nRec)}</consReciNFe>`;
}

export function consSitNFe(entorno: EntornoRail, chave: string): string {
    return `<consSitNFe xmlns="${NS_NFE}" versao="${VERSAO_NFE}">${el('tpAmb', TIPO_AMBIENTE[entorno])}${el('xServ', 'CONSULTAR')}${el('chNFe', chave)}</consSitNFe>`;
}

export function consStatServ(entorno: EntornoRail, cUF: string): string {
    return `<consStatServ xmlns="${NS_NFE}" versao="${VERSAO_NFE}">${el('tpAmb', TIPO_AMBIENTE[entorno])}${el('cUF', cUF)}${el('xServ', 'STATUS')}</consStatServ>`;
}

/** idLote numérico de hasta 15 dígitos, derivado del instante (único por organización en la práctica). */
export function idLote(agora = Date.now()): string {
    return String(agora).slice(-13) + String(Math.floor(Math.random() * 100)).padStart(2, '0');
}

// ── Lectura ──────────────────────────────────────────────────────────────────

/** Elemento completo (`<tag …>…</tag>`) sin prefijos de namespace, o null. */
export function elementoCompleto(xml: string, tag: string): string | null {
    const m = new RegExp(`<(?:([\\w.-]+):)?${tag}(?=[\\s>/])[\\s\\S]*?</(?:[\\w.-]+:)?${tag}>`).exec(xml);
    if (!m) return null;
    let s = m[0];
    if (m[1]) {
        const p = m[1];
        s = s.replace(new RegExp(`<(/?)${p}:`, 'g'), '<$1').replace(new RegExp(`\\s+xmlns:${p}="[^"]*"`, 'g'), '');
    }
    return s;
}

export interface ProtNfe {
    chNFe: string;
    cStat: string;
    xMotivo: string;
    nProt: string;
    dhRecbto: string;
    digVal: string;
    tpAmb: string;
    /** El elemento protNFe tal como vino (para el nfeProc). */
    xml: string;
}

export function lerProtNfe(xml: string | null | undefined): ProtNfe | null {
    if (!xml) return null;
    const p = elementoCompleto(xml, 'protNFe');
    if (!p) return null;
    const inf = bloco(p, 'infProt') ?? '';
    return {
        chNFe: texto(inf, 'chNFe'),
        cStat: texto(inf, 'cStat'),
        xMotivo: texto(inf, 'xMotivo'),
        nProt: texto(inf, 'nProt'),
        dhRecbto: texto(inf, 'dhRecbto'),
        digVal: texto(inf, 'digVal'),
        tpAmb: texto(inf, 'tpAmb'),
        xml: p,
    };
}

export interface RetornoLote {
    cStat: string;
    xMotivo: string;
    tpAmb: string;
    nRec: string;
    prot: ProtNfe | null;
}

/** retEnviNFe o retConsReciNFe. */
export function lerRetornoLote(xml: string | null | undefined): RetornoLote | null {
    if (!xml) return null;
    const raiz = bloco(xml, 'retEnviNFe') ?? bloco(xml, 'retConsReciNFe');
    if (raiz === null) return null;
    // cStat del LOTE: el primero antes de protNFe.
    const cab = raiz.split(/<(?:[\w.-]+:)?protNFe[\s>]/)[0];
    return {
        cStat: texto(cab, 'cStat'),
        xMotivo: texto(cab, 'xMotivo'),
        tpAmb: texto(cab, 'tpAmb'),
        nRec: texto(cab, 'nRec'),
        prot: lerProtNfe(raiz),
    };
}

export interface RetornoConsulta {
    cStat: string;
    xMotivo: string;
    tpAmb: string;
    chNFe: string;
    prot: ProtNfe | null;
    /** Eventos registrados (procEventoNFe) que la SEFAZ devuelve con la nota. */
    eventos: { tpEvento: string; nSeqEvento: string; cStat: string; nProt: string }[];
}

export function lerRetConsSit(xml: string | null | undefined): RetornoConsulta | null {
    if (!xml) return null;
    const raiz = bloco(xml, 'retConsSitNFe');
    if (raiz === null) return null;
    const cab = raiz.split(/<(?:[\w.-]+:)?(?:protNFe|procEventoNFe)[\s>]/)[0];
    const eventos: RetornoConsulta['eventos'] = [];
    const re = /<(?:[\w.-]+:)?retEvento[\s>][\s\S]*?<\/(?:[\w.-]+:)?retEvento>/g;
    for (const m of raiz.matchAll(re)) {
        eventos.push({ tpEvento: texto(m[0], 'tpEvento'), nSeqEvento: texto(m[0], 'nSeqEvento'), cStat: texto(m[0], 'cStat'), nProt: texto(m[0], 'nProt') });
    }
    return { cStat: texto(cab, 'cStat'), xMotivo: texto(cab, 'xMotivo'), tpAmb: texto(cab, 'tpAmb'), chNFe: texto(cab, 'chNFe'), prot: lerProtNfe(raiz), eventos };
}

export function lerRetConsStatServ(xml: string | null | undefined): { cStat: string; xMotivo: string; tMed: string } | null {
    if (!xml) return null;
    const raiz = bloco(xml, 'retConsStatServ');
    if (raiz === null) return null;
    return { cStat: texto(raiz, 'cStat'), xMotivo: texto(raiz, 'xMotivo'), tMed: texto(raiz, 'tMed') };
}

/** Chave que la SEFAZ cita en un rechazo por duplicidad ([chNFe: …] de 539/562). */
export function chaveCitada(xMotivo: string): string | null {
    return /chNFe\s*:\s*([0-9]{6}[0-9A-Z]{12}[0-9]{26})/i.exec(xMotivo)?.[1] ?? null;
}

// ── Eventos (cancelación 110111, Carta de Correção 110110) ───────────────────

export interface PedidoEvento {
    id: string;
    cOrgao: string;
    tpAmb: 1 | 2;
    cnpj: string;
    chave: string;
    dhEvento: string;
    tpEvento: string;
    nSeqEvento: number;
    descEvento: string;
    /** Cancelación: protocolo de la nota y justificación. */
    nProt?: string;
    xJust?: string;
    /** CC-e: texto de la corrección. */
    xCorrecao?: string;
}

/** Id del evento [XSD leiauteEvento: "ID" + tpEvento + chave + nSeqEvento (2)]. */
export const idEvento = (tpEvento: string, chave: string, nSeq: number) => `ID${tpEvento}${chave}${String(nSeq).padStart(2, '0')}`;

export function pedidoCancelamento(p: { entorno: EntornoRail; cUF: string; cnpj: string; chave: string; nProt: string; xJust: string; dhEvento: string }): PedidoEvento {
    const xJust = textoNfe(p.xJust, 255);
    if (xJust.length < 15) throw new Error('nfe: justificación de cancelación con menos de 15 caracteres');
    return {
        id: idEvento(EVENTO_CANCELAMENTO.tpEvento, p.chave, EVENTO_CANCELAMENTO.nSeq),
        cOrgao: p.cUF, tpAmb: TIPO_AMBIENTE[p.entorno], cnpj: p.cnpj, chave: p.chave, dhEvento: p.dhEvento,
        tpEvento: EVENTO_CANCELAMENTO.tpEvento, nSeqEvento: EVENTO_CANCELAMENTO.nSeq, descEvento: EVENTO_CANCELAMENTO.descEvento,
        nProt: p.nProt, xJust,
    };
}

export function pedidoCce(p: { entorno: EntornoRail; cUF: string; cnpj: string; chave: string; nSeq: number; xCorrecao: string; dhEvento: string }): PedidoEvento {
    const xCorrecao = textoNfe(p.xCorrecao, 1000);
    if (xCorrecao.length < 15) throw new Error('nfe: corrección con menos de 15 caracteres');
    if (!Number.isInteger(p.nSeq) || p.nSeq < 1 || p.nSeq > EVENTO_CCE.nSeqMax) throw new Error('nfe: secuencia de CC-e fuera de rango');
    return {
        id: idEvento(EVENTO_CCE.tpEvento, p.chave, p.nSeq),
        cOrgao: p.cUF, tpAmb: TIPO_AMBIENTE[p.entorno], cnpj: p.cnpj, chave: p.chave, dhEvento: p.dhEvento,
        tpEvento: EVENTO_CCE.tpEvento, nSeqEvento: p.nSeq, descEvento: EVENTO_CCE.descEvento, xCorrecao,
    };
}

/** El evento sin firma, en el orden de TEvento. */
export function xmlEvento(p: PedidoEvento): string {
    const det = p.tpEvento === EVENTO_CANCELAMENTO.tpEvento
        ? `<detEvento versao="${VERSAO_EVENTO}">${el('descEvento', p.descEvento)}${el('nProt', p.nProt)}${el('xJust', p.xJust)}</detEvento>`
        : `<detEvento versao="${VERSAO_EVENTO}">${el('descEvento', p.descEvento)}${el('xCorrecao', p.xCorrecao)}${el('xCondUso', CCE_COND_USO)}</detEvento>`;
    return `<evento xmlns="${NS_NFE}" versao="${VERSAO_EVENTO}">`
        + `<infEvento Id="${escAtributo(p.id)}">`
        + el('cOrgao', p.cOrgao) + el('tpAmb', p.tpAmb) + el('CNPJ', p.cnpj) + el('chNFe', p.chave) + el('dhEvento', p.dhEvento)
        + el('tpEvento', p.tpEvento) + el('nSeqEvento', p.nSeqEvento) + el('verEvento', VERSAO_EVENTO) + det
        + '</infEvento></evento>';
}

export function eventoAssinado(p: PedidoEvento, certPem: string, keyPem: string): string {
    return assinar(xmlEvento(p), { raiz: 'evento', tag: 'infEvento', id: p.id, ns: NS_NFE, certPem, keyPem });
}

export function envEvento(idLoteEvento: string, eventoAssinadoXml: string): string {
    return `<envEvento xmlns="${NS_NFE}" versao="${VERSAO_EVENTO}">${el('idLote', idLoteEvento)}${eventoAssinadoXml}</envEvento>`;
}

export interface RetornoEvento {
    /** cStat del lote (128 = processado). */
    cStatLote: string;
    xMotivoLote: string;
    cStat: string;
    xMotivo: string;
    nProt: string;
    dhRegEvento: string;
    tpAmb: string;
    /** El retEvento tal como vino (para el procEventoNFe). */
    xml: string | null;
}

export function lerRetEnvEvento(xml: string | null | undefined): RetornoEvento | null {
    if (!xml) return null;
    const raiz = bloco(xml, 'retEnvEvento');
    if (raiz === null) return null;
    const cab = raiz.split(/<(?:[\w.-]+:)?retEvento[\s>]/)[0];
    const ret = elementoCompleto(raiz, 'retEvento');
    const inf = ret ? (bloco(ret, 'infEvento') ?? '') : '';
    return {
        cStatLote: texto(cab, 'cStat'),
        xMotivoLote: texto(cab, 'xMotivo'),
        cStat: texto(inf, 'cStat'),
        xMotivo: texto(inf, 'xMotivo'),
        nProt: texto(inf, 'nProt'),
        dhRegEvento: texto(inf, 'dhRegEvento'),
        tpAmb: texto(inf, 'tpAmb'),
        xml: ret,
    };
}

// ── Inutilização ─────────────────────────────────────────────────────────────

export interface PedidoInutilizacao {
    id: string;
    tpAmb: 1 | 2;
    cUF: string;
    ano: string;
    cnpj: string;
    serie: number;
    nNFIni: number;
    nNFFin: number;
    xJust: string;
}

/** Id [XSD leiauteInutNFe: "ID" + cUF + ano + CNPJ + modelo + serie (3) + nNFIni (9) + nNFFin (9)]. */
export function pedidoInutilizacao(p: { entorno: EntornoRail; cUF: string; ano: string; cnpj: string; serie: number; nNFIni: number; nNFFin: number; xJust: string }): PedidoInutilizacao {
    const xJust = textoNfe(p.xJust, 255);
    if (xJust.length < 15) throw new Error('nfe: justificación de inutilização con menos de 15 caracteres');
    const id = `ID${p.cUF}${p.ano}${p.cnpj.padStart(14, '0')}${MODELO_NFE}${String(p.serie).padStart(3, '0')}${String(p.nNFIni).padStart(9, '0')}${String(p.nNFFin).padStart(9, '0')}`;
    return { id, tpAmb: TIPO_AMBIENTE[p.entorno], cUF: p.cUF, ano: p.ano, cnpj: p.cnpj, serie: p.serie, nNFIni: p.nNFIni, nNFFin: p.nNFFin, xJust };
}

export function xmlInutilizacao(p: PedidoInutilizacao): string {
    return `<inutNFe xmlns="${NS_NFE}" versao="${VERSAO_NFE}">`
        + `<infInut Id="${escAtributo(p.id)}">`
        + el('tpAmb', p.tpAmb) + el('xServ', 'INUTILIZAR') + el('cUF', p.cUF) + el('ano', p.ano) + el('CNPJ', p.cnpj)
        + el('mod', MODELO_NFE) + el('serie', p.serie) + el('nNFIni', p.nNFIni) + el('nNFFin', p.nNFFin) + el('xJust', p.xJust)
        + '</infInut></inutNFe>';
}

export function inutilizacaoAssinada(p: PedidoInutilizacao, certPem: string, keyPem: string): string {
    return assinar(xmlInutilizacao(p), { raiz: 'inutNFe', tag: 'infInut', id: p.id, ns: NS_NFE, certPem, keyPem });
}

export function lerRetInut(xml: string | null | undefined): { cStat: string; xMotivo: string; nProt: string; dhRecbto: string; tpAmb: string; xml: string | null } | null {
    if (!xml) return null;
    const ret = elementoCompleto(xml, 'retInutNFe');
    if (!ret) return null;
    const inf = bloco(ret, 'infInut') ?? '';
    return { cStat: texto(inf, 'cStat'), xMotivo: texto(inf, 'xMotivo'), nProt: texto(inf, 'nProt'), dhRecbto: texto(inf, 'dhRecbto'), tpAmb: texto(inf, 'tpAmb'), xml: ret };
}

// ── Documentos que se archivan ───────────────────────────────────────────────

const DECLARACAO = '<?xml version="1.0" encoding="UTF-8"?>';

/** nfeProc: la NF-e firmada + el protocolo de autorización [MOC 5.4, XSD TNfeProc]. */
export function nfeProc(nfeAssinada: string, protNFeXml: string): string {
    return `${DECLARACAO}<nfeProc xmlns="${NS_NFE}" versao="${VERSAO_NFE}">${nfeAssinada}${protNFeXml}</nfeProc>`;
}

/** procEventoNFe: el evento firmado + su retorno [XSD TProcEvento]. */
export function procEvento(eventoAssinadoXml: string, retEventoXml: string): string {
    return `${DECLARACAO}<procEventoNFe xmlns="${NS_NFE}" versao="${VERSAO_EVENTO}">${eventoAssinadoXml}${retEventoXml}</procEventoNFe>`;
}

/** procInutNFe: el pedido firmado + su retorno [XSD TProcInutNFe]. */
export function procInut(inutAssinadaXml: string, retInutXml: string): string {
    return `${DECLARACAO}<ProcInutNFe xmlns="${NS_NFE}" versao="${VERSAO_NFE}">${inutAssinadaXml}${retInutXml}</ProcInutNFe>`;
}

/** Versión del retorno, por si un autorizador respondiera con otra (solo para el log). */
export const versaoDe = (xml: string, tag: string) => atributo(xml, tag, 'versao');
