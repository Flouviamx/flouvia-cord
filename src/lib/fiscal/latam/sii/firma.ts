// Firma XMLDSig del DTE, del envío (EnvioDTE) y de la semilla de
// autenticación, con las restricciones del SII (xmldsignature_v10.xsd):
// C14N 1.0 inclusivo, RSA-SHA1, digest SHA1, una sola referencia y KeyInfo con
// KeyValue (RSAKeyValue) + X509Data (instructivo técnico, Anexo 3, A.3.3.1).
//
// El digest se calcula con la canonicalización del árbol (xml.ts), en el
// contexto de espacios de nombres que el elemento firmado tiene en el archivo:
//   - el DTE se firma "suelto" (<DTE xmlns="http://www.sii.cl/SiiDte">), como
//     se guarda, se archiva y se entrega al receptor;
//   - el envío se firma dentro del documento completo (SetDTE hereda xmlns y
//     xmlns:xsi de <EnvioDTE>).
// scripts/sii-check.mjs verifica ambas firmas con una implementación
// independiente (javax.xml.crypto de la JDK) cuando hay Java disponible.
//
// Puro (node:crypto): lo cargan los scripts de contrato con Node plano.

import { createHash, createSign, createVerify, X509Certificate } from 'node:crypto';
import { NS_XMLDSIG } from './constantes.ts';
import { base64Lineas } from './texto.ts';
import { c14n, el, formatear, type Nodo } from './xml.ts';

export const ALG_C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
export const ALG_RSA_SHA1 = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
export const ALG_SHA1 = 'http://www.w3.org/2000/09/xmldsig#sha1';
export const ALG_ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

export interface ClaveFirma {
    certPem: string;
    keyPem: string;
}

type Ns = Record<string, string>;

export const digestSha1 = (texto: string) => createHash('sha1').update(texto, 'utf8').digest('base64');

function signedInfo(uri: string, digest: string, envuelta: boolean): Nodo {
    return el('SignedInfo', null,
        el('CanonicalizationMethod', [['Algorithm', ALG_C14N]]),
        el('SignatureMethod', [['Algorithm', ALG_RSA_SHA1]]),
        el('Reference', [['URI', uri]],
            envuelta ? el('Transforms', null, el('Transform', [['Algorithm', ALG_ENVELOPED]])) : null,
            el('DigestMethod', [['Algorithm', ALG_SHA1]]),
            el('DigestValue', null, digest)),
    );
}

/** Módulo y exponente de la llave del certificado, en base64 (RSAKeyValue). */
export function valoresLlave(certPem: string): { modulo: string; exponente: string; certB64: string } {
    const cert = new X509Certificate(certPem);
    const jwk = cert.publicKey.export({ format: 'jwk' }) as { n: string; e: string };
    return {
        modulo: Buffer.from(jwk.n, 'base64url').toString('base64'),
        exponente: Buffer.from(jwk.e, 'base64url').toString('base64'),
        certB64: cert.raw.toString('base64'),
    };
}

/**
 * Elemento <Signature> sobre el elemento con `uri` ("#ID") cuyo C14N es
 * `canonico`. `contextoFirma` son los espacios de nombres en ámbito donde se
 * inserta la firma (su SignedInfo los hereda en la canonicalización).
 */
export function firmar(canonico: string, uri: string, clave: ClaveFirma, contextoFirma: Ns, envuelta = false): Nodo {
    // Con sus saltos de línea ANTES de firmar: el archivo los lleva y la
    // canonicalización de SignedInfo los incluye.
    const si = formatear(signedInfo(uri, digestSha1(canonico), envuelta));
    const siCanon = c14n(si, { ...contextoFirma, '': NS_XMLDSIG });
    const valor = createSign('RSA-SHA1').update(siCanon, 'utf8').sign(clave.keyPem).toString('base64');
    const { modulo, exponente, certB64 } = valoresLlave(clave.certPem);
    return formatear(el('Signature', [['xmlns', NS_XMLDSIG]],
        si,
        el('SignatureValue', null, base64Lineas(valor)),
        el('KeyInfo', null,
            el('KeyValue', null, el('RSAKeyValue', null, el('Modulus', null, base64Lineas(modulo)), el('Exponent', null, exponente))),
            el('X509Data', null, el('X509Certificate', null, base64Lineas(certB64)))),
    ));
}

/** Verificación propia (para pruebas): digest y valor de firma con la llave del certificado. */
export function verificarFirma(canonico: string, firma: Nodo, contextoFirma: Ns, certPem: string): { digest: boolean; valor: boolean } {
    const si = (firma.c ?? []).find((h): h is Nodo => (h as Nodo).n === 'SignedInfo')!;
    const dv = JSON.stringify(si).match(/"n":"DigestValue","c":\[\{"t":"([^"]+)"/)?.[1] ?? '';
    const sv = (firma.c ?? []).find((h): h is Nodo => (h as Nodo).n === 'SignatureValue');
    const valor = String((sv?.c?.[0] as { t?: string } | undefined)?.t ?? '').replace(/\s+/g, '');
    const siCanon = c14n(si, { ...contextoFirma, '': NS_XMLDSIG });
    return {
        digest: dv === digestSha1(canonico),
        valor: createVerify('RSA-SHA1').update(siCanon, 'utf8').verify(new X509Certificate(certPem).publicKey, Buffer.from(valor, 'base64')),
    };
}
