// Firma XAdES-EPES de una Facturae, según la "Política de firma electrónica
// para facturación electrónica con formato Facturae" v3.1 (facturae.gob.es).
//
// Qué pide la política (apartado 1.3) y cómo se cumple:
//   - firma enveloped de TODO el documento: Reference URI="" con la
//     transformación enveloped-signature;
//   - las propiedades firmadas (SignedProperties) y el certificado (KeyInfo),
//     cada uno con su Reference: nadie puede cambiar el certificado ni la hora;
//   - SigningTime, SigningCertificate y SignaturePolicyIdentifier con la URL de
//     la política y su huella publicada (politica_firma_v3_1_sha1.txt);
//   - SignerRole "emisor": firma quien emite la factura;
//   - algoritmos del estándar XMLDSig: RSA-SHA256, SHA-256 y C14N 1.0.
//
// Sin dependencias de canonicalización: `facturae.ts` ya escribe el documento
// en forma canónica (C14N inclusiva) y este archivo arma la firma igual. Lo que
// se firma son esos mismos bytes, con las declaraciones de espacio de nombres
// que la canonicalización inclusiva hereda del documento (ds y fe en la raíz,
// xades en QualifyingProperties). El check oficial (`scripts/einvoice-check.mjs`)
// valida la firma con la implementación XMLDSig del JDK, que canonicaliza por
// su cuenta: si estos bytes no fueran la forma canónica, la firma no verificaría.
//
// La firma la hace el negocio con SU certificado cualificado, el mismo que sube
// para Verifactu, solo si lo activó en Ajustes. Cord no transmite la factura.

import { createHash, createSign, randomUUID } from 'node:crypto';
import forge from 'node-forge';
import { DS_NS, FACTURAE_NS, FACTURAE_ROOT_CLOSE, FACTURAE_ROOT_OPEN } from './facturae';

export const XADES_NS = 'http://uri.etsi.org/01903/v1.3.2#';
export const FACTURAE_POLICY_URL = 'http://www.facturae.es/politica_de_firma_formato_facturae/politica_de_firma_formato_facturae_v3_1.pdf';
/** Huella SHA-1 publicada de la política v3.1 (politica_firma_v3_1_sha1.txt en facturae.gob.es). */
export const FACTURAE_POLICY_SHA1 = 'Ohixl6upD6av8N7pEvDABhEL6hM=';

const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const SHA1 = 'http://www.w3.org/2000/09/xmldsig#sha1';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const SIGNED_PROPERTIES_TYPE = 'http://uri.etsi.org/01903#SignedProperties';

export interface FacturaeSigner {
    /** Llave privada RSA en PEM. */
    privateKeyPem: string;
    /** Certificado del firmante en DER. */
    certDer: Buffer;
}

export class FacturaeSignError extends Error {}

const sha256b64 = (data: string | Buffer) => createHash('sha256').update(data).digest('base64');
const escText = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');

// Nombres cortos de RFC 2253 (cap. 2.3); el resto va como OID=#DER en hex.
const RFC2253_NAMES: Record<string, string> = {
    '2.5.4.3': 'CN', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.10': 'O', '2.5.4.11': 'OU',
    '2.5.4.9': 'STREET', '0.9.2342.19200300.100.1.25': 'DC', '0.9.2342.19200300.100.1.1': 'UID',
};

