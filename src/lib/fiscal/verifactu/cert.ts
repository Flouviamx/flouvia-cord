// Parseo del certificado electrónico (.p12/.pfx) que Verifactu exige para
// autenticar el envío a la AEAT (mTLS). Pure-JS a propósito: Vercel Fluid
// Compute no garantiza un binario `openssl` en el runtime, así que invocarlo
// por child_process sería un "funciona en mi máquina" — mismo riesgo que ya
// mordió a este repo con `pdftotext`/poppler. `node-forge` decodifica el
// PKCS#12 sin depender de nada del sistema operativo.
//
// Lo que se aprendió por las malas y este archivo ahora cubre:
//   - Un .p12 exportado desde Windows o un navegador antiguo viene cifrado con
//     RC2-40/3DES. node-forge lo abre, pero el TLS de Node (OpenSSL 3) lo
//     rechaza con "Unsupported PKCS12 PFX data": el certificado se aceptaba al
//     subirlo y el envío fallaba siempre. Ahora se prueba con el TLS real y,
//     si no lo acepta, se extraen llave y certificado a PEM (que sí acepta).
//   - El certificado de firma es el que corresponde a la LLAVE PRIVADA, no el
//     primero de la bolsa: muchos .p12 traen la cadena (raíz e intermedias)
//     antes que el certificado del titular.
//   - La llave puede venir sin cifrar (keyBag) además de cifrada
//     (pkcs8ShroudedKeyBag).
//   - El número de iteraciones de la derivación de la contraseña lo decide el
//     archivo: uno con mil millones dejaría la CPU ocupada minutos. Se acota
//     antes de descifrar nada.

import forge from 'node-forge';
import { createSecureContext } from 'node:tls';
import { normalizarNifEs, nifEsValido } from './validacion.ts';

export interface ParsedCertificate {
    /** Fecha de caducidad del certificado de firma. */
    expiresAt: Date;
    /** Common Name del sujeto, si el certificado lo declara (para mostrar, no para decidir). */
    subjectCN: string | null;
    /**
     * NIF españoles que el certificado declara de su titular: el del firmante
     * (serialNumber, OID 2.5.4.5) y, en certificados de representante o de
     * sello, el de la entidad (organizationIdentifier, OID 2.5.4.97, "VATES-…").
     */
    nifs: string[];
}

export class InvalidCertificateError extends Error {}

// Iteraciones máximas por derivación y en total. Los exportadores reales usan
// entre 2.000 y 600.000; por encima solo hay un archivo hecho para gastar CPU.
const MAX_ITERACIONES = 1_000_000;
const MAX_ITERACIONES_TOTAL = 2_500_000;
// Topes del recorrido del ASN.1: un .p12 real anida 8–10 niveles (PFX →
// AuthenticatedSafe → SafeContents → bolsa → X.509 → extensiones) y unos
// pocos miles de nodos; un archivo de 50 KB no puede legítimamente pasar de esto.
const MAX_NODOS = 200_000;
const MAX_PROFUNDIDAD = 64;

function asn1Integer(bytes: string): number {
    if (bytes.length > 6) return Number.POSITIVE_INFINITY;
    let n = 0;
    for (let i = 0; i < bytes.length; i++) n = n * 256 + bytes.charCodeAt(i);
    return n;
}

/**
 * Recorre el ASN.1 del PKCS#12 (incluidos los OCTET STRING que contienen DER
 * anidado: AuthenticatedSafe, SafeContents) y devuelve los recuentos de
 * iteraciones visibles SIN descifrar nada: los parámetros PBE/PBKDF2
 * (SEQUENCE { salt OCTET STRING, iterations INTEGER, … }) y el MacData
 * (SEQUENCE { DigestInfo, macSalt, iterations }). Las bolsas dentro de un
 * contenedor cifrado no son visibles hasta descifrarlo; su contenedor sí se
 * acota.
 */
