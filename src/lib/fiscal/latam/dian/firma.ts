// Firma XAdES-EPES de los documentos electrónicos [AT 10 Política de firma y
// 6.5.10 ds:Signature; POL v2]:
//
//   - XMLDSig enveloped dentro de ext:UBLExtensions/ext:UBLExtension/
//     ext:ExtensionContent, con TRES referencias: el documento (URI="",
//     transformación enveloped-signature), el ds:KeyInfo y las
//     xades:SignedProperties [AT 10.9; regla DC02];
//   - C14N inclusiva (REC-xml-c14n-20010315) [AT 10.7; DC03], RSA-SHA256 y
//     resúmenes SHA-256 [AT 10.6; DC04, DC08];
//   - SigningCertificate con la cadena completa: titular, subordinada y raíz
//     [DC25]; IssuerName en la forma de RFC 2253 (la del ejemplo de la Caja);
//   - SignaturePolicyIdentifier con la URL y el SHA-256 de la política v2
//     [AT 10.10]; SignerRole "supplier": firma el propio facturador [AT 10.12].
//
// La forma canónica de cada parte firmada se obtiene sin parsear: el
// documento ya se escribió en forma canónica (xml.ts) y cada subárbol firmado
// (KeyInfo, SignedProperties, SignedInfo) es su serialización con TODOS los
// namespaces que hereda de la raíz — en C14N inclusiva el ápice de un
// subconjunto los emite todos. scripts/dian-check.mjs verifica el resultado
// con dos implementaciones independientes: el validador XMLDSig del JDK y la
// canonicalización de libxml2.
//
// Puro (node:crypto y node-forge para leer el certificado).

import { createHash, createSign, randomUUID } from 'node:crypto';
import forge from 'node-forge';
import { E, serializar, type Nodo } from './xml.ts';
import { ALG, POLITICA_FIRMA } from './constantes.ts';

const sha256b64 = (s: string | Buffer) => createHash('sha256').update(s).digest('base64');

const derDe = (pem: string) => Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(forge.pki.certificateFromPem(pem))).getBytes(), 'binary');

// RFC 2253: nombres cortos de los atributos con palabra clave; el resto va
// como OID=#hex del valor en DER (así aparece emailAddress en el ejemplo).
const CLAVES: Record<string, string> = {
    '2.5.4.3': 'CN', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.6': 'C',
    '2.5.4.9': 'STREET', '0.9.2342.19200300.100.1.25': 'DC', '0.9.2342.19200300.100.1.1': 'UID',
};