function escapeRdnValue(v: string): string {
    let s = v.replace(/([,+"\\<>;])/g, '\\$1');
    if (/^[ #]/.test(s)) s = `\\${s}`;
    if (/ $/.test(s)) s = `${s.slice(0, -1)}\\ `;
    return s;
}

/** Nombre del emisor del certificado en RFC 2253 (orden inverso al del certificado). */
export function issuerNameRfc2253(certDer: Buffer): string {
    const cert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(certDer.toString('binary'))));
    const parts = (cert.issuer.attributes as Array<{ type: string; value: string; valueTagClass: number }>).map((a) => {
        const short = RFC2253_NAMES[a.type];
        if (short) return `${short}=${escapeRdnValue(String(a.value))}`;
        const der = forge.asn1.toDer(forge.asn1.create(forge.asn1.Class.UNIVERSAL, a.valueTagClass, false, String(a.value))).getBytes();
        return `${a.type}=#${forge.util.bytesToHex(der)}`;
    });
    return parts.reverse().join(',');
}

function certSerialDecimal(certDer: Buffer): string {
    const cert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(certDer.toString('binary'))));
    return BigInt(`0x${cert.serialNumber}`).toString(10);
}

/** xs:dateTime con segundos y zona UTC explícita. */
function xsDateTime(d: Date): string {
    return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Firma una Facturae SIN declaración XML (la que devuelve `assessFacturae`) y
 * devuelve el documento firmado, con su declaración. `signingTime` e `id` se
 * inyectan para pruebas deterministas.
 */
export function signFacturae(xml: string, signer: FacturaeSigner, opts: { signingTime?: Date; id?: string } = {}): string {
    if (!xml.startsWith(FACTURAE_ROOT_OPEN) || !xml.endsWith(FACTURAE_ROOT_CLOSE)) {
        throw new FacturaeSignError('El documento no es una Facturae de Cord en forma canónica.');
    }
    const id = (opts.id ?? randomUUID()).replace(/[^A-Za-z0-9-]/g, '');
    const signingTime = xsDateTime(opts.signingTime ?? new Date());
    const certB64 = signer.certDer.toString('base64');

    const nsRoot = `xmlns:ds="${DS_NS}" xmlns:fe="${FACTURAE_NS}"`;
    const signedPropsBody = '<xades:SignedSignatureProperties>'
        + `<xades:SigningTime>${signingTime}</xades:SigningTime>`
        + '<xades:SigningCertificate><xades:Cert><xades:CertDigest>'
        + `<ds:DigestMethod Algorithm="${SHA256}"></ds:DigestMethod><ds:DigestValue>${sha256b64(signer.certDer)}</ds:DigestValue>`
        + '</xades:CertDigest><xades:IssuerSerial>'
        + `<ds:X509IssuerName>${escText(issuerNameRfc2253(signer.certDer))}</ds:X509IssuerName><ds:X509SerialNumber>${certSerialDecimal(signer.certDer)}</ds:X509SerialNumber>`
        + '</xades:IssuerSerial></xades:Cert></xades:SigningCertificate>'
        + '<xades:SignaturePolicyIdentifier><xades:SignaturePolicyId><xades:SigPolicyId>'
        + `<xades:Identifier>${FACTURAE_POLICY_URL}</xades:Identifier>`
        + '<xades:Description>Política de Firma FacturaE v3.1</xades:Description>'
        + '</xades:SigPolicyId><xades:SigPolicyHash>'
        + `<ds:DigestMethod Algorithm="${SHA1}"></ds:DigestMethod><ds:DigestValue>${FACTURAE_POLICY_SHA1}</ds:DigestValue>`
        + '</xades:SigPolicyHash></xades:SignaturePolicyId></xades:SignaturePolicyIdentifier>'
        + '<xades:SignerRole><xades:ClaimedRoles><xades:ClaimedRole>emisor</xades:ClaimedRole></xades:ClaimedRoles></xades:SignerRole>'
        + '</xades:SignedSignatureProperties>'
        + '<xades:SignedDataObjectProperties>'
        + `<xades:DataObjectFormat ObjectReference="#Reference-${id}"><xades:Description>Factura electrónica</xades:Description><xades:MimeType>text/xml</xades:MimeType></xades:DataObjectFormat>`
        + '</xades:SignedDataObjectProperties>';
    const signedProps = `<xades:SignedProperties Id="SignedProperties-${id}">${signedPropsBody}</xades:SignedProperties>`;
    // Forma canónica de cada parte firmada: C14N inclusiva hereda en el
    // elemento raíz del subconjunto todas las declaraciones en ámbito.
    const signedPropsC14n = `<xades:SignedProperties ${nsRoot} xmlns:xades="${XADES_NS}" Id="SignedProperties-${id}">${signedPropsBody}</xades:SignedProperties>`;
    const keyInfoBody = `<ds:X509Data><ds:X509Certificate>${certB64}</ds:X509Certificate></ds:X509Data>`;
    const keyInfo = `<ds:KeyInfo Id="KeyInfo-${id}">${keyInfoBody}</ds:KeyInfo>`;
    const keyInfoC14n = `<ds:KeyInfo ${nsRoot} Id="KeyInfo-${id}">${keyInfoBody}</ds:KeyInfo>`;

    const reference = (attrs: string, digest: string, transforms = '') =>
        `<ds:Reference ${attrs}>${transforms}<ds:DigestMethod Algorithm="${SHA256}"></ds:DigestMethod><ds:DigestValue>${digest}</ds:DigestValue></ds:Reference>`;
    const signedInfoBody = `<ds:CanonicalizationMethod Algorithm="${C14N}"></ds:CanonicalizationMethod>`
        + `<ds:SignatureMethod Algorithm="${RSA_SHA256}"></ds:SignatureMethod>`
        // Atributos en el orden canónico: Id, Type, URI.
        + reference(`Id="Reference-${id}" URI=""`, sha256b64(xml), `<ds:Transforms><ds:Transform Algorithm="${ENVELOPED}"></ds:Transform></ds:Transforms>`)
        + reference(`Type="${SIGNED_PROPERTIES_TYPE}" URI="#SignedProperties-${id}"`, sha256b64(signedPropsC14n))
        + reference(`URI="#KeyInfo-${id}"`, sha256b64(keyInfoC14n));
    const signedInfo = `<ds:SignedInfo Id="SignedInfo-${id}">${signedInfoBody}</ds:SignedInfo>`;
    const signedInfoC14n = `<ds:SignedInfo ${nsRoot} Id="SignedInfo-${id}">${signedInfoBody}</ds:SignedInfo>`;

    let signatureValue: string;
    try {
        signatureValue = createSign('RSA-SHA256').update(signedInfoC14n).sign(signer.privateKeyPem, 'base64');
    } catch {
        throw new FacturaeSignError('No se pudo firmar con el certificado: debe ser un certificado con llave RSA.');
    }

    const signature = `<ds:Signature Id="Signature-${id}">${signedInfo}`
        + `<ds:SignatureValue Id="SignatureValue-${id}">${signatureValue}</ds:SignatureValue>`
        + keyInfo
        + `<ds:Object><xades:QualifyingProperties xmlns:xades="${XADES_NS}" Target="#Signature-${id}">${signedProps}</xades:QualifyingProperties></ds:Object>`
        + '</ds:Signature>';
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
        + xml.slice(0, -FACTURAE_ROOT_CLOSE.length) + signature + FACTURAE_ROOT_CLOSE;
}
