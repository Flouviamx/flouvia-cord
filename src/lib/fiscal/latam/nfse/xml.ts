// XML de la NFS-e: armado en forma canónica, firma XMLDSig y lectura de las
// respuestas de la Sefin Nacional.
//
// Armado. Cord escribe la DPS y el pedido de evento directamente en la forma
// canónica de C14N 1.0 (sin declaración dentro de lo firmado, sin espacios
// entre elementos, atributos entre comillas dobles y en orden, etiquetas de
// apertura y cierre aunque el elemento quede vacío, fin de línea normalizado a
// \n). Así el resumen que se firma es exactamente el texto que viaja: no hace
// falta un canonicalizador. scripts/nfse-check.mjs lo comprueba contra uno
// independiente (lxml) y verifica la firma con openssl.
//
// Firma. Enveloped sobre el elemento con `Id` (infDPS / infPedReg), con los
// algoritmos del xmldsig restringido oficial (constantes.ts, DSIG). La firma
// es hermana del elemento firmado, hija de la raíz.
//
// Lectura. Las respuestas son XML que genera la Sefin; se leen con extracción
// por etiqueta, tolerante a prefijos, sin evaluar entidades externas (no hay
// parser DOM ni DTD de por medio).
//
// Puro (node:crypto y nada más): lo cargan los scripts con Node plano.

import { createHash, createSign } from 'node:crypto';
// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { DSIG, NS_DSIG } from './constantes.ts';

// ── Texto ────────────────────────────────────────────────────────────────────

// Caracteres inválidos en XML 1.0: rompen el documento entero.
const XML_INVALIDO = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu;

/** Texto apto para la DPS: sin caracteres inválidos y con fin de línea \n (como lo deja un parser). */
export function limpar(value: unknown): string {
    return String(value ?? '').replace(/\r\n?/g, '\n').replace(XML_INVALIDO, '');
}

/** Escape de contenido de texto en forma canónica (C14N §2.3). */
export function escTexto(value: unknown): string {
    return limpar(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escape de un valor de atributo en forma canónica (C14N §2.3). */
export function escAtributo(value: unknown): string {
    return limpar(value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
        .replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;');
}

/** Elemento simple; vacío/ausente no se escribe (minOccurs="0", nunca como etiqueta vacía). */
export function el(nome: string, valor: string | number | null | undefined): string {
    if (valor === undefined || valor === null || valor === '') return '';
    return `<${nome}>${escTexto(valor)}</${nome}>`;
}

/** Grupo con hijos ya serializados. Un grupo sin contenido no se escribe. */
export function grupo(nome: string, ...filhos: string[]): string {
    const inner = filhos.join('');
    return inner ? `<${nome}>${inner}</${nome}>` : '';
}

// ── Firma XMLDSig ────────────────────────────────────────────────────────────

const pemADerB64 = (pem: string) => pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '');

/**
 * Forma canónica (C14N 1.0, subconjunto) del elemento `tag` con `Id`: el
 * namespace por defecto en vigor (`ns`) se declara en el ápice, antes de los
 * atributos. Lanza si el elemento no está en el documento.
 */
export function canonicoDoElemento(xml: string, tag: string, id: string, ns: string): string {
    const apertura = `<${tag} Id="${escAtributo(id)}">`;
    const inicio = xml.indexOf(apertura);
    if (inicio < 0) throw new Error(`xml: no se encontró <${tag} Id="${id}">`);
    const cierre = xml.indexOf(`</${tag}>`, inicio);
    if (cierre < 0) throw new Error(`xml: <${tag}> sin cierre`);
    const elemento = xml.slice(inicio, cierre + tag.length + 3);
    return `<${tag} xmlns="${ns}" Id="${escAtributo(id)}">${elemento.slice(apertura.length)}`;
}

export function signedInfo(id: string, digestB64: string, comNamespace: boolean): string {
    return `<SignedInfo${comNamespace ? ` xmlns="${NS_DSIG}"` : ''}>`
        + `<CanonicalizationMethod Algorithm="${DSIG.c14n}"></CanonicalizationMethod>`
        + `<SignatureMethod Algorithm="${DSIG.rsaSha1}"></SignatureMethod>`
        + `<Reference URI="#${escAtributo(id)}">`
        + '<Transforms>'
        + `<Transform Algorithm="${DSIG.enveloped}"></Transform>`
        + `<Transform Algorithm="${DSIG.c14n}"></Transform>`
        + '</Transforms>'
        + `<DigestMethod Algorithm="${DSIG.sha1}"></DigestMethod>`
        + `<DigestValue>${digestB64}</DigestValue>`
        + '</Reference>'
        + '</SignedInfo>';
}

/**
 * Firma el elemento `tag` (con su `Id`) de un documento armado por Cord e
 * inserta `<Signature>` como último hijo de la raíz `raiz`.
 */
export function assinar(xml: string, opts: { raiz: string; tag: string; id: string; ns: string; certPem: string; keyPem: string }): string {
    const canonico = canonicoDoElemento(xml, opts.tag, opts.id, opts.ns);
    const digest = createHash('sha1').update(canonico, 'utf8').digest('base64');
    const si = signedInfo(opts.id, digest, true);
    const valor = createSign('RSA-SHA1').update(si, 'utf8').sign(opts.keyPem, 'base64');
    const assinatura = `<Signature xmlns="${NS_DSIG}">${signedInfo(opts.id, digest, false)}`
        + `<SignatureValue>${valor}</SignatureValue>`
        + `<KeyInfo><X509Data><X509Certificate>${pemADerB64(opts.certPem)}</X509Certificate></X509Data></KeyInfo>`
        + '</Signature>';
    const fim = `</${opts.raiz}>`;
    const pos = xml.lastIndexOf(fim);
    if (pos < 0) throw new Error(`xml: sin </${opts.raiz}>`);
    return xml.slice(0, pos) + assinatura + xml.slice(pos);
}

// ── Lectura ──────────────────────────────────────────────────────────────────

const ENTIDADES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** Decodifica las entidades predefinidas y las numéricas. */
export function decodificar(texto: string): string {
    return texto.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);/g, (_, e: string) => {
        if (e[0] !== '#') return ENTIDADES[e];
        const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

const re = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Contenido (crudo) del primer elemento `tag` dentro de `xml`, con o sin prefijo. */
export function bloco(xml: string, tag: string): string | null {
    const t = re(tag);
    const m = new RegExp(`<(?:[\\w.-]+:)?${t}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</(?:[\\w.-]+:)?${t}>)`).exec(xml);
    return m ? (m[1] ?? '') : null;
}

/** Texto del primer elemento simple `tag`, decodificado y sin espacios en los bordes. */
export function texto(xml: string | null | undefined, tag: string): string {
    if (!xml) return '';
    const b = bloco(xml, tag);
    return b === null ? '' : decodificar(b.replace(/<[^>]*>/g, '')).trim();
}

/** Valor del atributo `attr` del primer elemento `tag`. */
export function atributo(xml: string, tag: string, attr: string): string {
    const m = new RegExp(`<(?:[\\w.-]+:)?${re(tag)}\\s[^>]*?\\b${re(attr)}="([^"]*)"`).exec(xml);
    return m ? decodificar(m[1]) : '';
}
