// Parseo del certificado electrónico (.p12/.pfx) que Verifactu exige para
// firmar el envío a la AEAT. Pure-JS a propósito: Vercel Fluid Compute no
// garantiza un binario `openssl` en el runtime, así que invocarlo por
// child_process sería un "funciona en mi máquina" — mismo riesgo que ya
// mordió a este repo con `pdftotext`/poppler. `node-forge` decodifica el
// PKCS#12 sin depender de nada del sistema operativo.

import forge from 'node-forge';

export interface ParsedCertificate {
    /** Fecha de caducidad del certificado de firma. */
    expiresAt: Date;
    /** Common Name del sujeto, si el certificado lo declara (para mostrar, no para decidir). */
    subjectCN: string | null;
}

export class InvalidCertificateError extends Error {}

/**
 * Valida que `p12Bytes` sea un PKCS#12 real y que `password` lo desbloquee, y
 * extrae la fecha de caducidad del certificado de firma (el que tiene llave
 * privada asociada, no un certificado intermedio de la cadena).
 *
 * Lanza `InvalidCertificateError` con un mensaje ya accionable para el
 * usuario (regla 14: nunca el error crudo de forge) ante cualquier archivo
 * corrupto, contraseña incorrecta, o paquete sin certificado de firma.
 */
export function parsePkcs12(p12Bytes: Uint8Array, password: string): ParsedCertificate {
    let p12: forge.pkcs12.Pkcs12Pfx;
    try {
        const der = forge.util.createBuffer(Buffer.from(p12Bytes).toString('binary'));
        const asn1 = forge.asn1.fromDer(der);
        p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);
    } catch {
        throw new InvalidCertificateError(
            'No se pudo abrir el certificado. Verifica que sea un archivo .p12/.pfx válido y que la contraseña sea correcta.',
        );
    }

    // El certificado de FIRMA es el que aparece en la misma bolsa que una
    // llave privada — un .p12 puede traer certificados intermedios de la
    // cadena que no tienen llave y no son el que se usa para firmar.
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
    if (!keyBags.length || !certBags.length) {
        throw new InvalidCertificateError(
            'El archivo no contiene un certificado con su llave privada. Exporta el .p12 desde donde lo emitió tu autoridad de certificación incluyendo la llave privada.',
        );
    }

    const cert = certBags[0]?.cert;
    if (!cert) {
        throw new InvalidCertificateError('El certificado no se pudo leer.');
    }
    const expiresAt = cert.validity.notAfter;
    if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
        throw new InvalidCertificateError('El certificado no declara una fecha de caducidad legible.');
    }
    const cn = cert.subject.getField('CN');
    return { expiresAt, subjectCN: cn ? String(cn.value) : null };
}
