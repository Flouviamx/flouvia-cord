// DANFE (Documento Auxiliar da NF-e) en PDF, A4 retrato, y la representación
// impresa que el riel guarda al autorizar.
//
// Fuente: MOC 7.0 Anexo II (Manual de Especificações Técnicas do DANFE e
// Código de Barras): campos (§3.1), tamaños mínimos de fuente (§3.7, Times),
// posiciones del modelo A-4 retrato en folhas soltas (§3.8.1), campos de
// contenido variable de la emisión normal y SVC (§3.9.1), folhas adicionales
// (§3.5) y código de barras CODE-128 de la chave (§2, code128.ts). Con la
// Reforma Tributaria, NT 2026.010: el bloque de totales "TOTAL DO IBS/CBS/IS"
// a continuación del de ICMS/IPI (§4.1), el CRT en el bloque del emisor
// (§4.2) y la clasificación, base, alícuotas y valores del IBS/CBS por ítem
// (§4.3), que aquí van en una línea adicional bajo cada producto (§3.2 admite
// líneas adicionales por ítem con destaque divisorio). Sin QR: en el modelo 55
// todavía no hay regla publicada (NT 2026.010 §4.5).
//
// Supresiones permitidas que se aplican [§3.3]: el cuadro Fatura/Duplicatas
// (Cord no informa el grupo cobr) y el de Cálculo do ISSQN (venta de
// mercancías); su altura pasa al cuadro de productos. Las columnas de ICMS-ST
// se suprimen (no se informan) [§3.1.7].
//
// Lo que se imprime sale SOLO de la NF-e autorizada (solicitud + protocolo):
// el Anexo II §3.1 prohíbe imprimir lo que no está en el XML.

import { PdfDocument, measureText, wrapText, truncateText, type FontKey } from '../../../pdf/writer';
import type { RepresentacionImpresa } from '../representacion';
import { chaveEmBlocos } from './chave';
import { code128 } from './code128';
import { CRT, LEYENDA_CONSULTA, LEYENDA_SEM_VALOR, MOD_FRETE } from './constantes';
import type { ProtNfe } from './mensagens';
import type { SolicitudNfe } from './nfe';

export interface DanfeItem {
    cProd: string; xProd: string; NCM: string; cst: string; CFOP: string; uCom: string; qCom: string; vUnCom: string;
    vDesc: string; vProd: string; vBC: string; vICMS: string; vIPI: string; pICMS: string; pIPI: string;
    /** Líneas adicionales del ítem (IBS/CBS, FCP). */
    extra: string[];
}

export interface DanfeDatos {
    chave: string;
    nNF: number;
    serie: number;
    natOp: string;
    nProt: string;
    dhRecbto: string;
    dhEmi: string;
    homologacao: boolean;
    contingencia?: { tipo: string; dhCont: string; xJust: string };
    emit: { xNome: string; endereco: string[]; IE: string; CNPJ: string; CRT: string; IM?: string };
    dest: { xNome: string; doc: string; endereco: string; bairro: string; cep: string; municipio: string; uf: string; fone: string; IE: string };
    totais: { vBC: string; vICMS: string; vProd: string; vDesc: string; vIPI: string; vNF: string; ibscbs?: { vCBS: string; vIBSUF: string; vIBSMun: string } };
    modFrete: string;
    itens: DanfeItem[];
    infCpl: string[];
}

// ── Formato ──────────────────────────────────────────────────────────────────