function escapar2253(v: string): string {
    let s = v.replace(/([,+"\\<>;])/g, '\\$1');
    if (s.startsWith('#') || s.startsWith(' ')) s = `\\${s}`;
    if (s.endsWith(' ')) s = `${s.slice(0, -1)}\\ `;
    return s;
}

/** Texto de un valor de atributo: UTF8String/PrintableString/IA5String como UTF-8; BMPString como UCS-2. */
function textoAsn1(valor: forge.asn1.Asn1): string {
    const bytes = String(valor.value);
    if (valor.type === forge.asn1.Type.BMPSTRING) {
        let s = '';
        for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes.charCodeAt(i) << 8) | bytes.charCodeAt(i + 1));
        return s;
    }
    try { return forge.util.decodeUtf8(bytes); } catch { return bytes; }
}

/** Nombre distinguido en la forma de RFC 2253 (último RDN primero), como X500Principal.getName(). */
export function nombreRfc2253(dn: forge.pki.Certificate['issuer']): string {
    const asn1 = forge.pki.distinguishedNameToAsn1(dn) as forge.asn1.Asn1;
    const rdns = (asn1.value as forge.asn1.Asn1[]).map((rdn) => (rdn.value as forge.asn1.Asn1[]).map((atv) => {
        const [oidNode, valor] = atv.value as forge.asn1.Asn1[];
        const oid = forge.asn1.derToOid(oidNode.value as string);
        const clave = CLAVES[oid];
        if (clave) return `${clave}=${escapar2253(textoAsn1(valor))}`;
        return `${oid}=#${forge.util.bytesToHex(forge.asn1.toDer(valor).getBytes())}`;
    }).join('+'));
    return rdns.reverse().join(',');
}

export interface Firmante {
    /** Cadena en PEM, titular primero (cadena.ts). */
    cadena: string[];
    llavePem: string;
}

/**
 * Firma un documento armado (raíz con sus declaraciones de namespace y el
 * ExtensionContent vacío donde va la firma). Devuelve el XML final.
 * `cdata`: el contenedor entrega los documentos adjuntos como CDATA (la forma
 * canónica, que es lo que se firma, los ve como texto escapado).
 */
export function firmarDocumento(raiz: Nodo, firmante: Firmante, firmadoAt: string, opts: { cdata?: boolean; id?: string } = {}): string {
    if (!firmante.cadena.length) throw new Error('firma: falta el certificado');
    const nsRaiz = Object.fromEntries(Object.entries(raiz.a).filter(([k]) => k === 'xmlns' || k.startsWith('xmlns:')));
    const enAmbito = Object.fromEntries(Object.entries(nsRaiz).map(([k, v]) => [k === 'xmlns' ? '' : k.slice(6), v]));
    const canonico = (n: Nodo) => serializar({ ...n, a: { ...nsRaiz, ...n.a } });

    const base = opts.id ?? `xmldsig-${randomUUID()}`;
    const ids = { keyinfo: `${base}-keyinfo`, props: `${base}-signedprops`, ref0: `${base}-ref0`, valor: `${base}-sigvalue` };

    // 1. El documento sin la firma (enveloped): su forma canónica es el propio texto.
    const sinFirma = serializar(raiz);
    if (!sinFirma.includes('<ext:ExtensionContent></ext:ExtensionContent>')) throw new Error('firma: el documento no tiene dónde llevar la firma');
    const resumenDoc = sha256b64(sinFirma);

    // 2. KeyInfo: el certificado del titular.
    const ders = firmante.cadena.map(derDe);
    const keyInfo = E('ds:KeyInfo', { Id: ids.keyinfo }, E('ds:X509Data', null, E('ds:X509Certificate', null, ders[0].toString('base64'))));

    // 3. SignedProperties.
    const certs = firmante.cadena.map((pem, i) => {
        const c = forge.pki.certificateFromPem(pem);
        return E('xades:Cert', null,
            E('xades:CertDigest', null, E('ds:DigestMethod', { Algorithm: ALG.sha256 }), E('ds:DigestValue', null, sha256b64(ders[i]))),
            E('xades:IssuerSerial', null,
                E('ds:X509IssuerName', null, nombreRfc2253(c.issuer)),
                E('ds:X509SerialNumber', null, BigInt(`0x${c.serialNumber}`).toString())));
    });
    const props = E('xades:SignedProperties', { Id: ids.props },
        E('xades:SignedSignatureProperties', null,
            E('xades:SigningTime', null, firmadoAt),
            E('xades:SigningCertificate', null, certs),
            E('xades:SignaturePolicyIdentifier', null,
                E('xades:SignaturePolicyId', null,
                    E('xades:SigPolicyId', null,
                        E('xades:Identifier', null, POLITICA_FIRMA.identificador),
                        E('xades:Description', null, POLITICA_FIRMA.descripcion)),
                    E('xades:SigPolicyHash', null,
                        E('ds:DigestMethod', { Algorithm: ALG.sha256 }),
                        E('ds:DigestValue', null, POLITICA_FIRMA.hashSha256)))),
            E('xades:SignerRole', null, E('xades:ClaimedRoles', null, E('xades:ClaimedRole', null, 'supplier')))));

    // 4. SignedInfo y su firma.
    const referencia = (atributos: Record<string, string>, resumen: string, enveloped = false) => E('ds:Reference', atributos,
        enveloped && E('ds:Transforms', null, E('ds:Transform', { Algorithm: ALG.enveloped })),
        E('ds:DigestMethod', { Algorithm: ALG.sha256 }),
        E('ds:DigestValue', null, resumen));
    const signedInfo = E('ds:SignedInfo', null,
        E('ds:CanonicalizationMethod', { Algorithm: ALG.c14n }),
        E('ds:SignatureMethod', { Algorithm: ALG.rsaSha256 }),
        referencia({ Id: ids.ref0, URI: '' }, resumenDoc, true),
        referencia({ URI: `#${ids.keyinfo}` }, sha256b64(canonico(keyInfo))),
        referencia({ Type: ALG.signedProps, URI: `#${ids.props}` }, sha256b64(canonico(props))));
    const firma = createSign('RSA-SHA256').update(canonico(signedInfo), 'utf8').sign(firmante.llavePem, 'base64');

    const signature = E('ds:Signature', { Id: base },
        signedInfo,
        E('ds:SignatureValue', { Id: ids.valor }, firma),
        keyInfo,
        E('ds:Object', null, E('xades:QualifyingProperties', { Target: `#${base}` }, props)));

    // 5. Insertar la firma en el ExtensionContent vacío (el primero que lo esté).
    const documento = serializar(raiz, { cdata: opts.cdata });
    const hueco = '<ext:ExtensionContent></ext:ExtensionContent>';
    const i = documento.indexOf(hueco);
    const conFirma = `${documento.slice(0, i)}<ext:ExtensionContent>${serializar(signature, { enAmbito })}</ext:ExtensionContent>${documento.slice(i + hueco.length)}`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>${conFirma}`;
}