export function iteracionesPkcs12(der: string): number[] {
    const found: number[] = [];
    let nodos = 0;
    const visit = (node: forge.asn1.Asn1, depth: number): void => {
        if (++nodos > MAX_NODOS || depth > MAX_PROFUNDIDAD) throw new InvalidCertificateError('El archivo del certificado tiene una estructura inválida.');
        if (Array.isArray(node.value)) {
            const kids = node.value as forge.asn1.Asn1[];
            for (let i = 1; i < kids.length; i++) {
                const prev = kids[i - 1];
                const cur = kids[i];
                if (prev.tagClass === forge.asn1.Class.UNIVERSAL && prev.type === forge.asn1.Type.OCTETSTRING
                    && cur.tagClass === forge.asn1.Class.UNIVERSAL && cur.type === forge.asn1.Type.INTEGER
                    && typeof cur.value === 'string') {
                    found.push(asn1Integer(cur.value));
                }
            }
            for (const kid of kids) visit(kid, depth + 1);
            return;
        }
        if (node.tagClass === forge.asn1.Class.UNIVERSAL && node.type === forge.asn1.Type.OCTETSTRING
            && typeof node.value === 'string' && node.value.length > 1 && node.value.charCodeAt(0) === 0x30) {
            try {
                visit(forge.asn1.fromDer(forge.util.createBuffer(node.value), { strict: false } as any), depth + 1);
            } catch (error) {
                if (error instanceof InvalidCertificateError) throw error;
                // No era DER anidado (una llave, una huella…): se ignora.
            }
        }
    };
    visit(forge.asn1.fromDer(forge.util.createBuffer(der), { strict: false } as any), 0);
    return found;
}

function acotarIteraciones(der: string): void {
    let iteraciones: number[];
    try {
        iteraciones = iteracionesPkcs12(der);
    } catch (error) {
        if (error instanceof InvalidCertificateError) throw error;
        throw new InvalidCertificateError('No se pudo abrir el certificado. Verifica que sea un archivo .p12/.pfx válido.');
    }
    const total = iteraciones.reduce((a, b) => a + b, 0);
    if (iteraciones.some((n) => n > MAX_ITERACIONES) || total > MAX_ITERACIONES_TOTAL) {
        throw new InvalidCertificateError(
            'El certificado usa una protección de contraseña fuera de lo habitual. Vuelve a exportarlo desde tu navegador o desde la FNMT con las opciones por defecto.',
        );
    }
}

interface Extraido {
    cert: forge.pki.Certificate;
    key: forge.pki.PrivateKey;
    chain: forge.pki.Certificate[];
}

function bagsOf(p12: forge.pkcs12.Pkcs12Pfx, bagType: string): forge.pkcs12.Bag[] {
    return p12.getBags({ bagType })[bagType] ?? [];
}

function localKeyId(bag: forge.pkcs12.Bag): string | null {
    const id = (bag.attributes as Record<string, unknown[]> | undefined)?.localKeyId?.[0];
    return typeof id === 'string' ? id : null;
}

/** Abre el PKCS#12 con node-forge y empareja la llave con SU certificado. */
function extraer(p12Bytes: Uint8Array, password: string): Extraido {
    const der = Buffer.from(p12Bytes).toString('binary');
    acotarIteraciones(der);
    let p12: forge.pkcs12.Pkcs12Pfx;
    try {
        p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(der)), password);
    } catch {
        throw new InvalidCertificateError(
            'No se pudo abrir el certificado. Verifica que sea un archivo .p12/.pfx válido y que la contraseña sea correcta.',
        );
    }
    const keyBags = [
        ...bagsOf(p12, forge.pki.oids.pkcs8ShroudedKeyBag),
        ...bagsOf(p12, forge.pki.oids.keyBag),
    ].filter((b) => b.key);
    const certBags = bagsOf(p12, forge.pki.oids.certBag).filter((b) => b.cert);
    if (!keyBags.length || !certBags.length) {
        throw new InvalidCertificateError(
            'El archivo no contiene un certificado con su llave privada. Exporta el .p12 desde donde lo emitió tu autoridad de certificación incluyendo la llave privada.',
        );
    }
    const keyBag = keyBags[0];
    const key = keyBag.key as forge.pki.PrivateKey;
    // 1) Por clave pública: mismo módulo RSA. Es la prueba definitiva, y va
    //    primero porque algunos exportadores ponen el localKeyId de la llave
    //    en el PRIMER certificado de la bolsa aunque sea la CA.
    const n = (key as forge.pki.rsa.PrivateKey).n;
    let certBag = n
        ? certBags.find((b) => {
            const pub = b.cert?.publicKey as forge.pki.rsa.PublicKey | undefined;
            return !!pub?.n && pub.n.equals(n);
        })
        : undefined;
    // 2) Llaves no RSA (forge no expone su pública): el atributo localKeyId
    //    que los exportadores ponen a la pareja.
    if (!certBag && !n && localKeyId(keyBag)) {
        certBag = certBags.find((b) => localKeyId(b) === localKeyId(keyBag));
    }
    if (!certBag?.cert) {
        throw new InvalidCertificateError('El archivo no contiene el certificado que corresponde a su llave privada.');
    }
    return { cert: certBag.cert, key, chain: certBags.map((b) => b.cert!).filter((c) => c !== certBag!.cert) };
}