const br = (v: string | number, casas = 2) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(Number(v) || 0);
const brVar = (v: string) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 10 }).format(Number(v) || 0);
const brQtd = (v: string) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(Number(v) || 0);
/** "2026-10-09T12:00:00-03:00" → "09/10/2026" y "12:00:00" (la hora local que viaja en el XML). */
const data = (dh: string) => (/^(\d{4})-(\d{2})-(\d{2})/.exec(dh) ?? []).slice(1).reverse().join('/');
const hora = (dh: string) => /T(\d{2}:\d{2}:\d{2})/.exec(dh)?.[1] ?? '';
const cnpjFmt = (c: string) => (c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);
const cpfFmt = (c: string) => (c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c);
const cepFmt = (c?: string) => (c && c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5)}` : c ?? '');
const numeroNf = (n: number) => String(n).padStart(9, '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3');

/** Datos del DANFE de una NF-e autorizada. */
export function danfeDe(sol: SolicitudNfe, prot: Pick<ProtNfe, 'nProt' | 'dhRecbto'>, homologacao: boolean): DanfeDatos {
    const e = sol.emit;
    const en = e.ender;
    const d = sol.dest;
    const crt = CRT.find((c) => c.id === e.CRT);
    const infCpl: string[] = [];
    if (homologacao) infCpl.push(`${LEYENDA_SEM_VALOR}. NF-e emitida em ambiente de homologação.`);
    if (sol.tpEmis !== '1' && sol.dhCont && sol.xJust) {
        infCpl.push(`EMITIDA EM CONTINGÊNCIA ${sol.tpEmis === '6' ? 'SVC-AN' : 'SVC-RS'} desde ${data(sol.dhCont)} ${hora(sol.dhCont)}. Motivo: ${sol.xJust}`);
    }
    if (sol.total.vFCP && Number(sol.total.vFCP) > 0) infCpl.push(`Valor total do FCP: R$ ${br(sol.total.vFCP)}`);
    if (sol.infCpl) infCpl.push(sol.infCpl);
    return {
        chave: sol.chave!,
        nNF: sol.nNF!,
        serie: sol.serie,
        natOp: sol.natOp,
        nProt: prot.nProt,
        dhRecbto: prot.dhRecbto,
        dhEmi: sol.dhEmi,
        homologacao,
        ...(sol.tpEmis !== '1' && sol.dhCont ? { contingencia: { tipo: sol.tpEmis === '6' ? 'SVC-AN' : 'SVC-RS', dhCont: sol.dhCont, xJust: sol.xJust ?? '' } } : {}),
        emit: {
            xNome: e.xNome,
            endereco: [
                `${en.xLgr}, ${en.nro}${en.xCpl ? ` - ${en.xCpl}` : ''}`,
                `${en.xBairro} - ${en.xMun}/${en.UF} - CEP ${cepFmt(en.CEP)}`,
                ...(en.fone ? [`Fone: ${en.fone}`] : []),
            ],
            IE: e.IE,
            CNPJ: cnpjFmt(e.CNPJ),
            CRT: `${e.CRT} - ${crt?.es === 'Régimen Normal' ? 'Regime Normal' : crt?.es ?? ''}`,
            ...(e.IM ? { IM: e.IM } : {}),
        },
        dest: {
            xNome: d.xNome,
            doc: d.tipo === 'CNPJ' ? cnpjFmt(d.numero) : cpfFmt(d.numero),
            endereco: `${d.ender.xLgr}, ${d.ender.nro}${d.ender.xCpl ? ` - ${d.ender.xCpl}` : ''}`,
            bairro: d.ender.xBairro,
            cep: cepFmt(d.ender.CEP),
            municipio: d.ender.xMun,
            uf: d.ender.UF,
            fone: d.ender.fone ?? '',
            IE: d.IE ?? '',
        },
        totais: {
            vBC: sol.total.vBC, vICMS: sol.total.vICMS, vProd: sol.total.vProd, vDesc: sol.total.vDesc, vIPI: sol.total.vIPI, vNF: sol.total.vNF,
            ...(sol.total.ibscbs ? { ibscbs: { vCBS: sol.total.ibscbs.vCBS, vIBSUF: sol.total.ibscbs.vIBSUF, vIBSMun: sol.total.ibscbs.vIBSMun } } : {}),
        },
        modFrete: sol.modFrete,
        itens: sol.itens.map((i) => {
            const icms = i.icms;
            const cst = icms.grupo === 'ICMS00' ? `${icms.orig}${icms.CST}` : `${icms.orig}${icms.CSOSN}`;
            const extra: string[] = [];
            if (i.prod.cEAN && i.prod.cEAN !== 'SEM GTIN') extra.push(`GTIN ${i.prod.cEAN}`);
            if (i.prod.CEST) extra.push(`CEST ${i.prod.CEST}`);
            if (icms.grupo === 'ICMS00' && icms.vFCP) extra.push(`pFCP ${br(icms.pFCP!)}% vFCP ${br(icms.vFCP)}`);
            if (icms.grupo === 'ICMSSN101') extra.push(`Crédito ICMS (Simples) ${br(icms.pCredSN)}%: R$ ${br(icms.vCredICMSSN)}`);
            if (i.ibscbs) {
                const b = i.ibscbs;
                extra.push(`IBS/CBS cClassTrib ${b.cClassTrib} BC ${br(b.vBC)} | IBS UF ${br(b.pIBSUF)}% ${br(b.vIBSUF)} | IBS Mun ${br(b.pIBSMun)}% ${br(b.vIBSMun)} | CBS ${br(b.pCBS)}% ${br(b.vCBS)}`);
            }
            return {
                cProd: i.prod.cProd, xProd: i.prod.xProd, NCM: i.prod.NCM, cst, CFOP: i.prod.CFOP, uCom: i.prod.uCom,
                qCom: i.prod.qCom, vUnCom: i.prod.vUnCom, vDesc: i.prod.vDesc ?? '0', vProd: i.prod.vProd,
                vBC: icms.grupo === 'ICMS00' ? icms.vBC : '0', vICMS: icms.grupo === 'ICMS00' ? icms.vICMS : '0',
                vIPI: i.ipi?.vIPI ?? '0', pICMS: icms.grupo === 'ICMS00' ? icms.pICMS : '0', pIPI: i.ipi?.pIPI ?? '0',
                extra,
            };
        }),
        infCpl,
    };
}

/** Representación impresa: los datos del DANFE más lo que muestran la vista y el link. */
export function representacaoNfe(sol: SolicitudNfe, prot: Pick<ProtNfe, 'nProt' | 'dhRecbto'>, homologacao: boolean): RepresentacionImpresa {
    const danfe = danfeDe(sol, prot, homologacao);
    return {
        rail: 'nfe',
        titulo: 'DANFE',
        filas: [
            { k: 'Chave de acesso', v: chaveEmBlocos(sol.chave!) },
            { k: 'NF-e', v: `Nº ${numeroNf(sol.nNF!)} - Série ${sol.serie}` },
            { k: 'Protocolo de autorização', v: `${prot.nProt} ${data(prot.dhRecbto)} ${hora(prot.dhRecbto)}` },
        ],
        leyendas: [LEYENDA_CONSULTA],
        pie: homologacao ? `${LEYENDA_SEM_VALOR}. Documento auxiliar de NF-e emitida em ambiente de homologação.` : 'Documento Auxiliar da Nota Fiscal Eletrônica.',
        ...(homologacao ? { prueba: true } : {}),
        danfe,
    };
}

// ── PDF ──────────────────────────────────────────────────────────────────────

const CM = 28.3465;
const c = (v: number) => v * CM;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
/** Desplazamiento horizontal: las posiciones del Anexo II dejan 0,25 cm a la izquierda; se centra el cuerpo. */
const OX = c(0.04);
const LARGO = 20.57;
const GRIS: [number, number, number] = [70, 70, 70];

type Doc = PdfDocument;

function caja(doc: Doc, x: number, y: number, w: number, h: number): void {
    doc.rect(OX + c(x), c(y), c(w), c(h), { stroke: [0, 0, 0], lineWidth: 0.6 });
}

function rotulo(doc: Doc, s: string, x: number, y: number): void {
    doc.text(s.toUpperCase(), OX + c(x) + 2, c(y) + 6, { size: 5, font: 'bold', color: GRIS });
}

/** Campo con rótulo (5 pt) y contenido (por defecto 8 pt; la norma pide 10 en "demais campos" si cabe). */
function campo(doc: Doc, r: string, v: string, x: number, y: number, w: number, h = 0.85, o: { size?: number; font?: FontKey; align?: 'left' | 'right' | 'center' } = {}): void {
    caja(doc, x, y, w, h);
    rotulo(doc, r, x, y);
    const size = o.size ?? 9;
    const font = o.font ?? 'regular';
    let s = size;
    while (s > 6 && measureText(v, s, font, 'serif') > c(w) - 4) s -= 0.5;
    const texto = truncateText(v, c(w) - 4, s, font, 'serif');
    doc.text(texto, OX + c(x) + 2, c(y + h) - 4, { size: s, font, align: o.align ?? 'left', width: c(w) - 4 });
}

function bloco(doc: Doc, titulo: string, y: number): void {
    doc.text(titulo.toUpperCase(), OX + c(0.25), c(y) + 9, { size: 6, font: 'bold' });
}

function codigoDeBarras(doc: Doc, texto: string, x: number, y: number, w: number, h: number): void {
    const b = code128(texto);
    // Zona de silencio de 10 módulos a cada lado [Anexo II §2].
    const modulo = c(w) / (b.modulos + 20);
    let cx = OX + c(x) + modulo * 10;
    b.anchos.forEach((largo, k) => {
        if (k % 2 === 0) doc.rect(cx, c(y), largo * modulo, c(h), { fill: [0, 0, 0] });
        cx += largo * modulo;
    });
}

/** Cabecera de identificación (primera folha y adicionales) [§3.5]. Devuelve el borde inferior en cm. */
function cabecera(doc: Doc, d: DanfeDatos, y0: number, folha: number, folhas: number): number {
    // Emisor.
    caja(doc, 0.25, y0, 10.0, 3.92);
    rotulo(doc, 'Identificação do emitente', 0.25, y0);
    let ty = c(y0) + 22;
    for (const l of wrapText(d.emit.xNome, c(9.6), 12, 'bold', 'serif').slice(0, 2)) {
        doc.text(l, OX + c(0.45), ty, { size: 12, font: 'bold' });
        ty += 13;
    }
    for (const l of d.emit.endereco) {
        for (const w of wrapText(l, c(9.6), 8, 'bold', 'serif').slice(0, 2)) {
            doc.text(w, OX + c(0.45), ty + 2, { size: 8, font: 'bold' });
            ty += 10;
        }
    }
    doc.text(`CRT: ${d.emit.CRT}`, OX + c(0.45), Math.min(ty + 4, c(y0 + 3.92) - 6), { size: 7, font: 'bold' });

    // Bloco DANFE [§3.7.4].
    caja(doc, 10.25, y0, 2.54, 3.92);
    const bx = OX + c(10.25);
    const bw = c(2.54);
    doc.text('DANFE', bx, c(y0) + 16, { size: 13, font: 'bold', align: 'center', width: bw });
    doc.text('DOCUMENTO AUXILIAR', bx, c(y0) + 26, { size: 7, align: 'center', width: bw });
    doc.text('DA NOTA FISCAL', bx, c(y0) + 34, { size: 7, align: 'center', width: bw });
    doc.text('ELETRÔNICA', bx, c(y0) + 42, { size: 7, align: 'center', width: bw });
    doc.text('0 - ENTRADA', bx + 4, c(y0) + 56, { size: 8 });
    doc.text('1 - SAÍDA', bx + 4, c(y0) + 65, { size: 8 });
    doc.rect(bx + bw - 17, c(y0) + 50, 13, 16, { stroke: [0, 0, 0], lineWidth: 0.6 });
    doc.text('1', bx + bw - 17, c(y0) + 62, { size: 11, font: 'bold', align: 'center', width: 13 });
    doc.text(`Nº ${numeroNf(d.nNF)}`, bx, c(y0) + 82, { size: 10, font: 'bold', align: 'center', width: bw });
    doc.text(`SÉRIE ${String(d.serie).padStart(3, '0')}`, bx, c(y0) + 93, { size: 10, font: 'bold', align: 'center', width: bw });
    doc.text(`FOLHA ${folha}/${folhas}`, bx, c(y0) + 104, { size: 10, font: 'bold', align: 'center', width: bw });

    // Código de barras de la chave y la chave en bloques [§3.1.1].
    caja(doc, 12.79, y0, 8.03, 1.48);
    codigoDeBarras(doc, d.chave, 12.79, y0 + 0.24, 8.03, 1.0);
    campo(doc, 'Chave de acesso', chaveEmBlocos(d.chave), 12.79, y0 + 1.48, 8.03, 0.85, { size: 8, font: 'bold', align: 'center' });
    // Campo 1 de contenido variable [§3.9.1].
    caja(doc, 12.79, y0 + 2.33, 8.03, 1.59);
    const consulta = wrapText(LEYENDA_CONSULTA, c(7.8), 8, 'regular', 'serif');
    consulta.forEach((l, k) => doc.text(l, OX + c(12.79), c(y0 + 2.33) + 16 + k * 10, { size: 8, align: 'center', width: c(8.03) }));

    // Natureza y protocolo (campo 2) [§3.9.1].
    const y1 = y0 + 3.92;
    campo(doc, 'Natureza da operação', d.natOp, 0.25, y1, 12.54);
    campo(doc, 'Protocolo de autorização de uso', `${d.nProt} ${data(d.dhRecbto)} ${hora(d.dhRecbto)}`, 12.79, y1, 8.03, 0.85, { font: 'bold', align: 'center' });
    const y2 = y1 + 0.85;
    campo(doc, 'Inscrição estadual', d.emit.IE, 0.25, y2, 6.86);
    campo(doc, 'Inscrição estadual do subst. trib.', '', 7.11, y2, 6.86);
    campo(doc, 'CNPJ', d.emit.CNPJ, 13.97, y2, 6.85);
    return y2 + 0.85;
}

interface Coluna { r: string; w: number; v: (i: DanfeItem) => string; align?: 'left' | 'right' | 'center' }

const COLUNAS: Coluna[] = [
    { r: 'Código', w: 1.6, v: (i) => i.cProd },
    { r: 'Descrição do produto / serviço', w: 5.0, v: (i) => i.xProd },
    { r: 'NCM/SH', w: 1.3, v: (i) => i.NCM, align: 'center' },
    { r: 'CST', w: 0.75, v: (i) => i.cst, align: 'center' },
    { r: 'CFOP', w: 0.75, v: (i) => i.CFOP, align: 'center' },
    { r: 'Un', w: 0.75, v: (i) => i.uCom, align: 'center' },
    { r: 'Quant.', w: 1.2, v: (i) => brQtd(i.qCom), align: 'right' },
    { r: 'Valor unit.', w: 1.5, v: (i) => brVar(i.vUnCom), align: 'right' },
    { r: 'Desconto', w: 1.2, v: (i) => br(i.vDesc), align: 'right' },
    { r: 'Valor total', w: 1.5, v: (i) => br(i.vProd), align: 'right' },
    { r: 'B.cálc. ICMS', w: 1.4, v: (i) => br(i.vBC), align: 'right' },
    { r: 'Valor ICMS', w: 1.2, v: (i) => br(i.vICMS), align: 'right' },
    { r: 'Valor IPI', w: 1.12, v: (i) => br(i.vIPI), align: 'right' },
    { r: 'Alíq. ICMS', w: 0.65, v: (i) => br(i.pICMS), align: 'right' },
    { r: 'Alíq. IPI', w: 0.65, v: (i) => br(i.pIPI), align: 'right' },
];

const LINHA = 8; // pt por línea de ítem (6 pt de contenido)

function alturaItem(i: DanfeItem): number {
    const desc = wrapText(i.xProd, c(5.0) - 4, 6, 'regular', 'serif').length;
    const extra = i.extra.reduce((n, e) => n + wrapText(e, c(LARGO) - c(1.6) - 4, 5.5, 'regular', 'serif').length, 0);
    return (Math.max(1, desc) + extra) * LINHA + 4;
}

/** Cabecera de la tabla de productos; devuelve el top (pt) donde empiezan las filas. */
function cabeceraProdutos(doc: Doc, yCm: number): number {
    bloco(doc, 'Dados dos produtos / serviços', yCm);
    const top = c(yCm + 0.42);
    let x = 0.25;
    for (const col of COLUNAS) {
        caja(doc, x, yCm + 0.42, col.w, 0.6);
        const ls = wrapText(col.r.toUpperCase(), c(col.w) - 2, 5, 'bold', 'serif').slice(0, 2);
        ls.forEach((l, k) => doc.text(l, OX + c(x) + 1, top + 7 + k * 6, { size: 5, font: 'bold', align: 'center', width: c(col.w) - 2 }));
        x += col.w;
    }
    return top + c(0.6);
}

function filaItem(doc: Doc, i: DanfeItem, top: number): number {
    const h = alturaItem(i);
    let x = 0.25;
    for (const col of COLUNAS) {
        const v = col.v(i);
        if (col.r.startsWith('Descrição')) {
            wrapText(v, c(col.w) - 4, 6, 'regular', 'serif').forEach((l, k) => doc.text(l, OX + c(x) + 2, top + 8 + k * LINHA, { size: 6 }));
        } else {
            doc.text(truncateText(v, c(col.w) - 3, 6, 'regular', 'serif'), OX + c(x) + 1.5, top + 8, { size: 6, align: col.align ?? 'left', width: c(col.w) - 3 });
        }
        x += col.w;
    }
    const descLinhas = Math.max(1, wrapText(i.xProd, c(5.0) - 4, 6, 'regular', 'serif').length);
    let ty = top + 8 + descLinhas * LINHA;
    for (const e of i.extra) {
        for (const l of wrapText(e, c(LARGO) - c(1.6) - 4, 5.5, 'regular', 'serif')) {
            doc.text(l, OX + c(1.85) + 2, ty, { size: 5.5, color: GRIS });
            ty += LINHA;
        }
    }
    // Destaque divisorio entre ítems [§3.1.7]: línea punteada.
    for (let px = OX + c(0.25); px < OX + c(0.25 + LARGO); px += 4) doc.line(px, top + h, Math.min(px + 2, OX + c(0.25 + LARGO)), top + h, { width: 0.3, color: [140, 140, 140] });
    return top + h;
}

/** Arma el PDF del DANFE. */
export function createDanfePdf(d: DanfeDatos): Buffer {
    const doc = new PdfDocument({ width: PAGE_W, height: PAGE_H, fontFamily: 'serif' });
    // La marca de agua va primero: el contenido se dibuja encima.
    if (d.homologacao) marcaDagua(doc);

    // ── Primera folha ──
    // Canhoto [§3.8.1].
    caja(doc, 0.25, 0.42, 16.1, 0.85);
    doc.text(truncateText(`RECEBEMOS DE ${d.emit.xNome.toUpperCase()} OS PRODUTOS/SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO`, c(15.9), 6, 'regular', 'serif'),
        OX + c(0.35), c(0.42) + 10, { size: 6 });
    doc.text(`EMISSÃO: ${data(d.dhEmi)} - DESTINATÁRIO: ${d.dest.xNome} - VALOR TOTAL: R$ ${br(d.totais.vNF)}`.slice(0, 160), OX + c(0.35), c(0.42) + 19, { size: 6 });
    caja(doc, 16.35, 0.42, 4.47, 1.7);
    doc.text('NF-e', OX + c(16.35), c(0.42) + 14, { size: 12, font: 'bold', align: 'center', width: c(4.47) });
    doc.text(`Nº ${numeroNf(d.nNF)}`, OX + c(16.35), c(0.42) + 28, { size: 10, font: 'bold', align: 'center', width: c(4.47) });
    doc.text(`SÉRIE ${String(d.serie).padStart(3, '0')}`, OX + c(16.35), c(0.42) + 40, { size: 10, font: 'bold', align: 'center', width: c(4.47) });
    campo(doc, 'Data de recebimento', '', 0.25, 1.27, 4.1);
    campo(doc, 'Identificação e assinatura do recebedor', '', 4.35, 1.27, 12.0);
    for (let px = OX + c(0.25); px < OX + c(20.82); px += 6) doc.line(px, c(2.33), px + 3, c(2.33), { width: 0.4 });

    // Paginación: se calcula antes, para imprimir "FOLHA n/total".
    const rodapeCm = 0.42 + 3.07 + 0.3; // dados adicionais
    const yProdutos1 = (() => {
        let y = 2.54 + 3.92 + 0.85 + 0.85; // cabecera
        y += 0.42 + 0.85 * 3;               // destinatário
        y += 0.42 + 0.85 * 2;               // cálculo do imposto
        if (d.totais.ibscbs) y += 0.42 + 0.85;
        y += 0.42 + 0.85;                   // transportador
        return y;
    })();
    const fimFolha1 = c(29.7 - rodapeCm) - 4;
    const topProd1 = c(yProdutos1 + 0.42 + 0.6);
    const yCabAdicional = 0.42 + 3.92 + 0.85 + 0.85;
    const topProdN = c(yCabAdicional + 0.42 + 0.6);
    const fimFolhaN = c(29.4) - 4;
    const paginas: DanfeItem[][] = [[]];
    let cursor = topProd1;
    let limite = fimFolha1;
    for (const i of d.itens) {
        const h = alturaItem(i);
        if (cursor + h > limite && paginas[paginas.length - 1].length) {
            paginas.push([]);
            cursor = topProdN;
            limite = fimFolhaN;
        }
        paginas[paginas.length - 1].push(i);
        cursor += h;
    }
    // La información complementaria que no cabe sigue en folhas adicionales [§3.1.8].
    const infLinhas = d.infCpl.flatMap((p) => wrapText(p, c(12.7), 7, 'regular', 'serif'));
    const cabemInf = Math.floor((c(3.07) - 12) / 8.5);
    const sobra = infLinhas.slice(cabemInf);
    const folhasInf = sobra.length ? Math.ceil(sobra.length / Math.floor((fimFolhaN - topProdN) / 8.5)) : 0;
    const total = paginas.length + folhasInf;

    let y = cabecera(doc, d, 2.54, 1, total);
    // Destinatário/remetente.
    bloco(doc, 'Destinatário / remetente', y);
    y += 0.42;
    campo(doc, 'Nome / razão social', d.dest.xNome, 0.25, y, 12.32);
    campo(doc, 'CNPJ / CPF', d.dest.doc, 12.57, y, 5.33, 0.85, { font: 'bold' });
    campo(doc, 'Data da emissão', data(d.dhEmi), 17.9, y, 2.92);
    y += 0.85;
    campo(doc, 'Endereço', d.dest.endereco, 0.25, y, 10.16);
    campo(doc, 'Bairro / distrito', d.dest.bairro, 10.41, y, 4.83);
    campo(doc, 'CEP', d.dest.cep, 15.24, y, 2.66);
    campo(doc, 'Data da saída/entrada', '', 17.9, y, 2.92);
    y += 0.85;
    campo(doc, 'Município', d.dest.municipio, 0.25, y, 7.11);
    campo(doc, 'Fone / fax', d.dest.fone, 7.36, y, 4.06);
    campo(doc, 'UF', d.dest.uf, 11.42, y, 1.14, 0.85, { align: 'center' });
    campo(doc, 'Inscrição estadual', d.dest.IE, 12.56, y, 5.34);
    campo(doc, 'Hora da saída/entrada', '', 17.9, y, 2.92);
    y += 0.85;
    // Cálculo do imposto [§3.8.1].
    bloco(doc, 'Cálculo do imposto', y);
    y += 0.42;
    const t = d.totais;
    campo(doc, 'Base de cálc. do ICMS', br(t.vBC), 0.25, y, 4.06, 0.85, { align: 'right' });
    campo(doc, 'Valor do ICMS', br(t.vICMS), 4.31, y, 4.06, 0.85, { align: 'right' });
    campo(doc, 'Base de cálc. ICMS S.T.', br(0), 8.37, y, 4.06, 0.85, { align: 'right' });
    campo(doc, 'Valor do ICMS subst.', br(0), 12.43, y, 4.06, 0.85, { align: 'right' });
    campo(doc, 'Valor total dos produtos', br(t.vProd), 16.49, y, 4.33, 0.85, { align: 'right' });
    y += 0.85;
    campo(doc, 'Valor do frete', br(0), 0.25, y, 3.3, 0.85, { align: 'right' });
    campo(doc, 'Valor do seguro', br(0), 3.55, y, 3.3, 0.85, { align: 'right' });
    campo(doc, 'Desconto', br(t.vDesc), 6.85, y, 3.3, 0.85, { align: 'right' });
    campo(doc, 'Outras despesas acessórias', br(0), 10.15, y, 3.3, 0.85, { align: 'right' });
    campo(doc, 'Valor do IPI', br(t.vIPI), 13.45, y, 3.3, 0.85, { align: 'right' });
    campo(doc, 'Valor total da nota', br(t.vNF), 16.75, y, 4.07, 0.85, { align: 'right', font: 'bold' });
    y += 0.85;
    if (t.ibscbs) {
        // NT 2026.010 §4.1.
        bloco(doc, 'Total do IBS/CBS/IS', y);
        y += 0.42;
        campo(doc, 'Valor da CBS', br(t.ibscbs.vCBS), 0.25, y, 5.14, 0.85, { align: 'right' });
        campo(doc, 'Valor do IBS UF', br(t.ibscbs.vIBSUF), 5.39, y, 5.14, 0.85, { align: 'right' });
        campo(doc, 'Valor do IBS município', br(t.ibscbs.vIBSMun), 10.53, y, 5.14, 0.85, { align: 'right' });
        campo(doc, 'Valor do imposto seletivo', br(0), 15.67, y, 5.15, 0.85, { align: 'right' });
        y += 0.85;
    }
    // Transportador [§3.1.10]: solo la modalidad (Cord no informa transportadora ni volúmenes).
    bloco(doc, 'Transportador / volumes transportados', y);
    y += 0.42;
    const frete = MOD_FRETE.find((m) => m.id === d.modFrete);
    const freteTxt = { 9: '9-Sem Ocorrência de Transporte', 0: '0-Remetente (CIF)', 1: '1-Destinatário (FOB)', 2: '2-Terceiros', 3: '3-Próprio Remetente', 4: '4-Próprio Destinatário' }[Number(frete?.id ?? 9)] ?? d.modFrete;
    campo(doc, 'Nome / razão social', '', 0.25, y, 7.52);
    campo(doc, 'Frete por conta', freteTxt, 7.77, y, 4.29, 0.85, { size: 7 });
    campo(doc, 'Código ANTT', '', 12.06, y, 1.78);
    campo(doc, 'Placa do veículo', '', 13.84, y, 2.29);
    campo(doc, 'UF', '', 16.13, y, 0.76);
    campo(doc, 'CNPJ / CPF', '', 16.89, y, 3.93);
    y += 0.85;

    // Productos de la primera folha.
    let top = cabeceraProdutos(doc, y);
    caja(doc, 0.25, y + 0.42 + 0.6, LARGO, (fimFolha1 - (c(y + 0.42 + 0.6))) / CM);
    for (const i of paginas[0]) top = filaItem(doc, i, top);

    // Dados adicionais (primera folha) [§3.8.1].
    const yAd = 29.7 - rodapeCm;
    bloco(doc, 'Dados adicionais', yAd);
    caja(doc, 0.25, yAd + 0.42, 12.95, 3.07);
    rotulo(doc, 'Informações complementares', 0.25, yAd + 0.42);
    infLinhas.slice(0, cabemInf).forEach((l, k) => doc.text(l, OX + c(0.35), c(yAd + 0.42) + 14 + k * 8.5, { size: 7 }));
    if (sobra.length) doc.text('CONTINUA NA FOLHA SEGUINTE', OX + c(0.35), c(yAd + 0.42 + 3.07) - 3, { size: 6, font: 'bold' });
    caja(doc, 13.2, yAd + 0.42, 7.62, 3.07);
    rotulo(doc, 'Reservado ao fisco', 13.2, yAd + 0.42);

    // ── Folhas adicionales [§3.5] ──
    let folha = 1;
    for (const itens of paginas.slice(1)) {
        doc.addPage();
        if (d.homologacao) marcaDagua(doc);
        folha++;
        const yc = cabecera(doc, d, 0.42, folha, total);
        let tp = cabeceraProdutos(doc, yc);
        caja(doc, 0.25, yc + 0.42 + 0.6, LARGO, (fimFolhaN - c(yc + 0.42 + 0.6)) / CM);
        for (const i of itens) tp = filaItem(doc, i, tp);
    }
    for (let k = 0; k < folhasInf; k++) {
        doc.addPage();
        if (d.homologacao) marcaDagua(doc);
        folha++;
        const yc = cabecera(doc, d, 0.42, folha, total);
        bloco(doc, 'Dados adicionais - informações complementares (continuação)', yc);
        const porFolha = Math.floor((fimFolhaN - topProdN) / 8.5);
        sobra.slice(k * porFolha, (k + 1) * porFolha).forEach((l, j) => doc.text(l, OX + c(0.35), c(yc + 0.42) + 12 + j * 8.5, { size: 7 }));
    }
    return doc.build();
}

/** "SEM VALOR FISCAL" destacado en homologación [Anexo II §3, §3.10.1]. */
function marcaDagua(doc: Doc): void {
    // Sobre el cuadro de productos, en gris claro: el contenido se dibuja encima.
    doc.text(LEYENDA_SEM_VALOR, 0, c(22.5), { size: 44, font: 'bold', color: [222, 222, 222], align: 'center', width: PAGE_W });
}
