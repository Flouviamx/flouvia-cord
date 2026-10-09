// Firma XMLDSig enveloped del comprobante [MAN §3.2]: una sola
// ext:UBLExtension cuyo ext:ExtensionContent aloja el ds:Signature, que
// firma TODO el documento (Reference URI="" + enveloped-signature) con
// Canonical XML 1.0 inclusivo. El valor resumen (DigestValue) es el que la
// representación impresa y el QR llevan [RS 113-2018, anexo 6, §6.2].
//
// Sin bibliotecas de XML: el documento ya se escribe en forma canónica
// (ubl.ts), así que el resumen se calcula sobre esos bytes. La única
// sutileza de C14N inclusivo es el SignedInfo: canonicalizado como subárbol
// lleva en su etiqueta TODAS las declaraciones de namespace en alcance (las
// de la raíz), aunque en el documento estén solo en la raíz. sunat-check.mjs
// lo comprueba contra libxml2 (`xmllint --c14n`) y contra lxml cuando está.
//
// Puro salvo node:crypto: lo cargan los scripts de contrato con Node plano.

import { createHash, createSign, createVerify, X509Certificate } from 'node:crypto';
import { nsRaiz, ID_FIRMA, xmlComprobante } from './ubl.ts';
import type { SolicitudSunat } from './comprobante.ts';

export const ALG = {
    c14n: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    enveloped: 'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
    sha256: { firma: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256', resumen: 'http://www.w3.org/2001/04/xmlenc#sha256', node: 'sha256' },
    sha1: { firma: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1', resumen: 'http://www.w3.org/2000/09/xmldsig#sha1', node: 'sha1' },
} as const;

export type AlgoritmoFirma = 'sha256' | 'sha1';

export interface ComprobanteFirmado {
    /** El XML que se envía (con declaración XML, UTF-8). */
    xml: string;
    /** Valor resumen (ds:DigestValue), base64. */
    resumen: string;
    /** Valor de la firma (ds:SignatureValue), base64. */
    firma: string;
    algoritmo: AlgoritmoFirma;
}

const DECLARACION = '<?xml version="1.0" encoding="UTF-8"?>';

/** SignedInfo tal como queda DENTRO del documento (sin declaraciones de namespace propias). */
function signedInfo(resumen: string, alg: AlgoritmoFirma, conNamespaces: string): string {
    const a = ALG[alg];
    return `<ds:SignedInfo${conNamespaces ? ` ${conNamespaces}` : ''}>`
        + `<ds:CanonicalizationMethod Algorithm="${ALG.c14n}"></ds:CanonicalizationMethod>`
        + `<ds:SignatureMethod Algorithm="${a.firma}"></ds:SignatureMethod>`
        + '<ds:Reference URI="">'
        + `<ds:Transforms><ds:Transform Algorithm="${ALG.enveloped}"></ds:Transform></ds:Transforms>`
        + `<ds:DigestMethod Algorithm="${a.resumen}"></ds:DigestMethod>`
        + `<ds:DigestValue>${resumen}</ds:DigestValue>`
        + '</ds:Reference>'
        + '</ds:SignedInfo>';
}

/** Certificado en base64 (DER) a partir del PEM. */
export function certificadoBase64(certPem: string): string {
    const m = /-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/.exec(certPem);
    if (!m) throw new Error('sunat: certificado PEM ilegible');
    return m[1].replace(/\s+/g, '');
}

/**
 * Firma la solicitud ya numerada. Devuelve el XML final, su valor resumen y
 * el valor de la firma.
 */
export function firmarComprobante(s: SolicitudSunat, credencial: { certPem: string; keyPem: string }, alg: AlgoritmoFirma = 'sha256'): ComprobanteFirmado {
    const a = ALG[alg];
    const sinFirma = xmlComprobante(s, '');
    const resumen = createHash(a.node).update(sinFirma, 'utf8').digest('base64');
    const canonico = signedInfo(resumen, alg, nsRaiz(s.tipo));
    const firma = createSign(a.node === 'sha256' ? 'RSA-SHA256' : 'RSA-SHA1').update(canonico, 'utf8').sign(credencial.keyPem, 'base64');
    const signature = `<ds:Signature Id="${ID_FIRMA}">`
        + signedInfo(resumen, alg, '')
        + `<ds:SignatureValue>${firma}</ds:SignatureValue>`
        + `<ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certificadoBase64(credencial.certPem)}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>`
        + '</ds:Signature>';
    return { xml: DECLARACION + xmlComprobante(s, signature), resumen, firma, algoritmo: alg };
}

/**
 * Verificación de la propia firma (para pruebas y para el contrato): vuelve a
 * calcular el resumen y comprueba la firma con la llave pública del
 * certificado incrustado. No sustituye a la verificación independiente de
 * sunat-check.mjs, que canonicaliza con libxml2.
 */
export function verificarFirmaPropia(s: SolicitudSunat, f: ComprobanteFirmado): boolean {
    const a = ALG[f.algoritmo];
    if (createHash(a.node).update(xmlComprobante(s, ''), 'utf8').digest('base64') !== f.resumen) return false;
    const m = /<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/.exec(f.xml);
    if (!m) return false;
    const cert = new X509Certificate(Buffer.from(m[1], 'base64'));
    return createVerify(a.node === 'sha256' ? 'RSA-SHA256' : 'RSA-SHA1')
        .update(signedInfo(f.resumen, f.algoritmo, nsRaiz(s.tipo)), 'utf8')
        .verify(cert.publicKey, f.firma, 'base64');
}
