// Lectura del certificado digital y la llave privada con que un contribuyente
// se identifica ante su autoridad fiscal. Común a los rieles de LatAm: ARCA lo
// usa para firmar el pedido de acceso (CMS), y los rieles que vienen (SII,
// DIAN, SUNAT, NFS-e Nacional) firman XML o abren mTLS con el mismo par.
//
// Acepta las dos formas en que el contribuyente lo obtiene:
//   - certificado (.crt/.pem, PEM o DER) + llave privada (.key, PEM, cifrada o
//     no): es lo que entrega ARCA al firmar la solicitud (CSR) que el
//     contribuyente generó con su propia llave;
//   - PKCS#12 (.p12/.pfx) + contraseña: lo que exporta un navegador o un
//     sistema anterior.
//
// Pure-JS (node-forge) por la misma razón que verifactu/cert.ts: el runtime
// de Vercel no garantiza un binario `openssl`. Y con las mismas defensas que
// ya costaron caro allá: la llave se empareja con SU certificado por el
// módulo RSA (no "el primero de la bolsa") y el número de iteraciones de la
// contraseña de un PKCS#12 se acota antes de descifrar nada.
//
// Lo que sale de aquí son PEM en memoria; quien los persiste los cifra con
// encryptRequiredSecret() (credenciales.ts). Nunca se registran ni vuelven al
// navegador.

import forge from 'node-forge';
import { createHash } from 'node:crypto';
import { iteracionesPkcs12, InvalidCertificateError } from '../verifactu/cert.ts';
import { RailDatosError } from './errores.ts';

export interface CertificadoParseado {
    /** Certificado del titular, PEM. */
    certPem: string;
    /** Llave privada RSA sin cifrar, PEM (PKCS#1). Se cifra antes de persistirla. */
    keyPem: string;
    /** Vigencia del certificado. */
    desde: Date;
    caduca: Date;
    /** Common Name del sujeto (para mostrar, no para decidir). */
    sujetoCN: string | null;
    /** Atributo serialNumber (OID 2.5.4.5) del sujeto, crudo: ARCA pone ahí "CUIT 20123456789". */
    sujetoSerialNumber: string | null;
    /** Common Name de quien lo emitió (la autoridad certificante). */
    emisorCN: string | null;
    /** SHA-256 del certificado en DER, hexadecimal: identifica el archivo sin exponerlo. */
    huellaSha256: string;
}

export interface EntradaCertificado {
    certificado?: Uint8Array | string | null;
    llave?: Uint8Array | string | null;
    llavePassword?: string | null;
    pkcs12?: Uint8Array | null;
    pkcs12Password?: string | null;
}

/** Un archivo de certificado o llave real pesa pocos KB. */
export const TAMANO_MAXIMO_CREDENCIAL = 50_000;
/** Longitud mínima de la llave RSA. ARCA genera y exige 2048 bits. */
const BITS_MINIMOS = 2048;
const MAX_ITERACIONES = 1_000_000;
const MAX_ITERACIONES_TOTAL = 2_500_000;

const binario = (v: Uint8Array | string) => (typeof v === 'string' ? v : Buffer.from(v).toString('binary'));
const textoUtf8 = (v: Uint8Array | string) => (typeof v === 'string' ? v : Buffer.from(v).toString('utf8'));

function leerCertificado(raw: Uint8Array | string): forge.pki.Certificate {
    const txt = textoUtf8(raw);
    try {
        if (txt.includes('-----BEGIN CERTIFICATE-----')) return forge.pki.certificateFromPem(txt);
        return forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(binario(raw))));
    } catch {
        throw new RailDatosError('No se pudo leer el certificado. Sube el archivo .crt que descargaste de la autoridad fiscal.');
    }
}

function leerLlave(raw: Uint8Array | string, password: string): forge.pki.rsa.PrivateKey {
    const txt = textoUtf8(raw);
    if (!txt.includes('PRIVATE KEY-----')) {
        throw new RailDatosError('No se pudo leer la llave privada. Sube el archivo .key con el que generaste la solicitud del certificado.');
    }
    if (/BEGIN (EC|DSA) PRIVATE KEY/.test(txt)) {
        throw new RailDatosError('La llave privada debe ser RSA. Genera una nueva solicitud de certificado con una llave RSA de 2048 bits.');
    }
    const cifrada = /ENCRYPTED/.test(txt);
    if (cifrada && !password) throw new RailDatosError('La llave privada está protegida con contraseña. Escríbela para poder leerla.');
    let key: forge.pki.PrivateKey | null = null;
    try {
        key = cifrada ? forge.pki.decryptRsaPrivateKey(txt, password) : forge.pki.privateKeyFromPem(txt);
    } catch {
        key = null;
    }
    if (!key) {
        throw new RailDatosError(cifrada
            ? 'No se pudo abrir la llave privada. Verifica la contraseña.'
            : 'No se pudo leer la llave privada. Verifica que sea el archivo .key, sin modificar.');
    }
    return key as forge.pki.rsa.PrivateKey;
}

function bags(p12: forge.pkcs12.Pkcs12Pfx, bagType: string): forge.pkcs12.Bag[] {
    return p12.getBags({ bagType })[bagType] ?? [];
}