function nifsDelSujeto(cert: forge.pki.Certificate): string[] {
    const nifs = new Set<string>();
    for (const attr of cert.subject.attributes as Array<{ type?: string; value?: unknown }>) {
        if (attr.type !== '2.5.4.5' && attr.type !== '2.5.4.97') continue;
        // "IDCES-12345678Z", "VATES-B12345674", "NTRES-…" o el NIF a secas.
        const raw = String(attr.value ?? '').toUpperCase().replace(/^(IDC|VAT|NTR|PAS|PNO|TIN)[A-Z]{2}-/, '');
        const nif = normalizarNifEs(raw);
        if (nifEsValido(nif)) nifs.add(nif);
    }
    return [...nifs];
}

/**
 * Valida que `p12Bytes` sea un PKCS#12 real, que `password` lo desbloquee, que
 * el TLS de Node pueda usarlo para autenticarse, y extrae la caducidad y los
 * NIF del titular del certificado de firma.
 *
 * Lanza `InvalidCertificateError` con un mensaje ya accionable para el
 * usuario (regla 14: nunca el error crudo de forge o de OpenSSL).
 */
export function parsePkcs12(p12Bytes: Uint8Array, password: string): ParsedCertificate {
    const { cert } = extraer(p12Bytes, password);
    const expiresAt = cert.validity.notAfter;
    if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
        throw new InvalidCertificateError('El certificado no declara una fecha de caducidad legible.');
    }
    // Comprobación con el TLS REAL del runtime: es lo que usará el envío.
    credencialesTls(Buffer.from(p12Bytes), password);
    const cn = cert.subject.getField('CN');
    return { expiresAt, subjectCN: cn ? String(cn.value) : null, nifs: nifsDelSujeto(cert) };
}

export type TlsCredenciales = { pfx: Buffer; passphrase: string } | { key: string; cert: string };

/**
 * Credenciales para el agente TLS del envío. Primero el PKCS#12 tal cual (lo
 * más fiel); si el OpenSSL del runtime no soporta su cifrado (RC2/3DES de
 * exportadores antiguos), la llave y la cadena extraídas a PEM, que se
 * mantienen solo en memoria. Lanza `InvalidCertificateError` si ninguna forma
 * sirve.
 */
export function credencialesTls(p12: Buffer, password: string): TlsCredenciales {
    try {
        createSecureContext({ pfx: p12, passphrase: password });
        return { pfx: p12, passphrase: password };
    } catch {
        // Sigue con la extracción a PEM.
    }
    const { cert, key, chain } = extraer(p12, password);
    const pem = {
        key: forge.pki.privateKeyToPem(key),
        cert: [cert, ...chain].map((c) => forge.pki.certificateToPem(c)).join(''),
    };
    try {
        createSecureContext(pem);
    } catch {
        throw new InvalidCertificateError(
            'Este certificado no se puede usar para conectar con la AEAT. Vuelve a exportarlo (.p12/.pfx) con su llave privada desde tu navegador o desde la FNMT.',
        );
    }
    return pem;
}

/**
 * Llave y certificado para la firma XAdES de una Facturae (`einvoice/xades.ts`):
 * el mismo certificado cualificado que autentica el envío a Verifactu, la llave
 * en PEM (solo en memoria) y el certificado del titular en DER. Solo RSA, que
 * es lo que emiten la FNMT y las demás CA cualificadas para persona física,
 * representante y sello.
 */
export function credencialesFirma(p12: Buffer, password: string): { privateKeyPem: string; certDer: Buffer } {
    const { cert, key } = extraer(p12, password);
    if (!(key as forge.pki.rsa.PrivateKey).n) {
        throw new InvalidCertificateError('Este certificado no usa una llave RSA y no se puede usar para firmar facturas.');
    }
    return {
        privateKeyPem: forge.pki.privateKeyToPem(key),
        certDer: Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), 'binary'),
    };
}