function leerPkcs12(bytes: Uint8Array, password: string): { cert: forge.pki.Certificate; key: forge.pki.rsa.PrivateKey } {
    const der = Buffer.from(bytes).toString('binary');
    let iteraciones: number[];
    try {
        iteraciones = iteracionesPkcs12(der);
    } catch (error) {
        throw new RailDatosError(error instanceof InvalidCertificateError ? error.message
            : 'No se pudo abrir el archivo. Verifica que sea un .p12/.pfx válido.');
    }
    const total = iteraciones.reduce((a, b) => a + b, 0);
    if (iteraciones.some((n) => n > MAX_ITERACIONES) || total > MAX_ITERACIONES_TOTAL) {
        throw new RailDatosError('El archivo usa una protección de contraseña fuera de lo habitual. Vuelve a exportarlo con las opciones por defecto.');
    }
    let p12: forge.pkcs12.Pkcs12Pfx;
    try {
        p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(der)), password);
    } catch {
        throw new RailDatosError('No se pudo abrir el archivo .p12/.pfx. Verifica que la contraseña sea correcta.');
    }
    const llaves = [...bags(p12, forge.pki.oids.pkcs8ShroudedKeyBag), ...bags(p12, forge.pki.oids.keyBag)].filter((b) => b.key);
    const certs = bags(p12, forge.pki.oids.certBag).filter((b) => b.cert);
    if (!llaves.length || !certs.length) {
        throw new RailDatosError('El archivo no contiene un certificado con su llave privada. Expórtalo incluyendo la llave privada.');
    }
    const key = llaves[0].key as forge.pki.rsa.PrivateKey;
    if (!key.n) throw new RailDatosError('La llave privada debe ser RSA.');
    // El certificado de firma es el de la llave, no el primero de la bolsa
    // (muchos .p12 traen la cadena de la autoridad certificante antes).
    const propio = certs.find((b) => (b.cert!.publicKey as forge.pki.rsa.PublicKey).n?.equals(key.n));
    if (!propio?.cert) throw new RailDatosError('El archivo no contiene el certificado que corresponde a su llave privada.');
    return { cert: propio.cert, key };
}

function atributo(attrs: Array<{ type?: string; shortName?: string; value?: unknown }>, oid: string): string | null {
    const a = attrs.find((x) => x.type === oid);
    return a && a.value !== undefined && a.value !== null ? String(a.value) : null;
}

/**
 * Lee, empareja y valida el par certificado + llave. Lanza `RailDatosError`
 * con un mensaje para el dueño del negocio (regla 14: nunca el error crudo de
 * forge). No decide a qué contribuyente pertenece: eso lo valida el riel con
 * `sujetoSerialNumber` (ARCA: "CUIT …").
 */
export function parsearCertificado(entrada: EntradaCertificado, ahora = new Date()): CertificadoParseado {
    let cert: forge.pki.Certificate;
    let key: forge.pki.rsa.PrivateKey;
    if (entrada.pkcs12) {
        if (entrada.pkcs12.length > TAMANO_MAXIMO_CREDENCIAL) throw new RailDatosError('El archivo parece demasiado grande para ser un certificado.');
        ({ cert, key } = leerPkcs12(entrada.pkcs12, String(entrada.pkcs12Password ?? '')));
    } else {
        if (!entrada.certificado || !entrada.llave) throw new RailDatosError('Sube el certificado (.crt) y su llave privada (.key).');
        if (entrada.certificado.length > TAMANO_MAXIMO_CREDENCIAL || entrada.llave.length > TAMANO_MAXIMO_CREDENCIAL) {
            throw new RailDatosError('El archivo parece demasiado grande para ser un certificado o una llave.');
        }
        cert = leerCertificado(entrada.certificado);
        key = leerLlave(entrada.llave, String(entrada.llavePassword ?? ''));
    }

    const pub = cert.publicKey as forge.pki.rsa.PublicKey;
    if (!pub?.n || !key.n || !pub.n.equals(key.n)) {
        throw new RailDatosError('La llave privada no corresponde a este certificado. Sube la llave con la que generaste la solicitud del certificado.');
    }
    if (key.n.bitLength() < BITS_MINIMOS) {
        throw new RailDatosError('La llave privada es demasiado corta. Genera una nueva de 2048 bits y vuelve a solicitar el certificado.');
    }
    const desde = cert.validity.notBefore;
    const caduca = cert.validity.notAfter;
    if (!(caduca instanceof Date) || Number.isNaN(caduca.getTime()) || !(desde instanceof Date) || Number.isNaN(desde.getTime())) {
        throw new RailDatosError('El certificado no declara una vigencia legible.');
    }
    if (caduca.getTime() <= ahora.getTime()) {
        throw new RailDatosError(`Este certificado venció el ${caduca.toISOString().slice(0, 10)}. Genera uno nuevo en la autoridad fiscal.`);
    }
    if (desde.getTime() > ahora.getTime() + 5 * 60_000) {
        throw new RailDatosError('Este certificado todavía no está vigente. Vuelve a intentarlo cuando empiece su vigencia.');
    }

    const certPem = forge.pki.certificateToPem(cert);
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    return {
        certPem,
        keyPem: forge.pki.privateKeyToPem(key),
        desde,
        caduca,
        sujetoCN: atributo(cert.subject.attributes as never, '2.5.4.3'),
        sujetoSerialNumber: atributo(cert.subject.attributes as never, '2.5.4.5'),
        emisorCN: atributo(cert.issuer.attributes as never, '2.5.4.3'),
        huellaSha256: createHash('sha256').update(Buffer.from(der, 'binary')).digest('hex'),
    };
}
